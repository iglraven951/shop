"""
Pytest configuration and fixtures for DiscoveryShop Marketplace tests.

This module provides comprehensive test fixtures for:
- Flask application setup with isolated test database
- Database session management with automatic cleanup
- User fixtures (buyer, seller, admin)
- Authentication fixtures (tokens, JWT utilities)
- Product and marketplace data fixtures
- Helper functions for API requests and data creation
"""

import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Generator, Optional, Dict, Any
from decimal import Decimal

import pytest
from flask import Flask
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend.app import create_app
from backend.database import Base
from backend.models.user import User
from backend.models.product import Product, ProductStatus, Category
from backend.models.profile import Profile
from backend.auth import generate_jwt_token, hash_password


# ============================================================================
# FIXTURE SCOPES & CONFIGURATION
# ============================================================================

@pytest.fixture(scope="session")
def test_config() -> Dict[str, Any]:
    """Session-level test configuration."""
    return {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "JWT_SECRET_KEY": "test-jwt-secret-key-do-not-use-in-production",
        "SECRET_KEY": "test-secret-key-do-not-use-in-production",
        "JWT_ACCESS_TOKEN_EXPIRES": timedelta(hours=1),
        "WTF_CSRF_ENABLED": False,
        "CORS_ORIGINS": ["http://localhost:3000", "http://localhost:5000"],
    }


# ============================================================================
# DATABASE FIXTURES
# ============================================================================

@pytest.fixture(scope="session")
def engine(test_config: Dict[str, Any]):
    """
    Session-level SQLAlchemy engine for in-memory SQLite.

    Creates a single engine instance for all tests using StaticPool
    to prevent threading issues with in-memory databases.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """Enable foreign key constraints for SQLite."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    # Create all tables once per session
    Base.metadata.create_all(bind=engine)

    yield engine

    # Cleanup
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(engine) -> Generator[Session, None, None]:
    """
    Function-level database session with automatic rollback.

    Creates a new session for each test and rolls back all changes
    after the test completes, ensuring database isolation.
    """
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionLocal()

    yield session

    session.rollback()
    session.close()


@pytest.fixture(scope="function", autouse=True)
def reset_database(engine):
    """Auto-use fixture to reset database before each test."""
    connection = engine.connect()
    for table in reversed(Base.metadata.sorted_tables):
        connection.execute(table.delete())
    connection.commit()
    connection.close()

    yield


# ============================================================================
# FLASK APP FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
def app(test_config: Dict[str, Any], db_session: Session) -> Flask:
    """
    Function-level Flask application fixture with test database.

    Creates a new Flask app instance for each test with TESTING=True
    configuration and in-memory SQLite database.
    """
    app = create_app(config_name="testing")
    app.config.update(test_config)
    app.db = lambda: db_session
    app.get_db = lambda: db_session

    with app.app_context():
        yield app


@pytest.fixture(scope="function")
def client(app: Flask):
    """Flask test client fixture for making HTTP requests."""
    return app.test_client()


@pytest.fixture(scope="function")
def app_context(app: Flask):
    """Flask application context fixture."""
    with app.app_context():
        yield app


# ============================================================================
# USER FIXTURES
# ============================================================================

def create_test_user(
    db_session: Session,
    email: str = "testuser@example.com",
    username: str = "testuser",
    password: str = "TestPassword123",
    full_name: str = "Test User",
    is_buyer: bool = True,
    is_seller: bool = False,
    seller_verified: bool = False,
    is_active: bool = True,
) -> User:
    """
    Create a test user with custom attributes.

    Helper function to create users with flexible configuration
    for different test scenarios.
    """
    user = User(
        email=email,
        username=username,
        password_hash=hash_password(password),
        full_name=full_name,
        is_buyer=is_buyer,
        is_seller=is_seller,
        seller_verified=seller_verified,
        is_active=is_active,
    )

    # Create associated profile
    profile = Profile(
        user=user,
        bio="Test user profile",
        location="Test Location",
        phone="1234567890",
    )

    return user


