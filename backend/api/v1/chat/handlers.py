"""Chat request handlers (business logic)."""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.orm import Session
from backend.models import ChatMessage, User
from backend.database import get_db


class ChatHandler:
    """Handler for chat operations."""

    @staticmethod
    def send_message(
        recipient_id: str,
        message_content: str,
        file_url: Optional[str] = None
    ) -> ChatMessage:
        """Send a message to another user.

        Args:
            recipient_id: ID of message recipient
            message_content: Message content
            file_url: Optional file attachment URL

        Returns:
            Created ChatMessage object

        Raises:
            ValueError: If recipient doesn't exist
        """
        sender_id = get_jwt_identity()
        db = next(get_db())

        # Verify recipient exists
        recipient = db.query(User).filter_by(id=recipient_id).first()
        if not recipient:
            raise ValueError(f"Usuário {recipient_id} não encontrado")

        # Create message
        new_message = ChatMessage(
            sender_id=sender_id,
            receiver_id=recipient_id,
            message=message_content,
            file_url=file_url,
            is_read=False
        )

        db.add(new_message)
        db.commit()
        db.refresh(new_message)

        return new_message

    @staticmethod
    def get_conversations(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Get user's conversations (unique users they've chatted with).

        Args:
            limit: Maximum conversations to return
            offset: Pagination offset

        Returns:
            List of conversation summaries
        """
        user_id = get_jwt_identity()
        db = next(get_db())

        # Get unique users the current user has chatted with
        conversations = db.query(ChatMessage).filter(
            (ChatMessage.sender_id == user_id) |
            (ChatMessage.receiver_id == user_id)
        ).order_by(ChatMessage.created_at.desc()).limit(limit).offset(offset).all()

        # Extract unique user IDs and their last message
        seen_users = set()
        result = []

        for msg in conversations:
            other_user_id = msg.receiver_id if msg.sender_id == user_id else msg.sender_id

            if other_user_id not in seen_users:
                seen_users.add(other_user_id)
                other_user = db.query(User).filter_by(id=other_user_id).first()

                if other_user:
                    result.append({
                        "user_id": other_user_id,
                        "username": other_user.username,
                        "full_name": other_user.full_name,
                        "avatar_url": other_user.avatar_url,
                        "last_message": msg.message,
                        "last_message_time": msg.created_at.isoformat(),
                        "is_unread": msg.is_read == False and msg.receiver_id == user_id
                    })

        return result

    @staticmethod
    def get_conversation_messages(
        other_user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get conversation history between two users.

        Args:
            other_user_id: ID of the other user
            limit: Maximum messages to return
            offset: Pagination offset

        Returns:
            List of messages in chronological order

        Raises:
            ValueError: If other user doesn't exist
        """
        user_id = get_jwt_identity()
        db = next(get_db())

        # Verify other user exists
        other_user = db.query(User).filter_by(id=other_user_id).first()
        if not other_user:
            raise ValueError(f"Usuário {other_user_id} não encontrado")

        # Get conversation messages
        messages = db.query(ChatMessage).filter(
            (
                (ChatMessage.sender_id == user_id) &
                (ChatMessage.receiver_id == other_user_id)
            ) |
            (
                (ChatMessage.sender_id == other_user_id) &
                (ChatMessage.receiver_id == user_id)
            )
        ).order_by(ChatMessage.created_at.asc()).limit(limit).offset(offset).all()

        # Mark received messages as read
        unread_messages = db.query(ChatMessage).filter(
            ChatMessage.receiver_id == user_id,
            ChatMessage.sender_id == other_user_id,
            ChatMessage.is_read == False
        ).all()

        for msg in unread_messages:
            msg.is_read = True

        db.commit()

        # Format response
        return [
            {
                "id": msg.id,
                "sender_id": msg.sender_id,
                "sender_name": msg.sender.full_name,
                "receiver_id": msg.receiver_id,
                "content": msg.message,
                "file_url": msg.file_url,
                "is_read": msg.is_read,
                "created_at": msg.created_at.isoformat()
            }
            for msg in messages
        ]

    @staticmethod
    def get_unread_count() -> int:
        """Get count of unread messages for current user.

        Returns:
            Count of unread messages
        """
        user_id = get_jwt_identity()
        db = next(get_db())

        count = db.query(ChatMessage).filter(
            ChatMessage.receiver_id == user_id,
            ChatMessage.is_read == False
        ).count()

        return count


__all__ = ["ChatHandler"]
