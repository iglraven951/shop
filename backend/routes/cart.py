"""Flask blueprint for shopping cart management."""

import logging
from functools import wraps

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from ..dtos import CartDTO, CartItemDTO
from ..exceptions import (
    ValidationException,
    ProductNotFoundException,
    InsufficientStockException,
    DiscoveryShopException,
)
from ..services import ProductService

logger = logging.getLogger(__name__)

# Create blueprint
cart_bp = Blueprint("cart", __name__)


def token_required(f):
    """Decorator to require JWT token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            user_id = get_jwt_identity()
            if not user_id:
                return jsonify({"success": False, "error": "unauthorized", "message": "Missing or invalid token"}), 401
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Token verification failed: {str(e)}")
            return jsonify({"success": False, "error": "unauthorized", "message": "Invalid token"}), 401
    return decorated


def get_or_create_cart(user_id: str):
    """Get or create cart for user."""
    from ..models import Cart

    cart = Cart.query.filter_by(user_id=user_id).first()
    if not cart:
        cart = Cart(user_id=user_id)
        current_app.db.session.add(cart)
        current_app.db.session.commit()

    return cart


def cart_to_dto(cart):
    """Convert cart model to DTO."""
    items = []
    total_price = 0.0
    total_items = 0

    for cart_item in cart.items:
        item_dto = CartItemDTO(
            product_id=cart_item.product_id,
            product_title=cart_item.product.title if cart_item.product else "Unknown",
            price=cart_item.price,
            quantity=cart_item.quantity,
            image_url=cart_item.product.images[0].image_url if cart_item.product and cart_item.product.images else None
        )
        items.append(item_dto)
        total_price += cart_item.price * cart_item.quantity
        total_items += cart_item.quantity

    return CartDTO(
        user_id=cart.user_id,
        items=items,
        total_price=total_price,
        total_items=total_items,
        created_at=cart.created_at
    )


@cart_bp.route("", methods=["GET"])
@token_required
def get_cart():
    """
    Get user's shopping cart.

    GET /api/cart

    Returns:
        Cart with items, totals, and timestamps
    """
    try:
        user_id = get_jwt_identity()

        # Get or create cart
        cart = get_or_create_cart(user_id)

        return jsonify({
            "success": True,
            "data": cart_to_dto(cart).to_dict()
        }), 200

    except Exception as e:
        logger.error(f"Error getting cart: {str(e)}")
        return jsonify({"success": False, "error": "server_error", "message": "Internal server error"}), 500


@cart_bp.route("/items", methods=["POST"])
@token_required
def add_to_cart():
    """
    Add product to cart.

    POST /api/cart/items

    Body:
        product_id: Product ID (required)
        quantity: Quantity to add (required, >= 1)

    Returns:
        Updated cart with all items
    """
    try:
        user_id = get_jwt_identity()
        service = ProductService(current_app.db)

        # Get request data
        data = request.get_json() or {}
        product_id = data.get("product_id", "").strip()
        quantity = data.get("quantity")

        # Validate input
        if not product_id:
            raise ValidationException("product_id is required")

        if quantity is None or quantity < 1:
            raise ValidationException("Quantity must be at least 1")

        quantity = int(quantity)

        # Check if product exists
        product = service.get_product(product_id)
        if not product:
            raise ProductNotFoundException()

        # Check stock
        if product.stock < quantity:
            raise InsufficientStockException(product.stock, quantity)

        # Get or create cart
        cart = get_or_create_cart(user_id)

        # Add/update item in cart
        from ..models import CartItem

        cart_item = CartItem.query.filter_by(
            cart_id=cart.id,
            product_id=product_id
        ).first()

        if cart_item:
            # Update quantity
            new_quantity = cart_item.quantity + quantity
            if product.stock < new_quantity:
                raise InsufficientStockException(product.stock, new_quantity)
            cart_item.quantity = new_quantity
        else:
            # Create new cart item
            cart_item = CartItem(
                cart_id=cart.id,
                product_id=product_id,
                price=product.price,
                quantity=quantity
            )
            current_app.db.session.add(cart_item)

        current_app.db.session.commit()

        logger.info(f"Product added to cart: user={user_id}, product={product_id}, qty={quantity}")

        return jsonify({
            "success": True,
            "data": cart_to_dto(cart).to_dict()
        }), 200

    except (ValidationException, ProductNotFoundException, InsufficientStockException) as e:
        return jsonify({"success": False, "error": type(e).__name__, "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error adding to cart: {str(e)}")
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": "server_error", "message": "Failed to add item to cart"}), 500


@cart_bp.route("/items/<product_id>", methods=["PUT"])
@token_required
def update_cart_item(product_id: str):
    """
    Update cart item quantity.

    PUT /api/cart/items/<product_id>

    Path Parameters:
        product_id: Product ID

    Body:
        quantity: New quantity (required, >= 1)

    Returns:
        Updated cart item details
    """
    try:
        user_id = get_jwt_identity()
        service = ProductService(current_app.db)

        # Get request data
        data = request.get_json() or {}
        quantity = data.get("quantity")

        # Validate input
        if quantity is None or quantity < 1:
            raise ValidationException("Quantity must be at least 1")

        quantity = int(quantity)

        # Check if product exists
        product = service.get_product(product_id)
        if not product:
            raise ProductNotFoundException()

        # Check stock
        if product.stock < quantity:
            raise InsufficientStockException(product.stock, quantity)

        # Get cart
        cart = get_or_create_cart(user_id)

        # Update cart item
        from ..models import CartItem

        cart_item = CartItem.query.filter_by(
            cart_id=cart.id,
            product_id=product_id
        ).first()

        if not cart_item:
            raise ValidationException(f"Product {product_id} not in cart")

        cart_item.quantity = quantity
        current_app.db.session.commit()

        logger.info(f"Cart item updated: user={user_id}, product={product_id}, qty={quantity}")

        return jsonify({
            "success": True,
            "data": {
                "product_id": cart_item.product_id,
                "product_title": cart_item.product.title if cart_item.product else "Unknown",
                "price": cart_item.price,
                "quantity": cart_item.quantity,
                "image_url": cart_item.product.images[0].image_url if cart_item.product and cart_item.product.images else None
            }
        }), 200

    except (ValidationException, ProductNotFoundException, InsufficientStockException) as e:
        return jsonify({"success": False, "error": type(e).__name__, "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error updating cart item: {str(e)}")
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": "server_error", "message": "Failed to update cart item"}), 500


@cart_bp.route("/items/<product_id>", methods=["DELETE"])
@token_required
def remove_cart_item(product_id: str):
    """
    Remove item from cart.

    DELETE /api/cart/items/<product_id>

    Path Parameters:
        product_id: Product ID to remove from cart

    Returns:
        Success message
    """
    try:
        user_id = get_jwt_identity()

        # Get cart
        from ..models import CartItem

        cart = get_or_create_cart(user_id)

        # Find and remove cart item
        cart_item = CartItem.query.filter_by(
            cart_id=cart.id,
            product_id=product_id
        ).first()

        if not cart_item:
            raise ValidationException(f"Product {product_id} not in cart")

        current_app.db.session.delete(cart_item)
        current_app.db.session.commit()

        logger.info(f"Cart item removed: user={user_id}, product={product_id}")

        return jsonify({
            "success": True,
            "message": "Item removed from cart"
        }), 200

    except ValidationException as e:
        return jsonify({"success": False, "error": "validation", "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error removing cart item: {str(e)}")
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": "server_error", "message": "Failed to remove item"}), 500


@cart_bp.route("/clear", methods=["POST"])
@token_required
def clear_cart():
    """
    Clear all items from cart.

    POST /api/cart/clear

    Returns:
        Success message
    """
    try:
        user_id = get_jwt_identity()
        from ..models import CartItem

        # Get cart
        cart = get_or_create_cart(user_id)

        # Delete all cart items
        CartItem.query.filter_by(cart_id=cart.id).delete()
        current_app.db.session.commit()

        logger.info(f"Cart cleared: user={user_id}")

        return jsonify({
            "success": True,
            "message": "Cart cleared"
        }), 200

    except Exception as e:
        logger.error(f"Error clearing cart: {str(e)}")
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": "server_error", "message": "Failed to clear cart"}), 500
