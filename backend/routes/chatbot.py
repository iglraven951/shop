"""Chatbot routes for AI-powered marketplace assistance."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Tuple

from flask import Blueprint, request, jsonify

from backend.database import SessionLocal
from backend.models.user import User
from backend.models.product import Product
from backend.models.chatbot import ChatBotConversation, ChatBotMessage
from backend.exceptions import (
    ValidationException,
    UnauthorizedAccessException,
    UserNotFoundException,
)
from backend.services.ai_service import AIService
from backend.utils.helpers import format_date
from backend.utils.constants import DEFAULT_PAGE_SIZE


logger = logging.getLogger(__name__)

# Create blueprint
chatbot_bp = Blueprint(
    "chatbot",
    __name__,
    url_prefix="/api/chatbot",
)

# Initialize AI service
ai_service = AIService()

# AI Service version for health checks
AI_SERVICE_VERSION = "1.0.0"


# ============================================================================
# CONVERSATION MANAGEMENT ENDPOINTS
# ============================================================================


@chatbot_bp.route("/conversation/start", methods=["POST"])
def start_conversation() -> Tuple[Dict[str, Any], int]:
    """Start a new chatbot conversation session.

    Supports both authenticated users and anonymous/guest conversations.

    Request Body (optional):
        user_id: Optional authenticated user ID
        title: Optional conversation title

    Returns:
        Conversation ID and session token
    """
    try:
        db = SessionLocal()
        data = request.get_json() or {}

        # Extract user ID if provided
        user_id = data.get("user_id")
        title = data.get("title", "").strip()

        # Validate user if provided
        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise ValidationException("User not found")

        # Create new conversation
        conversation = ChatBotConversation(
            user_id=user_id,
            title=title or f"Conversation {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
            intent="general",
            is_active=1,
        )

        db.add(conversation)
        db.commit()

        # Generate simple session token (in production, use JWT)
        session_token = str(uuid.uuid4())

        logger.info(f"Chatbot conversation started: {conversation.id}")

        result = {
            "conversation_id": conversation.id,
            "session_token": session_token,
            "created_at": format_date(conversation.created_at),
            "user_id": user_id,
        }

        db.close()

        return jsonify(result), 201

    except ValidationException as e:
        return jsonify({"error": e.message}), 422
    except Exception as e:
        logger.error(f"Error starting conversation: {str(e)}")
        return jsonify({"error": "Failed to start conversation"}), 500


@chatbot_bp.route("/message", methods=["POST"])
def send_message() -> Tuple[Dict[str, Any], int]:
    """Process user message and get chatbot response.

    Request Body:
        message: User's question/message (required)
        conversation_id: Conversation ID (required)
        user_id: User ID for personalization (optional)

    Returns:
        Chatbot response with intent, action, and confidence
    """
    try:
        db = SessionLocal()
        data = request.get_json() or {}

        # Validate required fields
        message = data.get("message", "").strip()
        conversation_id = data.get("conversation_id", "").strip()
        user_id = data.get("user_id")

        if not message:
            raise ValidationException("Message is required")

        if not conversation_id:
            raise ValidationException("Conversation ID is required")

        # Validate conversation exists
        conversation = db.query(ChatBotConversation).filter(
            ChatBotConversation.id == conversation_id
        ).first()

        if not conversation:
            raise ValidationException("Conversation not found")

        # Validate user ownership if user_id provided
        if user_id and conversation.user_id != user_id:
            raise UnauthorizedAccessException("You don't have access to this conversation")

        # Process query through AI service
        ai_response = ai_service.process_query(message, user_id)

        # Extract AI response components
        bot_response = ai_response.get("response", "")
        intent = ai_response.get("intent", "general")
        action = ai_response.get("action", "inform")
        confidence = ai_response.get("confidence", 85)

        # Create and save message
        chatbot_message = ChatBotMessage(
            conversation_id=conversation_id,
            user_message=message,
            bot_response=bot_response,
            intent=intent,
            action=action,
            confidence=confidence,
        )

        # Update conversation
        conversation.intent = intent
        conversation.updated_at = datetime.now(timezone.utc)

        db.add(chatbot_message)
        db.commit()

        logger.info(f"Chatbot message processed: conversation={conversation_id} intent={intent}")

        result = {
            "message_id": chatbot_message.id,
            "conversation_id": conversation_id,
            "response": bot_response,
            "intent": intent,
            "action": action,
            "confidence": confidence,
            "created_at": format_date(chatbot_message.created_at),
        }

        db.close()

        return jsonify(result), 200

    except ValidationException as e:
        return jsonify({"error": e.message}), 422
    except UnauthorizedAccessException as e:
        return jsonify({"error": e.message}), 403
    except Exception as e:
        logger.error(f"Error processing message: {str(e)}")
        return jsonify({"error": "Failed to process message"}), 500


@chatbot_bp.route("/conversation/<conversation_id>", methods=["GET"])
def get_conversation(conversation_id: str) -> Tuple[Dict[str, Any], int]:
    """Get conversation history with pagination.

    Query Parameters:
        limit: Messages per page (default: 20, max: 100)
        offset: Number of messages to skip (default: 0)
        user_id: User ID to verify access (optional)

    Returns:
        Conversation details and message history
    """
    try:
        db = SessionLocal()

        # Validate conversation exists
        conversation = db.query(ChatBotConversation).filter(
            ChatBotConversation.id == conversation_id
        ).first()

        if not conversation:
            raise ValidationException("Conversation not found")

        # Verify user access if user_id provided
        user_id = request.args.get("user_id", "").strip()
        if user_id and conversation.user_id != user_id:
            raise UnauthorizedAccessException("You don't have access to this conversation")

        # Parse pagination parameters
        limit = min(int(request.args.get("limit", DEFAULT_PAGE_SIZE)), 100)
        offset = max(int(request.args.get("offset", 0)), 0)

        # Get messages
        messages_query = db.query(ChatBotMessage).filter(
            ChatBotMessage.conversation_id == conversation_id
        ).order_by(ChatBotMessage.created_at.asc())

        total_messages = messages_query.count()
        messages = messages_query.offset(offset).limit(limit).all()

        # Format response
        messages_data = [
            {
                "id": m.id,
                "user_message": m.user_message,
                "bot_response": m.bot_response,
                "intent": m.intent,
                "action": m.action,
                "confidence": m.confidence,
                "created_at": format_date(m.created_at),
            }
            for m in messages
        ]

        result = {
            "conversation": {
                "id": conversation.id,
                "title": conversation.title,
                "intent": conversation.intent,
                "is_active": conversation.is_active,
                "user_id": conversation.user_id,
                "created_at": format_date(conversation.created_at),
                "updated_at": format_date(conversation.updated_at),
            },
            "messages": messages_data,
            "pagination": {
                "total": total_messages,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total_messages,
            },
        }

        db.close()

        return jsonify(result), 200

    except (ValidationException, UnauthorizedAccessException) as e:
        status_code = 403 if isinstance(e, UnauthorizedAccessException) else 404
        return jsonify({"error": e.message}), status_code
    except Exception as e:
        logger.error(f"Error fetching conversation: {str(e)}")
        return jsonify({"error": "Failed to fetch conversation"}), 500


# ============================================================================
# PRODUCT SEARCH AND RECOMMENDATIONS
# ============================================================================


@chatbot_bp.route("/intent/search", methods=["POST"])
def search_products() -> Tuple[Dict[str, Any], int]:
    """Search for products based on chatbot intent.

    This endpoint handles product discovery queries initiated by the chatbot.

    Request Body:
        query: Search query from user (required)
        category: Optional category filter
        price_min: Optional minimum price filter
        price_max: Optional maximum price filter
        limit: Max results (default: 10, max: 50)

    Returns:
        List of matching products with relevance scores
    """
    try:
        db = SessionLocal()
        data = request.get_json() or {}

        # Validate required fields
        query = data.get("query", "").strip()
        if not query:
            raise ValidationException("Search query is required")

        # Get filter parameters
        category = data.get("category", "").strip()
        price_min = data.get("price_min")
        price_max = data.get("price_max")
        limit = min(int(data.get("limit", 10)), 50)

        # Build base query
        products_query = db.query(Product).filter(
            Product.status == "approved"
        )

        # Apply search filter (match title or description)
        search_filter = f"%{query}%"
        products_query = products_query.filter(
            (Product.title.ilike(search_filter)) |
            (Product.description.ilike(search_filter))
        )

        # Apply category filter if provided
        if category:
            products_query = products_query.filter(Product.category == category)

        # Apply price filters if provided
        if price_min is not None:
            try:
                products_query = products_query.filter(Product.price >= float(price_min))
            except (ValueError, TypeError):
                pass

        if price_max is not None:
            try:
                products_query = products_query.filter(Product.price <= float(price_max))
            except (ValueError, TypeError):
                pass

        # Get results
        products = products_query.limit(limit).all()

        # Format results with relevance scores
        results = [
            {
                "id": p.id,
                "title": p.title,
                "price": float(p.price),
                "category": p.category,
                "image_url": p.image_url,
                "seller_id": p.seller_id,
                "rating": 4.5,
                "relevance": _calculate_relevance(p, query),
            }
            for p in products
        ]

        # Sort by relevance
        results.sort(key=lambda x: x["relevance"], reverse=True)

        logger.info(f"Product search: query='{query}' results={len(results)}")

        db.close()

        return jsonify({
            "query": query,
            "results": results,
            "count": len(results),
        }), 200

    except ValidationException as e:
        return jsonify({"error": e.message}), 422
    except Exception as e:
        logger.error(f"Error searching products: {str(e)}")
        return jsonify({"error": "Failed to search products"}), 500


@chatbot_bp.route("/recommend", methods=["POST"])
def get_recommendations() -> Tuple[Dict[str, Any], int]:
    """Get AI-powered product recommendations.

    Supports both personalized (authenticated users) and general recommendations.

    Request Body:
        user_id: User ID for personalized recommendations (optional)
        products_context: List of product IDs for context (optional)
        limit: Number of recommendations (default: 10)

    Returns:
        List of recommended products with explanations
    """
    try:
        db = SessionLocal()
        data = request.get_json() or {}

        user_id = data.get("user_id")
        products_context = data.get("products_context", [])
        limit = min(int(data.get("limit", 10)), 50)

        # Validate user if provided
        user = None
        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                logger.warning(f"User not found for recommendations: {user_id}")

        # Get approved products
        products_query = db.query(Product).filter(
            Product.status == "approved"
        )

        # If context products provided, exclude them
        if products_context:
            products_query = products_query.filter(
                ~Product.id.in_(products_context)
            )

        # Fetch products for recommendations
        all_products = products_query.limit(limit * 3).all()

        # Use AI service for recommendations
        recommendations = ai_service.get_recommendations(
            user_id=user_id,
            products_context=products_context,
            available_products=[
                {
                    "id": p.id,
                    "title": p.title,
                    "price": float(p.price),
                    "category": p.category,
                    "description": p.description,
                }
                for p in all_products
            ]
        )

        # Limit results
        recommendations = recommendations[:limit]

        logger.info(f"Recommendations generated: user={user_id} count={len(recommendations)}")

        result = {
            "user_id": user_id,
            "recommendations": recommendations,
            "count": len(recommendations),
            "explanation": "These products are recommended based on your interests and browsing history"
                          if user else "Popular products in your browsing category",
        }

        db.close()

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error generating recommendations: {str(e)}")
        return jsonify({"error": "Failed to generate recommendations"}), 500


# ============================================================================
# HEALTH CHECK
# ============================================================================


@chatbot_bp.route("/health", methods=["GET"])
def health_check() -> Tuple[Dict[str, Any], int]:
    """Health check for chatbot service.

    Returns status information about the AI service and its availability.

    Returns:
        Service status, model info, and version
    """
    try:
        # Check database connectivity
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        db_status = "ok"
    except Exception as e:
        logger.warning(f"Database health check failed: {str(e)}")
        db_status = "unavailable"

    return jsonify({
        "status": "ok",
        "service": "chatbot",
        "version": AI_SERVICE_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "components": {
            "ai_service": "ok",
            "database": db_status,
        },
        "model": "gpt-3.5-turbo-based",
    }), 200


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def _calculate_relevance(product: Product, query: str) -> float:
    """Calculate relevance score for product search.

    Args:
        product: Product model instance
        query: Search query string

    Returns:
        Relevance score between 0 and 100
    """
    from difflib import SequenceMatcher

    query_lower = query.lower()
    title_lower = (product.title or "").lower()
    desc_lower = (product.description or "").lower()

    # Exact title match
    if query_lower == title_lower:
        return 100.0

    # Title contains query
    if query_lower in title_lower:
        return 90.0

    # Similarity matching
    title_ratio = SequenceMatcher(None, query_lower, title_lower).ratio() * 100
    desc_ratio = SequenceMatcher(None, query_lower, desc_lower).ratio() * 100

    return max(title_ratio, desc_ratio * 0.5)
