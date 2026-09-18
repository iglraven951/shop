"""User management routes for DiscoveryShop marketplace."""

import os
from pathlib import Path
from typing import Dict, Any, Tuple
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g, current_app
from werkzeug.utils import secure_filename

from backend.auth import (
    token_required,
    verify_password,
    hash_password,
)
from backend.database import SessionLocal
from backend.models.user import User
from backend.exceptions import (
    ValidationException,
    UserNotFoundException,
    UnauthorizedAccessException,
    ConflictException,
)


# Create blueprint
users_bp = Blueprint(
    "users",
    __name__,
    url_prefix="/api/users",
)


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
        except ConflictException as e:
            return jsonify({
                "success": False,
                "error": "conflict_error",
                "message": e.message,
            }), 409
    wrapper.__name__ = func.__name__
    return wrapper


def build_user_dto(user: User) -> Dict[str, Any]:
    """Build complete user DTO."""
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
        "updated_at": user.updated_at.isoformat(),
    }


def build_public_profile_dto(user: User) -> Dict[str, Any]:
    """Build public profile DTO (limited info)."""
    return {
        "user_id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "is_seller": user.is_seller,
        "seller_verified": user.seller_verified,
        "created_at": user.created_at.isoformat(),
        # TODO: Add seller stats when Order/Review models are created
        # "seller_rating": ...,
        # "total_sales": ...,
        # "total_reviews": ...,
    }


# ============================================================================
# GET /me - Get current user profile
# ============================================================================

