/**
 * App Module - Application initialization and orchestration
 * Ties together all modules and manages overall application state
 */

import apiClient from './api-client.js';
import authManager from './auth.js';
import filterManager from './filters.js';
import {
    q, qAll, on, delegate, showToast, debounce,
    formatCurrency, formatDate, setVisible
} from './ui.js';
import { Button } from './components/Button.js';
import { Card } from './components/Card.js';
import { Modal } from './components/Modal.js';
import { Toast } from './components/Toast.js';

/**
 * Main application class
 */
class DiscoveryShopApp {
    /**
     * Initialize the application
     */
    constructor() {
        this.appName = 'DiscoveryShop';
        this.currentView = 'home';
        this.products = [];
        this.cart = [];
        this.unsubscribers = [];

        console.log(`Initializing ${this.appName}...`);
    }

    /**
     * Start the application
     */
    async start() {
        try {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            // Initialize modules
            await this.initializeAuth();
            this.initializeEventListeners();
            this.initializeFilters();

            // Load initial data
            await this.loadProducts();

            // Update UI based on auth state
            this.updateAuthUI();

            console.log(`${this.appName} started successfully`);
        } catch (error) {
            console.error('Failed to start application:', error);
            showToast('Failed to initialize application', 'error');
        }
    }

    /**
     * Initialize authentication
     * @private
     */
    async initializeAuth() {
        // Subscribe to auth changes
        const unsubscribe = authManager.subscribe((state) => {
            this.updateAuthUI();
        });

        this.unsubscribers.push(unsubscribe);
    }

    /**
     * Initialize event listeners
     * @private
     */
    initializeEventListeners() {
        // Header search
        const searchInput = q('.search-bar input');
        if (searchInput) {
            const handleSearch = debounce(() => {
                const query = searchInput.value;
                filterManager.setSearch(query);
                this.loadProducts();
            }, 300);

            on(searchInput, 'input', handleSearch);
        }

        // Category filters
        delegate(document, '[data-category]', 'click', (e) => {
            const category = e.target.dataset.category;
            filterManager.setCategory(category);
            this.loadProducts();
        });

        // Price range filters
        const priceInputs = qAll('input[data-price-type]');
        priceInputs.forEach(input => {
            on(input, 'change', () => {
                const minInput = q('input[data-price-type="min"]');
                const maxInput = q('input[data-price-type="max"]');

                if (minInput && maxInput) {
                    filterManager.setPriceRange(
                        parseFloat(minInput.value) || 0,
                        parseFloat(maxInput.value) || 0
                    );
                    this.loadProducts();
                }
            });
        });

        // Login button
        const userBtn = q('.user-btn');
        if (userBtn) {
            on(userBtn, 'click', () => this.handleUserClick());
        }

        // Clear filters button
        const clearFiltersBtn = q('[data-action="clear-filters"]');
        if (clearFiltersBtn) {
            on(clearFiltersBtn, 'click', () => {
                filterManager.clearAll();
                this.loadProducts();
            });
        }

        // Logout button
        const logoutBtn = q('[data-action="logout"]');
        if (logoutBtn) {
            on(logoutBtn, 'click', () => authManager.logout());
        }
    }

    /**
     * Initialize filters
     * @private
     */
    initializeFilters() {
        // Subscribe to filter changes
        const unsubscribe = filterManager.subscribe(({ activeCount }) => {
            // Update UI to show active filter count
            const filterBadge = q('.filter-badge');
            if (filterBadge && activeCount > 0) {
                filterBadge.textContent = activeCount;
                setVisible(filterBadge, true);
            } else if (filterBadge) {
                setVisible(filterBadge, false);
            }
        });

        this.unsubscribers.push(unsubscribe);
    }

    /**
     * Load products from API
     * @private
     */
    async loadProducts() {
        try {
            const filters = filterManager.getActiveFilters();

            // Show loading state
            const grid = q('.products-grid');
            if (grid) {
                grid.style.opacity = '0.5';
            }

            // Fetch products
            const result = await apiClient.getProducts(filters);

            this.products = result.products || [];

            // Render products
            this.renderProducts();

            // Update pagination info
            if (result.pagination) {
                this.updatePagination(result.pagination);
            }
        } catch (error) {
            console.error('Failed to load products:', error);
            showToast(error.message || 'Failed to load products', 'error');
        } finally {
            const grid = q('.products-grid');
            if (grid) {
                grid.style.opacity = '1';
            }
        }
    }

