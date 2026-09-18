"""Flask application factory using factory pattern."""

import os
from pathlib import Path
from flask import Flask
from flask_cors import CORS

from backend.app.config import get_config
from backend.app.extensions import init_extensions
from backend.api import register_blueprints
from backend.api.common.error_handlers import register_error_handlers
from backend.infrastructure.database.sqlalchemy_setup import init_db


def create_app(config_name: str | None = None) -> Flask:
    """
    Create and configure Flask application using factory pattern.

    This is the single entry point for creating Flask app instances.
    It handles:
    - Configuration management
    - Extension initialization (JWT, CORS, SocketIO, etc)
    - Database setup
    - Blueprint registration
    - Error handler registration

    Args:
        config_name: Configuration name ('development', 'production', 'testing').
                    Defaults to FLASK_ENV environment variable.

    Returns:
        Configured Flask application instance.

    Example:
        >>> app = create_app('development')
        >>> app.run(debug=True)
    """
    # Determine configuration
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    config_class = get_config(config_name)

    # Get project root for static files
    project_root = Path(__file__).parent.parent.parent

    # Create Flask app with proper configuration
    app = Flask(
        __name__,
        static_folder=str(project_root / "frontend"),
        static_url_path="/static",
        instance_relative_config=False,
    )

    # Load configuration
    app.config.from_object(config_class)

    # Store config class reference
    app.config_class = config_class

    # Initialize all extensions
    init_extensions(app)

    # Initialize database
    init_db(app)

    # Register all blueprints
    register_blueprints(app)

    # Register error handlers
    register_error_handlers(app)

    # Register WebSocket events
    register_websocket_events(app)

    # Register CLI commands (if any)
    register_cli_commands(app)

    return app


def register_websocket_events(app: Flask) -> None:
    """
    Register WebSocket event handlers for real-time features.

    Args:
        app: Flask application instance.
    """
    try:
        # Import and register chat events
        import backend.events.chat_events  # noqa: F401
        app.logger.info("WebSocket events registered successfully")
    except ImportError as e:
        app.logger.warning(f"Could not register WebSocket events: {e}")


def register_cli_commands(app: Flask) -> None:
    """
    Register Flask CLI commands.

    Commands for database management, testing, etc.
    """

    @app.cli.command()
    def init_db_cmd():
        """Initialize the database with sample data."""
        from backend.infrastructure.database.sqlalchemy_setup import init_db
        init_db(app, seed_data=True)
        click.echo("Database initialized successfully.")

    @app.cli.command()
    def drop_db():
        """Drop all database tables."""
        from backend.infrastructure.database.sqlalchemy_setup import drop_db
        drop_db()
        click.echo("Database dropped.")


def create_app_for_testing() -> Flask:
    """
    Create Flask app configured for testing.

    Returns:
        Flask app with testing configuration.
    """
    app = create_app("testing")

    # Additional testing setup
    app.config["TESTING"] = True
    app.config["WTF_CSRF_ENABLED"] = False

    return app
