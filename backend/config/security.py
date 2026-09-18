"""Security configuration for DiscoveryShop backend.

This module centralizes all security-related configurations including CORS,
HTTP headers, session management, and security policies. Each setting includes
documentation explaining its purpose and security implications.
"""

from datetime import timedelta


class SecurityHeaders:
    """HTTP Security Headers Configuration.

    These headers are essential for protecting against common web vulnerabilities.
    They are applied to every response via the after_request handler.
    """

    # Content Security Policy (CSP)
    # Configured permissively for development with ngrok
    CONTENT_SECURITY_POLICY = "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data:; font-src *; connect-src *; frame-ancestors *;"

    # X-Content-Type-Options
    # Prevents MIME type sniffing
    # 'nosniff' = browser must respect Content-Type header, no sniffing
    X_CONTENT_TYPE_OPTIONS = "nosniff"

    # X-Frame-Options
    # Prevents clickjacking attacks by disallowing framing
    # 'DENY' = page cannot be displayed in a frame at all
    X_FRAME_OPTIONS = "DENY"

    # X-XSS-Protection
    # Legacy XSS protection (browsers that support it)
    # '1; mode=block' = enable XSS filter and block if attack detected
    X_XSS_PROTECTION = "1; mode=block"

    # Strict-Transport-Security (HSTS)
    # Enforces HTTPS for all future connections
    # 31536000 seconds = 1 year (recommended minimum for production)
    # includeSubDomains = applies to all subdomains
    # preload = allows inclusion in browser preload lists
    STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains; preload"

    # Referrer-Policy
    # Controls how much referrer information is shared with other sites
    # 'strict-origin-when-cross-origin' = send origin only for cross-origin requests
    REFERRER_POLICY = "strict-origin-when-cross-origin"

    # Permissions-Policy (formerly Feature-Policy)
    # Controls which browser features can be used
    # Disables geolocation, microphone, camera for security
    PERMISSIONS_POLICY = "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"

    # Cross-Origin-Opener-Policy (COOP)
    # Isolates window context from cross-origin windows
    CROSS_ORIGIN_OPENER_POLICY = "same-origin"

    # Cross-Origin-Resource-Policy (CORP)
    # Controls if resource can be requested from cross-origin contexts
    CROSS_ORIGIN_RESOURCE_POLICY = "same-origin"


class CORSConfig:
    """CORS (Cross-Origin Resource Sharing) Configuration.

    CORS settings control which origins can access the API, what methods they
    can use, and which headers they can send. This configuration is restrictive
    by default and should be extended carefully for production needs.
    """

    # Allowed HTTP methods for cross-origin requests
    # Only essential methods for the marketplace API
    METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]

    # Allowed request headers from cross-origin requests
    # Restrictive whitelist of headers the frontend can send
    ALLOW_HEADERS = [
        "Content-Type",           # Standard content negotiation
        "Authorization",          # JWT authentication
        "X-Requested-With",       # AJAX identification
        "X-CSRF-Token",          # CSRF protection (if implemented)
        "Accept",                 # Content format preference
        "Accept-Language",        # Language preference
        "Origin",                 # Required for CORS validation
    ]

    # Response headers exposed to cross-origin requests
    # Frontend JavaScript can only read these specific response headers
    EXPOSE_HEADERS = [
        "Content-Type",           # Response format
        "X-Total-Count",         # Pagination total count
        "X-Page-Number",         # Current page for pagination
        "X-Page-Size",           # Items per page
        "X-RateLimit-Limit",     # Rate limit maximum
        "X-RateLimit-Remaining", # Rate limit remaining
        "X-RateLimit-Reset",     # Rate limit reset time
    ]

    # Browser cache time for CORS preflight requests (seconds)
    # 3600 seconds = 1 hour (reduces preflight request overhead)
    MAX_AGE = 3600

    # Whether to include credentials (cookies, auth) in cross-origin requests
    # True = allows sending httpOnly cookies with cross-origin requests
    # Requires Access-Control-Allow-Credentials header and specific origins
    SUPPORTS_CREDENTIALS = True

    # CORS origins allowed (configured per environment in config.py)
    # Development: http://localhost:5000, http://localhost:3000, etc.
    # Production: specific domain(s) only
    # Configured via CORS_ORIGINS in Config class
    ORIGINS = None  # Will be set from Config.CORS_ORIGINS


