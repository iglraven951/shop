"""Authentication routes (login, register, refresh token, logout)."""

from datetime import datetime, timezone
from typing import Dict, Any, Tuple

from flask import Blueprint, request, jsonify, g, make_response
from sqlalchemy.exc import IntegrityError

from backend.database import SessionLocal
from backend.models.user import User
from backend.models.profile import Profile
from backend.auth import (
    generate_jwt_token,
    verify_jwt_token,
    set_token_in_cookie,
    extract_token_from_request,
    token_required,
)
from backend.utils.validators import (
    validate_email,
    validate_password,
    validate_username,
    validate_full_name,
)
from backend.exceptions import (
    ValidationException,
    UserNotFoundException,
    InvalidCredentialsException,
    UnauthorizedAccessException,
    ConflictException,
)

# Create blueprint
auth_bp = Blueprint('auth', __name__)


def handle_auth_errors(func):
    """Decorator to handle custom exceptions in auth routes."""
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
            }), 403
        except ConflictException as e:
            return jsonify({
                "success": False,
                "error": "conflict",
                "message": e.message,
            }), 409
        except Exception:
            return jsonify({
                "success": False,
                "error": "internal_error",
                "message": "Error interno del servidor",
            }), 500
    wrapper.__name__ = func.__name__
    return wrapper


def build_user_response(user: User) -> Dict[str, Any]:
    """Build complete user response DTO."""
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
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


@auth_bp.route('/auth/health', methods=['GET'])
def health():
    """Health check for auth module."""
    return jsonify({"status": "ok", "module": "auth"}), 200


@auth_bp.route('/auth/register', methods=['POST'])
@handle_auth_errors
def register() -> Tuple[Dict[str, Any], int]:
    """Register a new user account."""
    data = request.get_json() or {}

    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip().lower()
    full_name = (data.get("full_name") or "").strip()
    password = data.get("password") or ""

    if not email:
        raise ValidationException("El correo electrónico es requerido")
    if not validate_email(email):
        raise ValidationException("El formato del correo no es válido")

    if not username:
        raise ValidationException("El nombre de usuario es requerido")
    is_valid, error_msg = validate_username(username)
    if not is_valid:
        raise ValidationException(error_msg)

    if not full_name:
        raise ValidationException("El nombre completo es requerido")
    is_valid, error_msg = validate_full_name(full_name)
    if not is_valid:
        raise ValidationException(error_msg)

    if not password:
        raise ValidationException("La contraseña es requerida")
    is_valid, error_msg = validate_password(password)
    if not is_valid:
        raise ValidationException(error_msg)

    db = SessionLocal()
    try:
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            raise ConflictException("El correo electrónico ya está registrado")

        existing_username = db.query(User).filter(User.username == username).first()
        if existing_username:
            raise ConflictException("El nombre de usuario ya está en uso")

        user = User(
            email=email,
            username=username,
            full_name=full_name,
            is_buyer=True,
            is_seller=False,
            seller_verified=False,
            is_active=True,
        )
        user.set_password(password)
        db.add(user)
        db.flush()

        profile = Profile(user_id=user.id)
        db.add(profile)
        db.commit()

        access_token = generate_jwt_token(user.id, expires_in=24*60*60, token_type="access")
        refresh_token = generate_jwt_token(user.id, expires_in=30*24*60*60, token_type="refresh")

        response = make_response(jsonify({
            "success": True,
            "data": {
                "user": build_user_response(user),
                "access_token": access_token,
                "refresh_token": refresh_token,
            },
            "message": "Usuario registrado exitosamente",
        }), 201)

        response = set_token_in_cookie(response, access_token, "access", max_age=24*60*60)
        response = set_token_in_cookie(response, refresh_token, "refresh", max_age=30*24*60*60)

        return response

    except IntegrityError:
        db.rollback()
        raise ConflictException("Email o nombre de usuario ya está registrado")
    finally:
        db.close()


@auth_bp.route('/auth/login', methods=['POST'])
@handle_auth_errors
def login() -> Tuple[Dict[str, Any], int]:
    """Authenticate user and return JWT tokens."""
    data = request.get_json() or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        raise ValidationException("El correo y contraseña son requeridos")

    if not validate_email(email):
        raise ValidationException("Correo o contraseña incorrectos")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()

        if not user:
            raise InvalidCredentialsException("Correo o contraseña incorrectos")

        if not user.check_password(password):
            raise InvalidCredentialsException("Correo o contraseña incorrectos")

        if not user.is_active:
            raise UnauthorizedAccessException("Tu cuenta ha sido desactivada")

        access_token = generate_jwt_token(user.id, expires_in=24*60*60, token_type="access")
        refresh_token = generate_jwt_token(user.id, expires_in=30*24*60*60, token_type="refresh")

        response = make_response(jsonify({
            "success": True,
            "data": {
                "user": build_user_response(user),
                "access_token": access_token,
                "refresh_token": refresh_token,
            },
            "message": "Login exitoso",
        }), 200)

        response = set_token_in_cookie(response, access_token, "access", max_age=24*60*60)
        response = set_token_in_cookie(response, refresh_token, "refresh", max_age=30*24*60*60)

        return response

    finally:
        db.close()


