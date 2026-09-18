# API Documentation Setup Guide

This guide explains how to set up and use the professional OpenAPI/Swagger documentation for DiscoveryShop Marketplace API.

---

## Prerequisites

- Python 3.10+
- Flask 2.3+
- flask-restx 0.5.1+ (already in requirements.txt)

---

## Installation

1. Install required dependencies:

```bash
pip install -r requirements.txt
```

This includes:
- `flask-restx` - OpenAPI/Swagger documentation framework
- `flask` - Core web framework
- All other DiscoveryShop dependencies

---

## Features

### 1. **Swagger UI Documentation**
- Interactive API documentation at `/api/docs`
- Try-it-out functionality for testing endpoints
- Real-time API exploration
- Request/response examples

### 2. **ReDoc Documentation**
- Alternative documentation interface at `/api/redoc`
- Beautiful, organized endpoint listing
- Search functionality
- Mobile-friendly design

### 3. **OpenAPI Specification**
- Machine-readable API specification at `/api/v1/spec`
- Compatible with Postman, Insomnia, and other tools
- Available in JSON format

### 4. **Complete Endpoint Coverage**
All marketplace features documented:
- Authentication & Authorization
- User Management
- Product Listing & Search
- Shopping Cart
- Orders & Checkout
- Real-time Chat
- AI Chatbot
- Admin Dashboard

---

## Accessing Documentation

### Local Development

1. Start the Flask server:
```bash
python backend/app.py
```

2. Access documentation:
- **Swagger UI**: http://localhost:5000/api/docs
- **ReDoc**: http://localhost:5000/api/redoc
- **OpenAPI Spec**: http://localhost:5000/api/v1/spec (JSON)

### Production

Replace `localhost:5000` with your production domain:
- https://api.discoveryshop.com/api/docs
- https://api.discoveryshop.com/api/redoc

---

## Testing Endpoints

### In Swagger UI

1. Navigate to http://localhost:5000/api/docs
2. Click on any endpoint to expand it
3. Click "Try it out"
4. Fill in parameters and request body
5. Click "Execute"
6. View response and status code

### Using cURL

```bash
# Register user
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "testuser",
    "password": "SecurePass123"
  }'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'

# List products
curl http://localhost:5000/api/v1/products
```

### Using Postman

1. Open Postman
2. Click "Import"
3. Choose "Link" tab
4. Enter: `http://localhost:5000/api/v1/spec`
5. Click "Continue"
6. Collections are automatically imported
7. Set environment variable: `base_url = http://localhost:5000`
8. Start testing endpoints

### Using Insomnia

1. Open Insomnia
2. File → Import
3. Paste: `http://localhost:5000/api/v1/spec`
4. Click "Scan"
5. Collections are automatically created
6. Test endpoints with authentication headers

---

## Authentication in Swagger UI

1. Login via the `/auth/login` endpoint
2. Copy the returned `token` value
3. Click "Authorize" button (top-right)
4. Enter: `Bearer <your_token>`
5. Click "Authorize"
6. All subsequent requests include authentication

---

## API Endpoint Organization

### By Service

**Authentication** (`/api/v1/auth`)
- Register
- Login
- Refresh Token
- Verify Token

**Users** (`/api/v1/users`)
- Get Profile
- Update Profile
- Get Seller Info
- Enable Seller Role

**Products** (`/api/v1/products`)
- List Products (with filters)
- Create Product
- Get Product Details
- Update Product
- Delete Product
- Search Products

**Shopping Cart** (`/api/v1/cart`)
- Get Cart
- Add Item
- Update Item
- Remove Item

**Orders** (`/api/v1/orders`)
- List Orders
- Create Order
- Get Order Details
- Cancel Order

**Chat** (`/api/v1/chat`)
- List Conversations
- Send Message
- Get Messages

**AI Chatbot** (`/api/v1/chatbot`)
- Send Chat Message
- Get Session

**Admin** (`/api/v1/admin`)
- Dashboard
- Approve Product
- Reject Product
- List Users
- Suspend User

---

## Response Format

All responses follow standard REST conventions:

### Success Response (2xx)
```json
{
  "data": { /* response data */ },
  "message": "Operation successful"
}
```

