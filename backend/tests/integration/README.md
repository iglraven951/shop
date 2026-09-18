# Integration Tests for DiscoveryShop API

Comprehensive integration test suite covering all major DiscoveryShop API endpoints.

## Test Coverage

### Authentication Endpoints (15 tests)
- **POST /api/auth/register** (6 tests)
  - ✅ Successful registration
  - ✅ Missing required fields
  - ✅ Invalid email format
  - ✅ Weak password validation
  - ✅ Duplicate email detection
  - ✅ Duplicate username detection

- **POST /api/auth/login** (4 tests)
  - ✅ Successful login with tokens
  - ✅ User not found (non-existent email)
  - ✅ Wrong password handling
  - ✅ Missing required fields

- **POST /api/auth/refresh-token** (3 tests)
  - ✅ Successful token refresh
  - ✅ Invalid token handling
  - ✅ Missing token handling

- **POST /api/auth/logout** (2 tests)
  - ✅ Successful logout
  - ✅ Logout without authentication

### User Endpoints (12 tests)
- **GET /api/users/profile** (3 tests)
  - ✅ Get authenticated user profile
  - ✅ Reject unauthenticated requests
  - ✅ Reject invalid tokens

- **PUT /api/users/profile** (3 tests)
  - ✅ Successful profile update
  - ✅ Reject unauthenticated requests
  - ✅ Validate input data

- **GET /api/users/<id>** (3 tests)
  - ✅ Get public user information
  - ✅ Handle non-existent users
  - ✅ Seller profile with verification status

- **DELETE /api/users/<id>** (3 tests)
  - ✅ Successful account deletion
  - ✅ Require authentication
  - ✅ Prevent deleting other users' accounts

### Product Endpoints (15 tests)
- **GET /api/products** (5 tests)
  - ✅ List all products
  - ✅ Pagination support
  - ✅ Filter by category
  - ✅ Filter by price range
  - ✅ Sort results

- **POST /api/products** (5 tests)
  - ✅ Create product as seller
  - ✅ Require authentication
  - ✅ Require seller status (403)
  - ✅ Validate required fields (422)
  - ✅ Validate price data

- **GET /api/products/<id>** (2 tests)
  - ✅ Retrieve product details
  - ✅ Handle non-existent products (404)

- **PUT /api/products/<id>** (2 tests)
  - ✅ Update product as owner
  - ✅ Prevent non-owner updates (403)

- **DELETE /api/products/<id>** (2 tests)
  - ✅ Delete product as owner
  - ✅ Prevent non-owner deletion (403)

### Search Endpoints (10 tests)
- **GET /api/search** (10 tests)
  - ✅ Basic search functionality
  - ✅ Reject empty queries (400)
  - ✅ Filter by category
  - ✅ Filter by price range
  - ✅ Sort by price (asc/desc)
  - ✅ Sort by rating (asc/desc)
  - ✅ Pagination - first page
  - ✅ Pagination - subsequent pages
  - ✅ Handle no results
  - ✅ Handle special characters in queries

### Error Handling (8 tests)
- **401 Unauthorized** (2 tests)
  - ✅ Missing authentication token
  - ✅ Invalid token format

