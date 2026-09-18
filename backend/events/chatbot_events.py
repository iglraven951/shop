"""WebSocket event handlers for AI chatbot real-time communication."""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict
from flask import request, g
from flask_socketio import SocketIO, join_room, leave_room, emit, disconnect
from backend.auth import verify_jwt_token
from backend.database import SessionLocal
from backend.models import ChatBotSession, ChatBotConversation, ChatBotMessage, User
from backend.services.ai_service import AIService

# Global state for tracking active chatbot sessions
# Structure: {session_id: {"user_id": str, "conversation_id": str, "socket_sid": str}}
active_sessions: Dict[str, dict] = {}


def create_chatbot_socketio(app) -> SocketIO:
    """
    Create and configure SocketIO instance for chatbot namespace.

    Args:
        app: Flask application instance

    Returns:
        Configured SocketIO instance with chatbot handlers
    """
    socketio = SocketIO(
        app,
        cors_allowed_origins=app.config.get("CORS_ORIGINS", ["http://localhost:3000", "http://localhost:5000"]),
        ping_timeout=60,
        ping_interval=25,
        logger=app.logger,
        engineio_logger=False,
        async_mode="threading"
    )

    # Register chatbot event handlers on /chatbot namespace
    register_chatbot_handlers(socketio)

    return socketio


