"""Flask blueprints for DiscoveryShop API routes."""

from flask import Blueprint

# Auth blueprint (AGENT 4)
from backend.routes.auth import auth_bp

# Users blueprint (AGENT 4)
from backend.routes.users import users_bp

__all__ = ["auth_bp", "users_bp"]
