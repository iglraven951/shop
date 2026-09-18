/**
 * ApiClient - Centralized API endpoint wrapper
 * Handles all HTTP requests, JWT token injection, error handling, and response caching
 *
 * @class ApiClient
 */
class ApiClient {
    /**
     * Initialize the API client with base URL and configuration
     */
    constructor() {
        this.baseUrl = window.config?.apiUrl || 'http://localhost:5000/api';
        this.timeout = 10000;
        this.cache = new Map();
        this.requestQueue = [];
        this.isProcessingQueue = false;
    }

    /**
     * SECURITY: Auth tokens are now handled via httpOnly cookies
     * This method is deprecated and returns null
     * @deprecated Use httpOnly cookies instead
     * @returns {null}
     */
    getToken() {
        console.warn('⚠️  getToken() is deprecated. Tokens use httpOnly cookies.');
        return null;
    }

    /**
     * SECURITY: Auth tokens are now handled via httpOnly cookies
     * This method is a no-op for backward compatibility
     * @deprecated Use httpOnly cookies instead
     * @param {string} token - Token JWT (ignored)
     */
    setToken(token) {
        console.warn('⚠️  setToken() is deprecated. Use httpOnly cookies instead.');
        // Do not store tokens in any client-side storage
    }

    /**
     * SECURITY: Clear session data (httpOnly cookies cleared server-side)
     */
    clearToken() {
        // Tokens are cleared server-side on logout
        if (typeof SecureStorage !== 'undefined') {
            SecureStorage.clearUserSession();
        }
    }

    /**
     * Check if token is expired
     * @returns {boolean} True if token is expired
     */
    isTokenExpired() {
        const token = this.getToken();
        if (!token) return true;

        try {
            const parts = token.split('.');
            if (parts.length !== 3) return true;

            const payload = JSON.parse(atob(parts[1]));
            return payload.exp * 1000 < Date.now();
        } catch (e) {
            return true;
        }
    }

