"""Chatbot Client Module - Main interface for Claude API integration.

This module provides the ChatbotClient class which handles:
- API communication with Anthropic's Claude
- Conversation management and history
- Request/response handling with error recovery
- Rate limiting and throttling
- Response caching
"""

import json
import logging
from typing import Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field

import anthropic

from backend.config_chatbot import ChatbotConfig, DEFAULT_CONFIG

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class ConversationMessage:
    """Represents a single message in conversation history."""

    role: str  # 'user' or 'assistant'
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert message to dictionary for API."""
        return {"role": self.role, "content": self.content}


class ChatbotClient:
    """Main client for interacting with Claude API for marketplace assistance."""

    def __init__(self, config: Optional[ChatbotConfig] = None):
        """
        Initialize Chatbot Client.

        Args:
            config: ChatbotConfig instance. Uses DEFAULT_CONFIG if None.

        Raises:
            ValueError: If configuration is invalid.
        """
        self.config = config or DEFAULT_CONFIG

        # Validate configuration
        self.config.validate()

        # Initialize Anthropic client
        self.client = anthropic.Anthropic(api_key=self.config.anthropic_api_key)

        # Conversation history
        self.conversation_history: list[ConversationMessage] = []

        # Response cache
        self._cache: dict[str, tuple[str, datetime]] = {}

        # Rate limiter tracking
        self._request_timestamps: list[datetime] = []

        logger.info(f"ChatbotClient initialized with model: {self.config.model}")

    def send_message(
        self,
        user_message: str,
        system_prompt: Optional[str] = None,
        use_cache: bool = True,
    ) -> str:
        """
        Send a message to Claude and get response.

        Args:
            user_message: User's input message
            system_prompt: Optional custom system prompt
            use_cache: Whether to use response caching

        Returns:
            Claude's response text

        Raises:
            ValueError: If message is empty
            anthropic.APIError: If API call fails
        """
        if not user_message.strip():
            raise ValueError("User message cannot be empty")

        # Check cache
        if use_cache and self.config.enable_response_caching:
            cached_response = self._get_cached_response(user_message)
            if cached_response:
                logger.debug(f"Cache hit for message: {user_message[:50]}...")
                return cached_response

        # Check rate limiting
        self._check_rate_limit()

        # Add to conversation history
        self.conversation_history.append(
            ConversationMessage(role="user", content=user_message)
        )

        # Prepare messages for API
        messages = [msg.to_dict() for msg in self.conversation_history]

        # Prepare system prompt
        if system_prompt is None:
            system_prompt = self.config_chatbot.SYSTEM_PROMPT_BASE

        try:
            # Call Claude API
            response = self.client.messages.create(
                model=self.config.model,
                max_tokens=self.config.max_tokens,
                system=system_prompt,
                messages=messages,
                temperature=self.config.temperature,
                top_p=self.config.top_p,
                top_k=self.config.top_k,
            )

            # Extract response text
            assistant_message = response.content[0].text

            # Add to conversation history
            self.conversation_history.append(
                ConversationMessage(role="assistant", content=assistant_message)
            )

            # Limit conversation history to prevent token overflow
            self._truncate_history()

            # Cache response
            if use_cache and self.config.enable_response_caching:
                self._cache_response(user_message, assistant_message)

            # Log if enabled
            if self.config.log_requests:
                logger.debug(
                    f"API Request: {user_message[:100]}... | "
                    f"Response: {assistant_message[:100]}..."
                )

            return assistant_message

        except anthropic.APIError as e:
            logger.error(f"Claude API error: {e}")
            raise

    def get_conversation_history(self) -> list[dict]:
        """
        Get full conversation history as list of dicts.

        Returns:
            List of conversation messages as dictionaries
        """
        return [msg.to_dict() for msg in self.conversation_history]

    def clear_history(self) -> None:
        """Clear conversation history and cache."""
        self.conversation_history = []
        self._cache.clear()
        logger.info("Conversation history cleared")

    def _check_rate_limit(self) -> None:
        """Check if rate limit has been exceeded."""
        now = datetime.now()

        # Remove timestamps older than 1 minute
        self._request_timestamps = [
            ts for ts in self._request_timestamps if now - ts < timedelta(minutes=1)
        ]

        # Check if exceeded limit
        if len(self._request_timestamps) >= self.config.max_requests_per_minute:
            raise RuntimeError(
                f"Rate limit exceeded: {self.config.max_requests_per_minute} "
                f"requests per minute"
            )

        self._request_timestamps.append(now)

    def _truncate_history(self, max_history: Optional[int] = None) -> None:
        """Keep only the most recent messages to avoid token overflow."""
        max_history = max_history or self.config.max_conversation_history

        if len(self.conversation_history) > max_history:
            self.conversation_history = self.conversation_history[-max_history:]

    def _get_cached_response(self, query: str) -> Optional[str]:
        """Get response from cache if available and not expired."""
        if query not in self._cache:
            return None

        response, timestamp = self._cache[query]
        if datetime.now() - timestamp > timedelta(
            seconds=self.config.cache_ttl_seconds
        ):
            del self._cache[query]
            return None

        return response

    def _cache_response(self, query: str, response: str) -> None:
        """Cache a response with timestamp."""
        self._cache[query] = (response, datetime.now())

    @property
    def config_chatbot(self):
        """Get chatbot configuration (proxy for accessing prompts)."""
        from backend.chatbot.prompts import PromptTemplates

        return PromptTemplates

    def __repr__(self) -> str:
        """String representation of ChatbotClient."""
        return (
            f"ChatbotClient(model={self.config.model}, "
            f"messages={len(self.conversation_history)}, "
            f"cached_responses={len(self._cache)})"
        )
