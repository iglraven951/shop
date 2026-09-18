"""Forum request handlers (business logic)."""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.orm import Session
from backend.models import ForumTopic, ForumReply, ForumVote, User, Product
from backend.database import get_db


class ForumHandler:
    """Handler for forum operations."""

    @staticmethod
    def create_topic(
        product_id: str,
        title: str,
        content: str
    ) -> ForumTopic:
        """Create a new forum topic.

        Args:
            product_id: ID of the product being discussed
            title: Topic title
            content: Initial post content

        Returns:
            Created ForumTopic object

        Raises:
            ValueError: If product doesn't exist
        """
        author_id = get_jwt_identity()
        db = next(get_db())

        # Verify product exists
        product = db.query(Product).filter_by(id=product_id).first()
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        # Create topic
        new_topic = ForumTopic(
            product_id=product_id,
            author_id=author_id,
            title=title,
            content=content
        )

        db.add(new_topic)
        db.commit()
        db.refresh(new_topic)

        return new_topic

    @staticmethod
    def get_product_topics(
        product_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get all topics for a product.

        Args:
            product_id: ID of the product
            limit: Maximum topics to return
            offset: Pagination offset

        Returns:
            List of forum topics

        Raises:
            ValueError: If product doesn't exist
        """
        db = next(get_db())

        # Verify product exists
        product = db.query(Product).filter_by(id=product_id).first()
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        # Get topics
        topics = db.query(ForumTopic).filter_by(product_id=product_id).order_by(
            ForumTopic.created_at.desc()
        ).limit(limit).offset(offset).all()

        # Format response
        return [
            {
                "id": topic.id,
                "title": topic.title,
                "content": topic.content,
                "author_id": topic.author_id,
                "author_name": topic.author.full_name,
                "author_avatar": topic.author.avatar_url,
                "reply_count": len(topic.replies),
                "created_at": topic.created_at.isoformat(),
                "updated_at": topic.updated_at.isoformat()
            }
            for topic in topics
        ]

    @staticmethod
    def create_reply(
        topic_id: str,
        content: str
    ) -> ForumReply:
        """Create a reply to a forum topic.

        Args:
            topic_id: ID of the topic
            content: Reply content

        Returns:
            Created ForumReply object

        Raises:
            ValueError: If topic doesn't exist
        """
        author_id = get_jwt_identity()
        db = next(get_db())

        # Verify topic exists
        topic = db.query(ForumTopic).filter_by(id=topic_id).first()
        if not topic:
            raise ValueError(f"Tópico {topic_id} não encontrado")

        # Create reply
        new_reply = ForumReply(
            topic_id=topic_id,
            author_id=author_id,
            content=content
        )

        db.add(new_reply)
        db.commit()
        db.refresh(new_reply)

        return new_reply

    @staticmethod
    def get_topic_replies(
        topic_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get all replies for a topic.

        Args:
            topic_id: ID of the topic
            limit: Maximum replies to return
            offset: Pagination offset

        Returns:
            List of forum replies sorted by helpful votes

        Raises:
            ValueError: If topic doesn't exist
        """
        db = next(get_db())

        # Verify topic exists
        topic = db.query(ForumTopic).filter_by(id=topic_id).first()
        if not topic:
            raise ValueError(f"Tópico {topic_id} não encontrado")

        # Get replies sorted by helpful votes
        replies = db.query(ForumReply).filter_by(topic_id=topic_id).order_by(
            ForumReply.helpful_count.desc(),
            ForumReply.created_at.asc()
        ).limit(limit).offset(offset).all()

        # Format response
        return [
            {
                "id": reply.id,
                "content": reply.content,
                "author_id": reply.author_id,
                "author_name": reply.author.full_name,
                "author_avatar": reply.author.avatar_url,
                "helpful_count": reply.helpful_count,
                "not_helpful_count": reply.not_helpful_count,
                "net_votes": reply.helpful_count - reply.not_helpful_count,
                "created_at": reply.created_at.isoformat(),
                "updated_at": reply.updated_at.isoformat()
            }
            for reply in replies
        ]

    @staticmethod
    def vote_on_reply(
        reply_id: str,
        vote_type: str  # 'helpful' or 'not_helpful'
    ) -> Dict[str, Any]:
        """Vote on a forum reply (helpful/not helpful).

        Args:
            reply_id: ID of the reply
            vote_type: Type of vote ('helpful' or 'not_helpful')

        Returns:
            Updated reply with vote counts

        Raises:
            ValueError: If reply doesn't exist or vote type is invalid
        """
        user_id = get_jwt_identity()
        db = next(get_db())

        # Validate vote type
        if vote_type not in ['helpful', 'not_helpful']:
            raise ValueError("vote_type deve ser 'helpful' ou 'not_helpful'")

        # Verify reply exists
        reply = db.query(ForumReply).filter_by(id=reply_id).first()
        if not reply:
            raise ValueError(f"Resposta {reply_id} não encontrada")

        # Check if user already voted
        existing_vote = db.query(ForumVote).filter_by(
            reply_id=reply_id,
            user_id=user_id
        ).first()

        if existing_vote:
            # Remove old vote
            if existing_vote.vote_type == 'helpful':
                reply.helpful_count = max(0, reply.helpful_count - 1)
            else:
                reply.not_helpful_count = max(0, reply.not_helpful_count - 1)

            # If same vote, remove it; otherwise, change it
            if existing_vote.vote_type == vote_type:
                db.delete(existing_vote)
            else:
                existing_vote.vote_type = vote_type
                if vote_type == 'helpful':
                    reply.helpful_count += 1
                else:
                    reply.not_helpful_count += 1
        else:
            # Add new vote
            new_vote = ForumVote(
                reply_id=reply_id,
                user_id=user_id,
                vote_type=vote_type
            )
            db.add(new_vote)

            if vote_type == 'helpful':
                reply.helpful_count += 1
            else:
                reply.not_helpful_count += 1

        db.commit()
        db.refresh(reply)

        return {
            "id": reply.id,
            "helpful_count": reply.helpful_count,
            "not_helpful_count": reply.not_helpful_count,
            "net_votes": reply.helpful_count - reply.not_helpful_count
        }


__all__ = ["ForumHandler"]
