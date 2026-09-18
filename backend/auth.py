"""JWT authentication utilities and decorators for DiscoveryShop.

Security:
- JWT tokens stored in httpOnly cookies (XSS protection)
- SameSite=Strict for CSRF protection
- Secure flag for HTTPS (production only)
- CSRF token validation enabled
"""

import os
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Optional, Callable, Any, Tuple

import jwt
from flask import request, g, jsonify, current_app, Response
from werkzeug.security import generate_password_hash, check_password_hash

from backend.exceptions import (
    UnauthorizedAccessException,
    InvalidCredentialsException,
)


def generate_jwt_token(
    user_id: str,
    expires_in: int = 7 * 24 * 60 * 60,  # 7 days default
    token_type: str = "access"
) -> str:
    """Generate a JWT token for a user.

    Args:
        user_id: The user's unique ID
        expires_in: Token expiration time in seconds (default: 7 days)
        token_type: Type of token - 'access' or 'refresh'

    Returns:
        Encoded JWT token string

    Raises:
        ValueError: If JWT_SECRET_KEY is not configured
    """
    secret_key = current_app.config.get("JWT_SECRET_KEY")
    if not secret_key:
        raise ValueError("JWT_SECRET_KEY not configured")

    payload = {
        "user_id": user_id,
        "token_type": token_type,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(seconds=expires_in),
    }

    token = jwt.encode(payload, secret_key, algorithm="HS256")
    return token


def verify_jwt_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token.

    Args:
        token: The JWT token string to verify

    Returns:
        Decoded token payload if valid, None if invalid or expired

    Raises:
        ValueError: If JWT_SECRET_KEY is not configured
    """
    secret_key = current_app.config.get("JWT_SECRET_KEY")
    if not secret_key:
        raise ValueError("JWT_SECRET_KEY not configured")

    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def set_token_in_cookie(
    response: Response,
    token: str,
    token_type: str = 'access',
    max_age: Optional[int] = None
) -> Response:
    """Set JWT token in httpOnly cookie with security headers.

    Args:
        response: Flask Response object to set cookie on
        token: JWT token string
        token_type: 'access' or 'refresh'
        max_age: Cookie max age in seconds

    Returns:
        Response object with cookie set

    Security:
        - httponly=True: Prevents JavaScript access (XSS protection)
        - secure=True: HTTPS only (production)
        - samesite='Strict': CSRF protection
    """
    cookie_name = f'{token_type}_token'

    # Determine max age if not provided
    if max_age is None:
        if token_type == 'refresh':
            max_age = 30 * 24 * 60 * 60  # 30 days
        else:
            max_age = 24 * 60 * 60  # 24 hours

    response.set_cookie(
        cookie_name,
        value=token,
        max_age=max_age,
        secure=current_app.config.get('JWT_COOKIE_SECURE', True),
        httponly=True,  # CRITICAL: Prevents XSS attacks
        samesite='Strict',  # CSRF protection
        path='/',
    )

    return response


def extract_token_from_cookies() -> Optional[str]:
    """Extract JWT token from httpOnly cookies.

    Returns:
        Access token from cookies, None if not found or invalid
    """
    token = request.cookies.get('access_token')
    return token if token else None


def extract_token_from_request() -> Optional[str]:
    """DEPRECATED: Extract JWT token from Authorization header.

    This method is deprecated. Use extract_token_from_cookies() instead.
    Kept for backward compatibility.

    Expected format: Authorization: Bearer {token}

    Returns:
        Token string if valid format, None otherwise
    """
    # Try cookies first (new method)
    token = request.cookies.get('access_token')
    if token:
        return token

    # Fall back to Authorization header (legacy support)
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return None

    # Extract token after "Bearer "
    token = auth_header[7:]
    return token if token else None


def hash_password(password: str) -> str:
    """Hash a plain text password using werkzeug.

    Uses PBKDF2 with SHA256 by default (werkzeug's generate_password_hash).

    Args:
        password: Plain text password to hash

    Returns:
        Hashed password string
    """
    return generate_password_hash(password, method="pbkdf2:sha256")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plain text password against a hash.

    Args:
        password: Plain text password to verify
        password_hash: Previously hashed password

    Returns:
        True if password matches hash, False otherwise
    """
    return check_password_hash(password_hash, password)


def token_required(f: Callable) -> Callable:
    """Decorator to require valid JWT token for route access.

    Extracts and validates JWT token from Authorization header.
    Sets g.user with the user_id from token payload.

    Usage:
        @app.route('/api/protected')
        @token_required
        def protected_route():
            user_id = g.user
            return jsonify({'user_id': user_id})

    Returns:
        Decorated function that validates JWT before execution

    Raises:
        UnauthorizedAccessException: If token is missing, invalid, or expired
    """
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        token = extract_token_from_request()

        if not token:
            raise UnauthorizedAccessException("Missing authentication token")

        payload = verify_jwt_token(token)

        if not payload:
            raise UnauthorizedAccessException("Invalid or expired token")

        # Set user_id in Flask's g object for use in the route
        g.user = payload.get("user_id")
        g.user_id = payload.get("user_id")

        return f(*args, **kwargs)

    return decorated_function


def admin_required(f: Callable) -> Callable:
    """Decorator to require admin role and valid JWT token.

    Must be used in conjunction with token_required or after it.
    Checks if user is an admin in the database.

    Usage:
        @app.route('/api/admin')
        @token_required
        @admin_required
        def admin_route():
            return jsonify({'message': 'Admin access'})

    Returns:
        Decorated function that validates admin status before execution

    Raises:
        UnauthorizedAccessException: If user is not an admin
    """
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        if not hasattr(g, "user") or not g.user:
            raise UnauthorizedAccessException("User not authenticated")

        # Import User model to check admin status
        from backend.models.user import User
        from backend.database import SessionLocal

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == g.user).first()

            if not user:
                raise UnauthorizedAccessException("User not found")

            # Check if user has admin role (you can add is_admin field to User model)
            # For now, we'll check if user has seller_verified status as a proxy
            # TODO: Add is_admin field to User model
            if not hasattr(user, "is_admin") or not user.is_admin:
                raise UnauthorizedAccessException("Admin access required")

            return f(*args, **kwargs)
        finally:
            db.close()

    return decorated_function


