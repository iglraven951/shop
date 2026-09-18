"""Reusable validators for DiscoveryShop application."""

import re
import logging
from typing import Any, Dict, List, Tuple

from backend.exceptions import ValidationException

logger = logging.getLogger(__name__)


class UserValidator:
    """Validators for user-related data."""

    EMAIL_PATTERN = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    @staticmethod
    def validate_email(email: str) -> str:
        """Validate and normalize email address."""
        if not email or not isinstance(email, str):
            raise ValidationException("Email is required and must be a string")

        email = email.strip().lower()
        if len(email) > 255 or not re.match(UserValidator.EMAIL_PATTERN, email):
            raise ValidationException("Invalid email format")

        return email

    @staticmethod
    def validate_password(password: str) -> str:
        """Validate password strength (8+ chars, uppercase, lowercase, digit, special)."""
        if not password or not isinstance(password, str):
            raise ValidationException("Password is required")

        if not (8 <= len(password) <= 128):
            raise ValidationException("Password must be 8-128 characters")

        checks = [
            (any(c.isupper() for c in password), "uppercase letter"),
            (any(c.islower() for c in password), "lowercase letter"),
            (any(c.isdigit() for c in password), "digit"),
            (any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password), "special character"),
        ]

        for check, char_type in checks:
            if not check:
                raise ValidationException(f"Password must contain at least one {char_type}")

        return password

    @staticmethod
    def validate_username(username: str) -> str:
        """Validate username (3-50 chars, alphanumeric + underscores)."""
        if not username or not isinstance(username, str):
            raise ValidationException("Username is required")

        username = username.strip()
        if not (3 <= len(username) <= 50) or not re.match(r'^[a-zA-Z0-9_]+$', username):
            raise ValidationException("Username must be 3-50 chars (letters, digits, underscores)")

        return username

    @staticmethod
    def validate_full_name(name: str) -> str:
        """Validate full name (2-255 chars, letters/spaces/hyphens/apostrophes)."""
        if not name or not isinstance(name, str):
            raise ValidationException("Full name is required")

        name = name.strip()
        if not (2 <= len(name) <= 255) or not re.match(r"^[a-zA-Z\s\-']+$", name):
            raise ValidationException("Full name must be 2-255 chars (letters, spaces, hyphens, apostrophes)")

        return name


class ProductValidator:
    """Validators for product-related data."""

    @staticmethod
    def validate_title(title: str) -> str:
        """Validate product title (3-255 chars)."""
        if not title or not isinstance(title, str):
            raise ValidationException("Title is required")

        title = title.strip()
        if not (3 <= len(title) <= 255):
            raise ValidationException("Title must be 3-255 characters")

        return title

    @staticmethod
    def validate_description(description: str) -> str:
        """Validate product description (10-5000 chars)."""
        if not description or not isinstance(description, str):
            raise ValidationException("Description is required")

        description = description.strip()
        if not (10 <= len(description) <= 5000):
            raise ValidationException("Description must be 10-5000 characters")

        return description

    @staticmethod
    def validate_price(price: float) -> float:
        """Validate product price (0.01 - 999999.99)."""
        try:
            price = float(price)
        except (ValueError, TypeError):
            raise ValidationException("Price must be a number")

        if not (0.01 <= price <= 999999.99):
            raise ValidationException("Price must be between 0.01 and 999999.99")

        return round(price, 2)

    @staticmethod
    def validate_stock(stock: int) -> int:
        """Validate product stock (0 - 999999)."""
        try:
            stock = int(stock)
        except (ValueError, TypeError):
            raise ValidationException("Stock must be an integer")

        if not (0 <= stock <= 999999):
            raise ValidationException("Stock must be between 0 and 999999")

        return stock

    @staticmethod
    def validate_category(category_id: str) -> str:
        """Validate category ID."""
        if not category_id or not isinstance(category_id, str):
            raise ValidationException("Category ID is required")

        return category_id.strip()


