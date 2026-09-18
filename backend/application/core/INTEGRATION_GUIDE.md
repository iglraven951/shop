# DiscoveryShop Core Utilities Integration Guide

## Overview

The `backend/application/core/` module provides centralized decorators and middleware for:
- Error handling with consistent JSON responses
- Request validation (JSON, schema)
- Pagination with safe parameter extraction
- Role-based access control
- Request logging and CORS

## File Structure

```
backend/application/core/
├── __init__.py          # Module exports
├── decorators.py        # 6 reusable decorators
├── middleware.py        # Middleware initialization
└── INTEGRATION_GUIDE.md # This file
```

---

## Decorators (6 available)

### 1. `@handle_errors`

Catches all `DiscoveryShopException` subclasses and returns JSON error responses with proper HTTP status codes.

**Usage:**
```python
from backend.application.core import handle_errors
from backend.auth import token_required

@app.route('/api/products/<product_id>', methods=['GET'])
@handle_errors
@token_required
def get_product(product_id):
    product = Product.query.get_or_404(product_id)
    return jsonify({'product': product.to_dict()})
```

**Response on Error:**
```json
{
    "error": "ProductNotFoundException",
    "message": "Product not found"
}
```

---

### 2. `@validate_json`

Ensures request body is valid JSON. Returns 400 if Content-Type is wrong or JSON is malformed.

**Usage:**
```python
from backend.application.core import validate_json, handle_errors

@app.route('/api/products', methods=['POST'])
@handle_errors
@validate_json
def create_product():
    data = request.get_json()  # Guaranteed to be valid
    return jsonify({'id': 123})
```

---

### 3. `@validate_request(schema)`

Validates request body against a schema before processing. Supports type checking, min/max lengths.

**Schema Format:**
```python
{
    'field_name': {
        'required': True,           # Must be present
        'type': str,                # Python type (str, int, dict, etc.)
        'min_length': 1,            # For strings
        'max_length': 255,          # For strings
    }
}
```

**Usage:**
```python
from backend.application.core import validate_json, validate_request, handle_errors

@app.route('/api/users', methods=['POST'])
@handle_errors
@validate_json
@validate_request({
    'email': {'required': True, 'type': str, 'min_length': 5},
    'password': {'required': True, 'type': str, 'min_length': 8},
    'age': {'required': False, 'type': int},
})
def register_user():
    data = request.get_json()
    # data is validated and safe to use
    user = User.create(email=data['email'], password=data['password'])
    return jsonify({'id': user.id}), 201
```

**Response on Validation Error:**
```json
{
    "error": "ValidationException",
    "message": "Request validation failed",
    "details": {
        "password": "Minimum length is 8",
        "email": "This field is required"
    }
}
```

---

### 4. `@paginate`

Extracts and validates `page` and `per_page` query parameters.

- Default: `page=1, per_page=20`
- Validates: Must be positive integers, per_page max 100
- Stores in: `g.pagination` with `offset` calculated

**Usage:**
```python
from backend.application.core import paginate, handle_errors

@app.route('/api/products', methods=['GET'])
@handle_errors
@paginate
def list_products():
    pagination = g.pagination
    # pagination = {'page': 1, 'per_page': 20, 'offset': 0}
    
    products = Product.query.limit(pagination['per_page']).offset(pagination['offset']).all()
    total = Product.query.count()
    
    return jsonify({
        'products': [p.to_dict() for p in products],
        'pagination': {
            'page': pagination['page'],
            'per_page': pagination['per_page'],
            'total': total,
        }
    })
```

**Query Examples:**
```
GET /api/products?page=1&per_page=10
GET /api/products                          # Uses defaults (page=1, per_page=20)
GET /api/products?page=abc                 # Returns 422 Validation Error
```

---

### 5. `@role_required(role)`

Validates user has required role. Must be used **after** `@token_required`.

**Supported Roles:** `'admin'`, `'seller'`, `'buyer'`

**Usage:**
```python
from backend.auth import token_required
from backend.application.core import role_required, handle_errors

# Admin only
@app.route('/api/admin/users', methods=['GET'])
@handle_errors
@token_required
@role_required('admin')
def list_all_users():
    users = User.query.all()
    return jsonify({'users': [u.to_dict() for u in users]})

# Sellers only
@app.route('/api/seller/products', methods=['POST'])
@handle_errors
@token_required
@role_required('seller')
def create_product():
    # Only verified sellers can post products
    return jsonify({'product_id': 123})

# Buyers (all authenticated users)
@app.route('/api/buyer/cart', methods=['GET'])
@handle_errors
@token_required
@role_required('buyer')
def get_cart():
    # Any authenticated user
    return jsonify({'items': []})
```

**Response on Authorization Failure:**
```json
{
    "error": "UnauthorizedAccessException",
    "message": "User role 'admin' is required for this action"
}
```

---

### 6. `@paginate` + `@role_required` Combination

You can stack decorators for powerful validation chains:

