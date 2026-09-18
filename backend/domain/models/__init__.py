"""Domain models package.

SQLAlchemy ORM models representing the core business entities:
- User: User accounts and authentication
- Product: Products in the marketplace
- Order: Customer orders
- Chat: Messages between users
- And more...

All models inherit from Base which provides:
- Automatic id generation
- Automatic timestamps (created_at, updated_at)
- Common utility methods
"""

from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, DateTime, Integer, func
from datetime import datetime

# Create base class for all models
Base = declarative_base()


class BaseModel(Base):
    """Abstract base model with common fields.

    All domain models should inherit from this class.

    Provides:
        - id: Primary key
        - created_at: Timestamp when record was created
        - updated_at: Timestamp when record was last updated
    """

    __abstract__ = True

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        server_default=func.now()
    )
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        server_default=func.now()
    )

    def to_dict(self) -> dict:
        """Convert model instance to dictionary."""
        return {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
        }

    def __repr__(self) -> str:
        """String representation of model."""
        return f"<{self.__class__.__name__}(id={self.id})>"


# Import all models to register them with SQLAlchemy
# (will be added as models are created)

__all__ = [
    "Base",
    "BaseModel",
]
