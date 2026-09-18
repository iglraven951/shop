"""Comprehensive unit tests for authentication module (backend/auth.py).

Test Coverage:
- JWT token generation (20 tests)
- JWT token verification (15 tests)
- Password hashing (10 tests)
- Token extraction from headers (15 tests)
Total: 60+ tests

All tests use pytest with proper mocking, fixtures, and isolation.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock
from typing import Optional

import jwt
from werkzeug.security import generate_password_hash

from backend.auth import (
    generate_jwt_token,
    verify_jwt_token,
    hash_password,
    verify_password,
    extract_token_from_request,
    token_required,
    admin_required,
    seller_required,
    refresh_token_required,
)
from backend.exceptions import UnauthorizedAccessException


# ============================================================================
# JWT TOKEN GENERATION TESTS (20 tests)
# ============================================================================

class TestGenerateJWTToken:
    """Test suite for JWT token generation."""

    def test_generate_token_with_valid_user_id(self, app_context, valid_user_id: str):
        """Test generating a valid JWT token with default expiration."""
        token = generate_jwt_token(valid_user_id)

        assert isinstance(token, str)
        assert len(token) > 0
        # JWT tokens have three parts separated by dots
        assert token.count(".") == 2

    def test_generate_token_creates_valid_jwt(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test that generated token is a valid JWT that can be decoded."""
        token = generate_jwt_token(valid_user_id)
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        assert decoded["user_id"] == valid_user_id
        assert decoded["token_type"] == "access"

    def test_generate_token_with_custom_expiration(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test generating token with custom expiration time."""
        custom_expiration = 3600  # 1 hour
        token = generate_jwt_token(valid_user_id, expires_in=custom_expiration)
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        # Verify expiration is approximately correct (within 5 seconds tolerance)
        exp_time = decoded["exp"]
        iat_time = decoded["iat"]
        time_diff = exp_time - iat_time

        assert abs(time_diff - custom_expiration) < 5

    def test_generate_token_with_long_expiration(
        self, app_context, valid_user_id: str
    ):
        """Test generating token with very long expiration time."""
        long_expiration = 365 * 24 * 60 * 60  # 1 year
        token = generate_jwt_token(valid_user_id, expires_in=long_expiration)

        assert isinstance(token, str)
        assert len(token) > 0

    def test_generate_token_with_short_expiration(
        self, app_context, valid_user_id: str
    ):
        """Test generating token with very short expiration time."""
        short_expiration = 60  # 1 minute
        token = generate_jwt_token(valid_user_id, expires_in=short_expiration)

        assert isinstance(token, str)

    def test_generate_token_with_zero_expiration(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test generating token with zero expiration (already expired)."""
        token = generate_jwt_token(valid_user_id, expires_in=0)
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        # Token should have same or very close exp and iat
        assert abs(decoded["exp"] - decoded["iat"]) <= 1

    def test_generate_access_token_type(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test generating token with access type."""
        token = generate_jwt_token(valid_user_id, token_type="access")
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        assert decoded["token_type"] == "access"

    def test_generate_refresh_token_type(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test generating token with refresh type."""
        token = generate_jwt_token(valid_user_id, token_type="refresh")
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        assert decoded["token_type"] == "refresh"

    def test_generate_token_with_custom_token_type(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test generating token with custom token type."""
        custom_type = "custom_type"
        token = generate_jwt_token(valid_user_id, token_type=custom_type)
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        assert decoded["token_type"] == custom_type

    def test_generate_token_includes_user_id(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test that token payload includes user_id."""
        token = generate_jwt_token(valid_user_id)
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        assert "user_id" in decoded
        assert decoded["user_id"] == valid_user_id

    def test_generate_token_includes_iat_claim(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test that token includes issued-at (iat) claim."""
        token = generate_jwt_token(valid_user_id)
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        assert "iat" in decoded
        assert isinstance(decoded["iat"], (int, datetime))

    def test_generate_token_includes_exp_claim(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test that token includes expiration (exp) claim."""
        token = generate_jwt_token(valid_user_id)
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        assert "exp" in decoded

    def test_generate_token_without_secret_key_raises_error(
        self, app: object, valid_user_id: str
    ):
        """Test that missing JWT_SECRET_KEY raises ValueError."""
        with patch.object(
            __import__("flask").current_app,
            "config",
            {"get": lambda x: None}
        ):
            with pytest.raises(ValueError, match="JWT_SECRET_KEY not configured"):
                generate_jwt_token(valid_user_id)

    def test_generate_token_with_empty_secret_key_raises_error(
        self, app_context, valid_user_id: str
    ):
        """Test that empty JWT_SECRET_KEY raises ValueError."""
        with patch("flask.current_app.config.get", return_value=""):
            with pytest.raises(ValueError, match="JWT_SECRET_KEY not configured"):
                generate_jwt_token(valid_user_id)

    def test_generate_multiple_tokens_are_different(
        self, app_context, valid_user_id: str
    ):
        """Test that multiple tokens generated have different signatures."""
        token1 = generate_jwt_token(valid_user_id)
        token2 = generate_jwt_token(valid_user_id)

        # Tokens should be different due to different iat times
        assert token1 != token2

    def test_generate_token_with_numeric_user_id(self, app_context):
        """Test generating token with numeric user ID."""
        numeric_user_id = "12345"
        token = generate_jwt_token(numeric_user_id)

        assert isinstance(token, str)

    def test_generate_token_with_special_characters_in_user_id(
        self, app_context
    ):
        """Test generating token with special characters in user ID."""
        special_user_id = "user-123_456@domain"
        token = generate_jwt_token(special_user_id)

        assert isinstance(token, str)

    def test_generate_token_with_very_long_user_id(self, app_context):
        """Test generating token with very long user ID."""
        long_user_id = "a" * 1000
        token = generate_jwt_token(long_user_id)

        assert isinstance(token, str)

    def test_generate_token_default_expiration_is_7_days(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test that default expiration is 7 days."""
        token = generate_jwt_token(valid_user_id)
        decoded = jwt.decode(
            token,
            auth_config["SECRET_KEY"],
            algorithms=["HS256"]
        )

        expected_expiration = auth_config["DEFAULT_EXPIRATION"]
        actual_expiration = decoded["exp"] - decoded["iat"]

        # Allow 5 second tolerance for execution time
        assert abs(actual_expiration - expected_expiration) < 5


# ============================================================================
# JWT TOKEN VERIFICATION TESTS (15 tests)
# ============================================================================

class TestVerifyJWTToken:
    """Test suite for JWT token verification."""

    def test_verify_valid_token_returns_payload(
        self, app_context, valid_user_id: str
    ):
        """Test verifying a valid token returns the payload."""
        token = generate_jwt_token(valid_user_id)
        payload = verify_jwt_token(token)

        assert payload is not None
        assert isinstance(payload, dict)
        assert payload["user_id"] == valid_user_id

    def test_verify_token_payload_contains_user_id(
        self, app_context, valid_user_id: str
    ):
        """Test that verified payload contains user_id."""
        token = generate_jwt_token(valid_user_id)
        payload = verify_jwt_token(token)

        assert "user_id" in payload
        assert payload["user_id"] == valid_user_id

    def test_verify_token_payload_contains_token_type(
        self, app_context, valid_user_id: str
    ):
        """Test that verified payload contains token_type."""
        token = generate_jwt_token(valid_user_id, token_type="access")
        payload = verify_jwt_token(token)

        assert "token_type" in payload
        assert payload["token_type"] == "access"

    def test_verify_expired_token_returns_none(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test that expired token returns None."""
        # Create manually expired token
        secret = auth_config["SECRET_KEY"]
        expired_payload = {
            "user_id": valid_user_id,
            "token_type": "access",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),  # Expired
        }
        expired_token = jwt.encode(expired_payload, secret, algorithm="HS256")

        result = verify_jwt_token(expired_token)
        assert result is None

    def test_verify_token_with_invalid_signature_returns_none(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test that token with invalid signature returns None."""
        # Create token with wrong secret
        wrong_secret = "wrong-secret-key"
        payload = {
            "user_id": valid_user_id,
            "token_type": "access",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        }
        tampered_token = jwt.encode(payload, wrong_secret, algorithm="HS256")

        result = verify_jwt_token(tampered_token)
        assert result is None

    def test_verify_malformed_token_returns_none(self, app_context):
        """Test that malformed token returns None."""
        malformed_token = "invalid.token.format.extra"
        result = verify_jwt_token(malformed_token)
        assert result is None

    def test_verify_empty_token_returns_none(self, app_context):
        """Test that empty token string returns None."""
        result = verify_jwt_token("")
        assert result is None

    def test_verify_token_with_missing_user_id_returns_payload(
        self, app_context, auth_config: dict
    ):
        """Test that token without user_id still returns payload."""
        secret = auth_config["SECRET_KEY"]
        payload_without_user_id = {
            "token_type": "access",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        }
        token = jwt.encode(payload_without_user_id, secret, algorithm="HS256")

        result = verify_jwt_token(token)
        assert result is not None
        assert "user_id" not in result

    def test_verify_token_with_extra_claims(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test that token with extra claims is verified successfully."""
        secret = auth_config["SECRET_KEY"]
        payload_with_extra = {
            "user_id": valid_user_id,
            "token_type": "access",
            "custom_claim": "custom_value",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        }
        token = jwt.encode(payload_with_extra, secret, algorithm="HS256")

        result = verify_jwt_token(token)
        assert result is not None
        assert result["custom_claim"] == "custom_value"

    def test_verify_token_without_secret_key_raises_error(
        self, app_context, valid_user_id: str
    ):
        """Test that missing JWT_SECRET_KEY raises ValueError."""
        token = generate_jwt_token(valid_user_id)

        with patch("flask.current_app.config.get", return_value=None):
            with pytest.raises(ValueError, match="JWT_SECRET_KEY not configured"):
                verify_jwt_token(token)

    def test_verify_token_preserves_all_claims(
        self, app_context, valid_user_id: str
    ):
        """Test that verification preserves all token claims."""
        token = generate_jwt_token(valid_user_id)
        payload = verify_jwt_token(token)

        assert "user_id" in payload
        assert "token_type" in payload
        assert "iat" in payload
        assert "exp" in payload

    def test_verify_token_with_unicode_user_id(self, app_context, auth_config: dict):
        """Test verifying token with Unicode characters in user_id."""
        unicode_user_id = "user_ñ_é_ü_中文_日本語"
        token = generate_jwt_token(unicode_user_id)
        payload = verify_jwt_token(token)

        assert payload["user_id"] == unicode_user_id

    def test_verify_token_just_before_expiration(
        self, app_context, valid_user_id: str, auth_config: dict
    ):
        """Test verifying token that's about to expire."""
        secret = auth_config["SECRET_KEY"]
        # Token expires in 1 second
        nearly_expired_payload = {
            "user_id": valid_user_id,
            "token_type": "access",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(seconds=1),
        }
        token = jwt.encode(nearly_expired_payload, secret, algorithm="HS256")

        result = verify_jwt_token(token)
        assert result is not None

    def test_verify_token_with_whitespace_returns_none(self, app_context):
        """Test that token with only whitespace returns None."""
        result = verify_jwt_token("   ")
        assert result is None


# ============================================================================
# PASSWORD HASHING TESTS (10 tests)
# ============================================================================

class TestPasswordHashing:
    """Test suite for password hashing and verification."""

    def test_hash_password_returns_string(self, app_context, valid_password: str):
        """Test that hash_password returns a string."""
        hashed = hash_password(valid_password)
        assert isinstance(hashed, str)

    def test_hash_password_is_not_plaintext(
        self, app_context, valid_password: str
    ):
        """Test that hash_password does not return plaintext."""
        hashed = hash_password(valid_password)
        assert hashed != valid_password
        assert valid_password not in hashed

    def test_hash_password_produces_long_string(
        self, app_context, valid_password: str
    ):
        """Test that hash is significantly longer than password."""
        hashed = hash_password(valid_password)
        assert len(hashed) > len(valid_password)
        assert len(hashed) >= 50  # Typical bcrypt hash length

    def test_verify_correct_password(
        self, app_context, valid_password: str
    ):
        """Test verifying correct password against hash."""
        hashed = hash_password(valid_password)
        result = verify_password(valid_password, hashed)
        assert result is True

    def test_verify_incorrect_password(
        self, app_context, valid_password: str
    ):
        """Test verifying incorrect password against hash."""
        hashed = hash_password(valid_password)
        incorrect_password = "WrongPassword123!@#"
        result = verify_password(incorrect_password, hashed)
        assert result is False

    def test_same_password_produces_different_hashes(
        self, app_context, valid_password: str
    ):
        """Test that same password produces different hashes (salted)."""
        hash1 = hash_password(valid_password)
        hash2 = hash_password(valid_password)

        # Different hashes due to random salt
        assert hash1 != hash2
        # But both verify correctly
        assert verify_password(valid_password, hash1)
        assert verify_password(valid_password, hash2)

    def test_hash_empty_password(self, app_context):
        """Test hashing an empty password."""
        empty_password = ""
        hashed = hash_password(empty_password)

        assert isinstance(hashed, str)
        assert len(hashed) > 0
        # Empty password should verify
        assert verify_password(empty_password, hashed)

    def test_hash_very_long_password(self, app_context):
        """Test hashing a very long password."""
        long_password = "p" * 1000
        hashed = hash_password(long_password)

        assert isinstance(hashed, str)
        assert verify_password(long_password, hashed)

    def test_hash_password_with_special_characters(self, app_context):
        """Test hashing password with special characters."""
        special_password = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`"
        hashed = hash_password(special_password)

        assert verify_password(special_password, hashed)

    def test_hash_password_with_unicode_characters(self, app_context):
        """Test hashing password with Unicode characters."""
        unicode_password = "パスワード密码🔐🔑"
        hashed = hash_password(unicode_password)

        assert verify_password(unicode_password, hashed)
        # Wrong password with similar unicode doesn't verify
        wrong_password = "パスワード密码🔐"
        assert not verify_password(wrong_password, hashed)


# ============================================================================
# TOKEN EXTRACTION FROM HEADERS TESTS (15 tests)
# ============================================================================

class TestExtractTokenFromRequest:
    """Test suite for token extraction from request headers."""

    def test_extract_valid_bearer_token(self, app_context):
        """Test extracting valid Bearer token from Authorization header."""
        token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature"

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"Bearer {token}"

            result = extract_token_from_request()
            assert result == token

    def test_extract_returns_none_without_authorization_header(
        self, app_context
    ):
        """Test that missing Authorization header returns None."""
        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = ""

            result = extract_token_from_request()
            assert result is None

    def test_extract_returns_none_for_non_bearer_token(
        self, app_context
    ):
        """Test that non-Bearer token returns None."""
        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = "Basic dXNlcjpwYXNz"

            result = extract_token_from_request()
            assert result is None

    def test_extract_returns_none_for_malformed_bearer(
        self, app_context
    ):
        """Test that malformed Bearer header returns None."""
        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = "Bearer"  # No space/token

            result = extract_token_from_request()
            assert result is None

    def test_extract_returns_none_for_bearer_with_no_token(
        self, app_context
    ):
        """Test that Bearer with empty token returns None."""
        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = "Bearer "  # Space only

            result = extract_token_from_request()
            assert result is None

    def test_extract_token_case_sensitive(self, app_context):
        """Test that Bearer prefix is case sensitive."""
        token = "test.token.value"

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"bearer {token}"  # lowercase

            result = extract_token_from_request()
            assert result is None

    def test_extract_complex_jwt_token(self, app_context):
        """Test extracting complex JWT token with multiple parts."""
        token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzIn0.abcdefghijklmnopqrstuvwxyz"

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"Bearer {token}"

            result = extract_token_from_request()
            assert result == token

    def test_extract_token_with_extra_whitespace(self, app_context):
        """Test extracting token with extra whitespace."""
        token = "test.token.value"

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"Bearer  {token}"  # Double space

            result = extract_token_from_request()
            # Should include the extra space in token
            assert result == f" {token}"

    def test_extract_token_with_trailing_whitespace(self, app_context):
        """Test extracting token with trailing whitespace."""
        token = "test.token.value"

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"Bearer {token}  "

            result = extract_token_from_request()
            # Should include trailing whitespace in token
            assert result == f"{token}  "

    def test_extract_token_from_missing_header_returns_none(
        self, app_context
    ):
        """Test that truly missing header returns None."""
        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = None

            result = extract_token_from_request()
            assert result is None

    def test_extract_multiple_bearer_tokens(self, app_context):
        """Test extracting first Bearer token when multiple present."""
        token = "valid.token.here"

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"Bearer {token} Bearer another.token"

            result = extract_token_from_request()
            # Should extract everything after "Bearer "
            assert result == f"{token} Bearer another.token"

    def test_extract_token_with_special_characters(self, app_context):
        """Test extracting token containing special characters."""
        token = "header.payload-signature_v1.0"

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"Bearer {token}"

            result = extract_token_from_request()
            assert result == token

    def test_extract_token_all_digits(self, app_context):
        """Test extracting token that's all digits."""
        token = "123456789012345678901234567890"

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"Bearer {token}"

            result = extract_token_from_request()
            assert result == token

    def test_extract_token_very_long(self, app_context):
        """Test extracting very long token."""
        long_token = "a" * 5000

        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = f"Bearer {long_token}"

            result = extract_token_from_request()
            assert result == long_token
            assert len(result) == 5000

    def test_extract_token_calls_get_with_authorization(self, app_context):
        """Test that extract calls headers.get with 'Authorization' key."""
        with patch("flask.request") as mock_request:
            mock_request.headers.get.return_value = ""

            extract_token_from_request()
            mock_request.headers.get.assert_called_with("Authorization", "")


# ============================================================================
# INTEGRATION TESTS - Token Generation and Verification
# ============================================================================

class TestTokenGenerationAndVerification:
    """Integration tests for token generation and verification."""

    def test_generate_and_verify_token_roundtrip(
        self, app_context, valid_user_id: str
    ):
        """Test complete cycle of generating and verifying token."""
        token = generate_jwt_token(valid_user_id)
        payload = verify_jwt_token(token)

        assert payload is not None
        assert payload["user_id"] == valid_user_id
        assert payload["token_type"] == "access"

    def test_token_roundtrip_with_refresh_type(
        self, app_context, valid_user_id: str
    ):
        """Test roundtrip with refresh token type."""
        token = generate_jwt_token(valid_user_id, token_type="refresh")
        payload = verify_jwt_token(token)

        assert payload["token_type"] == "refresh"

    def test_token_roundtrip_with_custom_expiration(
        self, app_context, valid_user_id: str
    ):
        """Test roundtrip with custom expiration."""
        custom_exp = 1800  # 30 minutes
        token = generate_jwt_token(valid_user_id, expires_in=custom_exp)
        payload = verify_jwt_token(token)

        assert payload is not None

    def test_altered_token_fails_verification(
        self, app_context, valid_user_id: str
    ):
        """Test that altered token fails verification."""
        token = generate_jwt_token(valid_user_id)
        # Tamper with token
        altered_token = token[:-10] + "0123456789"

        payload = verify_jwt_token(altered_token)
        assert payload is None

    def test_token_from_different_user_has_different_id(
        self, app_context
    ):
        """Test that tokens from different users have different IDs."""
        user1 = "user-1"
        user2 = "user-2"

        token1 = generate_jwt_token(user1)
        token2 = generate_jwt_token(user2)

        payload1 = verify_jwt_token(token1)
        payload2 = verify_jwt_token(token2)

        assert payload1["user_id"] == user1
        assert payload2["user_id"] == user2
        assert payload1["user_id"] != payload2["user_id"]


# ============================================================================
# INTEGRATION TESTS - Password Hashing and Verification
# ============================================================================

class TestPasswordHashingIntegration:
    """Integration tests for password operations."""

    def test_password_hashing_roundtrip(
        self, app_context, valid_password: str
    ):
        """Test complete cycle of hashing and verifying password."""
        hashed = hash_password(valid_password)
        is_valid = verify_password(valid_password, hashed)

        assert is_valid is True

    def test_password_case_sensitivity(self, app_context):
        """Test that passwords are case sensitive."""
        password = "MyPassword123"
        hashed = hash_password(password)

        # Same case should work
        assert verify_password("MyPassword123", hashed)

        # Different case should fail
        assert not verify_password("mypassword123", hashed)
        assert not verify_password("MYPASSWORD123", hashed)

    def test_password_with_spaces(self, app_context):
        """Test password containing spaces."""
        password = "My Password With Spaces 123"
        hashed = hash_password(password)

        assert verify_password(password, hashed)
        assert not verify_password("MyPasswordWithSpaces123", hashed)

    def test_password_boundary_conditions(self, app_context):
        """Test various password boundary conditions."""
        passwords = [
            "a",  # Single character
            "a" * 100,  # Long password
            "!@#$%^&*()",  # Special chars
            "   ",  # Only spaces
            "password\n",  # Newline
            "password\t",  # Tab
        ]

        for pwd in passwords:
            hashed = hash_password(pwd)
            assert verify_password(pwd, hashed)
            assert not verify_password(pwd + "x", hashed)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