    /**
     * Build full URL for endpoint
     * @param {string} endpoint - API endpoint path
     * @returns {string} Full URL
     */
    buildUrl(endpoint) {
        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${this.baseUrl}${path}`;
    }

    /**
     * SECURITY: Build request headers without auth token
     * Auth tokens are sent via httpOnly cookies with credentials: 'include'
     * @param {Object} customHeaders - Additional headers to merge
     * @returns {Object} Complete headers object
     */
    buildHeaders(customHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...customHeaders
        };

        // SECURITY: Do not include auth token in headers
        // httpOnly cookies are sent automatically with credentials: 'include'
        return headers;
    }

    /**
     * Make HTTP request with error handling and retry logic
     * @param {string} method - HTTP method (GET, POST, etc.)
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response data
     */
    async request(method, endpoint, options = {}) {
        const {
            data = null,
            headers = {},
            useCache = false,
            cacheKey = null,
            retry = 1
        } = options;

        // Check cache first
        const key = cacheKey || `${method}:${endpoint}`;
        if (useCache && this.cache.has(key)) {
            return this.cache.get(key);
        }

        try {
            const response = await fetch(
                this.buildUrl(endpoint),
                {
                    method,
                    headers: this.buildHeaders(headers),
                    body: data ? JSON.stringify(data) : null,
                    timeout: this.timeout,
                    // SECURITY: Include httpOnly cookies in every request
                    credentials: 'include'
                }
            );

            // Handle 401 - token expired or invalid
            if (response.status === 401) {
                this.clearToken();
                window.dispatchEvent(new CustomEvent('auth:logout'));
                throw new Error('Unauthorized. Please login again.');
            }

            // Handle other error status codes
            if (!response.ok) {
                const error = await this.parseError(response);
                throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            // Cache successful responses
            if (useCache) {
                this.cache.set(key, result);
            }

            return result;
        } catch (error) {
            // Retry on network errors or timeout
            if (retry > 0 && this.isNetworkError(error)) {
                await this.sleep(1000);
                return this.request(method, endpoint, { ...options, retry: retry - 1 });
            }

            throw error;
        }
    }

    /**
     * Parse error response from server
     * @param {Response} response - Fetch response object
     * @returns {Promise<Object>} Error object with message
     */
    async parseError(response) {
        try {
            const data = await response.json();
            return {
                message: data.message || data.error || 'An error occurred',
                code: data.code || response.status,
                details: data.details || null
            };
        } catch (e) {
            return {
                message: `HTTP ${response.status}: ${response.statusText}`,
                code: response.status
            };
        }
    }

    /**
     * Check if error is network-related
     * @param {Error} error - Error object
     * @returns {boolean} True if network error
     */
    isNetworkError(error) {
        return error.message.includes('Failed to fetch') ||
               error.message.includes('timeout') ||
               error.message.includes('NetworkError');
    }

    /**
     * Utility function to sleep for retry logic
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clear cache
     * @param {string} pattern - Optional pattern to match keys
     */
    clearCache(pattern = null) {
        if (pattern) {
            for (const [key] of this.cache.entries()) {
                if (key.includes(pattern)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }

    // ===== AUTH ENDPOINTS =====

    /**
     * Login user
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} User data and token
     */
    async login(email, password) {
        const result = await this.request('POST', '/auth/login', {
            data: { email, password }
        });

        if (result.token) {
            this.setToken(result.token);
        }

        return result;
    }

    /**
     * Register new user
     * @param {Object} userData - User registration data
     * @returns {Promise<Object>} User data and token
     */
    async register(userData) {
        const result = await this.request('POST', '/auth/register', {
            data: userData
        });

        if (result.token) {
            this.setToken(result.token);
        }

        return result;
    }

    /**
     * Logout user
     * @returns {Promise<Object>} Logout response
     */
    async logout() {
        try {
            await this.request('POST', '/auth/logout');
        } finally {
            this.clearToken();
            this.clearCache();
        }
    }

    /**
     * Get current user info
     * @returns {Promise<Object>} Current user data
     */
    async getCurrentUser() {
        return this.request('GET', '/auth/me', { useCache: true, cacheKey: 'user:current' });
    }

    // ===== PRODUCT ENDPOINTS =====

    /**
     * Get all products with pagination and filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} Products list and metadata
     */
    async getProducts(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `/products?${queryString}` : '/products';
        return this.request('GET', endpoint, { useCache: true });
    }

    /**
     * Search products
     * @param {string} query - Search query
     * @param {Object} filters - Additional filters
     * @returns {Promise<Object>} Search results
     */
    async searchProducts(query, filters = {}) {
        return this.request('POST', '/products/search', {
            data: { query, filters },
            useCache: false
        });
    }

    /**
     * Get product by ID
     * @param {number} id - Product ID
     * @returns {Promise<Object>} Product details
     */
    async getProductById(id) {
        return this.request('GET', `/products/${id}`, { useCache: true });
    }

    /**
     * Get product recommendations
     * @param {string} query - Search query for recommendations
     * @returns {Promise<Object>} Recommended products
     */
    async getProductRecommendations(query) {
        return this.request('POST', '/products/recommendations', {
            data: { query },
            useCache: false
        });
    }

    // ===== CART ENDPOINTS =====

    /**
     * Get current cart
     * @returns {Promise<Object>} Cart items
     */
    async getCart() {
        return this.request('GET', '/cart', { useCache: false });
    }

    /**
     * Add item to cart
     * @param {number} productId - Product ID
     * @param {number} quantity - Quantity to add
     * @returns {Promise<Object>} Updated cart
     */
    async addToCart(productId, quantity = 1) {
        return this.request('POST', '/cart/items', {
            data: { product_id: productId, quantity }
        });
    }

    /**
     * Update cart item quantity
     * @param {number} itemId - Cart item ID
     * @param {number} quantity - New quantity
     * @returns {Promise<Object>} Updated cart
     */
    async updateCartItem(itemId, quantity) {
        return this.request('PUT', `/cart/items/${itemId}`, {
            data: { quantity }
        });
    }

    /**
     * Remove item from cart
     * @param {number} itemId - Cart item ID
     * @returns {Promise<Object>} Updated cart
     */
    async removeFromCart(itemId) {
        return this.request('DELETE', `/cart/items/${itemId}`);
    }

    /**
     * Clear entire cart
     * @returns {Promise<Object>} Response
     */
    async clearCart() {
        return this.request('DELETE', '/cart');
    }

    // ===== ORDER ENDPOINTS =====

    /**
     * Create new order
     * @param {Object} orderData - Order details
     * @returns {Promise<Object>} Created order
     */
    async createOrder(orderData) {
        return this.request('POST', '/orders', {
            data: orderData
        });
    }

    /**
     * Get user's orders
     * @param {Object} params - Pagination and filter params
     * @returns {Promise<Object>} User's orders
     */
    async getOrders(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `/orders?${queryString}` : '/orders';
        return this.request('GET', endpoint, { useCache: false });
    }

    /**
     * Get order by ID
     * @param {number} id - Order ID
     * @returns {Promise<Object>} Order details
     */
    async getOrderById(id) {
        return this.request('GET', `/orders/${id}`);
    }

    /**
     * Update order status
     * @param {number} id - Order ID
     * @param {string} status - New status
     * @returns {Promise<Object>} Updated order
     */
    async updateOrderStatus(id, status) {
        return this.request('PUT', `/orders/${id}/status`, {
            data: { status }
        });
    }

    // ===== CHAT ENDPOINTS =====

    /**
     * Get chat messages with a seller
     * @param {number} sellerId - Seller ID
     * @param {Object} params - Pagination params
     * @returns {Promise<Object>} Chat messages
     */
    async getChatMessages(sellerId, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `/chat/${sellerId}?${queryString}` : `/chat/${sellerId}`;
        return this.request('GET', endpoint, { useCache: false });
    }

    /**
     * Send chat message
     * @param {number} recipientId - Recipient user ID
     * @param {string} message - Message text
     * @returns {Promise<Object>} Sent message
     */
    async sendMessage(recipientId, message) {
        return this.request('POST', '/chat/messages', {
            data: { recipient_id: recipientId, message }
        });
    }

    /**
     * Get chat conversations list
     * @returns {Promise<Object>} User's conversations
     */
    async getConversations() {
        return this.request('GET', '/chat/conversations', { useCache: false });
    }

    // ===== USER ENDPOINTS =====

    /**
     * Update user profile
     * @param {Object} userData - User data to update
     * @returns {Promise<Object>} Updated user
     */
    async updateProfile(userData) {
        return this.request('PUT', '/users/profile', {
            data: userData
        });
    }

    /**
     * Get seller info
     * @param {number} sellerId - Seller ID
     * @returns {Promise<Object>} Seller profile
     */
    async getSellerInfo(sellerId) {
        return this.request('GET', `/users/${sellerId}`, { useCache: true });
    }

    /**
     * Upload user avatar
     * @param {File} file - Image file
     * @returns {Promise<Object>} Upload result with URL
     */
    async uploadAvatar(file) {
        const formData = new FormData();
        formData.append('avatar', file);

        // SECURITY: Use credentials: 'include' to send httpOnly cookies
        return fetch(this.buildUrl('/users/avatar'), {
            method: 'POST',
            body: formData,
            // SECURITY: Include httpOnly cookies in every request
            credentials: 'include'
        }).then(res => res.json());
    }

    // ===== CHATBOT ENDPOINTS =====

    /**
     * Send message to chatbot
     * @param {string} message - User message
     * @param {Object} context - Optional conversation context
     * @returns {Promise<Object>} Chatbot response
     */
    async sendChatbotMessage(message, context = {}) {
        return this.request('POST', '/chatbot/chat', {
            data: { message, context },
            useCache: false
        });
    }

    /**
     * Get chatbot conversation history
     * @returns {Promise<Object>} Conversation messages
     */
    async getChatbotHistory() {
        return this.request('GET', '/chatbot/history', { useCache: false });
    }

    /**
     * Clear chatbot conversation
     * @returns {Promise<Object>} Response
     */
    async clearChatbotHistory() {
        return this.request('POST', '/chatbot/clear', {});
    }

    // ===== SEARCH ENDPOINTS =====

    /**
     * Search everything (products, sellers, etc.)
     * @param {string} query - Search query
     * @returns {Promise<Object>} Search results
     */
    async globalSearch(query) {
        return this.request('POST', '/search', {
            data: { query },
            useCache: false
        });
    }

    /**
     * Get product recommendations by search parameters
     * @param {Object} searchParams - Search parameters
     * @returns {Promise<Object>} Recommended products
     */
    async getRecommendationsByParams(searchParams) {
        return this.request('POST', '/search/recommendations', {
            data: searchParams,
            useCache: false
        });
    }
}

// Create singleton instance and export
const apiClient = new ApiClient();
export default apiClient;
