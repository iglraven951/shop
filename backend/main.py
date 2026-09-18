"""DiscoveryShop Marketplace - Main entry point.

This is the entry point for running the Flask application.

Usage:
    python -m backend.main          # Run development server
    gunicorn backend.main:app       # Run production server

Environment variables:
    FLASK_ENV: development|production|testing
    DEBUG: true|false
    DATABASE_URL: Database connection string
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from backend.app.factory import create_app

# Load environment variables
load_dotenv()

# Create Flask app
app = create_app()

# Get SocketIO instance from app
socketio = app.socketio if hasattr(app, 'socketio') else None


def main() -> None:
    """
    Main entry point for running the Flask application.

    Starts the development server with WebSocket support on
    http://localhost:5000
    """
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
    if socketio:
        print(f"WebSocket: ws://localhost:5000/socket.io")
    print(f"Frontend Local: http://localhost:5000/")

    if ngrok_url:
        print(f"Frontend Public (Ngrok): {ngrok_url}/")
        print(f"Ngrok Status: ✓ Active")
    else:
        print(f"Frontend Public (Ngrok): Not configured")

    print(f"API Documentation: http://localhost:5000/api/docs (coming soon)")
    print(f"{'='*70}\n")

    # Run development server with WebSocket support
    if socketio:
        socketio.run(
            app,
            host="0.0.0.0",
            port=5000,
            debug=debug,
            use_reloader=debug,
            allow_unsafe_werkzeug=True
        )
    else:
        app.run(
            host="0.0.0.0",
            port=5000,
            debug=debug,
            use_reloader=debug
        )


if __name__ == "__main__":
    main()
