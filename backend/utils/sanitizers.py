"""
XSS Prevention Sanitizers for DiscoveryShop

This module provides comprehensive HTML and text sanitization functions
to prevent Cross-Site Scripting (XSS) vulnerabilities throughout the application.
"""

import html
import re
from typing import Optional, Any
from urllib.parse import quote


class HTMLSanitizer:
    """
    Provides static methods for sanitizing HTML content and preventing XSS attacks.
    Uses proper HTML escaping rather than string replacement.
    """

    @staticmethod
    def escape_html(text: Optional[str]) -> str:
        """
        Escape HTML special characters to prevent script injection.

        Args:
            text: Text to escape. If None, returns empty string.

        Returns:
            HTML-escaped text safe for embedding in HTML documents.

        Example:
            >>> HTMLSanitizer.escape_html('<script>alert("xss")</script>')
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
        """
        if text is None:
            return ""

        # Convert to string if necessary
        text = str(text)

        # Use html.escape which properly escapes:
        # & -> &amp;
        # < -> &lt;
        # > -> &gt;
        # " -> &quot; (when quote=True)
        # ' -> &#x27; (when quote=True)
        return html.escape(text, quote=True)

    @staticmethod
    def sanitize_html_attribute(value: Optional[str]) -> str:
        """
        Sanitize values meant for HTML attributes.
        Removes potentially dangerous characters and protocols.

        Args:
            value: Attribute value to sanitize

        Returns:
            Safe attribute value

        Example:
            >>> HTMLSanitizer.sanitize_html_attribute("javascript:alert('xss')")
            ''
        """
        if value is None:
            return ""

        value = str(value).strip()

        # Block dangerous protocols
        dangerous_protocols = [
            'javascript:', 'data:', 'vbscript:', 'file:', 'about:'
        ]

        value_lower = value.lower()
        for protocol in dangerous_protocols:
            if value_lower.startswith(protocol):
                return ""

        # Escape the value
        return HTMLSanitizer.escape_html(value)

    @staticmethod
    def sanitize_url(url: Optional[str]) -> str:
        """
        Sanitize URLs to prevent javascript: and data: protocol injection.

        Args:
            url: URL to sanitize

        Returns:
            Safe URL, or empty string if dangerous

        Example:
            >>> HTMLSanitizer.sanitize_url("javascript:alert('xss')")
            ''
            >>> HTMLSanitizer.sanitize_url("https://example.com")
            'https://example.com'
        """
        if not url:
            return ""

        url = str(url).strip()

        # Block dangerous protocols
        dangerous_protocols = [
            'javascript:', 'data:', 'vbscript:', 'file:'
        ]

        url_lower = url.lower()
        for protocol in dangerous_protocols:
            if url_lower.startswith(protocol):
                return ""

        # Allow only http, https, mailto, and relative URLs
        safe_protocols = ['http://', 'https://', 'mailto:', '/']

        if not any(url_lower.startswith(p) for p in safe_protocols):
            # If it doesn't start with a safe protocol, treat as relative URL
            if url.startswith('../') or url.startswith('./'):
                return url
            return ""

        return url

    @staticmethod
    def sanitize_css_value(value: Optional[str]) -> str:
        """
        Sanitize CSS property values to prevent expression injection.

        Args:
            value: CSS value to sanitize

        Returns:
            Safe CSS value
        """
        if not value:
            return ""

        value = str(value).strip()

        # Block dangerous CSS patterns
        dangerous_patterns = [
            r'javascript:',
            r'behavior:',
            r'expression\s*\(',
            r'-moz-binding:',
        ]

        value_lower = value.lower()
        for pattern in dangerous_patterns:
            if re.search(pattern, value_lower):
                return ""

        return value

    @staticmethod
    def strip_html_tags(text: Optional[str]) -> str:
        """
        Remove all HTML tags from text.

        Args:
            text: Text potentially containing HTML

        Returns:
            Text with HTML tags removed

        Example:
            >>> HTMLSanitizer.strip_html_tags('<p>Hello <b>World</b></p>')
            'Hello World'
        """
        if not text:
            return ""

        text = str(text)
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        return text

    @staticmethod
    def sanitize_json_value(value: Any) -> Any:
        """
        Sanitize values before JSON serialization.

        Args:
            value: Value to sanitize

        Returns:
            Sanitized value safe for JSON
        """
        if isinstance(value, str):
            return HTMLSanitizer.escape_html(value)
        elif isinstance(value, (int, float, bool, type(None))):
            return value
        elif isinstance(value, dict):
            return {
                k: HTMLSanitizer.sanitize_json_value(v)
                for k, v in value.items()
            }
        elif isinstance(value, list):
            return [
                HTMLSanitizer.sanitize_json_value(item)
                for item in value
            ]
        else:
            return str(value)


