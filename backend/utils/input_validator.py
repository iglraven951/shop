"""Comprehensive input validation utilities for DiscoveryShop.

Provides a centralized InputValidator class with static methods
for validating various types of user inputs.
"""

import re
import logging
import uuid
from typing import Optional, Dict, Any, Tuple
from decimal import Decimal

logger = logging.getLogger(__name__)


class InputValidator:
    """Centralized input validation class."""

    # RFC 5322 compliant email pattern (simplified)
    EMAIL_PATTERN = re.compile(
        r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    )

    # UUID pattern (v4)
    UUID_PATTERN = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        re.IGNORECASE
    )

    # URL pattern
    URL_PATTERN = re.compile(
        r'^https?://[^\s/$.?#].[^\s]*$',
        re.IGNORECASE
    )

    @staticmethod
    def validate_email(email: str) -> Tuple[bool, Optional[str]]:
        """Validate email format.

        Args:
            email: Email address to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not email or not isinstance(email, str):
            return False, "Email is required"

        email = email.strip().lower()

        if len(email) > 254:  # RFC 5321
            return False, "Email is too long"

        if not InputValidator.EMAIL_PATTERN.match(email):
            return False, "Invalid email format"

        return True, None

    @staticmethod
    def validate_password(password: str) -> Tuple[bool, Optional[str]]:
        """Validate password strength.

        Requirements:
        - Minimum 8 characters
        - At least one uppercase letter
        - At least one lowercase letter
        - At least one digit
        - At least one special character (optional but recommended)

        Args:
            password: Password to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not password:
            return False, "Password is required"

        if not isinstance(password, str):
            return False, "Password must be a string"

        if len(password) < 8:
            return False, "Password must be at least 8 characters"

        if len(password) > 128:
            return False, "Password must be less than 128 characters"

        if not any(c.isupper() for c in password):
            return False, "Password must contain at least one uppercase letter"

        if not any(c.islower() for c in password):
            return False, "Password must contain at least one lowercase letter"

        if not any(c.isdigit() for c in password):
            return False, "Password must contain at least one digit"

        return True, None

    @staticmethod
    def validate_username(username: str) -> Tuple[bool, Optional[str]]:
        """Validate username format.

        Requirements:
        - 3-30 characters
        - Only alphanumeric characters, underscores, and hyphens
        - Must start with letter or underscore

        Args:
            username: Username to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not username or not isinstance(username, str):
            return False, "Username is required"

        username = username.strip()

        if len(username) < 3:
            return False, "Username must be at least 3 characters"

        if len(username) > 30:
            return False, "Username must be less than 30 characters"

        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', username):
            return False, (
                "Username must start with a letter or underscore, "
                "and contain only letters, numbers, and underscores"
            )

        return True, None

    @staticmethod
    def validate_uuid(value: str) -> Tuple[bool, Optional[str]]:
        """Validate UUID format.

        Args:
            value: Value to validate as UUID

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not value or not isinstance(value, str):
            return False, "UUID is required"

        try:
            uuid.UUID(value)
            return True, None
        except (ValueError, AttributeError):
            return False, "Invalid UUID format"

    @staticmethod
    def validate_text_length(
        text: str,
        min_length: int = 1,
        max_length: int = 10000,
        field_name: str = "Text"
    ) -> Tuple[bool, Optional[str]]:
        """Validate text length bounds.

        Args:
            text: Text to validate
            min_length: Minimum allowed length
            max_length: Maximum allowed length
            field_name: Field name for error message

        Returns:
            Tuple of (is_valid, error_message)
        """
        if text is None:
            if min_length == 0:
                return True, None
            return False, f"{field_name} is required"

        if not isinstance(text, str):
            return False, f"{field_name} must be a string"

        length = len(text.strip())

        if length < min_length:
            return False, f"{field_name} must be at least {min_length} characters"

        if length > max_length:
            return False, f"{field_name} must be less than {max_length} characters"

        return True, None

    @staticmethod
    def validate_price(value: Any) -> Tuple[bool, Optional[str]]:
        """Validate product price.

        Args:
            value: Price value to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if value is None:
            return False, "Price is required"

        try:
            if isinstance(value, str):
                price = Decimal(value)
            elif isinstance(value, (int, float)):
                price = Decimal(str(value))
            else:
                return False, "Price must be a number"

            if price <= Decimal('0'):
                return False, "Price must be greater than 0"

            if price > Decimal('999999.99'):
                return False, "Price exceeds maximum allowed value (999999.99)"

            # Check decimal places
            if price.as_tuple().exponent < -2:
                return False, "Price can have at most 2 decimal places"

            return True, None

        except Exception as e:
            logger.warning(f"Price validation error: {e}")
            return False, "Invalid price format"

    @staticmethod
    def validate_quantity(value: Any) -> Tuple[bool, Optional[str]]:
        """Validate product quantity.

        Args:
            value: Quantity value to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if value is None:
            return False, "Quantity is required"

        try:
            if isinstance(value, str):
                quantity = int(value)
            elif isinstance(value, int):
                quantity = value
            else:
                return False, "Quantity must be an integer"

            if quantity < 0:
                return False, "Quantity cannot be negative"

            if quantity > 999999:
                return False, "Quantity exceeds maximum allowed value (999999)"

            return True, None

        except ValueError:
            return False, "Quantity must be an integer"

    @staticmethod
    def validate_rating(value: Any) -> Tuple[bool, Optional[str]]:
        """Validate review rating.

        Args:
            value: Rating value to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if value is None:
            return False, "Rating is required"

        try:
            if isinstance(value, str):
                rating = int(value)
            elif isinstance(value, int):
                rating = value
            else:
                return False, "Rating must be an integer"

            if rating < 1 or rating > 5:
                return False, "Rating must be between 1 and 5"

            return True, None

        except ValueError:
            return False, "Rating must be an integer between 1 and 5"

    @staticmethod
    def validate_url(url: str) -> Tuple[bool, Optional[str]]:
        """Validate URL format.

        Args:
            url: URL to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not url or not isinstance(url, str):
            return False, "URL is required"

        url = url.strip()

        if len(url) > 2048:  # Max URL length
            return False, "URL is too long"

        # Block dangerous protocols
        dangerous_protocols = ['javascript:', 'data:', 'vbscript:', 'file:']
        url_lower = url.lower()
        for protocol in dangerous_protocols:
            if url_lower.startswith(protocol):
                return False, f"URL contains dangerous protocol: {protocol}"

        # Check for valid URL format (basic)
        if url.startswith('http://') or url.startswith('https://'):
            if InputValidator.URL_PATTERN.match(url):
                return True, None
            return False, "Invalid URL format"

        # Allow relative URLs
        if url.startswith('/') or url.startswith('./') or url.startswith('../'):
            return True, None

        return False, "URL must start with http://, https://, or a relative path (/)"

    @staticmethod
    def validate_phone(phone: str) -> Tuple[bool, Optional[str]]:
        """Validate phone number format.

        Args:
            phone: Phone number to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not phone or not isinstance(phone, str):
            return False, "Phone number is required"

        # Remove common formatting characters
        cleaned = re.sub(r'[\s\-\(\)\+]', '', phone)

        if not cleaned.isdigit():
            return False, "Phone number must contain only digits"

        if len(cleaned) < 10 or len(cleaned) > 15:
            return False, "Phone number must be between 10-15 digits"

        return True, None

    @staticmethod
    def validate_category(category: str, allowed_categories: Optional[list] = None) -> Tuple[bool, Optional[str]]:
        """Validate product category.

        Args:
            category: Category to validate
            allowed_categories: List of allowed categories (None for no restrictions)

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not category or not isinstance(category, str):
            return False, "Category is required"

        category = category.strip()

        if len(category) < 1:
            return False, "Category cannot be empty"

        if len(category) > 100:
            return False, "Category must be less than 100 characters"

        # Check for dangerous content
        if re.search(r'[<>"\']', category):
            return False, "Category contains invalid characters"

        if allowed_categories and category.lower() not in [c.lower() for c in allowed_categories]:
            return False, f"Invalid category. Allowed: {', '.join(allowed_categories)}"

        return True, None

    @staticmethod
    def validate_required_fields(
        data: Dict[str, Any],
        required_fields: list
    ) -> Tuple[bool, Optional[list]]:
        """Validate that all required fields are present.

        Args:
            data: Dictionary of data to validate
            required_fields: List of required field names

        Returns:
            Tuple of (is_valid, missing_fields)
        """
        if not isinstance(data, dict):
            return False, ["Invalid request data"]

        missing = [f for f in required_fields if f not in data or data[f] is None]

        if missing:
            return False, missing

        return True, None

    @staticmethod
    def validate_field_types(
        data: Dict[str, Any],
        field_types: Dict[str, type]
    ) -> Tuple[bool, Optional[Dict[str, str]]]:
        """Validate field types.

        Args:
            data: Dictionary of data to validate
            field_types: Dictionary mapping field names to expected types

        Returns:
            Tuple of (is_valid, error_dict)
        """
        errors = {}

        for field, expected_type in field_types.items():
            if field not in data:
                continue

            value = data[field]
            if value is None:
                continue

            if not isinstance(value, expected_type):
                errors[field] = f"Expected {expected_type.__name__}, got {type(value).__name__}"

        if errors:
            return False, errors

        return True, None

    @staticmethod
    def sanitize_and_validate(
        data: Dict[str, Any],
        schema: Dict[str, Dict[str, Any]]
    ) -> Tuple[bool, Optional[Dict[str, Any]], Optional[Dict[str, str]]]:
        """Sanitize and validate input data against a schema.

        Schema format:
        {
            'field_name': {
                'type': str,
                'required': True,
                'min_length': 1,
                'max_length': 100,
                'pattern': r'^[a-z]+$',
            }
        }

        Args:
            data: Input data to validate
            schema: Validation schema

        Returns:
            Tuple of (is_valid, sanitized_data, errors)
        """
        sanitized = {}
        errors = {}

        for field, rules in schema.items():
            if field not in data:
                if rules.get('required', False):
                    errors[field] = f"{field} is required"
                continue

            value = data[field]

            # Type check
            expected_type = rules.get('type')
            if expected_type and value is not None:
                if not isinstance(value, expected_type):
                    errors[field] = f"Must be {expected_type.__name__}"
                    continue

            # Length check
            if isinstance(value, str):
                value = value.strip()

                min_len = rules.get('min_length', 0)
                max_len = rules.get('max_length', 10000)

                if len(value) < min_len:
                    errors[field] = f"Must be at least {min_len} characters"
                    continue

                if len(value) > max_len:
                    errors[field] = f"Must be less than {max_len} characters"
                    continue

                # Pattern check
                pattern = rules.get('pattern')
                if pattern and not re.match(pattern, value):
                    errors[field] = f"Invalid format for {field}"
                    continue

            sanitized[field] = value

        if errors:
            return False, None, errors

        return True, sanitized, None
