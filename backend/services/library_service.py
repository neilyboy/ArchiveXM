"""
Library Service - Scan and manage local audio files
"""
import os
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
import mutagen
from mutagen.easyid3 import EasyID3
from mutagen.mp4 import MP4
from mutagen.flac import FLAC
from mutagen.id3 import ID3

from database import LocalTrack


class LibraryService:
    """Service for managing local audio library"""
    
    SUPPORTED_FORMATS = {'.mp3', '.m4a', '.aac', '.flac', '.ogg', '.wav', '.wma'}
    
    def __init__(self, db):
        self.db = db
        self.download_path = os.getenv("DOWNLOAD_PATH", "/downloads")
    
    async def scan_library(self) -> Dict:
        """
        Scan the downloads directory for audio files
        Returns scan statistics
        """
        download_path = Path(self.download_path)
        
        if not download_path.exists():
            return {
                "success": False,
                "error": f"Download path does not exist: {self.download_path}"
            }
        
        print(f"🎵 Scanning library at: {download_path}")
        
        # Get existing tracks
        existing_paths = {t.file_path for t in self.db.query(LocalTrack).all()}
        
        new_tracks = 0
        updated_tracks = 0
        removed_tracks = 0
        errors = 0
        
        # Find all audio files
        found_paths = set()
        
        for root, dirs, files in os.walk(download_path):
            for filename in files:
                file_path = Path(root) / filename
                
                if file_path.suffix.lower() not in self.SUPPORTED_FORMATS:
                    continue
                
                found_paths.add(str(file_path))
                
                try:
                    if str(file_path) in existing_paths:
                        # Track exists, check if needs update
                        updated_tracks += 1
                    else:
                        # New track
                        track_data = self._extract_metadata(file_path)
                        if track_data:
                            track = LocalTrack(**track_data)
                            self.db.add(track)
                            new_tracks += 1
                            
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")
                    errors += 1
        
        # Remove tracks that no longer exist on disk
        for existing_path in existing_paths:
            if existing_path not in found_paths:
                track = self.db.query(LocalTrack).filter(
                    LocalTrack.file_path == existing_path
                ).first()
                if track:
                    self.db.delete(track)
                    removed_tracks += 1
        
        self.db.commit()
        
        total_tracks = self.db.query(LocalTrack).count()
        
        print(f"✅ Scan complete: {new_tracks} new, {removed_tracks} removed, {total_tracks} total")
        
        return {
            "success": True,
            "new_tracks": new_tracks,
            "updated_tracks": updated_tracks,
            "removed_tracks": removed_tracks,
            "total_tracks": total_tracks,
            "errors": errors
        }
    
    def _extract_metadata(self, file_path: Path) -> Optional[Dict]:
        """
        Extract metadata from an audio file using mutagen
        """
        try:
            stat = file_path.stat()
            file_size = stat.st_size
            
            # Base data
            data = {
                "file_path": str(file_path),
                "filename": file_path.name,
                "file_size": file_size,
                "format": file_path.suffix.lower().lstrip('.'),
                "artist": None,
                "title": None,
                "album": None,
                "genre": None,
                "duration_seconds": None,
                "bitrate": None,
                "sample_rate": None,
                "cover_art_path": None
            }
            
            # Try to get audio info
            audio = mutagen.File(str(file_path))
            
            if audio is None:
                # Fallback: try to parse filename
                data = self._parse_filename(file_path, data)
                return data
            
            # Get duration
            if hasattr(audio, 'info') and hasattr(audio.info, 'length'):
                data["duration_seconds"] = audio.info.length
            
            # Get bitrate
            if hasattr(audio, 'info') and hasattr(audio.info, 'bitrate'):
                data["bitrate"] = audio.info.bitrate
            
            # Get sample rate
            if hasattr(audio, 'info') and hasattr(audio.info, 'sample_rate'):
                data["sample_rate"] = audio.info.sample_rate
            
            # Extract tags based on format
            if isinstance(audio, MP4):
                data = self._extract_mp4_tags(audio, data)
            elif file_path.suffix.lower() == '.mp3':
                data = self._extract_mp3_tags(file_path, data)
            elif isinstance(audio, FLAC):
                data = self._extract_flac_tags(audio, data)
            else:
                # Generic extraction
                data = self._extract_generic_tags(audio, data)
            
            # Fallback to filename parsing if no title
            if not data["title"]:
                data = self._parse_filename(file_path, data)
            
            return data
            
        except Exception as e:
            print(f"Error extracting metadata from {file_path}: {e}")
            # Return basic data
            return {
                "file_path": str(file_path),
                "filename": file_path.name,
                "file_size": file_path.stat().st_size if file_path.exists() else 0,
                "format": file_path.suffix.lower().lstrip('.'),
                "artist": None,
                "title": file_path.stem,
                "album": None,
                "genre": None,
                "duration_seconds": None,
                "bitrate": None,
                "sample_rate": None,
                "cover_art_path": None
            }
    
    def _extract_mp4_tags(self, audio: MP4, data: Dict) -> Dict:
        """Extract tags from M4A/MP4 files"""
        tag_mapping = {
            '\xa9nam': 'title',
            '\xa9ART': 'artist',
            '\xa9alb': 'album',
            '\xa9gen': 'genre'
        }
        
        for mp4_key, data_key in tag_mapping.items():
            if mp4_key in audio.tags:
                value = audio.tags[mp4_key]
                if isinstance(value, list) and value:
                    data[data_key] = str(value[0])
        
        return data
    
    def _extract_mp3_tags(self, file_path: Path, data: Dict) -> Dict:
        """Extract tags from MP3 files"""
        try:
            audio = EasyID3(str(file_path))
            
            tag_mapping = {
                'title': 'title',
                'artist': 'artist',
                'album': 'album',
                'genre': 'genre'
            }
            
            for id3_key, data_key in tag_mapping.items():
                if id3_key in audio:
                    value = audio[id3_key]
                    if isinstance(value, list) and value:
                        data[data_key] = str(value[0])
                        
        except Exception:
            pass
        
        return data
    
    def _extract_flac_tags(self, audio: FLAC, data: Dict) -> Dict:
        """Extract tags from FLAC files"""
        tag_mapping = {
            'title': 'title',
            'artist': 'artist',
            'album': 'album',
            'genre': 'genre'
        }
        
        for flac_key, data_key in tag_mapping.items():
            if flac_key in audio:
                value = audio[flac_key]
                if isinstance(value, list) and value:
                    data[data_key] = str(value[0])
        
        return data
    
    def _extract_generic_tags(self, audio, data: Dict) -> Dict:
        """Generic tag extraction"""
        if hasattr(audio, 'tags') and audio.tags:
            tags = audio.tags
            
            # Try common tag names
            for key in ['title', 'TITLE', 'TIT2']:
                if key in tags:
                    data['title'] = str(tags[key])
                    break
            
            for key in ['artist', 'ARTIST', 'TPE1']:
                if key in tags:
                    data['artist'] = str(tags[key])
                    break
            
            for key in ['album', 'ALBUM', 'TALB']:
                if key in tags:
                    data['album'] = str(tags[key])
                    break
            
            for key in ['genre', 'GENRE', 'TCON']:
                if key in tags:
                    data['genre'] = str(tags[key])
                    break
        
        return data
    
    def _parse_filename(self, file_path: Path, data: Dict) -> Dict:
        """
        Parse artist and title from filename
        Common patterns:
        - "Artist - Title.m4a"
        - "Title.m4a"
        """
        stem = file_path.stem
        
        if ' - ' in stem:
            parts = stem.split(' - ', 1)
            if not data['artist']:
                data['artist'] = parts[0].strip()
            if not data['title']:
                data['title'] = parts[1].strip()
        else:
            if not data['title']:
                data['title'] = stem
        
        return data
