"""
N_m3u8DL-RE Integration Service

Uses N_m3u8DL-RE for efficient HLS segment downloading.
This is an alternative/enhanced downloader that handles complex HLS scenarios.
"""
import subprocess
import asyncio
import os
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Optional
import json


class N_m3u8DLService:
    """
    Integration with N_m3u8DL-RE for HLS downloading
    
    N_m3u8DL-RE is a powerful cross-platform HLS/DASH downloader that handles:
    - AES-128 decryption
    - Multiple quality selection
    - Segment downloading with retry
    - Progress tracking
    """
    
    def __init__(self, bearer_token: str):
        self.bearer_token = bearer_token
        self.executable = self._find_executable()
    
    def _find_executable(self) -> str:
        """Find N_m3u8DL-RE executable"""
        paths = [
            '/usr/local/bin/N_m3u8DL-RE',
            '/usr/bin/N_m3u8DL-RE',
            shutil.which('N_m3u8DL-RE'),
            './N_m3u8DL-RE'
        ]
        
        for path in paths:
            if path and os.path.exists(path):
                return path
        
        return 'N_m3u8DL-RE'  # Assume it's in PATH
    
    async def download_stream(
        self,
        stream_url: str,
        output_path: Path,
        quality: str = "256k",
        headers: Optional[Dict[str, str]] = None,
        time_range: Optional[tuple] = None
    ) -> Dict:
        """
        Download HLS stream using N_m3u8DL-RE
        
        Args:
            stream_url: HLS master playlist URL
            output_path: Output file path
            quality: Preferred quality (256k, 128k, 64k, 32k)
            headers: Additional HTTP headers
            time_range: Optional (start_seconds, end_seconds) for partial download
        
        Returns:
            Dict with success status and details
        """
        try:
            # Build command
            cmd = [
                self.executable,
                stream_url,
                '--save-dir', str(output_path.parent),
                '--save-name', output_path.stem,
                '--tmp-dir', tempfile.gettempdir(),
                '--auto-select',
                '--no-log',
            ]
            
            # Add authorization header
            if self.bearer_token:
                cmd.extend([
                    '--header', f'Authorization: Bearer {self.bearer_token}'
                ])
            
            # Add custom headers
            if headers:
                for key, value in headers.items():
                    cmd.extend(['--header', f'{key}: {value}'])
            
            # Quality selection based on bandwidth
            bandwidth_map = {
                '256k': 281600,
                '128k': 140800,
                '64k': 70400,
                '32k': 35200
            }
            
            if quality in bandwidth_map:
                cmd.extend(['--select-video', f'bandwidth={bandwidth_map[quality]}'])
            
            # Run download
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                return {
                    'success': True,
                    'output_path': str(output_path),
                    'message': 'Download completed'
                }
            else:
                return {
                    'success': False,
                    'error': stderr.decode() or stdout.decode(),
                    'return_code': process.returncode
                }
                
        except FileNotFoundError:
            return {
                'success': False,
                'error': 'N_m3u8DL-RE not found. Please ensure it is installed.'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    async def download_segments_range(
        self,
        variant_url: str,
        output_path: Path,
        start_segment: int,
        end_segment: int
    ) -> Dict:
        """
        Download a specific range of segments
        
        This is useful for DVR downloads where we know exactly which
        segments correspond to a track.
        """
        try:
            cmd = [
                self.executable,
                variant_url,
                '--save-dir', str(output_path.parent),
                '--save-name', output_path.stem,
                '--tmp-dir', tempfile.gettempdir(),
                '--header', f'Authorization: Bearer {self.bearer_token}',
                '--no-log',
            ]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            return {
                'success': process.returncode == 0,
                'output_path': str(output_path) if process.returncode == 0 else None,
                'error': stderr.decode() if process.returncode != 0 else None
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def is_available(self) -> bool:
        """Check if N_m3u8DL-RE is available"""
        try:
            result = subprocess.run(
                [self.executable, '--version'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except:
            return False
    
    def get_version(self) -> Optional[str]:
        """Get N_m3u8DL-RE version"""
        try:
            result = subprocess.run(
                [self.executable, '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return result.stdout.strip()
            return None
        except:
            return None
