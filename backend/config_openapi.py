"""OpenAPI/Swagger configuration for DiscoveryShop Marketplace API."""

from flask import Flask
from flask_restx import Api, fields, Resource
from typing import Dict, Any

# Define API metadata
OPENAPI_SPEC = {
    "info": {
        "title": "DiscoveryShop Marketplace API",
        "version": "1.0.0",
        "description": "Professional API documentation for DiscoveryShop - Full-stack e-commerce marketplace platform.",
        "contact": {
            "name": "API Support",
            "email": "support@discoveryshop.local",
        },
        "license": {
            "name": "MIT",
        },
    },
    "servers": [
        {"url": "http://localhost:5000", "description": "Development Server"},
        {"url": "https://api.discoveryshop.com", "description": "Production Server"},
    ],
    "basePath": "/api/v1",
    "schemes": ["http", "https"],
    "consumes": ["application/json"],
    "produces": ["application/json"],
}

# Response models for documentation
ERROR_RESPONSE_MODEL = {
    "error": fields.String(description="Error message"),
    "code": fields.String(description="Error code"),
    "timestamp": fields.DateTime(description="Timestamp of error"),
}

# HTTP Status Codes and their meanings
HTTP_RESPONSES = {
    200: "Success - Request completed successfully",
    201: "Created - Resource created successfully",
    204: "No Content - Request successful but no content returned",
    400: "Bad Request - Invalid request parameters or body",
    401: "Unauthorized - Authentication required",
    403: "Forbidden - Access denied",
    404: "Not Found - Resource not found",
    409: "Conflict - Resource already exists or invalid state",
    422: "Unprocessable Entity - Validation error",
    500: "Internal Server Error - Server-side error occurred",
    503: "Service Unavailable - Service temporarily unavailable",
}


class ApiDocumentation:
    """Helper class for API documentation."""

    @staticmethod
    def get_endpoint_doc(
        method: str,
        path: str,
        summary: str,
        description: str,
        response_code: int = 200,
        request_body: bool = False,
        auth_required: bool = False,
    ) -> Dict[str, Any]:
        """Generate endpoint documentation.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE, etc.)
            path: API endpoint path
            summary: Short description of what endpoint does
            description: Detailed description of functionality
            response_code: Expected HTTP response code
            request_body: Whether endpoint accepts request body
            auth_required: Whether authentication is required

        Returns:
            Dictionary with endpoint documentation metadata
        """
        return {
            "method": method,
            "path": path,
            "summary": summary,
            "description": description,
            "response_code": response_code,
            "request_body": request_body,
            "auth_required": auth_required,
            "response_message": HTTP_RESPONSES.get(
                response_code, "Request processed"
            ),
        }


