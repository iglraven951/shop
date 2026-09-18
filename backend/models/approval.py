"""Product approval workflow for admin moderation."""

from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from backend.database import Base


class ProductApproval(Base):
    """Admin approval workflow for product listings.

    Tracks the approval status and history of product listings.
    Sellers must have their products approved before they appear in the marketplace.

    Attributes:
        id: Primary key (UUID)
        product_id: Foreign key to Product (being reviewed)
        admin_id: Foreign key to User (admin who reviewed, nullable if not yet reviewed)
        status: Approval status (pending/approved/rejected)
        reason: Rejection reason or approval notes
        created_at: Request creation timestamp
        reviewed_at: Timestamp when admin reviewed the request
    """

    __tablename__ = "product_approvals"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    admin_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Approval Information
    status = Column(
        String(20),
        default="pending",
        nullable=False,
        index=True
    )  # pending, approved, rejected
    reason = Column(String(1000), nullable=True)  # Rejection reason or approval notes

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )
    reviewed_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    # Relationships
    product = relationship("Product", back_populates="approval")
    admin = relationship("User", back_populates="approvals_reviewed")

    # Indexes for approval workflow
    __table_args__ = (
        Index('idx_approval_product_id', 'product_id'),
        Index('idx_approval_admin_id', 'admin_id'),
        Index('idx_approval_status', 'status'),
        Index('idx_approval_created_at', 'created_at'),

        # Composite indexes for common patterns
        # Pending approvals queue (most important)
        Index('idx_approval_status_created', 'status', 'created_at'),

        # Admin's approval history
        Index('idx_approval_admin_reviewed', 'admin_id', 'reviewed_at'),

        # Find pending items for dashboard
        Index('idx_approval_status_product', 'status', 'product_id'),
    )

    def __repr__(self) -> str:
        return f"<ProductApproval product_id={self.product_id} status={self.status}>"