    /**
     * Render products
     * @private
     */
    renderProducts() {
        const grid = q('.products-grid');
        if (!grid) return;

        // Clear existing products
        grid.innerHTML = '';

        if (this.products.length === 0) {
            grid.innerHTML = '<div class="no-results"><p>No products found</p></div>';
            return;
        }

        // Create product cards
        this.products.forEach(product => {
            const card = this.createProductCard(product);
            grid.appendChild(card);
        });
    }

    /**
     * Create product card element
     * @private
     */
    createProductCard(product) {
        const cardEl = new Card({
            header: product.name,
            body: `
                <div class="product-card-body">
                    ${product.image ? `<img src="${product.image}" alt="${product.name}" class="product-image">` : ''}
                    <p class="product-description">${product.description || ''}</p>
                    <p class="product-price">${formatCurrency(product.price)}</p>
                    ${product.location ? `<p class="product-location">📍 ${product.location}</p>` : ''}
                </div>
            `,
            footer: `
                <button class="btn btn-primary btn-sm" data-product-id="${product.id}">View Details</button>
                <button class="btn btn-secondary btn-sm" data-product-id="${product.id}">Add to Cart</button>
            `,
            clickable: true,
            onClick: () => this.viewProduct(product.id)
        });

        const el = cardEl.getElement();

        // Add to cart button
        const addToCartBtn = q('[data-action="add-to-cart"]', el);
        if (addToCartBtn) {
            on(addToCartBtn, 'click', (e) => {
                e.stopPropagation();
                this.addToCart(product.id);
            });
        }

        return el;
    }

    /**
     * View product details
     * @private
     */
    viewProduct(productId) {
        console.log(`Viewing product ${productId}`);
        // Load and display product details
        // This would typically load the product detail modal
    }

    /**
     * Add product to cart
     * @private
     */
    async addToCart(productId) {
        try {
            if (!authManager.isLoggedIn()) {
                showToast('Please login to add items to cart', 'info');
                return;
            }

            await apiClient.addToCart(productId, 1);
            showToast('Added to cart', 'success');

            // Update cart UI
            this.updateCartUI();
        } catch (error) {
            showToast(error.message || 'Failed to add to cart', 'error');
        }
    }

    /**
     * Update pagination UI
     * @private
     */
    updatePagination(pagination) {
        // Update pagination controls if needed
        console.log('Pagination:', pagination);
    }

    /**
     * Update cart UI
     * @private
     */
    async updateCartUI() {
        try {
            const cart = await apiClient.getCart();
            const cartBadge = q('.cart-badge');

            if (cartBadge && cart.items) {
                const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
                cartBadge.textContent = count;
                setVisible(cartBadge, count > 0);
            }
        } catch (error) {
            console.error('Failed to update cart:', error);
        }
    }

    /**
     * Handle user button click
     * @private
     */
    handleUserClick() {
        if (authManager.isLoggedIn()) {
            // Show user menu
            showToast(`Welcome, ${authManager.getCurrentUser().name}!`, 'info');
        } else {
            // Redirect to login
            window.location.href = '/login.html';
        }
    }

    /**
     * Update auth UI based on logged-in state
     * @private
     */
    updateAuthUI() {
        const userBtn = q('.user-btn');
        if (!userBtn) return;

        if (authManager.isLoggedIn()) {
            const user = authManager.getCurrentUser();
            userBtn.textContent = user?.name || 'Profile';
        } else {
            userBtn.textContent = 'Login';
        }
    }

    /**
     * Send message to chatbot
     */
    async chatbotSendMessage(message) {
        try {
            const response = await apiClient.sendChatbotMessage(message);
            return response;
        } catch (error) {
            showToast(error.message || 'Chatbot error', 'error');
            throw error;
        }
    }

    /**
     * Search for products
     */
    async searchProducts(query) {
        try {
            const results = await apiClient.searchProducts(query);
            return results;
        } catch (error) {
            showToast(error.message || 'Search failed', 'error');
            throw error;
        }
    }

    /**
     * Get product recommendations
     */
    async getRecommendations(query) {
        try {
            const recommendations = await apiClient.getProductRecommendations(query);
            return recommendations;
        } catch (error) {
            console.error('Failed to get recommendations:', error);
            return [];
        }
    }

    /**
     * Cleanup and destroy the application
     */
    destroy() {
        // Unsubscribe from all listeners
        this.unsubscribers.forEach(unsubscribe => {
            unsubscribe();
        });

        console.log(`${this.appName} destroyed`);
    }
}

// Initialize and start app when DOM is ready
const app = new DiscoveryShopApp();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app.start();
    });
} else {
    app.start();
}

// Export for use in other modules
export default app;
export {
    DiscoveryShopApp,
    apiClient,
    authManager,
    filterManager,
    Button,
    Card,
    Modal,
    Toast
};
