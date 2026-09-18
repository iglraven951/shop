"""Helper functions for DiscoveryShop marketplace."""

import uuid
import os
import math
import html
from datetime import datetime
from typing import Optional, List
from pathlib import Path


def format_currency(amount: float, currency: str = "USD") -> str:
    """Format amount as currency string.

    Args:
        amount: Numeric amount to format
        currency: Currency code (default: USD)

    Returns:
        Formatted currency string (e.g., "$99.99", "₹999.00")
    """
    symbols = {
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "INR": "₹",
        "JPY": "¥",
    }

    symbol = symbols.get(currency, currency)
    return f"{symbol}{amount:,.2f}"


def format_date(date: Optional[datetime], format_str: str = "%B %d, %Y") -> str:
    """Format datetime as readable string.

    Args:
        date: DateTime object to format
        format_str: Python datetime format string

    Returns:
        Formatted date string (e.g., "September 14, 2026")
    """
    if not date:
        return "N/A"

    if isinstance(date, str):
        date = datetime.fromisoformat(date)

    return date.strftime(format_str)


def format_time_ago(date: Optional[datetime]) -> str:
    """Format datetime as relative time string.

    Args:
        date: DateTime object to format

    Returns:
        Relative time string (e.g., "2 hours ago", "3 days ago")
    """
    if not date:
        return "Unknown"

    if isinstance(date, str):
        date = datetime.fromisoformat(date)

    now = datetime.utcnow()
    delta = now - date

    seconds = delta.total_seconds()

    if seconds < 60:
        return "Just now"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    elif seconds < 2592000:
        days = int(seconds / 86400)
        return f"{days} day{'s' if days > 1 else ''} ago"
    else:
        months = int(seconds / 2592000)
        return f"{months} month{'s' if months > 1 else ''} ago"


def calculate_rating_average(reviews: List[dict]) -> float:
    """Calculate average rating from review list.

    Args:
        reviews: List of review dictionaries with 'rating' key

    Returns:
        Average rating as float (rounded to 2 decimals)
    """
    if not reviews:
        return 0.0

    total = sum(review.get("rating", 0) for review in reviews)
    average = total / len(reviews)

    return round(average, 2)


def generate_order_id() -> str:
    """Generate unique order ID.

    Format: ORD-{timestamp}-{random}
    Example: ORD-20260914-abc123def456

    Returns:
        Unique order ID string
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d")
    random_part = uuid.uuid4().hex[:12]
    return f"ORD-{timestamp}-{random_part}"


def generate_slug(title: str) -> str:
    """Generate URL-friendly slug from title.

    Converts to lowercase, replaces spaces with hyphens, removes special chars.
    Example: "Amazing Product!" -> "amazing-product"

    Args:
        title: Title string to convert

    Returns:
        URL-friendly slug string
    """
    import re

    # Convert to lowercase
    slug = title.lower()

    # Replace spaces and underscores with hyphens
    slug = re.sub(r"[\s_]+", "-", slug)

    # Remove special characters except hyphens
    slug = re.sub(r"[^a-z0-9\-]", "", slug)

    # Remove multiple consecutive hyphens
    slug = re.sub(r"-+", "-", slug)

    # Remove leading/trailing hyphens
    slug = slug.strip("-")

    return slug


def get_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two geographic coordinates using Haversine formula.

    Args:
        lat1: Latitude of first point
        lon1: Longitude of first point
        lat2: Latitude of second point
        lon2: Longitude of second point

    Returns:
        Distance in kilometers (rounded to 2 decimals)
    """
    from math import radians, cos, sin, asin, sqrt

    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])

    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1

    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))

    # Radius of earth in kilometers
    km = 6371 * c

    return round(km, 2)


def sanitize_html(text: str) -> str:
    """Remove/escape HTML tags for XSS prevention.

    Escapes dangerous characters while preserving text content.

    Args:
        text: Text that may contain HTML

    Returns:
        Sanitized text safe for HTML display
    """
    if not text:
        return ""

    # Escape HTML special characters
    return html.escape(text)


