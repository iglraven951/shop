"""Shopping cart, order, and order item models."""

from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean, Index, UniqueConstraint, Numeric, Enum
from sqlalchemy.orm import relationship
from backend.database import Base


class OrderStatus(PyEnum):
    """Order status enumeration."""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class TransactionStatus(PyEnum):
    """Transaction status enumeration."""
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


class Cart(Base):
    """Shopping cart for a user.

    Each user has at most one active cart.

    Attributes:
        id: Primary key (UUID)
        user_id: Foreign key to User (one cart per user)
        created_at: Cart creation timestamp
        updated_at: Last modification timestamp
    """

    __tablename__ = "carts"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Key
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

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
    user = relationship("User", back_populates="cart")
    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index('idx_cart_user_id', 'user_id'),
    )

    def __repr__(self) -> str:
        return f"<Cart user_id={self.user_id}>"


class CartItem(Base):
    """Item in a shopping cart.

    Attributes:
        id: Primary key (UUID)
        cart_id: Foreign key to Cart
        product_id: Foreign key to Product
        quantity: Number of items
        price: Price captured at time of adding to cart
        created_at: Add to cart timestamp
        updated_at: Last modification timestamp
    """

    __tablename__ = "cart_items"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    cart_id = Column(String(36), ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    # Item Information
    quantity = Column(Integer, default=1, nullable=False)
    price = Column(Numeric(precision=10, scale=2), nullable=False)  # Price at time of adding to cart

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
    cart = relationship("Cart", back_populates="items")
    product = relationship("Product")

    # Constraints
    __table_args__ = (
        UniqueConstraint('cart_id', 'product_id', name='unique_cart_product'),
        Index('idx_cart_item_cart_id', 'cart_id'),
        Index('idx_cart_item_product_id', 'product_id'),
        # Composite for fetching cart with items
        Index('idx_cart_item_cart_created', 'cart_id', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<CartItem cart_id={self.cart_id} product_id={self.product_id} qty={self.quantity}>"


class Order(Base):
    """Purchase order in the marketplace.

    Represents a single transaction between buyer and seller.

    Attributes:
        id: Primary key (UUID)
        buyer_id: Foreign key to User (buyer)
        seller_id: Foreign key to User (seller)
        total_price: Total order amount
        status: Order status (pending/confirmed/shipped/delivered/cancelled)
        shipping_address: Delivery address
        tracking_number: Shipping tracking number
        created_at: Order creation timestamp
        updated_at: Last order update timestamp
    """

    __tablename__ = "orders"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    buyer_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    seller_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Order Information
    # Use Numeric for precise financial calculations
    total_price = Column(Numeric(precision=12, scale=2), nullable=False)
    status = Column(
        String(20),
        default="pending",
        nullable=False,
        index=True
    )  # pending, confirmed, shipped, delivered, cancelled

    # Shipping Information
    shipping_address = Column(String(500), nullable=True)
    tracking_number = Column(String(100), nullable=True)

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
    buyer = relationship("User", back_populates="orders_as_buyer", foreign_keys=[buyer_id])
    seller = relationship("User", back_populates="orders_as_seller", foreign_keys=[seller_id])
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", lazy="joined")
    reviews = relationship("Review", back_populates="order", cascade="all, delete-orphan")
    transaction = relationship(
        "Transaction",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan"
    )

    # Indexes for common queries
    __table_args__ = (
        # User order lookups
        Index('idx_order_buyer_id', 'buyer_id'),
        Index('idx_order_seller_id', 'seller_id'),

        # Status filtering
        Index('idx_order_status', 'status'),

        # Temporal queries
        Index('idx_order_created_at', 'created_at'),

        # Composite indexes for common query patterns
        # Buyer's orders with status filtering
        Index('idx_order_buyer_status_created', 'buyer_id', 'status', 'created_at'),

        # Seller's orders (what's been ordered from this seller)
        Index('idx_order_seller_status_created', 'seller_id', 'status', 'created_at'),

        # Recent orders for dashboard
        Index('idx_order_status_created', 'status', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<Order id={self.id} buyer={self.buyer_id} status={self.status}>"


class OrderItem(Base):
    """Individual item in an order.

    Captures snapshot of product information at time of purchase.

    Attributes:
        id: Primary key (UUID)
        order_id: Foreign key to Order
        product_id: Foreign key to Product
        quantity: Number of items ordered
        unit_price: Price per unit at time of purchase
        returned: Whether this item was returned
        created_at: Item creation timestamp
    """

    __tablename__ = "order_items"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)

    # Item Information
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(precision=10, scale=2), nullable=False)  # Price at time of purchase
    returned = Column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")

    # Indexes for order item lookups
    __table_args__ = (
        Index('idx_order_item_order_id', 'order_id'),
        Index('idx_order_item_product_id', 'product_id'),
        # Composite for fetching all items in an order
        Index('idx_order_item_order_created', 'order_id', 'created_at'),
        # For returns processing
        Index('idx_order_item_returned', 'returned'),
    )

    def __repr__(self) -> str:
        return f"<OrderItem order_id={self.order_id} product_id={self.product_id}>"
