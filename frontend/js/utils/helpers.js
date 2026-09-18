/**
 * General utility helpers for DiscoveryShop frontend
 * @module utils/helpers
 */

/**
 * Debounce function to limit function execution
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

/**
 * Throttle function to limit function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit = 300) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if object is empty
 * @param {Object} obj - Object to check
 * @returns {boolean} True if empty
 */
export function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}

/**
 * Format currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
    }).format(amount);
}

/**
 * Format date
 * @param {Date|string} date - Date to format
 * @param {string} format - Format type (short, long, time)
 * @returns {string} Formatted date string
 */
export function formatDate(date, format = 'short') {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    const options = {
        short: { year: 'numeric', month: '2-digit', day: '2-digit' },
        long: { year: 'numeric', month: 'long', day: 'numeric' },
        time: { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    };

    return dateObj.toLocaleDateString('es-ES', options[format] || options.short);
}

/**
 * Truncate text
 * @param {string} text - Text to truncate
 * @param {number} length - Max length
 * @param {string} suffix - Suffix (default: '...')
 * @returns {string} Truncated text
 */
export function truncate(text, length = 100, suffix = '...') {
    if (text.length <= length) return text;
    return text.substring(0, length - suffix.length) + suffix;
}

/**
 * Generate unique ID
 * @returns {string} Unique ID
 */
export function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse URL query parameters
 * @param {string} queryString - Query string (default: window.location.search)
 * @returns {Object} Query parameters object
 */
export function parseQueryString(queryString = window.location.search) {
    const params = new URLSearchParams(queryString);
    const result = {};
    params.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

/**
 * Build URL with query parameters
 * @param {string} baseUrl - Base URL
 * @param {Object} params - Parameters object
 * @returns {string} Complete URL with query string
 */
export function buildUrl(baseUrl, params = {}) {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            url.searchParams.append(key, value);
        }
    });
    return url.toString();
}

/**
 * Local storage helper with JSON serialization
 */
export const Storage = {
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    get(key, defaultValue = null) {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    clear() {
        localStorage.clear();
    }
};

/**
 * Wait for a promise with timeout
 * @param {Promise} promise - Promise to wait for
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise} Resolved or rejected promise
 */
export function withTimeout(promise, timeout = 5000) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}

/**
 * Retry a function multiple times
 * @param {Function} fn - Async function to retry
 * @param {number} maxAttempts - Max retry attempts
 * @param {number} delay - Delay between retries
 * @returns {Promise} Result from function
 */
export async function retry(fn, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Check if element is in viewport
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} True if in viewport
 */
export function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
    );
}

/**
 * Scroll to element smoothly
 * @param {HTMLElement} element - Element to scroll to
 * @param {Object} options - Scroll options
 */
export function scrollToElement(element, options = {}) {
    element.scrollIntoView({
        behavior: 'smooth',
        block: options.block || 'center',
        inline: options.inline || 'center'
    });
}

/**
 * Get element by selector with fallback
 * @param {string} selector - CSS selector
 * @param {HTMLElement} parent - Parent element (default: document)
 * @returns {HTMLElement|null} Element or null
 */
export function getElement(selector, parent = document) {
    return parent.querySelector(selector);
}

/**
 * Get all elements by selector
 * @param {string} selector - CSS selector
 * @param {HTMLElement} parent - Parent element (default: document)
 * @returns {NodeList} Collection of elements
 */
export function getElements(selector, parent = document) {
    return parent.querySelectorAll(selector);
}

/**
 * Add event listener with auto-cleanup
 * @param {HTMLElement} element - Element to attach listener to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @returns {Function} Function to remove listener
 */
export function on(element, event, handler) {
    element.addEventListener(event, handler);
    return () => element.removeEventListener(event, handler);
}

/**
 * Batch DOM updates for performance
 * @param {Function} fn - Function with DOM updates
 */
export function batchUpdate(fn) {
    if (window.requestAnimationFrame) {
        requestAnimationFrame(fn);
    } else {
        fn();
    }
}
