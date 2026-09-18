"""Product service for CRUD operations, search, and recommendations."""

import logging
from typing import List, Optional, Tuple
from datetime import datetime
from math import radians, cos, sin, asin, sqrt

from ..dtos import (
    ProductDTO,
    ProductDetailDTO,
    ProductImageDTO,
    CreateProductDTO,
    UpdateProductDTO,
)
from ..exceptions import (
    ProductNotFoundException,
    UserNotFoundException,
    ValidationException,
    UnauthorizedAccessException,
)


logger = logging.getLogger(__name__)


class ProductService:
    """Service for product management and search."""

    def __init__(self, db):
        """Initialize service with database instance."""
        self.db = db

    def create_product(
        self, seller_id: int, data: CreateProductDTO, images: List[str] = None
    ) -> ProductDTO:
        """
        Create a new product.

        Args:
            seller_id: Seller user ID
            data: CreateProductDTO with product details
            images: List of image URLs

        Returns:
            ProductDTO with created product

        Raises:
            UserNotFoundException: If seller not found
            ValidationException: If validation fails
        """
        from ..models import User, Product, ProductImage

        # Verify seller exists
        seller = User.query.get(seller_id)
        if not seller or not seller.profile or not seller.profile.is_seller:
            raise UserNotFoundException("Seller not found or not verified")

        # Validate input
        if not data.title or len(data.title) < 3:
            raise ValidationException("Title must be at least 3 characters")
        if not data.description or len(data.description) < 10:
            raise ValidationException("Description must be at least 10 characters")
        if data.price <= 0:
            raise ValidationException("Price must be greater than 0")
        if data.stock < 0:
            raise ValidationException("Stock cannot be negative")

        # Create product
        product = Product(
            seller_id=seller_id,
            category_id=data.category_id,
            title=data.title,
            description=data.description,
            price=data.price,
            stock=data.stock,
            location=data.location,
            status="pending_approval",
            rating=0.0,
            review_count=0,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        try:
            self.db.session.add(product)
            self.db.session.flush()

            # Add images
            if images:
                for idx, image_url in enumerate(images):
                    product_image = ProductImage(
                        product_id=product.id,
                        image_url=image_url,
                        order=idx,
                        is_main=(idx == 0),
                    )
                    self.db.session.add(product_image)

            self.db.session.commit()
            logger.info(f"Product created: {product.id} by seller {seller_id}")

            return ProductDTO(
                id=product.id,
                title=product.title,
                price=product.price,
                image_url=images[0] if images else None,
                seller_id=product.seller_id,
                seller_name=seller.username,
                status=product.status,
                rating=product.rating,
                review_count=product.review_count,
                created_at=product.created_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Product creation failed: {str(e)}")
            raise ValidationException(f"Product creation failed: {str(e)}")

    def get_product_details(self, product_id: int) -> ProductDetailDTO:
        """
        Get detailed product information.

        Args:
            product_id: Product ID

        Returns:
            ProductDetailDTO with full product details

        Raises:
            ProductNotFoundException: If product not found
        """
        from ..models import Product, Review

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        # Get seller info
        seller = product.seller
        profile = seller.profile

        # Get images
        images = [
            ProductImageDTO(
                id=img.id,
                product_id=img.product_id,
                image_url=img.image_url,
                order=img.order,
                is_main=img.is_main,
            )
            for img in product.images
        ]

        # Get reviews
        reviews = Review.query.filter_by(product_id=product_id).all()

        return ProductDetailDTO(
            id=product.id,
            title=product.title,
            description=product.description,
            price=product.price,
            category_id=product.category_id,
            category_name=product.category.name if product.category else "Uncategorized",
            seller_id=product.seller_id,
            seller_name=seller.username,
            seller_avatar=profile.avatar_url if profile else None,
            seller_rating=profile.rating if profile else 0.0,
            status=product.status,
            rating=product.rating,
            review_count=product.review_count,
            stock=product.stock,
            images=images,
            created_at=product.created_at,
        )

    def update_product(
        self, product_id: int, seller_id: int, data: UpdateProductDTO
    ) -> ProductDTO:
        """
        Update product details.

        Args:
            product_id: Product ID
            seller_id: Seller user ID (for authorization)
            data: UpdateProductDTO with fields to update

        Returns:
            Updated ProductDTO

        Raises:
            ProductNotFoundException: If product not found
            UnauthorizedAccessException: If seller doesn't own product
            ValidationException: If validation fails
        """
        from ..models import Product

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        # Verify authorization
        if product.seller_id != seller_id:
            raise UnauthorizedAccessException()

        # Update fields if provided
        if data.title:
            product.title = data.title
        if data.description:
            product.description = data.description
        if data.price is not None:
            if data.price <= 0:
                raise ValidationException("Price must be greater than 0")
            product.price = data.price
        if data.category_id is not None:
            product.category_id = data.category_id
        if data.stock is not None:
            if data.stock < 0:
                raise ValidationException("Stock cannot be negative")
            product.stock = data.stock
        if data.location:
            product.location = data.location

        product.updated_at = datetime.utcnow()

        try:
            self.db.session.commit()
            logger.info(f"Product updated: {product_id}")

            seller = product.seller
            return ProductDTO(
                id=product.id,
                title=product.title,
                price=product.price,
                image_url=product.images[0].image_url if product.images else None,
                seller_id=product.seller_id,
                seller_name=seller.username,
                status=product.status,
                rating=product.rating,
                review_count=product.review_count,
                created_at=product.created_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Product update failed: {str(e)}")
            raise ValidationException(f"Product update failed: {str(e)}")

    def delete_product(self, product_id: int, seller_id: int) -> bool:
        """
        Delete a product.

        Args:
            product_id: Product ID
            seller_id: Seller user ID (for authorization)

        Returns:
            True if deletion successful

        Raises:
            ProductNotFoundException: If product not found
            UnauthorizedAccessException: If seller doesn't own product
        """
        from ..models import Product

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        if product.seller_id != seller_id:
            raise UnauthorizedAccessException()

        try:
            self.db.session.delete(product)
            self.db.session.commit()
            logger.info(f"Product deleted: {product_id}")
            return True

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Product deletion failed: {str(e)}")
            return False

    def list_products(
        self,
        category_id: Optional[int] = None,
        status: str = "approved",
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[ProductDTO], int]:
        """
        List products with optional filtering.

        Args:
            category_id: Optional category filter
            status: Product status filter (default: approved)
            limit: Number of results to return
            offset: Offset for pagination

        Returns:
            Tuple of (products list, total count)
        """
        from ..models import Product

        query = Product.query.filter_by(status=status)

        if category_id:
            query = query.filter_by(category_id=category_id)

        total = query.count()
        products = query.offset(offset).limit(limit).all()

        product_dtos = [
            ProductDTO(
                id=p.id,
                title=p.title,
                price=p.price,
                image_url=p.images[0].image_url if p.images else None,
                seller_id=p.seller_id,
                seller_name=p.seller.username,
                status=p.status,
                rating=p.rating,
                review_count=p.review_count,
                created_at=p.created_at,
            )
            for p in products
        ]

        return product_dtos, total

    def search_products(
        self,
        query: str,
        category_id: Optional[int] = None,
        price_min: Optional[float] = None,
        price_max: Optional[float] = None,
        location: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[ProductDTO], int]:
        """
        Search products with filters.

        Args:
            query: Search query string
            category_id: Optional category filter
            price_min: Minimum price filter
            price_max: Maximum price filter
            location: Location filter
            limit: Number of results
            offset: Pagination offset

        Returns:
            Tuple of (products list, total count)
        """
        from ..models import Product

        search_query = Product.query.filter_by(status="approved")

        # Text search on title and description
        if query:
            search_query = search_query.filter(
                (Product.title.ilike(f"%{query}%"))
                | (Product.description.ilike(f"%{query}%"))
            )

        # Category filter
        if category_id:
            search_query = search_query.filter_by(category_id=category_id)

        # Price range filter
        if price_min is not None:
            search_query = search_query.filter(Product.price >= price_min)
        if price_max is not None:
            search_query = search_query.filter(Product.price <= price_max)

        # Location filter
        if location:
            search_query = search_query.filter(
                Product.location.ilike(f"%{location}%")
            )

        total = search_query.count()
        products = search_query.offset(offset).limit(limit).all()

        product_dtos = [
            ProductDTO(
                id=p.id,
                title=p.title,
                price=p.price,
                image_url=p.images[0].image_url if p.images else None,
                seller_id=p.seller_id,
                seller_name=p.seller.username,
                status=p.status,
                rating=p.rating,
                review_count=p.review_count,
                created_at=p.created_at,
            )
            for p in products
        ]

        return product_dtos, total

    def filter_by_distance(
        self,
        latitude: float,
        longitude: float,
        radius_km: float = 50,
        limit: int = 20,
    ) -> List[ProductDTO]:
        """
        Filter products by distance from coordinates.

        Args:
            latitude: User latitude
            longitude: User longitude
            radius_km: Search radius in kilometers
            limit: Maximum results

        Returns:
            List of nearby products
        """
        from ..models import Product

        products = Product.query.filter_by(status="approved").limit(limit * 2).all()

        # Calculate distance and filter
        nearby_products = []
        for product in products:
            if not product.location:
                continue

            # This is a simplified calculation
            # In production, use proper geocoding/haversine formula
            distance = self._haversine_distance(
                latitude, longitude, latitude, longitude
            )  # Placeholder

            if distance <= radius_km:
                nearby_products.append(
                    ProductDTO(
                        id=product.id,
                        title=product.title,
                        price=product.price,
                        image_url=product.images[0].image_url
                        if product.images
                        else None,
                        seller_id=product.seller_id,
                        seller_name=product.seller.username,
                        status=product.status,
                        rating=product.rating,
                        review_count=product.review_count,
                        created_at=product.created_at,
                    )
                )

            if len(nearby_products) >= limit:
                break

        return nearby_products

    @staticmethod
    def _haversine_distance(
        lat1: float, lon1: float, lat2: float, lon2: float
    ) -> float:
        """
        Calculate haversine distance between two coordinates in kilometers.

        Args:
            lat1, lon1: First coordinate
            lat2, lon2: Second coordinate

        Returns:
            Distance in kilometers
        """
        # Convert to radians
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])

        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        c = 2 * asin(sqrt(a))
        r = 6371  # Radius of Earth in kilometers

        return c * r

    def add_product_image(
        self, product_id: int, seller_id: int, image_url: str, is_main: bool = False
    ) -> ProductImageDTO:
        """
        Add image to product.

        Args:
            product_id: Product ID
            seller_id: Seller ID (for authorization)
            image_url: Image URL
            is_main: Whether this is main image

        Returns:
            ProductImageDTO

        Raises:
            ProductNotFoundException: If product not found
            UnauthorizedAccessException: If not product owner
        """
        from ..models import Product, ProductImage

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        if product.seller_id != seller_id:
            raise UnauthorizedAccessException()

        # Get next order
        next_order = len(product.images)

        image = ProductImage(
            product_id=product_id, image_url=image_url, order=next_order, is_main=is_main
        )

        try:
            self.db.session.add(image)
            self.db.session.commit()
            logger.info(f"Image added to product {product_id}")

            return ProductImageDTO(
                id=image.id,
                product_id=image.product_id,
                image_url=image.image_url,
                order=image.order,
                is_main=image.is_main,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Image addition failed: {str(e)}")
            raise ValidationException(f"Image addition failed: {str(e)}")

    def delete_product_image(
        self, product_id: int, image_id: int, seller_id: int
    ) -> bool:
        """
        Delete product image.

        Args:
            product_id: Product ID
            image_id: Image ID
            seller_id: Seller ID (for authorization)

        Returns:
            True if successful

        Raises:
            ProductNotFoundException: If product not found
            UnauthorizedAccessException: If not product owner
        """
        from ..models import Product, ProductImage

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        if product.seller_id != seller_id:
            raise UnauthorizedAccessException()

        image = ProductImage.query.get(image_id)
        if not image or image.product_id != product_id:
            return False

        try:
            self.db.session.delete(image)
            self.db.session.commit()
            logger.info(f"Image deleted: {image_id}")
            return True

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Image deletion failed: {str(e)}")
            return False
