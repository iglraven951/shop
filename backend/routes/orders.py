"""Flask blueprint for order management and checkout."""

import logging
from functools import wraps
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from ..dtos import OrderDTO, OrderDetailDTO, OrderItemDTO, ReviewDTO
from ..exceptions import (
    ValidationException,
    CartEmptyException,
    InsufficientStockException,
    InvalidOrderStateException,
    UnauthorizedAccessException,
    ProductNotFoundException,
    DiscoveryShopException,
)
from ..services import OrderService, ProductService

logger = logging.getLogger(__name__)

# Create blueprint
orders_bp = Blueprint("orders", __name__)

# Valid order status transitions
VALID_STATUS_TRANSITIONS = {
    "pending": ["confirmed", "cancelled"],
    "confirmed": ["shipped", "cancelled"],
    "shipped": ["delivered"],
    "delivered": [],
    "cancelled": []
}


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


def seller_required(f):
    """Decorator to require seller role."""
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        from ..models import User
        user_id = get_jwt_identity()
        user = User.query.get(user_id)

        if not user or not user.profile or not user.profile.is_seller:
            return jsonify({"success": False, "error": "forbidden", "message": "Seller role required"}), 403

        return f(*args, **kwargs)
    return decorated


def order_to_dto(order):
    """Convert order model to DTO."""
    items = []
    for order_item in order.items:
        item_dto = OrderItemDTO(
            product_id=order_item.product_id,
            product_title=order_item.product.title if order_item.product else "Unknown",
            quantity=order_item.quantity,
            price_at_purchase=float(order_item.unit_price) if order_item.unit_price else 0.0,
            image_url=order_item.product.images[0].image_url if order_item.product and order_item.product.images else None
        )
        items.append(item_dto)

    return OrderDetailDTO(
        id=order.id,
        status=order.status,
        total_price=order.total_price,
        created_at=order.created_at,
        updated_at=order.updated_at,
        shipping_address=order.shipping_address,
        items=items,
        seller_id=None,  # Will be set per transaction if needed
        seller_name=None
    )


