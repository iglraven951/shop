"""Product marketplace routes (list, search, create, etc)."""

from flask import Blueprint, jsonify

# Create blueprint
products_bp = Blueprint('products', __name__)


@products_bp.route('/products/health', methods=['GET'])
def health():
    """Health check for products module."""
    return jsonify({"status": "ok", "module": "products"}), 200


# TODO: Implement product routes
# - GET /products - List products with pagination/filtering
# - GET /products/{id} - Get product details
# - POST /products - Create new product (seller)
# - PUT /products/{id} - Update product (seller)
# - DELETE /products/{id} - Delete product (seller)
# - GET /products/search - Search products with AI

__all__ = ["products_bp"]
