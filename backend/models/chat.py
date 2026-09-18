"""Chat and messaging models for user communication."""

from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Index, Text
from sqlalchemy.orm import relationship
from backend.database import Base


class ChatMessage(Base):
    """Direct message between two users.

    Represents a single message in a conversation thread.

    Attributes:
        id: Primary key (UUID)
        sender_id: Foreign key to User (sender)
        receiver_id: Foreign key to User (receiver)
        message: Message content
        file_url: Optional URL to attached file
        is_read: Whether recipient has read the message
        created_at: Message timestamp
    """

    __tablename__ = "chat_messages"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    receiver_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Message Content
    message = Column(Text, nullable=False)
    file_url = Column(String(500), nullable=True)

    # Status
    is_read = Column(Boolean, default=False, nullable=False, index=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

    # Relationships
    sender = relationship("User", back_populates="sent_messages", foreign_keys=[sender_id])
    receiver = relationship("User", back_populates="received_messages", foreign_keys=[receiver_id])

    # Indexes for conversation queries
    __table_args__ = (
        Index('idx_chat_sender_id', 'sender_id'),
        Index('idx_chat_receiver_id', 'receiver_id'),
        Index('idx_chat_is_read', 'is_read'),

        # Composite indexes for common patterns
        # Get conversation between two users sorted by date (most important)
        Index('idx_chat_sender_receiver_created', 'sender_id', 'receiver_id', 'created_at'),

        # Get messages received by user (inbox)
        Index('idx_chat_receiver_created', 'receiver_id', 'created_at'),

        # Unread messages for user
        Index('idx_chat_receiver_unread', 'receiver_id', 'is_read', 'created_at'),

        # Sender's sent messages
        Index('idx_chat_sender_created', 'sender_id', 'created_at'),

        # Find unread count efficiently
        Index('idx_chat_receiver_is_read', 'receiver_id', 'is_read'),
    )

    def __repr__(self) -> str:
        return f"<ChatMessage from={self.sender_id} to={self.receiver_id}>"
