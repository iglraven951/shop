"""Data Transfer Objects for request/response serialization.

This module provides both traditional dataclass DTOs (for response serialization)
and Pydantic-based input validation models (for request validation).
"""

from dataclasses import dataclass, asdict
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

try:
    from pydantic import BaseModel, Field, field_validator
except ImportError:
    # Pydantic not installed - validation models will not be available
    BaseModel = None


@dataclass
class UserDTO:
    """User data transfer object."""

    id: int
    username: str
    email: str
    avatar_url: Optional[str]
    is_seller: bool
    is_buyer: bool
    created_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class ProfileDTO:
    """User profile data transfer object."""

    user_id: int
    full_name: str
    bio: Optional[str]
    location: Optional[str]
    phone: Optional[str]
    avatar_url: Optional[str]
    rating: float
    total_reviews: int
    seller_verified: bool
    is_buyer: bool
    is_seller: bool
    created_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ProductDTO:
    """Product data transfer object for listing."""

    id: int
    title: str
    price: float
    image_url: Optional[str]
    seller_id: int
    seller_name: str
    status: str
    rating: float
    review_count: int
    created_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ProductImageDTO:
    """Product image data transfer object."""

    id: int
    product_id: int
    image_url: str
    order: int
    is_main: bool

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ProductDetailDTO:
    """Detailed product data transfer object."""

    id: int
    title: str
    description: str
    price: float
    category_id: int
    category_name: str
    seller_id: int
    seller_name: str
    seller_avatar: Optional[str]
    seller_rating: float
    status: str
    rating: float
    review_count: int
    stock: int
    images: List[ProductImageDTO]
    created_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        data = asdict(self)
        data['images'] = [img.to_dict() if hasattr(img, 'to_dict') else img for img in self.images]
        return data


@dataclass
class CartItemDTO:
    """Cart item data transfer object."""

    product_id: int
    product_title: str
    price: float
    quantity: int
    image_url: Optional[str]

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class CartDTO:
    """Cart data transfer object."""

    user_id: int
    items: List[CartItemDTO]
    total_price: float
    total_items: int
    created_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        data = asdict(self)
        data['items'] = [item.to_dict() if hasattr(item, 'to_dict') else item for item in self.items]
        return data


@dataclass
class OrderItemDTO:
    """Order item data transfer object."""

    product_id: int
    product_title: str
    quantity: int
    price_at_purchase: float
    image_url: Optional[str]

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class OrderDTO:
    """Order summary data transfer object."""

    id: int
    status: str
    total_price: float
    created_at: datetime
    items_count: int

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class OrderDetailDTO:
    """Detailed order data transfer object."""

    id: int
    status: str
    total_price: float
    created_at: datetime
    updated_at: Optional[datetime]
    shipping_address: str
    items: List[OrderItemDTO]
    seller_id: Optional[int] = None
    seller_name: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        data = asdict(self)
        data['items'] = [item.to_dict() if hasattr(item, 'to_dict') else item for item in self.items]
        return data


@dataclass
class ChatMessageDTO:
    """Chat message data transfer object."""

    id: int
    sender_id: int
    sender_name: str
    sender_avatar: Optional[str]
    receiver_id: int
    message: str
    file_url: Optional[str]
    is_read: bool
    created_at: datetime

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ConversationDTO:
    """Recent conversation data transfer object."""

    user_id: int
    username: str
    avatar_url: Optional[str]
    last_message: str
    last_message_time: datetime
    unread_count: int

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class NotificationDTO:
    """Notification data transfer object."""

    id: int
    type: str
    title: str
    message: str
    link_url: Optional[str]
    is_read: bool
    created_at: datetime

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ReviewDTO:
    """Review data transfer object."""

    id: int
    product_id: int
    reviewer_id: int
    reviewer_name: str
    reviewer_avatar: Optional[str]
    rating: int
    comment: str
    created_at: datetime

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ApprovalDTO:
    """Product approval data transfer object."""

    id: int
    product_id: int
    product_title: str
    seller_id: int
    seller_name: str
    status: str
    reason: Optional[str]
    requested_at: datetime
    reviewed_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class CreateProductDTO:
    """DTO for product creation request."""

    title: str
    description: str
    price: float
    category_id: int
    stock: int
    location: Optional[str] = None


@dataclass
class UpdateProductDTO:
    """DTO for product update request."""

    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category_id: Optional[int] = None
    stock: Optional[int] = None
    location: Optional[str] = None


@dataclass
class CreateOrderDTO:
    """DTO for order creation request."""

    shipping_address: str
    city: str
    state: str
    zip_code: str
    phone: str


