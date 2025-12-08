"""
Configuration for PlatformIO Builder Service
"""
import os
from pathlib import Path

class Config:
    """Application configuration"""

    # Server settings
    HOST = os.getenv('HOST', '0.0.0.0')
    PORT = int(os.getenv('PORT', 5000))
    DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

    # Build settings
    BUILDS_DIR = Path(os.getenv('BUILDS_DIR', '/builds'))
    MAX_BUILD_TIME = int(os.getenv('MAX_BUILD_TIME', 600))  # 10 minutes in seconds
    BUILD_CLEANUP_AGE = int(os.getenv('BUILD_CLEANUP_AGE', 3600))  # 1 hour in seconds

    # File upload settings
    MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', 10 * 1024 * 1024))  # 10MB
    ALLOWED_EXTENSIONS = {'.ini', '.cpp', '.h', '.hpp', '.c', '.ino', '.txt', '.json'}

    # PlatformIO settings
    PLATFORMIO_CORE_DIR = os.getenv('PLATFORMIO_CORE_DIR', str(Path.home() / '.platformio'))

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

    @classmethod
    def ensure_directories(cls):
        """Ensure required directories exist"""
        cls.BUILDS_DIR.mkdir(parents=True, exist_ok=True)