@orders_bp.route("", methods=["POST"])
@token_required
def checkout():
    """
    Create new order from cart (checkout).

    POST /api/orders

    Body:
        shipping_address: Shipping address (required)
        city: City (required)
        state: State/Province (required)
        zip_code: ZIP code (required)
        phone: Phone number (required)
        payment_method: Payment method 'card'|'transfer'|'cash' (required)

    Returns:
        Created order with ID, status, total price and item count
    """
    try:
        user_id = get_jwt_identity()
        order_service = OrderService(current_app.db)
        product_service = ProductService(current_app.db)

        # Get request data
        data = request.get_json() or {}

        # Validate input
        shipping_address = data.get("shipping_address", "").strip()
        city = data.get("city", "").strip()
        state = data.get("state", "").strip()
        zip_code = data.get("zip_code", "").strip()
        phone = data.get("phone", "").strip()
        payment_method = data.get("payment_method", "").strip()

        if not shipping_address or len(shipping_address) < 5:
            raise ValidationException("Valid shipping address is required")

        if not city or len(city) < 2:
            raise ValidationException("City is required")

        if not state or len(state) < 2:
            raise ValidationException("State is required")

        if not zip_code or len(zip_code) < 3:
            raise ValidationException("ZIP code is required")

        if not phone or len(phone) < 7:
            raise ValidationException("Valid phone number is required")

        if payment_method not in ["card", "transfer", "cash"]:
            raise ValidationException("Invalid payment method")

        # Get cart
        from ..models import Cart, CartItem, Product, Order, OrderItem, Transaction

        cart = Cart.query.filter_by(user_id=user_id).first()
        if not cart or not cart.items:
            raise CartEmptyException()

        # Validate stock and collect order data
        order_items_data = []
        total_price = 0.0

        for cart_item in cart.items:
            product = Product.query.get(cart_item.product_id)
            if not product:
                raise ProductNotFoundException(f"Product {cart_item.product_id} not found")

            if product.stock < cart_item.quantity:
                raise InsufficientStockException(product.stock, cart_item.quantity)

            order_items_data.append({
                "product": product,
                "cart_item": cart_item,
            })
            # Use price from cart item (captured at time of adding to cart)
            total_price += float(cart_item.price) * cart_item.quantity

        # Create order
        order = Order(
            user_id=user_id,
            status="pending",
            total_price=total_price,
            shipping_address=f"{shipping_address}, {city}, {state} {zip_code}",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

        current_app.db.session.add(order)
        current_app.db.session.flush()  # Get order ID

        # Create order items and reserve stock
        seller_transactions = {}  # Track transactions per seller

        for item_data in order_items_data:
            product = item_data["product"]
            cart_item = item_data["cart_item"]

            # Create order item with price captured at cart time
            order_item = OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=cart_item.quantity,
                unit_price=cart_item.price  # Use price from cart (Numeric type)
            )
            current_app.db.session.add(order_item)

            # Update product stock
            product.stock -= cart_item.quantity
            product.sold_count += cart_item.quantity

            # Track transaction for seller
            seller_id = str(product.seller_id)
            if seller_id not in seller_transactions:
                seller_transactions[seller_id] = {
                    "seller_id": seller_id,
                    "total_amount": 0.0,
                    "items_count": 0,
                }

            seller_transactions[seller_id]["total_amount"] += float(cart_item.price) * cart_item.quantity
            seller_transactions[seller_id]["items_count"] += cart_item.quantity

        # Create transactions for each seller
        for seller_id, trans_data in seller_transactions.items():
            transaction = Transaction(
                order_id=order.id,
                seller_id=seller_id,
                buyer_id=user_id,
                amount=trans_data["total_amount"],
                status="pending",
                payment_method=payment_method,
                created_at=datetime.now(timezone.utc)
            )
            current_app.db.session.add(transaction)

        # Clear cart
        CartItem.query.filter_by(cart_id=cart.id).delete()

        # Commit all changes
        current_app.db.session.commit()

        logger.info(f"Order created: {order.id} for user {user_id}, total: {total_price}")

        # Send notifications to sellers (optional)
        # notification_service.notify_sellers_of_new_order(order.id)

        return jsonify({
            "success": True,
            "data": {
                "order_id": order.id,
                "status": order.status,
                "total_price": order.total_price,
                "created_at": order.created_at.isoformat(),
                "items_count": len(order_items_data)
            }
        }), 201

    except (ValidationException, CartEmptyException, InsufficientStockException, ProductNotFoundException) as e:
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": type(e).__name__, "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error during checkout: {str(e)}")
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": "server_error", "message": "Failed to process checkout"}), 500