# API Endpoint Documentation Registry
API_ENDPOINTS = {
    "auth": {
        "register": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/auth/register",
            "Register new user",
            "Create a new user account with email, username, and password. "
            "Returns JWT token for authentication.",
            response_code=201,
            request_body=True,
        ),
        "login": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/auth/login",
            "User login",
            "Authenticate user with email/username and password. "
            "Returns JWT token valid for 24 hours.",
            response_code=200,
            request_body=True,
        ),
        "logout": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/auth/logout",
            "User logout",
            "Invalidate current JWT token and logout user.",
            response_code=200,
            auth_required=True,
        ),
        "refresh": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/auth/refresh",
            "Refresh JWT token",
            "Get a new JWT token using current valid token. "
            "Required every 24 hours.",
            response_code=200,
            auth_required=True,
        ),
        "verify": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/auth/verify",
            "Verify token",
            "Check if current JWT token is valid.",
            response_code=200,
            auth_required=True,
        ),
    },
    "users": {
        "get_profile": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/users/{user_id}",
            "Get user profile",
            "Retrieve detailed user profile with avatar, reputation, and statistics.",
            response_code=200,
        ),
        "update_profile": ApiDocumentation.get_endpoint_doc(
            "PUT",
            "/api/users/{user_id}",
            "Update user profile",
            "Update user profile information (name, bio, avatar, etc.)",
            response_code=200,
            request_body=True,
            auth_required=True,
        ),
        "get_current": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/users/me",
            "Get current user",
            "Retrieve authenticated user's profile and settings.",
            response_code=200,
            auth_required=True,
        ),
        "enable_seller": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/users/{user_id}/enable-seller",
            "Enable seller role",
            "Convert buyer account to seller account. "
            "User can then list and sell products.",
            response_code=200,
            request_body=True,
            auth_required=True,
        ),
    },
    "products": {
        "list": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/products",
            "List products",
            "Get paginated list of all products with optional filtering "
            "by category, price range, rating, and search query.",
            response_code=200,
        ),
        "create": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/products",
            "Create product",
            "Create new product listing as seller. "
            "Requires product details and at least one image.",
            response_code=201,
            request_body=True,
            auth_required=True,
        ),
        "get": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/products/{product_id}",
            "Get product details",
            "Retrieve detailed product information including images, "
            "reviews, ratings, and availability.",
            response_code=200,
        ),
        "update": ApiDocumentation.get_endpoint_doc(
            "PUT",
            "/api/products/{product_id}",
            "Update product",
            "Update product details. Only product owner can update.",
            response_code=200,
            request_body=True,
            auth_required=True,
        ),
        "delete": ApiDocumentation.get_endpoint_doc(
            "DELETE",
            "/api/products/{product_id}",
            "Delete product",
            "Delete product listing permanently. Only product owner can delete.",
            response_code=204,
            auth_required=True,
        ),
        "search": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/products/search",
            "Search products",
            "Full-text search for products with AI-powered recommendations "
            "and intelligent filtering.",
            response_code=200,
        ),
    },
    "cart": {
        "get": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/cart",
            "Get shopping cart",
            "Retrieve current user's shopping cart with items and total price.",
            response_code=200,
            auth_required=True,
        ),
        "add_item": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/cart/items",
            "Add item to cart",
            "Add product to shopping cart or update quantity if already exists.",
            response_code=201,
            request_body=True,
            auth_required=True,
        ),
        "remove_item": ApiDocumentation.get_endpoint_doc(
            "DELETE",
            "/api/cart/items/{item_id}",
            "Remove item from cart",
            "Remove product from shopping cart.",
            response_code=204,
            auth_required=True,
        ),
        "update_item": ApiDocumentation.get_endpoint_doc(
            "PUT",
            "/api/cart/items/{item_id}",
            "Update cart item quantity",
            "Modify quantity of product in shopping cart.",
            response_code=200,
            request_body=True,
            auth_required=True,
        ),
    },
    "orders": {
        "list": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/orders",
            "List user orders",
            "Get all orders placed by current user with pagination and filtering.",
            response_code=200,
            auth_required=True,
        ),
        "create": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/orders",
            "Create order",
            "Create new order from current shopping cart. "
            "Triggers payment processing.",
            response_code=201,
            request_body=True,
            auth_required=True,
        ),
        "get": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/orders/{order_id}",
            "Get order details",
            "Retrieve detailed order information with items, status, and tracking.",
            response_code=200,
            auth_required=True,
        ),
        "cancel": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/orders/{order_id}/cancel",
            "Cancel order",
            "Cancel pending order and refund to user. "
            "Can only cancel orders not yet shipped.",
            response_code=200,
            auth_required=True,
        ),
    },
    "chat": {
        "list_conversations": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/chat/conversations",
            "List conversations",
            "Get all conversations with buyers/sellers.",
            response_code=200,
            auth_required=True,
        ),
        "send_message": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/chat/messages",
            "Send message",
            "Send real-time message in conversation. Uses WebSocket for live updates.",
            response_code=201,
            request_body=True,
            auth_required=True,
        ),
        "get_messages": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/chat/conversations/{conversation_id}/messages",
            "Get conversation messages",
            "Retrieve all messages in a conversation with pagination.",
            response_code=200,
            auth_required=True,
        ),
    },
    "chatbot": {
        "chat": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/chatbot/chat",
            "Chat with AI assistant",
            "Send message to Claude-powered AI marketplace assistant. "
            "Get intelligent product recommendations, seller connections, and support.",
            response_code=200,
            request_body=True,
            auth_required=False,
        ),
        "get_session": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/chatbot/sessions/{session_id}",
            "Get chat session",
            "Retrieve chat session history and context.",
            response_code=200,
        ),
    },
    "admin": {
        "dashboard": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/admin/dashboard",
            "Admin dashboard",
            "Get marketplace statistics and analytics. Requires admin role.",
            response_code=200,
            auth_required=True,
        ),
        "approve_product": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/admin/products/{product_id}/approve",
            "Approve product",
            "Approve pending product for listing. Requires admin role.",
            response_code=200,
            auth_required=True,
        ),
        "reject_product": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/admin/products/{product_id}/reject",
            "Reject product",
            "Reject pending product with reason. Requires admin role.",
            response_code=200,
            request_body=True,
            auth_required=True,
        ),
        "list_users": ApiDocumentation.get_endpoint_doc(
            "GET",
            "/api/admin/users",
            "List all users",
            "Get all marketplace users with pagination and filtering. "
            "Requires admin role.",
            response_code=200,
            auth_required=True,
        ),
        "suspend_user": ApiDocumentation.get_endpoint_doc(
            "POST",
            "/api/admin/users/{user_id}/suspend",
            "Suspend user",
            "Suspend user account. Requires admin role.",
            response_code=200,
            auth_required=True,
        ),
    },
}


