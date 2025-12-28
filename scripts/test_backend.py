#!/usr/bin/env python3
"""
Quick test script to verify backend modules load correctly
"""
import sys
sys.path.insert(0, '../backend')

def test_imports():
    """Test all imports work correctly"""
    print("Testing imports...")
    
    try:
        from database import Base, Config, Credentials, Session, Channel, Download
        print("  ✅ Database models")
    except Exception as e:
        print(f"  ❌ Database models: {e}")
        return False
    
    try:
        from services.auth_service import AuthService
        print("  ✅ Auth service")
    except Exception as e:
        print(f"  ❌ Auth service: {e}")
        return False
    
    try:
        from services.sxm_api import SiriusXMAPI
        print("  ✅ SXM API")
    except Exception as e:
        print(f"  ❌ SXM API: {e}")
        return False
    
    try:
        from services.hls_service import HLSService
        print("  ✅ HLS service")
    except Exception as e:
        print(f"  ❌ HLS service: {e}")
        return False
    
    try:
        from services.download_service import DownloadService
        print("  ✅ Download service")
    except Exception as e:
        print(f"  ❌ Download service: {e}")
        return False
    
    try:
        from services.live_recorder import LiveRecorder
        print("  ✅ Live recorder")
    except Exception as e:
        print(f"  ❌ Live recorder: {e}")
        return False
    
    print("\n✅ All imports successful!")
    return True

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)
