"""Forum request/response serializers (DTOs)."""

from typing import Optional
from dataclasses import dataclass, asdict


@dataclass
class CreateTopicRequest:
    """Request schema for creating a forum topic."""
    product_id: str
    title: str
    content: str

    @classmethod
    def from_dict(cls, data: dict) -> "CreateTopicRequest":
        """Create from dictionary."""
        return cls(
            product_id=data.get("product_id"),
            title=data.get("title"),
            content=data.get("content")
        )


@dataclass
class CreateReplyRequest:
    """Request schema for creating a forum reply."""
    content: str

    @classmethod
    def from_dict(cls, data: dict) -> "CreateReplyRequest":
        """Create from dictionary."""
        return cls(
            content=data.get("content")
        )


@dataclass
class VoteRequest:
    """Request schema for voting on a reply."""
    vote_type: str  # 'helpful' or 'not_helpful'

    @classmethod
    def from_dict(cls, data: dict) -> "VoteRequest":
        """Create from dictionary."""
        return cls(
            vote_type=data.get("vote_type")
        )


@dataclass
class TopicResponse:
    """Response schema for a forum topic."""
    id: str
    title: str
    content: str
    author_id: str
    author_name: str
    author_avatar: Optional[str]
    reply_count: int
    created_at: str
    updated_at: str

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ReplyResponse:
    """Response schema for a forum reply."""
    id: str
    content: str
    author_id: str
    author_name: str
    author_avatar: Optional[str]
    helpful_count: int
    not_helpful_count: int
    net_votes: int
    created_at: str
    updated_at: str

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


__all__ = [
    "CreateTopicRequest",
    "CreateReplyRequest",
    "VoteRequest",
    "TopicResponse",
    "ReplyResponse",
]
