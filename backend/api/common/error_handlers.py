"""Centralized error handlers for the Flask API.

Provides consistent error response format across the entire API.
All exceptions are mapped to appropriate HTTP status codes and
response structures.

Error Response Format:
    {
        "error": "Error type",
        "message": "Detailed error message",
        "status": 400,
        "details": {}  # Optional: field-specific errors
    }
"""

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException
from datetime import datetime


class APIError(Exception):
    """Base class for API-specific errors."""

    status_code = 400

    def __init__(self, message: str, status_code: int = None, details: dict = None):
        """
        Initialize API error.

        Args:
            message: Error message.
            status_code: HTTP status code.
            details: Additional error details (e.g., field errors).
        """
        super().__init__()
        self.message = message
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code

    def to_dict(self) -> dict:
        """Convert error to JSON-serializable dict."""
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "status": self.status_code,
            "timestamp": datetime.utcnow().isoformat(),
            "details": self.details if self.details else None,
        }


class ValidationError(APIError):
    """Raised when validation fails."""

    status_code = 422


class NotFoundError(APIError):
    """Raised when a resource is not found."""

    status_code = 404


class UnauthorizedError(APIError):
    """Raised when authentication fails."""

    status_code = 401


class ForbiddenError(APIError):
    """Raised when user lacks required permissions."""

    status_code = 403


class ConflictError(APIError):
    """Raised when a resource already exists."""

    status_code = 409


class InternalServerError(APIError):
    """Raised for unexpected server errors."""

    status_code = 500


def register_error_handlers(app: Flask) -> None:
    """
    Register all error handlers with the Flask app.

    Args:
        app: Flask application instance.
    """

    # Handle custom API errors
    @app.errorhandler(APIError)
    def handle_api_error(error: APIError):
        """Handle custom API errors."""
        response = error.to_dict()
        return jsonify(response), error.status_code

    # Handle HTTP exceptions
    @app.errorhandler(HTTPException)
    def handle_http_exception(error: HTTPException):
        """Handle werkzeug HTTP exceptions."""
        response = {
            "error": "HTTPException",
            "message": error.description,
            "status": error.code,
            "timestamp": datetime.utcnow().isoformat(),
        }
        return jsonify(response), error.code

    # Handle 404 Not Found
    @app.errorhandler(404)
    def not_found(error):
        """Handle 404 Not Found."""
        response = {
            "error": "NotFound",
            "message": "The requested resource was not found",
            "status": 404,
            "timestamp": datetime.utcnow().isoformat(),
        }
        return jsonify(response), 404

    # Handle 405 Method Not Allowed
    @app.errorhandler(405)
    def method_not_allowed(error):
        """Handle 405 Method Not Allowed."""
        response = {
            "error": "MethodNotAllowed",
            "message": "The HTTP method is not allowed for this endpoint",
            "status": 405,
            "timestamp": datetime.utcnow().isoformat(),
        }
        return jsonify(response), 405

    # Handle 500 Internal Server Error
    @app.errorhandler(500)
    def internal_error(error):
        """Handle 500 Internal Server Error."""
        app.logger.error(f"Internal server error: {error}", exc_info=True)
        response = {
            "error": "InternalServerError",
            "message": "An unexpected error occurred on the server",
            "status": 500,
            "timestamp": datetime.utcnow().isoformat(),
        }
        return jsonify(response), 500

    # Handle 400 Bad Request
    @app.errorhandler(400)
    def bad_request(error):
        """Handle 400 Bad Request."""
        response = {
            "error": "BadRequest",
            "message": "The request could not be understood or was malformed",
            "status": 400,
            "timestamp": datetime.utcnow().isoformat(),
        }
        return jsonify(response), 400

    # Handle generic exceptions
    @app.errorhandler(Exception)
    def handle_generic_exception(error: Exception):
        """Handle unexpected exceptions."""
        app.logger.error(f"Unexpected error: {error}", exc_info=True)
        response = {
            "error": "InternalServerError",
            "message": "An unexpected error occurred",
            "status": 500,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if app.debug:
            response["debug_info"] = str(error)
        return jsonify(response), 500


__all__ = [
    "APIError",
    "ValidationError",
    "NotFoundError",
    "UnauthorizedError",
    "ForbiddenError",
    "ConflictError",
    "InternalServerError",
    "register_error_handlers",
]
