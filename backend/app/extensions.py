"""Flask extensions initialization module.

Centralizes initialization of all Flask extensions:
- JWT (Flask-JWT-Extended)
- CORS (Flask-CORS)
- SocketIO (Flask-SocketIO)
- Database (SQLAlchemy)

This follows the application factory pattern where extensions
are initialized separately from instantiation.
"""

from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO


# Extension instances - initialized globally, configured per app
cors = CORS()
jwt = JWTManager()
socketio = SocketIO()


def init_extensions(app: Flask) -> None:
    """
    Initialize all Flask extensions with the application.

    Args:
        app: Flask application instance.
    """
    # Initialize CORS
    cors_origins = app.config.get(
        "CORS_ORIGINS",
        ["http://localhost:3000", "http://localhost:5000", "http://localhost:5173"]
    )
    cors.init_app(app, origins=cors_origins, supports_credentials=True)

    # Initialize JWT
    jwt.init_app(app)

    # Initialize SocketIO for real-time features
    socketio.init_app(
        app,
        cors_allowed_origins=cors_origins,
        async_mode="gevent" if app.config.get("USE_GEVENT", False) else "threading",
        logger=app.config.get("DEBUG", False),
        engineio_logger=app.config.get("DEBUG", False),
    )

    # Set JWT callbacks
    setup_jwt_callbacks(app, jwt)


def setup_jwt_callbacks(app: Flask, jwt_manager: JWTManager) -> None:
    """
    Configure JWT callbacks for custom claims and error handling.

    Args:
        app: Flask application.
        jwt_manager: JWTManager instance.
    """

    # Custom claim loaders
    @jwt_manager.user_lookup_loader
    def user_lookup_callback(_jwt_header, jwt_data):
        """Load user from JWT claims."""
        from backend.infrastructure.database.session import get_db
        from backend.domain.models.user import User

        db = get_db()
        user_id = jwt_data.get("sub")
        return db.query(User).filter(User.id == user_id).first()

    # Error handlers
    @jwt_manager.expired_token_loader
    def expired_token_callback(_jwt_header, jwt_data):
        return {"error": "Token has expired"}, 401

    @jwt_manager.invalid_token_loader
    def invalid_token_callback(error):
        return {"error": "Invalid token"}, 401

    @jwt_manager.unauthorized_loader
    def missing_token_callback(error):
        return {"error": "Missing authorization token"}, 401
