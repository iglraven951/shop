# Testing Core Decorators & Middleware

Guide for testing decorators and middleware with curl, Postman, or Python requests.

---

## Test Server Setup

Start the Flask app:
```bash
python backend/app.py
```

Server runs on `http://localhost:5000`

---

## Test 1: `@handle_errors` - Exception Handling

### Test Invalid Data

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <VALID_TOKEN>" \
  -d '{"title": "", "price": 0, "stock": -1}'
```

**Expected Response:**
```json
{
    "error": "ValidationException",
    "message": "Request validation failed",
    "details": {
        "title": "Minimum length is 1",
        "stock": "Must be positive"
    }
}
```

**Status:** 422

---

## Test 2: `@validate_json` - Content-Type Validation

### Test Invalid Content-Type

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: text/plain" \
  -d 'invalid data'
```

**Expected Response:**
```json
{
    "error": "ValidationException",
    "message": "Request must be valid JSON",
    "details": {
        "content_type": "Content-Type must be application/json"
    }
}
```

**Status:** 422

### Test Valid JSON

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Laptop",
    "price": 999.99,
    "stock": 10,
    "category_id": 1
  }'
```

**Status:** 200 (if authorized) or 401 (if not)

---

## Test 3: `@validate_request(schema)` - Schema Validation

### Test Missing Required Field

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -d '{"title": "Laptop"}'  # Missing price, stock, category_id
```

**Expected Response:**
```json
{
    "error": "ValidationException",
    "message": "Request validation failed",
    "details": {
        "price": "This field is required",
        "stock": "This field is required",
        "category_id": "This field is required"
    }
}
```

**Status:** 422

### Test Invalid Type

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -d '{"title": "Laptop", "price": "free", "stock": 10, "category_id": 1}'
```

**Expected Response:**
```json
{
    "error": "ValidationException",
    "message": "Request validation failed",
    "details": {
        "price": "Expected float or int"
    }
}
```

**Status:** 422

### Test Min/Max Length

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -d '{"title": "", "price": 10, "stock": 5, "category_id": 1}'
```

**Expected Response:**
```json
{
    "error": "ValidationException",
    "message": "Request validation failed",
    "details": {
        "title": "Minimum length is 1"
    }
}
```

**Status:** 422

---

## Test 4: `@paginate` - Pagination Validation

### Test Valid Pagination

```bash
curl 'http://localhost:5000/api/products?page=2&per_page=50'
```

**Expected Response:**
```json
{
    "products": [...],
    "pagination": {
        "page": 2,
        "per_page": 50,
        "total": 150,
        "pages": 3
    }
}
```

**Status:** 200

### Test Default Pagination

```bash
curl http://localhost:5000/api/products
```

**Response includes:**
```json
{
    "pagination": {
        "page": 1,
        "per_page": 20,
        ...
    }
}
```

### Test Invalid Page Number

```bash
curl 'http://localhost:5000/api/products?page=abc'
```

**Expected Response:**
```json
{
    "error": "ValidationException",
    "message": "Invalid pagination parameters",
    "details": {
        "page": "Page must be an integer"
    }
}
```

**Status:** 422

### Test Out of Range

```bash
curl 'http://localhost:5000/api/products?page=0&per_page=200'
```

**Expected Response:**
```json
{
    "error": "ValidationException",
    "message": "Invalid pagination parameters",
    "details": {
        "page": "Page must be >= 1",
        "per_page": "Per page must be between 1 and 100"
    }
}
```

**Status:** 422

---

## Test 5: `@token_required` - JWT Validation

### Test Missing Token

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -d '{"title": "Laptop", "price": 999.99, "stock": 10, "category_id": 1}'
```

**Expected Response:**
```json
{
    "error": "UnauthorizedAccessException",
    "message": "Missing authentication token"
}
```

**Status:** 403

### Test Invalid Token

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid.token.here" \
  -d '{"title": "Laptop", "price": 999.99, "stock": 10, "category_id": 1}'
```

**Expected Response:**
```json
{
    "error": "UnauthorizedAccessException",
    "message": "Invalid or expired token"
}
```

**Status:** 403

### Test Expired Token

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <EXPIRED_TOKEN>" \
  -d '{"title": "Laptop", "price": 999.99, "stock": 10, "category_id": 1}'
```

**Expected Response:**
```json
{
    "error": "UnauthorizedAccessException",
    "message": "Invalid or expired token"
}
```

**Status:** 403

### Test Valid Token

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <VALID_TOKEN>" \
  -d '{"title": "Laptop", "price": 999.99, "stock": 10, "category_id": 1}'
```

**Status:** 201 (if seller) or 403 (if not seller)

---

## Test 6: `@role_required(role)` - Authorization

### Test Seller-Only Endpoint (Non-Seller)

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <BUYER_TOKEN>" \
  -d '{"title": "Laptop", "price": 999.99, "stock": 10, "category_id": 1}'
```

**Expected Response:**
```json
{
    "error": "UnauthorizedAccessException",
    "message": "User role 'seller' is required for this action"
}
```

**Status:** 403

### Test Admin-Only Endpoint (Non-Admin)

```bash
curl -X DELETE http://localhost:5000/api/products/123 \
  -H "Authorization: Bearer <SELLER_TOKEN>"
