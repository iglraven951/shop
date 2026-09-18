"""User management routes (profile, settings, etc)."""

from datetime import datetime, timezone
from typing import Dict, Any, Tuple

from flask import Blueprint, request, jsonify, g
from pathlib import Path

from backend.database import SessionLocal
from backend.models.user import User
from backend.models.profile import Profile
from backend.auth import token_required
from backend.exceptions import (
    ValidationException,
    UserNotFoundException,
    UnauthorizedAccessException,
)

# Create blueprint
users_bp = Blueprint('users', __name__)


def handle_errors(func):
    """Decorator to handle exceptions in user routes."""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ValidationException as e:
            return jsonify({
                "success": False,
                "error": "validation_error",
                "message": e.message,
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
            }), 403
        except Exception:
            return jsonify({
                "success": False,
                "error": "internal_error",
                "message": "Error interno del servidor",
            }), 500
    wrapper.__name__ = func.__name__
    return wrapper


@users_bp.route('/users/health', methods=['GET'])
def health():
    """Health check for users module."""
    return jsonify({"status": "ok", "module": "users"}), 200


@users_bp.route('/users/me', methods=['GET'])
@token_required
@handle_errors
def get_current_user() -> Tuple[Dict[str, Any], int]:
    """Get authenticated user's full profile with stats."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        profile = db.query(Profile).filter(Profile.user_id == user.id).first()

        response_data = {
            "user_id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "is_buyer": user.is_buyer,
            "is_seller": user.is_seller,
            "seller_verified": user.seller_verified,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        }

        if profile:
            response_data["profile"] = {
                "bio": profile.bio,
                "location": profile.location,
                "phone": profile.phone,
                "seller_rating": float(profile.seller_rating),
                "seller_reviews_count": profile.seller_reviews_count,
                "buyer_rating": float(profile.buyer_rating),
                "buyer_reviews_count": profile.buyer_reviews_count,
                "avg_response_time": profile.avg_response_time,
                "total_sales": profile.total_sales,
                "total_purchases": profile.total_purchases,
            }

        return jsonify({
            "success": True,
            "data": response_data,
        }), 200

    finally:
        db.close()


@users_bp.route('/users/me/profile', methods=['PUT'])
@token_required
@handle_errors
def update_user_profile() -> Tuple[Dict[str, Any], int]:
    """Update authenticated user's profile including bio, location, phone."""
    data = request.get_json() or {}

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        if not profile:
            profile = Profile(user_id=user.id)
            db.add(profile)

        # Update user fields
        if "full_name" in data and data["full_name"]:
            full_name = (data["full_name"] or "").strip()
            if len(full_name) < 2 or len(full_name) > 100:
                raise ValidationException("Nombre debe tener entre 2 y 100 caracteres")
            user.full_name = full_name

        if "avatar_url" in data:
            avatar_url = data["avatar_url"]
            if avatar_url and len(avatar_url) > 500:
                raise ValidationException("URL del avatar es muy larga")
            user.avatar_url = avatar_url or None

        # Update profile fields
        if "bio" in data:
            bio = (data["bio"] or "").strip()
            if bio and len(bio) > 500:
                raise ValidationException("La biografía es muy larga (máx 500 caracteres)")
            profile.bio = bio or None

        if "location" in data:
            location = (data["location"] or "").strip()
            if location and len(location) > 255:
                raise ValidationException("La ubicación es muy larga")
            profile.location = location or None

        if "phone" in data:
            phone = (data["phone"] or "").strip()
            if phone and len(phone) > 20:
                raise ValidationException("Teléfono es muy largo")
            profile.phone = phone or None

        user.updated_at = datetime.now(timezone.utc)
        profile.updated_at = datetime.now(timezone.utc)
        db.commit()

        return jsonify({
            "success": True,
            "data": {
                "user_id": user.id,
                "full_name": user.full_name,
                "avatar_url": user.avatar_url,
                "bio": profile.bio,
                "location": profile.location,
                "phone": profile.phone,
            },
            "message": "Perfil actualizado exitosamente",
        }), 200

    finally:
        db.close()


@users_bp.route('/users/<user_id>', methods=['GET'])
@handle_errors
def get_user_public_profile(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Get public profile for a user."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        profile = db.query(Profile).filter(Profile.user_id == user.id).first()

        response_data = {
            "user_id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "is_seller": user.is_seller,
            "seller_verified": user.seller_verified,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }

        if profile:
            response_data["seller_rating"] = float(profile.seller_rating)
            response_data["seller_reviews_count"] = profile.seller_reviews_count
            response_data["total_sales"] = profile.total_sales
            response_data["avg_response_time"] = profile.avg_response_time

        return jsonify({
            "success": True,
            "data": response_data,
        }), 200

    finally:
        db.close()


@users_bp.route('/users/<user_id>/products', methods=['GET'])
@handle_errors
def get_user_products(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Get all products from a seller."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        if not user.is_seller:
            raise ValidationException("Este usuario no es vendedor")

        # TODO: Implement when Product model is ready
        return jsonify({
            "success": True,
            "data": [],
            "total": 0,
        }), 200

    finally:
        db.close()


@users_bp.route('/users/<user_id>/reviews', methods=['GET'])
@handle_errors
def get_user_reviews(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Get all reviews for a seller."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        if not user.is_seller:
            raise ValidationException("Este usuario no es vendedor")

        # TODO: Implement when Review model is ready
        return jsonify({
            "success": True,
            "data": [],
            "total": 0,
            "average_rating": 0,
        }), 200

    finally:
        db.close()


@users_bp.route('/users/me/notifications', methods=['GET'])
@token_required
@handle_errors
def get_notifications() -> Tuple[Dict[str, Any], int]:
    """Get notifications for authenticated user."""
    # TODO: Implement when Notification model is ready
    return jsonify({
        "success": True,
        "data": [],
        "total": 0,
    }), 200


@users_bp.route('/users/me/orders', methods=['GET'])
@token_required
@handle_errors
def get_user_orders() -> Tuple[Dict[str, Any], int]:
    """Get orders for authenticated user."""
    role = request.args.get("role", "buyer")

    if role not in ["buyer", "seller"]:
        raise ValidationException("Rol debe ser 'buyer' o 'seller'")

    # TODO: Implement when Order model is ready
    return jsonify({
        "success": True,
        "data": [],
        "total": 0,
        "page": 1,
        "per_page": 20,
    }), 200


__all__ = ["users_bp"]
