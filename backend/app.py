"""DiscoveryShop Marketplace - Main Flask Application."""

import os
import sys
from pathlib import Path

# Get project root directory FIRST
current_dir = Path(__file__).parent
project_root = current_dir.parent

# Add BOTH to Python path (in case running from backend/)
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(current_dir))

# Load environment variables from .env
from dotenv import load_dotenv
load_dotenv()

# Now import Flask and other modules
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from werkzeug.exceptions import HTTPException
from backend.config.security import SecurityConfig

# Global SocketIO instance
socketio = None


def create_app(config_name: str | None = None) -> tuple[Flask, SocketIO] | Flask:
    """
    Application factory for creating Flask app instances.

    Args:
        config_name: Configuration name ('development', 'production', 'testing').
                    Defaults to FLASK_ENV environment variable.

    Returns:
        Configured Flask application instance.
    """
    from backend.config import configs, DevelopmentConfig
    from backend.extensions import setup_logging

    # Determine configuration
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    config_class = configs.get(config_name, DevelopmentConfig)

    # Create Flask app
    app = Flask(
        __name__,
        static_folder=str(project_root / "frontend"),
        static_url_path="/static",
        instance_relative_config=False,
    )

    # Load configuration
    app.config.from_object(config_class)

    # Setup logging early
    setup_logging(app)

    # Initialize extensions with restrictive CORS configuration
    cors_config = {
        "origins": app.config.get("CORS_ORIGINS", ["http://localhost:5000"]),
        "allow_headers": app.config.get("CORS_ALLOW_HEADERS"),
        "methods": app.config.get("CORS_METHODS"),
        "expose_headers": app.config.get("CORS_EXPOSE_HEADERS"),
        "max_age": app.config.get("CORS_MAX_AGE"),
        "supports_credentials": app.config.get("CORS_SUPPORTS_CREDENTIALS", True),
    }
    CORS(app, **cors_config)
    JWTManager(app)

    # Initialize SocketIO
    global socketio
    from backend.events.chatbot_events import create_chatbot_socketio
    socketio = create_chatbot_socketio(app)
    app.socketio = socketio

    # Initialize database
    initialize_database(app)

    # Register blueprints (imported from route modules when they exist)
    register_blueprints(app)

    # Register error handlers
    register_error_handlers(app)

    # Register security headers
    register_security_headers(app)

    # Register frontend serving routes
    register_frontend_routes(app)

    return app


def initialize_database(app: Flask) -> None:
    """
    Initialize SQLAlchemy database and create tables.

    Args:
        app: Flask application instance.
    """
    from backend.database import init_db, SessionLocal, get_db

    try:
        # Import all models to register them with SQLAlchemy
        from backend.models import (
            User, Profile, Category, Product, ProductImage,
            Cart, CartItem, Order, OrderItem,
            Review, Notification, Wishlist,
            ChatMessage, ProductApproval, Transaction,
            ChatBotSession, ChatBotConversation, ChatBotMessage
        )

        # Create all tables if they don't exist
        init_db()

        # Store database utilities in app context
        app.db = SessionLocal
        app.get_db = get_db

        app.logger.info("Database initialized successfully")
    except Exception as e:
        app.logger.error(f"Database initialization failed: {e}", exc_info=True)
        if app.config["TESTING"]:
            # Silently fail in testing
            pass
        else:
            raise


def register_blueprints(app: Flask) -> None:
    """
    Register all route blueprints with the Flask app.

    This function imports and registers blueprints from route modules.
    Blueprints will be created by:
    - AGENT 3: Cart and Order routes
    - AGENT 4: Authentication and user routes
    - AGENT 5: Product and marketplace routes
    - AGENT 6: Chat and notifications routes
    """
    try:
        # Cart blueprint (AGENT 3)
        try:
            from backend.routes.cart import cart_bp
            app.register_blueprint(cart_bp, url_prefix="/api/cart")
            app.logger.info("Cart blueprint registered")
        except ImportError as e:
            app.logger.warning(f"Cart blueprint not available: {e}")

        # Orders blueprint (AGENT 3)
        try:
            from backend.routes.orders import orders_bp
            app.register_blueprint(orders_bp, url_prefix="/api/orders")
            app.logger.info("Orders blueprint registered")
        except ImportError as e:
            app.logger.warning(f"Orders blueprint not available: {e}")

        # Auth blueprint (AGENT 4)
        from backend.routes.auth import auth_bp
        app.register_blueprint(auth_bp)

        # Users blueprint (AGENT 4)
        from backend.routes.users import users_bp
        app.register_blueprint(users_bp)

        # Simple Products blueprint (WORKING VERSION)
        try:
            from backend.routes.simple_products import simple_products_bp
            app.register_blueprint(simple_products_bp)
            app.logger.info("✅ Simple Products blueprint registered")
        except ImportError as e:
            app.logger.warning(f"Simple Products blueprint not available: {e}")

        # Products blueprint (AGENT 5)
        try:
            from backend.routes.products import products_bp
            app.register_blueprint(products_bp)
            app.logger.info("Products blueprint registered")
        except ImportError as e:
            app.logger.warning(f"Products blueprint not available: {e}")

        # Chat blueprint (AGENT 6)
        try:
            from backend.routes.chat import chat_bp
            app.register_blueprint(chat_bp, url_prefix="/api/chat")
            app.logger.info("Chat blueprint registered")
        except ImportError:
            app.logger.debug("Chat blueprint not yet available")

        # Notifications blueprint (AGENT 6)
        try:
            from backend.routes.notifications import notifications_bp
            app.register_blueprint(notifications_bp, url_prefix="/api/notifications")
            app.logger.info("Notifications blueprint registered")
        except ImportError:
            app.logger.debug("Notifications blueprint not yet available")

        # Admin blueprint (AGENT 8)
        try:
            from backend.routes.admin import admin_bp
            app.register_blueprint(admin_bp)
            app.logger.info("Admin blueprint registered")
        except ImportError as e:
            app.logger.warning(f"Admin blueprint not available: {e}")

        # Chatbot blueprint (AGENT 4)
        try:
            from backend.routes.chatbot import chatbot_bp
            app.register_blueprint(chatbot_bp)
            app.logger.info("Chatbot blueprint registered")
        except ImportError as e:
            app.logger.warning(f"Chatbot blueprint not available: {e}")

        app.logger.info("Route blueprints registered successfully")
    except ImportError as e:
        app.logger.warning(f"Some blueprints not yet implemented: {e}")


