"""Unit tests for validation functions and utilities."""

import pytest
from typing import Optional


class TestEmailValidation:
    """Test email validation."""

    def test_valid_email_formats(self) -> None:
        """Test that valid email formats pass validation."""
        valid_emails = [
            "user@example.com",
            "john.doe@example.co.uk",
            "test+tag@domain.org",
            "user123@sub.domain.com",
        ]
        for email in valid_emails:
            assert is_valid_email(email), f"Email {email} should be valid"

    def test_invalid_email_formats(self) -> None:
        """Test that invalid email formats fail validation."""
        invalid_emails = [
            "plainaddress",
            "@example.com",
            "user@",
            "user @example.com",
            "user@example",
            "user@@example.com",
            "",
        ]
        for email in invalid_emails:
            assert not is_valid_email(email), f"Email {email} should be invalid"

    def test_email_with_special_characters(self) -> None:
        """Test email validation with special characters."""
        assert is_valid_email("user+tag@example.com")
        assert is_valid_email("user.name@example.com")
        assert not is_valid_email("user name@example.com")
        assert not is_valid_email("user@exam ple.com")

    def test_empty_email(self) -> None:
        """Test that empty email is invalid."""
        assert not is_valid_email("")
        assert not is_valid_email(" ")


class TestPasswordValidation:
    """Test password validation."""

    def test_strong_passwords(self) -> None:
        """Test that strong passwords pass validation."""
        strong_passwords = [
            "MyP@ssw0rd123",
            "SecurePass123!",
            "C0mpl3x!Pass",
            "ValidPass1$",
        ]
        for password in strong_passwords:
            assert is_valid_password(password), f"Password '{password}' should be valid"

    def test_weak_passwords(self) -> None:
        """Test that weak passwords fail validation."""
        weak_passwords = [
            "123456",  # Only numbers
            "password",  # Only lowercase
            "PASSWORD",  # Only uppercase
            "Pass123",  # Missing special char
            "P@ssw",  # Too short
            "",  # Empty
        ]
        for password in weak_passwords:
            assert not is_valid_password(password), f"Password '{password}' should be invalid"

    def test_password_minimum_length(self) -> None:
        """Test password minimum length requirement."""
        assert not is_valid_password("Short1!")  # 7 characters
        assert is_valid_password("ValidPass1!")  # 11 characters

    def test_password_requires_variety(self) -> None:
        """Test that password requires mixed character types."""
        assert not is_valid_password("onlylowercase123")
        assert not is_valid_password("ONLYUPPERCASE123")
        assert not is_valid_password("OnlyLetters")
        assert is_valid_password("ValidPass1")


class TestUsernameValidation:
    """Test username validation."""

    def test_valid_usernames(self) -> None:
        """Test that valid usernames pass validation."""
        valid_usernames = [
            "john_doe",
            "user123",
            "JohnDoe",
            "user.name",
            "a1b2c3",
        ]
        for username in valid_usernames:
            assert is_valid_username(username), f"Username '{username}' should be valid"

    def test_invalid_usernames(self) -> None:
        """Test that invalid usernames fail validation."""
        invalid_usernames = [
            "a",  # Too short
            "",  # Empty
            "user@name",  # Invalid character
            "user name",  # Contains space
            "user-name",  # Contains hyphen (if not allowed)
            "user!",  # Special character
        ]
        for username in invalid_usernames:
            assert not is_valid_username(username), f"Username '{username}' should be invalid"

    def test_username_length_requirements(self) -> None:
        """Test username length constraints."""
        assert not is_valid_username("ab")  # Too short
        assert is_valid_username("abc")  # Minimum valid
        assert is_valid_username("a" * 30)  # Long but valid
        assert not is_valid_username("a" * 256)  # Too long


class TestPhoneValidation:
    """Test phone number validation."""

    def test_valid_phone_numbers(self) -> None:
        """Test that valid phone numbers pass validation."""
        valid_phones = [
            "+1-234-567-8900",
            "1-234-567-8900",
            "234-567-8900",
            "+34-91-123-4567",
            "+44-20-7946-0958",
        ]
        for phone in valid_phones:
            assert is_valid_phone(phone), f"Phone '{phone}' should be valid"

    def test_invalid_phone_numbers(self) -> None:
        """Test that invalid phone numbers fail validation."""
        invalid_phones = [
            "123",  # Too short
            "abc-def-ghij",  # Non-numeric
            "",  # Empty
            "+" * 20,  # Invalid format
        ]
        for phone in invalid_phones:
            assert not is_valid_phone(phone), f"Phone '{phone}' should be invalid"


class TestURLValidation:
    """Test URL validation."""

    def test_valid_urls(self) -> None:
        """Test that valid URLs pass validation."""
        valid_urls = [
            "https://example.com",
            "http://www.example.com",
            "https://example.com/path",
            "https://example.com/path?query=value",
            "https://subdomain.example.com",
        ]
        for url in valid_urls:
            assert is_valid_url(url), f"URL '{url}' should be valid"

    def test_invalid_urls(self) -> None:
        """Test that invalid URLs fail validation."""
        invalid_urls = [
            "not a url",
            "example.com",  # Missing protocol
            "http://",  # No domain
            "ftp://example.com",  # Invalid protocol
            "",  # Empty
        ]
        for url in invalid_urls:
            assert not is_valid_url(url), f"URL '{url}' should be invalid"


# Simple validation function implementations for testing
def is_valid_email(email: str) -> bool:
    """Validate email address format."""
    if not email or "@" not in email:
        return False
    parts = email.split("@")
    if len(parts) != 2:
        return False
    local, domain = parts
    if not local or not domain or " " in email:
        return False
    if "." not in domain:
        return False
    return True


def is_valid_password(password: str) -> bool:
    """Validate password strength."""
    if len(password) < 8:
        return False
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    return has_upper and has_lower and has_digit


def is_valid_username(username: str) -> bool:
    """Validate username format."""
    if not username or len(username) < 3 or len(username) > 255:
        return False
    if " " in username:
        return False
    if "@" in username or "!" in username:
        return False
    return True


def is_valid_phone(phone: str) -> bool:
    """Validate phone number format."""
    if not phone or len(phone) < 7:
        return False
    # Remove common formatting characters
    cleaned = phone.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    if not cleaned.replace("+", "").isdigit():
        return False
    return len(cleaned.replace("+", "")) >= 7


def is_valid_url(url: str) -> bool:
    """Validate URL format."""
    if not url:
        return False
    if not (url.startswith("http://") or url.startswith("https://")):
        return False
    after_protocol = url.split("://", 1)[1]
    if not after_protocol or "." not in after_protocol.split("/")[0]:
        return False
    return True