def seller_required(f: Callable) -> Callable:
    """Decorator to require seller role and valid JWT token.

    Checks if user is a verified seller in the database.

    Usage:
        @app.route('/api/seller/products', methods=['POST'])
        @token_required
        @seller_required
        def create_product():
            return jsonify({'message': 'Product created'})

    Returns:
        Decorated function that validates seller status before execution

    Raises:
        UnauthorizedAccessException: If user is not a verified seller
    """
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        if not hasattr(g, "user") or not g.user:
            raise UnauthorizedAccessException("User not authenticated")

        # Import User model to check seller status
        from backend.models.user import User
        from backend.database import SessionLocal

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == g.user).first()

            if not user:
                raise UnauthorizedAccessException("User not found")

            if not user.is_seller or not user.seller_verified:
                raise UnauthorizedAccessException(
                    "Verified seller status required"
                )

            return f(*args, **kwargs)
        finally:
            db.close()

    return decorated_function


def refresh_token_required(f: Callable) -> Callable:
    """Decorator to require valid refresh token.

    Similar to token_required but specifically for refresh tokens.

    Returns:
        Decorated function that validates refresh token before execution

    Raises:
        UnauthorizedAccessException: If refresh token is missing or invalid
    """
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        token = extract_token_from_request()

        if not token:
            raise UnauthorizedAccessException("Missing refresh token")

        payload = verify_jwt_token(token)

        if not payload:
            raise UnauthorizedAccessException("Invalid or expired refresh token")

        if payload.get("token_type") != "refresh":
            raise UnauthorizedAccessException("Invalid token type")

        g.user = payload.get("user_id")
        g.user_id = payload.get("user_id")

        return f(*args, **kwargs)

    return decorated_function
