"""
Download Service - Download and process tracks from DVR buffer
"""
import asyncio
import subprocess
import os
import tempfile
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
import httpx
import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from services.hls_service import HLSService
from services.sxm_api import SiriusXMAPI


class DownloadService:
    """Handle track downloads from DVR buffer"""
    
    def __init__(self, bearer_token: str):
        self.bearer_token = bearer_token
        self.hls_service = HLSService(bearer_token)
        self.api = SiriusXMAPI(bearer_token)
    
    async def download_track(
        self,
        download_id: int,
        channel_id: str,
        track: Dict,
        download_path: str,
        next_track_timestamp: str = None
    ) -> bool:
        """
        Download a single track from DVR buffer
        
        Steps:
        1. Get HLS playlist with all segments
        2. Filter segments for track time window
        3. Download and decrypt segments
        4. Concatenate into single file
        5. Add metadata and cover art
        
        Args:
            next_track_timestamp: If provided, use this to calculate exact duration
        """
        from database import SessionLocal, Download
        
        db = SessionLocal()
        download_record = db.query(Download).filter(Download.id == download_id).first()
        
        try:
            print(f"📥 Starting download: {track['artist']} - {track['title']}")
            
            # Update status
            download_record.status = "downloading"
            db.commit()
            
            # If no next_track_timestamp provided, try to get it from schedule
            if not next_track_timestamp:
                next_track_timestamp = await self._get_next_track_timestamp(
                    channel_id, track["timestamp_utc"]
                )
            
            # Calculate actual duration from next track if available
            if next_track_timestamp:
                try:
                    track_start = datetime.fromisoformat(track["timestamp_utc"].replace('Z', '+00:00'))
                    next_start = datetime.fromisoformat(next_track_timestamp.replace('Z', '+00:00'))
                    actual_duration_ms = int((next_start - track_start).total_seconds() * 1000)
                    print(f"   Duration from next track: {actual_duration_ms/1000:.1f}s (API said {track['duration_ms']/1000:.1f}s)")
                    track["duration_ms"] = actual_duration_ms
                except Exception as e:
                    print(f"   Could not calculate duration from next track: {e}")
            
            # Get variant playlist
            playlist_data = await self.hls_service.get_variant_playlist(channel_id)
            
            if "error" in playlist_data:
                raise Exception(playlist_data["error"])
            
            segments = playlist_data.get("segments", [])
            key_url = playlist_data.get("key_url")
            
            if not segments:
                raise Exception("No segments found in playlist")
            
            # Filter segments for this track
            track_segments = self.hls_service.filter_segments_for_track(
                segments,
                track["timestamp_utc"],
                track["duration_ms"]
            )
            
            # If no segments found by timestamp, try using duration-based estimation
            if not track_segments and segments:
                print(f"   ⚠️ No segments by timestamp, using duration estimation")
                duration_sec = track["duration_ms"] / 1000
                num_segments = max(1, int(duration_sec / 9.75) + 2)  # ~9.75s per segment
                # Get latest segments as fallback
                track_segments = segments[-min(num_segments, len(segments)):]
            
            if not track_segments:
                raise Exception("No segments found for track time window")
            
            print(f"   Found {len(track_segments)} segments for track")
            
            # Log segment details for debugging exact timing
            if track_segments:
                print(f"   Segments timeline:")
                for i, seg in enumerate(track_segments[:3]):  # Show first 3
                    print(f"     [{i}] {seg.get('timestamp', 'no ts')} dur={seg.get('duration', 0):.2f}s")
                if len(track_segments) > 3:
                    print(f"     ... and {len(track_segments) - 3} more")
            
            # Get decryption key
            key_bytes = None
            if key_url:
                key_bytes = await self.hls_service.get_decryption_key(key_url)
            
            if not key_bytes:
                raise Exception("Could not get decryption key")
            
            # Create output directory: /downloads/STATION/DATE/
            from database import SessionLocal, Channel
            db_temp = SessionLocal()
            channel_record = db_temp.query(Channel).filter(Channel.channel_id == channel_id).first()
            station_name = self._sanitize_filename(channel_record.name if channel_record else "Unknown")
            db_temp.close()
            
            # Parse date from track timestamp
            try:
                track_date = datetime.fromisoformat(track["timestamp_utc"].replace('Z', '+00:00'))
                date_folder = track_date.strftime("%Y-%m-%d")
            except:
                date_folder = datetime.now().strftime("%Y-%m-%d")
            
            safe_artist = self._sanitize_filename(track["artist"])
            safe_title = self._sanitize_filename(track["title"])
            
            output_dir = Path(download_path) / station_name / date_folder
            output_dir.mkdir(parents=True, exist_ok=True)
            
            output_file = output_dir / f"{safe_artist} - {safe_title}.m4a"
            
            # Calculate precise trim points based on segment timestamps
            start_offset_sec = 0.0
            duration_sec = track["duration_ms"] / 1000.0
            
            # Calculate start offset: how far into the concatenated audio does the track start?
            if track_segments and track_segments[0].get("timestamp"):
                try:
                    first_seg_time = datetime.fromisoformat(
                        track_segments[0]["timestamp"].replace('Z', '+00:00')
                    )
                    track_start_time = datetime.fromisoformat(
                        track["timestamp_utc"].replace('Z', '+00:00')
                    )
                    
                    # Calculate offset from first segment to track start
                    # This is how many seconds into the downloaded audio the track begins
                    if track_start_time > first_seg_time:
                        start_offset_sec = (track_start_time - first_seg_time).total_seconds()
                    
                    # Debug info
                    print(f"   First segment: {first_seg_time.strftime('%H:%M:%S.%f')}")
                    print(f"   Track start:   {track_start_time.strftime('%H:%M:%S.%f')}")
                    print(f"   Trim: skip {start_offset_sec:.3f}s, keep {duration_sec:.3f}s (exact)")
                except Exception as e:
                    print(f"   Warning: Could not calculate precise offset: {e}")
            else:
                print(f"   Warning: No segment timestamps, using full duration without offset")
            
            # Download and decrypt segments
            temp_dir = Path(tempfile.mkdtemp())
            
            try:
                decrypted_files = await self._download_segments(
                    track_segments,
                    key_bytes,
                    temp_dir
                )
                
                if not decrypted_files:
                    raise Exception("No segments downloaded")
                
                # Concatenate segments with precise trimming
                await self._concatenate_segments(
                    decrypted_files, 
                    output_file,
                    start_offset_sec=start_offset_sec,
                    duration_sec=duration_sec
                )
                
                # Add metadata
                await self._add_metadata(
                    output_file,
                    track,
                    track.get("image_url")
                )
                
                # Update download record
                file_size = output_file.stat().st_size if output_file.exists() else 0
                download_record.file_path = str(output_file)
                download_record.file_size = file_size
                download_record.status = "completed"
                db.commit()
                
                print(f"   ✅ Downloaded: {output_file}")
                return True
                
            finally:
                # Cleanup temp directory
                if temp_dir.exists():
                    shutil.rmtree(temp_dir)
            
        except Exception as e:
            print(f"   ❌ Download error: {e}")
            download_record.status = f"failed: {str(e)[:100]}"
            db.commit()
            return False
        finally:
            db.close()
    
    async def download_bulk(
        self,
        download_ids: List[int],
        channel_id: str,
        tracks: List[Dict],
        download_path: str
    ) -> Dict:
        """
        Download multiple tracks efficiently
        
        Bulk download is more efficient - we get the playlist once
        and download segments for all tracks
        """
        from database import SessionLocal, Download
        
        db = SessionLocal()
        
        try:
            print(f"📥 Starting bulk download: {len(tracks)} tracks")
            
            # Get variant playlist once
            playlist_data = await self.hls_service.get_variant_playlist(channel_id)
            
            if "error" in playlist_data:
                raise Exception(playlist_data["error"])
            
            segments = playlist_data.get("segments", [])
            key_url = playlist_data.get("key_url")
            
            # Get decryption key once
            key_bytes = None
            if key_url:
                key_bytes = await self.hls_service.get_decryption_key(key_url)
            
            if not key_bytes:
                raise Exception("Could not get decryption key")
            
            successful = 0
            failed = 0
            
            # Sort tracks by timestamp for accurate next-track duration calculation
            sorted_tracks = sorted(
                list(zip(download_ids, tracks)), 
                key=lambda x: x[1].get("timestamp_utc", "")
            )
            
            # Download each track
            for i, (download_id, track) in enumerate(sorted_tracks):
                try:
                    download_record = db.query(Download).filter(Download.id == download_id).first()
                    
                    print(f"   [{i+1}/{len(tracks)}] {track['artist']} - {track['title']}")
                    
                    download_record.status = "downloading"
                    db.commit()
                    
                    # Calculate duration from NEXT track's timestamp (more accurate than API duration)
                    actual_duration_ms = track["duration_ms"]
                    if i + 1 < len(sorted_tracks):
                        try:
                            current_start = datetime.fromisoformat(track["timestamp_utc"].replace('Z', '+00:00'))
                            next_start = datetime.fromisoformat(sorted_tracks[i + 1][1]["timestamp_utc"].replace('Z', '+00:00'))
                            actual_duration_ms = int((next_start - current_start).total_seconds() * 1000)
                            print(f"      Duration from next track: {actual_duration_ms/1000:.1f}s (API: {track['duration_ms']/1000:.1f}s)")
                        except:
                            pass
                    
                    # Filter segments for this track using actual duration
                    track_segments = self.hls_service.filter_segments_for_track(
                        segments,
                        track["timestamp_utc"],
                        actual_duration_ms
                    )
                    
                    if not track_segments:
                        download_record.status = "failed: no segments"
                        db.commit()
                        failed += 1
                        continue
                    
                    # Create output path: /downloads/STATION/DATE/
                    from database import Channel
                    channel_record = db.query(Channel).filter(Channel.channel_id == channel_id).first()
                    station_name = self._sanitize_filename(channel_record.name if channel_record else "Unknown")
                    
                    try:
                        track_date = datetime.fromisoformat(track["timestamp_utc"].replace('Z', '+00:00'))
                        date_folder = track_date.strftime("%Y-%m-%d")
                    except:
                        date_folder = datetime.now().strftime("%Y-%m-%d")
                    
                    safe_artist = self._sanitize_filename(track["artist"])
                    safe_title = self._sanitize_filename(track["title"])
                    
                    output_dir = Path(download_path) / station_name / date_folder
                    output_dir.mkdir(parents=True, exist_ok=True)
                    
                    output_file = output_dir / f"{safe_artist} - {safe_title}.m4a"
                    
                    # Calculate precise trim points
                    start_offset_sec = 0.0
                    duration_sec = actual_duration_ms / 1000.0
                    
                    if track_segments and track_segments[0].get("timestamp"):
                        try:
                            first_seg_time = datetime.fromisoformat(
                                track_segments[0]["timestamp"].replace('Z', '+00:00')
                            )
                            track_start_time = datetime.fromisoformat(
                                track["timestamp_utc"].replace('Z', '+00:00')
                            )
                            if track_start_time > first_seg_time:
                                start_offset_sec = (track_start_time - first_seg_time).total_seconds()
                        except:
                            pass
                    
                    # Download segments
                    temp_dir = Path(tempfile.mkdtemp())
                    
                    try:
                        decrypted_files = await self._download_segments(
                            track_segments,
                            key_bytes,
                            temp_dir
                        )
                        
                        if decrypted_files:
                            await self._concatenate_segments(
                                decrypted_files, 
                                output_file,
                                start_offset_sec=start_offset_sec,
                                duration_sec=duration_sec
                            )
                            await self._add_metadata(output_file, track, track.get("image_url"))
                            
                            download_record.file_path = str(output_file)
                            download_record.file_size = output_file.stat().st_size
                            download_record.status = "completed"
                            successful += 1
                        else:
                            download_record.status = "failed: download error"
                            failed += 1
                        
                        db.commit()
                        
                    finally:
                        if temp_dir.exists():
                            shutil.rmtree(temp_dir)
                    
                except Exception as e:
                    print(f"   ❌ Error: {e}")
                    failed += 1
                    continue
            
            print(f"✅ Bulk download complete: {successful} successful, {failed} failed")
            
            return {
                "success": True,
                "successful": successful,
                "failed": failed,
                "total": len(tracks)
            }
            
        except Exception as e:
            print(f"❌ Bulk download error: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()
    
    async def _download_segments(
        self,
        segments: List[Dict],
        key_bytes: bytes,
        temp_dir: Path
    ) -> List[Path]:
        """Download and decrypt HLS segments"""
        decrypted_files = []
        
        async with httpx.AsyncClient() as client:
            for i, segment in enumerate(segments):
                try:
                    # Download encrypted segment
                    response = await client.get(segment["url"], timeout=30)
                    
                    if response.status_code != 200:
                        continue
                    
                    encrypted_data = response.content
                    
                    # Decrypt (AES-128-CBC)
                    # IV is typically the segment sequence number (16 bytes, zero-padded)
                    iv = bytes([0] * 16)  # Default IV
                    
                    # Try to extract IV from segment URL or use sequence number
                    try:
                        # Use segment index as IV
                        iv = i.to_bytes(16, byteorder='big')
                    except:
                        pass
                    
                    decrypted_data = self._decrypt_segment(encrypted_data, key_bytes, iv)
                    
                    if decrypted_data:
                        dec_file = temp_dir / f"seg_{i:04d}.aac"
                        dec_file.write_bytes(decrypted_data)
                        decrypted_files.append(dec_file)
                        
                except Exception as e:
                    print(f"   Segment {i} error: {e}")
                    continue
        
        return sorted(decrypted_files)
    
    def _decrypt_segment(self, data: bytes, key: bytes, iv: bytes) -> Optional[bytes]:
        """Decrypt AES-128-CBC encrypted segment"""
        try:
            cipher = Cipher(
                algorithms.AES(key),
                modes.CBC(iv),
                backend=default_backend()
            )
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(data) + decryptor.finalize()
            
            # Remove PKCS7 padding
            padding_length = decrypted[-1]
            if padding_length <= 16:
                decrypted = decrypted[:-padding_length]
            
            return decrypted
            
        except Exception as e:
            print(f"Decryption error: {e}")
            return None
    
    async def _get_next_track_timestamp(self, channel_id: str, current_track_timestamp: str) -> Optional[str]:
        """
        Get the timestamp of the track that follows the current track.
        This is used to calculate accurate duration (next_start - current_start).
        """
        try:
            # Get schedule from API
            schedule = await self.api.get_schedule(channel_id, hours_back=5)
            
            if not schedule or "tracks" not in schedule:
                return None
            
            tracks = schedule.get("tracks", [])
            if not tracks:
                return None
            
            # Parse current track timestamp
            current_time = datetime.fromisoformat(current_track_timestamp.replace('Z', '+00:00'))
            
            # Sort tracks by timestamp
            sorted_tracks = sorted(tracks, key=lambda t: t.get("timestamp_utc", ""))
            
            # Find the track that starts right after the current one
            for i, track in enumerate(sorted_tracks):
                track_time = datetime.fromisoformat(track["timestamp_utc"].replace('Z', '+00:00'))
                
                # If this track starts at or very close to current track time, return next track's time
                if abs((track_time - current_time).total_seconds()) < 2:  # Within 2 seconds
                    if i + 1 < len(sorted_tracks):
                        return sorted_tracks[i + 1]["timestamp_utc"]
            
            return None
            
        except Exception as e:
            print(f"   Could not get next track timestamp: {e}")
            return None
    
    async def _concatenate_segments(
        self, 
        segment_files: List[Path], 
        output_file: Path,
        start_offset_sec: float = 0.0,
        duration_sec: float = None
    ):
        """
        Concatenate decrypted segments and trim to exact timestamps
        
        Args:
            segment_files: List of decrypted segment files
            output_file: Final output path
            start_offset_sec: Seconds to skip from start of first segment
            duration_sec: Exact duration to keep (for precise trimming)
        """
        try:
            # Simple concatenation for AAC
            concat_file = output_file.with_suffix('.concat.aac')
            with open(concat_file, 'wb') as outfile:
                for seg_file in segment_files:
                    outfile.write(seg_file.read_bytes())
            
            # Build ffmpeg command with precise trimming
            # Use output seeking (-ss after -i) for frame-accurate cuts
            ffmpeg_cmd = ['ffmpeg', '-y', '-i', str(concat_file)]
            
            # Add start offset if needed (trim beginning) - output seeking for accuracy
            if start_offset_sec > 0.1:  # Only trim if offset is significant
                ffmpeg_cmd.extend(['-ss', f'{start_offset_sec:.3f}'])
            
            # Add duration limit if specified (trim end)
            if duration_sec and duration_sec > 0:
                ffmpeg_cmd.extend(['-t', f'{duration_sec:.3f}'])
            
            # Output options - re-encode for precise cuts at frame boundaries
            ffmpeg_cmd.extend([
                '-c:a', 'aac',
                '-b:a', '256k',
                '-movflags', '+faststart',
                str(output_file)
            ])
            
            print(f"   FFmpeg: {' '.join(ffmpeg_cmd[-6:])}")
            
            result = subprocess.run(ffmpeg_cmd, capture_output=True)
            
            # Cleanup concat file
            if concat_file.exists():
                concat_file.unlink()
            
            if result.returncode != 0:
                print(f"FFmpeg error: {result.stderr.decode()[:200]}")
                # Fallback: just copy without trimming
                if concat_file.exists():
                    shutil.copy(concat_file, output_file)
                
        except Exception as e:
            print(f"Concatenation error: {e}")
    
    async def _add_metadata(
        self,
        file_path: Path,
        track: Dict,
        cover_url: Optional[str] = None
    ):
        """Add ID3 metadata and cover art"""
        try:
            from mutagen.mp4 import MP4, MP4Cover
            
            audio = MP4(str(file_path))
            
            # Add tags
            audio['\xa9nam'] = track.get('title', 'Unknown')  # Title
            audio['\xa9ART'] = track.get('artist', 'Unknown')  # Artist
            
            if track.get('album'):
                audio['\xa9alb'] = track['album']  # Album
            
            # Download and add cover art
            if cover_url:
                print(f"   Cover URL: {cover_url[:80]}...")
                try:
                    async with httpx.AsyncClient() as client:
                        response = await client.get(cover_url, timeout=10)
                        if response.status_code == 200:
                            cover_data = response.content
                            print(f"   Cover downloaded: {len(cover_data)} bytes")
                            
                            # Determine format
                            if cover_url.lower().endswith('.png'):
                                cover_format = MP4Cover.FORMAT_PNG
                            else:
                                cover_format = MP4Cover.FORMAT_JPEG
                            
                            audio['covr'] = [MP4Cover(cover_data, imageformat=cover_format)]
                        else:
                            print(f"   Cover download failed: HTTP {response.status_code}")
                except Exception as e:
                    print(f"   Cover art error: {e}")
            else:
                print(f"   No cover URL provided for track")
            
            audio.save()
            
        except Exception as e:
            print(f"Metadata error: {e}")
    
    def _sanitize_filename(self, name: str) -> str:
        """Sanitize string for use as filename"""
        # Remove/replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        result = name
        
        for char in invalid_chars:
            result = result.replace(char, '_')
        
        # Limit length
        return result[:100].strip()
