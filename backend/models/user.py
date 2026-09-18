"""User model for authentication and roles."""

from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import Column, String, Boolean, DateTime, Index, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from werkzeug.security import generate_password_hash, check_password_hash
from backend.database import Base


class UserStatus(PyEnum):
    """User account status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    BANNED = "banned"
    SUSPENDED = "suspended"


class User(Base):
    """User model representing marketplace participants.

    A user can be:
    - A buyer (default)
    - A seller (if is_seller=True and seller_verified=True)
    - Both buyer and seller simultaneously

    Attributes:
        id: Primary key (auto-incrementing)
        email: Unique email address for login
        username: Public username
        password_hash: Bcrypt-hashed password
        full_name: User's full name
        avatar_url: URL to user's profile picture
        is_buyer: Whether user can purchase items (default True)
        is_seller: Whether user can list items for sale
        seller_verified: Whether seller account is verified by admin
        is_active: Whether account is active/not banned
        created_at: Account creation timestamp
        updated_at: Last profile update timestamp
    """

    __tablename__ = "users"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Authentication
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    # Profile Information
    full_name = Column(String(255), nullable=False)
    avatar_url = Column(String(500), nullable=True)

    # Role Flags
    is_buyer = Column(Boolean, default=True, nullable=False)
    is_seller = Column(Boolean, default=False, nullable=False)
    seller_verified = Column(Boolean, default=False, nullable=False)

    # Account Status
    is_active = Column(Boolean, default=True, nullable=False, index=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    profile = relationship(
        "Profile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="joined"
    )

    products = relationship(
        "Product",
        back_populates="seller",
        foreign_keys="Product.seller_id",
        cascade="all, delete-orphan"
    )

    orders_as_buyer = relationship(
        "Order",
        back_populates="buyer",
        foreign_keys="Order.buyer_id",
        cascade="all, delete-orphan"
    )

    orders_as_seller = relationship(
        "Order",
        back_populates="seller",
        foreign_keys="Order.seller_id"
    )

    cart = relationship(
        "Cart",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )

    reviews_given = relationship(
        "Review",
        back_populates="reviewer",
        foreign_keys="Review.reviewer_id",
        cascade="all, delete-orphan"
    )

    reviews_received = relationship(
        "Review",
        back_populates="product"
    )

    wishlist = relationship(
        "Wishlist",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    sent_messages = relationship(
        "ChatMessage",
        back_populates="sender",
        foreign_keys="ChatMessage.sender_id",
        cascade="all, delete-orphan"
    )

    received_messages = relationship(
        "ChatMessage",
        back_populates="receiver",
        foreign_keys="ChatMessage.receiver_id"
    )

    approvals_reviewed = relationship(
        "ProductApproval",
        back_populates="admin",
        cascade="all, delete-orphan"
    )

    transactions = relationship(
        "Transaction",
        back_populates="user"
    )

    forum_topics = relationship(
        "ForumTopic",
        back_populates="author",
        cascade="all, delete-orphan"
    )

    forum_replies = relationship(
        "ForumReply",
        back_populates="author",
        cascade="all, delete-orphan"
    )

    # Indexes for common queries
    __table_args__ = (
        # Login and authentication queries
        Index('idx_user_email', 'email', unique=False),
        Index('idx_user_username', 'username', unique=False),

        # Status and role queries
        Index('idx_user_active', 'is_active'),
        Index('idx_user_seller_verified', 'seller_verified'),

        # Composite indexes for frequent query patterns
        # Seller discovery: find active sellers
        Index('idx_user_seller_active', 'is_seller', 'seller_verified', 'is_active'),

        # Recent joins for analytics
        Index('idx_user_created_active', 'created_at', 'is_active'),

        # For fetching user profiles
        Index('idx_user_is_buyer', 'is_buyer'),
    )

    def set_password(self, password: str) -> None:
        """Hash and set user password.

        Uses werkzeug's generate_password_hash with bcrypt (default PBKDF2).

        Args:
            password: Plain text password to hash
        """
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        """Verify a plain text password against the hash.

        Args:
            password: Plain text password to verify

        Returns:
            True if password matches, False otherwise
        """
        return check_password_hash(self.password_hash, password)

    def toggle_role(self, role: str) -> None:
        """Toggle a user role.

        Args:
            role: Role to toggle ('buyer' or 'seller')

        Raises:
            ValueError: If role is not 'buyer' or 'seller'
        """
        if role == "buyer":
            self.is_buyer = not self.is_buyer
        elif role == "seller":
            self.is_seller = not self.is_seller
        else:
            raise ValueError(f"Unknown role: {role}")

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.email})>"
