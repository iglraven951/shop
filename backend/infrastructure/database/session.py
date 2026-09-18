"""Database session management.

Provides utilities for working with SQLAlchemy sessions
in Flask contexts.
"""

from contextlib import contextmanager
from flask import g
from sqlalchemy.orm import Session
from typing import Generator

from backend.infrastructure.database.sqlalchemy_setup import SessionLocal


def get_db() -> Session:
    """
    Get database session for current request.

    If a session doesn't exist in the current Flask app context,
    create one. This ensures one session per request.

    Returns:
        SQLAlchemy session for the current request.

    Example:
        >>> db = get_db()
        >>> users = db.query(User).all()
    """
    if "db" not in g:
        g.db = SessionLocal()

    return g.db


def close_db(e=None) -> None:
    """
    Close database session at end of request.

    This should be registered as a teardown function
    in the Flask app.

    Args:
        e: Exception if one occurred during request.
    """
    db = g.pop("db", None)
    if db is not None:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for database sessions.

    Useful for background tasks, CLI commands, etc.

    Example:
        >>> with get_db_context() as db:
        >>>     user = db.query(User).filter(User.id == 1).first()
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


__all__ = [
    "get_db",
    "close_db",
    "get_db_context",
]
