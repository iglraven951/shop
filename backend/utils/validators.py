"""Input validators for DiscoveryShop marketplace."""

import re
from typing import Optional, Dict, Any
from backend.utils.constants import ALLOWED_IMAGE_FORMATS, MAX_FILE_SIZE


def validate_email(email: str) -> bool:
    """Validate email format.

    Args:
        email: Email string to validate

    Returns:
        True if email is valid format, False otherwise
    """
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


def validate_password(password: str) -> tuple[bool, str]:
    """Validate password strength.

    Requirements:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one number

    Args:
        password: Password string to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"

    if not re.search(r"\d", password):
        return False, "Password must contain at least one number"

    return True, ""


def validate_product_title(title: str) -> tuple[bool, str]:
    """Validate product title.

    Requirements:
    - Between 2-200 characters
    - No leading/trailing whitespace

    Args:
        title: Product title to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    title = title.strip()

    if len(title) < 2:
        return False, "Product title must be at least 2 characters"

    if len(title) > 200:
        return False, "Product title must not exceed 200 characters"

    return True, ""


def validate_price(price: float) -> tuple[bool, str]:
    """Validate product price.

    Requirements:
    - Must be positive number
    - Maximum 2 decimal places

    Args:
        price: Price value to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(price, (int, float)):
        return False, "Price must be a number"

    if price <= 0:
        return False, "Price must be greater than 0"

    if price > 999999.99:
        return False, "Price exceeds maximum allowed value"

    return True, ""


def validate_phone(phone: str) -> tuple[bool, str]:
    """Validate phone number in international format.

    Accepts formats like: +1234567890, +1 (234) 567-8900, etc.

    Args:
        phone: Phone number to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Remove common formatting characters
    cleaned = re.sub(r"[\s\-\(\)\+]", "", phone)

    if not cleaned.isdigit():
        return False, "Phone number must contain only digits and standard formatting"

    if len(cleaned) < 10 or len(cleaned) > 15:
        return False, "Phone number must be between 10-15 digits"

    return True, ""


def validate_image_file(file: Any) -> tuple[bool, str]:
    """Validate image file upload.

    Requirements:
    - File size <= 5MB
    - Format must be jpg, jpeg, png, or webp
    - Filename must not be empty

    Args:
        file: File object from Flask request

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not file or not file.filename:
        return False, "No file provided"

    # Check file size
    file.seek(0, 2)  # Seek to end
    file_size = file.tell()
    file.seek(0)  # Reset to beginning

    if file_size > MAX_FILE_SIZE:
        return False, f"File size exceeds {MAX_FILE_SIZE / 1024 / 1024}MB limit"

    # Check file extension
    filename = file.filename.lower()
    file_ext = filename.rsplit(".", 1)[-1] if "." in filename else ""

    if file_ext not in ALLOWED_IMAGE_FORMATS:
        return False, f"File format must be one of {', '.join(ALLOWED_IMAGE_FORMATS)}"

    return True, ""


def validate_shipping_address(address: Dict[str, Any]) -> tuple[bool, str]:
    """Validate shipping address completeness.

    Required fields:
    - street: Street address
    - city: City name
    - state: State/Province
    - postal_code: Postal/ZIP code
    - country: Country name

    Args:
        address: Dictionary containing address fields

    Returns:
        Tuple of (is_valid, error_message)
    """
    required_fields = ["street", "city", "state", "postal_code", "country"]

    for field in required_fields:
        if field not in address or not address[field] or not str(address[field]).strip():
            return False, f"Missing required field: {field}"

    # Validate postal code format (basic validation)
    postal_code = str(address.get("postal_code", "")).strip()
    if not re.match(r"^[a-zA-Z0-9\s\-]+$", postal_code):
        return False, "Invalid postal code format"

    return True, ""


def validate_username(username: str) -> tuple[bool, str]:
    """Validate username format.

    Requirements:
    - 3-30 characters
    - Only alphanumeric, underscores, and hyphens
    - Must start with letter or number

    Args:
        username: Username to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(username) < 3:
        return False, "Username must be at least 3 characters"

    if len(username) > 30:
        return False, "Username must not exceed 30 characters"

    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9_\-]*$", username):
        return False, "Username must contain only letters, numbers, underscores, and hyphens"

    return True, ""


def validate_full_name(full_name: str) -> tuple[bool, str]:
    """Validate full name format.

    Requirements:
    - 2-100 characters
    - Can contain letters, spaces, hyphens, and apostrophes

    Args:
        full_name: Full name to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    full_name = full_name.strip()

    if len(full_name) < 2:
        return False, "Full name must be at least 2 characters"

    if len(full_name) > 100:
        return False, "Full name must not exceed 100 characters"

    if not re.match(r"^[a-zA-Z\s\-']+$", full_name):
        return False, "Full name can only contain letters, spaces, hyphens, and apostrophes"

    return True, ""


def validate_product_description(description: str) -> tuple[bool, str]:
    """Validate product description.

    Requirements:
    - Minimum 10 characters
    - Maximum 5000 characters

    Args:
        description: Product description to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    description = description.strip()

    if len(description) < 10:
        return False, "Product description must be at least 10 characters"

    if len(description) > 5000:
        return False, "Product description must not exceed 5000 characters"

    return True, ""


def validate_review_rating(rating: int) -> tuple[bool, str]:
    """Validate review rating.

    Requirements:
    - Must be integer between 1-5

    Args:
        rating: Rating value to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(rating, int):
        return False, "Rating must be an integer"

    if rating < 1 or rating > 5:
        return False, "Rating must be between 1 and 5"

    return True, ""


def validate_review_text(review_text: str) -> tuple[bool, str]:
    """Validate review text.

    Requirements:
    - Minimum 10 characters
    - Maximum 1000 characters

    Args:
        review_text: Review text to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    review_text = review_text.strip()

    if len(review_text) < 10:
        return False, "Review must be at least 10 characters"

    if len(review_text) > 1000:
        return False, "Review must not exceed 1000 characters"

    return True, ""


def validate_product_quantity(quantity: int) -> tuple[bool, str]:
    """Validate product quantity.

    Requirements:
    - Must be positive integer
    - Maximum 999999

    Args:
        quantity: Quantity to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(quantity, int):
        return False, "Quantity must be an integer"

    if quantity <= 0:
        return False, "Quantity must be greater than 0"

    if quantity > 999999:
        return False, "Quantity exceeds maximum allowed value"

    return True, ""
