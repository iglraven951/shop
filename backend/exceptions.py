"""Custom exception classes for DiscoveryShop marketplace."""


class DiscoveryShopException(Exception):
    """Base exception for DiscoveryShop application."""

    def __init__(self, message: str, status_code: int = 400):
        """Initialize exception with message and HTTP status code."""
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class InvalidCredentialsException(DiscoveryShopException):
    """Raised when login credentials are invalid."""

    def __init__(self, message: str = "Invalid email or password"):
        super().__init__(message, 401)


class UserNotFoundException(DiscoveryShopException):
    """Raised when a user is not found."""

    def __init__(self, message: str = "User not found"):
        super().__init__(message, 404)


class ProductNotFoundException(DiscoveryShopException):
    """Raised when a product is not found."""

    def __init__(self, message: str = "Product not found"):
        super().__init__(message, 404)


class InsufficientStockException(DiscoveryShopException):
    """Raised when product stock is insufficient."""

    def __init__(self, available: int, requested: int):
        message = f"Insufficient stock. Available: {available}, Requested: {requested}"
        super().__init__(message, 409)


class InvalidOrderStateException(DiscoveryShopException):
    """Raised when order state transition is invalid."""

    def __init__(self, message: str = "Invalid order state transition"):
        super().__init__(message, 400)


class UnauthorizedAccessException(DiscoveryShopException):
    """Raised when user lacks permission for action."""

    def __init__(self, message: str = "Unauthorized access"):
        super().__init__(message, 403)


class ValidationException(DiscoveryShopException):
    """Raised when input validation fails."""

    def __init__(self, message: str = "Validation error", errors: dict = None):
        self.errors = errors or {}
        super().__init__(message, 422)


class ConflictException(DiscoveryShopException):
    """Raised when resource already exists or conflict occurs."""

    def __init__(self, message: str = "Resource conflict"):
        super().__init__(message, 409)


class ChatMessageNotFoundException(DiscoveryShopException):
    """Raised when a chat message is not found."""

    def __init__(self, message: str = "Chat message not found"):
        super().__init__(message, 404)


class NotificationNotFoundException(DiscoveryShopException):
    """Raised when a notification is not found."""

    def __init__(self, message: str = "Notification not found"):
        super().__init__(message, 404)


class ApprovalNotFoundException(DiscoveryShopException):
    """Raised when product approval is not found."""

    def __init__(self, message: str = "Product approval not found"):
        super().__init__(message, 404)


class CartEmptyException(DiscoveryShopException):
    """Raised when trying to checkout with empty cart."""

    def __init__(self, message: str = "Cart is empty"):
        super().__init__(message, 400)
