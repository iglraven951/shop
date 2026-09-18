"""
Example implementations of BaseService for DiscoveryShop models.

This module demonstrates how to create service classes extending BaseService
for specific models with custom business logic.
"""

from typing import List, Tuple, Optional
from .base_service import BaseService


class ProductService(BaseService):
    """Service for product management with custom business logic."""

    async def get_products_by_seller(
        self,
        seller_id: str,
        page: int = 1,
        per_page: int = 20
    ) -> Tuple[List, int]:
        """Get all products from a specific seller.

        Args:
            seller_id: Seller ID
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (products list, total count)
        """
        return await self.list(
            filters={'seller_id': seller_id},
            page=page,
            per_page=per_page,
            order_by='-created_at'
        )

    async def search_products(
        self,
        query: str,
        category_id: Optional[str] = None,
        page: int = 1
    ) -> Tuple[List, int]:
        """Search products by name and description.

        Args:
            query: Search query string
            category_id: Optional category filter
            page: Page number

        Returns:
            Tuple of (results, total count)
        """
        # First get search results
        results = await self.search(
            query_text=query,
            search_fields=['name', 'description', 'category']
        )

        # Then filter by category if provided
        if category_id:
            results = [p for p in results if p.category_id == category_id]

        # Apply pagination to results
        total = len(results)
        per_page = 20
        offset = (page - 1) * per_page
        paginated = results[offset:offset + per_page]

        return paginated, total

    async def get_featured_products(self, limit: int = 10) -> List:
        """Get featured/best-selling products.

        Args:
            limit: Maximum number of products

        Returns:
            List of featured products
        """
        products, _ = await self.list(
            filters={'is_featured': True},
            per_page=limit,
            order_by='-rating'
        )
        return products

    async def get_products_in_stock(self) -> List:
        """Get all products currently in stock.

        Returns:
            List of in-stock products
        """
        products, _ = await self.list(
            filters={'in_stock': True},
            per_page=1000,
            order_by='-created_at'
        )
        return products


class OrderService(BaseService):
    """Service for order management with business logic."""

    async def get_user_orders(
        self,
        user_id: str,
        page: int = 1
    ) -> Tuple[List, int]:
        """Get all orders for a specific user.

        Args:
            user_id: User ID
            page: Page number

        Returns:
            Tuple of (orders, total count)
        """
        return await self.list(
            filters={'user_id': user_id},
            page=page,
            per_page=20,
            order_by='-created_at'
        )

    async def get_pending_orders(self) -> List:
        """Get all pending orders.

        Returns:
            List of pending orders
        """
        orders, _ = await self.list(
            filters={'status': 'pending'},
            per_page=1000,
            order_by='created_at'
        )
        return orders

    async def update_order_status(
        self,
        order_id: str,
        new_status: str
    ) -> Optional:
        """Update order status.

        Args:
            order_id: Order ID
            new_status: New status value

        Returns:
            Updated order or None
        """
        if new_status not in ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']:
            raise ValueError(f"Invalid status: {new_status}")

        return await self.update(order_id, {'status': new_status})

    async def get_orders_by_status(self, status: str) -> List:
        """Get orders filtered by status.

        Args:
            status: Order status

        Returns:
            List of orders
        """
        orders, _ = await self.list(
            filters={'status': status},
            per_page=1000
        )
        return orders


class ChatService(BaseService):
    """Service for chat/messaging management."""

    async def get_conversation(
        self,
        user1_id: str,
        user2_id: str,
        page: int = 1
    ) -> Tuple[List, int]:
        """Get messages between two users.

        Args:
            user1_id: First user ID
            user2_id: Second user ID
            page: Page number

        Returns:
            Tuple of (messages, total count)
        """
        # Filter for messages between these two users
        return await self.list(
            filters={'participant_ids': [user1_id, user2_id]},
            page=page,
            per_page=50,
            order_by='created_at'
        )

    async def get_unread_messages(self, user_id: str) -> List:
        """Get unread messages for a user.

        Args:
            user_id: User ID

        Returns:
            List of unread messages
        """
        messages, _ = await self.list(
            filters={'recipient_id': user_id, 'is_read': False},
            per_page=1000,
            order_by='-created_at'
        )
        return messages

    async def mark_as_read(self, message_id: str) -> Optional:
        """Mark a message as read.

        Args:
            message_id: Message ID

        Returns:
            Updated message or None
        """
        return await self.update(message_id, {'is_read': True})


