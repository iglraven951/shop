"""API package with blueprint registration."""

from flask import Flask


def register_blueprints(app: Flask) -> None:
    """
    Register all API blueprints with the Flask application.

    This function imports and registers blueprints from all route modules.
    Blueprints are organized by feature area:
    - auth: Authentication and user accounts
    - users: User profiles and settings
    - products: Product listings and management
    - orders: Orders and transactions
    - chat: Real-time messaging
    - notifications: Push notifications

    Args:
        app: Flask application instance.
    """
    try:
        # v1 Auth routes
        from backend.api.v1.auth.routes import auth_bp
        app.register_blueprint(auth_bp, url_prefix="/api/v1")

        # v1 Users routes
        from backend.api.v1.users.routes import users_bp
        app.register_blueprint(users_bp, url_prefix="/api/v1")

        # v1 Products routes
        try:
            from backend.api.v1.products.routes import products_bp
            app.register_blueprint(products_bp, url_prefix="/api/v1")
        except ImportError:
            app.logger.debug("Products blueprint not yet available")

        # v1 Orders routes
        try:
            from backend.api.v1.orders.routes import orders_bp
            app.register_blueprint(orders_bp, url_prefix="/api/v1")
        except ImportError:
            app.logger.debug("Orders blueprint not yet available")

        # v1 Chat routes
        try:
            from backend.api.v1.chat.routes import chat_bp
            app.register_blueprint(chat_bp, url_prefix="/api/v1")
        except ImportError:
            app.logger.debug("Chat blueprint not yet available")

        # v1 Notifications routes
        try:
            from backend.api.v1.notifications.routes import notifications_bp
            app.register_blueprint(notifications_bp, url_prefix="/api/v1")
        except ImportError:
            app.logger.debug("Notifications blueprint not yet available")

        # v1 Forums routes
        try:
            from backend.api.v1.forums.routes import forums_bp
            app.register_blueprint(forums_bp, url_prefix="/api/v1")
        except ImportError:
            app.logger.debug("Forums blueprint not yet available")

        # v1 Admin routes
        try:
            from backend.api.v1.admin.routes import admin_bp
            app.register_blueprint(admin_bp, url_prefix="/api/v1")
        except ImportError:
            app.logger.debug("Admin blueprint not yet available")

        app.logger.info("API blueprints registered successfully")

    except ImportError as e:
        app.logger.warning(f"Some blueprints could not be imported: {e}")


__all__ = ["register_blueprints"]
