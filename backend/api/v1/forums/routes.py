"""Forum discussion routes for product-related discussions."""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from backend.api.v1.forums.handlers import ForumHandler
from backend.api.v1.forums.serializers import CreateTopicRequest, CreateReplyRequest, VoteRequest
from backend.api.common.error_handlers import handle_validation_error, handle_not_found

# Create blueprint
forums_bp = Blueprint('forums', __name__)


@forums_bp.route('/forums/health', methods=['GET'])
def health():
    """Health check for forums module."""
    return jsonify({"status": "ok", "module": "forums"}), 200


@forums_bp.route('/forums/topics', methods=['POST'])
@jwt_required()
def create_topic():
    """Create a new forum topic for a product.

    Request body:
    {
        "product_id": "product-uuid",
        "title": "Como usar este produto?",
        "content": "Conteúdo detalhado da pergunta..."
    }

    Returns:
        201: Created topic
        400: Validation error
        404: Product not found
    """
    try:
        data = request.get_json()

        # Validate request
        if not data.get("product_id") or not data.get("title") or not data.get("content"):
            return handle_validation_error("product_id, title e content são obrigatórios")

        # Create DTO
        topic_request = CreateTopicRequest.from_dict(data)

        # Create topic
        topic = ForumHandler.create_topic(
            topic_request.product_id,
            topic_request.title,
            topic_request.content
        )

        return jsonify({
            "id": topic.id,
            "product_id": topic.product_id,
            "title": topic.title,
            "content": topic.content,
            "author_id": topic.author_id,
            "created_at": topic.created_at.isoformat()
        }), 201

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao criar tópico: {str(e)}"}), 500


@forums_bp.route('/products/<product_id>/forums', methods=['GET'])
def get_product_forums(product_id: str):
    """Get all forum topics for a product.

    Path parameters:
        product_id: ID of the product

    Query parameters:
        limit: Maximum topics to return (default: 20)
        offset: Pagination offset (default: 0)

    Returns:
        200: List of forum topics
        404: Product not found
    """
    try:
        limit = request.args.get('limit', 20, type=int)
        offset = request.args.get('offset', 0, type=int)

        topics = ForumHandler.get_product_topics(product_id, limit, offset)

        return jsonify({
            "product_id": product_id,
            "total": len(topics),
            "topics": topics
        }), 200

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao recuperar fórum: {str(e)}"}), 500


@forums_bp.route('/forums/topics/<topic_id>/replies', methods=['POST'])
@jwt_required()
def create_reply(topic_id: str):
    """Create a reply to a forum topic.

    Path parameters:
        topic_id: ID of the forum topic

    Request body:
    {
        "content": "Conteúdo da resposta..."
    }

    Returns:
        201: Created reply
        400: Validation error
        404: Topic not found
    """
    try:
        data = request.get_json()

        # Validate request
        if not data.get("content"):
            return handle_validation_error("content é obrigatório")

        # Create DTO
        reply_request = CreateReplyRequest.from_dict(data)

        # Create reply
        reply = ForumHandler.create_reply(topic_id, reply_request.content)

        return jsonify({
            "id": reply.id,
            "topic_id": reply.topic_id,
            "content": reply.content,
            "author_id": reply.author_id,
            "created_at": reply.created_at.isoformat()
        }), 201

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao criar resposta: {str(e)}"}), 500


@forums_bp.route('/forums/topics/<topic_id>/replies', methods=['GET'])
def get_topic_replies(topic_id: str):
    """Get all replies for a forum topic.

    Path parameters:
        topic_id: ID of the forum topic

    Query parameters:
        limit: Maximum replies to return (default: 20)
        offset: Pagination offset (default: 0)

    Returns:
        200: List of replies sorted by helpful votes
        404: Topic not found
    """
    try:
        limit = request.args.get('limit', 20, type=int)
        offset = request.args.get('offset', 0, type=int)

        replies = ForumHandler.get_topic_replies(topic_id, limit, offset)

        return jsonify({
            "topic_id": topic_id,
            "total": len(replies),
            "replies": replies
        }), 200

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao recuperar respostas: {str(e)}"}), 500


@forums_bp.route('/forums/replies/<reply_id>/vote', methods=['POST'])
@jwt_required()
def vote_on_reply(reply_id: str):
    """Vote on a forum reply (helpful or not helpful).

    Path parameters:
        reply_id: ID of the forum reply

    Request body:
    {
        "vote_type": "helpful" or "not_helpful"
    }

    Returns:
        200: Updated vote counts
        400: Validation error
        404: Reply not found
    """
    try:
        data = request.get_json()

        # Validate request
        if not data.get("vote_type"):
            return handle_validation_error("vote_type é obrigatório")

        # Create DTO
        vote_request = VoteRequest.from_dict(data)

        # Vote on reply
        result = ForumHandler.vote_on_reply(reply_id, vote_request.vote_type)

        return jsonify(result), 200

    except ValueError as e:
        if "não encontrada" in str(e):
            return handle_not_found(str(e))
        return handle_validation_error(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao votar: {str(e)}"}), 500


__all__ = ["forums_bp"]
