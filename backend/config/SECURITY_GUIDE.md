# Security Configuration Guide

Quick reference for configuring CORS, security headers, and session security.

## Quick Start

All security settings are configured in:
- **Central Config**: `backend/config/security.py`
- **Flask Config**: `backend/config.py`
- **Environment Variables**: `.env` file

---

## CORS Configuration

### Allowing New Origins

Edit `.env`:
```bash
# Single origin
CORS_ORIGINS=https://yourdomain.com

# Multiple origins
CORS_ORIGINS=https://yourdomain.com,http://localhost:3000,https://app.yourdomain.com
```

Or in `backend/config.py`:
```python
CORS_ORIGINS = [
    "https://yourdomain.com",
    "https://app.yourdomain.com",
    "http://localhost:3000",  # Development only
]
```

### Restricting HTTP Methods

Edit `backend/config.py`:
```python
# Default: Allow all necessary methods
CORS_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]

# Restrict to read-only
CORS_METHODS = ["GET", "OPTIONS"]

# Add custom method
CORS_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"]
```

### Controlling Request Headers

Edit `backend/config.py`:
```python
# Default: Essential headers only
CORS_ALLOW_HEADERS = [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-CSRF-Token",
    "Accept",
    "Accept-Language",
    "Origin",
]

# Add custom header (e.g., for mobile app)
CORS_ALLOW_HEADERS = [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-CSRF-Token",
    "X-Mobile-App-Version",  # Custom header
    "Accept",
    "Accept-Language",
    "Origin",
]
```

### Exposing Response Headers

Edit `backend/config.py`:
```python
# Default: Safe headers only
CORS_EXPOSE_HEADERS = [
    "Content-Type",
    "X-Total-Count",
    "X-Page-Number",
    "X-Page-Size",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
]

# Add custom response header
CORS_EXPOSE_HEADERS = [
    "Content-Type",
    "X-Total-Count",
    "X-Page-Number",
    "X-Page-Size",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "X-Request-ID",  # Custom header
]
```

### CORS Preflight Caching

Edit `backend/config.py`:
```python
# Cache preflight requests for 1 hour (default)
CORS_MAX_AGE = 3600

# Longer cache (less security probes, more stale)
CORS_MAX_AGE = 86400  # 24 hours

# Short cache (more security checks)
CORS_MAX_AGE = 600  # 10 minutes
```

---

## Security Headers Configuration

### Content Security Policy (CSP)

Edit `backend/config/security.py`:
```python
# Default: Strict, only same-origin resources
CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; ..."

# Allow external CDN for stylesheets
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "frame-ancestors 'none';"
)

# Allow Google Fonts
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data: https:; "
    "connect-src 'self'; "
    "frame-ancestors 'none';"
)
```

### X-Frame-Options (Clickjacking Protection)

Edit `backend/config/security.py`:
```python
# Default: Page cannot be framed (most secure)
X_FRAME_OPTIONS = "DENY"

# Allow framing from same origin (for subdomains)
X_FRAME_OPTIONS = "SAMEORIGIN"

# Allow specific domain (rare)
X_FRAME_OPTIONS = "ALLOW-FROM https://parent.example.com"
```

### Permissions-Policy (Feature Control)

Edit `backend/config/security.py`:
```python
# Default: Disable all dangerous features
PERMISSIONS_POLICY = (
    "geolocation=(), "
    "microphone=(), "
    "camera=(), "
    "payment=(), "
    "usb=(), "
    "magnetometer=(), "
    "gyroscope=(), "
    "accelerometer=()"
)

# Allow payments for checkout page
PERMISSIONS_POLICY = (
    "geolocation=(), "
    "microphone=(), "
    "camera=(), "
    "payment=(self), "  # Allow payment API
    "usb=(), "
    "magnetometer=(), "
    "gyroscope=(), "
    "accelerometer=()"
)

# Allow geolocation for location services
PERMISSIONS_POLICY = (
    "geolocation=(self), "  # Allow geolocation
    "microphone=(), "
    "camera=(), "
    "payment=(), "
    "usb=(), "
    "magnetometer=(), "
    "gyroscope=(), "
    "accelerometer=()"
)
```

