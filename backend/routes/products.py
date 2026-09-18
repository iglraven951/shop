"""Product marketplace routes (list, search, create, detail, reviews, etc)."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List, Dict, Any
from functools import wraps

from flask import Blueprint, request, jsonify, g, current_app
from sqlalchemy import and_, or_, func, desc, asc
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.product import Product, Category, ProductImage, ProductStatus
from backend.models.social import Review
from backend.models.user import User
from backend.auth import verify_jwt_token

# Create blueprint
products_bp = Blueprint('products', __name__, url_prefix='/api/products')


# ============================================================================
# Decorators
# ============================================================================

def require_auth(f):
    """Decorator to require JWT authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Se requiere autenticación"}), 401

        token = auth_header.split(" ")[1]
        payload = verify_jwt_token(token)
        if not payload:
            return jsonify({"error": "Token inválido o expirado"}), 401

        g.user_id = payload.get("user_id")
        return f(*args, **kwargs)

    return decorated_function


def require_seller(f):
    """Decorator to require seller status."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, 'user_id') or not g.user_id:
            return jsonify({"error": "Se requiere autenticación"}), 401

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == g.user_id).first()
            if not user or not user.is_seller:
                db.close()
                return jsonify({"error": "Se requiere ser vendedor"}), 403
            g.user = user
            return f(*args, **kwargs)
        finally:
            db.close()

    return decorated_function


# ============================================================================
# Response Serializers
# ============================================================================

def serialize_product(product: Product, include_reviews: bool = False) -> Dict[str, Any]:
    """Serialize a Product model to JSON."""
    # Get primary image
    primary_image = None
    if product.images:
        for img in product.images:
            if img.is_primary:
                primary_image = img.image_url
                break
        if not primary_image:
            primary_image = product.images[0].image_url

    # Calculate average rating
    avg_rating = 0.0
    review_count = 0
    if product.reviews:
        ratings = [r.rating for r in product.reviews]
        if ratings:
            avg_rating = round(sum(ratings) / len(ratings), 1)
            review_count = len(ratings)

    # Parse location string into city and country
    location_obj = {"city": "Arequipa", "country": "Perú"}
    if product.location:
        parts = product.location.split(",")
        if len(parts) == 2:
            location_obj = {"city": parts[0].strip(), "country": parts[1].strip()}

    result = {
        "id": product.id,
        "title": product.title,
        "description": product.description,
        "price": float(product.price),
        "original_price": float(product.original_price) if product.original_price else None,
        "stock": product.stock,
        "sold_count": product.sold_count,
        "status": product.status,
        "location": location_obj,
        "image_url": primary_image,
        "images": [
            {
                "id": img.id,
                "url": img.image_url,
                "order": img.order,
                "is_primary": img.is_primary
            }
            for img in sorted(product.images, key=lambda x: x.order)
        ] if product.images else [],
        "seller": {
            "id": product.seller_id,
            "username": product.seller.username if product.seller else None,
            "avatar_url": product.seller.profile.avatar_url if product.seller and product.seller.profile else None
        } if product.seller else None,
        "category": {
            "id": product.category_id,
            "name": product.category.name if product.category else None
        } if product.category else None,
        "rating": avg_rating,
        "review_count": review_count,
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if product.updated_at else None
    }

    if include_reviews and product.reviews:
        result["reviews"] = [
            {
                "id": r.id,
                "rating": r.rating,
                "comment": r.comment,
                "reviewer": {
                    "id": r.reviewer_id,
                    "username": r.reviewer.username if r.reviewer else None
                },
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in sorted(product.reviews, key=lambda x: x.created_at, reverse=True)
        ]

    return result


def serialize_category(category: Category) -> Dict[str, Any]:
    """Serialize a Category model to JSON."""
    return {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "icon_url": category.icon_url,
        "parent_category_id": category.parent_category_id,
        "created_at": category.created_at.isoformat() if category.created_at else None
    }


def serialize_review(review: Review) -> Dict[str, Any]:
    """Serialize a Review model to JSON."""
    return {
        "id": review.id,
        "product_id": review.product_id,
        "rating": review.rating,
        "comment": review.comment,
        "reviewer": {
            "id": review.reviewer_id,
            "username": review.reviewer.username if review.reviewer else None,
            "avatar_url": review.reviewer.profile.avatar_url if review.reviewer and review.reviewer.profile else None
        } if review.reviewer else None,
        "created_at": review.created_at.isoformat() if review.created_at else None,
        "updated_at": review.updated_at.isoformat() if review.updated_at else None
    }


# ============================================================================
# API ENDPOINTS - 9 Endpoints Completos
# ============================================================================

# 1. GET /api/products - List products with pagination and filtering
@products_bp.route('', methods=['GET'])
def list_products():
    """
    GET /api/products - List products with pagination and filtering

    Query parameters:
        - page (int, default=1): Page number for pagination
        - limit (int, default=12, max=100): Items per page
        - category (str): Filter by category ID or slug
        - search (str): Search in title and description
        - sort (str, default='newest'): Sort option (newest, oldest, price_asc, price_desc, rating)
        - status (str): Filter by product status (approved, pending, etc)
        - min_price (float): Minimum price filter
        - max_price (float): Maximum price filter

    Returns: JSON with paginated products list
    """
    db = SessionLocal()
    try:
        # Get pagination parameters
        page = max(1, request.args.get('page', 1, type=int))
        limit = min(100, max(1, request.args.get('limit', 12, type=int)))
        offset = (page - 1) * limit

        # Start query - only approved products by default
        query = db.query(Product).filter(Product.status == "approved")

        # Search filter
        search_query = request.args.get('search', '').strip()
        if search_query:
            search_pattern = f"%{search_query}%"
            query = query.filter(
                or_(
                    Product.title.ilike(search_pattern),
                    Product.description.ilike(search_pattern)
                )
            )

        # Category filter
        category_filter = request.args.get('category', '').strip()
        if category_filter:
            category = db.query(Category).filter(
                or_(
                    Category.id == category_filter,
                    Category.slug == category_filter
                )
            ).first()
            if category:
                query = query.filter(Product.category_id == category.id)

        # Price range filter
        min_price = request.args.get('min_price', type=float)
        if min_price is not None:
            query = query.filter(Product.price >= min_price)

        max_price = request.args.get('max_price', type=float)
        if max_price is not None:
            query = query.filter(Product.price <= max_price)

        # Status filter (optional, for admin)
        status_filter = request.args.get('status', '').strip()
        if status_filter in [s.value for s in ProductStatus]:
            query = query.filter(Product.status == status_filter)

        # Sorting
        sort_option = request.args.get('sort', 'newest').lower()
        if sort_option == 'newest':
            query = query.order_by(desc(Product.created_at))
        elif sort_option == 'oldest':
            query = query.order_by(asc(Product.created_at))
        elif sort_option == 'price_asc':
            query = query.order_by(asc(Product.price))
        elif sort_option == 'price_desc':
            query = query.order_by(desc(Product.price))
        elif sort_option == 'rating':
            # TODO: Implement rating-based sorting with subquery
            query = query.order_by(desc(Product.created_at))
        else:
            query = query.order_by(desc(Product.created_at))

        # Get total count before pagination
        total = query.count()

        # Apply pagination
        products = query.offset(offset).limit(limit).all()

        return jsonify({
            "success": True,
            "data": {
                "products": [serialize_product(p) for p in products],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "pages": (total + limit - 1) // limit
                }
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error listing products: {e}")
        return jsonify({"error": "Error al listar productos"}), 500
    finally:
        db.close()


# 2. GET /api/products/<id> - Get product detail
@products_bp.route('/<product_id>', methods=['GET'])
def get_product_detail(product_id: str):
    """
    GET /api/products/{id} - Get detailed product information

    Returns: JSON with full product details including reviews
    """
    db = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return jsonify({"error": "Producto no encontrado"}), 404

        return jsonify({
            "success": True,
            "data": serialize_product(product, include_reviews=True)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting product detail: {e}")
        return jsonify({"error": "Error al obtener detalles del producto"}), 500
    finally:
        db.close()


# 3. POST /api/products - Create new product (seller only)
@products_bp.route('', methods=['POST'])
@require_auth
@require_seller
def create_product():
    """
    POST /api/products - Create a new product (requires seller role)

    Request body JSON:
    {
        "title": "Product Name",
        "description": "Detailed description",
        "price": 99.99,
        "original_price": 149.99,  // optional
        "category_id": "category-uuid",
        "stock": 10,
        "location": "Arequipa, Perú",
        "images": [
            {
                "url": "https://example.com/image1.jpg",
                "is_primary": true,
                "order": 0
            }
        ]
    }

    Returns: JSON with created product
    """
    db = SessionLocal()
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Cuerpo de solicitud requerido"}), 400

        # Validate required fields
        required_fields = ['title', 'description', 'price', 'stock']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Campo requerido: {field}"}), 400

        # Validate title
        if not isinstance(data['title'], str) or len(data['title']) < 5:
            return jsonify({"error": "El título debe tener al menos 5 caracteres"}), 400

        if len(data['title']) > 255:
            return jsonify({"error": "El título no debe exceder 255 caracteres"}), 400

        # Validate price
        try:
            price = Decimal(str(data['price']))
            if price <= 0:
                return jsonify({"error": "El precio debe ser mayor a 0"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Precio inválido"}), 400

        # Validate stock
        try:
            stock = int(data['stock'])
            if stock < 0:
                return jsonify({"error": "El stock no puede ser negativo"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Stock inválido"}), 400

        # Validate category if provided
        category_id = data.get('category_id')
        if category_id:
            category = db.query(Category).filter(Category.id == category_id).first()
            if not category:
                return jsonify({"error": "Categoría no encontrada"}), 404
        else:
            category_id = None

        # Create product
        product = Product(
            seller_id=g.user_id,
            category_id=category_id,
            title=data['title'].strip(),
            description=data['description'].strip(),
            price=price,
            original_price=Decimal(str(data['original_price'])) if data.get('original_price') else None,
            stock=stock,
            location=data.get('location', '').strip() or None,
            status="pending",  # Requires admin approval
            approval_required=True
        )

        db.add(product)
        db.flush()  # Flush to get the product ID

        # Add images if provided
        images_data = data.get('images', [])
        if images_data:
            for idx, img_data in enumerate(images_data):
                if isinstance(img_data, dict) and 'url' in img_data:
                    product_image = ProductImage(
                        product_id=product.id,
                        image_url=img_data['url'],
                        order=img_data.get('order', idx),
                        is_primary=img_data.get('is_primary', idx == 0)
                    )
                    db.add(product_image)

        db.commit()

        current_app.logger.info(f"Product created: {product.id} by seller {g.user_id}")

        return jsonify({
            "success": True,
            "message": "Producto creado exitosamente. Espera aprobación del administrador.",
            "data": serialize_product(product)
        }), 201

    except Exception as e:
        db.rollback()
        current_app.logger.error(f"Error creating product: {e}")
        return jsonify({"error": "Error al crear el producto"}), 500
    finally:
        db.close()


# 4. PUT /api/products/<id> - Update product (seller only)
@products_bp.route('/<product_id>', methods=['PUT'])
@require_auth
@require_seller
def update_product(product_id: str):
    """
    PUT /api/products/{id} - Update product (seller only)

    Only the product owner can update. Can update:
    - title, description, price, stock, location

    Returns: JSON with updated product
    """
    db = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return jsonify({"error": "Producto no encontrado"}), 404

        # Check ownership
        if product.seller_id != g.user_id:
            return jsonify({"error": "No tienes permiso para editar este producto"}), 403

        data = request.get_json()
        if not data:
            return jsonify({"error": "Cuerpo de solicitud requerido"}), 400

        # Update allowed fields
        if 'title' in data:
            title = data['title'].strip()
            if len(title) < 5:
                return jsonify({"error": "El título debe tener al menos 5 caracteres"}), 400
            if len(title) > 255:
                return jsonify({"error": "El título no debe exceder 255 caracteres"}), 400
            product.title = title

        if 'description' in data:
            product.description = data['description'].strip()

        if 'price' in data:
            try:
                price = Decimal(str(data['price']))
                if price <= 0:
                    return jsonify({"error": "El precio debe ser mayor a 0"}), 400
                product.price = price
            except (ValueError, TypeError):
                return jsonify({"error": "Precio inválido"}), 400

        if 'stock' in data:
            try:
                stock = int(data['stock'])
                if stock < 0:
                    return jsonify({"error": "El stock no puede ser negativo"}), 400
                product.stock = stock
            except (ValueError, TypeError):
                return jsonify({"error": "Stock inválido"}), 400

        if 'location' in data:
            product.location = data['location'].strip() or None

        product.updated_at = datetime.now(timezone.utc)
        db.commit()

        current_app.logger.info(f"Product updated: {product_id}")

        return jsonify({
            "success": True,
            "message": "Producto actualizado exitosamente",
            "data": serialize_product(product)
        }), 200

    except Exception as e:
        db.rollback()
        current_app.logger.error(f"Error updating product: {e}")
        return jsonify({"error": "Error al actualizar el producto"}), 500
    finally:
        db.close()


# 5. DELETE /api/products/<id> - Delete product (seller only)
@products_bp.route('/<product_id>', methods=['DELETE'])
@require_auth
@require_seller
def delete_product(product_id: str):
    """
    DELETE /api/products/{id} - Delete product (seller only)

    Only the product owner can delete their products.

    Returns: JSON with success message
    """
    db = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return jsonify({"error": "Producto no encontrado"}), 404

        # Check ownership
        if product.seller_id != g.user_id:
            return jsonify({"error": "No tienes permiso para eliminar este producto"}), 403

        db.delete(product)
        db.commit()

        current_app.logger.info(f"Product deleted: {product_id}")

        return jsonify({
            "success": True,
            "message": "Producto eliminado exitosamente"
        }), 200

    except Exception as e:
        db.rollback()
        current_app.logger.error(f"Error deleting product: {e}")
        return jsonify({"error": "Error al eliminar el producto"}), 500
    finally:
        db.close()


# 6. GET /api/products/categories - List categories
@products_bp.route('/categories', methods=['GET'])
def list_categories():
    """
    GET /api/products/categories - List all product categories

    Returns: JSON with categories list
    """
    db = SessionLocal()
    try:
        categories = db.query(Category).order_by(Category.name).all()

        return jsonify({
            "success": True,
            "data": [serialize_category(c) for c in categories]
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error listing categories: {e}")
        return jsonify({"error": "Error al listar categorías"}), 500
    finally:
        db.close()


# 7. GET /api/products/search - Advanced search
@products_bp.route('/search', methods=['GET'])
def search_products():
    """
    GET /api/products/search - Advanced product search

    Query parameters:
        - query (str): Search query
        - min_price (float): Minimum price
        - max_price (float): Maximum price
        - category (str): Category ID or slug
        - page (int): Page number
        - limit (int): Items per page

    Returns: JSON with search results
    """
    db = SessionLocal()
    try:
        query_str = request.args.get('query', '').strip()
        if not query_str:
            return jsonify({"error": "Se requiere un término de búsqueda"}), 400

        # Use the main list_products logic with search
        page = max(1, request.args.get('page', 1, type=int))
        limit = min(100, max(1, request.args.get('limit', 20, type=int)))
        offset = (page - 1) * limit

        # Build query
        query = db.query(Product).filter(Product.status == "approved")

        # Full-text search
        search_pattern = f"%{query_str}%"
        query = query.filter(
            or_(
                Product.title.ilike(search_pattern),
                Product.description.ilike(search_pattern)
            )
        )

        # Price filters
        min_price = request.args.get('min_price', type=float)
        if min_price is not None:
            query = query.filter(Product.price >= min_price)

        max_price = request.args.get('max_price', type=float)
        if max_price is not None:
            query = query.filter(Product.price <= max_price)

        # Category filter
        category_filter = request.args.get('category', '').strip()
        if category_filter:
            category = db.query(Category).filter(
                or_(
                    Category.id == category_filter,
                    Category.slug == category_filter
                )
            ).first()
            if category:
                query = query.filter(Product.category_id == category.id)

        # Count and paginate
        total = query.count()
        query = query.order_by(desc(Product.created_at))
        products = query.offset(offset).limit(limit).all()

        return jsonify({
            "success": True,
            "data": {
                "query": query_str,
                "products": [serialize_product(p) for p in products],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "pages": (total + limit - 1) // limit
                }
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error searching products: {e}")
        return jsonify({"error": "Error al buscar productos"}), 500
    finally:
        db.close()


# 8. GET /api/products/<id>/reviews - Get product reviews
@products_bp.route('/<product_id>/reviews', methods=['GET'])
def get_product_reviews(product_id: str):
    """
    GET /api/products/{id}/reviews - Get reviews for a product

    Query parameters:
        - page (int): Page number
        - limit (int): Items per page
        - sort (str): Sort option (newest, oldest, highest, lowest)

    Returns: JSON with reviews list
    """
    db = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return jsonify({"error": "Producto no encontrado"}), 404

        # Get pagination parameters
        page = max(1, request.args.get('page', 1, type=int))
        limit = min(50, max(1, request.args.get('limit', 10, type=int)))
        offset = (page - 1) * limit

        # Get sort option
        sort_option = request.args.get('sort', 'newest').lower()

        # Build query
        query = db.query(Review).filter(Review.product_id == product_id)

        # Apply sorting
        if sort_option == 'newest':
            query = query.order_by(desc(Review.created_at))
        elif sort_option == 'oldest':
            query = query.order_by(asc(Review.created_at))
        elif sort_option == 'highest':
            query = query.order_by(desc(Review.rating))
        elif sort_option == 'lowest':
            query = query.order_by(asc(Review.rating))
        else:
            query = query.order_by(desc(Review.created_at))

        # Count and paginate
        total = query.count()
        reviews = query.offset(offset).limit(limit).all()

        return jsonify({
            "success": True,
            "data": {
                "reviews": [serialize_review(r) for r in reviews],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "pages": (total + limit - 1) // limit
                }
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting product reviews: {e}")
        return jsonify({"error": "Error al obtener reseñas"}), 500
    finally:
        db.close()


# 9. POST /api/products/<id>/reviews - Create review
@products_bp.route('/<product_id>/reviews', methods=['POST'])
@require_auth
def create_product_review(product_id: str):
    """
    POST /api/products/{id}/reviews - Create a review for a product

    Request body JSON:
    {
        "rating": 5,  // 1-5
        "comment": "Great product!",  // optional
        "title": "Excellent"  // optional
    }

    Returns: JSON with created review
    """
    db = SessionLocal()
    try:
        # Check if product exists
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return jsonify({"error": "Producto no encontrado"}), 404

        data = request.get_json()
        if not data:
            return jsonify({"error": "Cuerpo de solicitud requerido"}), 400

        # Validate rating
        if 'rating' not in data:
            return jsonify({"error": "Campo requerido: rating"}), 400

        try:
            rating = int(data['rating'])
            if rating < 1 or rating > 5:
                return jsonify({"error": "La calificación debe estar entre 1 y 5"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Calificación inválida"}), 400

        # Check if user already reviewed this product
        existing_review = db.query(Review).filter(
            and_(
                Review.product_id == product_id,
                Review.reviewer_id == g.user_id
            )
        ).first()

        if existing_review:
            return jsonify({"error": "Ya has reseñado este producto"}), 400

        # Create review
        review = Review(
            product_id=product_id,
            reviewer_id=g.user_id,
            rating=rating,
            comment=data.get('comment', '').strip() or None
        )

        db.add(review)
        db.commit()

        current_app.logger.info(f"Review created for product {product_id} by user {g.user_id}")

        return jsonify({
            "success": True,
            "message": "Reseña creada exitosamente",
            "data": serialize_review(review)
        }), 201

    except Exception as e:
        db.rollback()
        current_app.logger.error(f"Error creating review: {e}")
        return jsonify({"error": "Error al crear la reseña"}), 500
    finally:
        db.close()


# Health check endpoint
@products_bp.route('/health', methods=['GET'])
def health():
    """Health check for products module."""
    return jsonify({"status": "ok", "module": "products"}), 200
