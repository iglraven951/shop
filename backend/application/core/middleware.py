"""Centralized middleware for Flask application."""

import logging
import json
from datetime import datetime
from functools import wraps
from typing import Callable

from flask import Flask, request, jsonify, g
from flask_cors import CORS

logger = logging.getLogger(__name__)


class ResponseFormatter:
    """Format API responses consistently."""

    @staticmethod
    def success(data=None, message: str = None, code: int = 200):
        """Format success response."""
        response = {
            "success": True,
            "data": data,
        }
        if message:
            response["message"] = message
        return jsonify(response), code

    @staticmethod
    def error(error: str, message: str, code: int = 400):
        """Format error response."""
        return jsonify({
            "success": False,
            "error": error,
            "message": message,
        }), code

    @staticmethod
    def paginated(data: list, total: int, page: int, limit: int, code: int = 200):
        """Format paginated response."""
        total_pages = (total + limit - 1) // limit  # Ceiling division
        
        return jsonify({
            "success": True,
            "data": data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
        }), code


def init_middleware(app: Flask) -> Flask:
    """Initialize all middleware for the Flask app."""

    # ========================================================================
    # CORS Configuration
    # ========================================================================
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": [
                    "http://localhost:3000",
                    "http://localhost:5000",
                    "http://127.0.0.1:3000",
                    "http://127.0.0.1:5000",
                ],
                "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization"],
                "expose_headers": ["X-Total-Count", "X-Page-Number"],
                "supports_credentials": True,
                "max_age": 3600,
            }
        }
    )

    # ========================================================================
    # Request/Response Logging
    # ========================================================================
    @app.before_request
    def log_request():
        """Log incoming requests."""
        g.start_time = datetime.utcnow()
        
        # Log basic info
        logger.info(
            f"[REQUEST] {request.method} {request.path} | "
            f"IP: {request.remote_addr} | "
            f"User-Agent: {request.user_agent}"
        )

        # Log body for POST/PUT
        if request.method in ['POST', 'PUT', 'PATCH']:
            try:
                if request.is_json:
                    logger.debug(f"[BODY] {json.dumps(request.get_json())}")
            except Exception as e:
                logger.debug(f"[BODY] Could not log request body: {str(e)}")

    @app.after_request
    def log_response(response):
        """Log response details."""
        if hasattr(g, 'start_time'):
            elapsed = (datetime.utcnow() - g.start_time).total_seconds()
            logger.info(
                f"[RESPONSE] {request.method} {request.path} | "
                f"Status: {response.status_code} | "
                f"Duration: {elapsed:.3f}s"
            )

        return response

    # ========================================================================
    # Global Error Handlers
    # ========================================================================
    @app.errorhandler(400)
    def handle_bad_request(e):
        """Handle 400 Bad Request."""
        logger.warning(f"Bad request: {str(e)}")
        return jsonify({
            "success": False,
            "error": "bad_request",
            "message": "Invalid request",
        }), 400

    @app.errorhandler(401)
    def handle_unauthorized(e):
        """Handle 401 Unauthorized."""
        logger.warning(f"Unauthorized: {str(e)}")
        return jsonify({
            "success": False,
            "error": "unauthorized",
            "message": "Authentication required",
        }), 401

    @app.errorhandler(403)
    def handle_forbidden(e):
        """Handle 403 Forbidden."""
        logger.warning(f"Forbidden: {str(e)}")
        return jsonify({
            "success": False,
            "error": "forbidden",
            "message": "Access denied",
        }), 403

    @app.errorhandler(404)
    def handle_not_found(e):
        """Handle 404 Not Found."""
        logger.warning(f"Not found: {request.path}")
        return jsonify({
            "success": False,
            "error": "not_found",
            "message": "Resource not found",
        }), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(e):
        """Handle 405 Method Not Allowed."""
        logger.warning(f"Method not allowed: {request.method} {request.path}")
        return jsonify({
            "success": False,
            "error": "method_not_allowed",
            "message": f"Method {request.method} not allowed for this endpoint",
        }), 405

    @app.errorhandler(500)
    def handle_internal_error(e):
        """Handle 500 Internal Server Error."""
        logger.error(f"Internal server error: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "internal_error",
            "message": "An unexpected error occurred",
        }), 500

    # ========================================================================
    # Request Validation
    # ========================================================================
    @app.before_request
    def validate_content_type():
        """Validate content-type for JSON endpoints."""
        if request.method in ['POST', 'PUT', 'PATCH']:
            # Only validate if there's a request body
            if request.content_length and request.content_length > 0:
                if not request.is_json:
                    return jsonify({
                        "success": False,
                        "error": "invalid_content_type",
                        "message": "Content-Type must be application/json",
                    }), 415

    return app
