"""Configuration management for DiscoveryShop backend.

Provides environment-specific configurations:
- Development
- Production
- Testing

Follows best practices:
- 12-factor app methodology
- Environment variable override
- Type hints
- Documentation for each setting
"""

import os
from datetime import timedelta
from pathlib import Path


class Config:
    """Base configuration with common settings.

    All environment-specific configs inherit from this class.
    """

    # ============ FLASK SETTINGS ============
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.getenv(
        "SECRET_KEY",
        "dev-secret-key-change-in-production"
    )

    # ============ JWT SETTINGS ============
    JWT_SECRET_KEY = os.getenv(
        "JWT_SECRET_KEY",
        "jwt-secret-key-change-in-production"
    )
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    JWT_ALGORITHM = "HS256"

    # ============ DATABASE SETTINGS ============
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    }

    # ============ CORS SETTINGS ============
    CORS_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:5173",
        "https://9a23-2800-200-f430-320-f0b3-f6b8-8310-5a5f.ngrok-free.app",
    ]

    # Add Ngrok URL if configured
    _ngrok_url = os.getenv("NGROK_URL", "").strip()
    if _ngrok_url and _ngrok_url not in CORS_ORIGINS:
        CORS_ORIGINS.append(_ngrok_url)

    NGROK_URL = _ngrok_url

    # ============ SESSION SETTINGS ============
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # ============ FILE UPLOAD SETTINGS ============
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max file upload
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "backend/uploads")
    ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}

    # ============ LOGGING SETTINGS ============
    LOG_LEVEL = "INFO"
    LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # ============ SOCKETIO SETTINGS ============
    SOCKETIO_MESSAGE_QUEUE = os.getenv("SOCKETIO_MESSAGE_QUEUE", None)
    USE_GEVENT = False

    # ============ API SETTINGS ============
    API_VERSION = "v1"
    API_PREFIX = "/api"
    JSON_SORT_KEYS = False
    JSONIFY_PRETTYPRINT_REGULAR = False

    # ============ CHATBOT / AI SETTINGS ============
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    CHATBOT_ENABLED = os.getenv("CHATBOT_ENABLED", "true").lower() == "true"


class DevelopmentConfig(Config):
    """Development configuration.

    Features:
    - Debug mode enabled
    - Verbose SQL logging
    - Relaxed CORS
    - SQLite database
    - No HTTPS required
    """

    DEBUG = True
    TESTING = False
    SQLALCHEMY_ECHO = True
    LOG_LEVEL = "DEBUG"

    # SQLite for development
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "sqlite:///discovery_shop.db"
    )
    SQLALCHEMY_DATABASE_URI = DATABASE_URL

    # Disable HTTPS requirement in development
    SESSION_COOKIE_SECURE = False

    # Verbose logging in development
    LOGGER_PROPAGATE = True


class ProductionConfig(Config):
    """Production configuration.

    Features:
    - Debug mode disabled
    - Optimized for performance
    - Enforces HTTPS
    - PostgreSQL database
    - Strict security settings
    """

    DEBUG = False
    TESTING = False

    # PostgreSQL for production
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://user:password@localhost:5432/discovery_shop"
    )
    SQLALCHEMY_DATABASE_URI = DATABASE_URL

    # Enforce HTTPS
    SESSION_COOKIE_SECURE = True

    # Production logging
    LOG_LEVEL = "INFO"

    # Performance optimizations
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 20,
        "pool_pre_ping": True,
        "pool_recycle": 3600,
        "max_overflow": 40,
    }

    # Security settings
    JSONIFY_PRETTYPRINT_REGULAR = False


class TestingConfig(Config):
    """Testing configuration.

    Features:
    - Debug mode enabled for better error messages
    - In-memory SQLite database
    - CSRF disabled
    - JWT expires quickly
    """

    DEBUG = True
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)
    WTF_CSRF_ENABLED = False
    LOG_LEVEL = "DEBUG"


def get_config(config_name: str = None) -> type:
    """
    Get configuration class based on environment.

    Args:
        config_name: Configuration name (development, production, testing).

    Returns:
        Configuration class.

    Example:
        >>> config = get_config('production')
        >>> app.config.from_object(config)
    """
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    configs = {
        "development": DevelopmentConfig,
        "production": ProductionConfig,
        "testing": TestingConfig,
    }

    return configs.get(config_name, DevelopmentConfig)


# Configuration selector
config_name = os.getenv("FLASK_ENV", "development")
CURRENT_CONFIG = get_config(config_name)

# Expose common configs
__all__ = [
    "Config",
    "DevelopmentConfig",
    "ProductionConfig",
    "TestingConfig",
    "get_config",
    "CURRENT_CONFIG",
]
