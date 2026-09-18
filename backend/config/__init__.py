"""Configuration management for DiscoveryShop backend."""

import os
from datetime import timedelta


class Config:
    """Base configuration with common settings."""

    # Flask settings
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")

    # JWT settings
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-secret-key-change-in-production")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # JWT Cookie settings (httpOnly security)
    JWT_TOKEN_LOCATION = ['cookies']  # Accept tokens ONLY from cookies
    JWT_COOKIE_SECURE = True  # HTTPS only (set to False in development)
    JWT_COOKIE_HTTPONLY = True  # No JavaScript access (XSS protection)
    JWT_COOKIE_SAMESITE = 'Strict'  # CSRF protection
    JWT_COOKIE_CSRF_PROTECT = True  # Enable CSRF token validation
    JWT_CSRF_HEADER_NAME = 'X-CSRF-TOKEN'
    JWT_CSRF_CHECK_FORM = False  # Only check in headers, not form data

    # Database settings
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False

    # CORS settings - Restrictive by default
    # Combine configured origins with ngrok URL if available
    _cors_base = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5000,http://localhost:3000,http://localhost:5173"
    ).split(",")
    _ngrok_url = os.getenv("NGROK_URL", "").strip()
    if _ngrok_url and _ngrok_url not in _cors_base:
        _cors_base.append(_ngrok_url)
    CORS_ORIGINS = [origin.strip() for origin in _cors_base if origin.strip()]

    # CORS method restrictions (only allow necessary methods)
    CORS_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]

    # CORS header restrictions (whitelist only necessary headers)
    CORS_ALLOW_HEADERS = [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-CSRF-Token",
        "Accept",
        "Accept-Language",
        "Origin",
    ]

    # CORS response headers exposed to client
    CORS_EXPOSE_HEADERS = [
        "Content-Type",
        "X-Total-Count",
        "X-Page-Number",
        "X-Page-Size",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ]

    # CORS preflight cache time (1 hour = 3600 seconds)
    CORS_MAX_AGE = 3600

    # Allow credentials (cookies) in cross-origin requests
    CORS_SUPPORTS_CREDENTIALS = True

    # Ngrok URL para frontend
    NGROK_URL = _ngrok_url

    # Upload settings
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max file upload
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "backend/uploads")
    ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}

    # Session settings
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"


class DevelopmentConfig(Config):
    """Development configuration."""

    DEBUG = True
    TESTING = False
    SQLALCHEMY_ECHO = True

    # SQLite for development
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///discovery_shop.db")
    SQLALCHEMY_DATABASE_URI = DATABASE_URL

    # Disable HTTPS requirement in development (localhost)
    SESSION_COOKIE_SECURE = False
    JWT_COOKIE_SECURE = False  # Allow HTTP cookies in development

    # Verbose logging
    LOG_LEVEL = "DEBUG"


class ProductionConfig(Config):
    """Production configuration."""

    DEBUG = False
    TESTING = False

    # PostgreSQL for production
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/discovery_shop")
    SQLALCHEMY_DATABASE_URI = DATABASE_URL

    # Enforce HTTPS
    SESSION_COOKIE_SECURE = True

    # Production logging
    LOG_LEVEL = "INFO"


class TestingConfig(Config):
    """Testing configuration."""

    DEBUG = True
    TESTING = True

    # In-memory SQLite for tests
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)

    # Disable CSRF token requirement for testing
    WTF_CSRF_ENABLED = False


# Configuration selector
config_name = os.getenv("FLASK_ENV", "development")
configs = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}

Config = configs.get(config_name, DevelopmentConfig)
