"""System constants for DiscoveryShop marketplace."""

# Product Status Constants
PRODUCT_STATUSES = [
    'pending',      # Awaiting admin approval
    'approved',     # Published and visible
    'rejected',     # Admin rejected (reason stored)
    'sold_out',     # Stock depleted
    'archived',     # Seller archived
    'suspended',    # Admin suspended (violation)
]

# Order Status Constants
ORDER_STATUSES = [
    'pending',      # Awaiting confirmation
    'confirmed',    # Seller confirmed
    'shipped',      # In transit
    'delivered',    # Arrived
    'cancelled',    # Cancelled
    'returned',     # Return processed
]

# Notification Type Constants
NOTIFICATION_TYPES = [
    'order_update',
    'new_message',
    'product_approved',
    'product_rejected',
    'new_review',
    'seller_verified',
    'account_warning',
    'payment_received',
]

# Role-Based Permissions
ROLE_PERMISSIONS = {
    'buyer': ['browse', 'purchase', 'message', 'review'],
    'seller': ['publish', 'manage_products', 'message', 'receive_payment'],
    'admin': ['approve_products', 'ban_users', 'view_analytics', 'manage_settings'],
}

# File Upload Constants
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp']

# Platform Configuration
PRODUCT_APPROVAL_REQUIRED = True
SELLER_VERIFICATION_REQUIRED = True

# Pagination Defaults
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# AI/Chatbot Constants
AI_RESPONSE_CONFIDENCE_THRESHOLD = 0.7
FAQ_MATCH_THRESHOLD = 0.6
MAX_CHATBOT_HISTORY = 50

# Seller Verification Requirements
MIN_SELLER_REVIEWS = 0
MIN_SELLER_RATING = 0.0

# Platform Fees
PLATFORM_COMMISSION_RATE = 0.10  # 10% commission
SELLER_VERIFICATION_FEE = 0.0

# Report Types
REPORT_TYPES = [
    'spam',
    'fake',
    'offensive',
    'scam',
    'copyright',
    'misleading',
    'inappropriate_image',
]

# Approval Statuses
APPROVAL_STATUSES = ['pending', 'approved', 'rejected']

# Cache Timeouts (in seconds)
CACHE_PRODUCT_TIMEOUT = 3600  # 1 hour
CACHE_USER_TIMEOUT = 1800  # 30 minutes
CACHE_FAQ_TIMEOUT = 86400  # 1 day
