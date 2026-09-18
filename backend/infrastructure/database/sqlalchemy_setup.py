"""SQLAlchemy database setup and initialization.

Handles:
- Database connection setup
- Session management
- Table creation
- Database initialization

This module provides the foundation for all database operations.
"""

from flask import Flask
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session, scoped_session
from sqlalchemy.pool import StaticPool

# Create SQLAlchemy engine and session factory
engine = None
SessionLocal = None


def init_db(app: Flask, seed_data: bool = False) -> None:
    """
    Initialize database with application.

    Args:
        app: Flask application instance.
        seed_data: Whether to seed the database with sample data.
    """
    global engine, SessionLocal

    database_url = app.config.get("SQLALCHEMY_DATABASE_URI")

    # Create engine
    if "sqlite" in database_url:
        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=app.config.get("SQLALCHEMY_ECHO", False),
        )
    else:
        engine = create_engine(
            database_url,
            echo=app.config.get("SQLALCHEMY_ECHO", False),
            **app.config.get("SQLALCHEMY_ENGINE_OPTIONS", {})
        )

    # Create session factory
    SessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )

    # Create all tables
    from backend.domain.models import Base
    Base.metadata.create_all(bind=engine)

    # Seed data if requested
    if seed_data:
        seed_database()

    app.logger.info("Database initialized successfully")


def get_db() -> Session:
    """
    Get database session for use in routes.

    Returns:
        SQLAlchemy session.

    Example:
        >>> db = get_db()
        >>> user = db.query(User).filter(User.id == 1).first()
    """
    if SessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")

    return SessionLocal()


def seed_database() -> None:
    """
    Seed database with sample data for development.

    This should only be called in development environments.
    """
    try:
        session = get_db()
        # TODO: Add sample data creation
        session.commit()
    finally:
        session.close()


def drop_db(app: Flask = None) -> None:
    """
    Drop all database tables.

    WARNING: This is destructive. Use only in development.

    Args:
        app: Flask application instance.
    """
    if engine is None:
        raise RuntimeError("Database not initialized.")

    from backend.domain.models import Base
    Base.metadata.drop_all(bind=engine)

    if app:
        app.logger.warning("All database tables dropped")


__all__ = [
    "init_db",
    "get_db",
    "seed_database",
    "drop_db",
    "engine",
    "SessionLocal",
]
