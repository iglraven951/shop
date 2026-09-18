"""Chat and messaging routes (real-time, WebSocket)."""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from backend.api.v1.chat.handlers import ChatHandler
from backend.api.v1.chat.serializers import SendMessageRequest
from backend.api.common.error_handlers import handle_validation_error, handle_not_found

# Create blueprint
chat_bp = Blueprint('chat', __name__)


@chat_bp.route('/chat/health', methods=['GET'])
def health():
    """Health check for chat module."""
    return jsonify({"status": "ok", "module": "chat"}), 200


@chat_bp.route('/chat/messages', methods=['POST'])
@jwt_required()
def send_message():
    """Send a message to another user.

    Request body:
    {
        "recipient_id": "user-uuid",
        "message": "Olá! Como você está?",
        "file_url": "https://example.com/file.pdf" (optional)
    }

    Returns:
        201: Created message with ID and timestamp
        400: Validation error
        404: Recipient not found
    """
    try:
        data = request.get_json()

        # Validate request
        if not data.get("recipient_id") or not data.get("message"):
            return handle_validation_error("recipient_id e message são obrigatórios")

        # Create DTO
        msg_request = SendMessageRequest.from_dict(data)

        # Send message
        message = ChatHandler.send_message(
            msg_request.recipient_id,
            msg_request.message,
            msg_request.file_url
        )

        return jsonify({
            "id": message.id,
            "sender_id": message.sender_id,
            "recipient_id": message.receiver_id,
            "message": message.message,
            "file_url": message.file_url,
            "created_at": message.created_at.isoformat()
        }), 201

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao enviar mensagem: {str(e)}"}), 500


@chat_bp.route('/chat/conversations', methods=['GET'])
@jwt_required()
def get_conversations():
    """Get list of user's conversations (unique users they've chatted with).

    Query parameters:
        limit: Maximum conversations to return (default: 50)
        offset: Pagination offset (default: 0)

    Returns:
        200: List of conversations
    """
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        conversations = ChatHandler.get_conversations(limit, offset)

        return jsonify({
            "total": len(conversations),
            "conversations": conversations
        }), 200

    except Exception as e:
        return jsonify({"error": f"Erro ao recuperar conversas: {str(e)}"}), 500


@chat_bp.route('/chat/conversations/<other_user_id>', methods=['GET'])
@jwt_required()
def get_conversation(other_user_id: str):
    """Get conversation history with a specific user.

    Path parameters:
        other_user_id: ID of the other user in the conversation

    Query parameters:
        limit: Maximum messages to return (default: 50)
        offset: Pagination offset (default: 0)

    Returns:
        200: List of messages in chronological order
        404: User not found
    """
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        messages = ChatHandler.get_conversation_messages(other_user_id, limit, offset)

        return jsonify({
            "other_user_id": other_user_id,
            "total": len(messages),
            "messages": messages
        }), 200

    except ValueError as e:
        return handle_not_found(str(e))
    except Exception as e:
        return jsonify({"error": f"Erro ao recuperar conversa: {str(e)}"}), 500


@chat_bp.route('/chat/unread-count', methods=['GET'])
@jwt_required()
def get_unread_count():
    """Get count of unread messages for current user.

    Returns:
        200: Count of unread messages
    """
    try:
        count = ChatHandler.get_unread_count()
        return jsonify({"unread_count": count}), 200

    except Exception as e:
        return jsonify({"error": f"Erro ao contar mensagens não lidas: {str(e)}"}), 500


__all__ = ["chat_bp"]
