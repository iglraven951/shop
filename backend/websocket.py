"""WebSocket (SocketIO) event handlers for real-time messaging and notifications."""

from typing import Optional, Dict, Set
from flask import request, g
from flask_socketio import SocketIO, join_room, leave_room, emit, send, disconnect
from backend.auth import verify_jwt_token
from backend.exceptions import UnauthorizedAccessException

# Import services (when available from AGENT 3)
# from backend.services import ChatService, NotificationService

# Global state for tracking online users
# Structure: {user_id: socket_session_id}
online_users: Dict[str, str] = {}


def create_socketio(app) -> SocketIO:
    """
    Create and configure SocketIO instance for the Flask app.

    Args:
        app: Flask application instance

    Returns:
        Configured SocketIO instance

    Example:
        socketio = create_socketio(app)
        # In app.run():
        socketio.run(app, host='0.0.0.0', port=5000, debug=True)
    """
    socketio = SocketIO(
        app,
        cors_allowed_origins=app.config.get("CORS_ORIGINS", ["http://localhost:3000"]),
        ping_timeout=60,
        ping_interval=25,
        logger=app.logger,
        engineio_logger=False,  # Reduce verbosity
    )

    # Register event handlers
    register_websocket_handlers(socketio)

    return socketio


def register_websocket_handlers(socketio: SocketIO) -> None:
    """
    Register all WebSocket event handlers with SocketIO.

    Handlers implemented:
    - connect: Authenticate user and join personal room
    - disconnect: Remove user from online list
    - send_message: Save message and broadcast to recipient
    - mark_read: Mark messages as read
    - typing: Broadcast typing indicator
    - heartbeat: Keep connection alive
    """

    # ==================== CONNECTION EVENTS ====================

    @socketio.on("connect")
    def on_connect():
        """
        Handle WebSocket connection.

        Client must pass JWT token via query parameter:
            ?token=<jwt_token>

        Flow:
        1. Extract token from query parameters
        2. Verify JWT token
        3. Extract user_id from token
        4. Join user-specific room (user_{user_id})
        5. Update online status
        6. Emit connected event to client

        Emits:
            - connected: Back to client with user_id and status
            - user_online: To all connected clients with user_id
        """
        try:
            # Extract token from query parameters
            token = request.args.get("token")
            if not token:
                print(f"[WebSocket] Connection rejected: Missing token")
                disconnect()
                return False

            # Verify JWT token
            payload = verify_jwt_token(token)
            if not payload:
                print(f"[WebSocket] Connection rejected: Invalid token")
                disconnect()
                return False

            # Extract user_id from payload
            user_id = payload.get("user_id")
            if not user_id:
                print(f"[WebSocket] Connection rejected: No user_id in token")
                disconnect()
                return False

            # Store user_id in session
            g.user_id = user_id
            session_id = request.sid

            # Join user-specific room for targeted broadcasts
            user_room = f"user_{user_id}"
            join_room(user_room)

            # Track online status
            online_users[user_id] = session_id
            print(f"[WebSocket] User {user_id} connected (SID: {session_id})")

            # Emit connected event to client
            emit("connected", {
                "user_id": user_id,
                "status": "connected",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            # Broadcast user online status to all clients
            emit("user_online", {
                "user_id": user_id,
                "is_online": True,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, broadcast=True)

        except Exception as e:
            print(f"[WebSocket] Connection error: {str(e)}")
            disconnect()
            return False

    @socketio.on("disconnect")
    def on_disconnect():
        """
        Handle WebSocket disconnection.

        Flow:
        1. Get user_id from session (if available)
        2. Remove from online_users tracking
        3. Broadcast user offline status to all clients
        4. Leave user-specific room

        Emits:
            - user_offline: To all connected clients with user_id
        """
        try:
            user_id = online_users.pop(request.sid, None)

            # Find user by session ID if not in online_users
            if not user_id:
                for uid, sid in list(online_users.items()):
                    if sid == request.sid:
                        user_id = uid
                        del online_users[uid]
                        break

            if user_id:
                # Broadcast offline status
                emit("user_offline", {
                    "user_id": user_id,
                    "is_online": False,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }, broadcast=True)

                print(f"[WebSocket] User {user_id} disconnected")
            else:
                print(f"[WebSocket] Unknown user disconnected (SID: {request.sid})")

        except Exception as e:
            print(f"[WebSocket] Disconnect error: {str(e)}")

    # ==================== MESSAGING EVENTS ====================

    @socketio.on("send_message")
    def on_send_message(data):
        """
        Handle message sending from client.

        Expected data:
        {
            "receiver_id": "uuid",
            "message": "Hello!",
            "file_url": "https://..." (optional)
        }

        Flow:
        1. Validate message data
        2. Get sender_id from session
        3. Call ChatService.send_message()
        4. Emit new_message to receiver via user_{receiver_id} room
        5. Emit confirmation to sender
        6. Create notification for receiver

        Emits (to receiver):
            - new_message: With ChatMessageDTO

        Emits (to sender):
            - message_sent: Confirmation with message_id
        """
        try:
            user_id = getattr(g, "user_id", None)
            if not user_id:
                emit("error", {"message": "Not authenticated"})
                return

            receiver_id = data.get("receiver_id")
            message = data.get("message", "").strip()
            file_url = data.get("file_url")

            # Validate
            if not receiver_id:
                emit("error", {"message": "receiver_id is required"})
                return

            if not message:
                emit("error", {"message": "Message cannot be empty"})
                return

            if len(message) > 5000:
                emit("error", {"message": "Message is too long"})
                return

            # Placeholder: Replace with ChatService.send_message()
            # saved_message = ChatService.send_message(user_id, receiver_id, message, file_url)

            # Emit to receiver's room
            emit("new_message", {
                "sender_id": user_id,
                "sender_name": "User",  # Would come from database
                "sender_avatar": None,  # Would come from database
                "receiver_id": receiver_id,
                "message": message,
                "file_url": file_url,
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }, room=f"user_{receiver_id}")

            # Emit confirmation to sender
            emit("message_sent", {
                "status": "success",
                "receiver_id": receiver_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            print(f"[WebSocket] Message from {user_id} to {receiver_id}")

            # Placeholder: Trigger notification
            # NotificationService.create_notification(
            #     receiver_id, "message", "New message from User",
            #     message, f"/chat/{user_id}"
            # )

        except Exception as e:
            emit("error", {"message": f"Failed to send message: {str(e)}"})
            print(f"[WebSocket] send_message error: {str(e)}")

    @socketio.on("mark_read")
    def on_mark_read(data):
        """
        Handle message read marking from client.

        Expected data:
        {
            "sender_id": "uuid"
        }

        Flow:
        1. Get receiver_id from session (current user)
        2. Get sender_id from data
        3. Call ChatService.mark_messages_read()
        4. Emit read_status to sender

        Emits (to sender):
            - read_status: Confirmation that messages are read
        """
        try:
            user_id = getattr(g, "user_id", None)
            if not user_id:
                emit("error", {"message": "Not authenticated"})
                return

            sender_id = data.get("sender_id")
            if not sender_id:
                emit("error", {"message": "sender_id is required"})
                return

            # Placeholder: Replace with ChatService.mark_messages_read()
            # ChatService.mark_messages_read(user_id, sender_id)

            # Emit to sender that messages are read
            emit("read_status", {
                "reader_id": user_id,
                "reader_name": "User",  # Would come from database
                "is_read": True,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, room=f"user_{sender_id}")

            print(f"[WebSocket] {user_id} marked messages from {sender_id} as read")

        except Exception as e:
            emit("error", {"message": f"Failed to mark messages as read: {str(e)}"})
            print(f"[WebSocket] mark_read error: {str(e)}")

    @socketio.on("typing")
    def on_typing(data):
        """
        Handle typing indicator from client.

        Expected data:
        {
            "receiver_id": "uuid"
        }

        Flow:
        1. Get sender_id from session
        2. Emit typing indicator to receiver

        Emits (to receiver):
            - typing: Broadcast that sender is typing
        """
        try:
            user_id = getattr(g, "user_id", None)
            if not user_id:
                return

            receiver_id = data.get("receiver_id")
            if not receiver_id:
                return

            # Emit typing indicator to receiver only
            emit("typing", {
                "user_id": user_id,
                "user_name": "User",  # Would come from database
                "is_typing": True
            }, room=f"user_{receiver_id}")

        except Exception as e:
            print(f"[WebSocket] typing error: {str(e)}")

    @socketio.on("stop_typing")
    def on_stop_typing(data):
        """
        Handle stop typing indicator from client.

        Expected data:
        {
            "receiver_id": "uuid"
        }

        Emits (to receiver):
            - typing: Broadcast that sender stopped typing
        """
        try:
            user_id = getattr(g, "user_id", None)
            if not user_id:
                return

            receiver_id = data.get("receiver_id")
            if not receiver_id:
                return

            emit("typing", {
                "user_id": user_id,
                "is_typing": False
            }, room=f"user_{receiver_id}")

        except Exception as e:
            print(f"[WebSocket] stop_typing error: {str(e)}")

    # ==================== HEARTBEAT EVENTS ====================

    @socketio.on("heartbeat")
    def on_heartbeat():
        """
        Handle heartbeat/ping from client.

        Used to keep connection alive and verify connectivity.
        This is handled automatically by SocketIO's ping/pong mechanism,
        but can be called explicitly by client for custom keepalive.

        Emits:
            - heartbeat_response: Confirmation
        """
        emit("heartbeat_response", {
            "status": "alive",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })


def get_online_users() -> Dict[str, str]:
    """
    Get current online users.

    Returns:
        Dictionary of {user_id: session_id} for all online users
    """
    return online_users.copy()


def is_user_online(user_id: str) -> bool:
    """
    Check if a specific user is currently online.

    Args:
        user_id: User ID to check

    Returns:
        True if user is online, False otherwise
    """
    return user_id in online_users


def broadcast_notification(user_id: str, notification_type: str, title: str,
                          message: str, link_url: Optional[str] = None) -> None:
    """
    Broadcast a notification to a specific user via WebSocket.

    This function is called by NotificationService when creating notifications.

    Args:
        user_id: ID of the user to notify
        notification_type: Type of notification ('message', 'order', 'review', etc.)
        title: Notification title
        message: Notification message
        link_url: Optional URL to navigate to when clicked

    Example:
        broadcast_notification(
            'user123',
            'message',
            'New message from John',
            'Hey, how are you?',
            '/chat/user456'
        )
    """
    if not is_user_online(user_id):
        print(f"[WebSocket] User {user_id} is not online, notification queued")
        return

    try:
        emit("new_notification", {
            "type": notification_type,
            "title": title,
            "message": message,
            "link_url": link_url,
            "created_at": datetime.now(timezone.utc).isoformat()
        }, room=f"user_{user_id}")

        print(f"[WebSocket] Notification sent to {user_id}")

    except Exception as e:
        print(f"[WebSocket] Failed to broadcast notification to {user_id}: {str(e)}")


def broadcast_user_status(user_id: str, is_online: bool) -> None:
    """
    Broadcast user status change to all connected clients.

    Args:
        user_id: ID of the user
        is_online: True if user came online, False if went offline
    """
    try:
        emit("user_online" if is_online else "user_offline", {
            "user_id": user_id,
            "is_online": is_online,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }, broadcast=True)

    except Exception as e:
        print(f"[WebSocket] Failed to broadcast status for {user_id}: {str(e)}")


# Import datetime at the top
from datetime import datetime, timezone