def generate_unique_filename(original_filename: str) -> str:
    """Generate unique filename preserving extension.

    Args:
        original_filename: Original filename

    Returns:
        Unique filename (e.g., "abc123def456_originalname.jpg")
    """
    if not original_filename:
        return uuid.uuid4().hex

    # Get file extension
    _, ext = os.path.splitext(original_filename)

    # Generate unique prefix
    unique_prefix = uuid.uuid4().hex[:16]

    # Get original filename without extension
    base_name = os.path.splitext(original_filename)[0]

    # Sanitize original name
    base_name = sanitize_filename(base_name)

    return f"{unique_prefix}_{base_name}{ext}"


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to safe characters only.

    Removes special characters and spaces.

    Args:
        filename: Filename to sanitize

    Returns:
        Sanitized filename
    """
    import re

    # Replace spaces and special chars with underscore
    filename = re.sub(r"[^\w\-\.]", "_", filename)

    # Remove multiple underscores
    filename = re.sub(r"_+", "_", filename)

    return filename


def truncate_text(text: str, max_length: int = 100, suffix: str = "...") -> str:
    """Truncate text to maximum length.

    Args:
        text: Text to truncate
        max_length: Maximum length (default: 100)
        suffix: Suffix to add if truncated (default: "...")

    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text

    return text[: max_length - len(suffix)] + suffix


def chunk_list(items: list, chunk_size: int) -> list[list]:
    """Split list into chunks of specified size.

    Args:
        items: List to chunk
        chunk_size: Size of each chunk

    Returns:
        List of chunks
    """
    return [items[i : i + chunk_size] for i in range(0, len(items), chunk_size)]


def paginate(items: list, page: int = 1, per_page: int = 20) -> dict:
    """Paginate list of items.

    Args:
        items: List to paginate
        page: Page number (1-indexed)
        per_page: Items per page

    Returns:
        Dict with paginated results and pagination info
    """
    total = len(items)
    total_pages = math.ceil(total / per_page)

    # Validate page number
    if page < 1:
        page = 1
    if page > total_pages and total > 0:
        page = total_pages

    start = (page - 1) * per_page
    end = start + per_page

    return {
        "items": items[start:end],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }


def calculate_discount_price(original_price: float, discount_percent: float) -> float:
    """Calculate discounted price.

    Args:
        original_price: Original price
        discount_percent: Discount percentage (0-100)

    Returns:
        Discounted price
    """
    if discount_percent < 0 or discount_percent > 100:
        return original_price

    discount_amount = original_price * (discount_percent / 100)
    return round(original_price - discount_amount, 2)


def calculate_discount_percent(original_price: float, discounted_price: float) -> float:
    """Calculate discount percentage.

    Args:
        original_price: Original price
        discounted_price: Discounted price

    Returns:
        Discount percentage (0-100)
    """
    if original_price <= 0:
        return 0.0

    discount_percent = ((original_price - discounted_price) / original_price) * 100
    return round(max(0, min(100, discount_percent)), 2)


def get_file_size_display(bytes_size: int) -> str:
    """Convert bytes to human-readable format.

    Args:
        bytes_size: Size in bytes

    Returns:
        Human-readable size (e.g., "2.5 MB")
    """
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_size < 1024:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024

    return f"{bytes_size:.2f} TB"


def is_valid_uuid(value: str) -> bool:
    """Check if string is valid UUID.

    Args:
        value: String to check

    Returns:
        True if valid UUID, False otherwise
    """
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


def merge_dicts(*dicts) -> dict:
    """Merge multiple dictionaries.

    Later dictionaries override earlier ones.

    Args:
        dicts: Variable number of dictionaries

    Returns:
        Merged dictionary
    """
    result = {}
    for d in dicts:
        if isinstance(d, dict):
            result.update(d)
    return result
