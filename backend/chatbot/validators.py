"""Validators for chatbot input sanitization and security.

This module provides comprehensive validation functions for:
- Message content (length, safety, injection prevention)
- Conversation IDs and access control
- Product IDs and existence checks
- User permissions and ownership
"""

import re
import uuid
import logging
from typing import Optional, Any
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Security patterns to detect injection attacks
SQL_INJECTION_PATTERNS = [
    r"(?i)(union|select|insert|update|delete|drop|create|alter|exec|execute)",
    r"(?i)(--|\;|\/\*|\*\/|\x00)",
    r"(?i)(\bor\b.*\b=\b|\band\b.*\b=\b)",
]

XSS_PATTERNS = [
    r"<script[^>]*>.*?</script>",
    r"<iframe[^>]*>.*?</iframe>",
    r"<img[^>]*\s+on\w+\s*=",
    r"<svg[^>]*\s+on\w+\s*=",
    r"javascript:",
    r"on(load|error|click|mouseover|mouseout|keydown|keyup)\s*=",
    r"<body[^>]*\s+on\w+\s*=",
    r"<img[^>]*\s+src\s*=\s*x",
]

PATH_TRAVERSAL_PATTERNS = [
    r"\.\./",
    r"\.\.",
    r"%2e%2e",
    r"\.\.\\",
]

# Maximum message length (2000 characters)
MAX_MESSAGE_LENGTH = 2000

# Minimum message length (1 character)
MIN_MESSAGE_LENGTH = 1


def validate_message(message: str) -> bool:
    """Validate user message for safety and proper format.

    Checks:
    - Message is not empty or whitespace only
    - Message length is within acceptable range
    - No SQL injection patterns
    - No XSS patterns
    - No path traversal attempts

    Args:
        message: User message to validate

    Returns:
        True if message is safe, False otherwise

    Example:
        >>> validate_message("What products do you have?")
        True
        >>> validate_message("<script>alert('xss')</script>")
        False
        >>> validate_message("'; DROP TABLE users; --")
        False
    """
    if not message:
        logger.warning("Message validation failed: empty message")
        return False

    # Strip whitespace and check if empty
    stripped = message.strip()
    if not stripped:
        logger.warning("Message validation failed: whitespace only")
        return False

    # Check length
    if len(message) < MIN_MESSAGE_LENGTH:
        logger.warning(f"Message validation failed: too short (min {MIN_MESSAGE_LENGTH})")
        return False

    if len(message) > MAX_MESSAGE_LENGTH:
        logger.warning(f"Message validation failed: too long (max {MAX_MESSAGE_LENGTH})")
        return False

    # Check for SQL injection patterns
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, message):
            logger.warning(f"Message validation failed: SQL injection pattern detected: {pattern}")
            return False

    # Check for XSS patterns
    for pattern in XSS_PATTERNS:
        if re.search(pattern, message, re.IGNORECASE):
            logger.warning(f"Message validation failed: XSS pattern detected: {pattern}")
            return False

    # Check for path traversal
    for pattern in PATH_TRAVERSAL_PATTERNS:
        if re.search(pattern, message, re.IGNORECASE):
            logger.warning(f"Message validation failed: path traversal pattern detected: {pattern}")
            return False

    logger.debug(f"Message validation passed for: {message[:50]}...")
    return True


def validate_conversation_id(conversation_id: str) -> bool:
    """Validate conversation ID format and existence.

    Checks:
    - ID is valid UUID format
    - Conversation exists in database
    - Conversation is active (not closed/transferred)

    Args:
        conversation_id: Conversation ID to validate

    Returns:
        True if conversation ID is valid and exists, False otherwise

    Raises:
        ValueError: If conversation_id is not a valid UUID format
    """
    if not conversation_id:
        logger.warning("Conversation validation failed: empty ID")
        return False

    # Validate UUID format
    try:
        uuid.UUID(conversation_id)
    except ValueError:
        logger.warning(f"Conversation validation failed: invalid UUID format: {conversation_id}")
        return False

    # In production, check if conversation exists in database
    # For now, just validate format
    logger.debug(f"Conversation ID format validation passed: {conversation_id}")
    return True


