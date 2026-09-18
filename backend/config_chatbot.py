"""Chatbot Configuration Module - Claude API settings and parameters.

This module centralizes all chatbot configuration including API credentials,
model parameters, rate limits, and behavior settings.
"""

import os
from typing import Final
from dataclasses import dataclass


@dataclass(frozen=True)
class ChatbotConfig:
    """Configuration container for Claude API chatbot integration."""

    # ========================================================================
    # ANTHROPIC API CONFIGURATION
    # ========================================================================

    # API Key from environment variable
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")

    # Model identifier (Claude 3.5 Sonnet recommended for cost/performance)
    model: str = "claude-3-5-sonnet-20241022"

    # API version (latest stable)
    api_version: str = "2024-06-01"

    # ========================================================================
    # TOKEN & RESPONSE LIMITS
    # ========================================================================

    # Maximum tokens in response (balances quality vs speed/cost)
    max_tokens: int = 1024

    # Maximum tokens in conversation history context
    max_context_tokens: int = 4096

    # Safety margin for token counting (prevents exceeding limits)
    token_safety_margin: int = 50

    # ========================================================================
    # REQUEST & TIMEOUT CONFIGURATION
    # ========================================================================

    # Request timeout in seconds
    request_timeout: float = 30.0

    # Connection timeout in seconds
    connect_timeout: float = 10.0

    # Retry attempts for failed requests
    max_retries: int = 3

    # Retry delay in seconds (exponential backoff multiplier)
    retry_delay: float = 1.0

    # ========================================================================
    # TEMPERATURE & SAMPLING PARAMETERS
    # ========================================================================

    # Temperature controls randomness (0.0-1.0)
    # 0.0 = deterministic, 1.0 = very random
    # Recommendation: 0.7 for balanced responses
    temperature: float = 0.7

    # Top-p (nucleus sampling) parameter (0.0-1.0)
    # Controls diversity via cumulative probability
    top_p: float = 0.9

    # Top-k parameter (integer >= 0)
    # Restricts to top k most likely tokens
    top_k: int = 40

    # ========================================================================
    # RATE LIMITING & THROTTLING
    # ========================================================================

    # Maximum requests per minute
    max_requests_per_minute: int = 60

    # Maximum requests per hour
    max_requests_per_hour: int = 1000

    # Rate limiting strategy: 'token_bucket' or 'sliding_window'
    rate_limit_strategy: str = "token_bucket"

    # ========================================================================
    # BEHAVIOR & SAFETY SETTINGS
    # ========================================================================

    # Minimum confidence score for product recommendations (0.0-1.0)
    min_confidence_score: float = 0.6

    # Maximum conversation turns to keep in history
    max_conversation_history: int = 20

    # Enable safety checks (filter harmful content)
    enable_safety_checks: bool = True

    # Enable caching of responses for identical queries
    enable_response_caching: bool = True

    # Cache TTL in seconds (600 = 10 minutes)
    cache_ttl_seconds: int = 600

    # ========================================================================
    # LOGGING & DEBUGGING
    # ========================================================================

    # Log all API requests and responses
    log_requests: bool = False

    # Log full conversation history
    log_conversations: bool = False

    # Logging level ('DEBUG', 'INFO', 'WARNING', 'ERROR')
    logging_level: str = "INFO"

    # ========================================================================
    # FEATURE FLAGS
    # ========================================================================

    # Enable product search integration
    enable_product_search: bool = True

    # Enable product recommendations
    enable_recommendations: bool = True

    # Enable vendor connection assistance
    enable_vendor_connection: bool = True

    # Enable conversation analytics
    enable_analytics: bool = True

    # ========================================================================
    # VALIDATION METHODS
    # ========================================================================

    def validate(self) -> bool:
        """
        Validate chatbot configuration.

        Returns:
            bool: True if configuration is valid.

        Raises:
            ValueError: If critical configuration is missing or invalid.
        """
        if not self.anthropic_api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY environment variable is required. "
                "Set it in .env file or as an environment variable."
            )

        if self.model not in [
            "claude-3-5-sonnet-20241022",
            "claude-3-opus-20250219",
            "claude-3-haiku-20250307",
        ]:
            raise ValueError(
                f"Unsupported model: {self.model}. "
                "Use 'claude-3-5-sonnet-20241022', 'claude-3-opus-20250219', "
                "or 'claude-3-haiku-20250307'."
            )

        if not (0.0 <= self.temperature <= 1.0):
            raise ValueError(
                f"Temperature must be between 0.0 and 1.0, got {self.temperature}"
            )

        if not (0.0 <= self.top_p <= 1.0):
            raise ValueError(f"top_p must be between 0.0 and 1.0, got {self.top_p}")

        if self.max_tokens < 100:
            raise ValueError(f"max_tokens must be at least 100, got {self.max_tokens}")

        if self.request_timeout < 5.0:
            raise ValueError(
                f"request_timeout must be at least 5.0 seconds, "
                f"got {self.request_timeout}"
            )

        return True

    def to_dict(self) -> dict:
        """
        Convert configuration to dictionary.

        Returns:
            dict: Configuration as dictionary (excludes API key for security).
        """
        return {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "top_k": self.top_k,
            "enable_safety_checks": self.enable_safety_checks,
            "enable_response_caching": self.enable_response_caching,
            "max_conversation_history": self.max_conversation_history,
        }


# Default configuration instance
DEFAULT_CONFIG = ChatbotConfig()

# Validate on import
try:
    DEFAULT_CONFIG.validate()
except ValueError as e:
    import warnings

    warnings.warn(f"Chatbot configuration warning: {e}")
