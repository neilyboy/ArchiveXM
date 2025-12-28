"""
Live Recorder Service - Record live streams with track splitting

This handles "tape recorder" style recording where the user can
start/stop recording and get properly split tracks with metadata.
"""
import asyncio
import os
import tempfile
import shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Callable
import subprocess

from services.sxm_api import SiriusXMAPI
from services.hls_service import HLSService
from services.download_service import DownloadService


class LiveRecorder:
    """
    Live stream recorder with real-time track splitting
    
    Features:
    - Start/stop recording like a tape recorder
    - Real-time track detection from API
    - Automatic splitting at track boundaries
    - Metadata embedding and cover art
    """
    
    def __init__(self, bearer_token: str):
        self.bearer_token = bearer_token
        self.api = SiriusXMAPI(bearer_token)
        self.hls_service = HLSService(bearer_token)
        self.download_service = DownloadService(bearer_token)
        
        self.is_recording = False
        self.recording_task = None
        self.current_channel = None
        self.output_dir = None
        self.tracks_recorded = []
        self.start_time = None
    
    async def start_recording(
        self,
        channel_id: str,
        output_dir: Path,
        on_track_change: Optional[Callable] = None,
        on_progress: Optional[Callable] = None
    ) -> Dict:
        """
        Start recording a channel
        
        Args:
            channel_id: Channel to record
            output_dir: Directory to save tracks
            on_track_change: Callback when new track starts
            on_progress: Callback for progress updates
            
        Returns:
            Dict with recording session info
        """
        if self.is_recording:
            return {
                'success': False,
                'error': 'Already recording'
            }
        
        try:
            self.current_channel = channel_id
            self.output_dir = Path(output_dir)
            self.output_dir.mkdir(parents=True, exist_ok=True)
            self.is_recording = True
            self.tracks_recorded = []
            self.start_time = datetime.now(timezone.utc)
            
            # Start recording task
            self.recording_task = asyncio.create_task(
                self._recording_loop(channel_id, on_track_change, on_progress)
            )
            
            return {
                'success': True,
                'message': 'Recording started',
                'channel_id': channel_id,
                'start_time': self.start_time.isoformat()
            }
            
        except Exception as e:
            self.is_recording = False
            return {
                'success': False,
                'error': str(e)
            }
    
    async def stop_recording(self, wait_for_track_end: bool = False) -> Dict:
        """
        Stop recording
        
        Args:
            wait_for_track_end: If True, wait for current track to finish (default False for faster stop)
            
        Returns:
            Dict with recording results
        """
        if not self.is_recording:
            return {
                'success': False,
                'error': 'Not recording'
            }
        
        print("🛑 Stopping recording...")
        
        try:
            # Set flag first to stop the loop
            self.is_recording = False
            
            if wait_for_track_end:
                try:
                    # Get current track and wait for it to finish (with timeout)
                    current = await asyncio.wait_for(
                        self.api.get_current_track(self.current_channel),
                        timeout=10
                    )
                    
                    if current:
                        track_start = datetime.fromisoformat(
                            current['timestamp_utc'].replace('Z', '+00:00')
                        )
                        track_end = track_start + timedelta(
                            milliseconds=current.get('duration_ms', 0)
                        )
                        now = datetime.now(timezone.utc)
                        
                        if track_end > now:
                            wait_seconds = (track_end - now).total_seconds()
                            if wait_seconds > 0 and wait_seconds < 300:  # Max 5 min wait
                                print(f"⏳ Waiting {wait_seconds:.0f}s for track to finish...")
                                await asyncio.sleep(wait_seconds + 2)
                except asyncio.TimeoutError:
                    print("⚠️ Timeout getting current track, stopping immediately")
                except Exception as e:
                    print(f"⚠️ Error waiting for track: {e}, stopping immediately")
            
            # Cancel the recording task with timeout
            if self.recording_task:
                self.recording_task.cancel()
                try:
                    await asyncio.wait_for(self.recording_task, timeout=5)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass
                except Exception as e:
                    print(f"⚠️ Error cancelling recording task: {e}")
            
            duration = 0
            if self.start_time:
                duration = (datetime.now(timezone.utc) - self.start_time).total_seconds()
            
            print(f"✅ Recording stopped. Duration: {duration:.0f}s, Tracks: {len(self.tracks_recorded)}")
            
            return {
                'success': True,
                'message': 'Recording stopped',
                'duration_seconds': duration,
                'tracks_recorded': len(self.tracks_recorded),
                'tracks': self.tracks_recorded
            }
            
        except Exception as e:
            # Force cleanup on error
            self.is_recording = False
            if self.recording_task:
                self.recording_task.cancel()
            print(f"❌ Stop error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _recording_loop(
        self,
        channel_id: str,
        on_track_change: Optional[Callable],
        on_progress: Optional[Callable]
    ):
        """Main recording loop - records from LIVE EDGE only"""
        last_track_id = None
        last_track = None
        segment_buffer = []
        seen_segment_urls = set()  # Track which segments we've already seen
        
        # CRITICAL: Only record segments from NOW onwards (live edge)
        recording_start = datetime.now(timezone.utc)
        print(f"🎬 Recording started at {recording_start.isoformat()}")
        
        try:
            # Get initial playlist
            playlist_data = await self.hls_service.get_variant_playlist(channel_id)
            
            if 'error' in playlist_data:
                raise Exception(playlist_data['error'])
            
            key_url = playlist_data.get('key_url')
            key_bytes = None
            
            if key_url:
                key_bytes = await self.hls_service.get_decryption_key(key_url)
            
            # Mark all existing segments as "seen" so we don't record old content
            if 'segments' in playlist_data:
                for seg in playlist_data['segments']:
                    seen_segment_urls.add(seg.get('url'))
                print(f"📝 Marked {len(seen_segment_urls)} existing segments as seen (won't record)")
            
            while self.is_recording:
                try:
                    # Get current track from API
                    tracks = await self.api.get_schedule(channel_id, hours_back=1)
                    current_track = tracks[-1] if tracks else None
                    
                    # Compare tracks by timestamp (unique identifier)
                    current_track_id = current_track.get('timestamp_utc') if current_track else None
                    
                    if current_track and current_track_id != last_track_id:
                        # Track changed
                        print(f"🎵 Track change: {current_track.get('artist')} - {current_track.get('title')}")
                        
                        if last_track and segment_buffer:
                            # Save previous track
                            await self._save_track(
                                last_track,
                                segment_buffer,
                                key_bytes
                            )
                            segment_buffer = []
                        
                        last_track = current_track
                        last_track_id = current_track_id
                        
                        if on_track_change:
                            try:
                                on_track_change(current_track)
                            except Exception as e:
                                print(f"Track change callback error: {e}")
                    
                    # Refresh playlist and get NEW segments only
                    playlist_data = await self.hls_service.get_variant_playlist(channel_id)
                    
                    if 'segments' in playlist_data:
                        new_count = 0
                        for seg in playlist_data['segments']:
                            seg_url = seg.get('url')
                            if seg_url and seg_url not in seen_segment_urls:
                                # This is a NEW segment we haven't seen before
                                seen_segment_urls.add(seg_url)
                                segment_buffer.append(seg)
                                new_count += 1
                        
                        if new_count > 0:
                            print(f"   📥 Added {new_count} new segments (buffer: {len(segment_buffer)})")
                    
                    if on_progress:
                        elapsed = (datetime.now(timezone.utc) - self.start_time).total_seconds()
                        on_progress({
                            'elapsed_seconds': elapsed,
                            'current_track': current_track,
                            'segments_buffered': len(segment_buffer),
                            'tracks_recorded': len(self.tracks_recorded)
                        })
                    
                    # Wait before next check (HLS segments are ~10s)
                    await asyncio.sleep(5)
                    
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    print(f"Recording loop error: {e}")
                    await asyncio.sleep(5)
            
            # Save final track if any segments buffered
            if last_track and segment_buffer:
                await self._save_track(last_track, segment_buffer, key_bytes)
                
        except Exception as e:
            print(f"Recording loop fatal error: {e}")
    
    async def _save_track(
        self,
        track: Dict,
        segments: List[Dict],
        key_bytes: Optional[bytes]
    ):
        """Save a recorded track"""
        try:
            safe_artist = self._sanitize_filename(track.get('artist', 'Unknown'))
            safe_title = self._sanitize_filename(track.get('title', 'Unknown'))
            
            output_file = self.output_dir / f"{safe_artist} - {safe_title}.m4a"
            
            # Download and decrypt segments
            temp_dir = Path(tempfile.mkdtemp())
            
            try:
                decrypted_files = await self.download_service._download_segments(
                    segments,
                    key_bytes,
                    temp_dir
                )
                
                if decrypted_files:
                    await self.download_service._concatenate_segments(
                        decrypted_files,
                        output_file
                    )
                    
                    await self.download_service._add_metadata(
                        output_file,
                        track,
                        track.get('image_url')
                    )
                    
                    self.tracks_recorded.append({
                        'artist': track.get('artist'),
                        'title': track.get('title'),
                        'file_path': str(output_file),
                        'timestamp': datetime.now(timezone.utc).isoformat()
                    })
                    
                    print(f"   ✅ Saved: {output_file.name}")
                    
            finally:
                if temp_dir.exists():
                    shutil.rmtree(temp_dir)
                    
        except Exception as e:
            print(f"   ❌ Error saving track: {e}")
    
    def _sanitize_filename(self, name: str) -> str:
        """Sanitize string for use as filename"""
        invalid_chars = '<>:"/\\|?*'
        result = name
        for char in invalid_chars:
            result = result.replace(char, '_')
        return result[:100].strip()
    
    def get_status(self) -> Dict:
        """Get current recording status"""
        if not self.is_recording:
            return {
                'recording': False
            }
        
        elapsed = (datetime.now(timezone.utc) - self.start_time).total_seconds()
        
        return {
            'recording': True,
            'channel_id': self.current_channel,
            'start_time': self.start_time.isoformat(),
            'elapsed_seconds': elapsed,
            'tracks_recorded': len(self.tracks_recorded)
        }
