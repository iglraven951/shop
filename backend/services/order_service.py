"""Order and cart service for shopping and checkout."""

import logging
from typing import List, Tuple, Optional
from datetime import datetime

from ..dtos import CartDTO, CartItemDTO, OrderDTO, OrderDetailDTO, OrderItemDTO
from ..exceptions import (
    ProductNotFoundException,
    UserNotFoundException,
    InsufficientStockException,
    InvalidOrderStateException,
    ValidationException,
    UnauthorizedAccessException,
    CartEmptyException,
)


logger = logging.getLogger(__name__)


class OrderService:
    """Service for cart and order management."""

    def __init__(self, db):
        """Initialize service with database instance."""
        self.db = db

    def add_to_cart(self, user_id: int, product_id: int, quantity: int) -> CartDTO:
        """
        Add product to user's cart.

        Args:
            user_id: User ID
            product_id: Product ID
            quantity: Quantity to add

        Returns:
            Updated CartDTO

        Raises:
            UserNotFoundException: If user not found
            ProductNotFoundException: If product not found
            InsufficientStockException: If not enough stock
            ValidationException: If quantity invalid
        """
        from ..models import User, Product, Cart, CartItem

        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            raise UserNotFoundException()

        # Verify product exists and has stock
        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        if quantity <= 0:
            raise ValidationException("Quantity must be greater than 0")

        if product.stock < quantity:
            raise InsufficientStockException(product.stock, quantity)

        # Get or create cart
        cart = Cart.query.filter_by(user_id=user_id).first()
        if not cart:
            cart = Cart(user_id=user_id, created_at=datetime.utcnow())
            self.db.session.add(cart)
            self.db.session.flush()

        # Update or create cart item
        cart_item = CartItem.query.filter_by(
            cart_id=cart.id, product_id=product_id
        ).first()

        try:
            if cart_item:
                cart_item.quantity += quantity
            else:
                cart_item = CartItem(
                    cart_id=cart.id,
                    product_id=product_id,
                    quantity=quantity,
                    price_at_addition=product.price,
                )
                self.db.session.add(cart_item)

            self.db.session.commit()
            logger.info(
                f"Product {product_id} added to cart for user {user_id}, qty: {quantity}"
            )

            return self._get_cart_dto(cart)

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Add to cart failed: {str(e)}")
            raise ValidationException(f"Add to cart failed: {str(e)}")

    def remove_from_cart(self, user_id: int, product_id: int) -> CartDTO:
        """
        Remove product from cart.

        Args:
            user_id: User ID
            product_id: Product ID

        Returns:
            Updated CartDTO

        Raises:
            UserNotFoundException: If user not found
            ValidationException: If cart operation fails
        """
        from ..models import Cart, CartItem

        cart = Cart.query.filter_by(user_id=user_id).first()
        if not cart:
            raise UserNotFoundException()

        cart_item = CartItem.query.filter_by(
            cart_id=cart.id, product_id=product_id
        ).first()

        if not cart_item:
            return self._get_cart_dto(cart)

        try:
            self.db.session.delete(cart_item)
            self.db.session.commit()
            logger.info(f"Product {product_id} removed from cart for user {user_id}")

            return self._get_cart_dto(cart)

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Remove from cart failed: {str(e)}")
            raise ValidationException(f"Remove from cart failed: {str(e)}")

    def update_cart_item(
        self, user_id: int, product_id: int, quantity: int
    ) -> CartItemDTO:
        """
        Update cart item quantity.

        Args:
            user_id: User ID
            product_id: Product ID
            quantity: New quantity

        Returns:
            Updated CartItemDTO

        Raises:
            UserNotFoundException: If user not found
            ProductNotFoundException: If product not found
            InsufficientStockException: If not enough stock
        """
        from ..models import Cart, CartItem, Product

        cart = Cart.query.filter_by(user_id=user_id).first()
        if not cart:
            raise UserNotFoundException()

        cart_item = CartItem.query.filter_by(
            cart_id=cart.id, product_id=product_id
        ).first()

        if not cart_item:
            raise ProductNotFoundException()

        # Verify stock
        product = Product.query.get(product_id)
        if not product or product.stock < quantity:
            raise InsufficientStockException(
                product.stock if product else 0, quantity
            )

        if quantity <= 0:
            # Delete item if quantity is 0 or less
            self.db.session.delete(cart_item)
        else:
            cart_item.quantity = quantity

        try:
            self.db.session.commit()
            logger.info(
                f"Cart item updated for user {user_id}, product {product_id}: qty {quantity}"
            )

            if quantity <= 0:
                return None

            return CartItemDTO(
                product_id=cart_item.product_id,
                product_title=product.title,
                price=cart_item.price_at_addition,
                quantity=cart_item.quantity,
                image_url=product.images[0].image_url if product.images else None,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Cart item update failed: {str(e)}")
            raise ValidationException(f"Cart update failed: {str(e)}")

    def get_cart(self, user_id: int) -> CartDTO:
        """
        Get user's cart.

        Args:
            user_id: User ID

        Returns:
            CartDTO with current cart items

        Raises:
            UserNotFoundException: If user not found
        """
        from ..models import Cart

        cart = Cart.query.filter_by(user_id=user_id).first()
        if not cart:
            # Return empty cart
            return CartDTO(
                user_id=user_id,
                items=[],
                total_price=0.0,
                total_items=0,
                created_at=None,
            )

        return self._get_cart_dto(cart)

    def clear_cart(self, user_id: int) -> bool:
        """
        Clear user's cart.

        Args:
            user_id: User ID

        Returns:
            True if successful
        """
        from ..models import Cart

        cart = Cart.query.filter_by(user_id=user_id).first()
        if not cart:
            return True

        try:
            # Delete all cart items
            for item in cart.items:
                self.db.session.delete(item)

            self.db.session.commit()
            logger.info(f"Cart cleared for user {user_id}")
            return True

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Clear cart failed: {str(e)}")
            return False

    def create_order(
        self,
        user_id: int,
        shipping_address: str,
        city: str,
        state: str,
        zip_code: str,
        phone: str,
    ) -> OrderDTO:
        """
        Create order from user's cart.

        Args:
            user_id: User ID
            shipping_address: Street address
            city: City
            state: State/Province
            zip_code: Postal code
            phone: Phone number

        Returns:
            OrderDTO with created order

        Raises:
            UserNotFoundException: If user not found
            CartEmptyException: If cart is empty
            ValidationException: If validation fails
        """
        from ..models import Cart, Order, OrderItem

        # Verify user exists
        user_cart = Cart.query.filter_by(user_id=user_id).first()
        if not user_cart or not user_cart.items:
            raise CartEmptyException()

        # Validate shipping info
        if not shipping_address or not city or not state or not zip_code:
            raise ValidationException("Incomplete shipping address")

        # Create order
        full_address = f"{shipping_address}, {city}, {state} {zip_code}"
        total_price = sum(item.quantity * item.price_at_addition for item in user_cart.items)

        order = Order(
            user_id=user_id,
            total_price=total_price,
            status="pending",
            shipping_address=full_address,
            phone=phone,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        try:
            self.db.session.add(order)
            self.db.session.flush()

            # Create order items from cart
            for cart_item in user_cart.items:
                order_item = OrderItem(
                    order_id=order.id,
                    product_id=cart_item.product_id,
                    quantity=cart_item.quantity,
                    price_at_purchase=cart_item.price_at_addition,
                )
                self.db.session.add(order_item)

                # Reduce product stock
                product = cart_item.product
                product.stock -= cart_item.quantity

            # Clear cart
            for item in user_cart.items:
                self.db.session.delete(item)

            self.db.session.commit()
            logger.info(f"Order created: {order.id} for user {user_id}")

            return OrderDTO(
                id=order.id,
                status=order.status,
                total_price=order.total_price,
                created_at=order.created_at,
                items_count=len(order.items),
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Order creation failed: {str(e)}")
            raise ValidationException(f"Order creation failed: {str(e)}")

    def get_order(self, order_id: int, user_id: int) -> OrderDetailDTO:
        """
        Get order details.

        Args:
            order_id: Order ID
            user_id: User ID (for authorization)

        Returns:
            OrderDetailDTO with order details

        Raises:
            ProductNotFoundException: If order not found
            UnauthorizedAccessException: If user doesn't own order
        """
        from ..models import Order

        order = Order.query.get(order_id)
        if not order:
            raise ProductNotFoundException("Order not found")

        if order.user_id != user_id:
            raise UnauthorizedAccessException()

        return self._order_to_dto(order)

    def list_user_orders(
        self, user_id: int, role: str = "buyer", limit: int = 20, offset: int = 0
    ) -> Tuple[List[OrderDTO], int]:
        """
        List user's orders.

        Args:
            user_id: User ID
            role: 'buyer' or 'seller' (determines whose orders to list)
            limit: Results limit
            offset: Pagination offset

        Returns:
            Tuple of (orders list, total count)
        """
        from ..models import Order, OrderItem

        if role == "buyer":
            query = Order.query.filter_by(user_id=user_id)
        elif role == "seller":
            # Get orders where user is a seller
            query = (
                Order.query.join(OrderItem)
                .join(OrderItem.product)
                .filter_by(seller_id=user_id)
                .distinct()
            )
        else:
            return [], 0

        total = query.count()
        orders = query.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()

        order_dtos = [
            OrderDTO(
                id=o.id,
                status=o.status,
                total_price=o.total_price,
                created_at=o.created_at,
                items_count=len(o.items),
            )
            for o in orders
        ]

        return order_dtos, total

    def update_order_status(
        self, order_id: int, seller_id: int, new_status: str
    ) -> OrderDTO:
        """
        Update order status (seller only).

        Args:
            order_id: Order ID
            seller_id: Seller ID (for authorization)
            new_status: New status

        Returns:
            Updated OrderDTO

        Raises:
            ProductNotFoundException: If order not found
            InvalidOrderStateException: If invalid status transition
        """
        from ..models import Order

        valid_statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"]

        if new_status not in valid_statuses:
            raise InvalidOrderStateException(f"Invalid status: {new_status}")

        order = Order.query.get(order_id)
        if not order:
            raise ProductNotFoundException("Order not found")

        # Verify seller has items in this order
        has_items = any(item.product.seller_id == seller_id for item in order.items)
        if not has_items:
            raise UnauthorizedAccessException()

        # Validate status transition
        status_order = {"pending": 0, "confirmed": 1, "shipped": 2, "delivered": 3}
        current_level = status_order.get(order.status, -1)
        new_level = status_order.get(new_status, -1)

        if new_status == "cancelled":
            # Can cancel from any state
            pass
        elif new_level <= current_level and new_status != order.status:
            raise InvalidOrderStateException(
                f"Cannot transition from {order.status} to {new_status}"
            )

        order.status = new_status
        order.updated_at = datetime.utcnow()

        try:
            self.db.session.commit()
            logger.info(f"Order {order_id} status updated to {new_status}")

            return OrderDTO(
                id=order.id,
                status=order.status,
                total_price=order.total_price,
                created_at=order.created_at,
                items_count=len(order.items),
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Order status update failed: {str(e)}")
            raise ValidationException(f"Order update failed: {str(e)}")

    def cancel_order(self, order_id: int, user_id: int) -> bool:
        """
        Cancel an order.

        Args:
            order_id: Order ID
            user_id: User ID (for authorization)

        Returns:
            True if successful

        Raises:
            ProductNotFoundException: If order not found
            UnauthorizedAccessException: If user doesn't own order
        """
        from ..models import Order

        order = Order.query.get(order_id)
        if not order:
            raise ProductNotFoundException("Order not found")

        if order.user_id != user_id:
            raise UnauthorizedAccessException()

        if order.status not in ["pending", "confirmed"]:
            raise InvalidOrderStateException("Cannot cancel order in current state")

        order.status = "cancelled"
        order.updated_at = datetime.utcnow()

        # Restore stock
        for item in order.items:
            item.product.stock += item.quantity

        try:
            self.db.session.commit()
            logger.info(f"Order {order_id} cancelled")
            return True

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Order cancellation failed: {str(e)}")
            return False

    def _get_cart_dto(self, cart) -> CartDTO:
        """Convert cart model to DTO."""
        from ..models import Product

        items = []
        total_price = 0.0

        for cart_item in cart.items:
            product = cart_item.product
            item_total = cart_item.quantity * cart_item.price_at_addition
            total_price += item_total

            items.append(
                CartItemDTO(
                    product_id=cart_item.product_id,
                    product_title=product.title,
                    price=cart_item.price_at_addition,
                    quantity=cart_item.quantity,
                    image_url=product.images[0].image_url if product.images else None,
                )
            )

        return CartDTO(
            user_id=cart.user_id,
            items=items,
            total_price=total_price,
            total_items=sum(item.quantity for item in items),
            created_at=cart.created_at,
        )

    def _order_to_dto(self, order) -> OrderDetailDTO:
        """Convert order model to DTO."""
        items = []
        for order_item in order.items:
            product = order_item.product
            items.append(
                OrderItemDTO(
                    product_id=order_item.product_id,
                    product_title=product.title,
                    quantity=order_item.quantity,
                    price_at_purchase=order_item.price_at_purchase,
                    image_url=product.images[0].image_url if product.images else None,
                )
            )

        # Get primary seller for this order
        seller = None
        seller_name = None
        if order.items:
            seller = order.items[0].product.seller
            seller_name = seller.username

        return OrderDetailDTO(
            id=order.id,
            status=order.status,
            total_price=order.total_price,
            created_at=order.created_at,
            updated_at=order.updated_at,
            shipping_address=order.shipping_address,
            items=items,
            seller_id=seller.id if seller else None,
            seller_name=seller_name,
        )
