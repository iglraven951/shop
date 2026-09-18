"""Centralized decorators for Flask routes."""

import logging
from functools import wraps
from typing import Callable, Any, Dict

from flask import request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity

from backend.exceptions import (
    ValidationException,
    UserNotFoundException,
    UnauthorizedAccessException,
    DiscoveryShopException,
)

logger = logging.getLogger(__name__)


def handle_errors(f: Callable) -> Callable:
    """Decorator to handle custom exceptions in routes."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValidationException as e:
            logger.warning(f"Validation error: {e.message}")
            return jsonify({
                "success": False,
                "error": "validation_error",
                "message": e.message,
                "errors": getattr(e, 'errors', {}),
            }), 422
        except UserNotFoundException as e:
            logger.warning(f"User not found: {e.message}")
            return jsonify({
                "success": False,
                "error": "user_not_found",
                "message": e.message or "User not found",
            }), 404
        except UnauthorizedAccessException as e:
            logger.warning(f"Unauthorized access: {e.message}")
            return jsonify({
                "success": False,
                "error": "unauthorized",
                "message": e.message or "Unauthorized",
            }), 401
        except DiscoveryShopException as e:
            logger.error(f"Application error: {e.message}")
            return jsonify({
                "success": False,
                "error": "application_error",
                "message": e.message,
            }), 400
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}", exc_info=True)
            return jsonify({
                "success": False,
                "error": "internal_error",
                "message": "An unexpected error occurred",
            }), 500

    wrapper.__name__ = f.__name__
    return wrapper


def token_required(f: Callable) -> Callable:
    """Decorator to require JWT token."""
    @wraps(f)
    @jwt_required()
    def wrapper(*args, **kwargs):
        try:
            user_id = get_jwt_identity()
            if not user_id:
                raise UnauthorizedAccessException("Missing or invalid token")

            # Store user_id in Flask's g for easy access in route handlers
            g.user_id = user_id

            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Token verification failed: {str(e)}")
            return jsonify({
                "success": False,
                "error": "unauthorized",
                "message": "Invalid or expired token",
            }), 401

    wrapper.__name__ = f.__name__
    return wrapper


def role_required(*roles: str) -> Callable:
    """Decorator to require specific user role."""
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        @token_required
        def wrapper(*args, **kwargs):
            from backend.database import SessionLocal
            from backend.models.user import User

            db = SessionLocal()
            try:
                user_id = g.user_id
                user = db.query(User).filter(User.id == user_id).first()

                if not user:
                    raise UserNotFoundException("User not found")

                # Check if user has required role
                user_roles = set()
                if user.is_buyer:
                    user_roles.add('buyer')
                if user.is_seller:
                    user_roles.add('seller')

                if not any(role in user_roles for role in roles):
                    raise UnauthorizedAccessException(
                        f"User role must be one of: {', '.join(roles)}"
                    )

                # Store user in g for convenience
                g.current_user = user

                return f(*args, **kwargs)
            finally:
                db.close()

        wrapper.__name__ = f.__name__
        return wrapper
    return decorator


def validate_json(f: Callable) -> Callable:
    """Decorator to validate that request is JSON."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not request.is_json:
            return jsonify({
                "success": False,
                "error": "invalid_content_type",
                "message": "Request must be application/json",
            }), 415

        return f(*args, **kwargs)

    wrapper.__name__ = f.__name__
    return wrapper


def validate_request(schema: Dict[str, Any]) -> Callable:
    """Decorator to validate request body against schema."""
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        @validate_json
        def wrapper(*args, **kwargs):
            data = request.get_json() or {}

            # Validate required fields
            for field, field_type in schema.items():
                if field not in data:
                    return jsonify({
                        "success": False,
                        "error": "validation_error",
                        "message": f"Missing required field: {field}",
                    }), 422

                if not isinstance(data[field], field_type):
                    return jsonify({
                        "success": False,
                        "error": "validation_error",
                        "message": f"Field '{field}' must be of type {field_type.__name__}",
                    }), 422

            return f(*args, **kwargs)

        wrapper.__name__ = f.__name__
        return wrapper
    return decorator


def paginate(f: Callable) -> Callable:
    """Decorator to extract and validate pagination parameters."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        from backend.application.utils.validators import PaginationValidator

        try:
            page, limit = PaginationValidator.extract_pagination(request)
            g.page = page
            g.limit = limit
            g.offset = (page - 1) * limit

            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Pagination validation error: {str(e)}")
            return jsonify({
                "success": False,
                "error": "validation_error",
                "message": "Invalid pagination parameters",
            }), 422

    wrapper.__name__ = f.__name__
    return wrapper


def require_json_body(f: Callable) -> Callable:
    """Decorator to ensure request has JSON body."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not request.is_json:
            return jsonify({
                "success": False,
                "error": "invalid_content_type",
                "message": "Request must be application/json",
            }), 415

        data = request.get_json()
        if not data:
            return jsonify({
                "success": False,
                "error": "validation_error",
                "message": "Request body is required",
            }), 422

        g.request_data = data
        return f(*args, **kwargs)

    wrapper.__name__ = f.__name__
    return wrapper


def seller_required(f: Callable) -> Callable:
    """Decorator to require seller role."""
    return role_required('seller')(f)


def buyer_required(f: Callable) -> Callable:
    """Decorator to require buyer role."""
    return role_required('buyer')(f)
