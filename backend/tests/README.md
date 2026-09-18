# DiscoveryShop Backend Tests

Comprehensive unit test suite for DiscoveryShop authentication and backend systems.

## Test Structure

```
backend/tests/
├── __init__.py
├── conftest.py                    # Pytest fixtures and configuration
├── unit/
│   ├── __init__.py
│   └── test_auth.py               # Authentication module tests (60+ tests)
└── README.md                       # This file
```

## Test Coverage

### Authentication Module (`backend/auth.py`)

#### JWT Token Generation Tests (20 tests)
- Valid token creation with default expiration
- Token creation with custom expiration times
- Token type handling (access vs refresh)
- Missing JWT_SECRET_KEY error handling
- Invalid parameter handling
- Payload verification
- Token format validation

#### JWT Token Verification Tests (15 tests)
- Valid token parsing and payload extraction
- Expired token detection
- Invalid signature detection
- Malformed token handling
- Token payload completeness
- Edge cases (missing fields, extra claims)

#### Password Hashing Tests (10 tests)
- Hash generation and validation
- Password verification (correct and incorrect)
- Consistency of salted hashes
- Special character handling
- Unicode character support
- Edge cases (empty, very long passwords)

#### Token Extraction from Headers Tests (15 tests)
- Valid Bearer token extraction
- Missing Authorization header handling
- Malformed header format detection
- Case sensitivity
- Token cleanup and validation
- Edge cases (extra whitespace, multiple tokens)

#### Integration Tests
- Complete token generation and verification cycle
- Password hashing roundtrip
- Case sensitivity validation
- Boundary condition testing

**Total: 60+ comprehensive unit tests**

## Running Tests

### Run all tests:
```bash
pytest
```

### Run with verbose output:
```bash
pytest -v
```

### Run specific test file:
```bash
pytest backend/tests/unit/test_auth.py -v
```

### Run specific test class:
```bash
pytest backend/tests/unit/test_auth.py::TestGenerateJWTToken -v
```

### Run specific test:
```bash
pytest backend/tests/unit/test_auth.py::TestGenerateJWTToken::test_generate_token_with_valid_user_id -v
```

### Run with coverage report:
```bash
pytest --cov=backend --cov-report=html --cov-report=term-missing
```

### Run tests in parallel:
```bash
pytest -n auto
```

### Run tests with specific markers:
```bash
pytest -m "not slow"
```

## Test Fixtures

### Core Fixtures (`conftest.py`)

- **`app`**: Flask application configured for testing
- **`client`**: Flask test client
- **`app_context`**: Flask application context
- **`request_context`**: Flask request context
- **`auth_config`**: Authentication configuration dictionary
- **`valid_user_id`**: Sample user ID for testing
- **`valid_password`**: Sample password for testing
- **`mock_db_session`**: Mock database session
- **`mock_user`**: Mock User object with basic attributes
- **`mock_admin_user`**: Mock User object with admin role
- **`mock_seller_user`**: Mock User object with seller role

## Test Requirements

All required packages are in `requirements.txt`:
- pytest==7.4.2
- pytest-flask==1.3.0
- pytest-cov==4.1.0
- pytest-mock==3.12.0
- pytest-xdist==3.5.0

Install with:
```bash
pip install -r requirements.txt
```

## Writing New Tests

### Test File Structure
```python
class TestFeatureName:
    """Test suite for feature_name."""
    
    def test_specific_behavior(self, fixture_name: str):
        """Test description."""
        # Arrange
        setup_data = fixture_name
        
        # Act
        result = function_under_test(setup_data)
        
        # Assert
        assert result == expected_value
```

### Best Practices

1. **Use descriptive test names**: `test_verify_expired_token_returns_none`
2. **Use docstrings**: Explain what the test verifies
3. **Arrange-Act-Assert pattern**: Clear test structure
4. **Use fixtures**: Reuse common setup code
5. **Mock external dependencies**: Isolate the code under test
6. **Test both success and failure cases**: Happy path and edge cases
7. **Test type hints**: Add return types to test functions
8. **Avoid test interdependency**: Each test should be independent

## Common Issues

### ImportError: cannot import name 'create_app'
Make sure Flask app is initialized in `backend/app.py`:
```python
def create_app():
    app = Flask(__name__)
    # ... configuration
    return app
```

### JWT_SECRET_KEY not configured
Tests expect `JWT_SECRET_KEY` in Flask config. Check `conftest.py` fixture setup.

### Database connection issues
Tests use in-memory SQLite. Check that SQLAlchemy is properly configured.

## Continuous Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: pytest --cov=backend --cov-report=term-missing

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Next Steps

1. Add integration tests (`backend/tests/integration/`)
2. Add route/endpoint tests (`backend/tests/unit/test_routes/`)
3. Add model tests (`backend/tests/unit/test_models/`)
4. Add service tests (`backend/tests/unit/test_services/`)
5. Set up CI/CD pipeline with pytest

## Contributors

- Testing framework: pytest
- Mocking: unittest.mock
- Flask testing: pytest-flask
- Coverage: pytest-cov
