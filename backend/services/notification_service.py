"""Notification service for user notifications."""

import logging
from typing import List, Tuple, Optional
from datetime import datetime

from ..dtos import NotificationDTO
from ..exceptions import UserNotFoundException, NotificationNotFoundException, ValidationException


logger = logging.getLogger(__name__)


class NotificationService:
    """Service for managing user notifications."""

    NOTIFICATION_TYPES = [
        "order_update",
        "new_message",
        "product_approved",
        "product_rejected",
        "new_review",
        "seller_verified",
        "order_cancelled",
        "product_listed",
    ]

    def __init__(self, db):
        """Initialize service with database instance."""
        self.db = db

    def create_notification(
        self,
        user_id: int,
        notification_type: str,
        title: str,
        message: str,
        link_url: Optional[str] = None,
    ) -> NotificationDTO:
        """
        Create a notification for a user.

        Args:
            user_id: User ID to notify
            notification_type: Type of notification
            title: Notification title
            message: Notification message
            link_url: Optional link URL for action

        Returns:
            NotificationDTO with created notification

        Raises:
            UserNotFoundException: If user not found
            ValidationException: If validation fails
        """
        from ..models import User, Notification

        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            raise UserNotFoundException()

        if notification_type not in self.NOTIFICATION_TYPES:
            raise ValidationException(f"Invalid notification type: {notification_type}")

        if not title or len(title.strip()) == 0:
            raise ValidationException("Notification title cannot be empty")

        if not message or len(message.strip()) == 0:
            raise ValidationException("Notification message cannot be empty")

        # Create notification
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            link_url=link_url,
            is_read=False,
            created_at=datetime.utcnow(),
        )

        try:
            self.db.session.add(notification)
            self.db.session.commit()
            logger.info(f"Notification created for user {user_id}: {notification_type}")

            return NotificationDTO(
                id=notification.id,
                type=notification.type,
                title=notification.title,
                message=notification.message,
                link_url=notification.link_url,
                is_read=notification.is_read,
                created_at=notification.created_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Notification creation failed: {str(e)}")
            raise ValidationException(f"Notification creation failed: {str(e)}")

    def get_notifications(
        self, user_id: int, limit: int = 20, offset: int = 0, unread_only: bool = False
    ) -> Tuple[List[NotificationDTO], int]:
        """
        Get notifications for a user.

        Args:
            user_id: User ID
            limit: Number of notifications to return
            offset: Pagination offset
            unread_only: If True, only return unread notifications

        Returns:
            Tuple of (notifications list, total count)

        Raises:
            UserNotFoundException: If user not found
        """
        from ..models import User, Notification

        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            raise UserNotFoundException()

        query = Notification.query.filter_by(user_id=user_id)

        if unread_only:
            query = query.filter_by(is_read=False)

        total = query.count()
        notifications = (
            query.order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        notification_dtos = [
            NotificationDTO(
                id=n.id,
                type=n.type,
                title=n.title,
                message=n.message,
                link_url=n.link_url,
                is_read=n.is_read,
                created_at=n.created_at,
            )
            for n in notifications
        ]

        return notification_dtos, total

    def mark_as_read(self, notification_id: int, user_id: int) -> bool:
        """
        Mark a notification as read.

        Args:
            notification_id: Notification ID
            user_id: User ID (for authorization)

        Returns:
            True if successful

        Raises:
            NotificationNotFoundException: If notification not found
        """
        from ..models import Notification

        notification = Notification.query.get(notification_id)
        if not notification:
            raise NotificationNotFoundException()

        if notification.user_id != user_id:
            raise UserNotFoundException()

        notification.is_read = True

        try:
            self.db.session.commit()
            logger.info(f"Notification marked as read: {notification_id}")
            return True

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Mark as read failed: {str(e)}")
            return False

    def mark_all_as_read(self, user_id: int) -> int:
        """
        Mark all notifications for a user as read.

        Args:
            user_id: User ID

        Returns:
            Number of notifications marked as read
        """
        from ..models import Notification

        notifications = Notification.query.filter(
            (Notification.user_id == user_id) & (Notification.is_read == False)
        ).all()

        count = len(notifications)

        for notification in notifications:
            notification.is_read = True

        try:
            if notifications:
                self.db.session.commit()
            logger.info(f"Marked {count} notifications as read for user {user_id}")
            return count

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Mark all as read failed: {str(e)}")
            return 0

    def clear_notifications(
        self, user_id: int, notification_type: Optional[str] = None
    ) -> int:
        """
        Delete notifications for a user.

        Args:
            user_id: User ID
            notification_type: Optional type filter

        Returns:
            Number of notifications deleted
        """
        from ..models import Notification

        query = Notification.query.filter_by(user_id=user_id)

        if notification_type:
            query = query.filter_by(type=notification_type)

        notifications = query.all()
        count = len(notifications)

        for notification in notifications:
            self.db.session.delete(notification)

        try:
            if notifications:
                self.db.session.commit()
            logger.info(
                f"Deleted {count} notifications for user {user_id}"
                + (f" of type {notification_type}" if notification_type else "")
            )
            return count

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Clear notifications failed: {str(e)}")
            return 0

    def get_unread_count(self, user_id: int) -> int:
        """
        Get count of unread notifications for user.

        Args:
            user_id: User ID

        Returns:
            Number of unread notifications
        """
        from ..models import Notification

        return Notification.query.filter(
            (Notification.user_id == user_id) & (Notification.is_read == False)
        ).count()

    def notify_order_update(
        self, order_id: int, user_id: int, new_status: str
    ) -> NotificationDTO:
        """
        Create order update notification.

        Args:
            order_id: Order ID
            user_id: User ID to notify
            new_status: New order status

        Returns:
            NotificationDTO
        """
        return self.create_notification(
            user_id=user_id,
            notification_type="order_update",
            title="Order Updated",
            message=f"Your order #{order_id} status is now: {new_status}",
            link_url=f"/orders/{order_id}",
        )

    def notify_new_message(
        self, user_id: int, from_username: str
    ) -> NotificationDTO:
        """
        Create new message notification.

        Args:
            user_id: User ID to notify
            from_username: Username of sender

        Returns:
            NotificationDTO
        """
        return self.create_notification(
            user_id=user_id,
            notification_type="new_message",
            title="New Message",
            message=f"You have a new message from {from_username}",
            link_url="/messages",
        )

    def notify_product_approved(
        self, product_id: int, seller_id: int, product_title: str
    ) -> NotificationDTO:
        """
        Create product approved notification.

        Args:
            product_id: Product ID
            seller_id: Seller user ID
            product_title: Product title

        Returns:
            NotificationDTO
        """
        return self.create_notification(
            user_id=seller_id,
            notification_type="product_approved",
            title="Product Approved",
            message=f"Your product '{product_title}' has been approved!",
            link_url=f"/products/{product_id}",
        )

    def notify_product_rejected(
        self, product_id: int, seller_id: int, product_title: str, reason: str
    ) -> NotificationDTO:
        """
        Create product rejected notification.

        Args:
            product_id: Product ID
            seller_id: Seller user ID
            product_title: Product title
            reason: Rejection reason

        Returns:
            NotificationDTO
        """
        return self.create_notification(
            user_id=seller_id,
            notification_type="product_rejected",
            title="Product Rejected",
            message=f"Your product '{product_title}' was rejected. Reason: {reason}",
            link_url=f"/products/{product_id}",
        )

    def notify_new_review(
        self, product_id: int, seller_id: int, reviewer_name: str, rating: int
    ) -> NotificationDTO:
        """
        Create new review notification.

        Args:
            product_id: Product ID
            seller_id: Seller user ID
            reviewer_name: Name of reviewer
            rating: Review rating

        Returns:
            NotificationDTO
        """
        return self.create_notification(
            user_id=seller_id,
            notification_type="new_review",
            title="New Review",
            message=f"{reviewer_name} left a {rating}-star review on your product",
            link_url=f"/products/{product_id}",
        )

    def notify_seller_verified(self, seller_id: int) -> NotificationDTO:
        """
        Create seller verified notification.

        Args:
            seller_id: Seller user ID

        Returns:
            NotificationDTO
        """
        return self.create_notification(
            user_id=seller_id,
            notification_type="seller_verified",
            title="Account Verified",
            message="Your seller account has been verified!",
            link_url="/profile",
        )