### HSTS (Enforce HTTPS)

Edit `backend/config/security.py`:
```python
# Default: 1 year HSTS, include subdomains, allow preload
STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains; preload"

# Shorter duration for testing
STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains"

# Disable preload list inclusion (not recommended)
STRICT_TRANSPORT_SECURITY = "max-age=31536000"

# Testing/development (30 seconds)
STRICT_TRANSPORT_SECURITY = "max-age=30"
```

---

## Session Security

### Cookie Settings

Edit `backend/config.py`:

```python
# Production settings (secure + httpOnly + samesite)
SESSION_COOKIE_SECURE = True        # HTTPS only
SESSION_COOKIE_HTTPONLY = True      # No JavaScript access
SESSION_COOKIE_SAMESITE = "Lax"     # CSRF protection

# Development settings (allow HTTP)
SESSION_COOKIE_SECURE = False       # Allow HTTP
SESSION_COOKIE_HTTPONLY = True      # Still protect from JS
SESSION_COOKIE_SAMESITE = "Lax"
```

### Cookie Lifetime

Edit `backend/config.py`:

```python
from datetime import timedelta

# Default: 30 days
PERMANENT_SESSION_LIFETIME = timedelta(days=30)

# Shorter session (more secure, more inconvenient)
PERMANENT_SESSION_LIFETIME = timedelta(days=1)  # 1 day

# Longer session (more convenient, less secure)
PERMANENT_SESSION_LIFETIME = timedelta(days=90)  # 90 days
```

---

## JWT Security

### Token Expiration

Edit `backend/config.py`:

```python
from datetime import timedelta

# Access token (short-lived)
JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)  # 24 hours default

# Shorter (more secure)
JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)   # 1 hour

# Longer (more convenient)
JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)    # 7 days

# Refresh token (long-lived)
JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)  # 30 days default
```

### JWT Cookie Settings

Edit `backend/config.py`:

```python
# Use httpOnly cookies (default, most secure)
JWT_TOKEN_LOCATION = ['cookies']
JWT_COOKIE_SECURE = True            # HTTPS only
JWT_COOKIE_HTTPONLY = True          # No JavaScript access
JWT_COOKIE_SAMESITE = 'Strict'      # CSRF protection
JWT_COOKIE_CSRF_PROTECT = True      # CSRF token validation

# Alternatively, use Authorization header
JWT_TOKEN_LOCATION = ['headers']
JWT_HEADER_NAME = 'Authorization'
JWT_HEADER_TYPE = 'Bearer'
```

---

## Development vs Production

### Development Configuration

```python
# .env (development)
FLASK_ENV=development
CORS_ORIGINS=http://localhost:5000,http://localhost:3000,http://localhost:5173
NGROK_URL=https://random-id.ngrok.io  # Optional ngrok for mobile testing

# backend/config.py
class DevelopmentConfig(Config):
    SESSION_COOKIE_SECURE = False       # Allow HTTP
    JWT_COOKIE_SECURE = False
    DEBUG = True
    SQLALCHEMY_ECHO = True
```

### Production Configuration

```bash
# .env (production)
FLASK_ENV=production
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
SECRET_KEY=<generate-random-secret>
JWT_SECRET_KEY=<generate-random-secret>
DATABASE_URL=postgresql://...
```

```python
# backend/config.py
class ProductionConfig(Config):
    SESSION_COOKIE_SECURE = True        # HTTPS only
    JWT_COOKIE_SECURE = True
    DEBUG = False
    SQLALCHEMY_ECHO = False
    LOG_LEVEL = "INFO"
```

---

## Testing Security Configuration

### Test CORS Preflight

