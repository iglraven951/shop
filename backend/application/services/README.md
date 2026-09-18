# BaseService - Generic CRUD Service

## Overview

`BaseService` is a reusable, generic base class for implementing CRUD operations across all SQLAlchemy models. It provides:

- **Automatic CRUD methods**: create, read, update, delete, list, search
- **Timestamp management**: Auto-tracks created_at and updated_at
- **Error handling**: Centralized exception management with logging
- **Input validation**: Built-in validation for required fields
- **Pagination**: Full pagination support with offset/limit
- **Search**: Full-text search across multiple fields
- **Soft deletes**: Optional soft delete support (is_deleted flag)
- **Bulk operations**: Bulk create for multiple entities
- **Logging**: Automatic logging of all operations

## Installation

The `BaseService` class is already available in `backend/application/services/base_service.py`.

## Quick Start

### Basic Usage

```python
from backend.application.services import BaseService
from backend.models import Product

# Initialize service with model and database session
product_service = BaseService(Product, db.session)

# Create
new_product = await product_service.create({
    'name': 'Laptop',
    'price': 999.99,
    'seller_id': 'seller-123'
})

# Read
product = await product_service.read(product.id)

# Update
updated = await product_service.update(product.id, {
    'price': 899.99,
    'in_stock': True
})

# Delete (soft delete by default)
await product_service.delete(product.id, soft=True)

# Delete permanently
await product_service.delete(product.id, soft=False)
```

### Listing with Pagination

```python
# List all products with pagination
products, total = await product_service.list(
    page=1,
    per_page=20,
    order_by='-created_at'  # Sort by created_at DESC
)

# List with filters
products, total = await product_service.list(
    filters={'seller_id': 'seller-123', 'in_stock': True},
    page=1,
    per_page=10
)
```

### Search

```python
# Search products by name and description
results = await product_service.search(
    query_text='laptop',
    search_fields=['name', 'description']
)
```

### Bulk Operations

```python
# Create multiple products
products = await product_service.bulk_create([
    {'name': 'Product 1', 'price': 10.99, 'seller_id': 'seller-1'},
    {'name': 'Product 2', 'price': 20.99, 'seller_id': 'seller-2'},
    {'name': 'Product 3', 'price': 30.99, 'seller_id': 'seller-3'},
])
```

### Counting

```python
# Count all active products
total = await product_service.count()

# Count products from specific seller
count = await product_service.count(
    filters={'seller_id': 'seller-123'}
)
```

## Creating a Service

Extend `BaseService` for model-specific functionality:

```python
from backend.application.services import BaseService
from backend.models import Product

class ProductService(BaseService):
    """Product-specific service with custom methods."""

    async def get_products_by_seller(self, seller_id: str, page: int = 1):
        """Get all products from a specific seller."""
        return await self.list(
            filters={'seller_id': seller_id},
            page=page,
            order_by='-created_at'
        )

    async def search_available_products(self, query: str):
        """Search only available products."""
        results = await self.search(
            query_text=query,
            search_fields=['name', 'description']
        )
        return [p for p in results if p.in_stock]

    async def get_top_sellers(self, limit: int = 10):
        """Get top-rated sellers."""
        products, _ = await self.list(
            filters={'seller_verified': True},
            per_page=limit,
            order_by='-rating'
        )
        return products
```

## Usage in Routes

```python
from flask import Blueprint, request, jsonify
from backend.application.services import BaseService
from backend.models import Product
from backend.database import db

products_bp = Blueprint('products', __name__)

# Initialize service
product_service = BaseService(Product, db.session)

@products_bp.route('/products', methods=['GET'])
async def list_products():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    seller_id = request.args.get('seller_id')

    filters = {}
    if seller_id:
        filters['seller_id'] = seller_id

    products, total = await product_service.list(
        filters=filters,
        page=page,
        per_page=per_page
    )

    return jsonify({
        'data': [p.to_dict() for p in products],
        'total': total,
        'page': page,
        'per_page': per_page
    })

@products_bp.route('/products', methods=['POST'])
async def create_product():
    data = request.get_json()
    product = await product_service.create(data)
    return jsonify(product.to_dict()), 201

@products_bp.route('/products/<id>', methods=['PUT'])
async def update_product(id):
    data = request.get_json()
    product = await product_service.update(id, data)
    if not product:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(product.to_dict())

@products_bp.route('/products/<id>', methods=['DELETE'])
async def delete_product(id):
    success = await product_service.delete(id, soft=True)
    if not success:
        return jsonify({'error': 'Not found'}), 404
    return '', 204

@products_bp.route('/products/search', methods=['GET'])
async def search_products():
    query = request.args.get('q', '')
    results = await product_service.search(
        query_text=query,
        search_fields=['name', 'description']
    )
    return jsonify([p.to_dict() for p in results])
```

## Model Requirements

### Automatic Timestamp Support

Models should have these fields for automatic timestamp management:

```python
from sqlalchemy import Column, DateTime
from sqlalchemy.sql import func

class Product(Base):
    __tablename__ = 'products'
    
    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    
    # Automatic timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

### Soft Delete Support

For soft delete functionality, models should include:

```python
class Product(Base):
    __tablename__ = 'products'
    
    # ... other fields ...
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
```

## Error Handling

`BaseService` handles errors gracefully:

```python
try:
    product = await product_service.create({'name': None})
except ValueError as e:
    # Handle validation errors
    print(f"Validation error: {e}")

try:
    product = await product_service.update(invalid_id, {'name': 'New'})
except Exception as e:
    # Handle database errors
    print(f"Database error: {e}")
```

## Logging

All operations are automatically logged with:
- Operation type (create, update, delete, etc.)
- Entity ID
- Timestamps
- Error messages with stack traces

View logs in the application logs or monitoring system.

## Performance Tips

1. **Use pagination**: Always paginate large result sets
2. **Order results**: Use `order_by` to get consistent ordering
3. **Filter early**: Apply filters to reduce database load
4. **Bulk operations**: Use `bulk_create` instead of multiple creates
5. **Soft deletes**: Query automatically excludes soft-deleted items

## API Reference

### Methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `create(data)` | `Dict[str, Any] -> T` | Created entity |
| `read(id)` | `Any -> Optional[T]` | Entity or None |
| `update(id, data)` | `(Any, Dict) -> Optional[T]` | Updated entity or None |
| `delete(id, soft)` | `(Any, bool=True) -> bool` | True if deleted |
| `list(filters, page, per_page, order_by)` | `(...) -> Tuple[List[T], int]` | (entities, total) |
| `search(query, fields)` | `(str, List[str]) -> List[T]` | Matching entities |
| `bulk_create(data_list)` | `List[Dict] -> List[T]` | Created entities |
| `count(filters)` | `Dict -> int` | Total count |

## License

Part of DiscoveryShop project.