class SessionConfig:
    """Session and Cookie Security Configuration."""

    # Session cookie lifetime
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    # Secure flag: only send cookie over HTTPS
    # Set to False in development, True in production
    COOKIE_SECURE = True

    # HttpOnly flag: prevent JavaScript from accessing the cookie
    # Protects against XSS attacks stealing session cookies
    COOKIE_HTTPONLY = True

    # SameSite attribute: prevent CSRF attacks
    # 'Lax' = send cookie for top-level navigations and same-site requests
    # 'Strict' = only send for same-site requests (can affect usability)
    # 'None' = always send (requires Secure flag, not recommended)
    COOKIE_SAMESITE = "Lax"

    # Cookie domain (empty = current domain only)
    # Important: do not set unless explicitly needed for subdomains
    COOKIE_DOMAIN = None


class SecurityConfig:
    """Master security configuration combining all security settings."""

    # Subconfigurations
    headers = SecurityHeaders
    cors = CORSConfig
    session = SessionConfig

    # File upload security
    MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB max file upload
    ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}

    # Rate limiting (for future implementation)
    # Requests per minute per IP
    RATE_LIMIT_DEFAULT = 100
    RATE_LIMIT_AUTH = 50  # Lower limit for auth endpoints
    RATE_LIMIT_UPLOAD = 10  # Very strict for uploads

    # Request timeout
    REQUEST_TIMEOUT = 30  # seconds

    # Password policy (for auth implementation)
    PASSWORD_MIN_LENGTH = 12
    PASSWORD_REQUIRE_UPPERCASE = True
    PASSWORD_REQUIRE_NUMBERS = True
    PASSWORD_REQUIRE_SPECIAL = True

    @staticmethod
    def get_cors_config(origins: list[str] | None = None) -> dict:
        """Get CORS configuration dictionary for Flask-CORS.

        Args:
            origins: List of allowed origins. If None, uses CORS_ORIGINS from config.

        Returns:
            Dictionary with CORS configuration for Flask-CORS.
        """
        if origins is None:
            origins = SecurityConfig.cors.ORIGINS or [
                "http://localhost:5000",
                "http://localhost:3000",
            ]

        return {
            "origins": origins,
            "methods": SecurityConfig.cors.METHODS,
            "allow_headers": SecurityConfig.cors.ALLOW_HEADERS,
            "expose_headers": SecurityConfig.cors.EXPOSE_HEADERS,
            "max_age": SecurityConfig.cors.MAX_AGE,
            "supports_credentials": SecurityConfig.cors.SUPPORTS_CREDENTIALS,
        }

    @staticmethod
    def get_security_headers() -> dict:
        """Get security headers dictionary for response.

        Returns:
            Dictionary of all security headers to add to responses.
        """
        return {
            "X-Content-Type-Options": SecurityConfig.headers.X_CONTENT_TYPE_OPTIONS,
            "X-Frame-Options": SecurityConfig.headers.X_FRAME_OPTIONS,
            "X-XSS-Protection": SecurityConfig.headers.X_XSS_PROTECTION,
            "Strict-Transport-Security": SecurityConfig.headers.STRICT_TRANSPORT_SECURITY,
            "Content-Security-Policy": SecurityConfig.headers.CONTENT_SECURITY_POLICY,
            "Referrer-Policy": SecurityConfig.headers.REFERRER_POLICY,
            "Permissions-Policy": SecurityConfig.headers.PERMISSIONS_POLICY,
            "Cross-Origin-Opener-Policy": SecurityConfig.headers.CROSS_ORIGIN_OPENER_POLICY,
            "Cross-Origin-Resource-Policy": SecurityConfig.headers.CROSS_ORIGIN_RESOURCE_POLICY,
        }
