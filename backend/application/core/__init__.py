"""Core utilities for DiscoveryShop application.

Centralizes decorators, middleware, and common application logic.
"""

from backend.application.core.decorators import (
    handle_errors,
    validate_json,
    validate_request,
    paginate,
    role_required,
)
from backend.application.core.middleware import init_middleware

__all__ = [
    "handle_errors",
    "validate_json",
    "validate_request",
    "paginate",
    "role_required",
    "init_middleware",
]
