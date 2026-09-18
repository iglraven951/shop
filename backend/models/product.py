"""Product, Category, and ProductImage models for marketplace listings."""

from datetime import datetime, timezone
from enum import Enum as PyEnum
from decimal import Decimal
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean, Index, UniqueConstraint, Numeric, Enum
from sqlalchemy.orm import relationship
from backend.database import Base


class ProductStatus(PyEnum):
    """Product listing status enumeration."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SOLD_OUT = "sold_out"
    ARCHIVED = "archived"
    DELISTED = "delisted"


class Category(Base):
    """Product category for organization and filtering.

    Supports hierarchical categories with parent-child relationships.

    Attributes:
        id: Primary key (UUID)
        name: Category name (unique)
        slug: URL-friendly slug
        icon_url: URL to category icon
        parent_category_id: Foreign key to parent category (for subcategories)
        created_at: Creation timestamp
    """

    __tablename__ = "categories"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Category Information
    name = Column(String(100), unique=True, nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    icon_url = Column(String(500), nullable=True)

    # Hierarchy (for subcategories)
    parent_category_id = Column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    products = relationship("Product", back_populates="category")
    subcategories = relationship(
        "Category",
        remote_side=[id],
        backref="parent_category",
        foreign_keys=[parent_category_id]
    )

    # Indexes
    __table_args__ = (
        Index('idx_category_name', 'name'),
        Index('idx_category_slug', 'slug'),
    )

    def __repr__(self) -> str:
        return f"<Category {self.name}>"


class Product(Base):
    """Product listing in the marketplace.

    Represents items for sale with pricing, inventory, and approval workflow.

    Attributes:
        id: Primary key (UUID)
        seller_id: Foreign key to User (seller)
        category_id: Foreign key to Category
        title: Product title
        description: Detailed product description
        price: Selling price
        original_price: Original price (for discounts)
        stock: Quantity available
        sold_count: Number of items sold
        status: Approval status (pending/approved/rejected/sold_out/archived)
        approval_required: Whether admin approval is required
        location: Geographic location of item
        distance_km: Distance in kilometers (for distance-based filtering)
        created_at: Listing creation timestamp
        updated_at: Last listing update timestamp
    """

    __tablename__ = "products"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    seller_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)

    # Product Information
    title = Column(String(255), nullable=False, index=True)
    description = Column(String(2000), nullable=False)
    # Use Numeric for precise financial calculations (10 digits total, 2 decimal places)
    price = Column(Numeric(precision=10, scale=2), nullable=False)
    original_price = Column(Numeric(precision=10, scale=2), nullable=True)  # For discount calculation
    stock = Column(Integer, default=0, nullable=False)
    sold_count = Column(Integer, default=0, nullable=False)

    # Status & Approval
    status = Column(
        String(20),
        default="pending",
        nullable=False,
        index=True
    )  # pending, approved, rejected, sold_out, archived
    approval_required = Column(Boolean, default=True, nullable=False)

    # Location
    location = Column(String(255), nullable=True)
    distance_km = Column(Float, nullable=True)  # For geo-based queries

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
    seller = relationship("User", back_populates="products", foreign_keys=[seller_id])
    category = relationship("Category", back_populates="products")
    images = relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="joined"
    )
    order_items = relationship("OrderItem", back_populates="product")
    reviews = relationship("Review", back_populates="product", cascade="all, delete-orphan")
    wishlist_items = relationship("Wishlist", back_populates="product", cascade="all, delete-orphan")
    approval = relationship(
        "ProductApproval",
        back_populates="product",
        uselist=False,
        cascade="all, delete-orphan"
    )

    # Indexes for common queries
    __table_args__ = (
        # Foreign key lookups
        Index('idx_product_seller_id', 'seller_id'),
        Index('idx_product_category_id', 'category_id'),

        # Status and visibility filtering
        Index('idx_product_status', 'status'),

        # Temporal queries
        Index('idx_product_created_at', 'created_at'),

        # Search and discovery
        Index('idx_product_title', 'title'),

        # Composite indexes for common query patterns
        # Seller products: find seller's approved products
        Index('idx_product_seller_status', 'seller_id', 'status'),

        # Category browsing: find products by category and status with sorting
        Index('idx_product_category_status_created', 'category_id', 'status', 'created_at', 'price'),

        # Recent products for feed/discovery
        Index('idx_product_status_created_seller', 'status', 'created_at', 'seller_id'),

        # Price range queries
        Index('idx_product_price', 'price'),

        # Inventory tracking
        Index('idx_product_stock', 'stock'),
    )

    def __repr__(self) -> str:
        return f"<Product {self.title} (${self.price})>"


class ProductImage(Base):
    """Images for product listings.

    Each product can have multiple images with one primary image.

    Attributes:
        id: Primary key (UUID)
        product_id: Foreign key to Product
        image_url: URL to the image file
        order: Display order (0 for primary)
        is_primary: Whether this is the primary image
        created_at: Upload timestamp
    """

    __tablename__ = "product_images"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Key
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    # Image Information
    image_url = Column(String(500), nullable=False)
    order = Column(Integer, default=0, nullable=False)  # Display order
    is_primary = Column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    product = relationship("Product", back_populates="images")

    # Indexes
    __table_args__ = (
        Index('idx_product_image_product_id', 'product_id'),
        Index('idx_product_image_is_primary', 'is_primary'),
    )

    def __repr__(self) -> str:
        return f"<ProductImage product_id={self.product_id} order={self.order}>"
