"""Simple product API endpoints - FORUM VERSION (sin carrito)"""

from flask import Blueprint, jsonify

simple_products_bp = Blueprint('simple_products', __name__, url_prefix='/api')

# Datos de productos con información de vendedor y ubicación
DEMO_PRODUCTS = [
    {
        "id": 1,
        "title": "Laptop ASUS Gaming",
        "description": "Laptop gaming RTX 4070, 16GB RAM, SSD 512GB. Perfecta para gaming y edición.",
        "price": 1299.99,
        "image": "https://images.unsplash.com/photo-1588872657840-e5a5e4c28ccc?w=500",
        "rating": 4.8,
        "reviews": 24,
        "stock": 5,
        "category": "Electrónica",
        "seller": {
            "id": 1,
            "username": "TechStore",
            "name": "Tech Store Online",
            "avatar": "https://via.placeholder.com/100",
            "rating": 4.7,
            "total_sales": 145
        },
        "location": {
            "city": "Arequipa Centro",
            "country": "Perú",
            "lat": -16.3972,
            "lng": -71.5350
        },
        "messages": 12,
        "created_at": "2026-09-10T10:30:00Z"
    },
    {
        "id": 2,
        "title": "iPhone 15 Pro",
        "description": "iPhone 15 Pro 256GB, color negro. Nuevo con garantía de 1 año.",
        "price": 999.99,
        "image": "https://images.unsplash.com/photo-1592286927505-1fed6c3d8a29?w=500",
        "rating": 4.9,
        "reviews": 45,
        "stock": 3,
        "category": "Electrónica",
        "seller": {
            "id": 2,
            "username": "MobileHouse",
            "name": "Mobile House",
            "avatar": "https://via.placeholder.com/100",
            "rating": 4.8,
            "total_sales": 89
        },
        "location": {
            "city": "Mariano Melgar",
            "country": "Perú",
            "lat": -16.4167,
            "lng": -71.5167
        },
        "messages": 28,
        "created_at": "2026-09-08T15:20:00Z"
    },
    {
        "id": 3,
        "title": "Sudadera Premium",
        "description": "Sudadera de algodón 100% premium. Muy cómoda y duradera.",
        "price": 49.99,
        "image": "https://images.unsplash.com/photo-1556821552-7f41c5d440db?w=500",
        "rating": 4.6,
        "reviews": 12,
        "stock": 15,
        "category": "Ropa",
        "seller": {
            "id": 3,
            "username": "FashionHub",
            "name": "Fashion Hub Perú",
            "avatar": "https://via.placeholder.com/100",
            "rating": 4.5,
            "total_sales": 234
        },
        "location": {
            "city": "Alto Selva Alegre",
            "country": "Perú",
            "lat": -16.3833,
            "lng": -71.5500
        },
        "messages": 5,
        "created_at": "2026-09-12T08:45:00Z"
    },
    {
        "id": 4,
        "title": "Zapatillas Nike",
        "description": "Zapatillas running Nike Pegasus. Ideales para correr.",
        "price": 129.99,
        "image": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500",
        "rating": 4.7,
        "reviews": 32,
        "stock": 8,
        "category": "Deportes",
        "seller": {
            "id": 4,
            "username": "SportsWorld",
            "name": "Sports World",
            "avatar": "https://via.placeholder.com/100",
            "rating": 4.6,
            "total_sales": 178
        },
        "location": {
            "city": "Cerro Colorado",
            "country": "Perú",
            "lat": -16.4333,
            "lng": -71.4833
        },
        "messages": 8,
        "created_at": "2026-09-11T12:15:00Z"
    },
    {
        "id": 5,
        "title": "Lámpara LED Inteligente",
        "description": "Lámpara RGB inteligente con WiFi. Contrólala desde tu teléfono.",
        "price": 39.99,
        "image": "https://images.unsplash.com/photo-1565636192335-14c911101447?w=500",
        "rating": 4.5,
        "reviews": 18,
        "stock": 20,
        "category": "Hogar",
        "seller": {
            "id": 5,
            "username": "SmartHome",
            "name": "Smart Home Store",
            "avatar": "https://via.placeholder.com/100",
            "rating": 4.4,
            "total_sales": 91
        },
        "location": {
            "city": "Cayma",
            "country": "Perú",
            "lat": -16.3833,
            "lng": -71.6167
        },
        "messages": 3,
        "created_at": "2026-09-09T14:30:00Z"
    },
    {
        "id": 6,
        "title": "Monitor 4K 27 pulgadas",
        "description": "Monitor 4K UHD 27 pulgadas, 144Hz. Perfecto para gaming y diseño.",
        "price": 399.99,
        "image": "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500",
        "rating": 4.8,
        "reviews": 28,
        "stock": 4,
        "category": "Electrónica",
        "seller": {
            "id": 1,
            "username": "TechStore",
            "name": "Tech Store Online",
            "avatar": "https://via.placeholder.com/100",
            "rating": 4.7,
            "total_sales": 145
        },
        "location": {
            "city": "Jacobo Hunter",
            "country": "Perú",
            "lat": -16.4167,
            "lng": -71.6000
        },
        "messages": 15,
        "created_at": "2026-09-07T09:00:00Z"
    },
    {
        "id": 7,
        "title": "Teclado Mecánico RGB",
        "description": "Teclado mecánico gamer con RGB. Switches mecánicos de calidad.",
        "price": 149.99,
        "image": "https://images.unsplash.com/photo-1587829191301-faf50e0b7a62?w=500",
        "rating": 4.9,
        "reviews": 35,
        "stock": 12,
        "category": "Electrónica",
        "seller": {
            "id": 2,
            "username": "MobileHouse",
            "name": "Mobile House",
            "avatar": "https://via.placeholder.com/100",
            "rating": 4.8,
            "total_sales": 89
        },
        "location": {
            "city": "La Joya",
            "country": "Perú",
            "lat": -16.5000,
            "lng": -71.4500
        },
        "messages": 22,
        "created_at": "2026-09-06T16:45:00Z"
    },
    {
        "id": 8,
        "title": "Mochila Deportiva",
        "description": "Mochila resistente para viajes. Impermeable y con múltiples compartimentos.",
        "price": 59.99,
        "image": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500",
        "rating": 4.6,
        "reviews": 14,
        "stock": 10,
        "category": "Deportes",
        "seller": {
            "id": 3,
            "username": "FashionHub",
            "name": "Fashion Hub Perú",
            "avatar": "https://via.placeholder.com/100",
            "rating": 4.5,
            "total_sales": 234
        },
        "location": {
            "city": "Yanahuara",
            "country": "Perú",
            "lat": -16.4167,
            "lng": -71.5333
        },
        "messages": 7,
        "created_at": "2026-09-13T11:20:00Z"
    }
]


@simple_products_bp.route('/products', methods=['GET'])
def get_products():
    """Get all products for forum view"""
    return jsonify({
        "success": True,
        "data": {
            "products": DEMO_PRODUCTS,
            "total": len(DEMO_PRODUCTS)
        }
    }), 200


@simple_products_bp.route('/products/<product_id>', methods=['GET'])
def get_product_detail(product_id):
    """Get product detail with seller info and location"""
    # Intentar convertir a int si es posible
    try:
        product_id = int(product_id)
    except (ValueError, TypeError):
        pass

    product = next((p for p in DEMO_PRODUCTS if p['id'] == product_id), None)
    if not product:
        return jsonify({"error": "Producto no encontrado"}), 404

    return jsonify({
        "success": True,
        "data": product
    }), 200


@simple_products_bp.route('/categories', methods=['GET'])
def get_categories():
    """Get all categories"""
    categories = [
        {"id": 1, "name": "Electrónica", "icon": "🖥️"},
        {"id": 2, "name": "Ropa", "icon": "👕"},
        {"id": 3, "name": "Hogar", "icon": "🏠"},
        {"id": 4, "name": "Deportes", "icon": "⚽"}
    ]
    return jsonify({
        "success": True,
        "data": {"categories": categories}
    }), 200
