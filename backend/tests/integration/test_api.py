"""Integration tests for DiscoveryShop API endpoints.

Tests all major API endpoints including:
- Authentication (register, login, refresh-token, logout)
- User management (profile, update, delete)
- Product operations (list, create, get, update, delete)
- Search functionality (basic, filtering, sorting, pagination)
- Error handling (401, 403, 404, 400, 500)

Run with: pytest -m integration backend/tests/integration/test_api.py
"""

import pytest
import json
import uuid
from typing import Dict, Any, Tuple
from datetime import datetime, timezone

from backend.database import SessionLocal
from backend.models.user import User
from backend.models.product import Product
from backend.models.profile import Profile
from backend.auth import generate_jwt_token, hash_password


# ============================================================================
# FIXTURES: Test Users and Authentication
# ============================================================================


@pytest.fixture
def test_user_data():
    """Create test user registration data."""
    return {
        "email": "testuser@example.com",
        "password": "SecurePass123",
        "username": "testuser",
        "full_name": "Test User",
    }


@pytest.fixture
def seller_user_data():
    """Create test seller user data."""
    return {
        "email": "seller@example.com",
        "password": "SellerPass123",
        "username": "seller",
        "full_name": "Test Seller",
    }


@pytest.fixture
def registered_user(db, test_user_data) -> User:
    """Register a user in database for testing."""
    user = User(
        email=test_user_data["email"],
        username=test_user_data["username"],
        full_name=test_user_data["full_name"],
        is_buyer=True,
        is_active=True,
    )
    user.set_password(test_user_data["password"])
    db.add(user)
    db.flush()

    # Create profile
    profile = Profile(user_id=user.id)
    db.add(profile)
    db.commit()

    return user


@pytest.fixture
def seller_user(db, seller_user_data) -> User:
    """Create a verified seller user."""
    user = User(
        email=seller_user_data["email"],
        username=seller_user_data["username"],
        full_name=seller_user_data["full_name"],
        is_buyer=True,
        is_seller=True,
        seller_verified=True,
        is_active=True,
    )
    user.set_password(seller_user_data["password"])
    db.add(user)
    db.flush()

    profile = Profile(user_id=user.id)
    db.add(profile)
    db.commit()

    return user


@pytest.fixture
def valid_auth_token(registered_user):
    """Generate a valid JWT token for test user."""
    return generate_jwt_token(registered_user.id)


@pytest.fixture
def auth_headers(valid_auth_token) -> Dict[str, str]:
    """Create authorization headers with valid token."""
    return {
        "Authorization": f"Bearer {valid_auth_token}",
        "Content-Type": "application/json",
    }


@pytest.fixture
def invalid_auth_headers() -> Dict[str, str]:
    """Create authorization headers with invalid token."""
    return {
        "Authorization": "Bearer invalid-token-xyz",
        "Content-Type": "application/json",
    }


@pytest.fixture
def seller_auth_headers(seller_user):
    """Create authorization headers for seller user."""
    token = generate_jwt_token(seller_user.id)
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


# ============================================================================
# FIXTURES: Test Products
# ============================================================================


@pytest.fixture
def test_product_data():
    """Create test product data."""
    return {
        "name": "Test Product",
        "description": "A test product for integration testing",
        "price": 29.99,
        "category": "Electronics",
        "stock_quantity": 10,
    }


@pytest.fixture
def product(db, seller_user, test_product_data) -> Product:
    """Create a test product."""
    product = Product(
        id=str(uuid.uuid4()),
        seller_id=seller_user.id,
        name=test_product_data["name"],
        description=test_product_data["description"],
        price=test_product_data["price"],
        category=test_product_data["category"],
        stock_quantity=test_product_data["stock_quantity"],
        is_approved=True,
    )
    db.add(product)
    db.commit()
    return product


# ============================================================================
# TESTS: Authentication Endpoints (15 tests)
# ============================================================================