def register_chatbot_handlers(socketio: SocketIO) -> None:
    """
    Register all WebSocket event handlers for chatbot on /chatbot namespace.

    Handlers:
    - connect: Authenticate user and create session
    - disconnect: Mark session as inactive
    - message: Receive user message, process with AI, save and respond
    - start_conversation: Create new conversation
    - typing: Broadcast typing indicator
    - close_conversation: End conversation
    """

    # ==================== CONNECTION EVENTS ====================

    @socketio.on("connect", namespace="/chatbot")
    def on_chatbot_connect():
        """
        Handle chatbot WebSocket connection.

        Client must pass JWT token via query parameter:
            socket = io("/chatbot", { query: "token=<jwt_token>" })

        Flow:
        1. Extract JWT token from query
        2. Verify token and extract user_id
        3. Create or retrieve ChatBotSession
        4. Join user-specific room (chatbot_user_{user_id})
        5. Emit connection_established to client
        6. Emit online_status to room

        Emits:
            - connection_established: Session created with session_id
            - connection_status: Connection confirmation
        """
        try:
            # Extract token from query parameters
            token = request.args.get("token")
            user_id = None

            # Try to verify JWT token (optional for guest conversations)
            if token:
                try:
                    payload = verify_jwt_token(token)
                    user_id = payload.get("user_id") if payload else None
                except Exception as e:
                    print(f"[ChatBot WebSocket] Token verification failed: {e}")
                    # Allow guest conversations if token verification fails

            # Create session ID
            session_id = str(uuid.uuid4())
            socket_sid = request.sid

            # Try to save session to database
            try:
                db = SessionLocal()

                # Get IP address
                ip_address = request.remote_addr or "unknown"

                # Create ChatBotSession in database
                session = ChatBotSession(
                    id=session_id,
                    user_id=user_id,
                    ip_address=ip_address,
                    status="active",
                    conversation_tokens_used=0,
                    messages_count=0,
                    created_at=datetime.now(timezone.utc),
                    last_activity=datetime.now(timezone.utc)
                )
                db.add(session)
                db.commit()
                db.close()

            except Exception as db_error:
                print(f"[ChatBot WebSocket] Database error creating session: {db_error}")
                # Continue anyway with in-memory session

            # Store in global sessions tracking
            active_sessions[session_id] = {
                "user_id": user_id,
                "socket_sid": socket_sid,
                "conversation_id": None,
                "connected_at": datetime.now(timezone.utc).isoformat()
            }

            # Store session_id in g for later handlers
            g.session_id = session_id
            g.user_id = user_id

            # Join user-specific room
            user_room = f"chatbot_user_{user_id}" if user_id else f"chatbot_guest_{session_id}"
            join_room(user_room)

            print(f"[ChatBot WebSocket] Session {session_id} connected (User: {user_id}, SID: {socket_sid})")

            # Emit connection established to client
            emit("connection_established", {
                "session_id": session_id,
                "user_id": user_id,
                "status": "connected",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message": "¡Bienvenido! Soy tu asistente de DiscoveryShop. ¿Cómo puedo ayudarte hoy?"
            })

        except Exception as e:
            print(f"[ChatBot WebSocket] Connection error: {str(e)}")
            emit("connection_error", {
                "error": "Failed to establish connection",
                "details": str(e)
            })
            disconnect()
            return False

    @socketio.on("disconnect", namespace="/chatbot")
    def on_chatbot_disconnect():
        """
        Handle chatbot WebSocket disconnection.

        Flow:
        1. Find session by socket_sid
        2. Mark session as inactive in database
        3. Remove from active_sessions
        4. Leave user-specific room
        5. Log disconnection

        Emits:
            - session_closed: To client (if still connected)
        """
        try:
            socket_sid = request.sid
            session_id = None

            # Find session by socket SID
            for sid, session_data in list(active_sessions.items()):
                if session_data.get("socket_sid") == socket_sid:
                    session_id = sid
                    break

            if not session_id:
                print(f"[ChatBot WebSocket] Unknown session disconnected (SID: {socket_sid})")
                return

            session_data = active_sessions.pop(session_id, {})
            user_id = session_data.get("user_id")

            # Try to update session status in database
            try:
                db = SessionLocal()
                session_record = db.query(ChatBotSession).filter(
                    ChatBotSession.id == session_id
                ).first()

                if session_record:
                    session_record.status = "inactive"
                    session_record.last_activity = datetime.now(timezone.utc)
                    db.commit()

                db.close()

            except Exception as db_error:
                print(f"[ChatBot WebSocket] Database error updating session: {db_error}")

            print(f"[ChatBot WebSocket] Session {session_id} disconnected (User: {user_id})")

            # Leave room
            user_room = f"chatbot_user_{user_id}" if user_id else f"chatbot_guest_{session_id}"
            leave_room(user_room)

        except Exception as e:
            print(f"[ChatBot WebSocket] Disconnect error: {str(e)}")

    # ==================== MESSAGING EVENTS ====================

    @socketio.on("message", namespace="/chatbot")
    def on_chatbot_message(data):
        """
        Handle user message in chatbot conversation.

        Expected data:
        {
            "text": "¿Cómo creo una cuenta?",
            "conversation_id": "uuid" (optional)
        }

        Flow:
        1. Validate message data
        2. Get session and user info
        3. Find or create conversation
        4. Call AIService to process message
        5. Save user message to database
        6. Save bot response to database
        7. Emit bot_response to client
        8. Update conversation metadata

        Emits (to client):
            - bot_response: AI response with metadata
            - message_saved: Confirmation
            - error: If validation fails
        """
        try:
            session_id = getattr(g, "session_id", None)
            user_id = getattr(g, "user_id", None)

            if not session_id:
                emit("error", {"message": "Session not found"})
                return

            # Validate message
            user_text = data.get("text", "").strip() if isinstance(data, dict) else ""
            conversation_id = data.get("conversation_id") if isinstance(data, dict) else None

            if not user_text:
                emit("error", {"message": "El mensaje no puede estar vacío"})
                return

            if len(user_text) > 2000:
                emit("error", {"message": "El mensaje es demasiado largo (máximo 2000 caracteres)"})
                return

            # Emit typing indicator to client
            emit("bot_typing", {
                "is_typing": True,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            # Get or create conversation
            db = SessionLocal()

            if not conversation_id:
                conversation_id = str(uuid.uuid4())
                conversation_token = str(uuid.uuid4())
                conversation = ChatBotConversation(
                    id=conversation_id,
                    user_id=user_id,
                    session_id=session_id,
                    conversation_token=conversation_token,
                    status="active",
                    metadata={
                        "first_message": user_text[:100],
                        "topic": "general"
                    },
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                db.add(conversation)
            else:
                # Update existing conversation
                conversation = db.query(ChatBotConversation).filter(
                    ChatBotConversation.id == conversation_id
                ).first()

                if not conversation:
                    conversation_token = str(uuid.uuid4())
                    conversation = ChatBotConversation(
                        id=conversation_id,
                        user_id=user_id,
                        session_id=session_id,
                        conversation_token=conversation_token,
                        status="active",
                        metadata={},
                        created_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc)
                    )
                    db.add(conversation)
                else:
                    conversation.updated_at = datetime.now(timezone.utc)

            # Process message with AI Service
            ai_service = AIService()
            ai_response = ai_service.process_user_message(user_text)

            # Create user message record
            user_message = ChatBotMessage(
                id=str(uuid.uuid4()),
                conversation_id=conversation_id,
                sender="user",
                content=user_text,
                intent=ai_response.get("intent", "general"),
                extracted_data=ai_response.get("extracted_data", {}),
                timestamp=datetime.now(timezone.utc)
            )

            # Create bot response message record
            bot_message = ChatBotMessage(
                id=str(uuid.uuid4()),
                conversation_id=conversation_id,
                sender="bot",
                content=ai_response.get("response", ""),
                intent=ai_response.get("intent", "general"),
                extracted_data={
                    "action": ai_response.get("action", "inform"),
                    "confidence": ai_response.get("confidence", 85),
                    "suggestions": ai_response.get("suggestions", [])
                },
                timestamp=datetime.now(timezone.utc)
            )

            # Add both user and bot messages
            db.add(user_message)
            db.add(bot_message)

            # Update session activity
            session_record = db.query(ChatBotSession).filter(
                ChatBotSession.id == session_id
            ).first()

            if session_record:
                session_record.increment_message_count()
                session_record.increment_token_count(len(user_text.split()) + len(ai_response.get("response", "").split()))

            db.commit()

            # Store conversation_id in session
            active_sessions[session_id]["conversation_id"] = conversation_id

            db.close()

            # Emit bot response to client
            emit("bot_response", {
                "session_id": session_id,
                "conversation_id": conversation_id,
                "message_id": bot_message.id,
                "text": ai_response.get("response", ""),
                "intent": ai_response.get("intent", "general"),
                "action": ai_response.get("action", "inform"),
                "confidence": ai_response.get("confidence", 85),
                "suggestions": ai_response.get("suggestions", []),
                "is_typing": False,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            print(f"[ChatBot] Message from session {session_id}: '{user_text[:50]}...' -> Intent: {ai_response.get('intent')}")

        except Exception as e:
            print(f"[ChatBot WebSocket] message error: {str(e)}", exc_info=True)
            emit("error", {
                "message": "Error procesando tu mensaje",
                "details": str(e) if isinstance(e, Exception) else "Unknown error"
            })

    @socketio.on("start_conversation", namespace="/chatbot")
    def on_start_conversation(data):
        """
        Handle starting a new chatbot conversation.

        Expected data:
        {
            "title": "Búsqueda de productos" (optional)
        }

        Flow:
        1. Get session info
        2. Create new ChatBotConversation
        3. Update active session
        4. Emit conversation_started to client

        Emits:
            - conversation_started: With conversation_id
            - error: If creation fails
        """
        try:
            session_id = getattr(g, "session_id", None)
            user_id = getattr(g, "user_id", None)

            if not session_id:
                emit("error", {"message": "Session not found"})
                return

            # Create new conversation
            conversation_id = str(uuid.uuid4())
            title = data.get("title", "Conversation") if isinstance(data, dict) else "Conversation"

            try:
                db = SessionLocal()

                conversation = ChatBotConversation(
                    id=conversation_id,
                    user_id=user_id,
                    title=title,
                    intent="general",
                    is_active=1,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                db.add(conversation)
                db.commit()
                db.close()

            except Exception as db_error:
                print(f"[ChatBot WebSocket] Database error creating conversation: {db_error}")

            # Update session
            active_sessions[session_id]["conversation_id"] = conversation_id

            # Emit to client
            emit("conversation_started", {
                "conversation_id": conversation_id,
                "title": title,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message": f"Nueva conversación iniciada: {title}"
            })

            print(f"[ChatBot] Conversation {conversation_id} started for session {session_id}")

        except Exception as e:
            print(f"[ChatBot WebSocket] start_conversation error: {str(e)}")
            emit("error", {"message": "Failed to start conversation"})

    @socketio.on("typing", namespace="/chatbot")
    def on_chatbot_typing(data):
        """
        Handle typing indicator from client.

        Expected data:
        {
            "is_typing": true/false
        }

        Flow:
        1. Broadcast typing indicator to all users in conversation

        Note: This is primarily for multiplayer chat scenarios.
        For single user-bot chat, this is less critical.
        """
        try:
            session_id = getattr(g, "session_id", None)
            user_id = getattr(g, "user_id", None)

            if not session_id:
                return

            is_typing = data.get("is_typing", False) if isinstance(data, dict) else False

            # Emit typing indicator (useful if other users can see it)
            emit("user_typing", {
                "session_id": session_id,
                "user_id": user_id,
                "is_typing": is_typing,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, skip_sid=request.sid)

        except Exception as e:
            print(f"[ChatBot WebSocket] typing error: {str(e)}")

    @socketio.on("close_conversation", namespace="/chatbot")
    def on_close_conversation(data):
        """
        Handle closing a chatbot conversation.

        Expected data:
        {
            "conversation_id": "uuid",
            "feedback": "positive/negative/neutral" (optional)
        }

        Flow:
        1. Mark conversation as inactive
        2. Save feedback if provided
        3. Emit conversation_closed to client
        """
        try:
            session_id = getattr(g, "session_id", None)
            conversation_id = data.get("conversation_id") if isinstance(data, dict) else None

            if not session_id or not conversation_id:
                emit("error", {"message": "Missing required data"})
                return

            try:
                db = SessionLocal()

                conversation = db.query(ChatBotConversation).filter(
                    ChatBotConversation.id == conversation_id
                ).first()

                if conversation:
                    conversation.status = "closed"
                    conversation.updated_at = datetime.now(timezone.utc)
                    db.commit()

                db.close()

            except Exception as db_error:
                print(f"[ChatBot WebSocket] Database error closing conversation: {db_error}")

            # Clear from session
            if session_id in active_sessions:
                active_sessions[session_id]["conversation_id"] = None

            # Emit confirmation
            emit("conversation_closed", {
                "conversation_id": conversation_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message": "Conversation closed. Thanks for using our chatbot!"
            })

            print(f"[ChatBot] Conversation {conversation_id} closed")

        except Exception as e:
            print(f"[ChatBot WebSocket] close_conversation error: {str(e)}")
            emit("error", {"message": "Failed to close conversation"})

    # ==================== UTILITY EVENTS ====================

    @socketio.on("heartbeat", namespace="/chatbot")
    def on_chatbot_heartbeat():
        """
        Handle heartbeat/ping from client to keep connection alive.

        Emits:
            - heartbeat_response: Confirmation
        """
        try:
            session_id = getattr(g, "session_id", None)

            # Update last activity if session exists
            if session_id and session_id in active_sessions:
                try:
                    db = SessionLocal()
                    session_record = db.query(ChatBotSession).filter(
                        ChatBotSession.id == session_id
                    ).first()

                    if session_record:
                        session_record.last_activity = datetime.now(timezone.utc)
                        db.commit()

                    db.close()
                except Exception:
                    pass

            emit("heartbeat_response", {
                "status": "alive",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

        except Exception as e:
            print(f"[ChatBot WebSocket] heartbeat error: {str(e)}")


def get_active_sessions() -> Dict[str, dict]:
    """
    Get all active chatbot sessions.

    Returns:
        Dictionary of {session_id: session_data}
    """
    return active_sessions.copy()


def get_session_by_id(session_id: str) -> Optional[dict]:
    """
    Get a specific session by ID.

    Args:
        session_id: Session ID to retrieve

    Returns:
        Session data or None if not found
    """
    return active_sessions.get(session_id)


def broadcast_notification(session_id: str, notification_type: str, title: str,
                          message: str, data: Optional[dict] = None) -> None:
    """
    Broadcast a notification to a specific chatbot session.

    Args:
        session_id: Target session ID
        notification_type: Type of notification
        title: Notification title
        message: Notification message
        data: Optional additional data to include
    """
    if session_id not in active_sessions:
        print(f"[ChatBot] Session {session_id} not active for notification")
        return

    try:
        notification_data = {
            "type": notification_type,
            "title": title,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        if data:
            notification_data.update(data)

        # Get user_id from session to target the room
        session_data = active_sessions[session_id]
        user_id = session_data.get("user_id")
        user_room = f"chatbot_user_{user_id}" if user_id else f"chatbot_guest_{session_id}"

        # Emit via SocketIO (would need socketio object passed in)
        # This is a placeholder - actual emission requires socketio context
        print(f"[ChatBot] Notification for session {session_id}: {notification_data}")

    except Exception as e:
        print(f"[ChatBot] Failed to broadcast notification: {str(e)}")
