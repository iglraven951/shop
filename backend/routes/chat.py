"""Chat and messaging REST API blueprints for DiscoveryShop."""

from typing import Optional
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from backend.auth import token_required
from backend.dtos import ChatMessageDTO, ConversationDTO
from backend.exceptions import (
    ValidationException,
    UserNotFoundException,
    UnauthorizedAccessException,
)

# Import services (when available from AGENT 3)
# from backend.services import ChatService, NotificationService


chat_bp = Blueprint("chat", __name__, url_prefix="/chat")


# ==================== CONVERSATIONS ENDPOINTS ====================


@chat_bp.route("/conversations", methods=["GET"])
@token_required
def get_conversations():
    """
    Get all recent conversations for the current user.

    Query Parameters:
        limit: Number of conversations to return (default: 20, max: 100)

    Returns:
        200: List of ConversationDTO objects with latest message info
        401: Missing or invalid authentication token
        500: Internal server error

    Response format:
        {
            "conversations": [
                {
                    "user_id": "uuid",
                    "username": "john_doe",
                    "avatar_url": "https://...",
                    "last_message": "Hey, how are you?",
                    "last_message_time": "2026-01-15T10:30:00Z",
                    "unread_count": 2
                }
            ],
            "total": 1
        }
    """
    try:
        user_id = g.user_id
        limit = min(int(request.args.get("limit", 20)), 100)

        # Placeholder: Replace with ChatService.get_conversations(user_id, limit)
        # This will be implemented by AGENT 3
        conversations = []

        return jsonify({
            "conversations": [conv.to_dict() if hasattr(conv, "to_dict") else conv for conv in conversations],
            "total": len(conversations)
        }), 200

    except ValueError as e:
        raise ValidationException(f"Invalid query parameter: {str(e)}")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/conversations/<user_id>/messages", methods=["GET"])