@orders_bp.route("", methods=["GET"])
@token_required
def list_orders():
    """
    List user's orders (as buyer or seller).

    GET /api/orders

    Query Parameters:
        role: 'buyer' (default) or 'seller' - determine whose orders to fetch
        status: Filter by status (pending, confirmed, shipped, delivered, cancelled)
        limit: Items per page (default: 20, max: 100)
        page: Page number (default: 1)

    Returns:
        Paginated list of orders with totals and pagination info
    """
    try:
        user_id = get_jwt_identity()
        from ..models import Order, Transaction

        role = request.args.get("role", default="buyer")
        status = request.args.get("status", type=str)
        limit = request.args.get("limit", default=20, type=int)
        page = request.args.get("page", default=1, type=int)

        limit = min(limit, 100)
        limit = max(limit, 1)
        page = max(page, 1)

        if role == "buyer":
            # Get orders as buyer
            query = Order.query.filter_by(user_id=user_id)
        elif role == "seller":
            # Get orders as seller (via transactions)
            query = Order.query.join(Transaction).filter(Transaction.seller_id == user_id)
        else:
            raise ValidationException("Invalid role")

        if status:
            query = query.filter_by(status=status)

        # Get total count
        total = query.count()

        # Get paginated results
        orders = query.order_by(Order.created_at.desc()).limit(limit).offset((page - 1) * limit).all()

        return jsonify({
            "success": True,
            "data": [{
                "id": order.id,
                "status": order.status,
                "total_price": order.total_price,
                "created_at": order.created_at.isoformat(),
                "items_count": len(order.items)
            } for order in orders],
            "total": total,
            "page": page,
            "per_page": limit
        }), 200

    except ValidationException as e:
        return jsonify({"success": False, "error": "validation", "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error listing orders: {str(e)}")
        return jsonify({"success": False, "error": "server_error", "message": "Internal server error"}), 500


@orders_bp.route("/<order_id>", methods=["GET"])
@token_required
def get_order_detail(order_id: str):
    """
    Get detailed order information.

    GET /api/orders/<order_id>

    Path Parameters:
        order_id: Order ID

    Returns:
        Complete order details with items, prices, and timestamps
    """
    try:
        user_id = get_jwt_identity()
        from ..models import Order, Transaction

        order = Order.query.get(order_id)
        if not order:
            raise ValidationException(f"Order {order_id} not found")

        # Check authorization (buyer or seller of any item)
        is_buyer = order.user_id == user_id
        is_seller = Transaction.query.filter_by(order_id=order_id, seller_id=user_id).first() is not None

        if not is_buyer and not is_seller:
            raise UnauthorizedAccessException("Not authorized to view this order")

        return jsonify({
            "success": True,
            "data": order_to_dto(order).to_dict()
        }), 200

    except (ValidationException, UnauthorizedAccessException) as e:
        return jsonify({"success": False, "error": type(e).__name__, "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error getting order detail: {str(e)}")
        return jsonify({"success": False, "error": "server_error", "message": "Internal server error"}), 500


@orders_bp.route("/<order_id>/status", methods=["PUT"])
@seller_required
def update_order_status(order_id: str):
    """
    Update order status (seller only).

    PUT /api/orders/<order_id>/status

    Path Parameters:
        order_id: Order ID

    Body:
        status: New status ('confirmed'|'shipped'|'delivered')
        tracking_number: Tracking number for shipment (optional)

    Returns:
        Updated order with new status and timestamp
    """
    try:
        user_id = get_jwt_identity()
        from ..models import Order, Transaction

        # Get order
        order = Order.query.get(order_id)
        if not order:
            raise ValidationException(f"Order {order_id} not found")

        # Check if user is seller for this order
        transaction = Transaction.query.filter_by(order_id=order_id, seller_id=user_id).first()
        if not transaction:
            raise UnauthorizedAccessException("Not seller for this order")

        # Get request data
        data = request.get_json() or {}
        new_status = data.get("status", "").strip()
        tracking_number = data.get("tracking_number", "").strip() if data.get("tracking_number") else None

        # Validate status transition
        if new_status not in VALID_STATUS_TRANSITIONS.get(order.status, []):
            raise InvalidOrderStateException(
                f"Cannot transition from {order.status} to {new_status}"
            )

        # Update order status
        order.status = new_status
        order.updated_at = datetime.now(timezone.utc)

        if tracking_number:
            transaction.tracking_number = tracking_number

        current_app.db.session.commit()

        logger.info(f"Order status updated: {order_id} -> {new_status} by seller {user_id}")

        return jsonify({
            "success": True,
            "data": {
                "order_id": order.id,
                "status": order.status,
                "updated_at": order.updated_at.isoformat()
            }
        }), 200

    except (ValidationException, UnauthorizedAccessException, InvalidOrderStateException) as e:
        return jsonify({"success": False, "error": type(e).__name__, "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error updating order status: {str(e)}")
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": "server_error", "message": "Failed to update order status"}), 500


@orders_bp.route("/<order_id>/cancel", methods=["POST"])
@token_required
def cancel_order(order_id: str):
    """
    Cancel order (buyer only, only if pending or confirmed status).

    POST /api/orders/<order_id>/cancel

    Path Parameters:
        order_id: Order ID to cancel

    Returns:
        Success message confirming cancellation
    """
    try:
        user_id = get_jwt_identity()
        from ..models import Order, OrderItem, Product

        # Get order
        order = Order.query.get(order_id)
        if not order:
            raise ValidationException(f"Order {order_id} not found")

        # Check authorization
        if order.user_id != user_id:
            raise UnauthorizedAccessException("Not authorized to cancel this order")

        # Check status
        if order.status not in ["pending", "confirmed"]:
            raise InvalidOrderStateException(f"Cannot cancel order with status {order.status}")

        # Restore stock
        for order_item in order.items:
            product = order_item.product
            if product:
                product.stock += order_item.quantity
                product.sold_count = max(0, product.sold_count - order_item.quantity)

        # Update order status
        order.status = "cancelled"
        order.updated_at = datetime.now(timezone.utc)

        current_app.db.session.commit()

        logger.info(f"Order cancelled: {order_id} by user {user_id}")

        return jsonify({
            "success": True,
            "message": "Order cancelled successfully"
        }), 200

    except (ValidationException, UnauthorizedAccessException, InvalidOrderStateException) as e:
        return jsonify({"success": False, "error": type(e).__name__, "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error cancelling order: {str(e)}")
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": "server_error", "message": "Failed to cancel order"}), 500


@orders_bp.route("/<order_id>/reviews", methods=["POST"])
@token_required
def create_review(order_id: str):
    """
    Create review for ordered products (buyer only, after delivery).

    POST /api/orders/<order_id>/reviews

    Path Parameters:
        order_id: Order ID (must be delivered status)

    Body:
        product_id: Product ID to review (required)
        rating: Star rating 1-5 (required, integer)
        comment: Review comment text (optional, max 500 characters)

    Returns:
        Created review with ID, rating, and timestamp
    """
    try:
        user_id = get_jwt_identity()
        from ..models import Order, Review, OrderItem

        # Get order
        order = Order.query.get(order_id)
        if not order:
            raise ValidationException(f"Order {order_id} not found")

        # Check authorization
        if order.user_id != user_id:
            raise UnauthorizedAccessException("Not authorized to review this order")

        # Check order status
        if order.status != "delivered":
            raise ValidationException("Can only review delivered orders")

        # Get request data
        data = request.get_json() or {}
        product_id = data.get("product_id", "").strip()
        rating = data.get("rating")
        comment = data.get("comment", "").strip() if data.get("comment") else None

        # Validate input
        if not product_id:
            raise ValidationException("product_id is required")

        if rating is None or rating < 1 or rating > 5:
            raise ValidationException("Rating must be between 1 and 5")

        rating = int(rating)

        if comment and len(comment) > 500:
            raise ValidationException("Comment must be less than 500 characters")

        # Check if product in order
        order_item = OrderItem.query.filter_by(
            order_id=order_id,
            product_id=product_id
        ).first()

        if not order_item:
            raise ValidationException(f"Product {product_id} not in order")

        # Check if already reviewed
        existing_review = Review.query.filter_by(
            order_id=order_id,
            product_id=product_id,
            reviewer_id=user_id
        ).first()

        if existing_review:
            raise ValidationException("Already reviewed this product")

        # Create review
        review = Review(
            order_id=order_id,
            product_id=product_id,
            reviewer_id=user_id,
            rating=rating,
            comment=comment,
            created_at=datetime.now(timezone.utc)
        )

        current_app.db.session.add(review)
        current_app.db.session.commit()

        logger.info(f"Review created: order={order_id}, product={product_id}, rating={rating}")

        return jsonify({
            "success": True,
            "data": {
                "review_id": review.id,
                "product_id": review.product_id,
                "rating": review.rating,
                "created_at": review.created_at.isoformat()
            }
        }), 201

    except (ValidationException, UnauthorizedAccessException) as e:
        return jsonify({"success": False, "error": type(e).__name__, "message": e.message}), e.status_code
    except Exception as e:
        logger.error(f"Error creating review: {str(e)}")
        current_app.db.session.rollback()
        return jsonify({"success": False, "error": "server_error", "message": "Failed to create review"}), 500
