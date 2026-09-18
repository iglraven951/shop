"""Social features: reviews, notifications, and wishlist."""

from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean, Index, UniqueConstraint, Text
from sqlalchemy.orm import relationship
from backend.database import Base


class Review(Base):
    """Product and seller review/rating.

    Represents feedback left by a buyer for a product/seller.

    Attributes:
        id: Primary key (UUID)
        reviewer_id: Foreign key to User (who wrote the review)
        product_id: Foreign key to Product (being reviewed)
        order_id: Foreign key to Order (context for the review)
        rating: Star rating (1-5)
        comment: Review text
        created_at: Review creation timestamp
        updated_at: Last review update timestamp
    """

    __tablename__ = "reviews"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    reviewer_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)

    # Review Content
    rating = Column(Integer, nullable=False)  # 1-5 scale
    comment = Column(Text, nullable=True)

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
    reviewer = relationship("User", back_populates="reviews_given", foreign_keys=[reviewer_id])
    product = relationship("Product", back_populates="reviews", foreign_keys=[product_id])
    order = relationship("Order", back_populates="reviews", foreign_keys=[order_id])

    # Constraints and indexes for review queries
    __table_args__ = (
        UniqueConstraint('reviewer_id', 'product_id', name='unique_review_per_product'),
        Index('idx_review_reviewer_id', 'reviewer_id'),
        Index('idx_review_product_id', 'product_id'),
        Index('idx_review_order_id', 'order_id'),

        # Composite indexes for common patterns
        # Product reviews sorted by recency
        Index('idx_review_product_created', 'product_id', 'created_at'),

        # Product reviews sorted by rating
        Index('idx_review_product_rating', 'product_id', 'rating'),

        # User's reviews
        Index('idx_review_reviewer_created', 'reviewer_id', 'created_at'),

        # High ratings discovery
        Index('idx_review_rating', 'rating'),
    )

    def __repr__(self) -> str:
        return f"<Review product_id={self.product_id} rating={self.rating}>"


class Notification(Base):
    """User notification for events and updates.

    Attributes:
        id: Primary key (UUID)
        user_id: Foreign key to User (notification recipient)
        type: Type of notification (order, message, approval, review)
        title: Short notification title
        message: Notification message body
        link_url: URL to related resource
        is_read: Whether user has read the notification
        created_at: Notification creation timestamp
    """

    __tablename__ = "notifications"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Key
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Notification Information
    type = Column(String(20), nullable=False)  # order, message, approval, review
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    link_url = Column(String(500), nullable=True)

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
    user = relationship("User", back_populates="notifications")

    # Indexes for notification queries
    __table_args__ = (
        Index('idx_notification_user_id', 'user_id'),
        Index('idx_notification_is_read', 'is_read'),
        Index('idx_notification_created_at', 'created_at'),

        # Composite indexes for common patterns
        # User's unread notifications
        Index('idx_notification_user_read_created', 'user_id', 'is_read', 'created_at'),

        # Notification type filtering
        Index('idx_notification_type', 'type'),

        # Unread count queries
        Index('idx_notification_user_read', 'user_id', 'is_read'),
    )

    def __repr__(self) -> str:
        return f"<Notification user_id={self.user_id} type={self.type}>"


class Wishlist(Base):
    """User's wishlist/favorites for saved products.

    Attributes:
        id: Primary key (UUID)
        user_id: Foreign key to User
        product_id: Foreign key to Product
        added_at: Timestamp when added to wishlist
    """

    __tablename__ = "wishlist"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    # Timestamps
    added_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

    # Relationships
    user = relationship("User", back_populates="wishlist")
    product = relationship("Product", back_populates="wishlist_items")

    # Constraints and indexes for wishlist queries
    __table_args__ = (
        UniqueConstraint('user_id', 'product_id', name='unique_wishlist_item'),
        Index('idx_wishlist_user_id', 'user_id'),
        Index('idx_wishlist_product_id', 'product_id'),

        # Composite indexes for common patterns
        # User's wishlist sorted by date
        Index('idx_wishlist_user_added', 'user_id', 'added_at'),

        # Product popularity (who wishlisted it)
        Index('idx_wishlist_product_added', 'product_id', 'added_at'),
    )

    def __repr__(self) -> str:
        return f"<Wishlist user_id={self.user_id} product_id={self.product_id}>"