- **403 Forbidden** (2 tests)
  - ✅ Insufficient permissions (non-seller creating product)
  - ✅ Access denied (deleting other user's account)

- **404 Not Found** (2 tests)
  - ✅ Non-existent user
  - ✅ Non-existent product

- **400/422 Bad Request** (2 tests)
  - ✅ Invalid JSON payload
  - ✅ Missing required fields

### Response Format Validation (5 tests)
- ✅ Success response format
- ✅ Error response format
- ✅ Paginated response format
- ✅ Validation error details
- ✅ Authentication error format

### Integration Scenarios (5 tests)
- ✅ User registration and login flow
- ✅ Seller product lifecycle (CRUD)
- ✅ User profile management flow
- ✅ Search and filter workflow
- ✅ Unauthorized access attempts

## Running the Tests

### Run all integration tests
```bash
pytest -m integration backend/tests/integration/test_api.py
```

### Run specific test class
```bash
pytest -m integration backend/tests/integration/test_api.py::TestAuthEndpoints
pytest -m integration backend/tests/integration/test_api.py::TestUserEndpoints
pytest -m integration backend/tests/integration/test_api.py::TestProductEndpoints
```

### Run specific test
```bash
pytest -m integration backend/tests/integration/test_api.py::TestAuthEndpoints::test_register_success
```

### Run with coverage
```bash
pytest -m integration --cov=backend backend/tests/integration/test_api.py
```

### Run in verbose mode
```bash
pytest -m integration -v backend/tests/integration/test_api.py
```

### Run in parallel (faster)
```bash
pytest -m integration -n auto backend/tests/integration/test_api.py
```

## Test Fixtures

### User Fixtures
- `test_user_data`: Regular user registration data
- `seller_user_data`: Seller user registration data
- `registered_user`: Pre-registered test user (db fixture)
- `seller_user`: Verified seller user (db fixture)
- `valid_auth_token`: JWT token for authenticated user
- `auth_headers`: HTTP headers with valid token
- `seller_auth_headers`: HTTP headers for seller user
- `invalid_auth_headers`: HTTP headers with invalid token

### Product Fixtures
- `test_product_data`: Product creation data
- `product`: Pre-created test product in database

## Response Formats

All API responses follow this standard format:

### Success Response (2xx)
```json
{
    "success": true,
    "data": { /* response data */ },
    "message": "Operation successful"
}
```

### Error Response (4xx, 5xx)
```json
{
    "success": false,
    "error": "error_code",
    "message": "Human-readable error message",
    "errors": { /* validation errors if applicable */ }
}
```

## HTTP Status Codes Tested

- **200 OK**: Successful GET/PUT/DELETE
- **201 Created**: Successful POST
- **400 Bad Request**: Invalid JSON
- **401 Unauthorized**: Missing or invalid token
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Duplicate email/username
- **422 Unprocessable Entity**: Validation errors

## Test Data

### Test User
- Email: `testuser@example.com`
- Username: `testuser`
- Password: `SecurePass123`
- Full Name: `Test User`

### Test Seller
- Email: `seller@example.com`
- Username: `seller`
- Password: `SellerPass123`
- Full Name: `Test Seller`

### Test Product
- Name: `Test Product`
- Price: `29.99`
- Category: `Electronics`
- Stock: `10`

## Database

Tests use an in-memory SQLite database (`sqlite:///:memory:`):
- Automatically created for each test session
- Cleaned up after tests complete
- Isolated from production database

## Security Notes

These tests validate:
- ✅ Password strength requirements (min 8 chars, uppercase, lowercase, digit)
- ✅ Email format validation
- ✅ JWT token validation
- ✅ Authorization checks (seller status, ownership)
- ✅ Input validation (required fields, data types)

## Troubleshooting

### Tests not running
Ensure conftest.py is in the tests directory:
```bash
ls tests/conftest.py
```

### Import errors
Make sure you're running tests from project root:
```bash
cd /path/to/DiscoveryShop
pytest -m integration backend/tests/integration/test_api.py
```

### Database errors
Tests use isolated in-memory database. If you see database errors:
1. Check database initialization in conftest.py
2. Ensure all models are imported in backend/app.py
3. Run: `pytest --tb=short` for more details

## Next Steps

1. Implement remaining API endpoints following these test specifications
2. Add more test cases for edge cases and security scenarios
3. Add performance tests for search and filtering
4. Set up CI/CD pipeline to run tests on every commit
5. Monitor test coverage and aim for >90%

## Related Files

- `tests/conftest.py`: Shared test fixtures and configuration
- `backend/routes/auth.py`: Authentication endpoints implementation
- `backend/routes/users.py`: User endpoints implementation
- `backend/models/`: Database models
- `requirements.txt`: Test dependencies (pytest, pytest-flask, pytest-cov)
