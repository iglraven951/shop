"""Database utility functions for DiscoveryShop.

This module provides helper functions for database operations including:
- Seeding sample data for development
- Running database migrations
- Health checks and diagnostics
"""

import uuid
from datetime import datetime, timezone, timedelta
from backend.database import SessionLocal
from backend.models import (
    User, Profile, Category, Product, ProductImage,
    Cart, Order, Review, Notification, Wishlist
)


def seed_database() -> None:
    """Seed database with sample data for development.

    Creates:
    - 3 sample users (2 sellers, 1 buyer)
    - 5 product categories
    - 10 sample products with images
    - Sample cart, reviews, and notifications
    """
    db = SessionLocal()

    try:
        # Check if database already seeded
        existing_users = db.query(User).count()
        if existing_users > 0:
            print("Database already contains data. Skipping seed.")
            return

        print("Seeding database with sample data...")

        # Create categories
        categories = [
            Category(
                name="Electronics",
                slug="electronics",
                icon_url="https://via.placeholder.com/50?text=Electronics"
            ),
            Category(
                name="Books",
                slug="books",
                icon_url="https://via.placeholder.com/50?text=Books"
            ),
            Category(
                name="Clothing",
                slug="clothing",
                icon_url="https://via.placeholder.com/50?text=Clothing"
            ),
            Category(
                name="Home & Garden",
                slug="home-garden",
                icon_url="https://via.placeholder.com/50?text=Home"
            ),
            Category(
                name="Sports",
                slug="sports",
                icon_url="https://via.placeholder.com/50?text=Sports"
            ),
        ]
        db.add_all(categories)
        db.commit()
        print(f"✓ Created {len(categories)} categories")

        # Create users
        seller1 = User(
            email="seller1@example.com",
            username="seller1",
            full_name="John Smith",
            is_buyer=True,
            is_seller=True,
            seller_verified=True
        )
        seller1.set_password("password123")

        seller2 = User(
            email="seller2@example.com",
            username="seller2",
            full_name="Jane Doe",
            is_buyer=True,
            is_seller=True,
            seller_verified=True
        )
        seller2.set_password("password123")

        buyer1 = User(
            email="buyer@example.com",
            username="buyer1",
            full_name="Bob Johnson",
            is_buyer=True,
            is_seller=False
        )
        buyer1.set_password("password123")

        users = [seller1, seller2, buyer1]
        db.add_all(users)
        db.commit()
        print(f"✓ Created {len(users)} users")

        # Create profiles for users
        for user in users:
            profile = Profile(
                user_id=user.id,
                bio=f"Hi, I'm {user.full_name}!",
                location="Arequipa, Perú",
                phone="+51 (54) 201-0000",
            )
            db.add(profile)
        db.commit()
        print(f"✓ Created profiles for {len(users)} users")

        # Create sample products
        products = []
        for i, category in enumerate(categories):
            for j in range(2):
                seller = seller1 if (i + j) % 2 == 0 else seller2
                product = Product(
                    seller_id=seller.id,
                    category_id=category.id,
                    title=f"{category.name} Item {j+1}",
                    description=f"This is a high-quality {category.name.lower()} item. Great condition and ready to ship!",
                    price=float((j + 1) * 10 + i * 5),
                    original_price=float((j + 1) * 15 + i * 5),
                    stock=10 + i + j,
                    status="approved",
                    approval_required=False,
                    location="Arequipa, Perú",
                    distance_km=float(i * 2)
                )
                products.append(product)

        db.add_all(products)
        db.commit()
        print(f"✓ Created {len(products)} sample products")

        # Add images to products
        for idx, product in enumerate(products):
            image = ProductImage(
                product_id=product.id,
                image_url=f"https://via.placeholder.com/400?text={product.title}",
                order=0,
                is_primary=True
            )
            db.add(image)
        db.commit()
        print(f"✓ Added images to {len(products)} products")

        # Create cart for buyer
        cart = Cart(user_id=buyer1.id)
        db.add(cart)
        db.commit()
        print("✓ Created shopping cart for buyer")

        # Create sample reviews
        reviews = []
        for i, product in enumerate(products[:3]):
            review = Review(
                reviewer_id=buyer1.id,
                product_id=product.id,
                rating=4 + (i % 2),  # 4-5 stars
                comment=f"Great product! Exactly as described. Seller was very helpful."
            )
            reviews.append(review)

        db.add_all(reviews)
        db.commit()
        print(f"✓ Created {len(reviews)} sample reviews")

        # Create sample notifications
        notifications = [
            Notification(
                user_id=buyer1.id,
                type="order",
                title="Order Confirmed",
                message="Your order #12345 has been confirmed and will ship soon.",
                link_url="/orders/12345"
            ),
            Notification(
                user_id=seller1.id,
                type="order",
                title="New Order",
                message="You have a new order from Bob Johnson.",
                link_url="/orders/12345"
            ),
        ]
        db.add_all(notifications)
        db.commit()
        print(f"✓ Created {len(notifications)} sample notifications")

        # Update seller profile stats
        for seller in [seller1, seller2]:
            profile = db.query(Profile).filter_by(user_id=seller.id).first()
            if profile:
                profile.seller_rating = 4.5
                profile.seller_reviews_count = 5
                profile.total_sales = 10
        db.commit()
        print("✓ Updated seller profile statistics")

        print("\n✅ Database seeding completed successfully!\n")

    except Exception as e:
        db.rollback()
        print(f"❌ Database seeding failed: {e}")
        raise
    finally:
        db.close()


def get_database_stats() -> dict:
    """Get database statistics.

    Returns:
        Dictionary with counts of all model types
    """
    db = SessionLocal()

    try:
        stats = {
            "users": db.query(User).count(),
            "profiles": db.query(Profile).count(),
            "categories": db.query(Category).count(),
            "products": db.query(Product).count(),
            "product_images": db.query(ProductImage).count(),
            "orders": db.query(Order).count(),
            "reviews": db.query(Review).count(),
            "notifications": db.query(Notification).count(),
            "wishlists": db.query(Wishlist).count(),
        }
        return stats
    finally:
        db.close()


def cleanup_old_notifications(days: int = 30) -> int:
    """Delete notifications older than specified days.

    Args:
        days: Number of days to retain (default 30)

    Returns:
        Number of notifications deleted
    """
    db = SessionLocal()

    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        deleted = db.query(Notification).filter(
            Notification.created_at < cutoff_date
        ).delete()
        db.commit()
        return deleted
    finally:
        db.close()


def get_seller_stats(user_id: str) -> dict:
    """Get statistics for a seller.

    Args:
        user_id: User ID of the seller

    Returns:
        Dictionary with seller statistics
    """
    db = SessionLocal()

    try:
        profile = db.query(Profile).filter_by(user_id=user_id).first()
        if not profile:
            return {}

        products = db.query(Product).filter_by(seller_id=user_id).count()

        return {
            "seller_rating": profile.seller_rating,
            "reviews_count": profile.seller_reviews_count,
            "total_sales": profile.total_sales,
            "active_products": products,
            "avg_response_time": profile.avg_response_time,
        }
    finally:
        db.close()


if __name__ == "__main__":
    # Run seeding if executed directly
    seed_database()

    # Print stats
    stats = get_database_stats()
    print("\nDatabase Statistics:")
    for model, count in stats.items():
        print(f"  {model}: {count}")