class ReviewService(BaseService):
    """Service for product reviews."""

    async def get_product_reviews(
        self,
        product_id: str,
        page: int = 1
    ) -> Tuple[List, int]:
        """Get all reviews for a product.

        Args:
            product_id: Product ID
            page: Page number

        Returns:
            Tuple of (reviews, total count)
        """
        return await self.list(
            filters={'product_id': product_id},
            page=page,
            per_page=20,
            order_by='-created_at'
        )

    async def get_seller_reviews(
        self,
        seller_id: str,
        page: int = 1
    ) -> Tuple[List, int]:
        """Get all reviews for a seller.

        Args:
            seller_id: Seller ID
            page: Page number

        Returns:
            Tuple of (reviews, total count)
        """
        return await self.list(
            filters={'seller_id': seller_id},
            page=page,
            per_page=20,
            order_by='-rating'
        )

    async def get_average_rating(self, seller_id: str) -> float:
        """Calculate average rating for a seller.

        Args:
            seller_id: Seller ID

        Returns:
            Average rating (0.0-5.0)
        """
        reviews, _ = await self.list(
            filters={'seller_id': seller_id},
            per_page=10000
        )

        if not reviews:
            return 0.0

        total_rating = sum(r.rating for r in reviews)
        return round(total_rating / len(reviews), 2)


class UserService(BaseService):
    """Service for user management."""

    async def get_active_sellers(self) -> List:
        """Get all verified sellers.

        Returns:
            List of seller users
        """
        sellers, _ = await self.list(
            filters={'is_seller': True, 'seller_verified': True},
            per_page=10000,
            order_by='-rating'
        )
        return sellers

    async def search_users(self, query: str) -> List:
        """Search users by username or email.

        Args:
            query: Search string

        Returns:
            List of matching users
        """
        return await self.search(
            query_text=query,
            search_fields=['username', 'email']
        )

    async def get_users_by_role(
        self,
        is_seller: bool = False,
        is_buyer: bool = True,
        page: int = 1
    ) -> Tuple[List, int]:
        """Get users filtered by role.

        Args:
            is_seller: Filter sellers
            is_buyer: Filter buyers
            page: Page number

        Returns:
            Tuple of (users, total count)
        """
        filters = {}
        if is_seller:
            filters['is_seller'] = True
        if is_buyer:
            filters['is_buyer'] = True

        return await self.list(
            filters=filters,
            page=page,
            per_page=50,
            order_by='created_at'
        )


# Usage Example in Routes:
# ========================
# from flask import Blueprint, request, jsonify
# from backend.application.services.example_usage import ProductService
# from backend.models import Product
# from backend.database import db
#
# products_bp = Blueprint('products', __name__)
# product_service = ProductService(Product, db.session)
#
# @products_bp.route('/products', methods=['GET'])
# async def list_products():
#     page = request.args.get('page', 1, type=int)
#     products, total = await product_service.list(page=page)
#     return jsonify({
#         'data': [p.to_dict() for p in products],
#         'total': total
#     })
#
# @products_bp.route('/products/search', methods=['GET'])
# async def search():
#     query = request.args.get('q', '')
#     category = request.args.get('category')
#     results, total = await product_service.search_products(query, category)
#     return jsonify({
#         'data': [p.to_dict() for p in results],
#         'total': total
#     })
#
# @products_bp.route('/sellers/<seller_id>/products', methods=['GET'])
# async def get_seller_products(seller_id):
#     page = request.args.get('page', 1, type=int)
#     products, total = await product_service.get_products_by_seller(seller_id, page)
#     return jsonify({
#         'data': [p.to_dict() for p in products],
#         'total': total
#     })
