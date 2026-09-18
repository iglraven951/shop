"""Application extensions and utilities setup."""

import logging
import logging.handlers
import os
from pathlib import Path


def setup_logging(app) -> None:
    """
    Configure professional logging with rotation and formatting.

    Sets up both file and stream handlers with appropriate levels.
    Log files are rotated daily and kept for 30 days.

    Args:
        app: Flask application instance
    """
    # Create logs directory if it doesn't exist
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    # Get log level from config or environment
    log_level = app.config.get("LOG_LEVEL", os.getenv("LOG_LEVEL", "INFO"))
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    # Create logger
    logger = logging.getLogger("discovery_shop")
    logger.setLevel(numeric_level)

    # Define log format
    detailed_format = logging.Formatter(
        "[%(asctime)s] %(levelname)-8s in %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    json_format = logging.Formatter(
        '{"timestamp": "%(asctime)s", "level": "%(levelname)s", '
        '"logger": "%(name)s", "message": "%(message)s"}',
        datefmt="%Y-%m-%dT%H:%M:%S"
    )

    # File handler with rotation (daily, keep 30 days)
    log_file = log_dir / "discovery_shop.log"
    file_handler = logging.handlers.RotatingFileHandler(
        filename=str(log_file),
        maxBytes=10 * 1024 * 1024,  # 10MB per file
        backupCount=30,  # Keep 30 backups
        encoding="utf-8"
    )
    file_handler.setLevel(numeric_level)
    file_handler.setFormatter(detailed_format)
    logger.addHandler(file_handler)

    # JSON file handler for machine-readable logs (production monitoring)
    json_log_file = log_dir / "discovery_shop.json"
    json_handler = logging.handlers.RotatingFileHandler(
        filename=str(json_log_file),
        maxBytes=10 * 1024 * 1024,
        backupCount=30,
        encoding="utf-8"
    )
    json_handler.setLevel(logging.WARNING)  # Only errors in JSON log
    json_handler.setFormatter(json_format)
    logger.addHandler(json_handler)

    # Console handler for development
    console_handler = logging.StreamHandler()
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(detailed_format)
    logger.addHandler(console_handler)

    # SQLAlchemy logger (less verbose)
    sqlalchemy_logger = logging.getLogger("sqlalchemy.engine")
    if app.config.get("SQLALCHEMY_ECHO"):
        sqlalchemy_logger.setLevel(logging.INFO)
    else:
        sqlalchemy_logger.setLevel(logging.WARNING)

    # Werkzeug logger
    werkzeug_logger = logging.getLogger("werkzeug")
    if app.debug:
        werkzeug_logger.setLevel(logging.DEBUG)
    else:
        werkzeug_logger.setLevel(logging.INFO)

    app.logger.info(f"Logging initialized - Level: {log_level}")
    app.logger.info(f"Environment: {app.config.get('FLASK_ENV', 'development')}")
    app.logger.info(f"Debug: {app.debug}")
