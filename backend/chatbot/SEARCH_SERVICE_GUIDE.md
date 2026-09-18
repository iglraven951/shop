# SearchService Integration Guide

## Overview

The `SearchService` provides AI-powered marketplace search and product discovery capabilities integrated with DiscoveryShop's core models.

## Quick Start

### Initialization

```python
from backend.database import get_db
from backend.chatbot.search_service import SearchService

# Get database session
db = get_db()

# Initialize search service
search_service = SearchService(db)
```

### Basic Product Search

```python
# Simple search
results = search_service.search_products(
    query="laptop",
    limit=10
)

# Search with category filter
results = search_service.search_products(
    query="gaming",
    category="electronics",
    limit=5
)
```

### Product Recommendations

```python
# Get recommendations based on keywords
recommendations = search_service.get_product_recommendations(
    keywords=["smartphone", "latest", "5G"],
    limit=5
)

# Get personalized recommendations for a user
personalized = search_service.get_product_recommendations(
    keywords=["laptop", "gaming"],
    user_id="user-uuid-here",
    limit=5
)
```

### Connect to Seller

```python
# Initiate conversation with seller about a product
connection = search_service.connect_to_seller(
    product_id="product-uuid",
    user_id="buyer-uuid",
    message="Hi, is this still available? Can you tell me more about the specs?"
)

print(connection)
# Output:
# {
#     "chat_id": "message-uuid",
#     "seller_name": "john_seller",
#     "seller_id": "seller-uuid",
#     "product_id": "product-uuid",
#     "product_title": "iPhone 15 Pro",
#     "message_id": "message-uuid",
#     "created_at": "2026-09-17T10:30:00+00:00"
# }
```

### Get Seller Information

```python
# Retrieve detailed seller profile
seller_info = search_service.get_seller_info(seller_id="seller-uuid")

print(seller_info)
# Output:
# {
#     "name": "reliable_seller",
#     "seller_id": "uuid",
#     "full_name": "John Smith",
#     "avatar_url": "https://...",
#     "is_verified": True,
#     "rating": 4.8,
#     "reviews_count": 125,
#     "products_count": 42,
#     "response_time": "About 2 hours",
#     "joined_date": "2024-01-15T08:00:00+00:00"
# }
```

### Extract Search Parameters from AI Intent

```python
from backend.services.ai_service import AIService

ai_service = AIService()

# Parse user query
user_query = "I'm looking for a new gaming laptop under $1500"
intent_analysis = ai_service.parse_intent(user_query)

# Extract structured search parameters
search_params = search_service.extract_search_params(intent_analysis)

print(search_params)
# Output:
# {
#     "keywords": ["gaming", "laptop"],
#     "category": None,
#     "price_min": 1200.0,
#     "price_max": 1800.0,
#     "condition": None,
#     "confidence": 0.85
# }

# Use extracted parameters for search
results = search_service.search_products(
    query=" ".join(search_params["keywords"]),
    category=search_params.get("category"),
    limit=10
)
```

## Integration with Chatbot Client

### Example: Complete Marketplace Discovery Flow

```python
from backend.chatbot import ChatbotClient, SearchService
from backend.database import get_db

class MarketplaceAssistant:
    def __init__(self):
        self.chatbot = ChatbotClient()
        self.search = SearchService(get_db())
    
    def handle_user_query(self, user_id: str, query: str):
        """Handle user marketplace query with AI assistance."""
        
        # Get AI analysis of user intent
        intent = self.chatbot.client.parse_intent(query)
        
        # Extract structured search parameters
        search_params = self.search.extract_search_params(intent)
        
        # Check if this is a product search
        if intent.get("intent") == "search":
            # Search for products
            if search_params.get("keywords"):
                results = self.search.search_products(
                    query=" ".join(search_params["keywords"]),
                    category=search_params.get("category"),
                    limit=5
                )
                
                return {
                    "type": "product_search",
                    "results": results,
                    "count": len(results)
                }
        
        # Check if user wants recommendations
        elif intent.get("intent") == "recommendation":
            recommendations = self.search.get_product_recommendations(
                keywords=search_params.get("keywords", []),
                user_id=user_id,
                limit=5
            )
            
            return {
                "type": "recommendations",
                "results": recommendations,
                "count": len(recommendations)
            }
        
        # Default to FAQ response
        response = self.chatbot.process_query(query)
        return response
```

## Response Formats

### Product Search Result

