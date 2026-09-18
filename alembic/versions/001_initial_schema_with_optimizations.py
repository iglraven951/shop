"""Initial schema with database optimizations

Revision ID: 001_initial
Revises:
Create Date: 2026-09-17

This migration creates the complete DiscoveryShop database schema with:
- Optimized indexes for high-performance queries
- Composite indexes for common access patterns
- Numeric columns for financial precision
- Foreign key constraints with proper cascade rules
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables with optimized schema."""

    # Create users table with role-based indexes
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('username', sa.String(100), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('avatar_url', sa.String(500), nullable=True),
        sa.Column('is_buyer', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_seller', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('seller_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # User indexes
    op.create_index('idx_user_email', 'users', ['email'])
    op.create_index('idx_user_username', 'users', ['username'])
    op.create_index('idx_user_active', 'users', ['is_active'])
    op.create_index('idx_user_seller_verified', 'users', ['seller_verified'])
    op.create_index('idx_user_seller_active', 'users', ['is_seller', 'seller_verified', 'is_active'])
    op.create_index('idx_user_created_active', 'users', ['created_at', 'is_active'])
    op.create_index('idx_user_is_buyer', 'users', ['is_buyer'])

    # Create categories table
    op.create_table(
        'categories',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('slug', sa.String(100), nullable=False, unique=True),
        sa.Column('icon_url', sa.String(500), nullable=True),
        sa.Column('parent_category_id', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['parent_category_id'], ['categories.id'], ondelete='SET NULL'),
    )

    op.create_index('idx_category_name', 'categories', ['name'])
    op.create_index('idx_category_slug', 'categories', ['slug'])

    # Create products table with Numeric pricing
    op.create_table(
        'products',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('seller_id', sa.String(36), nullable=False),
        sa.Column('category_id', sa.String(36), nullable=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.String(2000), nullable=False),
        sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('original_price', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('stock', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sold_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('approval_required', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('location', sa.String(255), nullable=True),
        sa.Column('distance_km', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['seller_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='SET NULL'),
    )

    # Product indexes - optimized for search and filtering
    op.create_index('idx_product_seller_id', 'products', ['seller_id'])
    op.create_index('idx_product_category_id', 'products', ['category_id'])
    op.create_index('idx_product_status', 'products', ['status'])
    op.create_index('idx_product_created_at', 'products', ['created_at'])
    op.create_index('idx_product_title', 'products', ['title'])
    op.create_index('idx_product_seller_status', 'products', ['seller_id', 'status'])
    op.create_index('idx_product_category_status_created', 'products', ['category_id', 'status', 'created_at', 'price'])
    op.create_index('idx_product_status_created_seller', 'products', ['status', 'created_at', 'seller_id'])
    op.create_index('idx_product_price', 'products', ['price'])
    op.create_index('idx_product_stock', 'products', ['stock'])

    # Create product_images table
    op.create_table(
        'product_images',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('product_id', sa.String(36), nullable=False),
        sa.Column('image_url', sa.String(500), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
    )

    op.create_index('idx_product_image_product_id', 'product_images', ['product_id'])
    op.create_index('idx_product_image_is_primary', 'product_images', ['is_primary'])

    # Create carts table
    op.create_table(
        'carts',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )

    op.create_index('idx_cart_user_id', 'carts', ['user_id'])

    # Create cart_items table
    op.create_table(
        'cart_items',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('cart_id', sa.String(36), nullable=False),
        sa.Column('product_id', sa.String(36), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['cart_id'], ['carts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('cart_id', 'product_id', name='unique_cart_product'),
    )

    op.create_index('idx_cart_item_cart_id', 'cart_items', ['cart_id'])
    op.create_index('idx_cart_item_product_id', 'cart_items', ['product_id'])
    op.create_index('idx_cart_item_cart_created', 'cart_items', ['cart_id', 'created_at'])

    # Create orders table with Numeric pricing
    op.create_table(
        'orders',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('buyer_id', sa.String(36), nullable=False),
        sa.Column('seller_id', sa.String(36), nullable=True),
        sa.Column('total_price', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('shipping_address', sa.String(500), nullable=True),
        sa.Column('tracking_number', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['seller_id'], ['users.id'], ondelete='SET NULL'),
    )

    # Order indexes
    op.create_index('idx_order_buyer_id', 'orders', ['buyer_id'])
    op.create_index('idx_order_seller_id', 'orders', ['seller_id'])
    op.create_index('idx_order_status', 'orders', ['status'])
    op.create_index('idx_order_created_at', 'orders', ['created_at'])
    op.create_index('idx_order_buyer_status_created', 'orders', ['buyer_id', 'status', 'created_at'])
    op.create_index('idx_order_seller_status_created', 'orders', ['seller_id', 'status', 'created_at'])
    op.create_index('idx_order_status_created', 'orders', ['status', 'created_at'])

    # Create order_items table with Numeric pricing
    op.create_table(
        'order_items',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('order_id', sa.String(36), nullable=False),
        sa.Column('product_id', sa.String(36), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('returned', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
    )

    op.create_index('idx_order_item_order_id', 'order_items', ['order_id'])
    op.create_index('idx_order_item_product_id', 'order_items', ['product_id'])
    op.create_index('idx_order_item_order_created', 'order_items', ['order_id', 'created_at'])
    op.create_index('idx_order_item_returned', 'order_items', ['returned'])

    # Create transactions table with Numeric pricing
    op.create_table(
        'transactions',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('order_id', sa.String(36), nullable=False, unique=True),
        sa.Column('user_id', sa.String(36), nullable=True),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('payment_method', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_index('idx_transaction_order_id', 'transactions', ['order_id'])
    op.create_index('idx_transaction_user_id', 'transactions', ['user_id'])
    op.create_index('idx_transaction_status', 'transactions', ['status'])
    op.create_index('idx_transaction_created_at', 'transactions', ['created_at'])
    op.create_index('idx_transaction_user_status_created', 'transactions', ['user_id', 'status', 'created_at'])
    op.create_index('idx_transaction_payment_method', 'transactions', ['payment_method'])
    op.create_index('idx_transaction_status_created', 'transactions', ['status', 'created_at'])
    op.create_index('idx_transaction_completed_at', 'transactions', ['completed_at'])

    # Create reviews table
    op.create_table(
        'reviews',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('reviewer_id', sa.String(36), nullable=False),
        sa.Column('product_id', sa.String(36), nullable=False),
        sa.Column('order_id', sa.String(36), nullable=True),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('reviewer_id', 'product_id', name='unique_review_per_product'),
    )

    op.create_index('idx_review_reviewer_id', 'reviews', ['reviewer_id'])
    op.create_index('idx_review_product_id', 'reviews', ['product_id'])
    op.create_index('idx_review_order_id', 'reviews', ['order_id'])
    op.create_index('idx_review_product_created', 'reviews', ['product_id', 'created_at'])
    op.create_index('idx_review_product_rating', 'reviews', ['product_id', 'rating'])
    op.create_index('idx_review_reviewer_created', 'reviews', ['reviewer_id', 'created_at'])
    op.create_index('idx_review_rating', 'reviews', ['rating'])

    # Create notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('link_url', sa.String(500), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )

    op.create_index('idx_notification_user_id', 'notifications', ['user_id'])
    op.create_index('idx_notification_is_read', 'notifications', ['is_read'])
    op.create_index('idx_notification_created_at', 'notifications', ['created_at'])
    op.create_index('idx_notification_user_read_created', 'notifications', ['user_id', 'is_read', 'created_at'])
    op.create_index('idx_notification_type', 'notifications', ['type'])
    op.create_index('idx_notification_user_read', 'notifications', ['user_id', 'is_read'])

    # Create wishlist table
    op.create_table(
        'wishlist',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('product_id', sa.String(36), nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'product_id', name='unique_wishlist_item'),
    )

    op.create_index('idx_wishlist_user_id', 'wishlist', ['user_id'])
    op.create_index('idx_wishlist_product_id', 'wishlist', ['product_id'])
    op.create_index('idx_wishlist_user_added', 'wishlist', ['user_id', 'added_at'])
    op.create_index('idx_wishlist_product_added', 'wishlist', ['product_id', 'added_at'])

    # Create chat_messages table
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('sender_id', sa.String(36), nullable=False),
        sa.Column('receiver_id', sa.String(36), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('file_url', sa.String(500), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ondelete='CASCADE'),
    )

    op.create_index('idx_chat_sender_id', 'chat_messages', ['sender_id'])
    op.create_index('idx_chat_receiver_id', 'chat_messages', ['receiver_id'])
    op.create_index('idx_chat_is_read', 'chat_messages', ['is_read'])
    op.create_index('idx_chat_sender_receiver_created', 'chat_messages', ['sender_id', 'receiver_id', 'created_at'])
    op.create_index('idx_chat_receiver_created', 'chat_messages', ['receiver_id', 'created_at'])
    op.create_index('idx_chat_receiver_unread', 'chat_messages', ['receiver_id', 'is_read', 'created_at'])
    op.create_index('idx_chat_sender_created', 'chat_messages', ['sender_id', 'created_at'])
    op.create_index('idx_chat_receiver_is_read', 'chat_messages', ['receiver_id', 'is_read'])

    # Create product_approvals table
    op.create_table(
        'product_approvals',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('product_id', sa.String(36), nullable=False, unique=True),
        sa.Column('admin_id', sa.String(36), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('reason', sa.String(1000), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['admin_id'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_index('idx_approval_product_id', 'product_approvals', ['product_id'])
    op.create_index('idx_approval_admin_id', 'product_approvals', ['admin_id'])
    op.create_index('idx_approval_status', 'product_approvals', ['status'])
    op.create_index('idx_approval_created_at', 'product_approvals', ['created_at'])
    op.create_index('idx_approval_status_created', 'product_approvals', ['status', 'created_at'])
    op.create_index('idx_approval_admin_reviewed', 'product_approvals', ['admin_id', 'reviewed_at'])
    op.create_index('idx_approval_status_product', 'product_approvals', ['status', 'product_id'])

    # Create profiles table
    op.create_table(
        'profiles',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False, unique=True),
        sa.Column('bio', sa.String(500), nullable=True),
        sa.Column('location', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('seller_rating', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('seller_reviews_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('buyer_rating', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('buyer_reviews_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_response_time', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_sales', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_purchases', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )

    op.create_index('idx_profile_user_id', 'profiles', ['user_id'])
    op.create_index('idx_profile_seller_rating', 'profiles', ['seller_rating'])
    op.create_index('idx_profile_buyer_rating', 'profiles', ['buyer_rating'])
    op.create_index('idx_profile_seller_rating_reviews', 'profiles', ['seller_rating', 'seller_reviews_count'])
    op.create_index('idx_profile_buyer_rating_reviews', 'profiles', ['buyer_rating', 'buyer_reviews_count'])
    op.create_index('idx_profile_total_sales', 'profiles', ['total_sales'])
    op.create_index('idx_profile_total_purchases', 'profiles', ['total_purchases'])
    op.create_index('idx_profile_avg_response_time', 'profiles', ['avg_response_time'])


def downgrade() -> None:
    """Drop all tables."""
    # Drop tables in reverse order of creation (respecting foreign keys)
    op.drop_table('profiles')
    op.drop_table('product_approvals')
    op.drop_table('chat_messages')
    op.drop_table('wishlist')
    op.drop_table('notifications')
    op.drop_table('reviews')
    op.drop_table('transactions')
    op.drop_table('order_items')
    op.drop_table('orders')
    op.drop_table('cart_items')
    op.drop_table('carts')
    op.drop_table('product_images')
    op.drop_table('products')
    op.drop_table('categories')
    op.drop_table('users')
