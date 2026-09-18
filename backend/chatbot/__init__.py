"""DiscoveryShop Chatbot Module - AI-powered marketplace assistant.

This module provides intelligent chatbot capabilities powered by Claude API,
enabling product discovery, recommendations, and customer support.
"""

# AI Service components (AGENT 3)
from backend.chatbot.ai_service import AIService, AIServiceException
from backend.chatbot.prompts import PromptTemplates, ConversationPatterns, ErrorMessages

# Import other components if they exist
try:
    from backend.chatbot.client import ChatbotClient
except ImportError:
    ChatbotClient = None

try:
    from backend.chatbot.search_service import SearchService
except ImportError:
    SearchService = None

__version__ = "1.0.0"
__all__ = [
    "AIService",
    "AIServiceException",
    "PromptTemplates",
    "ConversationPatterns",
    "ErrorMessages",
    "ChatbotClient",
    "SearchService",
]
