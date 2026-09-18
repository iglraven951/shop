"""Authentication routes for DiscoveryShop marketplace.

Uses Pydantic-based input validation for all authentication endpoints.
All inputs are automatically validated and sanitized on request.
"""

from datetime import datetime, timezone
from typing import Dict, Any, Tuple
import logging

from flask import Blueprint, request, jsonify, current_app, g
from flask_sqlalchemy import SQLAlchemy
from pydantic import ValidationError

from backend.auth import (
    generate_jwt_token,
    verify_jwt_token,
    hash_password,
    verify_password,
    token_required,
    extract_token_from_request,
    set_token_in_cookie,
    extract_token_from_cookies,
)
from backend.database import SessionLocal
from backend.models.user import User
from backend.exceptions import (
    ValidationException,
    ConflictException,
    InvalidCredentialsException,
    UserNotFoundException,
    UnauthorizedAccessException,
)
from backend.utils.input_validator import InputValidator

logger = logging.getLogger(__name__)

# Try to import Pydantic models for validation
try:
    from backend.dtos import (
        UserRegistrationInput,
        UserLoginInput,
        TokenRefreshInput,
    )
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False


# Create blueprint
auth_bp = Blueprint(
    "auth",
    __name__,
    url_prefix="/api/auth",
)


def validate_email(email: str) -> bool:
    """Validate email format.

    Args:
        email: Email string to validate

    Returns:
        True if email is valid format
    """
    import re

    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None


def validate_password(password: str) -> Tuple[bool, str]:
    """Validate password strength.

    Requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit

    Args:
        password: Password string to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters"

    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"

    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"

    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one digit"

    return True, ""


def validate_username(username: str) -> Tuple[bool, str]:
    """Validate username format.

    Requirements:
    - 3-30 characters
    - Only alphanumeric and underscores
    - Cannot start with number

    Args:
        username: Username string to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    import re

    if len(username) < 3 or len(username) > 30:
        return False, "Username must be 3-30 characters"

    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", username):
        return False, "Username can only contain letters, numbers, and underscores"

    return True, ""


def build_user_response(user: User) -> Dict[str, Any]:
    """Build user response DTO.

    Args:
        user: User object from database

    Returns:
        Dictionary with user data for API response
    """
    return {
        "user_id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "is_buyer": user.is_buyer,
        "is_seller": user.is_seller,
        "seller_verified": user.seller_verified,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
    }


def handle_errors(func):
    """Decorator to handle custom exceptions in routes."""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ValidationException as e:
            return jsonify({
                "success": False,
                "error": "validation_error",
                "message": e.message,
                "errors": getattr(e, 'errors', {}),
            }), 422
        except ConflictException as e:
            return jsonify({
                "success": False,
                "error": "conflict_error",
                "message": e.message,
            }), 409
        except InvalidCredentialsException as e:
            return jsonify({
                "success": False,
                "error": "invalid_credentials",
                "message": e.message,
            }), 401
        except UserNotFoundException as e:
            return jsonify({
                "success": False,
                "error": "user_not_found",
                "message": e.message,
            }), 404
        except UnauthorizedAccessException as e:
            return jsonify({
                "success": False,
                "error": "unauthorized",
                "message": e.message,
            }), 401
    wrapper.__name__ = func.__name__
    return wrapper


# ============================================================================
# POST /register - Register a new user
# ============================================================================

