"""Chat service for user messaging."""

import logging
from typing import List, Tuple
from datetime import datetime

from ..dtos import ChatMessageDTO, ConversationDTO
from ..exceptions import UserNotFoundException, ChatMessageNotFoundException, ValidationException


logger = logging.getLogger(__name__)


class ChatService:
    """Service for managing user messages and conversations."""

    def __init__(self, db):
        """Initialize service with database instance."""
        self.db = db

    def send_message(
        self, sender_id: int, receiver_id: int, message: str, file_url: str = None
    ) -> ChatMessageDTO:
        """
        Send a message from one user to another.

        Args:
            sender_id: Sender user ID
            receiver_id: Receiver user ID
            message: Message text
            file_url: Optional file attachment URL

        Returns:
            ChatMessageDTO with sent message

        Raises:
            UserNotFoundException: If sender or receiver not found
            ValidationException: If message is empty
        """
        from ..models import User, ChatMessage

        # Verify both users exist
        sender = User.query.get(sender_id)
        receiver = User.query.get(receiver_id)

        if not sender or not receiver:
            raise UserNotFoundException()

        if not message or len(message.strip()) == 0:
            raise ValidationException("Message cannot be empty")

        if sender_id == receiver_id:
            raise ValidationException("Cannot send message to yourself")

        # Create message
        chat_message = ChatMessage(
            sender_id=sender_id,
            receiver_id=receiver_id,
            message=message,
            file_url=file_url,
            is_read=False,
            created_at=datetime.utcnow(),
        )

        try:
            self.db.session.add(chat_message)
            self.db.session.commit()
            logger.info(f"Message sent from {sender_id} to {receiver_id}")

            return ChatMessageDTO(
                id=chat_message.id,
                sender_id=chat_message.sender_id,
                sender_name=sender.username,
                sender_avatar=sender.profile.avatar_url if sender.profile else None,
                receiver_id=chat_message.receiver_id,
                message=chat_message.message,
                file_url=chat_message.file_url,
                is_read=chat_message.is_read,
                created_at=chat_message.created_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Send message failed: {str(e)}")
            raise ValidationException(f"Send message failed: {str(e)}")

    def get_conversation(
        self, user_id: int, other_user_id: int, limit: int = 50, offset: int = 0
    ) -> Tuple[List[ChatMessageDTO], int]:
        """
        Get conversation between two users.

        Args:
            user_id: Current user ID
            other_user_id: Other user ID
            limit: Number of messages to return
            offset: Pagination offset

        Returns:
            Tuple of (messages list, total count)

        Raises:
            UserNotFoundException: If either user not found
        """
        from ..models import User, ChatMessage

        # Verify users exist
        user = User.query.get(user_id)
        other_user = User.query.get(other_user_id)

        if not user or not other_user:
            raise UserNotFoundException()

        # Get messages between users (in both directions)
        query = ChatMessage.query.filter(
            (
                (ChatMessage.sender_id == user_id)
                & (ChatMessage.receiver_id == other_user_id)
            )
            | (
                (ChatMessage.sender_id == other_user_id)
                & (ChatMessage.receiver_id == user_id)
            )
        )

        total = query.count()
        messages = (
            query.order_by(ChatMessage.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        # Mark received messages as read
        unread = ChatMessage.query.filter(
            (ChatMessage.sender_id == other_user_id)
            & (ChatMessage.receiver_id == user_id)
            & (ChatMessage.is_read == False)
        ).all()

        for msg in unread:
            msg.is_read = True

        if unread:
            self.db.session.commit()

        # Convert to DTOs (reverse order for display)
        message_dtos = []
        for msg in reversed(messages):
            sender = msg.sender
            message_dtos.append(
                ChatMessageDTO(
                    id=msg.id,
                    sender_id=msg.sender_id,
                    sender_name=sender.username,
                    sender_avatar=sender.profile.avatar_url if sender.profile else None,
                    receiver_id=msg.receiver_id,
                    message=msg.message,
                    file_url=msg.file_url,
                    is_read=msg.is_read,
                    created_at=msg.created_at,
                )
            )

        return message_dtos, total

    def get_user_conversations(
        self, user_id: int, limit: int = 20
    ) -> List[ConversationDTO]:
        """
        Get list of recent conversations for a user.

        Args:
            user_id: User ID
            limit: Number of conversations to return

        Returns:
            List of recent conversations

        Raises:
            UserNotFoundException: If user not found
        """
        from ..models import User, ChatMessage
        from sqlalchemy import func, or_

        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            raise UserNotFoundException()

        # Get all unique users this user has messages with
        # (as both sender and receiver)
        conversations = (
            ChatMessage.query.filter(
                (ChatMessage.sender_id == user_id)
                | (ChatMessage.receiver_id == user_id)
            )
            .with_entities(
                func.max(ChatMessage.id).label("latest_message_id"),
                func.case(
                    (ChatMessage.sender_id == user_id, ChatMessage.receiver_id),
                    else_=ChatMessage.sender_id,
                ).label("other_user_id"),
            )
            .group_by(
                func.case(
                    (ChatMessage.sender_id == user_id, ChatMessage.receiver_id),
                    else_=ChatMessage.sender_id,
                )
            )
            .order_by(func.max(ChatMessage.created_at).desc())
            .limit(limit)
            .all()
        )

        conversation_dtos = []

        for latest_msg_id, other_user_id in conversations:
            other_user = User.query.get(other_user_id)
            latest_message = ChatMessage.query.get(latest_msg_id)

            if other_user and latest_message:
                # Count unread messages from other user
                unread_count = (
                    ChatMessage.query.filter(
                        (ChatMessage.sender_id == other_user_id)
                        & (ChatMessage.receiver_id == user_id)
                        & (ChatMessage.is_read == False)
                    )
                    .count()
                )

                conversation_dtos.append(
                    ConversationDTO(
                        user_id=other_user.id,
                        username=other_user.username,
                        avatar_url=other_user.profile.avatar_url
                        if other_user.profile
                        else None,
                        last_message=latest_message.message[:100],  # Truncate
                        last_message_time=latest_message.created_at,
                        unread_count=unread_count,
                    )
                )

        return conversation_dtos

    def mark_as_read(self, user_id: int, other_user_id: int) -> int:
        """
        Mark all messages from other_user as read.

        Args:
            user_id: Current user ID
            other_user_id: Other user ID

        Returns:
            Number of messages marked as read
        """
        from ..models import ChatMessage

        messages = ChatMessage.query.filter(
            (ChatMessage.sender_id == other_user_id)
            & (ChatMessage.receiver_id == user_id)
            & (ChatMessage.is_read == False)
        ).all()

        count = len(messages)

        for msg in messages:
            msg.is_read = True

        try:
            if messages:
                self.db.session.commit()
            logger.info(
                f"Marked {count} messages as read for user {user_id} from {other_user_id}"
            )
            return count

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Mark as read failed: {str(e)}")
            return 0

    def get_unread_count(self, user_id: int) -> int:
        """
        Get count of unread messages for user.

        Args:
            user_id: User ID

        Returns:
            Number of unread messages
        """
        from ..models import ChatMessage

        return (
            ChatMessage.query.filter(
                (ChatMessage.receiver_id == user_id) & (ChatMessage.is_read == False)
            )
            .count()
        )

    def search_conversations(self, user_id: int, query: str) -> List[ConversationDTO]:
        """
        Search conversations by username.

        Args:
            user_id: Current user ID
            query: Search query

        Returns:
            List of matching conversations
        """
        from ..models import User, ChatMessage

        # Find users whose names match the query
        matching_users = User.query.filter(
            User.username.ilike(f"%{query}%")
        ).limit(10).all()

        conversation_dtos = []

        for other_user in matching_users:
            if other_user.id == user_id:
                continue

            # Check if there's a conversation with this user
            latest_message = (
                ChatMessage.query.filter(
                    (
                        (ChatMessage.sender_id == user_id)
                        & (ChatMessage.receiver_id == other_user.id)
                    )
                    | (
                        (ChatMessage.sender_id == other_user.id)
                        & (ChatMessage.receiver_id == user_id)
                    )
                )
                .order_by(ChatMessage.created_at.desc())
                .first()
            )

            if latest_message:
                unread_count = (
                    ChatMessage.query.filter(
                        (ChatMessage.sender_id == other_user.id)
                        & (ChatMessage.receiver_id == user_id)
                        & (ChatMessage.is_read == False)
                    )
                    .count()
                )

                conversation_dtos.append(
                    ConversationDTO(
                        user_id=other_user.id,
                        username=other_user.username,
                        avatar_url=other_user.profile.avatar_url
                        if other_user.profile
                        else None,
                        last_message=latest_message.message[:100],
                        last_message_time=latest_message.created_at,
                        unread_count=unread_count,
                    )
                )

        return conversation_dtos

    def delete_message(self, message_id: int, user_id: int) -> bool:
        """
        Delete a message (sender only).

        Args:
            message_id: Message ID
            user_id: User ID (for authorization)

        Returns:
            True if successful

        Raises:
            ChatMessageNotFoundException: If message not found
        """
        from ..models import ChatMessage

        message = ChatMessage.query.get(message_id)
        if not message:
            raise ChatMessageNotFoundException()

        if message.sender_id != user_id:
            raise UserNotFoundException()

        try:
            self.db.session.delete(message)
            self.db.session.commit()
            logger.info(f"Message deleted: {message_id}")
            return True

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Message deletion failed: {str(e)}")
            return False