class OpenAPIConfig:
    """Configuration class for OpenAPI/Swagger documentation."""

    @staticmethod
    def configure_api(app: Flask) -> Api:
        """Configure Flask-RESTX API with OpenAPI documentation.

        Args:
            app: Flask application instance

        Returns:
            Configured Api instance with documentation
        """
        # Create API with documentation
        api = Api(
            app,
            version="1.0.0",
            title="DiscoveryShop Marketplace API",
            description="Professional API documentation for DiscoveryShop - "
            "Full-stack e-commerce marketplace platform with AI-powered discovery, "
            "dual-role accounts, real-time chat, and comprehensive admin controls.",
            doc="/api/docs",  # Swagger UI documentation
            prefix="/api/v1",  # API version prefix
        )

        # Add service namespaces with documentation
        api.add_namespace(
            create_auth_namespace(),
            path="/auth",
            description="User authentication and authorization endpoints",
        )

        api.add_namespace(
            create_users_namespace(),
            path="/users",
            description="User profile and account management endpoints",
        )

        api.add_namespace(
            create_products_namespace(),
            path="/products",
            description="Product listing and search endpoints",
        )

        api.add_namespace(
            create_cart_namespace(),
            path="/cart",
            description="Shopping cart management endpoints",
        )

        api.add_namespace(
            create_orders_namespace(),
            path="/orders",
            description="Order creation and management endpoints",
        )

        api.add_namespace(
            create_chat_namespace(),
            path="/chat",
            description="Real-time chat and messaging endpoints",
        )

        api.add_namespace(
            create_chatbot_namespace(),
            path="/chatbot",
            description="AI chatbot assistant endpoints",
        )

        api.add_namespace(
            create_admin_namespace(),
            path="/admin",
            description="Admin dashboard and moderation endpoints",
        )

        return api


def create_auth_namespace():
    """Create authentication namespace with documentation."""
    from flask_restx import Namespace

    ns = Namespace("auth", description="Authentication and authorization")

    @ns.route("/register")
    class Register(Resource):
        """User registration endpoint."""

        @ns.doc(
            "register",
            responses={
                201: "User registered successfully",
                400: "Invalid input data",
                409: "Email already registered",
            },
        )
        @ns.expect(
            ns.model(
                "RegisterRequest",
                {
                    "email": fields.String(
                        required=True, description="User email address"
                    ),
                    "username": fields.String(
                        required=True, description="Username (3-30 alphanumeric)"
                    ),
                    "password": fields.String(
                        required=True, description="Password (min 8 chars)"
                    ),
                },
            )
        )
        def post(self):
            """Register new user account."""
            pass

    @ns.route("/login")
    class Login(Resource):
        """User login endpoint."""

        @ns.doc(
            "login",
            responses={
                200: "Login successful",
                400: "Invalid credentials",
                401: "Unauthorized",
            },
        )
        @ns.expect(
            ns.model(
                "LoginRequest",
                {
                    "email": fields.String(required=True, description="Email or username"),
                    "password": fields.String(required=True, description="User password"),
                },
            )
        )
        def post(self):
            """Authenticate user with credentials."""
            pass

    @ns.route("/refresh")
    class Refresh(Resource):
        """Token refresh endpoint."""

        @ns.doc(
            "refresh",
            responses={200: "Token refreshed successfully", 401: "Unauthorized"},
        )
        def post(self):
            """Refresh JWT token."""
            pass

    return ns


