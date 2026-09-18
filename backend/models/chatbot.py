"""Chatbot and AI conversation models for DiscoveryShop marketplace.

These models track chatbot conversations, messages, and session data
for AI-powered product discovery and customer support interactions.
"""

from datetime import datetime, timezone
from typing import Optional, List, Any
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean, Index, Text, JSON
from sqlalchemy.orm import relationship
from backend.database import Base


class ChatBotSession(Base):
    """Chatbot session tracking for anonymous and authenticated users.

    Tracks active chatbot conversations, token usage, and session metadata
    for both authenticated users and anonymous visitors.

    Attributes:
        id: Primary key (UUID)
        user_id: Foreign key to User (nullable for anonymous sessions)
        ip_address: IP address of session originator
        conversation_tokens_used: Total tokens consumed in this session
        messages_count: Number of messages in this session
        last_activity: Timestamp of last user message
        status: Session status ('active', 'inactive')
        created_at: Session creation timestamp
        updated_at: Last update timestamp
    """

    __tablename__ = "chatbot_sessions"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)

    # Session Information
    ip_address = Column(String(45), nullable=False, index=True)  # Supports IPv6
    conversation_tokens_used = Column(Integer, default=0, nullable=False)
    messages_count = Column(Integer, default=0, nullable=False)

    # Status and Timestamps
    status = Column(String(20), default="active", nullable=False, index=True)  # 'active', 'inactive'
    last_activity = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    user = relationship(
        "User",
        foreign_keys=[user_id],
        primaryjoin="ChatBotSession.user_id==User.id"
    )

    conversations = relationship(
        "ChatBotConversation",
        back_populates="session",
        cascade="all, delete-orphan",
        foreign_keys="ChatBotConversation.session_id"
    )

    # Indexes
    __table_args__ = (
        Index('idx_chatbot_session_user_id', 'user_id'),
        Index('idx_chatbot_session_ip_address', 'ip_address'),
        Index('idx_chatbot_session_status', 'status'),
        Index('idx_chatbot_session_last_activity', 'last_activity'),
        Index('idx_chatbot_session_user_active', 'user_id', 'status'),
    )

    def is_active(self) -> bool:
        """Check if this session is currently active.

        Returns:
            True if status is 'active', False otherwise.
        """
        return self.status == "active"

    def increment_token_count(self, tokens: int) -> None:
        """Increment conversation token usage.

        Args:
            tokens: Number of tokens to add to the session total.
        """
        self.conversation_tokens_used += tokens
        self.last_activity = datetime.now(timezone.utc)

    def increment_message_count(self) -> None:
        """Increment message count and update last activity."""
        self.messages_count += 1
        self.last_activity = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        user_info = f"user={self.user_id}" if self.user_id else f"ip={self.ip_address}"
        return f"<ChatBotSession {user_info} ({self.status})>"


class ChatBotConversation(Base):
    """Individual chatbot conversation thread.

    Represents a conversation between a user and the chatbot AI.
    Conversations are grouped by session and track context, intent, and state.

    Attributes:
        id: Primary key (UUID)
        user_id: Foreign key to User (nullable for anonymous)
        session_id: Foreign key to ChatBotSession
        conversation_token: Unique token for this conversation
        created_at: Conversation start time
        updated_at: Last message time
        status: Conversation status ('active', 'closed', 'transferred')
        metadata: JSON object with conversation context and extracted data
    """

    __tablename__ = "chatbot_conversations"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    session_id = Column(String(36), ForeignKey("chatbot_sessions.id", ondelete="CASCADE"), nullable=False, index=True)

    # Conversation Tracking
    conversation_token = Column(String(36), unique=True, nullable=False, index=True)
    status = Column(String(20), default="active", nullable=False, index=True)  # 'active', 'closed', 'transferred'

    # Metadata - conversation context and extracted entities
    conversation_metadata = Column(JSON, default=dict, nullable=False)  # {search_context, intents, extracted_products, etc}

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    user = relationship(
        "User",
        foreign_keys=[user_id],
        primaryjoin="ChatBotConversation.user_id==User.id"
    )

    session = relationship(
        "ChatBotSession",
        back_populates="conversations",
        foreign_keys=[session_id]
    )

    messages = relationship(
        "ChatBotMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        foreign_keys="ChatBotMessage.conversation_id"
    )

    # Indexes
    __table_args__ = (
        Index('idx_chatbot_conv_user_id', 'user_id'),
        Index('idx_chatbot_conv_session_id', 'session_id'),
        Index('idx_chatbot_conv_token', 'conversation_token'),
        Index('idx_chatbot_conv_status', 'status'),
        Index('idx_chatbot_conv_created_at', 'created_at'),
        Index('idx_chatbot_conv_user_status', 'user_id', 'status'),
        Index('idx_chatbot_conv_session_status', 'session_id', 'status'),
    )

    def get_recent_messages(self, limit: int = 10) -> List["ChatBotMessage"]:
        """Retrieve recent messages from this conversation.

        Args:
            limit: Maximum number of messages to return (default: 10).

        Returns:
            List of ChatBotMessage objects, ordered by timestamp descending.
        """
        return sorted(self.messages, key=lambda m: m.timestamp, reverse=True)[:limit]

    def get_message_count(self) -> int:
        """Get total message count in this conversation.

        Returns:
            Number of messages in this conversation.
        """
        return len(self.messages)

    def set_metadata(self, key: str, value: Any) -> None:
        """Set metadata field safely.

        Args:
            key: Metadata key to set.
            value: Value to store.
        """
        if self.conversation_metadata is None:
            self.conversation_metadata = {}
        self.conversation_metadata[key] = value
        self.updated_at = datetime.now(timezone.utc)

    def get_metadata(self, key: str, default: Any = None) -> Any:
        """Get metadata field safely.

        Args:
            key: Metadata key to retrieve.
            default: Default value if key not found.

        Returns:
            Metadata value or default.
        """
        if self.conversation_metadata is None:
            return default
        return self.conversation_metadata.get(key, default)

    def __repr__(self) -> str:
        return f"<ChatBotConversation token={self.conversation_token} ({self.status})>"