@users_bp.route("/me", methods=["GET"])
@token_required
@handle_errors
def get_current_user() -> Tuple[Dict[str, Any], int]:
    """Get authenticated user's profile.

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "data": {
                "user_id": "...",
                "email": "user@example.com",
                "username": "john_doe",
                "full_name": "John Doe",
                ...
            }
        }

    Errors:
        401: Unauthorized
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        return jsonify({
            "success": True,
            "data": build_user_dto(user),
        }), 200

    finally:
        db.close()


# ============================================================================
# GET /{user_id}/profile - Get public user profile
# ============================================================================

@users_bp.route("/<user_id>/profile", methods=["GET"])
@handle_errors
def get_user_profile(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Get public profile for a user (seller info).

    Parameters:
        user_id: The user's ID

    Response:
        {
            "success": true,
            "data": {
                "user_id": "...",
                "username": "john_doe",
                "full_name": "John Doe",
                "avatar_url": "...",
                "is_seller": true,
                "seller_verified": true
            }
        }

    Errors:
        404: User not found
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        return jsonify({
            "success": True,
            "data": build_public_profile_dto(user),
        }), 200

    finally:
        db.close()


# ============================================================================
# PUT /me/profile - Update user profile
# ============================================================================

@users_bp.route("/me/profile", methods=["PUT"])
@token_required
@handle_errors
def update_profile() -> Tuple[Dict[str, Any], int]:
    """Update authenticated user's profile.

    Request body:
        {
            "full_name": "Jane Doe",
            "avatar_url": "https://...",
            "phone": "+51 (54) 201-0000",
            "location": "Arequipa, Perú"
        }

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "data": { updated user profile }
        }

    Errors:
        400: Validation error
        401: Unauthorized
        404: User not found
    """
    data = request.get_json() or {}

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        # Update full_name if provided
        if "full_name" in data:
            full_name = data["full_name"].strip()
            if not full_name or len(full_name) < 2:
                raise ValidationException("Full name must be at least 2 characters")
            if len(full_name) > 255:
                raise ValidationException("Full name must be less than 255 characters")
            user.full_name = full_name

        # Update avatar_url if provided
        if "avatar_url" in data:
            avatar_url = data["avatar_url"]
            if avatar_url and len(avatar_url) > 500:
                raise ValidationException("Avatar URL must be less than 500 characters")
            user.avatar_url = avatar_url or None

        # Note: phone and location would be stored in a Profile model
        # TODO: Create Profile model to store additional user information

        user.updated_at = datetime.now(timezone.utc)
        db.commit()

        return jsonify({
            "success": True,
            "data": build_user_dto(user),
            "message": "Profile updated successfully",
        }), 200

    finally:
        db.close()


# ============================================================================
# PUT /me/avatar - Upload user avatar
# ============================================================================

@users_bp.route("/me/avatar", methods=["PUT"])
@token_required
@handle_errors
def upload_avatar() -> Tuple[Dict[str, Any], int]:
    """Upload user avatar image.

    Supports: JPG, PNG, WebP (max 5MB)

    Form data:
        avatar_file: File upload (multipart/form-data)

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "data": {
                "avatar_url": "..."
            }
        }

    Errors:
        400: Invalid file
        401: Unauthorized
    """
    if "avatar_file" not in request.files:
        raise ValidationException("No file provided")

    file = request.files["avatar_file"]

    if file.filename == "":
        raise ValidationException("No file selected")

    # Validate file size (5MB max)
    max_size = 5 * 1024 * 1024  # 5MB
    if len(file.read()) > max_size:
        raise ValidationException("File too large (max 5MB)")
    file.seek(0)

    # Validate file extension
    allowed_extensions = {"jpg", "jpeg", "png", "webp"}
    if "." not in file.filename:
        raise ValidationException("Invalid file format")

    ext = file.filename.rsplit(".", 1)[1].lower()
    if ext not in allowed_extensions:
        raise ValidationException(f"Invalid file format. Allowed: {', '.join(allowed_extensions)}")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        # Create uploads directory if it doesn't exist
        upload_dir = Path(current_app.config.get("UPLOAD_FOLDER", "backend/uploads"))
        upload_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename
        filename = f"{user.id}_{datetime.now(timezone.utc).timestamp()}.{ext}"
        filepath = upload_dir / filename

        # Save file
        file.save(str(filepath))

        # Update user avatar URL
        avatar_url = f"/uploads/{filename}"
        user.avatar_url = avatar_url
        user.updated_at = datetime.now(timezone.utc)
        db.commit()

        return jsonify({
            "success": True,
            "data": {
                "avatar_url": avatar_url,
            },
            "message": "Avatar uploaded successfully",
        }), 200

    finally:
        db.close()


# ============================================================================
# PUT /me/password - Change password
# ============================================================================

@users_bp.route("/me/password", methods=["PUT"])
@token_required
@handle_errors
def change_password() -> Tuple[Dict[str, Any], int]:
    """Change user's password.

    Request body:
        {
            "current_password": "OldPass123",
            "new_password": "NewPass456"
        }

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "message": "Password updated successfully"
        }

    Errors:
        400: Validation error
        401: Invalid current password
    """
    data = request.get_json() or {}

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        raise ValidationException("Current and new passwords are required")

    # Validate new password strength
    if len(new_password) < 8:
        raise ValidationException("New password must be at least 8 characters")

    if not any(c.isupper() for c in new_password):
        raise ValidationException("Password must contain at least one uppercase letter")

    if not any(c.islower() for c in new_password):
        raise ValidationException("Password must contain at least one lowercase letter")

    if not any(c.isdigit() for c in new_password):
        raise ValidationException("Password must contain at least one digit")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        # Verify current password
        if not user.check_password(current_password):
            raise UnauthorizedAccessException("Invalid current password")

        # Set new password
        user.set_password(new_password)
        user.updated_at = datetime.now(timezone.utc)
        db.commit()

        return jsonify({
            "success": True,
            "message": "Password updated successfully",
        }), 200

    finally:
        db.close()


# ============================================================================
# POST /me/toggle-role - Toggle buyer/seller role
# ============================================================================

@users_bp.route("/me/toggle-role", methods=["POST"])
@token_required
@handle_errors
def toggle_role() -> Tuple[Dict[str, Any], int]:
    """Toggle user between buyer and seller role.

    Request body:
        {
            "role": "buyer" | "seller"
        }

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "data": {
                "is_buyer": true,
                "is_seller": false
            }
        }

    Errors:
        400: Invalid role or cannot toggle
        401: Unauthorized
    """
    data = request.get_json() or {}

    role = data.get("role", "").lower()

    if role not in ["buyer", "seller"]:
        raise ValidationException("Role must be 'buyer' or 'seller'")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        if role == "seller" and not user.is_seller and not user.seller_verified:
            raise ValidationException(
                "Cannot toggle to seller. Must request seller verification first."
            )

        user.toggle_role(role)
        user.updated_at = datetime.now(timezone.utc)
        db.commit()

        return jsonify({
            "success": True,
            "data": {
                "is_buyer": user.is_buyer,
                "is_seller": user.is_seller,
            },
            "message": f"Role toggled to {role}",
        }), 200

    finally:
        db.close()


# ============================================================================
# POST /me/become-seller - Request seller verification
# ============================================================================

@users_bp.route("/me/become-seller", methods=["POST"])
@token_required
@handle_errors
def become_seller() -> Tuple[Dict[str, Any], int]:
    """Request to become a seller.

    Sends application for admin approval.

    Request body:
        {
            "store_name": "My Store (optional)",
            "description": "Store description (optional)"
        }

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "data": {
                "is_seller": true,
                "seller_verified": false
            },
            "message": "Seller application submitted"
        }

    Errors:
        409: Already a seller
    """
    data = request.get_json() or {}

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        if user.is_seller:
            raise ConflictException("User is already a seller")

        # Set seller flag (not yet verified)
        user.is_seller = True
        user.seller_verified = False  # Requires admin approval
        user.updated_at = datetime.now(timezone.utc)

        # TODO: Create ProductApproval record for admin review
        # TODO: Send notification to admin

        db.commit()

        return jsonify({
            "success": True,
            "data": {
                "is_seller": user.is_seller,
                "seller_verified": user.seller_verified,
            },
            "message": "Seller application submitted. Awaiting admin approval.",
        }), 200

    finally:
        db.close()


# ============================================================================
# GET /me/notifications - Get user notifications
# ============================================================================

@users_bp.route("/me/notifications", methods=["GET"])
@token_required
@handle_errors
def get_notifications() -> Tuple[Dict[str, Any], int]:
    """Get notifications for authenticated user.

    Query parameters:
        limit: Number of notifications (default: 20, max: 100)
        type: Filter by type (e.g., 'order', 'message', 'review')
        unread_only: Show only unread (true/false)

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "data": [
                {
                    "notification_id": "...",
                    "title": "...",
                    "message": "...",
                    "type": "order",
                    "is_read": false,
                    "created_at": "..."
                }
            ],
            "total": 42
        }

    Errors:
        401: Unauthorized
    """
    # TODO: Implement notifications when Notification model is created

    # For now, return empty list
    return jsonify({
        "success": True,
        "data": [],
        "total": 0,
    }), 200


# ============================================================================
# PUT /me/notifications/{notification_id}/read - Mark notification as read
# ============================================================================

@users_bp.route("/me/notifications/<notification_id>/read", methods=["PUT"])
@token_required
@handle_errors
def mark_notification_read(notification_id: str) -> Tuple[Dict[str, Any], int]:
    """Mark a notification as read.

    Parameters:
        notification_id: The notification ID

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "data": {
                "is_read": true
            }
        }

    Errors:
        401: Unauthorized
        404: Notification not found
    """
    # TODO: Implement when Notification model is created

    return jsonify({
        "success": True,
        "data": {
            "is_read": True,
        },
    }), 200


# ============================================================================
# GET /me/orders - Get user's orders
# ============================================================================

@users_bp.route("/me/orders", methods=["GET"])
@token_required
@handle_errors
def get_user_orders() -> Tuple[Dict[str, Any], int]:
    """Get orders for authenticated user.

    Query parameters:
        role: 'buyer' or 'seller' (default: 'buyer')
        status: Filter by status (e.g., 'pending', 'completed')
        limit: Number of orders (default: 20, max: 100)
        page: Page number (default: 1)

    Headers:
        Authorization: Bearer {token}

    Response:
        {
            "success": true,
            "data": [
                {
                    "order_id": "...",
                    "status": "completed",
                    "total": 99.99,
                    "created_at": "..."
                }
            ],
            "total": 10,
            "page": 1,
            "per_page": 20
        }

    Errors:
        401: Unauthorized
    """
    # TODO: Implement when Order model is created

    return jsonify({
        "success": True,
        "data": [],
        "total": 0,
        "page": 1,
        "per_page": 20,
    }), 200


# ============================================================================
# GET /{user_id}/reviews - Get reviews for a user (as seller)
# ============================================================================

@users_bp.route("/<user_id>/reviews", methods=["GET"])
@handle_errors
def get_user_reviews(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Get all reviews for a seller.

    Parameters:
        user_id: The seller's ID

    Query parameters:
        limit: Number of reviews (default: 20, max: 100)
        rating: Filter by rating (1-5)

    Response:
        {
            "success": true,
            "data": [
                {
                    "review_id": "...",
                    "rating": 5,
                    "comment": "Great product!",
                    "reviewer_name": "John",
                    "created_at": "..."
                }
            ],
            "total": 150,
            "average_rating": 4.8
        }

    Errors:
        404: User not found
    """
    # TODO: Implement when Review model is created

    return jsonify({
        "success": True,
        "data": [],
        "total": 0,
        "average_rating": 0,
    }), 200


# ============================================================================
# GET /{user_id}/products - Get products from a seller
# ============================================================================

@users_bp.route("/<user_id>/products", methods=["GET"])
@handle_errors
def get_user_products(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Get all products from a seller.

    Parameters:
        user_id: The seller's ID

    Query parameters:
        limit: Number of products (default: 20, max: 100)
        category: Filter by category
        sort: Sort order ('-created_at', 'price', '-price')

    Response:
        {
            "success": true,
            "data": [
                {
                    "product_id": "...",
                    "name": "Product Name",
                    "price": 29.99,
                    "image_url": "...",
                    "created_at": "..."
                }
            ],
            "total": 50
        }

    Errors:
        404: User not found
    """
    db = SessionLocal()
    try:
        # Verify user exists
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        # TODO: Implement when Product model is created

        return jsonify({
            "success": True,
            "data": [],
            "total": 0,
        }), 200

    finally:
        db.close()
