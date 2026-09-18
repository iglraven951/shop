"""Admin management routes for DiscoveryShop marketplace."""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, Tuple

from flask import Blueprint, request, jsonify, g
from sqlalchemy import and_, or_, func

from backend.auth import token_required, admin_required
from backend.database import SessionLocal
from backend.models.user import User
from backend.models.product import Product
from backend.models.order import Order
from backend.models.approval import ProductApproval
from backend.exceptions import (
    UnauthorizedAccessException,
    ValidationException,
    ProductNotFoundException,
    UserNotFoundException,
)
from backend.dtos import ProductDTO, UserDTO, ProfileDTO
from backend.services.ai_service import AIService
from backend.utils.validators import (
    validate_email,
    validate_price,
)
from backend.utils.helpers import (
    paginate,
    format_currency,
    format_date,
)
from backend.utils.constants import (
    PRODUCT_STATUSES,
    NOTIFICATION_TYPES,
    REPORT_TYPES,
    DEFAULT_PAGE_SIZE,
)


logger = logging.getLogger(__name__)

# Create blueprint
admin_bp = Blueprint(
    "admin",
    __name__,
    url_prefix="/api/admin",
)


# ============================================================================
# STATISTICS ENDPOINTS
# ============================================================================


@admin_bp.route("/statistics", methods=["GET"])
@token_required
@admin_required
def get_statistics() -> Tuple[Dict[str, Any], int]:
    """Get marketplace statistics dashboard.

    Returns:
        Dashboard statistics (users, products, orders, revenue, etc.)
    """
    try:
        db = SessionLocal()

        # Get total statistics
        total_users = db.query(User).count()
        total_products = db.query(Product).count()
        total_orders = db.query(Order).count()
        pending_approvals = db.query(ProductApproval).filter(
            ProductApproval.status == "pending"
        ).count()

        # Get today's statistics
        today = datetime.now(timezone.utc).date()
        new_users_today = db.query(User).filter(
            func.date(User.created_at) == today
        ).count()
        sales_today = db.query(func.sum(Order.total_price)).filter(
            func.date(Order.created_at) == today
        ).scalar() or 0

        total_revenue = db.query(func.sum(Order.total_price)).scalar() or 0

        db.close()

        return jsonify({
            "total_users": total_users,
            "total_products": total_products,
            "total_orders": total_orders,
            "total_revenue": round(float(total_revenue), 2),
            "pending_approvals": pending_approvals,
            "new_users_today": new_users_today,
            "sales_today": round(float(sales_today), 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 200

    except Exception as e:
        logger.error(f"Error fetching statistics: {str(e)}")
        return jsonify({"error": "Failed to fetch statistics"}), 500


# ============================================================================
# PRODUCT APPROVAL ENDPOINTS
# ============================================================================


@admin_bp.route("/products/pending", methods=["GET"])
@token_required
@admin_required
def get_pending_products() -> Tuple[Dict[str, Any], int]:
    """Get products pending admin approval.

    Query Parameters:
        limit: Number of items per page (default: 20)
        page: Page number (default: 1)

    Returns:
        List of pending products with approval details
    """
    try:
        db = SessionLocal()

        limit = min(int(request.args.get("limit", DEFAULT_PAGE_SIZE)), 100)
        page = max(int(request.args.get("page", 1)), 1)

        # Query pending products
        query = db.query(Product).join(
            ProductApproval, Product.id == ProductApproval.product_id
        ).filter(
            ProductApproval.status == "pending"
        ).order_by(ProductApproval.created_at.desc())

        total = query.count()
        products = query.offset((page - 1) * limit).limit(limit).all()

        result = paginate(
            [_product_to_dict(p) for p in products],
            page,
            limit
        )

        db.close()

        return jsonify({
            "products": result["items"],
            "pagination": {
                "total": result["total"],
                "page": result["page"],
                "per_page": result["per_page"],
                "total_pages": result["total_pages"],
            },
        }), 200

    except Exception as e:
        logger.error(f"Error fetching pending products: {str(e)}")
        return jsonify({"error": "Failed to fetch products"}), 500


@admin_bp.route("/products/<product_id>/approve", methods=["POST"])
@token_required
@admin_required
def approve_product(product_id: str) -> Tuple[Dict[str, Any], int]:
    """Approve a product listing.

    Args:
        product_id: Product ID to approve

    Request Body:
        notes: Optional approval notes

    Returns:
        Updated product DTO
    """
    try:
        db = SessionLocal()
        data = request.get_json() or {}

        # Find product and approval
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise ProductNotFoundException()

        approval = db.query(ProductApproval).filter(
            ProductApproval.product_id == product_id
        ).first()

        if not approval:
            raise ProductNotFoundException("Product approval not found")

        # Update approval status
        approval.status = "approved"
        approval.admin_id = g.user
        approval.reviewed_at = datetime.now(timezone.utc)
        approval.reason = data.get("notes")

        # Update product status
        product.status = "approved"

        db.commit()

        # Log action
        logger.info(f"Product {product_id} approved by admin {g.user}")

        # TODO: Send notification to seller
        product_dict = _product_to_dict(product)

        db.close()

        return jsonify({
            "message": "Product approved successfully",
            "product": product_dict,
        }), 200

    except ProductNotFoundException as e:
        return jsonify({"error": e.message}), 404
    except Exception as e:
        logger.error(f"Error approving product: {str(e)}")
        return jsonify({"error": "Failed to approve product"}), 500


@admin_bp.route("/products/<product_id>/reject", methods=["POST"])
@token_required
@admin_required
def reject_product(product_id: str) -> Tuple[Dict[str, Any], int]:
    """Reject a product listing.

    Args:
        product_id: Product ID to reject

    Request Body:
        reason: Required rejection reason

    Returns:
        Updated product DTO
    """
    try:
        db = SessionLocal()
        data = request.get_json() or {}

        # Validate required fields
        reason = data.get("reason", "").strip()
        if not reason:
            raise ValidationException("Rejection reason is required")

        # Find product and approval
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise ProductNotFoundException()

        approval = db.query(ProductApproval).filter(
            ProductApproval.product_id == product_id
        ).first()

        if not approval:
            raise ProductNotFoundException("Product approval not found")

        # Update approval status
        approval.status = "rejected"
        approval.admin_id = g.user
        approval.reviewed_at = datetime.now(timezone.utc)
        approval.reason = reason

        # Update product status
        product.status = "rejected"

        db.commit()

        # Log action
        logger.info(f"Product {product_id} rejected by admin {g.user}: {reason}")

        # TODO: Send notification to seller with rejection reason
        product_dict = _product_to_dict(product)

        db.close()

        return jsonify({
            "message": "Product rejected successfully",
            "product": product_dict,
        }), 200

    except ProductNotFoundException as e:
        return jsonify({"error": e.message}), 404
    except ValidationException as e:
        return jsonify({"error": e.message}), 422
    except Exception as e:
        logger.error(f"Error rejecting product: {str(e)}")
        return jsonify({"error": "Failed to reject product"}), 500


# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================


@admin_bp.route("/users", methods=["GET"])
@token_required
@admin_required
def get_users() -> Tuple[Dict[str, Any], int]:
    """Get all users with optional filtering.

    Query Parameters:
        limit: Number of items per page (default: 20)
        page: Page number (default: 1)
        search: Search by username or email
        role: Filter by role (buyer, seller, admin)

    Returns:
        List of users
    """
    try:
        db = SessionLocal()

        limit = min(int(request.args.get("limit", DEFAULT_PAGE_SIZE)), 100)
        page = max(int(request.args.get("page", 1)), 1)
        search = request.args.get("search", "").strip()
        role = request.args.get("role", "").strip()

        # Build query
        query = db.query(User)

        if search:
            query = query.filter(
                or_(
                    User.username.ilike(f"%{search}%"),
                    User.email.ilike(f"%{search}%"),
                )
            )

        if role == "seller":
            query = query.filter(User.is_seller == True)
        elif role == "buyer":
            query = query.filter(User.is_buyer == True)

        query = query.order_by(User.created_at.desc())

        total = query.count()
        users = query.offset((page - 1) * limit).limit(limit).all()

        result = paginate(
            [_user_to_dict(u) for u in users],
            page,
            limit
        )

        db.close()

        return jsonify({
            "users": result["items"],
            "pagination": {
                "total": result["total"],
                "page": result["page"],
                "per_page": result["per_page"],
                "total_pages": result["total_pages"],
            },
        }), 200

    except Exception as e:
        logger.error(f"Error fetching users: {str(e)}")
        return jsonify({"error": "Failed to fetch users"}), 500


@admin_bp.route("/users/<user_id>/verify-seller", methods=["POST"])
@token_required
@admin_required
def verify_seller(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Verify a user as seller.

    Args:
        user_id: User ID to verify

    Returns:
        Updated user profile
    """
    try:
        db = SessionLocal()

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise UserNotFoundException()

        # Verify seller
        user.seller_verified = True
        db.commit()

        logger.info(f"User {user_id} verified as seller by admin {g.user}")

        # TODO: Send notification to user
        user_dict = _user_to_dict(user)

        db.close()

        return jsonify({
            "message": "Seller verified successfully",
            "user": user_dict,
        }), 200

    except UserNotFoundException as e:
        return jsonify({"error": e.message}), 404
    except Exception as e:
        logger.error(f"Error verifying seller: {str(e)}")
        return jsonify({"error": "Failed to verify seller"}), 500


@admin_bp.route("/users/<user_id>/ban", methods=["POST"])
@token_required
@admin_required
def ban_user(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Ban a user from the platform.

    Args:
        user_id: User ID to ban

    Request Body:
        reason: Required ban reason

    Returns:
        Updated user
    """
    try:
        db = SessionLocal()
        data = request.get_json() or {}

        # Validate required fields
        reason = data.get("reason", "").strip()
        if not reason:
            raise ValidationException("Ban reason is required")

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise UserNotFoundException()

        # Cannot ban self
        if user.id == g.user:
            raise UnauthorizedAccessException("You cannot ban yourself")

        # Ban user
        user.is_active = False
        db.commit()

        logger.warning(f"User {user_id} banned by admin {g.user}. Reason: {reason}")

        # TODO: Send notification to user about ban
        user_dict = _user_to_dict(user)

        db.close()

        return jsonify({
            "message": "User banned successfully",
            "user": user_dict,
        }), 200

    except UserNotFoundException as e:
        return jsonify({"error": e.message}), 404
    except (UnauthorizedAccessException, ValidationException) as e:
        return jsonify({"error": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error banning user: {str(e)}")
        return jsonify({"error": "Failed to ban user"}), 500


@admin_bp.route("/users/<user_id>/unban", methods=["POST"])
@token_required
@admin_required
def unban_user(user_id: str) -> Tuple[Dict[str, Any], int]:
    """Unban a user from the platform.

    Args:
        user_id: User ID to unban

    Returns:
        Updated user
    """
    try:
        db = SessionLocal()

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise UserNotFoundException()

        # Unban user
        user.is_active = True
        db.commit()

        logger.info(f"User {user_id} unbanned by admin {g.user}")

        user_dict = _user_to_dict(user)

        db.close()

        return jsonify({
            "message": "User unbanned successfully",
            "user": user_dict,
        }), 200

    except UserNotFoundException as e:
        return jsonify({"error": e.message}), 404
    except Exception as e:
        logger.error(f"Error unbanning user: {str(e)}")
        return jsonify({"error": "Failed to unban user"}), 500


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def _product_to_dict(product: Product) -> Dict[str, Any]:
    """Convert product model to dictionary.

    Args:
        product: Product model instance

    Returns:
        Dictionary representation
    """
    return {
        "id": product.id,
        "title": product.title,
        "price": float(product.price),
        "status": product.status,
        "seller_id": product.seller_id,
        "created_at": format_date(product.created_at),
        "updated_at": format_date(product.updated_at),
    }


def _user_to_dict(user: User) -> Dict[str, Any]:
    """Convert user model to dictionary.

    Args:
        user: User model instance

    Returns:
        Dictionary representation
    """
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "is_seller": user.is_seller,
        "seller_verified": user.seller_verified,
        "is_buyer": user.is_buyer,
        "is_active": user.is_active,
        "created_at": format_date(user.created_at),
    }


# ============================================================================
# CHATBOT ROUTES (/api/chatbot)
# ============================================================================


chatbot_bp = Blueprint(
    "chatbot",
    __name__,
    url_prefix="/api/chatbot",
)

ai_service = AIService()


@chatbot_bp.route("/query", methods=["POST"])
def query_chatbot() -> Tuple[Dict[str, Any], int]:
    """Process user query through chatbot.

    Request Body:
        message: User question/query
        user_id: Optional user ID for personalization

    Returns:
        Chatbot response with answer and metadata
    """
    try:
        data = request.get_json() or {}
        message = data.get("message", "").strip()
        user_id = data.get("user_id")

        if not message:
            return jsonify({
                "error": "Message is required",
            }), 400

        # Process query
        response = ai_service.process_query(message, user_id)

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Error processing chatbot query: {str(e)}")
        return jsonify({
            "error": "Failed to process query",
            "response": "I'm having trouble understanding your question. Please try again.",
        }), 500


@chatbot_bp.route("/faq", methods=["GET"])
def get_faqs() -> Tuple[Dict[str, Any], int]:
    """Get all FAQ items.

    Returns:
        List of FAQ items
    """
    try:
        faqs = ai_service.get_all_faqs()

        return jsonify({
            "faqs": faqs,
            "total": len(faqs),
        }), 200

    except Exception as e:
        logger.error(f"Error fetching FAQs: {str(e)}")
        return jsonify({"error": "Failed to fetch FAQs"}), 500


@chatbot_bp.route("/feedback", methods=["POST"])
def submit_feedback() -> Tuple[Dict[str, Any], int]:
    """Submit feedback on chatbot response.

    Request Body:
        query_id: ID of the query
        rating: Rating 1-5
        feedback_text: Optional feedback text

    Returns:
        Success message
    """
    try:
        data = request.get_json() or {}
        query_id = data.get("query_id")
        rating = data.get("rating")
        feedback_text = data.get("feedback_text")

        if not query_id or rating is None:
            raise ValidationException("query_id and rating are required")

        if not isinstance(rating, int) or rating < 1 or rating > 5:
            raise ValidationException("Rating must be between 1 and 5")

        # Save feedback
        success = ai_service.save_feedback(query_id, rating, feedback_text)

        if not success:
            raise ValidationException("Failed to save feedback")

        return jsonify({
            "message": "Thank you for your feedback",
        }), 200

    except ValidationException as e:
        return jsonify({"error": e.message}), 422
    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}")
        return jsonify({"error": "Failed to submit feedback"}), 500
