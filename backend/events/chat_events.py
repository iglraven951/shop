"""WebSocket events for real-time chat."""

from flask import request
from flask_socketio import emit, join_room, leave_room, rooms
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from functools import wraps
from datetime import datetime, timezone
from backend.app.extensions import socketio
from backend.models import ChatMessage, User
from backend.database import get_db


def authenticated_only(f):
    """Decorator to ensure user is authenticated via JWT."""
    @wraps(f)
    def wrapped(*args, **kwargs):
        try:
            verify_jwt_in_request()
            return f(*args, **kwargs)
        except Exception as e:
            emit('error', {'message': 'Não autenticado'})
            return
    return wrapped


@socketio.on('connect', namespace='/chat')
@authenticated_only
def on_connect():
    """Handle WebSocket connection."""
    user_id = get_jwt_identity()
    join_room(user_id)

    emit('message', {
        'type': 'system',
        'content': 'Conectado ao chat em tempo real',
        'timestamp': datetime.now(timezone.utc).isoformat()
    })

    print(f"[CHAT] User {user_id} connected")


@socketio.on('disconnect', namespace='/chat')
@authenticated_only
def on_disconnect():
    """Handle WebSocket disconnection."""
    user_id = get_jwt_identity()
    leave_room(user_id)

    print(f"[CHAT] User {user_id} disconnected")


@socketio.on('message', namespace='/chat')
@authenticated_only
def on_message(data):
    """Handle incoming chat message.

    Expected data:
    {
        "recipient_id": "user-uuid",
        "content": "Olá!",
        "file_url": "https://example.com/file.pdf" (optional)
    }
    """
    try:
        sender_id = get_jwt_identity()
        recipient_id = data.get('recipient_id')
        content = data.get('content')
        file_url = data.get('file_url')

        if not recipient_id or not content:
            emit('error', {'message': 'recipient_id e content são obrigatórios'})
            return

        # Save message to database
        db = next(get_db())

        # Verify recipient exists
        recipient = db.query(User).filter_by(id=recipient_id).first()
        if not recipient:
            emit('error', {'message': f'Usuário {recipient_id} não encontrado'})
            return

        # Create message
        new_message = ChatMessage(
            sender_id=sender_id,
            receiver_id=recipient_id,
            message=content,
            file_url=file_url,
            is_read=False
        )

        db.add(new_message)
        db.commit()
        db.refresh(new_message)

        # Get sender info
        sender = db.query(User).filter_by(id=sender_id).first()

        # Prepare message data
        message_data = {
            'id': new_message.id,
            'sender_id': sender_id,
            'sender_name': sender.full_name if sender else 'Unknown',
            'sender_avatar': sender.avatar_url if sender else None,
            'recipient_id': recipient_id,
            'content': content,
            'file_url': file_url,
            'timestamp': new_message.created_at.isoformat(),
            'read': False
        }

        # Send to sender (confirmation)
        emit('message_sent', message_data)

        # Send to recipient (real-time delivery)
        emit('message_received', message_data, room=recipient_id)

        print(f"[CHAT] Message from {sender_id} to {recipient_id}")

    except Exception as e:
        emit('error', {'message': f'Erro ao enviar mensagem: {str(e)}'})
        print(f"[CHAT] Error: {str(e)}")


@socketio.on('typing', namespace='/chat')
@authenticated_only
def on_typing(data):
    """Handle typing indicator.

    Expected data:
    {
        "recipient_id": "user-uuid"
    }
    """
    try:
        user_id = get_jwt_identity()
        recipient_id = data.get('recipient_id')

        if not recipient_id:
            return

        # Get sender info
        db = next(get_db())
        sender = db.query(User).filter_by(id=user_id).first()

        # Send typing indicator to recipient
        emit('user_typing', {
            'sender_id': user_id,
            'sender_name': sender.full_name if sender else 'Unknown'
        }, room=recipient_id)

    except Exception as e:
        print(f"[CHAT] Typing error: {str(e)}")


@socketio.on('stop_typing', namespace='/chat')
@authenticated_only
def on_stop_typing(data):
    """Handle stop typing indicator.

    Expected data:
    {
        "recipient_id": "user-uuid"
    }
    """
    try:
        user_id = get_jwt_identity()
        recipient_id = data.get('recipient_id')

        if not recipient_id:
            return

        # Send stop typing indicator to recipient
        emit('user_stop_typing', {
            'sender_id': user_id
        }, room=recipient_id)

    except Exception as e:
        print(f"[CHAT] Stop typing error: {str(e)}")


@socketio.on('read_message', namespace='/chat')
@authenticated_only
def on_read_message(data):
    """Handle message read acknowledgment.

    Expected data:
    {
        "message_id": "message-uuid",
        "sender_id": "user-uuid"
    }
    """
    try:
        user_id = get_jwt_identity()
        message_id = data.get('message_id')
        sender_id = data.get('sender_id')

        if not message_id or not sender_id:
            return

        # Mark message as read
        db = next(get_db())
        message = db.query(ChatMessage).filter_by(id=message_id).first()

        if message and message.receiver_id == user_id:
            message.is_read = True
            db.commit()

            # Notify sender that message was read
            emit('message_read', {
                'message_id': message_id,
                'reader_id': user_id
            }, room=sender_id)

    except Exception as e:
        print(f"[CHAT] Read message error: {str(e)}")


__all__ = []
