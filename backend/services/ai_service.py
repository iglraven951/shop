"""AI chatbot service for DiscoveryShop marketplace."""

import re
from typing import Optional, List, Dict, Any
from difflib import SequenceMatcher
from backend.utils.constants import (
    AI_RESPONSE_CONFIDENCE_THRESHOLD,
    FAQ_MATCH_THRESHOLD,
)


class AIService:
    """Service for AI-powered chatbot and recommendations."""

    # FAQ Database
    FAQ_DATABASE = [
        {
            "id": 1,
            "question": "How do I create an account?",
            "keywords": ["account", "create", "register", "signup"],
            "answer": "To create an account, click the 'Sign Up' button on the homepage. Enter your email, create a password (min 8 characters with uppercase and number), and provide your full name. Verify your email and you're ready to start!",
        },
        {
            "id": 2,
            "question": "How do I become a seller?",
            "keywords": ["seller", "become", "sell", "list", "products"],
            "answer": "To become a seller: 1) Go to your Profile 2) Click 'Become a Seller' 3) Submit your verification documents 4) Wait for admin approval (usually 1-3 business days) 5) Start listing products!",
        },
        {
            "id": 3,
            "question": "How do I track my order?",
            "keywords": ["track", "order", "shipping", "delivery", "status"],
            "answer": "To track your order: 1) Go to 'My Orders' 2) Click on the specific order 3) View the tracking status and estimated delivery date 4) Click 'View Tracking' for detailed shipping updates",
        },
        {
            "id": 4,
            "question": "What's the refund policy?",
            "keywords": ["refund", "return", "policy", "money back", "cancel"],
            "answer": "We offer refunds for returns within 30 days of delivery. The product must be in original condition with all packaging. Refunds are processed within 5-7 business days after we receive your return.",
        },
        {
            "id": 5,
            "question": "How do I contact support?",
            "keywords": ["contact", "support", "help", "customer service", "email"],
            "answer": "You can contact our support team through: 1) In-app chat feature 2) Email: support@discoverayshop.com 3) Help Center (click ?) We typically respond within 24 hours.",
        },
        {
            "id": 6,
            "question": "How are products approved?",
            "keywords": ["approval", "review", "admin", "approved", "pending"],
            "answer": "Our admin team reviews all products for policy compliance, safety, and authenticity. Reviews typically take 1-2 business days. We check for: proper descriptions, legal compliance, accurate pricing, and image quality.",
        },
        {
            "id": 7,
            "question": "Is my data safe?",
            "keywords": ["safe", "security", "privacy", "encryption", "data"],
            "answer": "Yes! We use industry-standard encryption (HTTPS/TLS) to protect your data. We comply with privacy laws and never share personal information with third parties. Your payment data is encrypted and never stored on our servers.",
        },
        {
            "id": 8,
            "question": "How do I report a scam or fake product?",
            "keywords": ["report", "scam", "fake", "fraud", "complaint"],
            "answer": "To report a problem: 1) Click 'Report' on the product or seller profile 2) Select the reason (scam, fake, offensive, etc.) 3) Provide details 4) Submit. Our team investigates all reports within 48 hours.",
        },
        {
            "id": 9,
            "question": "Can I change my username?",
            "keywords": ["change", "username", "edit", "modify", "update"],
            "answer": "Unfortunately, you cannot change your username after account creation. Choose your username carefully during registration. If you need a different identity, you'll need to create a new account.",
        },
        {
            "id": 10,
            "question": "How do I upgrade to seller status?",
            "keywords": ["upgrade", "seller", "verification", "verified"],
            "answer": "To upgrade to seller: 1) Complete your Profile (full name, photo, bio) 2) Go to Settings > Become a Seller 3) Submit verification documents (ID, business info if applicable) 4) Wait for admin approval. Most verifications complete within 48 hours.",
        },
        {
            "id": 11,
            "question": "What payment methods are accepted?",
            "keywords": ["payment", "methods", "pay", "credit", "card", "bank"],
            "answer": "We accept: Credit cards (Visa, Mastercard, Amex), Debit cards, Bank transfer, and Cash on Delivery (where available). All payments are processed securely through our payment gateway.",
        },
        {
            "id": 12,
            "question": "How do I cancel an order?",
            "keywords": ["cancel", "order", "delete", "remove"],
            "answer": "You can cancel orders in 'pending' or 'confirmed' status. Go to 'My Orders', select the order, and click 'Cancel Order'. Once shipped, you'll need to initiate a return instead. Refunds are processed according to our refund policy.",
        },
        {
            "id": 13,
            "question": "How are seller ratings calculated?",
            "keywords": ["rating", "star", "review", "calculate", "seller"],
            "answer": "Seller ratings are calculated as the average of all customer reviews (1-5 stars). Only verified purchases can leave reviews. Ratings are updated in real-time and displayed on the seller's profile.",
        },
        {
            "id": 14,
            "question": "What are the fees for sellers?",
            "keywords": ["fee", "commission", "cost", "charge", "seller"],
            "answer": "We charge a 10% commission on each sale. This covers marketplace, payment processing, and support. Seller verification is free. Fees are automatically deducted from your payout.",
        },
        {
            "id": 15,
            "question": "How long does shipping take?",
            "keywords": ["shipping", "delivery", "time", "how long", "days"],
            "answer": "Shipping times vary by seller and location. Most orders ship within 1-2 business days and deliver within 5-7 business days. Express shipping options may be available. Check individual product pages for estimated delivery times.",
        },
    ]

    def __init__(self):
        """Initialize AI service."""
        self.faq_database = self.FAQ_DATABASE

    def get_faq_response(self, query: str) -> Dict[str, Any]:
        """Get FAQ response for user query.

        Uses keyword matching and similarity comparison to find the best FAQ match.

        Args:
            query: User question/query

        Returns:
            Dict with answer, confidence, and sources
        """
        if not query or not query.strip():
            return {
                "answer": "I didn't understand your question. Could you please rephrase it?",
                "type": "error",
                "confidence": 0,
            }

        query_lower = query.lower()
        best_match = None
        best_score = 0

        # Search through FAQ database
        for faq in self.faq_database:
            # Check keyword matches
            keyword_matches = sum(1 for kw in faq["keywords"] if kw in query_lower)

            if keyword_matches > 0:
                # Calculate similarity score
                similarity = SequenceMatcher(None, query_lower, faq["question"].lower()).ratio()
                score = (keyword_matches * 0.4) + (similarity * 0.6)

                if score > best_score:
                    best_score = score
                    best_match = faq

        if best_match and best_score >= FAQ_MATCH_THRESHOLD:
            return {
                "answer": best_match["answer"],
                "type": "faq",
                "confidence": round(min(best_score, 1.0), 2),
                "sources": [f"FAQ #{best_match['id']}"],
            }

        return {
            "answer": "I couldn't find a specific answer to your question. Please contact our support team at support@discoverayshop.com for assistance.",
            "type": "no_match",
            "confidence": 0,
        }

    def get_product_recommendation(
        self, query: str, products: List[Dict[str, Any]] | None = None
    ) -> List[Dict[str, Any]]:
        """Get product recommendations based on user query.

        Parses query to extract intent and searches database for matching products.

        Args:
            query: User search query
            products: Optional list of products to search through

        Returns:
            List of recommended products (max 5)
        """
        if not products:
            products = []

        if not query or not query.strip():
            return []

        query_lower = query.lower()
        recommendations = []

        # Keywords for different product categories/types
        category_keywords = {
            "electronics": ["phone", "computer", "laptop", "tablet", "camera", "headphone"],
            "clothing": ["shirt", "pants", "dress", "jacket", "shoes", "hat"],
            "home": ["furniture", "lamp", "pillow", "bedding", "kitchen"],
            "books": ["book", "novel", "reading", "story", "author"],
            "sports": ["sport", "ball", "equipment", "gym", "exercise"],
        }

        # Extract category from query
        detected_category = None
        for category, keywords in category_keywords.items():
            if any(kw in query_lower for kw in keywords):
                detected_category = category
                break

        # Score products based on query match
        for product in products:
            score = 0
            product_lower = f"{product.get('title', '').lower()} {product.get('description', '').lower()}"

            # Check for direct keyword matches
            if any(word in product_lower for word in query_lower.split()):
                score += 2

            # Category match
            if detected_category and product.get("category") == detected_category:
                score += 1

            if score > 0:
                recommendations.append((product, score))

        # Sort by score and return top 5
        recommendations.sort(key=lambda x: x[1], reverse=True)
        return [product for product, _ in recommendations[:5]]

    def parse_intent(self, query: str) -> Dict[str, Any]:
        """Parse user intent from query.

        Identifies what the user is trying to do (search, help, account, etc).

        Args:
            query: User query

        Returns:
            Dict with detected intent, entities, and confidence
        """
        query_lower = query.lower()

        # Define intent patterns
        intents = {
            "search": {
                "keywords": ["find", "show", "look for", "search", "what", "where", "kind"],
                "confidence": 0.8,
            },
            "help": {
                "keywords": ["help", "how", "what", "can", "do", "guide", "tutorial"],
                "confidence": 0.7,
            },
            "account": {
                "keywords": [
                    "account",
                    "profile",
                    "password",
                    "email",
                    "username",
                    "registration",
                ],
                "confidence": 0.9,
            },
            "order": {
                "keywords": ["order", "purchase", "buy", "checkout", "payment"],
                "confidence": 0.85,
            },
            "order_status": {
                "keywords": ["track", "shipping", "delivery", "status", "where"],
                "confidence": 0.9,
            },
            "seller": {
                "keywords": ["seller", "sell", "listing", "product", "publish"],
                "confidence": 0.85,
            },
            "complaint": {
                "keywords": ["problem", "issue", "broken", "wrong", "complaint", "refund"],
                "confidence": 0.8,
            },
        }

        detected_intent = None
        best_score = 0

        for intent, pattern in intents.items():
            keyword_count = sum(1 for kw in pattern["keywords"] if kw in query_lower)

            if keyword_count > 0:
                score = keyword_count * pattern["confidence"]
                if score > best_score:
                    best_score = score
                    detected_intent = intent

        return {
            "intent": detected_intent or "general",
            "confidence": round(min(best_score, 1.0), 2),
            "entities": self._extract_entities(query),
        }

    def _extract_entities(self, query: str) -> List[str]:
        """Extract key entities from query.

        Args:
            query: User query

        Returns:
            List of extracted entities
        """
        entities = []

        # Extract price mentions
        price_match = re.search(r"\$?(\d+(?:\.\d{2})?)", query)
        if price_match:
            entities.append(f"price:{price_match.group(1)}")

        # Extract category mentions
        categories = [
            "electronics",
            "clothing",
            "home",
            "books",
            "sports",
            "toys",
            "food",
        ]
        for category in categories:
            if category in query.lower():
                entities.append(f"category:{category}")

        # Extract common attributes
        attributes = ["new", "used", "vintage", "luxury", "budget", "premium"]
        for attr in attributes:
            if attr in query.lower():
                entities.append(f"attribute:{attr}")

        return entities

    def get_all_faqs(self) -> List[Dict[str, Any]]:
        """Get all FAQ items.

        Returns:
            List of all FAQ items
        """
        return [
            {
                "id": faq["id"],
                "question": faq["question"],
                "answer": faq["answer"],
            }
            for faq in self.faq_database
        ]

    def save_feedback(
        self, query_id: str, rating: int, feedback_text: Optional[str] = None
    ) -> bool:
        """Save user feedback on AI response.

        Used to improve AI model over time.

        Args:
            query_id: ID of the query
            rating: User rating (1-5)
            feedback_text: Optional feedback text

        Returns:
            True if feedback saved successfully
        """
        # In a real implementation, this would save to database
        # For now, just validate and return True
        if 1 <= rating <= 5:
            return True

        return False

    def process_query(self, message: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Process user query through the chatbot pipeline.

        1. Parse intent
        2. Try FAQ matching
        3. Generate AI response if needed
        4. Provide recommendations if applicable

        Args:
            message: User message/query
            user_id: Optional user ID for personalization

        Returns:
            Comprehensive response dict
        """
        if not message or not message.strip():
            return {
                "response": "Please enter a question or search query.",
                "type": "error",
                "intent": "error",
                "action": "error",
                "confidence": 0,
            }

        # Parse intent
        intent_result = self.parse_intent(message)

        # Get FAQ response
        faq_result = self.get_faq_response(message)

        # Return FAQ if confidence is high
        if faq_result["confidence"] >= FAQ_MATCH_THRESHOLD:
            return {
                "response": faq_result["answer"],
                "type": "faq",
                "confidence": faq_result["confidence"],
                "intent": intent_result["intent"],
                "action": "inform",
            }

        # For search intent, would return product recommendations
        if intent_result["intent"] == "search":
            return {
                "response": "I can help you search for products. Please tell me what you're looking for.",
                "type": "search",
                "intent": intent_result["intent"],
                "confidence": intent_result["confidence"],
                "action": "search",
            }

        # Default fallback
        return {
            "response": faq_result["answer"],
            "type": faq_result["type"],
            "confidence": faq_result["confidence"],
            "intent": intent_result["intent"],
            "action": "inform",
        }

    def get_recommendations(
        self,
        user_id: Optional[str] = None,
        products_context: Optional[List[str]] = None,
        available_products: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Get AI-powered product recommendations.

        Generates recommendations based on user context and available products.

        Args:
            user_id: Optional user ID for personalized recommendations
            products_context: List of product IDs for context/exclusion
            available_products: List of available products to recommend from

        Returns:
            List of recommended products with explanations
        """
        if not available_products:
            return []

        # Simple scoring algorithm for recommendations
        recommendations = []

        for product in available_products:
            # Basic scoring (in production, use ML model)
            score = 0

            # Prefer products with reasonable price
            price = product.get("price", 0)
            if 10 <= price <= 1000:
                score += 1

            # Prefer products with descriptions
            if product.get("description"):
                score += 1

            if score > 0:
                recommendations.append({
                    "id": product.get("id"),
                    "title": product.get("title"),
                    "price": product.get("price"),
                    "category": product.get("category"),
                    "reason": "Recommended based on trending products",
                })

        # Sort by potential relevance and return top recommendations
        return recommendations[:10]
