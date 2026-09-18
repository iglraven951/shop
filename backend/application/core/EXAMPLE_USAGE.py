"""Example: Using core decorators and middleware in Flask routes.

This file demonstrates how to apply decorators and middleware in real routes.
Copy these patterns to your route files.
"""

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
from backend.models.user import User
from backend.exceptions import ValidationException

# Create a blueprint for products
products_bp = Blueprint('products', __name__, url_prefix='/api/products')


# ============================================================================
# EXAMPLE 1: Simple GET with pagination
# ============================================================================
@products_bp.route('', methods=['GET'])
@handle_errors
@paginate
def list_products():
    """Get all products with pagination.

    Query params:
        page: int (default: 1)
        per_page: int (default: 20, max: 100)

    Returns:
        JSON with products and pagination info
    """
    pagination = g.pagination

    # Get products from database
    products = Product.query.limit(
        pagination['per_page']
    ).offset(
        pagination['offset']
    ).all()

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


# ============================================================================
# EXAMPLE 2: GET single resource with authentication
# ============================================================================
@products_bp.route('/<product_id>', methods=['GET'])
@handle_errors
@token_required
def get_product(product_id):
    """Get a specific product.

    Requires: Valid JWT token

    Returns:
        JSON with product details
    """
    user_id = g.user_id

    product = Product.query.filter(Product.id == product_id).first()
    if not product:
        raise ValidationException("Product not found")

    return jsonify({'product': product.to_dict()})


# ============================================================================
# EXAMPLE 3: POST with JSON validation and seller role requirement
# ============================================================================
@products_bp.route('', methods=['POST'])
@handle_errors
@validate_json
@validate_request({
    'title': {
        'required': True,
        'type': str,
        'min_length': 1,
        'max_length': 255,
    },
    'description': {
        'required': False,
        'type': str,
        'max_length': 5000,
    },
    'price': {
        'required': True,
        'type': (int, float),
    },
    'stock': {
        'required': True,
        'type': int,
    },
    'category_id': {
        'required': True,
        'type': int,
    },
})
@token_required
@role_required('seller')
def create_product():
    """Create a new product.

    Requires:
        - Valid JWT token
        - Seller role

    Body:
        {
            "title": "Product Name",
            "description": "Optional description",
            "price": 29.99,
            "stock": 100,
            "category_id": 1
        }

    Returns:
        JSON with created product (201 Created)
    """
    data = request.get_json()
    seller_id = g.user_id

    product = Product(
        seller_id=seller_id,
        title=data['title'],
        description=data.get('description', ''),
        price=data['price'],
        stock=data['stock'],
        category_id=data['category_id'],
    )
    product.save()

    return jsonify({'product': product.to_dict()}), 201


# ============================================================================
# EXAMPLE 4: PUT with schema validation and ownership check
# ============================================================================
@products_bp.route('/<product_id>', methods=['PUT'])
@handle_errors
@validate_json
@validate_request({
    'title': {
        'required': False,
        'type': str,
        'min_length': 1,
        'max_length': 255,
    },
    'price': {
        'required': False,
        'type': (int, float),
    },
    'stock': {
        'required': False,
        'type': int,
    },
})
@token_required
@role_required('seller')
def update_product(product_id):
    """Update a product.

    Requires:
        - Valid JWT token
        - Seller role
        - Own the product

    Returns:
        JSON with updated product
    """
    data = request.get_json()
    seller_id = g.user_id

    product = Product.query.filter(Product.id == product_id).first()
    if not product:
        raise ValidationException("Product not found")

    # Check ownership
    if product.seller_id != seller_id:
        raise ValidationException("You can only edit your own products")

    # Update fields
    if 'title' in data:
        product.title = data['title']
    if 'price' in data:
        product.price = data['price']
    if 'stock' in data:
        product.stock = data['stock']

    product.save()

    return jsonify({'product': product.to_dict()})