@auth_bp.route('/auth/logout', methods=['POST'])
@token_required
@handle_auth_errors
def logout() -> Tuple[Dict[str, Any], int]:
    """Logout authenticated user by clearing tokens."""
    response = make_response(jsonify({
        "success": True,
        "message": "Logout exitoso",
    }), 200)

    response.set_cookie('access_token', '', max_age=0, httponly=True, samesite='Strict')
    response.set_cookie('refresh_token', '', max_age=0, httponly=True, samesite='Strict')

    return response


@auth_bp.route('/auth/me', methods=['GET'])
@token_required
@handle_auth_errors
def get_current_user() -> Tuple[Dict[str, Any], int]:
    """Get authenticated user's profile."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        return jsonify({
            "success": True,
            "data": build_user_response(user),
        }), 200

    finally:
        db.close()


@auth_bp.route('/auth/refresh-token', methods=['POST'])
@handle_auth_errors
def refresh_token_endpoint() -> Tuple[Dict[str, Any], int]:
    """Generate new access token using refresh token."""
    data = request.get_json() or {}

    refresh_token = (data.get("refresh_token") or "").strip()
    if not refresh_token:
        refresh_token = extract_token_from_request()

    if not refresh_token:
        raise UnauthorizedAccessException("Refresh token es requerido")

    payload = verify_jwt_token(refresh_token)

    if not payload:
        raise UnauthorizedAccessException("Refresh token inválido o expirado")

    if payload.get("token_type") != "refresh":
        raise UnauthorizedAccessException("Token type inválido")

    user_id = payload.get("user_id")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        new_access_token = generate_jwt_token(user_id, expires_in=24*60*60, token_type="access")
        new_refresh_token = generate_jwt_token(user_id, expires_in=30*24*60*60, token_type="refresh")

        response = make_response(jsonify({
            "success": True,
            "data": {
                "access_token": new_access_token,
                "refresh_token": new_refresh_token,
            },
            "message": "Token refrescado exitosamente",
        }), 200)

        response = set_token_in_cookie(response, new_access_token, "access", max_age=24*60*60)
        response = set_token_in_cookie(response, new_refresh_token, "refresh", max_age=30*24*60*60)

        return response

    finally:
        db.close()


@auth_bp.route('/auth/profile', methods=['PUT'])
@token_required
@handle_auth_errors
def update_profile() -> Tuple[Dict[str, Any], int]:
    """Update authenticated user's profile."""
    data = request.get_json() or {}

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        if "full_name" in data:
            full_name = (data["full_name"] or "").strip()
            if full_name:
                is_valid, error_msg = validate_full_name(full_name)
                if not is_valid:
                    raise ValidationException(error_msg)
                user.full_name = full_name

        if "avatar_url" in data:
            avatar_url = data["avatar_url"]
            if avatar_url and len(avatar_url) > 500:
                raise ValidationException("URL del avatar es muy larga")
            user.avatar_url = avatar_url or None

        user.updated_at = datetime.now(timezone.utc)
        db.commit()

        return jsonify({
            "success": True,
            "data": build_user_response(user),
            "message": "Perfil actualizado exitosamente",
        }), 200

    finally:
        db.close()


@auth_bp.route('/auth/become-seller', methods=['POST'])
@token_required
@handle_auth_errors
def become_seller() -> Tuple[Dict[str, Any], int]:
    """Request to become a seller."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        if user.is_seller:
            raise ConflictException("Ya eres vendedor")

        user.is_seller = True
        user.seller_verified = False
        user.updated_at = datetime.now(timezone.utc)

        db.commit()

        return jsonify({
            "success": True,
            "data": {
                "is_seller": user.is_seller,
                "seller_verified": user.seller_verified,
            },
            "message": "Solicitud de vendedor enviada. Esperando aprobación del admin.",
        }), 200

    finally:
        db.close()


@auth_bp.route('/auth/password', methods=['PUT'])
@token_required
@handle_auth_errors
def change_password() -> Tuple[Dict[str, Any], int]:
    """Change user's password."""
    data = request.get_json() or {}

    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not current_password or not new_password:
        raise ValidationException("Contraseña actual y nueva son requeridas")

    is_valid, error_msg = validate_password(new_password)
    if not is_valid:
        raise ValidationException(error_msg)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()

        if not user:
            raise UserNotFoundException()

        if not user.check_password(current_password):
            raise UnauthorizedAccessException("Contraseña actual incorrecta")

        user.set_password(new_password)
        user.updated_at = datetime.now(timezone.utc)
        db.commit()

        return jsonify({
            "success": True,
            "message": "Contraseña actualizada exitosamente",
        }), 200

    finally:
        db.close()


@auth_bp.route('/auth/users/<user_id>', methods=['GET'])
@handle_auth_errors
def get_user_profile(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Get public profile for a user (seller info)."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        public_profile = {
            "user_id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "is_seller": user.is_seller,
            "seller_verified": user.seller_verified,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }

        return jsonify({
            "success": True,
            "data": public_profile,
        }), 200

    finally:
        db.close()


@auth_bp.route('/auth/users/<user_id>/products', methods=['GET'])
@handle_auth_errors
def get_user_products(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Get all products from a seller."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise UserNotFoundException()

        return jsonify({
            "success": True,
            "data": [],
            "total": 0,
        }), 200

    finally:
        db.close()


__all__ = ["auth_bp"]