def create_users_namespace():
    """Create users namespace with documentation."""
    from flask_restx import Namespace

    ns = Namespace("users", description="User management")

    @ns.route("/<int:user_id>")
    class UserProfile(Resource):
        """User profile endpoint."""

        @ns.doc(
            "get_user",
            responses={200: "User profile retrieved", 404: "User not found"},
        )
        def get(self, user_id):
            """Get user profile."""
            pass

        @ns.doc(
            "update_user",
            responses={200: "Profile updated", 401: "Unauthorized", 404: "User not found"},
        )
        def put(self, user_id):
            """Update user profile."""
            pass

    @ns.route("/<int:user_id>/seller-profile")
    class SellerProfile(Resource):
        """Seller profile endpoint."""

        @ns.doc("get_seller", responses={200: "Seller profile retrieved"})
        def get(self, user_id):
            """Get seller profile."""
            pass

    return ns


def create_products_namespace():
    """Create products namespace with documentation."""
    from flask_restx import Namespace

    ns = Namespace("products", description="Product management")

    @ns.route("/")
    class ProductList(Resource):
        """Product list endpoint."""

        @ns.doc(
            "list_products",
            responses={200: "Products retrieved"},
            params={
                "category": "Filter by category",
                "min_price": "Minimum price filter",
                "max_price": "Maximum price filter",
                "page": "Page number (default: 1)",
                "per_page": "Items per page (default: 20)",
            },
        )
        def get(self):
            """Get paginated product list with filters."""
            pass

        @ns.doc(
            "create_product",
            responses={201: "Product created", 400: "Invalid input", 401: "Unauthorized"},
        )
        def post(self):
            """Create new product listing."""
            pass

    @ns.route("/<int:product_id>")
    class Product(Resource):
        """Single product endpoint."""

        @ns.doc("get_product", responses={200: "Product retrieved", 404: "Not found"})
        def get(self, product_id):
            """Get product details."""
            pass

        @ns.doc(
            "update_product",
            responses={200: "Product updated", 401: "Unauthorized"},
        )
        def put(self, product_id):
            """Update product details."""
            pass

        @ns.doc(
            "delete_product",
            responses={204: "Product deleted", 401: "Unauthorized"},
        )
        def delete(self, product_id):
            """Delete product listing."""
            pass

    @ns.route("/search")
    class Search(Resource):
        """Product search endpoint."""

        @ns.doc(
            "search_products",
            responses={200: "Search results retrieved"},
            params={
                "q": "Search query",
                "category": "Filter by category",
                "min_price": "Minimum price",
                "max_price": "Maximum price",
            },
        )
        def get(self):
            """Search products with AI recommendations."""
            pass

    return ns


def create_cart_namespace():
    """Create cart namespace with documentation."""
    from flask_restx import Namespace

    ns = Namespace("cart", description="Shopping cart management")

    @ns.route("/")
    class CartResource(Resource):
        """Shopping cart endpoint."""

        @ns.doc("get_cart", responses={200: "Cart retrieved", 401: "Unauthorized"})
        def get(self):
            """Get current shopping cart."""
            pass

    @ns.route("/items")
    class CartItem(Resource):
        """Cart item endpoint."""

        @ns.doc(
            "add_item",
            responses={201: "Item added", 400: "Invalid input", 401: "Unauthorized"},
        )
        def post(self):
            """Add item to cart."""
            pass

    @ns.route("/items/<int:item_id>")
    class CartItemUpdate(Resource):
        """Update cart item endpoint."""

        @ns.doc(
            "update_item",
            responses={200: "Item updated", 401: "Unauthorized"},
        )
        def put(self, item_id):
            """Update cart item quantity."""
            pass

        @ns.doc(
            "remove_item",
            responses={204: "Item removed", 401: "Unauthorized"},
        )
        def delete(self, item_id):
            """Remove item from cart."""
            pass

    return ns


