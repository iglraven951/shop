# DiscoveryShop Chatbot Module

## Overview

The DiscoveryShop Chatbot is an AI-powered marketplace assistant built on Claude API. It enables intelligent product discovery, personalized recommendations, vendor connections, and customer support.

## Features

- **Product Discovery**: Help customers find products matching their needs
- **Personalized Recommendations**: AI-driven product suggestions based on user behavior
- **Vendor Connection**: Facilitate connections between buyers and sellers
- **Customer Support**: Answer questions and resolve issues
- **Conversation Management**: Maintain context across multi-turn conversations
- **Response Caching**: Improve performance with intelligent caching
- **Rate Limiting**: Prevent API abuse with built-in throttling

## Architecture

```
backend/chatbot/
├── __init__.py           # Module initialization and exports
├── client.py             # Main ChatbotClient class
├── prompts.py            # Specialized prompt templates
└── README.md             # This file

backend/config_chatbot.py # Chatbot configuration and settings
```

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# Anthropic API Configuration
ANTHROPIC_API_KEY=sk-ant-...  # Get from https://console.anthropic.com/

# Optional: Chatbot-specific settings (uses defaults if not set)
CHATBOT_MODEL=claude-3-5-sonnet-20241022
CHATBOT_MAX_TOKENS=1024
CHATBOT_TEMPERATURE=0.7
```

### Configuration Object

The `ChatbotConfig` class in `backend/config_chatbot.py` centralizes all settings:

```python
from backend.config_chatbot import ChatbotConfig, DEFAULT_CONFIG

config = ChatbotConfig(
    anthropic_api_key="your-api-key",
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    temperature=0.7,
    enable_response_caching=True,
    cache_ttl_seconds=600,
)
config.validate()  # Raises ValueError if invalid
```

## Usage

### Basic Conversation

```python
from backend.chatbot import ChatbotClient
from backend.config_chatbot import DEFAULT_CONFIG

# Initialize client
chatbot = ChatbotClient(config=DEFAULT_CONFIG)

# Send message
response = chatbot.send_message(
    user_message="I'm looking for a wireless headphone under $100"
)
print(response)

# Continue conversation
response = chatbot.send_message(
    user_message="Can you recommend something with noise cancellation?"
)
print(response)
```

### Product Discovery

```python
from backend.chatbot.prompts import PromptTemplates

# Get product discovery prompt with context
prompt = PromptTemplates.get_product_discovery_prompt(
    query="laptop for programming",
    product_context="[Product data from database]"
)

response = chatbot.send_message(
    user_message=prompt,
    system_prompt=PromptTemplates.SYSTEM_PROMPT_BASE
)
```

### Personalized Recommendations

```python
# Build recommendation prompt with user context
recommendation_prompt = PromptTemplates.get_recommendation_prompt(
    purchase_history="[User's past purchases]",
    wishlist_items="[User's wishlist]",
    browsing_history="[Recently viewed items]",
    preferences="Budget: $500-1000, Gaming focused",
    available_products="[Products from database]"
)

response = chatbot.send_message(recommendation_prompt)
```

### Vendor Connection

```python
# Connect customers with appropriate sellers
vendor_prompt = PromptTemplates.get_vendor_connection_prompt(
    customer_request="Looking for seller with fast shipping",
    customer_profile="[Customer info]",
    sellers_data="[Available sellers]"
)

response = chatbot.send_message(vendor_prompt)
```

## Prompt Templates

The module includes specialized prompts for different scenarios:

### System Prompts
- `SYSTEM_PROMPT_BASE`: Base context for all conversations

### Marketplace Scenarios
- `PRODUCT_DISCOVERY_PROMPT`: Help users find products
- `PERSONALIZED_RECOMMENDATIONS_PROMPT`: AI-driven suggestions
- `VENDOR_CONNECTION_PROMPT`: Connect buyers and sellers
- `CUSTOMER_SUPPORT_PROMPT`: Answer questions and support
- `ORDER_ASSISTANCE_PROMPT`: Help with orders

### Conversation Management
- `CONVERSATION_SUMMARY_PROMPT`: Summarize interactions
- `CONTEXT_PRESERVATION_PROMPT`: Maintain context for later

## Configuration Parameters

### API Settings
- `anthropic_api_key`: Your Claude API key
- `model`: Model identifier (default: `claude-3-5-sonnet-20241022`)
- `api_version`: API version string

### Response Limits
- `max_tokens`: Maximum tokens in response (default: 1024)
- `max_context_tokens`: Maximum tokens in history (default: 4096)
- `token_safety_margin`: Safety margin for token counting (default: 50)

### Request Configuration
- `request_timeout`: Request timeout in seconds (default: 30.0)
- `connect_timeout`: Connection timeout in seconds (default: 10.0)
- `max_retries`: Number of retry attempts (default: 3)
- `retry_delay`: Retry delay in seconds (default: 1.0)

### Sampling Parameters
- `temperature`: Randomness level 0.0-1.0 (default: 0.7)
- `top_p`: Nucleus sampling parameter 0.0-1.0 (default: 0.9)
- `top_k`: Top-k sampling parameter (default: 40)

### Rate Limiting
- `max_requests_per_minute`: RPM limit (default: 60)
- `max_requests_per_hour`: RPH limit (default: 1000)
- `rate_limit_strategy`: Strategy type (default: `token_bucket`)

### Behavior & Features
- `max_conversation_history`: Messages to keep in history (default: 20)
- `enable_response_caching`: Enable response cache (default: True)
- `cache_ttl_seconds`: Cache expiration time (default: 600)
- `enable_safety_checks`: Filter harmful content (default: True)
- `min_confidence_score`: Minimum confidence for recommendations (default: 0.6)

### Feature Flags
- `enable_product_search`: Enable product search (default: True)
- `enable_recommendations`: Enable recommendations (default: True)
- `enable_vendor_connection`: Enable vendor connection (default: True)
- `enable_analytics`: Enable conversation analytics (default: True)

## API Response Handling

The ChatbotClient handles:
- **Rate limiting**: Automatic throttling with configurable limits
- **Caching**: Response caching with TTL-based expiration
- **Error recovery**: Automatic retry with exponential backoff
- **Token management**: Conversation history truncation
- **Logging**: Detailed request/response logging (optional)

## Error Handling

```python
try:
    response = chatbot.send_message("Find me a laptop")