class ChatBotMessage(Base):
    """Individual message in a chatbot conversation.

    Tracks each exchange between user and AI bot, including intent analysis
    and extracted data (products, search queries, recommendations, etc).

    Attributes:
        id: Primary key (UUID)
        conversation_id: Foreign key to ChatBotConversation
        sender: Message sender ('user', 'bot')
        content: Message text content
        intent: Detected intent ('search', 'recommend', 'help', 'connect_seller', etc)
        extracted_data: JSON with parsed entities (products, filters, queries, etc)
        timestamp: Message creation time
    """

    __tablename__ = "chatbot_messages"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    conversation_id = Column(String(36), ForeignKey("chatbot_conversations.id", ondelete="CASCADE"), nullable=False, index=True)

    # Message Information
    sender = Column(String(20), nullable=False, index=True)  # 'user' or 'bot'
    content = Column(Text, nullable=False)

    # AI Analysis
    intent = Column(String(50), nullable=True, index=True)  # 'search', 'recommend', 'help', 'connect_seller', etc
    extracted_data = Column(JSON, default=dict, nullable=False)  # {products: [], search_query: "", filters: {}, etc}

    # Timestamps
    timestamp = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

    # Relationships
    conversation = relationship(
        "ChatBotConversation",
        back_populates="messages",
        foreign_keys=[conversation_id]
    )

    # Indexes
    __table_args__ = (
        Index('idx_chatbot_msg_conversation_id', 'conversation_id'),
        Index('idx_chatbot_msg_sender', 'sender'),
        Index('idx_chatbot_msg_intent', 'intent'),
        Index('idx_chatbot_msg_timestamp', 'timestamp'),
        Index('idx_chatbot_msg_conv_timestamp', 'conversation_id', 'timestamp'),
        Index('idx_chatbot_msg_conv_sender', 'conversation_id', 'sender'),
    )

    def set_extracted_data(self, key: str, value: Any) -> None:
        """Set extracted data field safely.

        Args:
            key: Data key to set (e.g., 'products', 'search_query', 'filters').
            value: Value to store.
        """
        if self.extracted_data is None:
            self.extracted_data = {}
        self.extracted_data[key] = value

    def get_extracted_data(self, key: str, default: Any = None) -> Any:
        """Get extracted data field safely.

        Args:
            key: Data key to retrieve.
            default: Default value if key not found.

        Returns:
            Extracted data value or default.
        """
        if self.extracted_data is None:
            return default
        return self.extracted_data.get(key, default)

    def is_user_message(self) -> bool:
        """Check if this message is from the user.

        Returns:
            True if sender is 'user', False otherwise.
        """
        return self.sender == "user"

    def is_bot_message(self) -> bool:
        """Check if this message is from the bot.

        Returns:
            True if sender is 'bot', False otherwise.
        """
        return self.sender == "bot"

    @classmethod
    def get_by_intent(cls, intent: str, limit: int = 100) -> List["ChatBotMessage"]:
        """Query messages by intent (for analytics/testing).

        This is a class method that would be called with a proper query context.

        Args:
            intent: Intent type to filter by.
            limit: Maximum number of results.

        Returns:
            List of ChatBotMessage objects with the given intent.
        """
        # Note: This would normally be called with a session like:
        # ChatBotMessage.get_by_intent('search')
        # In practice, use session.query(ChatBotMessage).filter_by(intent=intent).limit(limit).all()
        pass

    def __repr__(self) -> str:
        intent_str = f"intent={self.intent}" if self.intent else "intent=None"
        return f"<ChatBotMessage from={self.sender} {intent_str}>"
