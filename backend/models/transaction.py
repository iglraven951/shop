"""Transaction model for payment tracking and history."""

from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index, Numeric, Enum
from sqlalchemy.orm import relationship
from backend.database import Base


class PaymentMethod(PyEnum):
    """Payment method enumeration."""
    CARD = "card"
    TRANSFER = "transfer"
    CASH = "cash"
    WALLET = "wallet"
    PAYPAL = "paypal"


class Transaction(Base):
    """Payment transaction for an order.

    Tracks the financial details and status of order payments.

    Attributes:
        id: Primary key (UUID)
        order_id: Foreign key to Order (unique, one transaction per order)
        user_id: Foreign key to User (payer/buyer)
        amount: Transaction amount in currency
        status: Transaction status (pending/completed/failed)
        payment_method: Payment method used (card/transfer/cash)
        created_at: Transaction creation timestamp
        completed_at: When transaction was completed/processed
    """

    __tablename__ = "transactions"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Transaction Information
    # Use Numeric for precise financial calculations
    amount = Column(Numeric(precision=12, scale=2), nullable=False)
    status = Column(
        String(20),
        default="pending",
        nullable=False,
        index=True
    )  # pending, completed, failed
    payment_method = Column(
        String(20),
        nullable=False
    )  # card, transfer, cash

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )
    completed_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    # Relationships
    order = relationship("Order", back_populates="transaction")
    user = relationship("User", back_populates="transactions")

    # Indexes for transaction lookups
    __table_args__ = (
        # Relationship lookups
        Index('idx_transaction_order_id', 'order_id'),
        Index('idx_transaction_user_id', 'user_id'),

        # Status filtering
        Index('idx_transaction_status', 'status'),

        # Temporal queries
        Index('idx_transaction_created_at', 'created_at'),

        # Composite indexes for common patterns
        # User's transaction history with status
        Index('idx_transaction_user_status_created', 'user_id', 'status', 'created_at'),

        # Payment method tracking
        Index('idx_transaction_payment_method', 'payment_method'),

        # Recent transactions for dashboard
        Index('idx_transaction_status_created', 'status', 'created_at'),

        # Completion tracking
        Index('idx_transaction_completed_at', 'completed_at'),
    )

    def __repr__(self) -> str:
        return f"<Transaction order_id={self.order_id} amount={self.amount} status={self.status}>"
