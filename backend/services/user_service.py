"""User service for authentication and profile management."""

import logging
from typing import Tuple, Optional
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
from flask import current_app

from ..dtos import UserDTO, ProfileDTO, UpdateProfileDTO
from ..exceptions import (
    InvalidCredentialsException,
    UserNotFoundException,
    ValidationException,
    ConflictException,
)


logger = logging.getLogger(__name__)


class UserService:
    """Service for user management and authentication."""

    def __init__(self, db):
        """Initialize service with database instance."""
        self.db = db

    def register(
        self, email: str, password: str, username: str, full_name: str
    ) -> Tuple[UserDTO, str]:
        """
        Register a new user.

        Args:
            email: User email address
            password: User password (will be hashed)
            username: Unique username
            full_name: User's full name

        Returns:
            Tuple of (UserDTO, jwt_token)

        Raises:
            ValidationException: If input validation fails
            ConflictException: If email or username already exists
        """
        # Validate input
        if not email or "@" not in email:
            raise ValidationException("Invalid email address")
        if not password or len(password) < 8:
            raise ValidationException("Password must be at least 8 characters")
        if not username or len(username) < 3:
            raise ValidationException("Username must be at least 3 characters")
        if not full_name or len(full_name) < 2:
            raise ValidationException("Full name is required")

        # Check if email already exists
        from ..models import User  # Import here to avoid circular imports

        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            raise ConflictException("Email already registered")

        # Check if username already exists
        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            raise ConflictException("Username already taken")

        # Create new user
        hashed_password = generate_password_hash(password)
        user = User(
            email=email,
            password=hashed_password,
            username=username,
            created_at=datetime.utcnow(),
        )

        # Create user profile
        from ..models import Profile

        profile = Profile(
            full_name=full_name,
            bio=None,
            location=None,
            phone=None,
            rating=0.0,
            total_reviews=0,
            seller_verified=False,
            is_buyer=True,
            is_seller=False,
            created_at=datetime.utcnow(),
        )

        user.profile = profile

        try:
            self.db.session.add(user)
            self.db.session.commit()
            logger.info(f"User registered successfully: {email}")

            # Generate JWT token
            token = self._generate_jwt_token(user.id)

            return UserDTO(
                id=user.id,
                username=user.username,
                email=user.email,
                avatar_url=profile.avatar_url,
                is_seller=profile.is_seller,
                is_buyer=profile.is_buyer,
                created_at=user.created_at,
            ), token

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Registration failed: {str(e)}")
            raise ValidationException(f"Registration failed: {str(e)}")

    def login(self, email: str, password: str) -> Tuple[UserDTO, str]:
        """
        Authenticate user and return JWT token.

        Args:
            email: User email address
            password: User password (will be verified)

        Returns:
            Tuple of (UserDTO, jwt_token)

        Raises:
            InvalidCredentialsException: If credentials are invalid
        """
        from ..models import User

        user = User.query.filter_by(email=email).first()

        if not user or not check_password_hash(user.password, password):
            logger.warning(f"Login failed for email: {email}")
            raise InvalidCredentialsException()

        # Generate JWT token
        token = self._generate_jwt_token(user.id)

        logger.info(f"User logged in: {email}")

        return (
            UserDTO(
                id=user.id,
                username=user.username,
                email=user.email,
                avatar_url=user.profile.avatar_url if user.profile else None,
                is_seller=user.profile.is_seller if user.profile else False,
                is_buyer=user.profile.is_buyer if user.profile else True,
                created_at=user.created_at,
            ),
            token,
        )

    def get_user_profile(self, user_id: int) -> ProfileDTO:
        """
        Get user profile by user ID.

        Args:
            user_id: User ID

        Returns:
            ProfileDTO with user profile information

        Raises:
            UserNotFoundException: If user not found
        """
        from ..models import User

        user = User.query.get(user_id)
        if not user or not user.profile:
            raise UserNotFoundException()

        profile = user.profile

        return ProfileDTO(
            user_id=user.id,
            full_name=profile.full_name,
            bio=profile.bio,
            location=profile.location,
            phone=profile.phone,
            avatar_url=profile.avatar_url,
            rating=profile.rating,
            total_reviews=profile.total_reviews,
            seller_verified=profile.seller_verified,
            is_buyer=profile.is_buyer,
            is_seller=profile.is_seller,
            created_at=profile.created_at,
        )

    def update_profile(self, user_id: int, data: UpdateProfileDTO) -> ProfileDTO:
        """
        Update user profile.

        Args:
            user_id: User ID
            data: UpdateProfileDTO with fields to update

        Returns:
            Updated ProfileDTO

        Raises:
            UserNotFoundException: If user not found
            ValidationException: If validation fails
        """
        from ..models import User

        user = User.query.get(user_id)
        if not user or not user.profile:
            raise UserNotFoundException()

        profile = user.profile

        # Update fields if provided
        if data.full_name:
            profile.full_name = data.full_name
        if data.bio is not None:
            profile.bio = data.bio
        if data.location is not None:
            profile.location = data.location
        if data.phone is not None:
            profile.phone = data.phone

        try:
            self.db.session.commit()
            logger.info(f"Profile updated for user: {user_id}")

            return ProfileDTO(
                user_id=user.id,
                full_name=profile.full_name,
                bio=profile.bio,
                location=profile.location,
                phone=profile.phone,
                avatar_url=profile.avatar_url,
                rating=profile.rating,
                total_reviews=profile.total_reviews,
                seller_verified=profile.seller_verified,
                is_buyer=profile.is_buyer,
                is_seller=profile.is_seller,
                created_at=profile.created_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Profile update failed: {str(e)}")
            raise ValidationException(f"Profile update failed: {str(e)}")

    def toggle_seller_role(self, user_id: int) -> ProfileDTO:
        """
        Toggle seller role for user.

        Args:
            user_id: User ID

        Returns:
            Updated ProfileDTO

        Raises:
            UserNotFoundException: If user not found
        """
        from ..models import User

        user = User.query.get(user_id)
        if not user or not user.profile:
            raise UserNotFoundException()

        profile = user.profile
        profile.is_seller = not profile.is_seller

        try:
            self.db.session.commit()
            logger.info(
                f"Seller role toggled for user {user_id}: {profile.is_seller}"
            )

            return ProfileDTO(
                user_id=user.id,
                full_name=profile.full_name,
                bio=profile.bio,
                location=profile.location,
                phone=profile.phone,
                avatar_url=profile.avatar_url,
                rating=profile.rating,
                total_reviews=profile.total_reviews,
                seller_verified=profile.seller_verified,
                is_buyer=profile.is_buyer,
                is_seller=profile.is_seller,
                created_at=profile.created_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Seller role toggle failed: {str(e)}")
            raise ValidationException(f"Role toggle failed: {str(e)}")

    def verify_seller(self, user_id: int, admin_id: int) -> bool:
        """
        Verify seller account (admin only).

        Args:
            user_id: User ID to verify
            admin_id: Admin user ID (for audit trail)

        Returns:
            True if verification successful

        Raises:
            UserNotFoundException: If user not found
        """
        from ..models import User

        user = User.query.get(user_id)
        if not user or not user.profile:
            raise UserNotFoundException()

        profile = user.profile
        profile.seller_verified = True

        try:
            self.db.session.commit()
            logger.info(f"Seller verified by admin {admin_id}: {user_id}")
            return True

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Seller verification failed: {str(e)}")
            raise ValidationException(f"Verification failed: {str(e)}")

    def _generate_jwt_token(self, user_id: int) -> str:
        """
        Generate JWT token for user.

        Args:
            user_id: User ID

        Returns:
            JWT token string
        """
        payload = {
            "user_id": user_id,
            "exp": datetime.utcnow().timestamp() + (24 * 60 * 60),  # 24 hours
            "iat": datetime.utcnow().timestamp(),
        }

        token = jwt.encode(
            payload,
            current_app.config.get("JWT_SECRET_KEY", "secret"),
            algorithm="HS256",
        )

        return token

    def verify_jwt_token(self, token: str) -> Optional[int]:
        """
        Verify and decode JWT token.

        Args:
            token: JWT token string

        Returns:
            User ID if token is valid, None otherwise
        """
        try:
            payload = jwt.decode(
                token,
                current_app.config.get("JWT_SECRET_KEY", "secret"),
                algorithms=["HS256"],
            )
            return payload.get("user_id")

        except jwt.ExpiredSignatureError:
            logger.warning("JWT token expired")
            return None

        except jwt.InvalidTokenError:
            logger.warning("Invalid JWT token")
            return None