def create_orders_namespace():
    """Create orders namespace with documentation."""
    from flask_restx import Namespace

    ns = Namespace("orders", description="Order management")

    @ns.route("/")
    class OrderList(Resource):
        """Orders list endpoint."""

        @ns.doc(
            "list_orders",
            responses={200: "Orders retrieved", 401: "Unauthorized"},
            params={
                "status": "Filter by status",
                "page": "Page number",
            },
        )
        def get(self):
            """Get user's orders."""
            pass

        @ns.doc(
            "create_order",
            responses={201: "Order created", 400: "Invalid input", 401: "Unauthorized"},
        )
        def post(self):
            """Create new order from cart."""
            pass

    @ns.route("/<int:order_id>")
    class Order(Resource):
        """Single order endpoint."""

        @ns.doc(
            "get_order",
            responses={200: "Order retrieved", 401: "Unauthorized", 404: "Not found"},
        )
        def get(self, order_id):
            """Get order details."""
            pass

        @ns.doc(
            "cancel_order",
            responses={200: "Order cancelled", 401: "Unauthorized"},
        )
        def delete(self, order_id):
            """Cancel order."""
            pass

    return ns


def create_chat_namespace():
    """Create chat namespace with documentation."""
    from flask_restx import Namespace

    ns = Namespace("chat", description="Real-time chat")

    @ns.route("/conversations")
    class Conversations(Resource):
        """Chat conversations endpoint."""

        @ns.doc(
            "list_conversations",
            responses={200: "Conversations retrieved", 401: "Unauthorized"},
        )
        def get(self):
            """Get user's conversations."""
            pass

    @ns.route("/messages")
    class Messages(Resource):
        """Chat messages endpoint."""

        @ns.doc(
            "send_message",
            responses={201: "Message sent", 400: "Invalid input", 401: "Unauthorized"},
        )
        def post(self):
            """Send chat message."""
            pass

    @ns.route("/conversations/<int:conversation_id>/messages")
    class ConversationMessages(Resource):
        """Conversation messages endpoint."""

        @ns.doc(
            "get_messages",
            responses={200: "Messages retrieved", 401: "Unauthorized"},
        )
        def get(self, conversation_id):
            """Get conversation messages."""
            pass

    return ns


def create_chatbot_namespace():
    """Create chatbot namespace with documentation."""
    from flask_restx import Namespace

    ns = Namespace("chatbot", description="AI chatbot assistant")

    @ns.route("/chat")
    class ChatbotChat(Resource):
        """Chatbot chat endpoint."""

        @ns.doc(
            "chat_message",
            responses={
                200: "Response generated",
                400: "Invalid input",
                503: "Service unavailable",
            },
        )
        def post(self):
            """Send message to AI assistant."""
            pass

    @ns.route("/sessions/<string:session_id>")
    class ChatbotSession(Resource):
        """Chatbot session endpoint."""

        @ns.doc("get_session", responses={200: "Session retrieved", 404: "Not found"})
        def get(self, session_id):
            """Get chat session."""
            pass

    return ns


def create_admin_namespace():
    """Create admin namespace with documentation."""
    from flask_restx import Namespace

    ns = Namespace("admin", description="Admin dashboard")

    @ns.route("/dashboard")
    class Dashboard(Resource):
        """Admin dashboard endpoint."""

        @ns.doc(
            "dashboard",
            responses={200: "Dashboard data retrieved", 401: "Unauthorized"},
        )
        def get(self):
            """Get admin dashboard statistics."""
            pass

    @ns.route("/products/<int:product_id>/approve")
    class ApproveProduct(Resource):
        """Approve product endpoint."""

        @ns.doc(
            "approve_product",
            responses={200: "Product approved", 401: "Unauthorized"},
        )
        def post(self, product_id):
            """Approve product listing."""
            pass

    @ns.route("/products/<int:product_id>/reject")
    class RejectProduct(Resource):
        """Reject product endpoint."""

        @ns.doc(
            "reject_product",
            responses={200: "Product rejected", 401: "Unauthorized"},
        )
        def post(self, product_id):
            """Reject product listing."""
            pass

    @ns.route("/users")
    class UsersList(Resource):
        """Users list endpoint."""

        @ns.doc(
            "list_users",
            responses={200: "Users retrieved", 401: "Unauthorized"},
        )
        def get(self):
            """Get all users."""
            pass

    @ns.route("/users/<int:user_id>/suspend")
    class SuspendUser(Resource):
        """Suspend user endpoint."""

        @ns.doc(
            "suspend_user",
            responses={200: "User suspended", 401: "Unauthorized"},
        )
        def post(self, user_id):
            """Suspend user account."""
            pass

    return ns