except ValueError as e:
    print(f"Configuration error: {e}")
except anthropic.APIError as e:
    print(f"API error: {e}")
except RuntimeError as e:
    print(f"Rate limit exceeded: {e}")
```

## Performance Optimization

### Response Caching

Identical queries return cached responses within the TTL:

```python
# First call hits API
response1 = chatbot.send_message("laptops under $1000")  

# Identical query uses cache (within TTL)
response2 = chatbot.send_message("laptops under $1000")  # Fast!

# Disable caching if needed
response3 = chatbot.send_message(
    "laptops under $1000",
    use_cache=False
)
```

### Conversation History

Automatically truncates history to prevent token overflow:

```python
# Get conversation history
history = chatbot.get_conversation_history()
print(f"Messages: {len(history)}")

# Clear history when needed
chatbot.clear_history()
```

### Token Efficiency

Configure max tokens based on use case:

```python
config = ChatbotConfig(
    max_tokens=512,  # For quick responses
    max_context_tokens=2048,  # For long conversations
)
```

## Integration with Marketplace

### Product Service Integration

```python
from backend.services.product_service import ProductService

# Get products for recommendation context
products = ProductService.get_featured_products()
product_context = json.dumps([p.to_dict() for p in products])

prompt = PromptTemplates.get_product_discovery_prompt(
    query=user_query,
    product_context=product_context
)

response = chatbot.send_message(prompt)
```

### User Profile Integration

```python
from backend.services.user_service import UserService

# Get user context
user = UserService.get_user(user_id)
recommendation_prompt = PromptTemplates.get_recommendation_prompt(
    purchase_history=json.dumps(user.purchase_history),
    wishlist_items=json.dumps(user.wishlist),
    browsing_history=json.dumps(user.recent_browsing),
    preferences=user.preferences,
    available_products=product_context
)

response = chatbot.send_message(recommendation_prompt)
```

## Monitoring & Logging

Enable detailed logging in development:

```python
import logging

logging.basicConfig(level=logging.DEBUG)

# Now all API calls will be logged
chatbot = ChatbotClient(config=DEFAULT_CONFIG)
```

Configure in `backend/config_chatbot.py`:

```python
config = ChatbotConfig(
    log_requests=True,  # Log requests/responses
    log_conversations=True,  # Log full conversations
    logging_level="DEBUG",
)
```

## Best Practices

1. **Always validate configuration** before using:
   ```python
   config.validate()  # Raises ValueError if invalid
   ```

2. **Handle API errors gracefully**:
   ```python
   try:
       response = chatbot.send_message(user_input)
   except anthropic.APIError:
       # Fall back to search or support escalation
   ```

3. **Use appropriate system prompts** for context:
   ```python
   response = chatbot.send_message(
       user_message,
       system_prompt=PromptTemplates.SYSTEM_PROMPT_BASE
   )
   ```

4. **Clear history for new conversations**:
   ```python
   chatbot.clear_history()  # Start fresh conversation
   ```

5. **Monitor cache performance**:
   ```python
   print(f"Cached responses: {len(chatbot._cache)}")
   ```

6. **Set appropriate temperature** for use case:
   - `0.0-0.3`: Deterministic (product info, FAQs)
   - `0.5-0.7`: Balanced (recommendations, support)
   - `0.8-1.0`: Creative (brainstorming, suggestions)

## Troubleshooting

### "ANTHROPIC_API_KEY is required"
Ensure `ANTHROPIC_API_KEY` is set in `.env` or environment variables.

### "Rate limit exceeded"
Configure `max_requests_per_minute` in ChatbotConfig.

### "Conversation exceeds token limit"
Reduce `max_tokens` or `max_context_tokens` in config.

### "Cache not working"
Ensure `enable_response_caching=True` and verify `cache_ttl_seconds`.

## Dependencies

- `anthropic>=0.34.0`: Official Claude API client
- `python-dotenv>=1.0.0`: Environment variable management
- All dependencies in `requirements.txt`

## Future Enhancements

- [ ] Function calling for real-time data integration
- [ ] Multi-language support
- [ ] Conversation analytics and insights
- [ ] A/B testing for prompt optimization
- [ ] Fine-tuning support for custom models
- [ ] Streaming responses for real-time chat
- [ ] Persistent conversation storage

## Support

For issues or questions:
1. Check the Anthropic documentation: https://docs.anthropic.com/
2. Review configuration in `backend/config_chatbot.py`
3. Enable debug logging to troubleshoot
4. Check rate limiting and error logs

## License

Same as DiscoveryShop main project.
