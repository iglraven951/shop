"""Database connection and session management for DiscoveryShop."""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.pool import StaticPool
from typing import Generator
from backend.config import Config

# Create the declarative base for all models
Base = declarative_base()

# Database engine configuration
# Use SQLite for development with StaticPool for in-memory DB testing
engine = create_engine(
    Config.SQLALCHEMY_DATABASE_URI,
    echo=Config.SQLALCHEMY_ECHO,
    pool_pre_ping=True,  # Test connections before using them
    connect_args={
        "check_same_thread": False
    } if "sqlite" in Config.SQLALCHEMY_DATABASE_URI else {},
    poolclass=StaticPool if "sqlite:///:memory:" in Config.SQLALCHEMY_DATABASE_URI else None,
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """Get database session for dependency injection.

    Usage:
        def my_route(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Initialize database tables and apply migrations.

    Creates all tables from models if they don't exist.
    Should be called once during application startup.
    """
    Base.metadata.create_all(bind=engine)


def drop_db() -> None:
    """Drop all database tables.

    WARNING: This is destructive and should only be used in development/testing.
    """
    Base.metadata.drop_all(bind=engine)


def reset_db() -> None:
    """Reset database by dropping and recreating all tables.

    WARNING: This is destructive and should only be used in development/testing.
    """
    drop_db()
    init_db()


# SQLite-specific configuration for foreign key support
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign key constraints for SQLite."""
    if "sqlite" in Config.SQLALCHEMY_DATABASE_URI:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