```bash
# Test OPTIONS request
curl -i -X OPTIONS http://localhost:5000/api/auth/login \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"

# Expected response headers:
# Access-Control-Allow-Origin: http://localhost:3000
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
# Access-Control-Allow-Headers: Content-Type, Authorization, ...
# Access-Control-Max-Age: 3600
```

### Test Security Headers

```bash
# Test GET request
curl -i http://localhost:5000/api/products

# Expected response headers:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# Content-Security-Policy: default-src 'self'; ...
# Referrer-Policy: strict-origin-when-cross-origin
# Permissions-Policy: geolocation=(), microphone=(), camera=(), ...
# Cross-Origin-Opener-Policy: same-origin
# Cross-Origin-Resource-Policy: same-origin
```

### Test Forbidden Origin

```bash
# Request from origin not in CORS_ORIGINS
curl -i http://localhost:5000/api/products \
  -H "Origin: https://malicious.com"

# Should NOT include:
# Access-Control-Allow-Origin header
# CORS should reject the request in browser
```

---

## Common Issues

### Issue: "CORS request failed"

**Cause**: Origin not in `CORS_ORIGINS`  
**Solution**: Add origin to `.env` or `config.py`

```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:5000
```

### Issue: "CORS header missing"

**Cause**: Required method/header not in whitelist  
**Solution**: Add to `CORS_METHODS` or `CORS_ALLOW_HEADERS`

```python
CORS_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
```

### Issue: "Cookies not being sent"

**Cause**: `supports_credentials` not enabled  
**Solution**: Verify in `config.py`:

```python
CORS_SUPPORTS_CREDENTIALS = True
```

### Issue: "CSP blocks resource"

**Cause**: External resource not allowed by CSP  
**Solution**: Update `CONTENT_SECURITY_POLICY` to allow source

```python
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "style-src 'self' https://cdn.example.com; "  # Allow CDN
)
```

---

## Security Headers Explained

| Header | Purpose | Risk if Missing |
|--------|---------|-----------------|
| `X-Content-Type-Options: nosniff` | Prevent MIME type sniffing | Malicious files treated as JavaScript |
| `X-Frame-Options: DENY` | Prevent clickjacking | Page can be framed and attacked |
| `X-XSS-Protection: 1; mode=block` | Legacy XSS filter | XSS attacks in older browsers |
| `Strict-Transport-Security` | Enforce HTTPS | Man-in-the-middle attacks over HTTP |
| `Content-Security-Policy` | Prevent injection attacks | XSS, script injection, clickjacking |
| `Referrer-Policy` | Control referrer info | Information leakage to 3rd parties |
| `Permissions-Policy` | Disable dangerous features | Malware accessing camera/microphone |
| `Cross-Origin-Opener-Policy` | Isolate window context | Cross-origin window attacks |
| `Cross-Origin-Resource-Policy` | Control resource access | Unauthorized cross-origin loading |

---

## Best Practices

✅ **Do:**
- Use `DENY` for `X-Frame-Options` (most secure)
- Use `Strict` for `SameSite` cookies when possible
- Use `Lax` for `SameSite` if you need cross-site requests
- Keep `HSTS` max-age at least 31536000 (1 year)
- Test CORS with actual origins before deploying
- Monitor CORS rejections in logs

❌ **Don't:**
- Use `*` wildcard for `CORS_ORIGINS` in production
- Disable `HttpOnly` flag on session cookies
- Disable `Secure` flag in production
- Use inline scripts in CSP (use nonces instead)
- Leave debug mode enabled in production
- Share security configuration between dev/prod

---

## References

- [OWASP CORS Security](https://owasp.org/www-community/attacks/Clickjacking)
- [MDN Security Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [Flask-CORS Docs](https://flask-cors.readthedocs.io/)
- [NIST Cybersecurity](https://www.nist.gov/cyberframework)
- [CWE Top 25](https://cwe.mitre.org/top25/)