@pytest.fixture
def regular_user(db_session: Session) -> User:
    """Create a regular buyer user (buyer only, no seller privileges)."""
    user = create_test_user(
        db_session,
        email="buyer@example.com",
        username="buyer",
        is_buyer=True,
        is_seller=False,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def seller_user(db_session: Session) -> User:
    """Create a verified seller user (both buyer and seller)."""
    user = create_test_user(
        db_session,
        email="seller@example.com",
        username="seller",
        is_buyer=True,
        is_seller=True,
        seller_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin_user(db_session: Session) -> User:
    """Create an admin user with full privileges."""
    user = create_test_user(
        db_session,
        email="admin@example.com",
        username="admin",
        full_name="Admin User",
        is_buyer=True,
        is_seller=True,
        seller_verified=True,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def multiple_users(db_session: Session) -> list:
    """
    Create multiple test users with different roles.

    Returns a list with:
    - Index 0: Buyer
    - Index 1: Seller 1
    - Index 2: Seller 2
    - Index 3: Admin
    """
    users = [
        create_test_user(db_session, email="buyer1@example.com", username="buyer1"),
        create_test_user(
            db_session,
            email="seller1@example.com",
            username="seller1",
            is_seller=True,
            seller_verified=True,
        ),
        create_test_user(
            db_session,
            email="seller2@example.com",
            username="seller2",
            is_seller=True,
            seller_verified=True,
        ),
        create_test_user(
            db_session,
            email="admin1@example.com",
            username="admin1",
            is_seller=True,
            seller_verified=True,
        ),
    ]

    for user in users:
        db_session.add(user)

    db_session.commit()
    return users


# ============================================================================
# AUTHENTICATION FIXTURES
# ============================================================================

def get_valid_token(user: User, app: Flask) -> str:
    """Generate a valid JWT token for a user (expires in 1 hour)."""
    with app.app_context():
        token = generate_jwt_token(user.id, expires_in=3600)
    return token


def get_expired_token(user: User, app: Flask) -> str:
    """Generate an expired JWT token for testing token rejection."""
    with app.app_context():
        token = generate_jwt_token(user.id, expires_in=-1)
    return token


def get_invalid_token() -> str:
    """Return a malformed JWT token that cannot be decoded."""
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.payload"


@pytest.fixture
def auth_headers(app: Flask, regular_user: User):
    """
    Get HTTP Authorization headers with valid token.

    Returns a callable that can generate headers for any user.
    Defaults to regular_user if no user specified.
    """
    def _auth_headers(user: Optional[User] = None) -> Dict[str, str]:
        target_user = user or regular_user
        token = get_valid_token(target_user, app)
        return {"Authorization": f"Bearer {token}"}

    return _auth_headers


@pytest.fixture
def seller_auth_headers(app: Flask, seller_user: User) -> Dict[str, str]:
    """Get HTTP Authorization headers for seller user."""
    token = get_valid_token(seller_user, app)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_auth_headers(app: Flask, admin_user: User) -> Dict[str, str]:
    """Get HTTP Authorization headers for admin user."""
    token = get_valid_token(admin_user, app)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def expired_auth_headers(app: Flask, regular_user: User) -> Dict[str, str]:
    """Get HTTP Authorization headers with expired token."""
    token = get_expired_token(regular_user, app)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def invalid_auth_headers() -> Dict[str, str]:
    """Get HTTP Authorization headers with invalid token."""
    return {"Authorization": f"Bearer {get_invalid_token()}"}


# ============================================================================
# PRODUCT FIXTURES
# ============================================================================

@pytest.fixture
def category(db_session: Session) -> Category:
    """Create a test product category."""
    category = Category(
        name="Electronics",
        slug="electronics",
        icon_url="https://example.com/icons/electronics.png",
    )
    db_session.add(category)
    db_session.commit()
    return category


def create_test_product(
    db_session: Session,
    seller: User,
    category: Category,
    title: str = "Test Product",
    description: str = "Test product description",
    price: Decimal = Decimal("10.00"),
    quantity: int = 10,
    status: ProductStatus = ProductStatus.APPROVED,
) -> Product:
    """Create a test product with custom attributes."""
    product = Product(
        title=title,
        description=description,
        price=price,
        quantity=quantity,
        category_id=category.id,
        seller_id=seller.id,
        status=status,
    )
    return product


@pytest.fixture
def sample_product(db_session: Session, seller_user: User, category: Category) -> Product:
    """Create an approved sample product ready for testing."""
    product = create_test_product(
        db_session,
        seller=seller_user,
        category=category,
        title="Sample Laptop",
        description="A great laptop for development",
        price=Decimal("999.99"),
        quantity=10,
        status=ProductStatus.APPROVED,
    )
    db_session.add(product)
    db_session.commit()
    return product


@pytest.fixture
def multiple_products(
    db_session: Session, seller_user: User, category: Category
) -> list:
    """Create multiple test products with varying prices and quantities."""
    products = [
        create_test_product(
            db_session,
            seller=seller_user,
            category=category,
            title="Budget Keyboard",
            price=Decimal("29.99"),
            quantity=20,
        ),
        create_test_product(
            db_session,
            seller=seller_user,
            category=category,
            title="Gaming Mouse",
            price=Decimal("49.99"),
            quantity=15,
        ),
        create_test_product(
            db_session,
            seller=seller_user,
            category=category,
            title="Premium Monitor",
            price=Decimal("299.99"),
            quantity=5,
        ),
        create_test_product(
            db_session,
            seller=seller_user,
            category=category,
            title="USB Hub",
            price=Decimal("24.99"),
            quantity=50,
        ),
    ]

    for product in products:
        db_session.add(product)

    db_session.commit()
    return products


# ============================================================================
# REQUEST HELPER FIXTURES
# ============================================================================

@pytest.fixture
def api_request(client, auth_headers):
    """Make authenticated API requests with custom headers."""
    def _request(method: str, path: str, **kwargs) -> Any:
        method_lower = method.lower()
        if method_lower == "get":
            return client.get(path, **kwargs)
        elif method_lower == "post":
            return client.post(path, **kwargs)
        elif method_lower == "put":
            return client.put(path, **kwargs)
        elif method_lower == "patch":
            return client.patch(path, **kwargs)
        elif method_lower == "delete":
            return client.delete(path, **kwargs)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")

    return _request


# ============================================================================
# UTILITY FIXTURES & HELPERS
# ============================================================================

@pytest.fixture
def json_data() -> Dict[str, Any]:
    """Sample JSON data for testing request payloads."""
    return {
        "user_registration": {
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "SecurePass123",
            "full_name": "New User",
        },
        "user_login": {
            "email": "buyer@example.com",
            "password": "TestPassword123",
        },
        "product_creation": {
            "title": "New Product",
            "description": "Product description",
            "price": 49.99,
            "quantity": 10,
            "category_id": "electronics",
        },
        "product_update": {
            "title": "Updated Title",
            "price": 59.99,
            "quantity": 8,
        },
        "cart_add": {
            "product_id": "product-123",
            "quantity": 2,
        },
        "chat_message": {
            "recipient_id": "user-456",
            "message": "Hello, are you available?",
        },
    }


@pytest.fixture
def clear_timestamps():
    """Utility for clearing timestamp fields in responses."""
    def _clear(data: Dict[str, Any]) -> Dict[str, Any]:
        timestamp_fields = {"created_at", "updated_at", "last_seen", "last_login"}
        return {k: v for k, v in data.items() if k not in timestamp_fields}

    return _clear


# ============================================================================
# PYTEST HOOKS & CONFIGURATION
# ============================================================================

def pytest_configure(config):
    """Pytest configuration hook for markers."""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test (fast, no database)"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "api: mark test as an API endpoint test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow (might take > 1 second)"
    )


@pytest.fixture(autouse=True)
def isolate_filesystem(monkeypatch, tmp_path):
    """Isolate filesystem operations during tests."""
    yield tmp_path