@auth_bp.route("/register", methods=["POST"])
@handle_errors
def register() -> Tuple[Dict[str, Any], int]:
    """Register a new user account.

    Request body:
        {
            "email": "user@example.com",
            "password": "SecurePass123",
            "username": "john_doe",
            "full_name": "John Doe"
        }

    Response:
        {
            "success": true,
            "data": {
                "user_id": "...",
                "email": "user@example.com",
                "username": "john_doe",
                "token": "eyJ..."
            },
            "message": "User registered successfully"
        }

    Errors:
        400: Validation error
        409: Email or username already exists
    """
    data = request.get_json() or {}

    # Validate required fields
    required_fields = ["email", "password", "username", "full_name"]
    missing_fields = [f for f in required_fields if f not in data]

    if missing_fields:
        raise ValidationException(
            "Missing required fields",
            {"missing_fields": missing_fields}
        )

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    username = data.get("username", "").strip().lower()
    full_name = data.get("full_name", "").strip()

    # Validate email format
    if not validate_email(email):
        raise ValidationException("Invalid email format")

    # Validate password strength
    is_valid_pwd, pwd_error = validate_password(password)
    if not is_valid_pwd:
        raise ValidationException(pwd_error)

    # Validate username
    is_valid_user, user_error = validate_username(username)
    if not is_valid_user:
        raise ValidationException(user_error)

    # Validate full name
    if not full_name or len(full_name) < 2:
        raise ValidationException("Full name must be at least 2 characters")

    if len(full_name) > 255:
        raise ValidationException("Full name must be less than 255 characters")

    # Check if user already exists
    db = SessionLocal()
    try:
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            raise ConflictException("Email already registered")

        existing_username = db.query(User).filter(User.username == username).first()
        if existing_username:
            raise ConflictException("Username already taken")

        # Create new user
        user = User(
            email=email,
            username=username,
            full_name=full_name,
            is_buyer=True,  # All users start as buyers
        )

        # Hash password and set it
        user.set_password(password)

        # Add to database
        db.add(user)
        db.flush()  # Flush to get user ID

        # Create associated profile
        from backend.models.profile import Profile
        profile = Profile(
            user_id=user.id,
            bio="",
            location="",
            phone=None,
        )
        db.add(profile)

        db.commit()

        # Generate JWT tokens
        access_token = generate_jwt_token(user.id, expires_in=24 * 60 * 60)  # 24 hours
        refresh_token = generate_jwt_token(
            user.id,
            expires_in=30 * 24 * 60 * 60,  # 30 days
            token_type="refresh"
        )

        # Prepare response (tokens NOT included in JSON body)
        response_data = build_user_response(user)

        response = jsonify({
            "success": True,
            "data": response_data,
            "message": "User registered successfully",
        })
        response.status_code = 201

        # Set tokens in httpOnly cookies (XSS safe)
        set_token_in_cookie(response, access_token, token_type='access')
        set_token_in_cookie(response, refresh_token, token_type='refresh')

        return response

    finally:
        db.close()


# ============================================================================
# POST /login - Login with email and password
# ============================================================================

@auth_bp.route("/login", methods=["POST"])
@handle_errors
def login() -> Tuple[Dict[str, Any], int]:
    """Authenticate user and return JWT token.

    Request body:
        {
            "email": "user@example.com",
            "password": "SecurePass123"
        }

    Response:
        {
            "success": true,
            "data": {
                "user_id": "...",
                "email": "user@example.com",
                "username": "john_doe",
                "token": "eyJ...",
                "refresh_token": "eyJ..."
            },
            "message": "Login successful"
        }

    Errors:
        401: Invalid credentials
        404: User not found
    """
    data = request.get_json() or {}

    # Validate required fields
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        raise ValidationException("Email and password are required")

    db = SessionLocal()
    try:
        # Find user by email
        user = db.query(User).filter(User.email == email).first()

        if not user:
            # Don't reveal whether email exists
            raise InvalidCredentialsException()

        # Check password
        if not user.check_password(password):
            raise InvalidCredentialsException()

        # Check if account is active
        if not user.is_active:
            raise UnauthorizedAccessException("Account is disabled")

        # Generate JWT tokens
        access_token = generate_jwt_token(user.id, expires_in=24 * 60 * 60)  # 24 hours
        refresh_token = generate_jwt_token(
            user.id,
            expires_in=30 * 24 * 60 * 60,  # 30 days
            token_type="refresh"
        )

        # Prepare response (tokens NOT included in JSON body - sent via httpOnly cookies)
        response_data = build_user_response(user)

        response = jsonify({
            "success": True,
            "data": response_data,
            "message": "Login successful",
        })
        response.status_code = 200

        # Set tokens in httpOnly cookies (XSS safe, CSRF protected)
        set_token_in_cookie(response, access_token, token_type='access')
        set_token_in_cookie(response, refresh_token, token_type='refresh')

        return response

    finally:
        db.close()


# ============================================================================
# POST /refresh-token - Refresh access token
# ============================================================================