@token_required
def get_conversation_messages(user_id: str):
    """
    Get paginated conversation history with a specific user.

    Path Parameters:
        user_id: ID of the other user in conversation

    Query Parameters:
        limit: Number of messages to return (default: 50, max: 200)
        offset: Number of messages to skip (default: 0)

    Returns:
        200: List of ChatMessageDTO objects (newest first)
        404: Conversation not found
        401: Unauthorized access
        500: Internal server error

    Response format:
        {
            "messages": [
                {
                    "id": 123,
                    "sender_id": "uuid",
                    "sender_name": "john_doe",
                    "sender_avatar": "https://...",
                    "receiver_id": "uuid",
                    "message": "Hello there!",
                    "file_url": null,
                    "is_read": true,
                    "created_at": "2026-01-15T10:30:00Z"
                }
            ],
            "total": 42,
            "limit": 50,
            "offset": 0
        }
    """
    try:
        current_user_id = g.user_id
        limit = min(int(request.args.get("limit", 50)), 200)
        offset = int(request.args.get("offset", 0))

        # Placeholder: Replace with ChatService.get_messages(current_user_id, user_id, limit, offset)
        # Returns messages ordered by created_at DESC (newest first)
        messages = []
        total = 0

        return jsonify({
            "messages": [msg.to_dict() if hasattr(msg, "to_dict") else msg for msg in messages],
            "total": total,
            "limit": limit,
            "offset": offset
        }), 200

    except ValueError as e:
        raise ValidationException(f"Invalid query parameter: {str(e)}")
    except UserNotFoundException:
        return jsonify({"error": "Conversation not found"}), 404
    except UnauthorizedAccessException:
        return jsonify({"error": "Unauthorized access"}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/conversations/<user_id>/message", methods=["POST"])
@token_required
def send_message(user_id: str):
    """
    Send a message to another user.

    Path Parameters:
        user_id: ID of the recipient

    Request Body:
        {
            "message": "Hello! How are you?",
            "file_url": "https://example.com/file.pdf" (optional)
        }

    Returns:
        201: Message sent successfully
        400: Invalid request body
        404: User not found
        422: Validation error
        500: Internal server error

    Response format:
        {
            "id": 124,
            "sender_id": "current-user-uuid",
            "sender_name": "current_user",
            "sender_avatar": "https://...",
            "receiver_id": "recipient-uuid",
            "message": "Hello! How are you?",
            "file_url": null,
            "is_read": false,
            "created_at": "2026-01-15T10:35:00Z"
        }
    """
    try:
        current_user_id = g.user_id
        data = request.get_json()

        if not data:
            raise ValidationException("Request body is required")

        # Validate message
        message = data.get("message", "").strip()
        if not message:
            raise ValidationException("Message cannot be empty")
        if len(message) > 5000:
            raise ValidationException("Message is too long (max 5000 characters)")

        file_url = data.get("file_url")
        if file_url and not isinstance(file_url, str):
            raise ValidationException("file_url must be a string")

        # Placeholder: Replace with ChatService.send_message(current_user_id, user_id, message, file_url)
        # This should:
        # 1. Create ChatMessage in database
        # 2. Create Notification for receiver
        # 3. Emit WebSocket event to receiver (if connected)
        # 4. Return ChatMessageDTO
        sent_message = None

        if not sent_message:
            raise UserNotFoundException("Recipient not found")

        return jsonify(sent_message.to_dict() if hasattr(sent_message, "to_dict") else sent_message), 201

    except (ValidationException, UserNotFoundException) as e:
        status = e.status_code
        return jsonify({"error": e.message}), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/conversations/<user_id>/read", methods=["PUT"])
@token_required
def mark_conversation_as_read(user_id: str):
    """
    Mark all messages from a user in a conversation as read.

    Path Parameters:
        user_id: ID of the sender (messages to mark as read)

    Returns:
        200: Messages marked as read
        404: Conversation not found
        500: Internal server error

    Response format:
        {
            "count": 5,
            "message": "5 messages marked as read"
        }
    """
    try:
        current_user_id = g.user_id

        # Placeholder: Replace with ChatService.mark_messages_read(current_user_id, user_id)
        # This should:
        # 1. Update all messages from user_id to current_user_id where is_read=False to is_read=True
        # 2. Return count of updated messages
        # 3. Emit WebSocket event to sender that messages are read
        count = 0

        return jsonify({
            "count": count,
            "message": f"{count} messages marked as read"
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== SEARCH ENDPOINTS ====================


@chat_bp.route("/search", methods=["GET"])
@token_required
def search_conversations_or_messages():
    """
    Search conversations by username or messages by content.

    Query Parameters:
        q: Search query string (required, min 2 characters)
        type: 'conversations' or 'messages' (default: 'conversations')
        limit: Results to return (default: 20, max: 100)

    Returns:
        200: List of matching conversations or messages
        400: Missing or invalid search query
        500: Internal server error

    Response format (type=conversations):
        {
            "results": [ConversationDTO, ...],
            "type": "conversations"
        }

    Response format (type=messages):
        {
            "results": [ChatMessageDTO, ...],
            "type": "messages"
        }
    """
    try:
        current_user_id = g.user_id
        query = request.args.get("q", "").strip()
        search_type = request.args.get("type", "conversations").lower()
        limit = min(int(request.args.get("limit", 20)), 100)

        if len(query) < 2:
            raise ValidationException("Search query must be at least 2 characters")

        if search_type not in ["conversations", "messages"]:
            raise ValidationException("Type must be 'conversations' or 'messages'")

        # Placeholder: Replace with ChatService search methods
        # ChatService.search_conversations(current_user_id, query, limit)
        # ChatService.search_messages(current_user_id, query, limit)
        results = []

        return jsonify({
            "results": [r.to_dict() if hasattr(r, "to_dict") else r for r in results],
            "type": search_type
        }), 200

    except ValidationException as e:
        return jsonify({"error": e.message}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== DELETE ENDPOINTS ====================


@chat_bp.route("/conversations/<user_id>", methods=["DELETE"])
@token_required
def delete_conversation(user_id: str):
    """
    Delete (archive) a conversation with a user.

    Path Parameters:
        user_id: ID of the other user in conversation

    Returns:
        200: Conversation deleted
        404: Conversation not found
        500: Internal server error

    Response format:
        {
            "message": "Conversation deleted"
        }
    """
    try:
        current_user_id = g.user_id

        # Placeholder: Replace with ChatService.delete_conversation(current_user_id, user_id)
        # This should soft-delete or archive the conversation
        deleted = False

        if not deleted:
            return jsonify({"error": "Conversation not found"}), 404

        return jsonify({"message": "Conversation deleted"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== ERROR HANDLER ====================


@chat_bp.errorhandler(400)
def handle_bad_request(e):
    """Handle 400 Bad Request errors."""
    return jsonify({"error": "Bad request"}), 400


@chat_bp.errorhandler(404)
def handle_not_found(e):
    """Handle 404 Not Found errors."""
    return jsonify({"error": "Resource not found"}), 404


@chat_bp.errorhandler(500)
def handle_internal_error(e):
    """Handle 500 Internal Server errors."""
    return jsonify({"error": "Internal server error"}), 500