def register_frontend_routes(app: Flask) -> None:
    """
    Register routes for serving frontend files.

    Serves index.html for SPA routing and static assets from frontend directory.
    """

    @app.route("/")
    def serve_index():
        """Serve index.html for root path (SPA routing)."""
        index_path = project_root / "frontend" / "index.html"
        if index_path.exists():
            return send_from_directory(project_root / "frontend", "index.html")
        return jsonify({"message": "DiscoveryShop API v1.0.0"}), 200

    @app.route("/<path:path>")
    def serve_static(path: str):
        """
        Serve static files or index.html for SPA routing.

        If a file is requested and not found, serves index.html to allow
        client-side routing to handle the path.
        """
        # Don't serve index.html for API routes
        if path.startswith("api/"):
            return jsonify({"error": "Not found"}), 404

        frontend_path = project_root / "frontend" / path
        if frontend_path.exists() and frontend_path.is_file():
            return send_from_directory(project_root / "frontend", path)

        # Serve index.html for SPA routing
        index_path = project_root / "frontend" / "index.html"
        if index_path.exists():
            return send_from_directory(project_root / "frontend", "index.html")

        return jsonify({"error": "Not found"}), 404


def register_error_handlers(app: Flask) -> None:
    """Register global error handlers for the Flask app."""

    @app.errorhandler(404)
    def not_found(error):
        """Handle 404 Not Found errors."""
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def internal_error(error):
        """Handle 500 Internal Server errors."""
        app.logger.error(f"Internal server error: {error}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """Handle all HTTP exceptions."""
        return jsonify({"error": error.description}), error.code


def register_security_headers(app: Flask) -> None:
    """
    Register comprehensive security headers for all responses.

    Adds essential security headers to protect against common web vulnerabilities:
    - CSP: Prevents injection attacks (XSS, clickjacking)
    - X-Content-Type-Options: Prevents MIME type sniffing
    - X-Frame-Options: Prevents clickjacking by disallowing framing
    - X-XSS-Protection: Legacy XSS protection for older browsers
    - HSTS: Enforces HTTPS for all future connections
    - Referrer-Policy: Controls referrer information leakage
    - Permissions-Policy: Disables dangerous browser features

    Args:
        app: Flask application instance.
    """

    @app.after_request
    def set_security_headers(response):
        """Add security headers to every response."""
        # Get all security headers from configuration
        security_headers = SecurityConfig.get_security_headers()

        # Apply each security header to the response
        for header_name, header_value in security_headers.items():
            response.headers[header_name] = header_value

        return response


def main() -> None:
    """
    Main entry point for running the Flask application.

    Starts the development server with WebSocket support on http://localhost:5000
    """
    app = create_app()
    socketio_instance = app.socketio

    # Print startup information
    env = app.config.get("FLASK_ENV", "development")
    debug = app.config.get("DEBUG", False)
    ngrok_url = app.config.get("NGROK_URL", "").strip()

    print(f"\n{'='*70}")
    print("DiscoveryShop Marketplace Backend")
    print(f"{'='*70}")
    print(f"Environment: {env}")
    print(f"Debug Mode: {debug}")
    print(f"Database: {app.config.get('SQLALCHEMY_DATABASE_URI', 'SQLite')}")
    print(f"Starting server on http://localhost:5000")
    print(f"WebSocket: ws://localhost:5000/socket.io (namespace: /chatbot)")
    print(f"Frontend Local: http://localhost:5000/")

    if ngrok_url:
        print(f"Frontend Public (Ngrok): {ngrok_url}/")
        print(f"Ngrok Status: ✓ Active")
    else:
        print(f"Frontend Public (Ngrok): Not configured")

    print(f"API Docs: (coming soon)")
    print(f"{'='*70}\n")

    # Run development server with WebSocket support
    socketio_instance.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=debug,
        use_reloader=debug,
        allow_unsafe_werkzeug=True
    )


if __name__ == "__main__":
    main()