```

**Expected Response:**
```json
{
    "error": "UnauthorizedAccessException",
    "message": "User role 'admin' is required for this action"
}
```

**Status:** 403

### Test Admin-Only Endpoint (Admin)

```bash
curl -X DELETE http://localhost:5000/api/products/123 \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Status:** 204 (if product exists and is deleted)

---

## Test 7: Combined Decorators

### Complete POST Test (Seller)

```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SELLER_TOKEN>" \
  -d '{
    "title": "Gaming Laptop",
    "description": "High-end gaming laptop",
    "price": 1499.99,
    "stock": 5,
    "category_id": 1
  }'
```

**Success Response (201):**
```json
{
    "product": {
        "id": 123,
        "title": "Gaming Laptop",
        "price": 1499.99,
        "stock": 5,
        "seller_id": "seller-user-id"
    }
}
```

### Complete GET Test (Paginated)

```bash
curl -X GET 'http://localhost:5000/api/products?page=1&per_page=10' \
  -H "Authorization: Bearer <VALID_TOKEN>"
```

**Success Response (200):**
```json
{
    "products": [
        {"id": 1, "title": "Laptop", "price": 999.99},
        {"id": 2, "title": "Phone", "price": 499.99},
        ...
    ],
    "pagination": {
        "page": 1,
        "per_page": 10,
        "total": 45,
        "pages": 5
    }
}
```

---

## Test 8: Middleware - Error Handlers

### Test 404 Not Found

```bash
curl http://localhost:5000/api/products/99999
```

**Expected Response:**
```json
{
    "error": "ProductNotFoundException",
    "message": "Product not found"
}
```

**Status:** 404

### Test 405 Method Not Allowed

```bash
curl -X DELETE http://localhost:5000/api/products  # POST expected
```

**Expected Response:**
```json
{
    "error": "MethodNotAllowed",
    "message": "The DELETE method is not allowed for this endpoint"
}
```

**Status:** 405

---

## Postman Collection

Save as `DiscoveryShop.postman_collection.json`:

```json
{
  "info": {
    "name": "DiscoveryShop API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Products",
      "item": [
        {
          "name": "List Products",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{base_url}}/api/products?page=1&per_page=20",
              "host": ["{{base_url}}"],
              "path": ["api", "products"],
              "query": [
                {"key": "page", "value": "1"},
                {"key": "per_page", "value": "20"}
              ]
            }
          }
        },
        {
          "name": "Create Product",
          "request": {
            "method": "POST",
            "header": [
              {"key": "Content-Type", "value": "application/json"},
              {"key": "Authorization", "value": "Bearer {{token}}"}
            ],
            "url": {"raw": "{{base_url}}/api/products"},
            "body": {
              "mode": "raw",
              "raw": "{\"title\": \"New Product\", \"price\": 99.99, \"stock\": 10, \"category_id\": 1}"
            }
          }
        }
      ]
    }
  ]
}
```

---

## Python Requests Examples

### Create Product

```python
import requests

BASE_URL = "http://localhost:5000"
SELLER_TOKEN = "your-seller-token-here"

response = requests.post(
    f"{BASE_URL}/api/products",
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SELLER_TOKEN}"
    },
    json={
        "title": "Gaming Laptop",
        "description": "High-end gaming",
        "price": 1499.99,
        "stock": 5,
        "category_id": 1
    }
)

print(response.status_code)  # 201
print(response.json())        # Product data
```

### List Products with Pagination

```python
response = requests.get(
    f"{BASE_URL}/api/products",
    params={"page": 1, "per_page": 50}
)

print(response.json())
# {
#   "products": [...],
#   "pagination": {"page": 1, "per_page": 50, "total": 150, ...}
# }
```

### Test Error Handling

```python
response = requests.post(
    f"{BASE_URL}/api/products",
    headers={"Content-Type": "application/json"},
    json={"title": ""}  # Invalid: empty title
)

print(response.status_code)  # 422
print(response.json())
# {
#   "error": "ValidationException",
#   "message": "Request validation failed",
#   "details": {"title": "Minimum length is 1"}
# }
```

---

## Logging Output

When running tests, watch Flask logs:

```
[2026-09-17 10:30:45] DEBUG: GET /api/products
[2026-09-17 10:30:45] INFO: GET /api/products -> 200 (0.045s)

[2026-09-17 10:30:46] DEBUG: POST /api/products
[2026-09-17 10:30:46] WARNING: POST /api/products -> 422 (0.012s)

[2026-09-17 10:30:47] DEBUG: GET /api/products/abc
[2026-09-17 10:30:47] WARNING: Unauthorized: GET /api/products/abc
[2026-09-17 10:30:47] INFO: GET /api/products/abc -> 403 (0.003s)
```

---

## Test Checklist

- [ ] Test all decorators individually
- [ ] Test decorator combinations
- [ ] Test error responses
- [ ] Test valid data
- [ ] Test invalid data types
- [ ] Test missing required fields
- [ ] Test pagination boundaries
- [ ] Test JWT token validation
- [ ] Test role-based access
- [ ] Monitor request logs
- [ ] Verify response format consistency
- [ ] Test with Postman collection
- [ ] Test with Python requests
