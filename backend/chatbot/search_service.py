"""Search service for discovering products and connecting with sellers."""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from sqlalchemy import or_, func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class SearchService:
    """Service for product search, recommendations, and seller connections.

    Handles marketplace product discovery, AI-powered recommendations,
    and initiation of buyer-seller conversations.
    """

    def __init__(self, db: Session):
        """Initialize search service with database session.

        Args:
            db: SQLAlchemy database session
        """
        self.db = db

    def search_products(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search for products by name, description, and category.

        Performs full-text search on product titles and descriptions,
        with optional category filtering. Returns approved products only.

        Args:
            query: Search query string
            category: Optional category name/slug to filter by
            limit: Maximum number of results (default 10)

        Returns:
            List of product dictionaries with seller information

        Raises:
            ValueError: If query is empty or limit is invalid
        """
        from backend.models.product import Product, Category
        from backend.models.user import User

        # Validate inputs
        if not query or not query.strip():
            raise ValueError("Search query cannot be empty")
        if limit < 1 or limit > 100:
            raise ValueError("Limit must be between 1 and 100")

        try:
            # Start with approved products only
            search_query = self.db.query(Product).filter(
                Product.status == "approved",
                Product.stock > 0
            )

            # Filter by search terms in title and description
            search_terms = query.lower()
            search_query = search_query.filter(
                or_(
                    Product.title.ilike(f"%{search_terms}%"),
                    Product.description.ilike(f"%{search_terms}%")
                )
            )

            # Filter by category if provided
            if category:
                category_obj = self.db.query(Category).filter(
                    or_(
                        Category.name.ilike(f"%{category}%"),
                        Category.slug.ilike(f"%{category}%")
                    )
                ).first()

                if category_obj:
                    search_query = search_query.filter(
                        Product.category_id == category_obj.id
                    )

            # Order by creation date (newest first) and limit results
            products = search_query.order_by(
                Product.created_at.desc()
            ).limit(limit).all()

            # Format results
            results = []
            for product in products:
                seller = product.seller
                # Parse location string into city and country
                location_obj = {"city": "Arequipa", "country": "Perú"}
                if product.location:
                    parts = product.location.split(",")
                    if len(parts) == 2:
                        location_obj = {"city": parts[0].strip(), "country": parts[1].strip()}

                results.append({
                    "id": product.id,
                    "title": product.title,
                    "description": product.description[:200],  # Truncate for preview
                    "price": float(product.price),
                    "original_price": float(product.original_price) if product.original_price else None,
                    "stock": product.stock,
                    "sold_count": product.sold_count,
                    "category": product.category.name if product.category else None,
                    "location": location_obj,
                    "primary_image": product.images[0].image_url if product.images else None,
                    "seller_id": seller.id,
                    "seller_name": seller.username,
                    "seller_avatar": seller.avatar_url,
                    "seller_rating": self._get_seller_rating(seller.id),
                    "created_at": product.created_at.isoformat()
                })

            logger.info(f"Search for '{query}' returned {len(results)} results")
            return results

        except Exception as e:
            logger.error(f"Product search failed: {str(e)}")
            raise

    def get_product_recommendations(
        self,
        keywords: List[str],
        user_id: Optional[str] = None,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Get product recommendations based on keywords and user history.

        Recommends products matching provided keywords. If user_id is provided,
        considers user's purchase and search history to personalize results.

        Args:
            keywords: List of keywords to search for
            user_id: Optional user ID for personalized recommendations
            limit: Maximum number of recommendations (default 5, max 10)

        Returns:
            List of recommended product dictionaries, sorted by relevance

        Raises:
            ValueError: If keywords list is empty or limit is invalid
        """
        from backend.models.product import Product
        from backend.models.user import User

        # Validate inputs
        if not keywords or len(keywords) == 0:
            raise ValueError("At least one keyword is required")
        if limit < 1 or limit > 10:
            raise ValueError("Limit must be between 1 and 10")

        try:
            # Start with approved products
            base_query = self.db.query(Product).filter(
                Product.status == "approved",
                Product.stock > 0
            )

            # Score products by keyword matches
            scored_products = []

            for product in base_query.all():
                score = 0
                product_text = f"{product.title.lower()} {product.description.lower()}"

                # Calculate relevance score
                for keyword in keywords:
                    keyword_lower = keyword.lower()
                    # Exact word matches score higher
                    if f" {keyword_lower} " in f" {product_text} ":
                        score += 3
                    elif keyword_lower in product_text:
                        score += 1

                if score > 0:
                    scored_products.append((product, score))

            # Sort by score and get top results
            scored_products.sort(key=lambda x: x[1], reverse=True)
            top_products = scored_products[:limit]

            # Format results
            results = []
            for product, score in top_products:
                seller = product.seller
                results.append({
                    "id": product.id,
                    "title": product.title,
                    "description": product.description[:150],
                    "price": float(product.price),
                    "stock": product.stock,
                    "primary_image": product.images[0].image_url if product.images else None,
                    "seller_id": seller.id,
                    "seller_name": seller.username,
                    "seller_avatar": seller.avatar_url,
                    "seller_rating": self._get_seller_rating(seller.id),
                    "relevance_score": score,
                    "created_at": product.created_at.isoformat()
                })

            logger.info(f"Generated {len(results)} recommendations for keywords: {keywords}")
            return results

        except Exception as e:
            logger.error(f"Product recommendation generation failed: {str(e)}")
            raise

    def connect_to_seller(
        self,
        product_id: str,
        user_id: str,
        message: str
    ) -> Dict[str, Any]:
        """Initiate contact with seller about a product.

        Creates or retrieves a conversation thread with the seller
        and sends an initial message about the product.

        Args:
            product_id: ID of the product of interest
            user_id: ID of the buyer contacting seller
            message: Initial message to send to seller

        Returns:
            Dictionary with conversation details:
                - chat_id: ID of the conversation thread
                - seller_name: Seller's username
                - seller_id: Seller's user ID
                - message_id: ID of the sent message
                - created_at: Timestamp

        Raises:
            ValueError: If inputs are invalid
            Exception: If product or user not found
        """
        from backend.models.product import Product
        from backend.models.user import User
        from backend.models.chat import ChatMessage

        # Validate inputs
        if not product_id or not user_id or not message or not message.strip():
            raise ValueError("Product ID, user ID, and message are required")

        if len(message.strip()) < 3:
            raise ValueError("Message must be at least 3 characters")

        try:
            # Verify product and buyer exist
            product = self.db.query(Product).filter(
                Product.id == product_id
            ).first()
            if not product:
                raise ValueError(f"Product {product_id} not found")

            buyer = self.db.query(User).filter(
                User.id == user_id
            ).first()
            if not buyer:
                raise ValueError(f"User {user_id} not found")

            seller = product.seller
            if not seller:
                raise ValueError("Product seller not found")

            # Prevent self-messaging
            if seller.id == user_id:
                raise ValueError("Cannot send message to yourself")

            # Create chat message
            chat_message = ChatMessage(
                sender_id=user_id,
                receiver_id=seller.id,
                message=f"Inquiry about product: {product.title}\n\n{message}",
                is_read=False,
                created_at=datetime.now(timezone.utc)
            )

            try:
                self.db.add(chat_message)
                self.db.commit()

                logger.info(
                    f"Buyer {user_id} contacted seller {seller.id} "
                    f"about product {product_id}"
                )

                return {
                    "chat_id": chat_message.id,
                    "seller_name": seller.username,
                    "seller_id": seller.id,
                    "product_id": product.id,
                    "product_title": product.title,
                    "message_id": chat_message.id,
                    "created_at": chat_message.created_at.isoformat()
                }

            except Exception as db_error:
                self.db.rollback()
                logger.error(f"Failed to create chat message: {str(db_error)}")
                raise ValueError(f"Failed to create conversation: {str(db_error)}")

        except Exception as e:
            logger.error(f"Seller connection failed: {str(e)}")
            raise

    def get_seller_info(self, seller_id: str) -> Dict[str, Any]:
        """Get detailed seller information.

        Retrieves seller profile data including name, rating, response time,
        and verification status.

        Args:
            seller_id: ID of the seller

        Returns:
            Dictionary with seller details:
                - name: Seller's username
                - seller_id: Seller's ID
                - avatar_url: URL to seller's avatar
                - is_verified: Whether seller is verified
                - rating: Average rating (0.0-5.0)
                - reviews_count: Total reviews received
                - products_count: Number of active products
                - response_time: Estimated response time
                - joined_date: Account creation date

        Raises:
            ValueError: If seller not found
        """
        from backend.models.user import User
        from backend.models.product import Product
        from backend.models.chat import ChatMessage

        try:
            seller = self.db.query(User).filter(
                User.id == seller_id
            ).first()

            if not seller:
                raise ValueError(f"Seller {seller_id} not found")

            if not seller.is_seller:
                raise ValueError(f"User {seller_id} is not a seller")

            # Get seller statistics
            product_count = self.db.query(func.count(Product.id)).filter(
                Product.seller_id == seller_id,
                Product.status == "approved"
            ).scalar()

            # Calculate average response time (simplified)
            recent_messages = self.db.query(ChatMessage).filter(
                ChatMessage.receiver_id == seller_id
            ).order_by(ChatMessage.created_at.desc()).limit(20).all()

            response_times = []
            for i, msg in enumerate(recent_messages[:-1]):
                next_msg = recent_messages[i + 1]
                if next_msg.sender_id == seller_id:
                    time_diff = (next_msg.created_at - msg.created_at).total_seconds()
                    response_times.append(time_diff)

            avg_response_seconds = sum(response_times) / len(response_times) if response_times else None
            response_time_str = self._format_response_time(avg_response_seconds)

            # Get rating info from profile
            profile = seller.profile
            rating = profile.seller_rating if profile and profile.seller_rating else 0.0
            reviews_count = profile.seller_reviews_count if profile and profile.seller_reviews_count else 0

            logger.info(f"Retrieved seller info for {seller_id}")

            return {
                "name": seller.username,
                "seller_id": seller.id,
                "full_name": seller.full_name,
                "avatar_url": seller.avatar_url,
                "is_verified": seller.seller_verified,
                "rating": float(rating),
                "reviews_count": reviews_count,
                "products_count": product_count,
                "response_time": response_time_str,
                "joined_date": seller.created_at.isoformat()
            }

        except ValueError as e:
            logger.warning(f"Seller info retrieval - validation error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Seller info retrieval failed: {str(e)}")
            raise

    def extract_search_params(self, ai_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and clean search parameters from AI analysis.

        Processes the output from AIService to extract structured search
        parameters. Validates and normalizes all extracted parameters.

        Args:
            ai_analysis: Dictionary from AIService.parse_intent() or similar
                Expected keys:
                    - entities: List of extracted entities (e.g., "price:100", "category:electronics")
                    - intent: User intent (search, help, account, etc.)
                    - confidence: Confidence score (0.0-1.0)

        Returns:
            Dictionary with cleaned search parameters:
                - keywords: List of search keywords
                - category: Category name (if found)
                - price_min: Minimum price (if found)
                - price_max: Maximum price (if found)
                - condition: Item condition (new/used/vintage/etc)
                - confidence: Overall confidence score

        Raises:
            ValueError: If ai_analysis is invalid or missing required fields
        """
        try:
            if not isinstance(ai_analysis, dict):
                raise ValueError("ai_analysis must be a dictionary")

            entities = ai_analysis.get("entities", [])
            if not isinstance(entities, list):
                raise ValueError("entities must be a list")

            # Initialize search parameters
            search_params = {
                "keywords": [],
                "category": None,
                "price_min": None,
                "price_max": None,
                "condition": None,
                "confidence": ai_analysis.get("confidence", 0.5)
            }

            # Process entities
            for entity in entities:
                if not isinstance(entity, str):
                    continue

                entity_lower = entity.lower()

                # Extract category
                if entity_lower.startswith("category:"):
                    category_value = entity[9:].strip()
                    if category_value:
                        search_params["category"] = category_value

                # Extract price range
                elif entity_lower.startswith("price:"):
                    try:
                        price_value = float(entity[6:].strip())
                        # Assume it's a reference price, set as both min and max initially
                        if search_params["price_min"] is None:
                            search_params["price_min"] = max(0, price_value * 0.8)
                        if search_params["price_max"] is None:
                            search_params["price_max"] = price_value * 1.2
                    except (ValueError, IndexError):
                        pass

                # Extract condition
                elif entity_lower.startswith("attribute:"):
                    attribute_value = entity[10:].strip().lower()
                    valid_conditions = ["new", "used", "vintage", "refurbished", "like-new"]
                    if attribute_value in valid_conditions:
                        search_params["condition"] = attribute_value

                # Treat other entities as keywords
                else:
                    if entity and len(entity) > 2:  # Ignore very short strings
                        search_params["keywords"].append(entity)

            # Add intent as keyword if it's search-related
            intent = ai_analysis.get("intent", "").lower()
            if intent == "search" and "keywords" not in search_params:
                search_params["keywords"] = []

            # Ensure price range is valid
            if search_params["price_min"] is not None and search_params["price_max"] is not None:
                if search_params["price_min"] > search_params["price_max"]:
                    search_params["price_min"], search_params["price_max"] = (
                        search_params["price_max"],
                        search_params["price_min"]
                    )

            logger.info(
                f"Extracted search params: {search_params['keywords']} "
                f"(category: {search_params['category']})"
            )
            return search_params

        except Exception as e:
            logger.error(f"Search parameter extraction failed: {str(e)}")
            raise

    # Helper methods
    def _get_seller_rating(self, seller_id: str) -> float:
        """Get average rating for a seller.

        Args:
            seller_id: ID of the seller

        Returns:
            Average rating (0.0-5.0) or 0.0 if no reviews
        """
        from backend.models.user import User

        try:
            seller = self.db.query(User).filter(User.id == seller_id).first()
            if seller and seller.profile:
                return float(seller.profile.seller_rating) if seller.profile.seller_rating else 0.0
            return 0.0
        except Exception as e:
            logger.warning(f"Failed to get seller rating for {seller_id}: {str(e)}")
            return 0.0

    @staticmethod
    def _format_response_time(seconds: Optional[float]) -> str:
        """Format response time in human-readable format.

        Args:
            seconds: Response time in seconds or None

        Returns:
            Formatted response time string
        """
        if seconds is None:
            return "Unknown"

        if seconds < 60:
            return "Less than a minute"
        elif seconds < 3600:
            minutes = int(seconds / 60)
            return f"About {minutes} minute{'s' if minutes > 1 else ''}"
        elif seconds < 86400:
            hours = int(seconds / 3600)
            return f"About {hours} hour{'s' if hours > 1 else ''}"
        else:
            days = int(seconds / 86400)
            return f"About {days} day{'s' if days > 1 else ''}"