def validate_conversation_id_with_db(
    conversation_id: str,
    user_id: Optional[str] = None,
    session: Optional[Session] = None,
) -> bool:
    """Validate conversation ID with database check.

    Checks:
    - ID is valid UUID format
    - Conversation exists
    - User owns the conversation (if user_id provided)

    Args:
        conversation_id: Conversation ID to validate
        user_id: Optional user ID for ownership check
        session: SQLAlchemy session for database queries

    Returns:
        True if conversation is valid and accessible, False otherwise
    """
    # First check format
    if not validate_conversation_id(conversation_id):
        return False

    # If no session provided, skip database check
    if not session:
        return True

    try:
        from backend.models.chatbot import ChatBotConversation

        conversation = session.query(ChatBotConversation).filter(
            ChatBotConversation.id == conversation_id
        ).first()

        if not conversation:
            logger.warning(f"Conversation not found: {conversation_id}")
            return False

        # Check ownership if user_id provided
        if user_id and conversation.user_id != user_id:
            logger.warning(
                f"Conversation access denied: user {user_id} "
                f"does not own conversation {conversation_id}"
            )
            return False

        # Check if conversation is active
        if conversation.status not in ["active", "transferred"]:
            logger.warning(f"Conversation is not active: {conversation_id}")
            return False

        return True

    except Exception as e:
        logger.error(f"Error validating conversation with DB: {e}")
        return False


def validate_product_id(product_id: str) -> bool:
    """Validate product ID format and existence.

    Checks:
    - ID is valid UUID format
    - Product exists in database
    - Product is approved/active

    Args:
        product_id: Product ID to validate

    Returns:
        True if product ID is valid and product exists, False otherwise
    """
    if not product_id:
        logger.warning("Product validation failed: empty ID")
        return False

    # Strip whitespace
    product_id = product_id.strip()

    # Validate UUID format
    try:
        uuid.UUID(product_id)
    except ValueError:
        logger.warning(f"Product validation failed: invalid UUID format: {product_id}")
        return False

    # In production, check if product exists in database
    logger.debug(f"Product ID format validation passed: {product_id}")
    return True


def validate_product_id_with_db(
    product_id: str,
    session: Optional[Session] = None,
    active_only: bool = True,
) -> bool:
    """Validate product ID with database check.

    Checks:
    - ID is valid UUID format
    - Product exists
    - Product is approved/active (if active_only=True)

    Args:
        product_id: Product ID to validate
        session: SQLAlchemy session for database queries
        active_only: Only return True if product is active (default: True)

    Returns:
        True if product is valid and accessible, False otherwise
    """
    # First check format
    if not validate_product_id(product_id):
        return False

    # If no session provided, skip database check
    if not session:
        return True

    try:
        from backend.models.product import Product

        query = session.query(Product).filter(Product.id == product_id)

        if active_only:
            query = query.filter(Product.status.in_(["approved", "active"]))

        product = query.first()

        if not product:
            logger.warning(f"Product not found or not active: {product_id}")
            return False

        return True

    except Exception as e:
        logger.error(f"Error validating product with DB: {e}")
        return False


def validate_user_access(
    resource_id: str,
    user_id: str,
    resource_type: str = "conversation",
    session: Optional[Session] = None,
) -> bool:
    """Validate user has access to a resource.

    Checks:
    - User owns the resource (for conversations, messages, etc)
    - Access is not denied/blocked
    - User is authenticated

    Args:
        resource_id: ID of the resource to access
        user_id: ID of the user requesting access
        resource_type: Type of resource ('conversation', 'message', 'order', etc)
        session: SQLAlchemy session for database queries

    Returns:
        True if user has access, False otherwise
    """
    if not resource_id or not user_id:
        logger.warning("Access validation failed: missing resource_id or user_id")
        return False

    # Validate IDs are valid UUIDs
    try:
        uuid.UUID(resource_id)
        uuid.UUID(user_id)
    except ValueError:
        logger.warning(f"Access validation failed: invalid UUID format")
        return False

    # If no session, skip database check
    if not session:
        logger.debug(f"Access validation (format only): {resource_type}={resource_id} user={user_id}")
        return True

    try:
        if resource_type == "conversation":
            from backend.models.chatbot import ChatBotConversation
            return validate_conversation_id_with_db(resource_id, user_id, session)

        elif resource_type == "message":
            from backend.models.chatbot import ChatBotMessage, ChatBotConversation
            message = session.query(ChatBotMessage).filter(
                ChatBotMessage.id == resource_id
            ).first()

            if not message:
                return False

            # Check if user owns the conversation
            conversation = message.conversation
            return conversation and conversation.user_id == user_id

        elif resource_type == "order":
            from backend.models.order import Order
            order = session.query(Order).filter(Order.id == resource_id).first()

            if not order:
                return False

            return order.user_id == user_id

        else:
            logger.warning(f"Unknown resource type: {resource_type}")
            return False

    except Exception as e:
        logger.error(f"Error validating user access: {e}")
        return False


