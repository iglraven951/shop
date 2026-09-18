"""Notification management routes (list, mark as read, etc)."""

from flask import Blueprint, jsonify

# Create blueprint
notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('/notifications/health', methods=['GET'])
def health():
    """Health check for notifications module."""
    return jsonify({"status": "ok", "module": "notifications"}), 200


# TODO: Implement notification routes
# - GET /notifications - List user's notifications
# - PUT /notifications/{id}/read - Mark as read
# - DELETE /notifications/{id} - Delete notification
# - WebSocket: Real-time notification delivery

__all__ = ["notifications_bp"]
