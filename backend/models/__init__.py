"""Database models for DiscoveryShop marketplace.

This module exports all SQLAlchemy models used in the application.
Models are organized by domain:
- User authentication and profiles
- Products and categories
- Shopping cart and orders
- Reviews and social features
- Messaging and notifications
- Admin workflows
- Payments and transactions
"""

# User models
from backend.models.user import User
from backend.models.profile import Profile

# Product models
from backend.models.product import Category, Product, ProductImage

# Order and cart models
from backend.models.order import Cart, CartItem, Order, OrderItem

# Social models
from backend.models.social import Review, Notification, Wishlist

# Chat models
from backend.models.chat import ChatMessage

# Forum models
from backend.models.forum import ForumTopic, ForumReply, ForumVote

# Admin workflow
from backend.models.approval import ProductApproval

# Payment models
from backend.models.transaction import Transaction

# Chatbot models
from backend.models.chatbot import ChatBotSession, ChatBotConversation, ChatBotMessage

# Export all models
__all__ = [
    # User models
    "User",
    "Profile",
    # Product models
    "Category",
    "Product",
    "ProductImage",
    # Order and cart models
    "Cart",
    "CartItem",
    "Order",
    "OrderItem",
    # Social models
    "Review",
    "Notification",
    "Wishlist",
    # Chat models
    "ChatMessage",
    # Forum models
    "ForumTopic",
    "ForumReply",
    "ForumVote",
    # Admin workflow
    "ProductApproval",
    # Payment models
    "Transaction",
    # Chatbot models
    "ChatBotSession",
    "ChatBotConversation",
    "ChatBotMessage",
]
