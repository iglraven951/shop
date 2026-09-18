"""Flask blueprint for product recommendations and personalization."""

import logging
from functools import wraps
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import get_jwt_identity

from ..dtos import ProductDTO
from ..exceptions import (
    ValidationException,
    ProductNotFoundException,
    DiscoveryShopException,
)
from ..services import RecommendationService, ProductService

logger = logging.getLogger(__name__)

# Create blueprint
recommendations_bp = Blueprint("recommendations", __name__)


def optional_token(f):
    """Decorator for optional JWT token (works with or without auth)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            user_id = get_jwt_identity()
        except Exception:
            user_id = None
        return f(user_id, *args, **kwargs)
    return decorated


@recommendations_bp.route("/homepage", methods=["GET"])
@optional_token
def get_homepage_recommendations(user_id=None):
    """
    Get personalized homepage recommendations.

    If authenticated: Returns recent popular products in favorite categories + trending
    If not authenticated: Returns trending products overall

    Query Parameters:
        limit: Number of products (default: 20, max: 100)
    """
    try:
        service = RecommendationService(current_app.db)
        limit = request.args.get("limit", default=20, type=int)

        limit = min(limit, 100)
        limit = max(limit, 1)

        if user_id:
            # Get personalized recommendations
            products = service.get_personalized_homepage(
                user_id=user_id,
                limit=limit
            )
        else:
            # Get trending products for unauthenticated users
            product_service = ProductService(current_app.db)
            products = product_service.get_trending_products(limit=limit)

        return jsonify({
            "success": True,
            "data": [p.to_dict() for p in products],
            "count": len(products)
        }), 200

    except Exception as e:
        logger.error(f"Error getting homepage recommendations: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get recommendations"
        }), 500


@recommendations_bp.route("/similar/<product_id>", methods=["GET"])
def get_similar_products(product_id: str):
    """
    Get products similar to the given product.

    Similar products are determined by:
    - Same category
    - Similar price range
    - High ratings

    Path Parameters:
        product_id: Product ID

    Query Parameters:
        limit: Number of products (default: 10, max: 50)
    """
    try:
        service = RecommendationService(current_app.db)
        product_service = ProductService(current_app.db)

        # Check if product exists
        product = product_service.get_product(product_id)
        if not product:
            raise ProductNotFoundException()

        limit = request.args.get("limit", default=10, type=int)
        limit = min(limit, 50)
        limit = max(limit, 1)

        # Get similar products
        similar = service.get_similar_products(
            product_id=product_id,
            limit=limit
        )

        return jsonify({
            "success": True,
            "data": [p.to_dict() for p in similar],
            "count": len(similar)
        }), 200

    except ProductNotFoundException as e:
        return jsonify({
            "success": False,
            "error": "not_found",
            "message": e.message
        }), e.status_code
    except Exception as e:
        logger.error(f"Error getting similar products: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get similar products"
        }), 500


@recommendations_bp.route("/trending", methods=["GET"])
def get_trending():
    """
    Get trending products (most viewed/sold in last 7 days).

    Query Parameters:
        limit: Number of products (default: 20, max: 100)
        category_id: Filter by category (optional)
    """
    try:
        service = ProductService(current_app.db)

        limit = request.args.get("limit", default=20, type=int)
        category_id = request.args.get("category_id", type=str)

        limit = min(limit, 100)
        limit = max(limit, 1)

        # Get trending products
        if category_id:
            products = service.get_trending_products(
                limit=limit,
                category_id=category_id
            )
        else:
            products = service.get_trending_products(limit=limit)

        return jsonify({
            "success": True,
            "data": [p.to_dict() for p in products],
            "count": len(products)
        }), 200

    except Exception as e:
        logger.error(f"Error getting trending products: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get trending products"
        }), 500


@recommendations_bp.route("/personalized", methods=["GET"])
def get_personalized_recommendations(user_id=None):
    """
    Get personalized recommendations based on user behavior.

    Based on:
    - Browse history
    - Wishlist items
    - Purchase history
    - Similar users' preferences

    Requires authentication.

    Query Parameters:
        limit: Number of products (default: 20, max: 100)
    """
    try:
        # Get user ID from JWT
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "unauthorized",
                "message": "Authentication required"
            }), 401

        service = RecommendationService(current_app.db)

        limit = request.args.get("limit", default=20, type=int)
        limit = min(limit, 100)
        limit = max(limit, 1)

        # Get personalized recommendations
        products = service.get_personalized_recommendations(
            user_id=user_id,
            limit=limit
        )

        return jsonify({
            "success": True,
            "data": [p.to_dict() for p in products],
            "count": len(products)
        }), 200

    except Exception as e:
        logger.error(f"Error getting personalized recommendations: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get recommendations"
        }), 500


@recommendations_bp.route("/by-rating", methods=["GET"])
def get_top_rated():
    """
    Get top-rated products.

    Query Parameters:
        limit: Number of products (default: 20, max: 100)
        category_id: Filter by category (optional)
        min_reviews: Minimum number of reviews (default: 5)
    """
    try:
        service = ProductService(current_app.db)

        limit = request.args.get("limit", default=20, type=int)
        category_id = request.args.get("category_id", type=str)
        min_reviews = request.args.get("min_reviews", default=5, type=int)

        limit = min(limit, 100)
        limit = max(limit, 1)
        min_reviews = max(min_reviews, 0)

        # Get top-rated products
        products = service.get_top_rated_products(
            limit=limit,
            category_id=category_id,
            min_reviews=min_reviews
        )

        return jsonify({
            "success": True,
            "data": [p.to_dict() for p in products],
            "count": len(products)
        }), 200

    except Exception as e:
        logger.error(f"Error getting top-rated products: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get top-rated products"
        }), 500


@recommendations_bp.route("/new-arrivals", methods=["GET"])
def get_new_arrivals():
    """
    Get recently added products.

    Query Parameters:
        limit: Number of products (default: 20, max: 100)
        category_id: Filter by category (optional)
        days: Show products from last N days (default: 7)
    """
    try:
        service = ProductService(current_app.db)

        limit = request.args.get("limit", default=20, type=int)
        category_id = request.args.get("category_id", type=str)
        days = request.args.get("days", default=7, type=int)

        limit = min(limit, 100)
        limit = max(limit, 1)
        days = max(days, 1)

        # Get new arrivals
        products = service.get_new_arrivals(
            limit=limit,
            category_id=category_id,
            days=days
        )

        return jsonify({
            "success": True,
            "data": [p.to_dict() for p in products],
            "count": len(products)
        }), 200

    except Exception as e:
        logger.error(f"Error getting new arrivals: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get new arrivals"
        }), 500


@recommendations_bp.route("/on-sale", methods=["GET"])
def get_on_sale():
    """
    Get products on sale (with discounts).

    Query Parameters:
        limit: Number of products (default: 20, max: 100)
        category_id: Filter by category (optional)
        min_discount: Minimum discount percentage (default: 10)
    """
    try:
        service = ProductService(current_app.db)

        limit = request.args.get("limit", default=20, type=int)
        category_id = request.args.get("category_id", type=str)
        min_discount = request.args.get("min_discount", default=10, type=int)

        limit = min(limit, 100)
        limit = max(limit, 1)
        min_discount = max(min_discount, 0)
        min_discount = min(min_discount, 100)

        # Get on-sale products
        products = service.get_on_sale_products(
            limit=limit,
            category_id=category_id,
            min_discount=min_discount
        )

        return jsonify({
            "success": True,
            "data": [p.to_dict() for p in products],
            "count": len(products)
        }), 200

    except Exception as e:
        logger.error(f"Error getting on-sale products: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get on-sale products"
        }), 500


@recommendations_bp.route("/seller/<seller_id>", methods=["GET"])
def get_seller_products(seller_id: str):
    """
    Get all products from a specific seller.

    Path Parameters:
        seller_id: Seller user ID

    Query Parameters:
        sort: Sort option ('-created_at', '-popularity', 'price', '-price')
        limit: Number of products (default: 20, max: 100)
        page: Page number (default: 1)
    """
    try:
        service = ProductService(current_app.db)
        from ..models import User

        # Check if seller exists
        seller = User.query.get(seller_id)
        if not seller or not seller.profile or not seller.profile.is_seller:
            raise ValidationException("Seller not found")

        sort = request.args.get("sort", default="-created_at")
        limit = request.args.get("limit", default=20, type=int)
        page = request.args.get("page", default=1, type=int)

        limit = min(limit, 100)
        limit = max(limit, 1)
        page = max(page, 1)

        # Get seller products
        products, total = service.get_seller_products(
            seller_id=seller_id,
            sort_by=sort,
            limit=limit,
            offset=(page - 1) * limit
        )

        return jsonify({
            "success": True,
            "data": [p.to_dict() for p in products],
            "total": total,
            "page": page,
            "per_page": limit
        }), 200

    except ValidationException as e:
        return jsonify({
            "success": False,
            "error": "validation",
            "message": e.message
        }), e.status_code
    except Exception as e:
        logger.error(f"Error getting seller products: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get seller products"
        }), 500


@recommendations_bp.route("/search-suggestions", methods=["GET"])
def get_search_suggestions():
    """
    Get search suggestions based on popular searches.

    Query Parameters:
        q: Search query prefix (required, min 2 chars)
        limit: Number of suggestions (default: 10, max: 20)
    """
    try:
        query = request.args.get("q", "").strip()
        limit = request.args.get("limit", default=10, type=int)

        if len(query) < 2:
            raise ValidationException("Search query must be at least 2 characters")

        limit = min(limit, 20)
        limit = max(limit, 1)

        # Get search suggestions
        from ..models import Product
        from sqlalchemy import func

        suggestions = Product.query.filter(
            Product.title.ilike(f"{query}%"),
            Product.status == "approved"
        ).group_by(
            Product.title
        ).order_by(
            func.count(Product.id).desc()
        ).limit(limit).all()

        titles = [p.title for p in suggestions]

        return jsonify({
            "success": True,
            "data": titles,
            "count": len(titles)
        }), 200

    except ValidationException as e:
        return jsonify({
            "success": False,
            "error": "validation",
            "message": e.message
        }), e.status_code
    except Exception as e:
        logger.error(f"Error getting search suggestions: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": "Failed to get search suggestions"
        }), 500
