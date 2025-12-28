"""
Configuration Router - App settings management
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from datetime import datetime
from typing import Optional
import os

from database import get_db, Config, Credentials

router = APIRouter()


class ConfigUpdate(BaseModel):
    download_path: Optional[str] = None
    audio_quality: Optional[str] = None


class SetupRequest(BaseModel):
    username: str
    password: str
    download_path: str


class ConfigResponse(BaseModel):
    is_configured: bool
    download_path: str | None
    audio_quality: str
    has_credentials: bool


@router.get("", response_model=ConfigResponse)
async def get_config(db: DBSession = Depends(get_db)):
    """
    Get current configuration
    """
    download_path_config = db.query(Config).filter(Config.key == "download_path").first()
    quality_config = db.query(Config).filter(Config.key == "audio_quality").first()
    creds = db.query(Credentials).first()
    
    is_configured = bool(download_path_config and creds)
    
    return ConfigResponse(
        is_configured=is_configured,
        download_path=download_path_config.value if download_path_config else None,
        audio_quality=quality_config.value if quality_config else "256k",
        has_credentials=bool(creds)
    )


@router.post("")
async def update_config(request: ConfigUpdate, db: DBSession = Depends(get_db)):
    """
    Update configuration settings
    """
    updates = {}
    
    if request.download_path:
        config = db.query(Config).filter(Config.key == "download_path").first()
        if config:
            config.value = request.download_path
            config.updated_at = datetime.utcnow()
        else:
            config = Config(key="download_path", value=request.download_path)
            db.add(config)
        updates["download_path"] = request.download_path
    
    if request.audio_quality:
        config = db.query(Config).filter(Config.key == "audio_quality").first()
        if config:
            config.value = request.audio_quality
            config.updated_at = datetime.utcnow()
        else:
            config = Config(key="audio_quality", value=request.audio_quality)
            db.add(config)
        updates["audio_quality"] = request.audio_quality
    
    db.commit()
    
    return {"success": True, "updated": updates}


@router.get("/setup-status")
async def get_setup_status(db: DBSession = Depends(get_db)):
    """
    Check if initial setup is complete
    """
    creds = db.query(Credentials).first()
    download_path = db.query(Config).filter(Config.key == "download_path").first()
    
    return {
        "needs_setup": not (creds and download_path),
        "has_credentials": bool(creds),
        "has_download_path": bool(download_path)
    }


@router.post("/setup")
async def initial_setup(request: SetupRequest, db: DBSession = Depends(get_db)):
    """
    Complete initial setup (credentials + download path)
    """
    from services.auth_service import AuthService
    import json
    
    try:
        # Authenticate first
        auth_service = AuthService()
        result = await auth_service.authenticate(request.username, request.password)
        
        if not result["success"]:
            raise HTTPException(status_code=401, detail="Authentication failed")
        
        # Store credentials
        existing_creds = db.query(Credentials).first()
        if existing_creds:
            existing_creds.username = request.username
            existing_creds.password_encrypted = auth_service.encrypt_password(request.password)
            existing_creds.updated_at = datetime.utcnow()
        else:
            creds = Credentials(
                username=request.username,
                password_encrypted=auth_service.encrypt_password(request.password)
            )
            db.add(creds)
        
        # Store session
        from database import Session as AuthSession
        db.query(AuthSession).update({"is_valid": False})
        
        session = AuthSession(
            bearer_token=result["bearer_token"],
            cookies=json.dumps(result.get("cookies", {})),
            expires_at=result.get("expires_at"),
            is_valid=True
        )
        db.add(session)
        
        # Store download path
        path_config = db.query(Config).filter(Config.key == "download_path").first()
        if path_config:
            path_config.value = request.download_path
            path_config.updated_at = datetime.utcnow()
        else:
            path_config = Config(key="download_path", value=request.download_path)
            db.add(path_config)
        
        db.commit()
        
        return {
            "success": True,
            "message": "Setup complete! You can now browse channels."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Setup error: {str(e)}")


@router.get("/download-paths")
async def get_download_paths():
    """
    Get available download path suggestions
    """
    base_paths = [
        "/downloads",
        "/app/downloads",
        os.path.expanduser("~/Music/ArchiveXM"),
        "/media",
        "/mnt"
    ]
    
    valid_paths = []
    for path in base_paths:
        if os.path.exists(os.path.dirname(path)) or os.path.exists(path):
            valid_paths.append(path)
    
    return {"paths": valid_paths}