### Error Response (4xx, 5xx)
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field_name": "Additional details"
  },
  "timestamp": "2024-03-17T10:30:00Z"
}
```

### Pagination Response
```json
{
  "data": [ /* items */ ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_INPUT | 400 | Request validation failed |
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | Access denied |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource already exists |
| VALIDATION_ERROR | 422 | Data validation failed |
| SERVER_ERROR | 500 | Internal server error |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |

---

## Integration with Frontend

### Fetch API

```javascript
// Register
const response = await fetch('http://localhost:5000/api/v1/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@example.com',
    username: 'testuser',
    password: 'SecurePass123'
  })
});

const data = await response.json();
const token = data.token;

// Save token for future requests
localStorage.setItem('auth_token', token);

// Use token in subsequent requests
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
};

// Get user profile
const profileResponse = await fetch('http://localhost:5000/api/v1/users/1', {
  headers: headers
});
```

### Axios

```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Login
api.post('/auth/login', {
  email: 'user@example.com',
  password: 'SecurePass123'
}).then(response => {
  localStorage.setItem('auth_token', response.data.token);
});

// Get products
api.get('/products?category=electronics').then(response => {
  console.log(response.data);
});
```

---

## Configuration

### Current Configuration

- API Version: `v1`
- Base Path: `/api/v1`
- Documentation Path: `/api/docs`
- Alternative Docs: `/api/redoc`
- OpenAPI Spec: `/api/v1/spec`

### Customization

To customize documentation in `backend/config_openapi.py`:

```python
# Change documentation title
api = Api(
    app,
    title="Your Custom Title",
    description="Your custom description",
    version="2.0.0"
)

# Change documentation path
api = Api(
    app,
    doc="/api/documentation"  # Custom path
)
```

---

## Performance Considerations

### Caching

- GET requests are cacheable (add cache headers)
- PUT/POST/DELETE should not be cached
- Pagination reduces response payload

### Optimization

- Use query parameters for filtering
- Implement pagination for large datasets
- Consider response compression (gzip)
- Monitor API response times

### Rate Limiting

- Default: 100 requests per minute
- Check `X-RateLimit-*` response headers
- Implement exponential backoff for retries

---

## Security

### CORS Configuration

The API allows requests from:
- `http://localhost:3000` (development)
- `http://localhost:5000` (same origin)

Modify in `backend/config.py` for production:

```python
CORS_ORIGINS = [
    "https://discoveryshop.com",
    "https://app.discoveryshop.com"
]
```

### JWT Security

- Tokens expire after 24 hours
- Always use HTTPS in production
- Store tokens securely (HttpOnly cookies recommended)
- Refresh tokens before expiration
- Never expose tokens in URLs

### Input Validation

- All inputs are validated server-side
- Email format validation
- Password strength requirements
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)

---

## Troubleshooting

### Swagger UI Not Loading

1. Check if Flask-RESTX is installed:
```bash
pip list | grep flask-restx
```

2. Verify URL is correct:
- Local: http://localhost:5000/api/docs
- Check server logs for errors

### Authentication Not Working

1. Ensure token is correctly copied from login response
2. Check token format: `Bearer <token>`
3. Verify token hasn't expired (24 hours)
4. Try refreshing token with `/api/v1/auth/refresh`

### CORS Errors

1. Check browser console for origin rejection
2. Verify frontend URL is in CORS_ORIGINS
3. For development, enable CORS in Flask-CORS
4. In production, ensure matching domains

### Database Connection Issues

1. Check SQLite file exists in `backend/database.db`
2. Verify database is not locked
3. Check file permissions (should be 644 or writable)
4. For PostgreSQL: verify connection string in `.env`

---

## Best Practices

### API Design

1. Always validate input
2. Return appropriate HTTP status codes
3. Provide meaningful error messages
4. Use consistent response format
5. Document all endpoints

### Testing

1. Test all endpoints in Swagger UI first
2. Use Postman for complex workflows
3. Test with different user roles
4. Test error scenarios
5. Monitor API logs

### Documentation

1. Keep API documentation updated
2. Document all query parameters
3. Provide code examples
4. Document error responses
5. Maintain changelog

---

## Export for External Tools

### Export OpenAPI Spec

```bash
# Download spec from running server
curl http://localhost:5000/api/v1/spec > openapi.json

# Import to Postman
1. Open Postman
2. File → Import
3. Select openapi.json file
4. Collections auto-created
```

### Generate Client SDK

Using tools like OpenAPI Generator:

```bash
# Generate TypeScript client
openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-fetch \
  -o ./generated-client
```

---

## Support & Resources

- **API Documentation**: http://localhost:5000/api/docs
- **OpenAPI Specification**: http://localhost:5000/api/v1/spec
- **GitHub Repository**: [your-repo-url]
- **Issue Tracker**: [your-issue-tracker]
- **Email Support**: support@discoveryshop.local

---

## Next Steps

1. Start the development server
2. Visit http://localhost:5000/api/docs
3. Test endpoints with Swagger UI
4. Integrate API into frontend
5. Deploy to production with HTTPS

---

Last Updated: 2026-03-17