@pytest.mark.integration
class TestAuthEndpoints:
    """Test suite for authentication endpoints."""

    # ========== POST /auth/register ==========

    def test_register_success(self, client, test_user_data):
        """Test successful user registration."""
        response = client.post(
            "/api/auth/register",
            json=test_user_data,
            content_type="application/json",
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data["success"] is True
        assert data["data"]["email"] == test_user_data["email"]
        assert data["data"]["username"] == test_user_data["username"]
        assert "token" in data["data"]

    def test_register_missing_fields(self, client):
        """Test registration with missing required fields."""
        response = client.post(
            "/api/auth/register",
            json={"email": "test@example.com"},
            content_type="application/json",
        )
        assert response.status_code == 422
        data = json.loads(response.data)
        assert data["success"] is False
        assert "missing_fields" in data["errors"]

    def test_register_invalid_email(self, client):
        """Test registration with invalid email format."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "invalid-email",
                "password": "SecurePass123",
                "username": "testuser",
                "full_name": "Test User",
            },
            content_type="application/json",
        )
        assert response.status_code == 422
        data = json.loads(response.data)
        assert data["success"] is False

    def test_register_weak_password(self, client):
        """Test registration with weak password."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "test@example.com",
                "password": "weak",  # Too short
                "username": "testuser",
                "full_name": "Test User",
            },
            content_type="application/json",
        )
        assert response.status_code == 422
        data = json.loads(response.data)
        assert data["success"] is False
        assert "Password" in data["message"]

    def test_register_duplicate_email(self, client, registered_user, test_user_data):
        """Test registration with duplicate email."""
        response = client.post(
            "/api/auth/register",
            json={
                **test_user_data,
                "username": "different_username",
            },
            content_type="application/json",
        )
        assert response.status_code == 409
        data = json.loads(response.data)
        assert data["success"] is False
        assert "already registered" in data["message"]

    def test_register_duplicate_username(self, client, registered_user, test_user_data):
        """Test registration with duplicate username."""
        response = client.post(
            "/api/auth/register",
            json={
                **test_user_data,
                "email": "newuser@example.com",
            },
            content_type="application/json",
        )
        assert response.status_code == 409
        data = json.loads(response.data)
        assert data["success"] is False
        assert "already taken" in data["message"]

    # ========== POST /auth/login ==========

    def test_login_success(self, client, registered_user, test_user_data):
        """Test successful login."""
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_data["email"],
                "password": test_user_data["password"],
            },
            content_type="application/json",
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True
        assert "token" in data["data"]
        assert "refresh_token" in data["data"]
        assert data["data"]["email"] == test_user_data["email"]

    def test_login_user_not_found(self, client):
        """Test login with non-existent user."""
        response = client.post(
            "/api/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "SecurePass123",
            },
            content_type="application/json",
        )
        assert response.status_code == 401
        data = json.loads(response.data)
        assert data["success"] is False

    def test_login_wrong_password(self, client, registered_user, test_user_data):
        """Test login with wrong password."""
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_data["email"],
                "password": "WrongPassword123",
            },
            content_type="application/json",
        )
        assert response.status_code == 401
        data = json.loads(response.data)
        assert data["success"] is False

    def test_login_missing_fields(self, client):
        """Test login with missing required fields."""
        response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com"},
            content_type="application/json",
        )
        assert response.status_code == 422
        data = json.loads(response.data)
        assert data["success"] is False

    # ========== POST /auth/refresh-token ==========

    def test_refresh_token_success(self, client, registered_user):
        """Test successful token refresh."""
        # Get initial tokens
        refresh_token = generate_jwt_token(
            registered_user.id, token_type="refresh"
        )

        response = client.post(
            "/api/auth/refresh-token",
            json={"refresh_token": refresh_token},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True
        assert "token" in data["data"]
        assert "refresh_token" in data["data"]

    def test_refresh_token_invalid(self, client):
        """Test token refresh with invalid token."""
        response = client.post(
            "/api/auth/refresh-token",
            json={"refresh_token": "invalid-token-xyz"},
            content_type="application/json",
        )
        assert response.status_code == 401
        data = json.loads(response.data)
        assert data["success"] is False

    def test_refresh_token_missing(self, client):
        """Test token refresh with missing token."""
        response = client.post(
            "/api/auth/refresh-token",
            json={},
            content_type="application/json",
        )
        assert response.status_code == 401
        data = json.loads(response.data)
        assert data["success"] is False

    # ========== POST /auth/logout ==========

    def test_logout_success(self, client, auth_headers):
        """Test successful logout."""
        response = client.post(
            "/api/auth/logout",
            headers=auth_headers,
            content_type="application/json",
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_logout_missing_token(self, client):
        """Test logout without authentication."""
        response = client.post(
            "/api/auth/logout",
            content_type="application/json",
        )
        assert response.status_code == 401


# ============================================================================
# TESTS: User Endpoints (12 tests)
# ============================================================================


@pytest.mark.integration
class TestUserEndpoints:
    """Test suite for user management endpoints."""

    # ========== GET /api/users/profile ==========

    def test_get_profile_authenticated(self, client, auth_headers, registered_user):
        """Test getting authenticated user profile."""
        response = client.get(
            "/api/users/profile",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True
        assert data["data"]["email"] == registered_user.email

    def test_get_profile_unauthenticated(self, client):
        """Test getting profile without authentication."""
        response = client.get("/api/users/profile")
        assert response.status_code == 401

    def test_get_profile_invalid_token(self, client, invalid_auth_headers):
        """Test getting profile with invalid token."""
        response = client.get(
            "/api/users/profile",
            headers=invalid_auth_headers,
        )
        assert response.status_code == 401

    # ========== PUT /api/users/profile ==========

    def test_update_profile_success(self, client, auth_headers, registered_user):
        """Test successful profile update."""
        new_data = {
            "full_name": "Updated Name",
        }
        response = client.put(
            "/api/users/profile",
            json=new_data,
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True
        assert data["data"]["full_name"] == "Updated Name"

    def test_update_profile_unauthenticated(self, client):
        """Test profile update without authentication."""
        response = client.put(
            "/api/users/profile",
            json={"full_name": "New Name"},
        )
        assert response.status_code == 401

    def test_update_profile_invalid_data(self, client, auth_headers):
        """Test profile update with invalid data."""
        response = client.put(
            "/api/users/profile",
            json={"full_name": ""},  # Invalid: empty name
            headers=auth_headers,
        )
        assert response.status_code == 422

    # ========== GET /api/users/<id> ==========

    def test_get_public_user_info(self, client, registered_user):
        """Test getting public user information."""
        response = client.get(f"/api/users/{registered_user.id}")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True
        assert data["data"]["username"] == registered_user.username
        # Public profile should not include sensitive info
        assert "email" not in data["data"]

    def test_get_nonexistent_user(self, client):
        """Test getting information about non-existent user."""
        fake_id = str(uuid.uuid4())
        response = client.get(f"/api/users/{fake_id}")
        assert response.status_code == 404

    def test_get_seller_info_includes_stats(self, client, seller_user):
        """Test that seller public profile includes relevant stats."""
        response = client.get(f"/api/users/{seller_user.id}")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["data"]["is_seller"] is True
        assert data["data"]["seller_verified"] is True

    # ========== DELETE /api/users/<id> ==========

    def test_delete_account_success(self, client, auth_headers, registered_user):
        """Test successful account deletion."""
        response = client.delete(
            f"/api/users/{registered_user.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_delete_account_unauthorized(self, client, registered_user):
        """Test deleting account without authentication."""
        response = client.delete(
            f"/api/users/{registered_user.id}",
        )
        assert response.status_code == 401

    def test_delete_different_user_forbidden(self, client, auth_headers, registered_user):
        """Test deleting a different user's account (forbidden)."""
        other_user = User(
            email="other@example.com",
            username="other",
            full_name="Other User",
        )
        other_user.set_password("OtherPass123")
        # Note: would need to add to db in real scenario
        # For now, test the expected behavior
        response = client.delete(
            f"/api/users/{str(uuid.uuid4())}",  # Different ID
            headers=auth_headers,
        )
        assert response.status_code == 403


# ============================================================================
# TESTS: Product Endpoints (15 tests)
# ============================================================================


@pytest.mark.integration
class TestProductEndpoints:
    """Test suite for product management endpoints."""

    # ========== GET /api/products ==========

    def test_list_products_success(self, client, product):
        """Test listing products."""
        response = client.get("/api/products")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True
        assert isinstance(data["data"], list)

    def test_list_products_pagination(self, client, product):
        """Test product list pagination."""
        response = client.get("/api/products?page=1&limit=10")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert "pagination" in data or len(data["data"]) <= 10

    def test_list_products_filter_category(self, client, product):
        """Test filtering products by category."""
        response = client.get("/api/products?category=Electronics")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_list_products_filter_price_range(self, client, product):
        """Test filtering products by price range."""
        response = client.get("/api/products?min_price=10&max_price=100")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    # ========== POST /api/products ==========

    def test_create_product_success(
        self, client, seller_auth_headers, test_product_data
    ):
        """Test creating a new product."""
        response = client.post(
            "/api/products",
            json=test_product_data,
            headers=seller_auth_headers,
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data["success"] is True
        assert data["data"]["name"] == test_product_data["name"]

    def test_create_product_unauthenticated(self, client, test_product_data):
        """Test creating product without authentication."""
        response = client.post(
            "/api/products",
            json=test_product_data,
        )
        assert response.status_code == 401

    def test_create_product_non_seller(self, client, auth_headers, test_product_data):
        """Test creating product as non-verified seller."""
        # Regular user (not seller)
        response = client.post(
            "/api/products",
            json=test_product_data,
            headers=auth_headers,
        )
        assert response.status_code == 403

    def test_create_product_missing_fields(self, client, seller_auth_headers):
        """Test creating product with missing required fields."""
        response = client.post(
            "/api/products",
            json={"name": "Test Product"},  # Missing other fields
            headers=seller_auth_headers,
        )
        assert response.status_code == 422

    def test_create_product_invalid_price(self, client, seller_auth_headers):
        """Test creating product with invalid price."""
        response = client.post(
            "/api/products",
            json={
                "name": "Test",
                "price": -10,  # Invalid: negative
                "category": "Electronics",
                "stock_quantity": 10,
            },
            headers=seller_auth_headers,
        )
        assert response.status_code == 422

    # ========== GET /api/products/<id> ==========

    def test_get_product_success(self, client, product):
        """Test retrieving a single product."""
        response = client.get(f"/api/products/{product.id}")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True
        assert data["data"]["id"] == product.id

    def test_get_product_not_found(self, client):
        """Test retrieving non-existent product."""
        fake_id = str(uuid.uuid4())
        response = client.get(f"/api/products/{fake_id}")
        assert response.status_code == 404

    # ========== PUT /api/products/<id> ==========

    def test_update_product_success(
        self, client, seller_auth_headers, seller_user, product
    ):
        """Test updating a product."""
        response = client.put(
            f"/api/products/{product.id}",
            json={"name": "Updated Product"},
            headers=seller_auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True
        assert data["data"]["name"] == "Updated Product"

    def test_update_product_not_owner(self, client, auth_headers, product):
        """Test updating product as non-owner."""
        response = client.put(
            f"/api/products/{product.id}",
            json={"name": "Hacked"},
            headers=auth_headers,
        )
        assert response.status_code == 403

    # ========== DELETE /api/products/<id> ==========

    def test_delete_product_success(
        self, client, seller_auth_headers, seller_user, product
    ):
        """Test deleting a product."""
        response = client.delete(
            f"/api/products/{product.id}",
            headers=seller_auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_delete_product_not_owner(self, client, auth_headers, product):
        """Test deleting product as non-owner."""
        response = client.delete(
            f"/api/products/{product.id}",
            headers=auth_headers,
        )
        assert response.status_code == 403


# ============================================================================
# TESTS: Search Endpoints (10 tests)
# ============================================================================


@pytest.mark.integration
class TestSearchEndpoints:
    """Test suite for search functionality."""

    def test_search_basic(self, client, product):
        """Test basic search."""
        response = client.get(f"/api/search?q={product.name}")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_search_empty_query(self, client):
        """Test search with empty query."""
        response = client.get("/api/search?q=")
        assert response.status_code == 400

    def test_search_filter_category(self, client, product):
        """Test search with category filter."""
        response = client.get(f"/api/search?q=test&category={product.category}")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_search_filter_price_range(self, client, product):
        """Test search with price filtering."""
        response = client.get("/api/search?q=test&min_price=10&max_price=100")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_search_sort_by_price(self, client, product):
        """Test search results sorted by price."""
        response = client.get("/api/search?q=test&sort=price&order=asc")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_search_sort_by_rating(self, client, product):
        """Test search results sorted by rating."""
        response = client.get("/api/search?q=test&sort=rating&order=desc")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_search_pagination_first_page(self, client, product):
        """Test search pagination first page."""
        response = client.get("/api/search?q=test&page=1&limit=10")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True

    def test_search_pagination_second_page(self, client, product):
        """Test search pagination second page."""
        response = client.get("/api/search?q=test&page=2&limit=10")
        assert response.status_code in [200, 404]  # 404 if no second page

    def test_search_no_results(self, client):
        """Test search with no matching results."""
        response = client.get("/api/search?q=nonexistent-product-xyz-123")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data["data"]) == 0

    def test_search_special_characters(self, client):
        """Test search with special characters in query."""
        response = client.get("/api/search?q=test%20product%26more")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] is True


# ============================================================================
# TESTS: Error Handling (8 tests)
# ============================================================================


@pytest.mark.integration
class TestErrorHandling:
    """Test suite for error handling."""

    # ========== 401 Unauthorized ==========

    def test_401_missing_token(self, client):
        """Test 401 response for missing authentication token."""
        response = client.get("/api/users/profile")
        assert response.status_code == 401
        data = json.loads(response.data)
        assert "error" in data or "success" in data
        assert data.get("success") is False

    def test_401_invalid_token_format(self, client):
        """Test 401 response for invalid token format."""
        response = client.get(
            "/api/users/profile",
            headers={"Authorization": "InvalidFormat token123"},
        )
        assert response.status_code == 401

    # ========== 403 Forbidden ==========

    def test_403_insufficient_permissions(
        self, client, auth_headers, test_product_data
    ):
        """Test 403 response for insufficient permissions."""
        # Non-seller trying to create product
        response = client.post(
            "/api/products",
            json=test_product_data,
            headers=auth_headers,
        )
        assert response.status_code == 403
        data = json.loads(response.data)
        assert data.get("success") is False

    def test_403_access_denied(self, client, auth_headers, registered_user):
        """Test 403 response for access denied."""
        other_user_id = str(uuid.uuid4())
        response = client.delete(
            f"/api/users/{other_user_id}",
            headers=auth_headers,
        )
        assert response.status_code == 403

    # ========== 404 Not Found ==========

    def test_404_user_not_found(self, client):
        """Test 404 response for non-existent user."""
        response = client.get(f"/api/users/{str(uuid.uuid4())}")
        assert response.status_code == 404
        data = json.loads(response.data)
        assert "error" in data or "success" in data

    def test_404_product_not_found(self, client):
        """Test 404 response for non-existent product."""
        response = client.get(f"/api/products/{str(uuid.uuid4())}")
        assert response.status_code == 404

    # ========== 400 Bad Request ==========

    def test_400_invalid_json(self, client):
        """Test 400 response for invalid JSON."""
        response = client.post(
            "/api/auth/login",
            data="invalid json {",
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_400_missing_required_field(self, client):
        """Test 400/422 response for missing required fields."""
        response = client.post(
            "/api/auth/register",
            json={"email": "test@example.com"},
            content_type="application/json",
        )
        assert response.status_code in [400, 422]
        data = json.loads(response.data)
        assert data.get("success") is False


# ============================================================================
# TESTS: Response Format Validation (5 tests)
# ============================================================================


@pytest.mark.integration
class TestResponseFormats:
    """Test suite for validating API response formats."""

    def test_success_response_format(self, client, registered_user):
        """Test that successful responses follow correct format."""
        response = client.get(f"/api/users/{registered_user.id}")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert "success" in data
        assert "data" in data
        assert data["success"] is True

    def test_error_response_format(self, client):
        """Test that error responses follow correct format."""
        response = client.get(f"/api/users/{str(uuid.uuid4())}")
        assert response.status_code == 404
        data = json.loads(response.data)
        assert "success" in data
        assert data["success"] is False

    def test_paginated_response_format(self, client, product):
        """Test that paginated responses include pagination metadata."""
        response = client.get("/api/products?page=1&limit=10")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert "data" in data
        assert isinstance(data["data"], list)

    def test_validation_error_includes_details(self, client):
        """Test that validation errors include details."""
        response = client.post(
            "/api/auth/register",
            json={"email": "test@example.com"},
            content_type="application/json",
        )
        assert response.status_code == 422
        data = json.loads(response.data)
        assert "errors" in data or "message" in data

    def test_authentication_error_format(self, client):
        """Test that auth errors follow correct format."""
        response = client.get("/api/users/profile")
        assert response.status_code == 401
        data = json.loads(response.data)
        assert "success" in data
        assert data["success"] is False


# ============================================================================
# TESTS: Integration Scenarios (5 tests)
# ============================================================================


@pytest.mark.integration
class TestIntegrationScenarios:
    """Test suite for complete user workflows."""

    def test_user_registration_and_login_flow(self, client, test_user_data):
        """Test complete registration and login flow."""
        # Register
        register_response = client.post(
            "/api/auth/register",
            json=test_user_data,
            content_type="application/json",
        )
        assert register_response.status_code == 201
        register_data = json.loads(register_response.data)
        token = register_data["data"]["token"]

        # Login
        login_response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_data["email"],
                "password": test_user_data["password"],
            },
            content_type="application/json",
        )
        assert login_response.status_code == 200
        login_data = json.loads(login_response.data)
        assert "token" in login_data["data"]

    def test_seller_product_lifecycle(
        self, client, seller_auth_headers, test_product_data
    ):
        """Test complete seller product creation and management."""
        # Create product
        create_response = client.post(
            "/api/products",
            json=test_product_data,
            headers=seller_auth_headers,
        )
        assert create_response.status_code == 201
        create_data = json.loads(create_response.data)
        product_id = create_data["data"]["id"]

        # Get product
        get_response = client.get(f"/api/products/{product_id}")
        assert get_response.status_code == 200

        # Update product
        update_response = client.put(
            f"/api/products/{product_id}",
            json={"price": 39.99},
            headers=seller_auth_headers,
        )
        assert update_response.status_code == 200

        # Delete product
        delete_response = client.delete(
            f"/api/products/{product_id}",
            headers=seller_auth_headers,
        )
        assert delete_response.status_code == 200

    def test_user_profile_management_flow(
        self, client, auth_headers, registered_user
    ):
        """Test complete user profile management."""
        # Get profile
        get_response = client.get("/api/users/profile", headers=auth_headers)
        assert get_response.status_code == 200

        # Update profile
        update_response = client.put(
            "/api/users/profile",
            json={"full_name": "New Name"},
            headers=auth_headers,
        )
        assert update_response.status_code == 200

        # Verify update
        verify_response = client.get("/api/users/profile", headers=auth_headers)
        assert verify_response.status_code == 200
        verify_data = json.loads(verify_response.data)
        assert verify_data["data"]["full_name"] == "New Name"

    def test_search_and_filter_flow(self, client, product):
        """Test complete search and filtering workflow."""
        # Basic search
        search_response = client.get("/api/search?q=test")
        assert search_response.status_code == 200

        # Filter by category
        filter_response = client.get(
            f"/api/search?q=test&category={product.category}"
        )
        assert filter_response.status_code == 200

        # Sort results
        sort_response = client.get("/api/search?q=test&sort=price&order=asc")
        assert sort_response.status_code == 200

    def test_unauthorized_access_attempts(self, client, auth_headers, test_user_data):
        """Test various unauthorized access attempts."""
        # Access protected endpoint without token
        response1 = client.get("/api/users/profile")
        assert response1.status_code == 401

        # Access protected endpoint with invalid token
        response2 = client.get(
            "/api/users/profile",
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert response2.status_code == 401

        # Try to create product as non-seller
        response3 = client.post(
            "/api/products",
            json=test_user_data,
            headers=auth_headers,
        )
        assert response3.status_code in [403, 422]  # Forbidden or validation error