class OrderValidator:
    """Validators for order-related data."""

    @staticmethod
    def validate_order_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate order items (1-100 items, each with product_id and quantity)."""
        if not items or not isinstance(items, list) or len(items) > 100:
            raise ValidationException("Order must have 1-100 items")

        for idx, item in enumerate(items):
            if not isinstance(item, dict) or 'product_id' not in item or 'quantity' not in item:
                raise ValidationException(f"Item {idx} missing product_id or quantity")

            OrderValidator.validate_quantity(item['quantity'])

        return items

    @staticmethod
    def validate_quantity(quantity: int) -> int:
        """Validate item quantity (1 - 1000)."""
        try:
            quantity = int(quantity)
        except (ValueError, TypeError):
            raise ValidationException("Quantity must be an integer")

        if not (1 <= quantity <= 1000):
            raise ValidationException("Quantity must be between 1 and 1000")

        return quantity

    @staticmethod
    def validate_shipping_address(address: Dict[str, Any]) -> Dict[str, Any]:
        """Validate shipping address (requires street, city, state, zip_code, country)."""
        if not address or not isinstance(address, dict):
            raise ValidationException("Shipping address is required")

        required = ['street', 'city', 'state', 'zip_code', 'country']
        missing = [f for f in required if f not in address or not address[f]]

        if missing:
            raise ValidationException(f"Address missing: {', '.join(missing)}")

        return address


class FileValidator:
    """Validators for file uploads."""

    ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
    MAX_SIZE = 5 * 1024 * 1024

    @staticmethod
    def validate_image_file(file: Any, max_size: int = None) -> str:
        """Validate image file (jpg, jpeg, png, webp; max 5MB)."""
        max_size = max_size or FileValidator.MAX_SIZE

        if not file or not hasattr(file, 'filename') or not file.filename.strip():
            raise ValidationException("No file provided")

        ext = FileValidator.get_file_extension(file.filename)
        if ext not in FileValidator.ALLOWED_EXTENSIONS:
            raise ValidationException(f"Allowed types: {', '.join(FileValidator.ALLOWED_EXTENSIONS)}")

        file.seek(0, 2)
        size = file.tell()
        file.seek(0)

        if size > max_size:
            raise ValidationException(f"File exceeds {max_size / (1024*1024):.0f}MB limit")

        return ext

    @staticmethod
    def validate_filename(filename: str) -> str:
        """Validate filename (no path traversal, max 255 chars)."""
        if not filename or not isinstance(filename, str):
            raise ValidationException("Filename is required")

        filename = filename.strip()
        if len(filename) > 255 or '..' in filename or '/' in filename or '\\' in filename:
            raise ValidationException("Invalid filename")

        return filename

    @staticmethod
    def get_file_extension(filename: str) -> str:
        """Extract file extension (lowercase, without dot)."""
        if '.' not in filename:
            raise ValidationException("File must have extension")

        ext = filename.rsplit('.', 1)[-1].lower()
        if not ext or len(ext) > 10:
            raise ValidationException("Invalid file extension")

        return ext


class PaginationValidator:
    """Validators for pagination parameters."""

    DEFAULT_LIMIT = 20
    MAX_LIMIT = 100

    @staticmethod
    def validate_pagination(page: int, limit: int) -> Tuple[int, int]:
        """Validate pagination (page >= 1, 1 <= limit <= 100)."""
        page = max(1, int(page)) if isinstance(page, (int, str)) else 1
        limit = int(limit) if isinstance(limit, (int, str)) else PaginationValidator.DEFAULT_LIMIT

        limit = max(1, min(limit, PaginationValidator.MAX_LIMIT))

        return page, limit

    @staticmethod
    def extract_pagination(request: Any) -> Tuple[int, int]:
        """Extract pagination from Flask request.args."""
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=PaginationValidator.DEFAULT_LIMIT, type=int)

        return PaginationValidator.validate_pagination(page, limit)


class SearchValidator:
    """Validators for search and filter parameters."""

    @staticmethod
    def validate_search_query(query: str, min_len: int = 1, max_len: int = 255) -> str:
        """Validate search query (1-255 chars)."""
        if not query or not isinstance(query, str):
            raise ValidationException("Search query is required")

        query = query.strip()
        if not (min_len <= len(query) <= max_len):
            raise ValidationException(f"Query must be {min_len}-{max_len} characters")

        return query

    @staticmethod
    def validate_sort_param(sort: str, allowed: List[str]) -> str:
        """Validate sort parameter against allowed values (supports - prefix for desc)."""
        if not sort or not isinstance(sort, str):
            return allowed[0] if allowed else None

        sort_field = sort.lstrip('-').strip()
        if sort_field not in allowed:
            raise ValidationException(f"Invalid sort. Allowed: {', '.join(allowed)}")

        return sort

    @staticmethod
    def validate_filters(filters: Dict[str, Any], allowed_keys: List[str]) -> Dict[str, Any]:
        """Validate filter keys against allowed list."""
        if not filters:
            return {}

        if not isinstance(filters, dict):
            raise ValidationException("Filters must be a dictionary")

        return {k: v for k, v in filters.items() if k in allowed_keys and v is not None}
