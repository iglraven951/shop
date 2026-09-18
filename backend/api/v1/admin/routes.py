"""Admin management routes (dashboard, moderation, user management)."""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from backend.api.v1.admin.handlers import AdminHandler
from backend.api.v1.admin.serializers import BanUserRequest, ApproveProductRequest, RejectProductRequest
from backend.api.common.error_handlers import handle_validation_error, handle_not_found, handle_unauthorized

# Create blueprint
admin_bp = Blueprint('admin', __name__)


def require_admin(f):
    """Decorator to check if user is admin."""
    def decorated_function(*args, **kwargs):
        user_id = get_jwt_identity()
        if not AdminHandler.check_admin_role(user_id):
            return handle_unauthorized("Acesso restrito a administradores")
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function


@admin_bp.route('/admin/health', methods=['GET'])
def health():
    """Health check for admin module."""
    return jsonify({"status": "ok", "module": "admin"}), 200


@admin_bp.route('/admin/dashboard', methods=['GET'])
@jwt_required()
@require_admin
def get_dashboard():
    """Get admin dashboard statistics.

    Returns:
        200: Dashboard metrics
        401: Unauthorized (not admin)
    """
    try:
        stats = AdminHandler.get_dashboard_stats()
        return jsonify(stats), 200

    except Exception as e:
        return jsonify({"error": f"Erro ao recuperar dashboard: {str(e)}"}), 500


@admin_bp.route('/admin/users', methods=['GET'])
@jwt_required()
@require_admin
def get_users():
    """Get list of all users with filtering.

    Query parameters:
        role: Filter by role ('buyer', 'seller')
        status: Filter by status ('active', 'inactive', 'banned')
        limit: Maximum users to return (default: 50)
        offset: Pagination offset (default: 0)

    Returns:
        200: List of users
        401: Unauthorized (not admin)
    """
    try:
        role = request.args.get('role')
        status = request.args.get('status')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        users = AdminHandler.get_users(role, status, limit, offset)

        return jsonify({
            "total": len(users),
            "users": users
        }), 200

    except Exception as e:
        return jsonify({"error": f"Erro ao recuperar usuários: {str(e)}"}), 500


@admin_bp.route('/admin/users/<user_id>/ban', methods=['PUT'])
@jwt_required()
@require_admin
def ban_user(user_id: str):
    """Ban a user from the platform.

    Path parameters:
        user_id: ID of the user to ban

    Request body (optional):
    {
        "reason": "Violação de termos de serviço"
    }

    Returns:
        200: User banned successfully
        404: User not found
        401: Unauthorized (not admin)
    """
    try:
        data = request.get_json() or {}
        reason = data.get("reason", "")

        result = AdminHandler.ban_user(user_id, reason)
        return jsonify(result), 200

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao banir usuário: {str(e)}"}), 500


@admin_bp.route('/admin/users/<user_id>/unban', methods=['PUT'])
@jwt_required()
@require_admin
def unban_user(user_id: str):
    """Unban a user from the platform.

    Path parameters:
        user_id: ID of the user to unban

    Returns:
        200: User unbanned successfully
        404: User not found
        401: Unauthorized (not admin)
    """
    try:
        result = AdminHandler.unban_user(user_id)
        return jsonify(result), 200

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao desbanir usuário: {str(e)}"}), 500


@admin_bp.route('/admin/products/pending', methods=['GET'])
@jwt_required()
@require_admin
def get_pending_products():
    """Get products pending moderation/approval.

    Query parameters:
        limit: Maximum products to return (default: 50)
        offset: Pagination offset (default: 0)

    Returns:
        200: List of pending products
        401: Unauthorized (not admin)
    """
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        products = AdminHandler.get_pending_products(limit, offset)

        return jsonify({
            "total": len(products),
            "products": products
        }), 200

    except Exception as e:
        return jsonify({"error": f"Erro ao recuperar produtos: {str(e)}"}), 500


@admin_bp.route('/admin/products/<product_id>/approve', methods=['PUT'])
@jwt_required()
@require_admin
def approve_product(product_id: str):
    """Approve a product for sale.

    Path parameters:
        product_id: ID of the product to approve

    Request body (optional):
    {
        "notes": "Verificado e aprovado"
    }

    Returns:
        200: Product approved successfully
        404: Product not found
        401: Unauthorized (not admin)
    """
    try:
        result = AdminHandler.approve_product(product_id)
        return jsonify(result), 200

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao aprovar produto: {str(e)}"}), 500


@admin_bp.route('/admin/products/<product_id>/reject', methods=['PUT'])
@jwt_required()
@require_admin
def reject_product(product_id: str):
    """Reject a product (remove it).

    Path parameters:
        product_id: ID of the product to reject

    Request body (optional):
    {
        "reason": "Imagens inadequadas"
    }

    Returns:
        200: Product rejected successfully
        404: Product not found
        401: Unauthorized (not admin)
    """
    try:
        data = request.get_json() or {}
        reason = data.get("reason", "")

        result = AdminHandler.reject_product(product_id, reason)
        return jsonify(result), 200

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao rejeitar produto: {str(e)}"}), 500


@admin_bp.route('/admin/products/<product_id>', methods=['DELETE'])
@jwt_required()
@require_admin
def delete_product(product_id: str):
    """Delete a product (admin removal).

    Path parameters:
        product_id: ID of the product to delete

    Returns:
        200: Product deleted successfully
        404: Product not found
        401: Unauthorized (not admin)
    """
    try:
        result = AdminHandler.delete_product(product_id)
        return jsonify(result), 200

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao deletar produto: {str(e)}"}), 500


__all__ = ["admin_bp"]
