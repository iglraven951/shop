"""AI Service module for DiscoveryShop chatbot powered by Claude API.

This module provides integration with Anthropic's Claude API for intelligent
marketplace assistance including product discovery, recommendations, and user support.
"""

import os
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import anthropic

from backend.chatbot.prompts import PromptTemplates, ConversationPatterns, ErrorMessages

# Configure logging
logger = logging.getLogger(__name__)


class AIServiceException(Exception):
    """Base exception for AI service errors."""

    def __init__(self, message: str, error_type: str = "unknown"):
        """Initialize AI service exception.

        Args:
            message: Error description
            error_type: Type of error (api_error, timeout, validation, etc.)
        """
        self.message = message
        self.error_type = error_type
        super().__init__(self.message)


class AIService:
    """AI service for DiscoveryShop marketplace assistant.

    Integrates with Claude API to provide:
    - Product search assistance
    - Personalized recommendations
    - Marketplace guidance
    - Intent classification
    - Conversation context management
    """

    # API Configuration
    MAX_TOKENS = 1000
    MODEL = "claude-3-5-sonnet-20241022"
    API_TIMEOUT = 30  # seconds
    MAX_CONVERSATION_HISTORY = 10  # messages to keep in context

    def __init__(self) -> None:
        """Initialize AI service with Anthropic client.

        Raises:
            ValueError: If ANTHROPIC_API_KEY is not configured.
        """
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY environment variable is not set. "
                "Please configure it in your .env file."
            )

        self.client = anthropic.Anthropic(api_key=api_key)
        logger.info("AIService initialized successfully with Claude API")

    def process_user_query(
        self,
        user_message: str,
        conversation_context: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Process user query and generate AI response with intent analysis.

        Args:
            user_message: The user's input message
            conversation_context: List of previous messages with 'role' and 'content' keys

        Returns:
            Dictionary containing:
            - response: The AI-generated response
            - intent: Classified intent (search, recommend, help, sell, connect, complaint, other)
            - action: Suggested action (search, filter, browse, contact_seller, etc.)
            - data: Additional metadata (keywords, category, confidence, etc.)

        Raises:
            AIServiceException: If API call fails
        """
        try:
            # Validate input
            self._validate_message(user_message)

            # Classify intent
            intent = self.classify_intent(user_message)
            logger.info(f"User message intent classified as: {intent}")

            # Build conversation messages
            messages = self._build_conversation_messages(
                user_message, conversation_context
            )

            # Call Claude API
            response = self.client.messages.create(
                model=self.MODEL,
                max_tokens=self.MAX_TOKENS,
                system=PromptTemplates.SYSTEM_PROMPT,
                messages=messages,
                timeout=self.API_TIMEOUT,
            )

            # Extract response text
            response_text = response.content[0].text

            # Determine action based on intent
            action = self._determine_action(intent, user_message)

            # Extract additional data based on intent
            data = self._extract_intent_data(intent, user_message)

            return {
                "response": response_text,
                "intent": intent,
                "action": action,
                "data": data,
                "tokens_used": {
                    "input": response.usage.input_tokens,
                    "output": response.usage.output_tokens,
                },
            }

        except anthropic.APIError as e:
            logger.error(f"Anthropic API error: {e}")
            raise AIServiceException(
                ErrorMessages.API_ERROR,
                error_type="api_error",
            )
        except anthropic.APITimeoutError:
            logger.error("Anthropic API timeout")
            raise AIServiceException(
                ErrorMessages.TIMEOUT_ERROR,
                error_type="timeout",
            )
        except Exception as e:
            logger.error(f"Unexpected error in process_user_query: {e}", exc_info=True)
            raise AIServiceException(
                ErrorMessages.API_ERROR,
                error_type="unknown",
            )

    def extract_search_intent(self, message: str) -> Dict[str, Any]:
        """Extract search intent and keywords from user message.

        Args:
            message: User's message that may contain search query

        Returns:
            Dictionary containing:
            - is_search: Boolean indicating if message is a search query
            - keywords: List of search keywords extracted
            - category: Probable product category (if identifiable)
            - characteristics: Dict of specific features (color, size, brand, etc.)
            - confidence: Confidence score 0-100

        Raises:
            AIServiceException: If extraction fails
        """
        try:
            self._validate_message(message)

            prompt = PromptTemplates.SEARCH_EXTRACTION_PROMPT.format(
                user_message=message
            )

            response = self.client.messages.create(
                model=self.MODEL,
                max_tokens=500,
                system="Eres un experto en análisis de búsquedas. "
                      "Extrae información de búsqueda en formato JSON válido.",
                messages=[{"role": "user", "content": prompt}],
                timeout=self.API_TIMEOUT,
            )

            response_text = response.content[0].text

            # Try to parse JSON response
            try:
                # Handle markdown code blocks
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]

                extracted_data = json.loads(response_text.strip())
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse JSON from Claude response: {response_text}")
                extracted_data = {
                    "is_search": self._is_search_query(message),
                    "keywords": self._extract_keywords(message),
                    "category": None,
                    "characteristics": {},
                    "confidence": 50,
                }

            return extracted_data

        except anthropic.APIError as e:
            logger.error(f"Anthropic API error in extract_search_intent: {e}")
            raise AIServiceException(
                ErrorMessages.API_ERROR,
                error_type="api_error",
            )
        except Exception as e:
            logger.error(f"Error in extract_search_intent: {e}", exc_info=True)
            raise AIServiceException(
                "Error extracting search intent",
                error_type="extraction_error",
            )

    def generate_recommendations(
        self,
        user_query: str,
        products: Optional[List[Dict[str, Any]]] = None,
        user_preferences: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generate personalized product recommendations using Claude.

        Args:
            user_query: User's query or interest
            products: List of available products (with id, title, price, category, etc.)
            user_preferences: User's previous preferences and history

        Returns:
            String with formatted recommendations in Spanish
        """
        try:
            self._validate_message(user_query)

            # Format products context
            products_context = "No hay productos disponibles"
            if products:
                products_context = json.dumps(
                    products[:20], indent=2, default=str, ensure_ascii=False
                )

            # Format user context
            user_context = user_query
            if user_preferences:
                user_context += f"\n\nPreferencias: {json.dumps(user_preferences, ensure_ascii=False)}"

            prompt = PromptTemplates.RECOMMENDATION_PROMPT.format(
                user_context=user_context,
                products_context=products_context,
            )

            response = self.client.messages.create(
                model=self.MODEL,
                max_tokens=self.MAX_TOKENS,
                system=PromptTemplates.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
                timeout=self.API_TIMEOUT,
            )

            return response.content[0].text

        except anthropic.APIError as e:
            logger.error(f"Anthropic API error in generate_recommendations: {e}")
            raise AIServiceException(
                ErrorMessages.API_ERROR,
                error_type="api_error",
            )
        except Exception as e:
            logger.error(f"Error in generate_recommendations: {e}", exc_info=True)
            raise AIServiceException(
                "Error generating recommendations",
                error_type="generation_error",
            )

    def classify_intent(self, message: str) -> str:
        """Classify the user's intent from their message.

        Args:
            message: User's message

        Returns:
            Intent classification: 'search', 'recommend', 'help', 'sell',
            'connect', 'complaint', or 'other'
        """
        try:
            self._validate_message(message)

            prompt = PromptTemplates.INTENT_CLASSIFICATION_PROMPT.format(
                user_message=message
            )

            response = self.client.messages.create(
                model=self.MODEL,
                max_tokens=50,
                system="Eres un clasificador de intenciones. "
                      "Responde con UNA SOLA palabra: search, recommend, help, sell, "
                      "connect, complaint, u other.",
                messages=[{"role": "user", "content": prompt}],
                timeout=self.API_TIMEOUT,
            )

            intent = response.content[0].text.strip().lower()

            # Validate intent is one of the expected values
            valid_intents = {
                "search", "recommend", "help", "sell", "connect", "complaint", "other"
            }
            if intent not in valid_intents:
                logger.warning(f"Unexpected intent classification: {intent}, defaulting to 'other'")
                intent = "other"

            return intent

        except anthropic.APIError as e:
            logger.error(f"Anthropic API error in classify_intent: {e}")
            return "other"  # Default fallback
        except Exception as e:
            logger.error(f"Error in classify_intent: {e}", exc_info=True)
            return "other"  # Default fallback

    # ====== Private Helper Methods ======

    def _validate_message(self, message: str) -> None:
        """Validate user message for length and content.

        Args:
            message: Message to validate

        Raises:
            AIServiceException: If message is invalid
        """
        if not message or not isinstance(message, str):
            raise AIServiceException(
                ErrorMessages.INVALID_MESSAGE,
                error_type="validation_error",
            )

        if len(message.strip()) == 0:
            raise AIServiceException(
                ErrorMessages.INVALID_MESSAGE,
                error_type="validation_error",
            )

        # Warn if message is very long (may cause token issues)
        if len(message) > 2000:
            logger.warning(
                f"User message is very long ({len(message)} chars), "
                "may cause token limit issues"
            )
            raise AIServiceException(
                ErrorMessages.TOKEN_LIMIT,
                error_type="token_limit",
            )

    def _build_conversation_messages(
        self,
        current_message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        """Build conversation messages list respecting token limits.

        Args:
            current_message: Current user message
            history: Previous conversation messages

        Returns:
            List of messages formatted for Claude API
        """
        messages = []

        # Add conversation history (most recent messages first)
        if history:
            # Keep only recent messages to avoid token overflow
            recent_history = history[-self.MAX_CONVERSATION_HISTORY:]
            messages.extend(recent_history)

        # Add current message
        messages.append({"role": "user", "content": current_message})

        return messages

    def _determine_action(self, intent: str, message: str) -> str:
        """Determine suggested action based on intent.

        Args:
            intent: Classified intent
            message: Original user message

        Returns:
            Suggested action string
        """
        action_map = {
            "search": "search",
            "recommend": "filter",
            "help": "browse",
            "sell": "list_product",
            "connect": "contact_seller",
            "complaint": "contact_support",
            "other": "clarify",
        }
        return action_map.get(intent, "clarify")

    def _extract_intent_data(self, intent: str, message: str) -> Dict[str, Any]:
        """Extract additional data based on intent.

        Args:
            intent: Classified intent
            message: Original user message

        Returns:
            Dictionary with extracted data
        """
        data = {
            "intent": intent,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if intent == "search":
            try:
                search_data = self.extract_search_intent(message)
                data.update(search_data)
            except AIServiceException:
                # Fallback if extraction fails
                data.update({
                    "keywords": self._extract_keywords(message),
                    "is_search": True,
                })

        return data

    def _is_search_query(self, message: str) -> bool:
        """Heuristic check if message appears to be a search query.

        Args:
            message: User message

        Returns:
            Boolean indicating if it looks like a search
        """
        search_keywords = {
            "busco", "buscas", "buscar", "quiero",
            "necesito", "encuentro", "find", "look",
            "recomiendan", "tienes", "hay", "existe"
        }
        message_lower = message.lower()
        return any(keyword in message_lower for keyword in search_keywords)

    def _extract_keywords(self, message: str) -> List[str]:
        """Simple keyword extraction from message.

        Args:
            message: User message

        Returns:
            List of extracted keywords
        """
        # Simple word extraction (remove common stop words)
        stop_words = {
            "el", "la", "de", "que", "y", "a", "en", "un", "una",
            "los", "las", "es", "son", "está", "están", "busco",
            "quiero", "necesito", "me", "te", "se", "mi", "tu",
            "para", "por", "con", "sin", "o", "si", "no", "más"
        }

        words = message.lower().split()
        keywords = [
            w.strip(".,!?;:") for w in words
            if len(w) > 3 and w.lower() not in stop_words
        ]
        return keywords[:5]  # Return top 5 keywords
