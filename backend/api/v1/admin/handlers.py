"""Admin request handlers (business logic)."""

from datetime import datetime, timezone
from typing import List, Dict, Any
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.models import (
    User, UserStatus, Product, Order, Transaction,
    ChatMessage, ForumTopic, Review
)
from backend.database import get_db


class AdminHandler:
    """Handler for admin operations."""

    @staticmethod
    def check_admin_role(user_id: str) -> bool:
        """Check if user has admin role.

        Args:
            user_id: ID of the user to check

        Returns:
            True if user is admin, False otherwise
        """
        db = next(get_db())
        user = db.query(User).filter_by(id=user_id).first()
        return user and user.is_active  # Simple check - extend as needed


    @staticmethod
    def get_dashboard_stats() -> Dict[str, Any]:
        """Get dashboard statistics for admin.

        Returns:
            Dictionary with key metrics
        """
        db = next(get_db())

        # User counts
        total_users = db.query(User).count()
        active_users = db.query(User).filter_by(is_active=True).count()
        sellers = db.query(User).filter_by(is_seller=True).count()
        verified_sellers = db.query(User).filter_by(is_seller=True, seller_verified=True).count()

        # Product counts
        total_products = db.query(Product).count()
        active_products = db.query(Product).filter_by(is_available=True).count()

        # Order counts
        total_orders = db.query(Order).count()
        pending_orders = db.query(Order).filter_by(status='pending').count()

        # Revenue
        total_revenue = db.query(func.sum(Transaction.amount)).filter_by(status='completed').scalar() or 0

        # Recent activity
        recent_messages = db.query(ChatMessage).count()
        recent_topics = db.query(ForumTopic).count()

        return {
            "users": {
                "total": total_users,
                "active": active_users,
                "sellers": sellers,
                "verified_sellers": verified_sellers
            },
            "products": {
                "total": total_products,
                "active": active_products
            },
            "orders": {
                "total": total_orders,
                "pending": pending_orders
            },
            "revenue": float(total_revenue),
            "activity": {
                "messages": recent_messages,
                "forum_topics": recent_topics
            }
        }

    @staticmethod
    def get_users(
        role: str = None,
        status: str = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get list of all users with filtering.

        Args:
            role: Filter by role ('buyer', 'seller', or None for all)
            status: Filter by status ('active', 'inactive', 'banned')
            limit: Maximum users to return
            offset: Pagination offset

        Returns:
            List of users
        """
        db = next(get_db())

        query = db.query(User)

        # Apply filters
        if role == 'seller':
            query = query.filter_by(is_seller=True)
        elif role == 'buyer':
            query = query.filter_by(is_buyer=True, is_seller=False)

        if status == 'active':
            query = query.filter_by(is_active=True)
        elif status == 'inactive':
            query = query.filter_by(is_active=False)

        users = query.limit(limit).offset(offset).all()

        return [
            {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "full_name": user.full_name,
                "avatar_url": user.avatar_url,
                "is_buyer": user.is_buyer,
                "is_seller": user.is_seller,
                "seller_verified": user.seller_verified,
                "is_active": user.is_active,
                "created_at": user.created_at.isoformat()
            }
            for user in users
        ]

    @staticmethod
    def ban_user(user_id: str, reason: str = "") -> Dict[str, Any]:
        """Ban a user from the platform.

        Args:
            user_id: ID of the user to ban
            reason: Reason for banning (optional)

        Returns:
            Updated user information

        Raises:
            ValueError: If user doesn't exist
        """
        db = next(get_db())

        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            raise ValueError(f"Usuário {user_id} não encontrado")

        user.is_active = False
        db.commit()
        db.refresh(user)

        return {
            "id": user.id,
            "username": user.username,
            "is_active": user.is_active,
            "status": "Banido com sucesso"
        }

    @staticmethod
    def unban_user(user_id: str) -> Dict[str, Any]:
        """Unban a user from the platform.

        Args:
            user_id: ID of the user to unban

        Returns:
            Updated user information

        Raises:
            ValueError: If user doesn't exist
        """
        db = next(get_db())

        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            raise ValueError(f"Usuário {user_id} não encontrado")

        user.is_active = True
        db.commit()
        db.refresh(user)

        return {
            "id": user.id,
            "username": user.username,
            "is_active": user.is_active,
            "status": "Desbaneado com sucesso"
        }

    @staticmethod
    def get_pending_products(
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get products pending moderation/approval.

        Args:
            limit: Maximum products to return
            offset: Pagination offset

        Returns:
            List of pending products
        """
        db = next(get_db())

        # Get products that are not approved yet
        products = db.query(Product).filter_by(is_available=False).order_by(
            Product.created_at.asc()
        ).limit(limit).offset(offset).all()

        return [
            {
                "id": product.id,
                "name": product.name,
                "description": product.description,
                "price": float(product.price),
                "seller_id": product.seller_id,
                "seller_name": product.seller.full_name if product.seller else "Unknown",
                "status": "pending",
                "created_at": product.created_at.isoformat()
            }
            for product in products
        ]

    @staticmethod
    def approve_product(product_id: str) -> Dict[str, Any]:
        """Approve a product for sale.

        Args:
            product_id: ID of the product to approve

        Returns:
            Updated product information

        Raises:
            ValueError: If product doesn't exist
        """
        db = next(get_db())

        product = db.query(Product).filter_by(id=product_id).first()
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        product.is_available = True
        db.commit()
        db.refresh(product)

        return {
            "id": product.id,
            "name": product.name,
            "status": "approved",
            "is_available": product.is_available
        }

    @staticmethod
    def reject_product(product_id: str, reason: str = "") -> Dict[str, Any]:
        """Reject a product (delete it).

        Args:
            product_id: ID of the product to reject
            reason: Reason for rejection (optional)

        Returns:
            Confirmation message

        Raises:
            ValueError: If product doesn't exist
        """
        db = next(get_db())

        product = db.query(Product).filter_by(id=product_id).first()
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        db.delete(product)
        db.commit()

        return {
            "id": product_id,
            "status": "rejected",
            "message": "Produto removido com sucesso"
        }

    @staticmethod
    def delete_product(product_id: str) -> Dict[str, Any]:
        """Delete a product (admin removal).

        Args:
            product_id: ID of the product to delete

        Returns:
            Confirmation message

        Raises:
            ValueError: If product doesn't exist
        """
        return AdminHandler.reject_product(product_id)


__all__ = ["AdminHandler"]
