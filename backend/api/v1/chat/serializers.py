"""Chat request/response serializers (DTOs)."""

from typing import Optional
from dataclasses import dataclass, asdict


@dataclass
class SendMessageRequest:
    """Request schema for sending a message."""
    recipient_id: str
    message: str
    file_url: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "SendMessageRequest":
        """Create from dictionary."""
        return cls(
            recipient_id=data.get("recipient_id"),
            message=data.get("message"),
            file_url=data.get("file_url")
        )


@dataclass
class MessageResponse:
    """Response schema for a single message."""
    id: str
    sender_id: str
    sender_name: str
    receiver_id: str
    content: str
    file_url: Optional[str]
    is_read: bool
    created_at: str

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ConversationResponse:
    """Response schema for a conversation summary."""
    user_id: str
    username: str
    full_name: str
    avatar_url: Optional[str]
    last_message: str
    last_message_time: str
    is_unread: bool

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


__all__ = [
    "SendMessageRequest",
    "MessageResponse",
    "ConversationResponse",
]