@dataclass
class UpdateProfileDTO:
    """DTO for profile update request."""

    full_name: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None


# ============================================================================
# Pydantic Input Validation Models (v2)
# ============================================================================
# These models provide automatic validation and sanitization for user inputs
# They should be used for request validation before passing data to business logic

if BaseModel is not None:

    class UserRegistrationInput(BaseModel):
        """Validate and sanitize user registration input."""

        email: str = Field(..., description="User email address")
        password: str = Field(
            ...,
            min_length=8,
            max_length=128,
            description="User password (min 8 chars)"
        )
        username: str = Field(
            ...,
            min_length=3,
            max_length=30,
            description="Username (3-30 chars, alphanumeric + underscore)"
        )
        full_name: str = Field(
            ...,
            min_length=2,
            max_length=255,
            description="User's full name"
        )

        @field_validator('password')
        @classmethod
        def validate_password_strength(cls, v: str) -> str:
            """Validate password strength requirements."""
            if not any(c.isupper() for c in v):
                raise ValueError('Password must contain at least one uppercase letter')
            if not any(c.islower() for c in v):
                raise ValueError('Password must contain at least one lowercase letter')
            if not any(c.isdigit() for c in v):
                raise ValueError('Password must contain at least one digit')
            return v

        @field_validator('username')
        @classmethod
        def validate_username_format(cls, v: str) -> str:
            """Validate username format."""
            import re
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', v):
                raise ValueError(
                    'Username can only contain letters, numbers, and underscores, '
                    'and must start with a letter or underscore'
                )
            return v.lower().strip()

        @field_validator('full_name')
        @classmethod
        def sanitize_full_name(cls, v: str) -> str:
            """Sanitize and validate full name."""
            import re
            v = v.strip()
            if not re.match(r"^[a-zA-Z\s\-']+$", v):
                raise ValueError(
                    'Full name can only contain letters, spaces, hyphens, and apostrophes'
                )
            return v

        @field_validator('email')
        @classmethod
        def normalize_email(cls, v: str) -> str:
            """Normalize email to lowercase."""
            return v.lower().strip()

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True


    class UserLoginInput(BaseModel):
        """Validate and sanitize user login input."""

        email: str = Field(..., description="User email address")
        password: str = Field(..., min_length=1, max_length=128, description="User password")

        @field_validator('email')
        @classmethod
        def normalize_email(cls, v: str) -> str:
            """Normalize email to lowercase."""
            return v.lower().strip()

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True


    class TokenRefreshInput(BaseModel):
        """Validate refresh token input."""

        refresh_token: str = Field(..., min_length=1, description="Refresh token")

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True


    class ProductCreateInput(BaseModel):
        """Validate and sanitize product creation input."""

        name: str = Field(
            ...,
            min_length=2,
            max_length=255,
            description="Product name"
        )
        description: str = Field(
            ...,
            min_length=10,
            max_length=5000,
            description="Product description"
        )
        price: Decimal = Field(
            ...,
            gt=Decimal('0'),
            max_digits=10,
            decimal_places=2,
            description="Product price"
        )
        category: str = Field(
            ...,
            min_length=1,
            max_length=100,
            description="Product category"
        )
        quantity: int = Field(
            default=1,
            ge=0,
            le=999999,
            description="Available quantity"
        )

        @field_validator('name')
        @classmethod
        def sanitize_name(cls, v: str) -> str:
            """Sanitize product name."""
            from backend.utils.sanitizers import HTMLSanitizer
            v = v.strip()
            v = HTMLSanitizer.strip_html_tags(v)
            return v

        @field_validator('description')
        @classmethod
        def sanitize_description(cls, v: str) -> str:
            """Sanitize product description."""
            from backend.utils.sanitizers import HTMLSanitizer
            v = v.strip()
            v = HTMLSanitizer.strip_html_tags(v)
            return v

        @field_validator('category')
        @classmethod
        def sanitize_category(cls, v: str) -> str:
            """Sanitize category."""
            return v.strip().lower()

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True


    class ProductUpdateInput(BaseModel):
        """Validate and sanitize product update input."""

        name: Optional[str] = Field(
            None,
            min_length=2,
            max_length=255,
            description="Product name"
        )
        description: Optional[str] = Field(
            None,
            min_length=10,
            max_length=5000,
            description="Product description"
        )
        price: Optional[Decimal] = Field(
            None,
            gt=Decimal('0'),
            max_digits=10,
            decimal_places=2,
            description="Product price"
        )
        category: Optional[str] = Field(
            None,
            min_length=1,
            max_length=100,
            description="Product category"
        )
        quantity: Optional[int] = Field(
            None,
            ge=0,
            le=999999,
            description="Available quantity"
        )

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True


    class ChatMessageInput(BaseModel):
        """Validate and sanitize chat message input."""

        recipient_id: str = Field(
            ...,
            min_length=1,
            max_length=36,
            description="Recipient user ID"
        )
        message: str = Field(
            ...,
            min_length=1,
            max_length=1000,
            description="Message content"
        )

        @field_validator('message')
        @classmethod
        def sanitize_message(cls, v: str) -> str:
            """Sanitize chat message."""
            from backend.utils.sanitizers import HTMLSanitizer
            v = v.strip()
            v = HTMLSanitizer.strip_html_tags(v)
            return v

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True


    class UserProfileUpdateInput(BaseModel):
        """Validate and sanitize user profile update input."""

        full_name: Optional[str] = Field(
            None,
            min_length=2,
            max_length=255,
            description="User's full name"
        )
        bio: Optional[str] = Field(
            None,
            max_length=500,
            description="User biography"
        )
        location: Optional[str] = Field(
            None,
            max_length=100,
            description="User location"
        )
        phone: Optional[str] = Field(
            None,
            max_length=20,
            description="User phone number"
        )
        avatar_url: Optional[str] = Field(
            None,
            max_length=500,
            description="Avatar image URL"
        )

        @field_validator('full_name')
        @classmethod
        def sanitize_full_name(cls, v: Optional[str]) -> Optional[str]:
            """Sanitize full name."""
            if v is None:
                return v
            import re
            v = v.strip()
            if not re.match(r"^[a-zA-Z\s\-']+$", v):
                raise ValueError(
                    'Full name can only contain letters, spaces, hyphens, and apostrophes'
                )
            return v

        @field_validator('bio')
        @classmethod
        def sanitize_bio(cls, v: Optional[str]) -> Optional[str]:
            """Sanitize bio."""
            if v is None:
                return v
            from backend.utils.sanitizers import HTMLSanitizer
            v = v.strip()
            v = HTMLSanitizer.strip_html_tags(v)
            return v

        @field_validator('location')
        @classmethod
        def sanitize_location(cls, v: Optional[str]) -> Optional[str]:
            """Sanitize location."""
            if v is None:
                return v
            return v.strip()

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True


    class ReviewCreateInput(BaseModel):
        """Validate and sanitize review creation input."""

        product_id: str = Field(
            ...,
            min_length=1,
            max_length=36,
            description="Product ID being reviewed"
        )
        rating: int = Field(
            ...,
            ge=1,
            le=5,
            description="Rating (1-5)"
        )
        title: str = Field(
            ...,
            min_length=2,
            max_length=200,
            description="Review title"
        )
        text: str = Field(
            ...,
            min_length=10,
            max_length=1000,
            description="Review text"
        )

        @field_validator('title')
        @classmethod
        def sanitize_title(cls, v: str) -> str:
            """Sanitize review title."""
            from backend.utils.sanitizers import HTMLSanitizer
            v = v.strip()
            v = HTMLSanitizer.strip_html_tags(v)
            return v

        @field_validator('text')
        @classmethod
        def sanitize_text(cls, v: str) -> str:
            """Sanitize review text."""
            from backend.utils.sanitizers import HTMLSanitizer
            v = v.strip()
            v = HTMLSanitizer.strip_html_tags(v)
            return v

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True


    class SearchInput(BaseModel):
        """Validate and sanitize search input."""

        query: str = Field(
            ...,
            min_length=1,
            max_length=500,
            description="Search query"
        )
        category: Optional[str] = Field(
            None,
            max_length=100,
            description="Filter by category"
        )
        min_price: Optional[Decimal] = Field(
            None,
            ge=Decimal('0'),
            description="Minimum price"
        )
        max_price: Optional[Decimal] = Field(
            None,
            ge=Decimal('0'),
            description="Maximum price"
        )
        page: int = Field(
            default=1,
            ge=1,
            description="Page number for pagination"
        )
        limit: int = Field(
            default=10,
            ge=1,
            le=100,
            description="Items per page (max 100)"
        )

        @field_validator('query')
        @classmethod
        def sanitize_query(cls, v: str) -> str:
            """Sanitize search query."""
            v = v.strip()
            import re
            v = re.sub(r'\s+', ' ', v)
            return v

        class Config:
            """Pydantic config."""
            str_strip_whitespace = True
