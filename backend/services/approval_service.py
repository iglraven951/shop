"""Product approval service for admin workflow."""

import logging
from typing import List, Tuple, Optional
from datetime import datetime

from ..dtos import ApprovalDTO
from ..exceptions import (
    ProductNotFoundException,
    UserNotFoundException,
    UnauthorizedAccessException,
    ValidationException,
    ApprovalNotFoundException,
)


logger = logging.getLogger(__name__)


class ApprovalService:
    """Service for managing product approval workflow."""

    def __init__(self, db):
        """Initialize service with database instance."""
        self.db = db

    def request_approval(self, product_id: int, seller_id: int) -> ApprovalDTO:
        """
        Request product approval.

        Args:
            product_id: Product ID
            seller_id: Seller user ID (for authorization)

        Returns:
            ApprovalDTO with approval record

        Raises:
            ProductNotFoundException: If product not found
            UnauthorizedAccessException: If seller doesn't own product
            ValidationException: If approval already requested
        """
        from ..models import Product, ProductApproval

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        if product.seller_id != seller_id:
            raise UnauthorizedAccessException()

        # Check if approval already exists
        existing = ProductApproval.query.filter_by(product_id=product_id).first()
        if existing and existing.status in ["pending", "approved"]:
            raise ValidationException(f"Approval already {existing.status}")

        # Create approval request
        approval = ProductApproval(
            product_id=product_id,
            seller_id=seller_id,
            status="pending",
            reason=None,
            requested_at=datetime.utcnow(),
            reviewed_at=None,
            reviewed_by=None,
        )

        # Update product status
        product.status = "pending_approval"

        try:
            self.db.session.add(approval)
            self.db.session.commit()
            logger.info(f"Approval requested for product {product_id}")

            return ApprovalDTO(
                id=approval.id,
                product_id=approval.product_id,
                product_title=product.title,
                seller_id=approval.seller_id,
                seller_name=product.seller.username,
                status=approval.status,
                reason=approval.reason,
                requested_at=approval.requested_at,
                reviewed_at=approval.reviewed_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Approval request failed: {str(e)}")
            raise ValidationException(f"Approval request failed: {str(e)}")

    def get_pending_approvals(
        self, admin_id: Optional[int] = None, limit: int = 50, offset: int = 0
    ) -> Tuple[List[ApprovalDTO], int]:
        """
        Get pending product approvals.

        Args:
            admin_id: Optional admin ID (for audit trail - not used for filtering)
            limit: Number of results
            offset: Pagination offset

        Returns:
            Tuple of (approvals list, total count)
        """
        from ..models import ProductApproval

        query = ProductApproval.query.filter_by(status="pending")

        total = query.count()
        approvals = (
            query.order_by(ProductApproval.requested_at.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        approval_dtos = [
            ApprovalDTO(
                id=a.id,
                product_id=a.product_id,
                product_title=a.product.title,
                seller_id=a.seller_id,
                seller_name=a.product.seller.username,
                status=a.status,
                reason=a.reason,
                requested_at=a.requested_at,
                reviewed_at=a.reviewed_at,
            )
            for a in approvals
        ]

        return approval_dtos, total

    def get_approval_status(self, product_id: int) -> ApprovalDTO:
        """
        Get approval status for a product.

        Args:
            product_id: Product ID

        Returns:
            ApprovalDTO with approval status

        Raises:
            ApprovalNotFoundException: If no approval found
        """
        from ..models import ProductApproval

        approval = ProductApproval.query.filter_by(product_id=product_id).first()
        if not approval:
            raise ApprovalNotFoundException()

        product = approval.product

        return ApprovalDTO(
            id=approval.id,
            product_id=approval.product_id,
            product_title=product.title,
            seller_id=approval.seller_id,
            seller_name=product.seller.username,
            status=approval.status,
            reason=approval.reason,
            requested_at=approval.requested_at,
            reviewed_at=approval.reviewed_at,
        )

    def approve_product(self, product_id: int, admin_id: int) -> ApprovalDTO:
        """
        Approve a product.

        Args:
            product_id: Product ID
            admin_id: Admin user ID

        Returns:
            ApprovalDTO with updated approval

        Raises:
            ProductNotFoundException: If product not found
            ApprovalNotFoundException: If approval not found
            ValidationException: If approval already processed
        """
        from ..models import Product, ProductApproval

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        approval = ProductApproval.query.filter_by(product_id=product_id).first()
        if not approval:
            raise ApprovalNotFoundException()

        if approval.status != "pending":
            raise ValidationException(f"Approval already {approval.status}")

        # Update approval and product
        approval.status = "approved"
        approval.reviewed_at = datetime.utcnow()
        approval.reviewed_by = admin_id

        product.status = "approved"
        product.updated_at = datetime.utcnow()

        try:
            self.db.session.commit()
            logger.info(f"Product approved: {product_id} by admin {admin_id}")

            # Send notification to seller
            from .notification_service import NotificationService

            notification_service = NotificationService(self.db)
            notification_service.notify_product_approved(
                product_id, product.seller_id, product.title
            )

            return ApprovalDTO(
                id=approval.id,
                product_id=approval.product_id,
                product_title=product.title,
                seller_id=approval.seller_id,
                seller_name=product.seller.username,
                status=approval.status,
                reason=approval.reason,
                requested_at=approval.requested_at,
                reviewed_at=approval.reviewed_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Product approval failed: {str(e)}")
            raise ValidationException(f"Product approval failed: {str(e)}")

    def reject_product(
        self, product_id: int, admin_id: int, reason: str
    ) -> ApprovalDTO:
        """
        Reject a product.

        Args:
            product_id: Product ID
            admin_id: Admin user ID
            reason: Rejection reason

        Returns:
            ApprovalDTO with updated approval

        Raises:
            ProductNotFoundException: If product not found
            ApprovalNotFoundException: If approval not found
            ValidationException: If approval already processed or reason missing
        """
        from ..models import Product, ProductApproval

        if not reason or len(reason.strip()) == 0:
            raise ValidationException("Rejection reason is required")

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        approval = ProductApproval.query.filter_by(product_id=product_id).first()
        if not approval:
            raise ApprovalNotFoundException()

        if approval.status != "pending":
            raise ValidationException(f"Approval already {approval.status}")

        # Update approval and product
        approval.status = "rejected"
        approval.reason = reason
        approval.reviewed_at = datetime.utcnow()
        approval.reviewed_by = admin_id

        product.status = "rejected"
        product.updated_at = datetime.utcnow()

        try:
            self.db.session.commit()
            logger.info(f"Product rejected: {product_id} by admin {admin_id}")
            logger.info(f"Rejection reason: {reason}")

            # Send notification to seller
            from .notification_service import NotificationService

            notification_service = NotificationService(self.db)
            notification_service.notify_product_rejected(
                product_id, product.seller_id, product.title, reason
            )

            return ApprovalDTO(
                id=approval.id,
                product_id=approval.product_id,
                product_title=product.title,
                seller_id=approval.seller_id,
                seller_name=product.seller.username,
                status=approval.status,
                reason=approval.reason,
                requested_at=approval.requested_at,
                reviewed_at=approval.reviewed_at,
            )

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Product rejection failed: {str(e)}")
            raise ValidationException(f"Product rejection failed: {str(e)}")

    def get_product_approvals_history(
        self, product_id: int
    ) -> List[ApprovalDTO]:
        """
        Get approval history for a product.

        Args:
            product_id: Product ID

        Returns:
            List of all approvals for the product

        Raises:
            ProductNotFoundException: If product not found
        """
        from ..models import Product, ProductApproval

        product = Product.query.get(product_id)
        if not product:
            raise ProductNotFoundException()

        approvals = ProductApproval.query.filter_by(product_id=product_id).order_by(
            ProductApproval.requested_at.desc()
        ).all()

        return [
            ApprovalDTO(
                id=a.id,
                product_id=a.product_id,
                product_title=product.title,
                seller_id=a.seller_id,
                seller_name=product.seller.username,
                status=a.status,
                reason=a.reason,
                requested_at=a.requested_at,
                reviewed_at=a.reviewed_at,
            )
            for a in approvals
        ]

    def get_seller_approvals(
        self, seller_id: int, limit: int = 20, offset: int = 0
    ) -> Tuple[List[ApprovalDTO], int]:
        """
        Get all approvals for a specific seller.

        Args:
            seller_id: Seller user ID
            limit: Number of results
            offset: Pagination offset

        Returns:
            Tuple of (approvals list, total count)
        """
        from ..models import ProductApproval

        query = ProductApproval.query.filter_by(seller_id=seller_id)

        total = query.count()
        approvals = (
            query.order_by(ProductApproval.requested_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        approval_dtos = [
            ApprovalDTO(
                id=a.id,
                product_id=a.product_id,
                product_title=a.product.title,
                seller_id=a.seller_id,
                seller_name=a.product.seller.username,
                status=a.status,
                reason=a.reason,
                requested_at=a.requested_at,
                reviewed_at=a.reviewed_at,
            )
            for a in approvals
        ]

        return approval_dtos, total