```python
from backend.auth import token_required
from backend.application.core import (
    handle_errors,
    validate_json,
    validate_request,
    paginate,
    role_required,
)

@app.route('/api/admin/products', methods=['GET'])
@handle_errors
@paginate  # Extracts page, per_page
@token_required  # Validates JWT
@role_required('admin')  # Validates admin role
def admin_list_products():
    pagination = g.pagination
    admin_user = g.user  # From token_required
    
    products = Product.query.limit(pagination['per_page']).offset(pagination['offset']).all()
    return jsonify({
        'products': [p.to_dict() for p in products],
        'pagination': pagination,
    })
```

---

## Middleware

### `init_middleware(app)`

Initializes centralized middleware for the Flask app. Call in your `app.py` after creating the Flask instance.

**Configures:**
1. **CORS** - Restricted origins, allowed headers
2. **Request Logging** - Method, path, status, timing
3. **Error Handlers** - Global 404, 405, 500 handlers

**Usage in app.py:**
```python
from flask import Flask
from backend.application.core import init_middleware

def create_app():
    app = Flask(__name__)
    
    # ... configure app ...
    
    # Initialize centralized middleware
    init_middleware(app)
    
    # ... register blueprints ...
    
    return app
```

**Logging Output:**
```
DEBUG: GET /api/products
INFO: GET /api/products -> 200 (0.045s)
WARNING: POST /api/users -> 422 (0.012s)
ERROR: GET /api/admin -> 500 (0.002s)
```

---

## Decorator Stacking Order

The order of decorators matters! Follow this pattern:

```python
@app.route('/api/resource', methods=['POST'])
@handle_errors                          # 1. TOP: Catches all exceptions
@validate_json                          # 2. Validate content type
@validate_request({'key': {...}})       # 3. Validate schema
@token_required                         # 4. Validate JWT token
@role_required('admin')                 # 5. Validate user role
@paginate                               # 6. BOTTOM: Extract pagination (if GET)
def endpoint():
    pass
```

**Why this order?**
- `@handle_errors` at top catches everything below
- JSON validation before schema validation
- Auth checks before role checks
- Pagination last (usually for GET endpoints)

---

## Error Response Format

All errors use consistent JSON format:

```json
{
    "error": "ExceptionClassName",
    "message": "Human-readable error message",
    "details": {                    // Only for ValidationException
        "field_name": "Error for this field",
        "another_field": "Error for another field"
    }
}
```

**HTTP Status Codes Used:**
- `400` - Bad Request (ValidationException)
- `401` - Unauthorized (InvalidCredentialsException)
- `403` - Forbidden (UnauthorizedAccessException)
- `404` - Not Found (ResourceNotFoundException)
- `409` - Conflict (ConflictException)
- `422` - Unprocessable Entity (ValidationException)
- `500` - Internal Server Error

---

## Examples: Complete Route

```python
from flask import Blueprint, request, jsonify, g
from backend.auth import token_required
from backend.application.core import (
    handle_errors,
    validate_json,
    validate_request,
    paginate,
    role_required,
)
from backend.models.product import Product
from backend.exceptions import ValidationException

products_bp = Blueprint('products', __name__, url_prefix='/api/products')


# GET /api/products?page=1&per_page=20
@products_bp.route('', methods=['GET'])
@handle_errors
@paginate
def list_products():
    pagination = g.pagination
    products = Product.query.limit(pagination['per_page']).offset(pagination['offset']).all()
    total = Product.query.count()
    
    return jsonify({
        'products': [p.to_dict() for p in products],
        'pagination': {
            'page': pagination['page'],
            'per_page': pagination['per_page'],
            'total': total,
            'pages': (total + pagination['per_page'] - 1) // pagination['per_page'],
        }
    })


# GET /api/products/<product_id>
@products_bp.route('/<product_id>', methods=['GET'])
@handle_errors
@token_required
def get_product(product_id):
    product = Product.query.get(product_id)
    if not product:
        raise ValidationException("Product not found")
    
    return jsonify({'product': product.to_dict()})


# POST /api/products
@products_bp.route('', methods=['POST'])
@handle_errors
@validate_json
@validate_request({
    'title': {'required': True, 'type': str, 'min_length': 1, 'max_length': 255},
    'description': {'required': False, 'type': str, 'max_length': 5000},
    'price': {'required': True, 'type': (int, float)},
    'stock': {'required': True, 'type': int},
})
@token_required
@role_required('seller')
def create_product():
    data = request.get_json()
    seller_id = g.user
    
    product = Product(
        seller_id=seller_id,
        title=data['title'],
        description=data.get('description', ''),
        price=data['price'],
        stock=data['stock'],
    )
    product.save()
    
    return jsonify({'product': product.to_dict()}), 201
```

---

## Benefits

✅ **DRY** - No duplicate error handling code
✅ **Consistent** - All errors use same JSON format
✅ **Type-Safe** - Validates request schemas
✅ **Logged** - All requests logged with timing
✅ **Secure** - Role-based access built-in
✅ **Paginated** - Safe pagination parameters
✅ **Readable** - Decorator stacking is clear and explicit

---

## Next Steps

1. Import decorators in your route files
2. Apply to endpoints following the stacking order
3. Test error responses with invalid requests
4. Monitor logs for request timing and errors
