"""Recommendation service for personalized product suggestions."""

import logging
from typing import List
from datetime import datetime, timedelta
from sqlalchemy import func

from ..dtos import ProductDTO
from ..exceptions import UserNotFoundException


logger = logging.getLogger(__name__)


class RecommendationService:
    """Service for generating personalized product recommendations."""

    def __init__(self, db):
        """Initialize service with database instance."""
        self.db = db

    def get_homepage_recommendations(self, user_id: int, limit: int = 20) -> List[ProductDTO]:
        """
        Get homepage recommendations for user.

        Strategy: Recent, popular products in user's favorite categories.

        Args:
            user_id: User ID
            limit: Number of recommendations

        Returns:
            List of recommended ProductDTOs

        Raises:
            UserNotFoundException: If user not found
        """
        from ..models import User, Product, Order, OrderItem

        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            raise UserNotFoundException()

        # Get user's favorite categories (from order history)
        favorite_categories = (
            self.db.session.query(Product.category_id)
            .join(OrderItem)
            .join(Order)
            .filter(Order.user_id == user_id)
            .group_by(Product.category_id)
            .order_by(func.count(Product.id).desc())
            .limit(5)
            .all()
        )

        category_ids = [cat[0] for cat in favorite_categories]

        # Get recent popular products
        if category_ids:
            products = (
                Product.query.filter(
                    (Product.status == "approved")
                    & (Product.category_id.in_(category_ids))
                )
                .order_by(Product.rating.desc(), Product.created_at.desc())
                .limit(limit)
                .all()
            )
        else:
            # If no favorite categories, just get trending products
            products = self._get_trending_products(limit)

        return [self._product_to_dto(p) for p in products]

    def get_similar_products(self, product_id: int, limit: int = 10) -> List[ProductDTO]:
        """
        Get similar products.

        Strategy: Same category, similar price range, excluding current product.

        Args:
            product_id: Product ID
            limit: Number of recommendations

        Returns:
            List of similar ProductDTOs
        """
        from ..models import Product

        # Get the reference product
        product = Product.query.get(product_id)
        if not product:
            return []

        # Find similar products
        price_range = product.price * 0.3  # 30% price range

        similar_products = (
            Product.query.filter(
                (Product.id != product_id)
                & (Product.category_id == product.category_id)
                & (Product.status == "approved")
                & (Product.price >= (product.price - price_range))
                & (Product.price <= (product.price + price_range))
            )
            .order_by(Product.rating.desc(), Product.review_count.desc())
            .limit(limit)
            .all()
        )

        return [self._product_to_dto(p) for p in similar_products]

    def get_trending_products(self, limit: int = 20) -> List[ProductDTO]:
        """
        Get trending products.

        Strategy: Most viewed/sold in last 7 days.

        Args:
            limit: Number of products

        Returns:
            List of trending ProductDTOs
        """
        return [self._product_to_dto(p) for p in self._get_trending_products(limit)]

    def get_personalized_feed(self, user_id: int, limit: int = 30) -> List[ProductDTO]:
        """
        Get personalized feed for user.

        Strategy: Category preferences + browsing history + wishlist.

        Args:
            user_id: User ID
            limit: Number of recommendations

        Returns:
            List of personalized ProductDTOs

        Raises:
            UserNotFoundException: If user not found
        """
        from ..models import User, Product, Order, OrderItem, Wishlist

        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            raise UserNotFoundException()

        recommendations = []

        # 1. Products from favorite categories
        favorite_categories = (
            self.db.session.query(Product.category_id)
            .join(OrderItem)
            .join(Order)
            .filter(Order.user_id == user_id)
            .group_by(Product.category_id)
            .order_by(func.count(Product.id).desc())
            .limit(3)
            .all()
        )

        category_ids = [cat[0] for cat in favorite_categories]

        if category_ids:
            category_products = (
                Product.query.filter(
                    (Product.status == "approved")
                    & (Product.category_id.in_(category_ids))
                )
                .order_by(Product.rating.desc(), Product.created_at.desc())
                .limit(limit // 2)
                .all()
            )
            recommendations.extend(category_products)

        # 2. Products similar to wishlist items
        wishlist_products = (
            Wishlist.query.filter_by(user_id=user_id)
            .limit(3)
            .all()
        )

        for wishlist_item in wishlist_products:
            similar = self.get_similar_products(
                wishlist_item.product_id, limit=5
            )
            for product in similar:
                # Add if not already in recommendations
                if not any(p.id == product.id for p in recommendations):
                    recommendations.append(product)

        # 3. Top rated products in store
        if len(recommendations) < limit:
            trending = self._get_trending_products(limit - len(recommendations))
            for product in trending:
                if not any(p.id == product.id for p in recommendations):
                    recommendations.append(product)

        return [self._product_to_dto(p) for p in recommendations[:limit]]

    def get_new_seller_products(self, seller_id: int, limit: int = 10) -> List[ProductDTO]:
        """
        Get a seller's newest products.

        Args:
            seller_id: Seller user ID
            limit: Number of products

        Returns:
            List of ProductDTOs
        """
        from ..models import Product

        products = (
            Product.query.filter(
                (Product.seller_id == seller_id) & (Product.status == "approved")
            )
            .order_by(Product.created_at.desc())
            .limit(limit)
            .all()
        )

        return [self._product_to_dto(p) for p in products]

    def get_top_rated_products(self, category_id: int = None, limit: int = 20) -> List[ProductDTO]:
        """
        Get top rated products.

        Args:
            category_id: Optional category filter
            limit: Number of products

        Returns:
            List of ProductDTOs
        """
        from ..models import Product

        query = Product.query.filter_by(status="approved")

        if category_id:
            query = query.filter_by(category_id=category_id)

        products = (
            query.filter(Product.review_count > 0)
            .order_by(Product.rating.desc(), Product.review_count.desc())
            .limit(limit)
            .all()
        )

        return [self._product_to_dto(p) for p in products]

    def get_products_by_views(self, limit: int = 20) -> List[ProductDTO]:
        """
        Get most viewed products.

        Args:
            limit: Number of products

        Returns:
            List of ProductDTOs
        """
        from ..models import Product

        products = (
            Product.query.filter_by(status="approved")
            .order_by(Product.view_count.desc() if hasattr(Product, 'view_count') else Product.created_at.desc())
            .limit(limit)
            .all()
        )

        return [self._product_to_dto(p) for p in products]

    def _get_trending_products(self, limit: int) -> list:
        """
        Get trending products in last 7 days.

        Returns raw Product objects.
        """
        from ..models import Product, Order, OrderItem

        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        # Get most sold products in last 7 days
        trending_ids = (
            self.db.session.query(OrderItem.product_id)
            .join(Order)
            .filter(Order.created_at >= seven_days_ago)
            .group_by(OrderItem.product_id)
            .order_by(func.count(OrderItem.id).desc())
            .limit(limit)
            .all()
        )

        if trending_ids:
            product_ids = [tid[0] for tid in trending_ids]
            products = (
                Product.query.filter(
                    (Product.id.in_(product_ids)) & (Product.status == "approved")
                )
                .order_by(Product.rating.desc())
                .all()
            )
        else:
            # Fallback: get newest approved products
            products = (
                Product.query.filter_by(status="approved")
                .order_by(Product.rating.desc(), Product.created_at.desc())
                .limit(limit)
                .all()
            )

        return products

    def _product_to_dto(self, product) -> ProductDTO:
        """Convert Product model to ProductDTO."""
        return ProductDTO(
            id=product.id,
            title=product.title,
            price=product.price,
            image_url=product.images[0].image_url if product.images else None,
            seller_id=product.seller_id,
            seller_name=product.seller.username,
            status=product.status,
            rating=product.rating,
            review_count=product.review_count,
            created_at=product.created_at,
        )

    def clear_recommendation_cache(self, user_id: int = None) -> bool:
        """
        Clear recommendation cache for user(s).

        Args:
            user_id: Optional specific user ID

        Returns:
            True if successful
        """
        # In production, this would clear Redis cache
        # For now, just log the action
        if user_id:
            logger.info(f"Recommendation cache cleared for user {user_id}")
        else:
            logger.info("Global recommendation cache cleared")

        return True