```python
{
    "id": "product-uuid",
    "title": "iPhone 15 Pro 256GB",
    "description": "Latest Apple smartphone with A17 chip...",
    "price": 999.99,
    "original_price": 1099.99,
    "stock": 5,
    "sold_count": 42,
    "category": "Electronics",
    "location": "New York, NY",
    "primary_image": "https://...",
    "seller_id": "seller-uuid",
    "seller_name": "tech_retailer",
    "seller_avatar": "https://...",
    "seller_rating": 4.9,
    "created_at": "2026-09-15T12:00:00+00:00"
}
```

### Seller Information Result

```python
{
    "name": "reliable_seller",
    "seller_id": "uuid",
    "full_name": "John Smith",
    "avatar_url": "https://...",
    "is_verified": True,
    "rating": 4.8,
    "reviews_count": 125,
    "products_count": 42,
    "response_time": "About 2 hours",
    "joined_date": "2024-01-15T08:00:00+00:00"
}
```

## Error Handling

The SearchService raises custom exceptions that should be handled:

```python
try:
    results = search_service.search_products(query="")
except ValueError as e:
    # Handle validation errors (empty query, invalid parameters)
    print(f"Validation error: {e}")

try:
    seller_info = search_service.get_seller_info("invalid-id")
except ValueError as e:
    # Handle not found errors
    print(f"Seller not found: {e}")

try:
    connection = search_service.connect_to_seller(
        product_id="invalid",
        user_id="invalid",
        message="Hi"
    )
except ValueError as e:
    # Handle validation errors
    print(f"Connection failed: {e}")
except Exception as e:
    # Handle database errors
    print(f"Database error: {e}")
```

## Performance Considerations

### Query Optimization
- Products filtered by status="approved" and stock > 0 before returning
- Category lookups optimized with index on slug and name
- Seller info queries cached where possible
- Limit defaults to 10, maximum 100 for search, 10 for recommendations

### Response Time Calculation
- Calculated from last 20 messages for efficiency
- Only analyzes messages where seller is the responder
- Formatted in human-readable format (minutes, hours, days)

### Database Indexes
The following indexes optimize SearchService queries:
- `idx_product_status` - Filter by approval status
- `idx_product_category_id` - Filter by category
- `idx_product_title` - Full-text search on title
- `idx_category_name` - Category lookups by name
- `idx_category_slug` - Category lookups by slug
- `idx_user_seller_verified` - Find verified sellers

## Testing

### Unit Test Example

```python
import pytest
from backend.chatbot.search_service import SearchService

@pytest.fixture
def search_service(db_session):
    return SearchService(db_session)

def test_search_products_empty_query(search_service):
    with pytest.raises(ValueError):
        search_service.search_products(query="")

def test_search_products_with_results(search_service):
    results = search_service.search_products(query="laptop", limit=10)
    assert isinstance(results, list)
    assert all("id" in r and "title" in r for r in results)

def test_get_product_recommendations(search_service):
    recommendations = search_service.get_product_recommendations(
        keywords=["laptop", "gaming"]
    )
    assert isinstance(recommendations, list)
    assert len(recommendations) <= 5
```

## API Endpoint Integration (AGENT 7)

Once routes are created, integrate SearchService as follows:

```python
from flask import Blueprint, request, jsonify
from backend.chatbot import SearchService
from backend.database import get_db

search_bp = Blueprint('search', __name__, url_prefix='/api/search')

@search_bp.route('/products', methods=['GET'])
def search_products():
    query = request.args.get('q', '')
    category = request.args.get('category')
    limit = request.args.get('limit', default=10, type=int)
    
    db = get_db()
    search_service = SearchService(db)
    
    try:
        results = search_service.search_products(
            query=query,
            category=category,
            limit=limit
        )
        return jsonify({"results": results, "count": len(results)})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
```

## Logging

The SearchService logs important operations for debugging:

```python
import logging

logger = logging.getLogger('backend.chatbot.search_service')

# Set log level
logging.basicConfig(level=logging.INFO)

# These operations are logged:
# - Search queries and result counts
# - Product recommendations generation
# - Seller connections
# - Seller info retrieval
# - Search parameter extraction
```

## Next Steps

1. **AGENT 6**: Create ChatBot API routes for search integration
2. **AGENT 7**: Create REST endpoints for marketplace search
3. **AGENT 8**: Add input validation and security checks
4. **AGENT 9**: Add caching layer for performance optimization

## See Also

- [AIService Documentation](../services/ai_service.py)
- [Product Model](../models/product.py)
- [User Model](../models/user.py)
- [ChatMessage Model](../models/chat.py)
