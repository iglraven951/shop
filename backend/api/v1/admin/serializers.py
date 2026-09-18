"""Admin request/response serializers (DTOs)."""

from typing import Optional
from dataclasses import dataclass, asdict


@dataclass
class BanUserRequest:
    """Request schema for banning a user."""
    reason: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "BanUserRequest":
        """Create from dictionary."""
        return cls(
            reason=data.get("reason")
        )


@dataclass
class ApproveProductRequest:
    """Request schema for approving a product."""
    notes: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "ApproveProductRequest":
        """Create from dictionary."""
        return cls(
            notes=data.get("notes")
        )


@dataclass
class RejectProductRequest:
    """Request schema for rejecting a product."""
    reason: str

    @classmethod
    def from_dict(cls, data: dict) -> "RejectProductRequest":
        """Create from dictionary."""
        return cls(
            reason=data.get("reason", "")
        )


__all__ = [
    "BanUserRequest",
    "ApproveProductRequest",
    "RejectProductRequest",
]