class TextSanitizer:
    """
    Provides methods for sanitizing plain text input.
    """

    @staticmethod
    def sanitize_plain_text(text: Optional[str], max_length: Optional[int] = None) -> str:
        """
        Sanitize plain text input by removing control characters and limiting length.

        Args:
            text: Text to sanitize
            max_length: Maximum allowed length (None for unlimited)

        Returns:
            Sanitized text
        """
        if text is None:
            return ""

        text = str(text)

        # Remove null bytes
        text = text.replace('\x00', '')

        # Remove other control characters except newline and tab
        text = ''.join(
            char for char in text
            if ord(char) >= 32 or char in '\n\t'
        )

        # Enforce max length
        if max_length and len(text) > max_length:
            text = text[:max_length]

        return text.strip()

    @staticmethod
    def sanitize_username(username: Optional[str]) -> str:
        """
        Sanitize username input.
        Allows alphanumeric, underscores, hyphens, and dots only.

        Args:
            username: Username to sanitize

        Returns:
            Sanitized username
        """
        if not username:
            return ""

        username = str(username).strip()

        # Allow only safe characters
        username = re.sub(r'[^a-zA-Z0-9._-]', '', username)

        # Limit length
        username = username[:32]

        return username

    @staticmethod
    def sanitize_email(email: Optional[str]) -> str:
        """
        Sanitize email input.

        Args:
            email: Email to sanitize

        Returns:
            Sanitized email (lowercase, trimmed)
        """
        if not email:
            return ""

        email = str(email).strip().lower()

        # Basic email validation/sanitization
        # Remove any suspicious characters
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            return ""

        return email

    @staticmethod
    def sanitize_slug(text: Optional[str]) -> str:
        """
        Convert text to a URL-safe slug.

        Args:
            text: Text to convert to slug

        Returns:
            URL-safe slug
        """
        if not text:
            return ""

        text = str(text).lower()

        # Replace spaces and underscores with hyphens
        text = re.sub(r'[\s_]+', '-', text)

        # Remove non-alphanumeric characters except hyphens
        text = re.sub(r'[^a-z0-9-]', '', text)

        # Remove consecutive hyphens
        text = re.sub(r'-+', '-', text)

        # Remove leading/trailing hyphens
        text = text.strip('-')

        return text


class InputValidator:
    """
    Validates user input before processing.
    """

    @staticmethod
    def is_safe_text(text: Optional[str]) -> bool:
        """
        Check if text appears safe (doesn't contain obvious XSS patterns).

        Args:
            text: Text to validate

        Returns:
            True if text appears safe, False otherwise
        """
        if text is None:
            return True

        text = str(text).lower()

        # Block obvious XSS patterns
        dangerous_patterns = [
            '<script', 'javascript:', 'onerror=', 'onclick=', 'onload=',
            'onmouseover=', 'onfocus=', 'onmouseenter=', 'data:',
            'vbscript:', '<!--', 'eval(', 'expression(', 'behavior:',
            '-moz-binding:', 'iframe', 'embed', 'object'
        ]

        for pattern in dangerous_patterns:
            if pattern in text:
                return False

        return True

    @staticmethod
    def validate_length(text: Optional[str], min_length: int = 0, max_length: int = 10000) -> bool:
        """
        Validate text length.

        Args:
            text: Text to validate
            min_length: Minimum allowed length
            max_length: Maximum allowed length

        Returns:
            True if length is valid, False otherwise
        """
        if text is None:
            return min_length == 0

        length = len(str(text))
        return min_length <= length <= max_length
