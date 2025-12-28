"""
Database configuration and models
"""
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/archivexm.db")

# Increase pool size to prevent exhaustion during recording
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False},
    pool_size=10,
    max_overflow=20,
    pool_timeout=60,
    pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Config(Base):
    """Application configuration"""
    __tablename__ = "config"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True)
    value = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Credentials(Base):
    """SiriusXM credentials (encrypted)"""
    __tablename__ = "credentials"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255))
    password_encrypted = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Session(Base):
    """Authentication session"""
    __tablename__ = "sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    bearer_token = Column(Text)
    cookies = Column(Text)  # JSON encoded
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_valid = Column(Boolean, default=True)


class Channel(Base):
    """SiriusXM channel"""
    __tablename__ = "channels"
    
    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(String(100), unique=True, index=True)
    name = Column(String(255))
    number = Column(Integer)
    category = Column(String(100))
    genre = Column(String(100))
    description = Column(Text)
    image_url = Column(Text)
    large_image_url = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Download(Base):
    """Download history"""
    __tablename__ = "downloads"
    
    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(String(100))
    channel_name = Column(String(255))
    artist = Column(String(255))
    title = Column(String(255))
    album = Column(String(255))
    duration_ms = Column(Integer)
    file_path = Column(Text)
    file_size = Column(Integer)
    timestamp_utc = Column(String(50))
    downloaded_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="completed")


def create_tables():
    """Create all database tables"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Get database session (FastAPI dependency)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


from contextlib import contextmanager

@contextmanager
def get_db_session():
    """Get database session as context manager (for non-FastAPI use)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
