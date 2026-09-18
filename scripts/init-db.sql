-- ============================================================================
-- DiscoveryShop Database Initialization Script
-- ============================================================================
-- This script is automatically run by docker-compose when PostgreSQL starts
-- It creates the database and sets up initial schemas

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For array indexing

-- Create application user if it doesn't exist
DO
$$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'discovery_user') THEN
        CREATE USER discovery_user WITH PASSWORD :'POSTGRES_PASSWORD';
    END IF;
END
$$;

-- Grant privileges
GRANT CONNECT ON DATABASE discovery_shop TO discovery_user;
GRANT USAGE ON SCHEMA public TO discovery_user;
GRANT CREATE ON SCHEMA public TO discovery_user;

-- Enable UUID generation
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO discovery_user;

-- ============================================================================
-- Indexes for performance (created after migrations run)
-- ============================================================================
-- These are optional - SQLAlchemy migrations should handle most indexing
-- Created here only if needed before application tables exist

-- Future indexes to consider:
-- CREATE INDEX idx_products_category_id ON products(category_id) WHERE deleted_at IS NULL;
-- CREATE INDEX idx_orders_user_id ON orders(user_id) WHERE deleted_at IS NULL;
-- CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
-- CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
-- CREATE INDEX idx_reviews_product_id ON reviews(product_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- Initial data seed (optional)
-- ============================================================================
-- Uncomment to seed initial data

-- INSERT INTO categories (id, name, slug, description, created_at, updated_at)
-- VALUES
--   ('550e8400-e29b-41d4-a716-446655440000', 'Electronics', 'electronics', 'Electronic devices and accessories', NOW(), NOW()),
--   ('550e8400-e29b-41d4-a716-446655440001', 'Clothing', 'clothing', 'Apparel and fashion items', NOW(), NOW()),
--   ('550e8400-e29b-41d4-a716-446655440002', 'Books', 'books', 'Books and educational materials', NOW(), NOW());

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON DATABASE discovery_shop IS 'DiscoveryShop Marketplace - Multi-vendor e-commerce platform';
COMMENT ON SCHEMA public IS 'Main application schema';
