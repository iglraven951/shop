"""Notifications REST API blueprint for DiscoveryShop."""

from flask import Blueprint, request, jsonify, g
from backend.auth import token_required
from backend.dtos import NotificationDTO
from backend.exceptions import (
    ValidationException,
    NotificationNotFoundException,
)

# Import services (when available from AGENT 3)
# from backend.services import NotificationService


notifications_bp = Blueprint("notifications", __name__, url_prefix="/notifications")


# ==================== RETRIEVAL ENDPOINTS ====================


@notifications_bp.route("/", methods=["GET"])
@token_required
def get_notifications():
    """
    Get notifications for the current user.

    Query Parameters:
        limit: Number of notifications to return (default: 20, max: 100)
        type: Filter by notification type (e.g., 'message', 'order', 'review')
               If not provided, returns all types

    Returns:
        200: List of NotificationDTO objects
        400: Invalid query parameters
        500: Internal server error

    Response format:
        {
            "notifications": [
                {
                    "id": 1,
                    "type": "message",
                    "title": "New message from john_doe",
                    "message": "Hey, how are you?",
                    "link_url": "/chat/user123",
                    "is_read": false,
                    "created_at": "2026-01-15T10:30:00Z"
                }
            ],
            "total": 42
        }
    """
    try:
        user_id = g.user_id
        limit = min(int(request.args.get("limit", 20)), 100)
        notification_type = request.args.get("type")

        if limit < 1:
            raise ValidationException("Limit must be at least 1")

        # Placeholder: Replace with NotificationService.get_notifications(user_id, limit, notification_type)
        # This should return both read and unread notifications
        notifications = []

        return jsonify({
            "notifications": [notif.to_dict() if hasattr(notif, "to_dict") else notif for notif in notifications],
            "total": len(notifications)
        }), 200

    except ValidationException as e:
        return jsonify({"error": e.message}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@notifications_bp.route("/unread", methods=["GET"])
@token_required
def get_unread_notifications():
    """
    Get unread notifications count and list for the current user.

    Query Parameters:
        limit: Number of notifications to return (default: 20, max: 100)

    Returns:
        200: Count and list of unread NotificationDTO objects
        400: Invalid query parameters
        500: Internal server error

    Response format:
        {
            "count": 5,
            "notifications": [
                {
                    "id": 1,
                    "type": "message",
                    "title": "New message from john_doe",
                    "message": "Hey, how are you?",
                    "link_url": "/chat/user123",
                    "is_read": false,
                    "created_at": "2026-01-15T10:30:00Z"
                }
            ]
        }
    """
    try:
        user_id = g.user_id
        limit = min(int(request.args.get("limit", 20)), 100)

        if limit < 1:
            raise ValidationException("Limit must be at least 1")

        # Placeholder: Replace with NotificationService.get_unread_notifications(user_id, limit)
        # This should return only unread notifications
        notifications = []
        count = len(notifications)

        return jsonify({
            "count": count,
            "notifications": [notif.to_dict() if hasattr(notif, "to_dict") else notif for notif in notifications]
        }), 200

    except ValidationException as e:
        return jsonify({"error": e.message}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== MARK AS READ ENDPOINTS ====================


@notifications_bp.route("/<notification_id>/read", methods=["PUT"])
@token_required
def mark_notification_as_read(notification_id: str):
    """
    Mark a single notification as read.

    Path Parameters:
        notification_id: ID of the notification to mark as read

    Returns:
        200: Notification marked as read
        404: Notification not found
        403: Unauthorized (user doesn't own this notification)
        500: Internal server error

    Response format:
        {
            "id": 1,
            "is_read": true,
            "message": "Notification marked as read"
        }
    """
    try:
        user_id = g.user_id

        # Placeholder: Replace with NotificationService.mark_as_read(user_id, notification_id)
        # This should:
        # 1. Verify the notification belongs to the user
        # 2. Update is_read to True
        # 3. Return the updated NotificationDTO
        notification = None

        if not notification:
            return jsonify({"error": "Notification not found"}), 404

        return jsonify({
            "id": notification_id,
            "is_read": True,
            "message": "Notification marked as read"
        }), 200

    except NotificationNotFoundException:
        return jsonify({"error": "Notification not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@notifications_bp.route("/read-all", methods=["POST"])
@token_required
def mark_all_notifications_as_read():
    """
    Mark all notifications as read for the current user.

    Returns:
        200: All notifications marked as read
        500: Internal server error

    Response format:
        {
            "count": 7,
            "message": "7 notifications marked as read"
        }
    """
    try:
        user_id = g.user_id

        # Placeholder: Replace with NotificationService.mark_all_as_read(user_id)
        # This should:
        # 1. Update all unread notifications for the user to is_read=True
        # 2. Return count of updated notifications
        count = 0

        return jsonify({
            "count": count,
            "message": f"{count} notifications marked as read"
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== DELETE ENDPOINTS ====================


@notifications_bp.route("/<notification_id>", methods=["DELETE"])
@token_required
def delete_notification(notification_id: str):
    """
    Delete a single notification.

    Path Parameters:
        notification_id: ID of the notification to delete

    Returns:
        200: Notification deleted
        404: Notification not found
        403: Unauthorized (user doesn't own this notification)
        500: Internal server error

    Response format:
        {
            "message": "Notification deleted"
        }
    """
    try:
        user_id = g.user_id

        # Placeholder: Replace with NotificationService.delete_notification(user_id, notification_id)
        # This should:
        # 1. Verify the notification belongs to the user
        # 2. Delete the notification
        # 3. Return success response
        deleted = False

        if not deleted:
            return jsonify({"error": "Notification not found"}), 404

        return jsonify({"message": "Notification deleted"}), 200

    except NotificationNotFoundException:
        return jsonify({"error": "Notification not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@notifications_bp.route("/clear-type", methods=["DELETE"])
@token_required
def clear_notifications_by_type():
    """
    Clear all notifications of a specific type for the current user.

    Query Parameters:
        type: Notification type to clear (required)
              Examples: 'message', 'order', 'review', 'system'

    Returns:
        200: Notifications of type cleared
        400: Missing or invalid type parameter
        500: Internal server error

    Response format:
        {
            "count": 5,
            "type": "message",
            "message": "5 notifications of type 'message' deleted"
        }
    """
    try:
        user_id = g.user_id
        notification_type = request.args.get("type", "").strip()

        if not notification_type:
            raise ValidationException("Type parameter is required")

        # Validate notification type (optional - depends on implementation)
        valid_types = ["message", "order", "review", "system", "product", "payment"]
        if notification_type not in valid_types:
            raise ValidationException(f"Invalid type. Valid types: {', '.join(valid_types)}")

        # Placeholder: Replace with NotificationService.clear_by_type(user_id, notification_type)
        # This should:
        # 1. Delete all notifications of the specified type for the user
        # 2. Return count of deleted notifications
        count = 0

        return jsonify({
            "count": count,
            "type": notification_type,
            "message": f"{count} notifications of type '{notification_type}' deleted"
        }), 200

    except ValidationException as e:
        return jsonify({"error": e.message}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== ERROR HANDLERS ====================


@notifications_bp.errorhandler(400)
def handle_bad_request(e):
    """Handle 400 Bad Request errors."""
    return jsonify({"error": "Bad request"}), 400


@notifications_bp.errorhandler(404)
def handle_not_found(e):
    """Handle 404 Not Found errors."""
    return jsonify({"error": "Resource not found"}), 404


@notifications_bp.errorhandler(500)
def handle_internal_error(e):
    """Handle 500 Internal Server errors."""
    return jsonify({"error": "Internal server error"}), 500