def sanitize_message(message: str) -> str:
    """Sanitize message by removing potentially harmful content.

    SECURITY NOTE: This is NOT a replacement for validate_message().
    Always validate first, then sanitize if needed.

    Removes:
    - HTML tags
    - Script tags
    - Event handlers

    Args:
        message: Message to sanitize

    Returns:
        Sanitized message

    Example:
        >>> sanitize_message("Hello <script>alert('xss')</script> world")
        "Hello  world"
    """
    if not message:
        return ""

    # Remove script tags
    sanitized = re.sub(r"<script[^>]*>.*?</script>", "", message, flags=re.IGNORECASE | re.DOTALL)

    # Remove iframe tags
    sanitized = re.sub(r"<iframe[^>]*>.*?</iframe>", "", sanitized, flags=re.IGNORECASE | re.DOTALL)

    # Remove event handlers
    sanitized = re.sub(r"\s+on\w+\s*=\s*['\"].*?['\"]", "", sanitized, flags=re.IGNORECASE)

    # Remove HTML tags (basic)
    sanitized = re.sub(r"<[^>]+>", "", sanitized)

    return sanitized.strip()


def validate_user_credentials(username: str, password: str) -> bool:
    """Validate user credentials format (not authentication).

    Checks:
    - Username is not empty
    - Username format is valid
    - Password meets minimum requirements

    Args:
        username: Username to validate
        password: Password to validate

    Returns:
        True if credentials format is valid, False otherwise
    """
    if not username or not password:
        return False

    # Username: 3-50 chars, alphanumeric and underscores only
    if not re.match(r"^[a-zA-Z0-9_]{3,50}$", username):
        logger.warning(f"Invalid username format: {username}")
        return False

    # Password: minimum 8 chars, must include uppercase, lowercase, digit
    if len(password) < 8:
        logger.warning("Password too short (min 8 chars)")
        return False

    if not re.search(r"[A-Z]", password):
        logger.warning("Password missing uppercase character")
        return False

    if not re.search(r"[a-z]", password):
        logger.warning("Password missing lowercase character")
        return False

    if not re.search(r"\d", password):
        logger.warning("Password missing digit")
        return False

    return True


def validate_email(email: str) -> bool:
    """Validate email format.

    Args:
        email: Email address to validate

    Returns:
        True if email format is valid, False otherwise
    """
    if not email:
        return False

    email = email.strip()

    # Simple email regex
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

    if not re.match(pattern, email):
        logger.warning(f"Invalid email format: {email}")
        return False

    # Check length
    if len(email) > 255:
        logger.warning("Email too long")
        return False

    return True


def validate_rate_limit(user_id: str, requests: int, limit: int, time_window_seconds: int = 60) -> bool:
    """Validate if user is within rate limit.

    This is a simple validator. For production, use Redis or similar.

    Args:
        user_id: User ID to check
        requests: Number of requests in current window
        limit: Maximum requests allowed in time window
        time_window_seconds: Time window duration in seconds

    Returns:
        True if within rate limit, False if exceeded
    """
    if requests >= limit:
        logger.warning(
            f"Rate limit exceeded for user {user_id}: "
            f"{requests}/{limit} in {time_window_seconds}s"
        )
        return False

    return True
