"""User profile model for reputation and statistics."""

from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from backend.database import Base


class Profile(Base):
    """Extended user profile with reputation and metrics.

    Maintains aggregate statistics for both buyer and seller ratings.

    Attributes:
        id: Primary key (UUID)
        user_id: Foreign key to User (1-to-1 relationship)
        bio: User's bio/description
        location: User's city/location
        phone: Contact phone number
        seller_rating: Average seller rating (0-5)
        buyer_rating: Average buyer rating (0-5)
        seller_reviews_count: Number of reviews as seller
        buyer_reviews_count: Number of reviews as buyer
        avg_response_time: Average response time in minutes
        total_sales: Cumulative sales count
        total_purchases: Cumulative purchases count
        created_at: Profile creation timestamp
        updated_at: Last profile update timestamp
    """

    __tablename__ = "profiles"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Key
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Personal Information
    bio = Column(String(500), nullable=True)
    location = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)

    # Seller Metrics
    seller_rating = Column(Float, default=0.0, nullable=False)  # 0-5 scale
    seller_reviews_count = Column(Integer, default=0, nullable=False)

    # Buyer Metrics
    buyer_rating = Column(Float, default=0.0, nullable=False)  # 0-5 scale
    buyer_reviews_count = Column(Integer, default=0, nullable=False)

    # Performance Metrics
    avg_response_time = Column(Integer, default=0, nullable=False)  # in minutes
    total_sales = Column(Integer, default=0, nullable=False)
    total_purchases = Column(Integer, default=0, nullable=False)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="profile")

    # Indexes for profile queries
    __table_args__ = (
        Index('idx_profile_user_id', 'user_id'),
        Index('idx_profile_seller_rating', 'seller_rating'),
        Index('idx_profile_buyer_rating', 'buyer_rating'),

        # Composite indexes for common patterns
        # Find highly rated sellers (for recommendations)
        Index('idx_profile_seller_rating_reviews', 'seller_rating', 'seller_reviews_count'),

        # Find trusted buyers
        Index('idx_profile_buyer_rating_reviews', 'buyer_rating', 'buyer_reviews_count'),

        # Leaderboard queries
        Index('idx_profile_total_sales', 'total_sales'),
        Index('idx_profile_total_purchases', 'total_purchases'),

        # Seller discovery by performance
        Index('idx_profile_avg_response_time', 'avg_response_time'),
    )

    def __repr__(self) -> str:
        return f"<Profile user_id={self.user_id} seller_rating={self.seller_rating}>"