# ============================================================================
# EXAMPLE 5: DELETE with admin requirement
# ============================================================================
@products_bp.route('/<product_id>', methods=['DELETE'])
@handle_errors
@token_required
@role_required('admin')
def delete_product(product_id):
    """Delete a product (admin only).

    Requires:
        - Valid JWT token
        - Admin role

    Returns:
        Empty response (204 No Content)
    """
    product = Product.query.filter(Product.id == product_id).first()
    if not product:
        raise ValidationException("Product not found")

    product.delete()

    return '', 204


# ============================================================================
# EXAMPLE 6: Search with multiple query parameters
# ============================================================================
@products_bp.route('/search', methods=['GET'])
@handle_errors
@paginate
def search_products():
    """Search products with filters and pagination.

    Query params:
        q: str (search query)
        category_id: int (optional)
        min_price: float (optional)
        max_price: float (optional)
        page: int (default: 1)
        per_page: int (default: 20)

    Returns:
        JSON with matching products
    """
    pagination = g.pagination

    query = request.args.get('q', '').strip()
    category_id = request.args.get('category_id', type=int)
    min_price = request.args.get('min_price', type=float)
    max_price = request.args.get('max_price', type=float)

    # Start with base query
    base_query = Product.query

    # Apply filters
    if query:
        base_query = base_query.filter(Product.title.ilike(f'%{query}%'))
    if category_id:
        base_query = base_query.filter(Product.category_id == category_id)
    if min_price is not None:
        base_query = base_query.filter(Product.price >= min_price)
    if max_price is not None:
        base_query = base_query.filter(Product.price <= max_price)

    # Get total before pagination
    total = base_query.count()

    # Apply pagination
    products = base_query.limit(
        pagination['per_page']
    ).offset(
        pagination['offset']
    ).all()

    return jsonify({
        'products': [p.to_dict() for p in products],
        'pagination': {
            'page': pagination['page'],
            'per_page': pagination['per_page'],
            'total': total,
        },
        'query': {
            'search': query,
            'category_id': category_id,
            'price_range': [min_price, max_price],
        }
    })


# ============================================================================
# HOW TO USE THIS BLUEPRINT
# ============================================================================
# In your main app.py or routes/__init__.py:
#
# from backend.application.core.example_usage import products_bp
# app.register_blueprint(products_bp)
#
# ============================================================================
# API ENDPOINTS CREATED
# ============================================================================
# GET    /api/products                    - List all products (paginated)
# GET    /api/products/<id>               - Get single product (auth required)
# POST   /api/products                    - Create product (seller required)
# PUT    /api/products/<id>               - Update product (seller required)
# DELETE /api/products/<id>               - Delete product (admin required)
# GET    /api/products/search?q=...      - Search products (paginated)
#
# ============================================================================
# TESTING COMMANDS
# ============================================================================
#
# 1. List products (no auth):
#    curl http://localhost:5000/api/products?page=1&per_page=10
#
# 2. Get single product (requires token):
#    curl -H "Authorization: Bearer <TOKEN>" \
#         http://localhost:5000/api/products/1
#
# 3. Create product (requires seller token):
#    curl -X POST http://localhost:5000/api/products \
#         -H "Content-Type: application/json" \
#         -H "Authorization: Bearer <SELLER_TOKEN>" \
#         -d '{
#           "title": "Laptop",
#           "description": "High performance laptop",
#           "price": 999.99,
#           "stock": 10,
#           "category_id": 1
#         }'
#
# 4. Update product (requires seller token, must own product):
#    curl -X PUT http://localhost:5000/api/products/1 \
#         -H "Content-Type: application/json" \
#         -H "Authorization: Bearer <SELLER_TOKEN>" \
#         -d '{
#           "price": 899.99,
#           "stock": 5
#         }'
#
# 5. Delete product (requires admin token):
#    curl -X DELETE http://localhost:5000/api/products/1 \
#         -H "Authorization: Bearer <ADMIN_TOKEN>"
#
# 6. Search products:
#    curl "http://localhost:5000/api/products/search?q=laptop&page=1&per_page=20"
#
# ============================================================================
