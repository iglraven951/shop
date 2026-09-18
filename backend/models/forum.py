"""Forum discussion models for product-related discussions."""

from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Index, Text, Integer
from sqlalchemy.orm import relationship
from backend.database import Base


class ForumTopic(Base):
    """Forum discussion topic on a product.

    Represents a discussion thread started by a user about a product.

    Attributes:
        id: Primary key (UUID)
        product_id: Foreign key to Product
        author_id: Foreign key to User (who started the topic)
        title: Topic title
        content: Initial post content
        created_at: Topic creation timestamp
        updated_at: Last modification timestamp
    """

    __tablename__ = "forum_topics"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Content
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)

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
    product = relationship("Product", back_populates="forum_topics")
    author = relationship("User", back_populates="forum_topics")
    replies = relationship("ForumReply", back_populates="topic", cascade="all, delete-orphan")

    # Indexes for forum queries
    __table_args__ = (
        Index('idx_forum_topic_product_id', 'product_id'),
        Index('idx_forum_topic_author_id', 'author_id'),
        Index('idx_forum_topic_created_at', 'created_at'),

        # Composite indexes for common patterns
        # Product discussions sorted by recency
        Index('idx_forum_topic_product_created', 'product_id', 'created_at'),

        # User's topics
        Index('idx_forum_topic_author_created', 'author_id', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<ForumTopic product_id={self.product_id} title={self.title}>"


class ForumReply(Base):
    """Reply to a forum discussion topic.

    Represents a response to a forum topic.

    Attributes:
        id: Primary key (UUID)
        topic_id: Foreign key to ForumTopic
        author_id: Foreign key to User (who wrote the reply)
        content: Reply content
        helpful_count: Number of "helpful" votes
        not_helpful_count: Number of "not helpful" votes
        created_at: Reply creation timestamp
        updated_at: Last modification timestamp
    """

    __tablename__ = "forum_replies"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    topic_id = Column(String(36), ForeignKey("forum_topics.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Content
    content = Column(Text, nullable=False)

    # Voting
    helpful_count = Column(Integer, default=0, nullable=False)
    not_helpful_count = Column(Integer, default=0, nullable=False)

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
    topic = relationship("ForumTopic", back_populates="replies")
    author = relationship("User", back_populates="forum_replies")
    votes = relationship("ForumVote", back_populates="reply", cascade="all, delete-orphan")

    # Indexes for reply queries
    __table_args__ = (
        Index('idx_forum_reply_topic_id', 'topic_id'),
        Index('idx_forum_reply_author_id', 'author_id'),
        Index('idx_forum_reply_created_at', 'created_at'),

        # Composite indexes for common patterns
        # Topic replies sorted by recency
        Index('idx_forum_reply_topic_created', 'topic_id', 'created_at'),

        # User's replies
        Index('idx_forum_reply_author_created', 'author_id', 'created_at'),

        # Sort by helpful votes
        Index('idx_forum_reply_helpful', 'helpful_count'),
    )

    def __repr__(self) -> str:
        return f"<ForumReply topic_id={self.topic_id} helpful={self.helpful_count}>"


class ForumVote(Base):
    """User vote on a forum reply (helpful/not helpful).

    Represents whether a user found a reply helpful or not.

    Attributes:
        id: Primary key (UUID)
        reply_id: Foreign key to ForumReply
        user_id: Foreign key to User (who voted)
        vote_type: Type of vote ('helpful' or 'not_helpful')
        created_at: Vote timestamp
    """

    __tablename__ = "forum_votes"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: __import__('uuid').uuid4().hex)

    # Foreign Keys
    reply_id = Column(String(36), ForeignKey("forum_replies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Vote Information
    vote_type = Column(String(20), nullable=False)  # 'helpful' or 'not_helpful'

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

    # Relationships
    reply = relationship("ForumReply", back_populates="votes")
    user = relationship("User")

    # Indexes for vote queries
    __table_args__ = (
        Index('idx_forum_vote_reply_id', 'reply_id'),
        Index('idx_forum_vote_user_id', 'user_id'),
        Index('idx_forum_vote_type', 'vote_type'),

        # Composite indexes for common patterns
        # Find user's votes on a reply
        Index('idx_forum_vote_reply_user', 'reply_id', 'user_id'),
    )

    def __repr__(self) -> str:
        return f"<ForumVote reply_id={self.reply_id} type={self.vote_type}>"