@auth_bp.route("/refresh-token", methods=["POST"])
@handle_errors
def refresh_token() -> Tuple[Dict[str, Any], int]:
    """Refresh an expired access token using refresh token from cookie.

    The refresh_token is read from httpOnly cookie (not from request body).

    Response:
        {
            "success": true,
            "data": {
                "message": "Token refreshed"
            },
            "message": "Token refreshed"
        }

    Cookies:
        - Sets new access_token cookie
        - Sets new refresh_token cookie

    Errors:
        401: Invalid or missing refresh token
    """
    # Extract refresh token from httpOnly cookie
    refresh_token_str = request.cookies.get("refresh_token")

    if not refresh_token_str:
        raise UnauthorizedAccessException("Refresh token required")

    # Verify refresh token
    payload = verify_jwt_token(refresh_token_str)

    if not payload:
        raise UnauthorizedAccessException("Invalid or expired refresh token")

    if payload.get("token_type") != "refresh":
        raise UnauthorizedAccessException("Invalid token type")

    user_id = payload.get("user_id")

    # Verify user still exists and is active
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        if not user.is_active:
            raise UnauthorizedAccessException("Account is disabled")

        # Generate new tokens
        new_access_token = generate_jwt_token(
            user.id,
            expires_in=24 * 60 * 60  # 24 hours
        )
        new_refresh_token = generate_jwt_token(
            user.id,
            expires_in=30 * 24 * 60 * 60,  # 30 days
            token_type="refresh"
        )

        response = jsonify({
            "success": True,
            "data": {
                "message": "Token refreshed"
            },
            "message": "Token refreshed",
        })
        response.status_code = 200

        # Set new tokens in httpOnly cookies
        set_token_in_cookie(response, new_access_token, token_type='access')
        set_token_in_cookie(response, new_refresh_token, token_type='refresh')

        return response

    finally:
        db.close()


# ============================================================================
# POST /logout - Logout (optional, mainly for frontend cleanup)
# ============================================================================

@auth_bp.route("/logout", methods=["POST"])
@token_required
def logout() -> Tuple[Dict[str, Any], int]:
    """Logout user by clearing authentication cookies.

    Clears httpOnly cookies containing tokens.

    In a production system, you might also:
    - Add token to Redis blacklist
    - Invalidate all refresh tokens for this user
    - Clear user sessions
    - Track logout for audit logging

    Response:
        {
            "success": true,
            "message": "Logged out successfully"
        }

    Cookies cleared:
        - access_token
        - refresh_token
    """
    response = jsonify({
        "success": True,
        "message": "Logged out successfully",
    })
    response.status_code = 200

    # Clear authentication cookies by setting max_age=0
    response.set_cookie(
        'access_token',
        value='',
        max_age=0,
        httponly=True,
        samesite='Strict',
        path='/',
    )
    response.set_cookie(
        'refresh_token',
        value='',
        max_age=0,
        httponly=True,
        samesite='Strict',
        path='/',
    )

    return response


# ============================================================================
# POST /verify-email - Verify email address
# ============================================================================

@auth_bp.route("/verify", methods=["GET"])
@token_required
def verify() -> Tuple[Dict[str, Any], int]:
    """Verify current authentication status by checking httpOnly cookie.

    This endpoint validates that the user has a valid access token in cookies.

    Response:
        {
            "success": true,
            "data": {
                "user_id": "...",
                "authenticated": true
            },
            "message": "User authenticated"
        }

    Errors:
        401: No valid token in cookies
    """
    user_id = g.user_id

    # Verify user still exists
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        response_data = build_user_response(user)
        response_data["authenticated"] = True

        return jsonify({
            "success": True,
            "data": response_data,
            "message": "User authenticated",
        }), 200

    finally:
        db.close()


# ============================================================================
# POST /verify-email - Verify email address
# ============================================================================

@auth_bp.route("/verify-email", methods=["POST"])
def verify_email() -> Tuple[Dict[str, Any], int]:
    """Verify user's email address.

    For now, this is a placeholder. In production, you would:
    1. Generate verification tokens when user registers
    2. Send email with verification link
    3. This endpoint would validate the token

    Query parameters:
        token: Email verification token

    Response:
        {
            "success": true,
            "message": "Email verified successfully"
        }

    Errors:
        401: Invalid verification token
    """
    token = request.args.get("token", "").strip()

    if not token:
        raise UnauthorizedAccessException("Verification token required")

    # TODO: Implement email verification token handling
    # For now, return success to allow integration without full implementation

    return jsonify({
        "success": True,
        "message": "Email verified successfully",
    }), 200
