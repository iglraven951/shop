"""Generic CRUD service base class for reusable database operations."""

import logging
from typing import Generic, TypeVar, List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

T = TypeVar('T')


class BaseService(Generic[T]):
    """
    Generic base service for CRUD operations.

    Provides reusable methods for database operations with:
    - Automatic timestamp management (created_at, updated_at)
    - Centralized error handling and logging
    - Automatic input validation
    - Pagination support
    - Full-text search capabilities
    - Soft delete support (is_deleted field)
    """

    def __init__(self, model_class: type[T], db_session: Any):
        """
        Initialize BaseService.

        Args:
            model_class: SQLAlchemy model class
            db_session: SQLAlchemy database session
        """
        self.model_class = model_class
        self.db = db_session
        self.logger = logging.getLogger(self.__class__.__name__)

    async def create(self, data: Dict[str, Any]) -> T:
        """
        Create a new entity.

        Args:
            data: Dictionary with entity data

        Returns:
            Created entity instance

        Raises:
            ValueError: If required fields are missing
            IntegrityError: If unique constraint violated
        """
        try:
            if not data:
                raise ValueError("Data cannot be empty")

            # Auto-set created_at if model supports it
            if hasattr(self.model_class, 'created_at'):
                data.setdefault('created_at', datetime.utcnow())

            # Create instance
            instance = self.model_class(**data)

            self.db.session.add(instance)
            self.db.session.commit()

            self.logger.info(
                f"Created {self.model_class.__name__} with id: {getattr(instance, 'id', 'N/A')}"
            )
            return instance

        except IntegrityError as e:
            self.db.session.rollback()
            self.logger.error(f"Integrity error creating {self.model_class.__name__}: {str(e)}")
            raise ValueError(f"Duplicate or invalid data: {str(e)}")

        except (ValueError, TypeError) as e:
            self.db.session.rollback()
            self.logger.error(f"Validation error: {str(e)}")
            raise

        except Exception as e:
            self.db.session.rollback()
            self.logger.error(f"Error creating {self.model_class.__name__}: {str(e)}")
            raise

    async def read(self, id_value: Any) -> Optional[T]:
        """
        Read entity by ID.

        Args:
            id_value: Entity ID value

        Returns:
            Entity instance or None if not found
        """
        try:
            instance = self.model_class.query.filter_by(id=id_value).first()

            if instance and hasattr(instance, 'is_deleted') and instance.is_deleted:
                return None

            return instance

        except Exception as e:
            self.logger.error(f"Error reading {self.model_class.__name__} with id {id_value}: {str(e)}")
            raise

    async def update(self, id_value: Any, data: Dict[str, Any]) -> Optional[T]:
        """
        Update existing entity.

        Args:
            id_value: Entity ID
            data: Dictionary with fields to update

        Returns:
            Updated entity instance or None if not found

        Raises:
            ValueError: If data is empty
        """
        try:
            if not data:
                raise ValueError("Update data cannot be empty")

            instance = await self.read(id_value)
            if not instance:
                self.logger.warning(f"{self.model_class.__name__} with id {id_value} not found")
                return None

            # Auto-update updated_at if model supports it
            if hasattr(self.model_class, 'updated_at'):
                data['updated_at'] = datetime.utcnow()

            # Update fields
            for key, value in data.items():
                if hasattr(instance, key):
                    setattr(instance, key, value)

            self.db.session.commit()

            self.logger.info(f"Updated {self.model_class.__name__} with id: {id_value}")
            return instance

        except IntegrityError as e:
            self.db.session.rollback()
            self.logger.error(f"Integrity error updating {self.model_class.__name__}: {str(e)}")
            raise ValueError(f"Invalid update data: {str(e)}")

        except Exception as e:
            self.db.session.rollback()
            self.logger.error(f"Error updating {self.model_class.__name__}: {str(e)}")
            raise

    async def delete(self, id_value: Any, soft: bool = True) -> bool:
        """
        Delete entity (soft or hard delete).

        Args:
            id_value: Entity ID
            soft: If True, mark as deleted; if False, permanently delete

        Returns:
            True if deleted, False if not found
        """
        try:
            instance = await self.read(id_value)
            if not instance:
                return False

            if soft and hasattr(instance, 'is_deleted'):
                instance.is_deleted = True
                if hasattr(instance, 'deleted_at'):
                    instance.deleted_at = datetime.utcnow()
                self.db.session.commit()
            else:
                self.db.session.delete(instance)
                self.db.session.commit()

            self.logger.info(f"Deleted {self.model_class.__name__} with id: {id_value}")
            return True

        except Exception as e:
            self.db.session.rollback()
            self.logger.error(f"Error deleting {self.model_class.__name__}: {str(e)}")
            raise

    async def list(
        self,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        per_page: int = 20,
        order_by: Optional[str] = None
    ) -> Tuple[List[T], int]:
        """
        List entities with pagination and filtering.

        Args:
            filters: Dictionary of filter conditions
            page: Page number (1-indexed)
            per_page: Items per page
            order_by: Field name to order by (prefix with '-' for DESC)

        Returns:
            Tuple of (entities list, total count)
        """
        try:
            query = self.model_class.query

            # Apply soft delete filter
            if hasattr(self.model_class, 'is_deleted'):
                query = query.filter_by(is_deleted=False)

            # Apply filters
            if filters:
                for key, value in filters.items():
                    if hasattr(self.model_class, key) and value is not None:
                        query = query.filter(getattr(self.model_class, key) == value)

            # Get total count before pagination
            total = query.count()

            # Apply ordering
            if order_by:
                if order_by.startswith('-'):
                    query = query.order_by(getattr(self.model_class, order_by[1:]).desc())
                else:
                    query = query.order_by(getattr(self.model_class, order_by).asc())

            # Apply pagination
            offset = (page - 1) * per_page
            entities = query.offset(offset).limit(per_page).all()

            return entities, total

        except Exception as e:
            self.logger.error(f"Error listing {self.model_class.__name__}: {str(e)}")
            raise

    async def search(self, query_text: str, search_fields: List[str]) -> List[T]:
        """
        Search entities by text in multiple fields.

        Args:
            query_text: Search query
            search_fields: List of field names to search

        Returns:
            List of matching entities
        """
        try:
            if not query_text or not search_fields:
                return []

            # Build OR conditions for each field
            conditions = [
                getattr(self.model_class, field).ilike(f"%{query_text}%")
                for field in search_fields
                if hasattr(self.model_class, field)
            ]

            if not conditions:
                return []

            query = self.model_class.query.filter(or_(*conditions))

            # Exclude soft-deleted items
            if hasattr(self.model_class, 'is_deleted'):
                query = query.filter_by(is_deleted=False)

            return query.all()

        except Exception as e:
            self.logger.error(f"Error searching {self.model_class.__name__}: {str(e)}")
            raise

    async def bulk_create(self, data_list: List[Dict[str, Any]]) -> List[T]:
        """
        Create multiple entities in bulk.

        Args:
            data_list: List of dictionaries with entity data

        Returns:
            List of created entities
        """
        try:
            instances = []

            for data in data_list:
                if hasattr(self.model_class, 'created_at'):
                    data.setdefault('created_at', datetime.utcnow())

                instance = self.model_class(**data)
                instances.append(instance)

            self.db.session.add_all(instances)
            self.db.session.commit()

            self.logger.info(f"Bulk created {len(instances)} {self.model_class.__name__} entities")
            return instances

        except Exception as e:
            self.db.session.rollback()
            self.logger.error(f"Error bulk creating {self.model_class.__name__}: {str(e)}")
            raise

    async def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """
        Count entities matching filters.

        Args:
            filters: Dictionary of filter conditions

        Returns:
            Total count
        """
        try:
            query = self.model_class.query

            if hasattr(self.model_class, 'is_deleted'):
                query = query.filter_by(is_deleted=False)

            if filters:
                for key, value in filters.items():
                    if hasattr(self.model_class, key) and value is not None:
                        query = query.filter(getattr(self.model_class, key) == value)

            return query.count()

        except Exception as e:
            self.logger.error(f"Error counting {self.model_class.__name__}: {str(e)}")
            raise
