/**
 * UI Module - DOM utilities and component helpers
 * Provides functions for DOM manipulation, rendering, and UI updates
 */

/**
 * Safely query a single element
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element to search in (default: document)
 * @returns {Element|null} Element or null if not found
 */
export function q(selector, parent = document) {
    return parent.querySelector(selector);
}

/**
 * Query all elements matching selector
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element to search in (default: document)
 * @returns {NodeList} All matching elements
 */
export function qAll(selector, parent = document) {
    return parent.querySelectorAll(selector);
}

/**
 * Get element ID
 * @param {string} id - Element ID
 * @returns {Element|null}
 */
export function getId(id) {
    return document.getElementById(id);
}

/**
 * Create element with optional classes and attributes
 * @param {string} tag - HTML tag name
 * @param {Object} options - Element options
 * @returns {Element}
 */
export function createElement(tag, options = {}) {
    const { classes = [], attributes = {}, text = '', html = '' } = options;

    const el = document.createElement(tag);

    if (classes.length > 0) {
        el.classList.add(...(Array.isArray(classes) ? classes : [classes]));
    }

    Object.entries(attributes).forEach(([key, value]) => {
        if (value === true) {
            el.setAttribute(key, '');
        } else if (value !== false && value !== null) {
            el.setAttribute(key, value);
        }
    });

    if (text) {
        el.textContent = text;
    } else if (html) {
        el.innerHTML = html;
    }

    return el;
}

/**
 * Add event listener with automatic cleanup on element removal
 * @param {Element} el - Element to attach listener to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @returns {Function} Unsubscribe function
 */
export function on(el, event, handler) {
    el.addEventListener(event, handler);

    return () => {
        el.removeEventListener(event, handler);
    };
}

/**
 * Add event listener with event delegation
 * @param {Element} el - Parent element
 * @param {string} selector - Child element selector
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @returns {Function} Unsubscribe function
 */
export function delegate(el, selector, event, handler) {
    const listener = (e) => {
        if (e.target.matches(selector)) {
            handler.call(e.target, e);
        }
    };

    el.addEventListener(event, listener);

    return () => {
        el.removeEventListener(event, listener);
    };
}

/**
 * Add or remove class
 * @param {Element} el - Element
 * @param {string|Array} classes - Class name(s)
 * @param {boolean} add - Add or remove
 */
export function toggleClass(el, classes, add = true) {
    const classList = Array.isArray(classes) ? classes : [classes];

    if (add) {
        el.classList.add(...classList);
    } else {
        el.classList.remove(...classList);
    }
}

/**
 * Check if element has class
 * @param {Element} el - Element
 * @param {string} className - Class name
 * @returns {boolean}
 */
export function hasClass(el, className) {
    return el.classList.contains(className);
}

/**
 * Show element
 * @param {Element} el - Element
 * @param {string} display - Display type (default: 'block')
 */
export function show(el, display = 'block') {
    el.style.display = display;
    el.classList.remove('hidden');
}

/**
 * Hide element
 * @param {Element} el - Element
 */
export function hide(el) {
    el.style.display = 'none';
    el.classList.add('hidden');
}

/**
 * Toggle visibility
 * @param {Element} el - Element
 * @param {boolean} visible - Show or hide
 */
export function setVisible(el, visible) {
    if (visible) {
        show(el);
    } else {
        hide(el);
    }
}

/**
 * Update element text content
 * @param {Element} el - Element
 * @param {string} text - Text content
 */
export function setText(el, text) {
    el.textContent = text;
}

/**
 * Update element HTML content
 * @param {Element} el - Element
 * @param {string} html - HTML content
 */
export function setHTML(el, html) {
    el.innerHTML = html;
}

/**
 * Get element text
 * @param {Element} el - Element
 * @returns {string}
 */
export function getText(el) {
    return el.textContent;
}

/**
 * Set element attribute
 * @param {Element} el - Element
 * @param {string} attr - Attribute name
 * @param {*} value - Attribute value
 */
export function setAttr(el, attr, value) {
    if (value === null || value === false) {
        el.removeAttribute(attr);
    } else {
        el.setAttribute(attr, value === true ? '' : value);
    }
}

/**
 * Get element attribute
 * @param {Element} el - Element
 * @param {string} attr - Attribute name
 * @returns {string|null}
 */
export function getAttr(el, attr) {
    return el.getAttribute(attr);
}

/**
 * Set element CSS properties
 * @param {Element} el - Element
 * @param {Object} styles - Style object
 */
export function setStyle(el, styles) {
    Object.entries(styles).forEach(([key, value]) => {
        el.style[key] = value;
    });
}

/**
 * Remove element from DOM
 * @param {Element} el - Element
 */
export function remove(el) {
    el.remove();
}

/**
 * Clear element content
 * @param {Element} el - Element
 */
export function clear(el) {
    el.innerHTML = '';
}

/**
 * Append child to parent
 * @param {Element} parent - Parent element
 * @param {Element|Array<Element>} children - Child element(s)
 */
export function append(parent, children) {
    const childArray = Array.isArray(children) ? children : [children];
    childArray.forEach(child => {
        if (child instanceof Element) {
            parent.appendChild(child);
        }
    });
}

/**
 * Prepend child to parent
 * @param {Element} parent - Parent element
 * @param {Element} child - Child element
 */
export function prepend(parent, child) {
    parent.insertBefore(child, parent.firstChild);
}

/**
 * Insert element before target
 * @param {Element} newEl - Element to insert
 * @param {Element} target - Reference element
 */
export function insertBefore(newEl, target) {
    target.parentNode.insertBefore(newEl, target);
}

/**
 * Insert element after target
 * @param {Element} newEl - Element to insert
 * @param {Element} target - Reference element
 */
export function insertAfter(newEl, target) {
    target.parentNode.insertBefore(newEl, target.nextSibling);
}

/**
 * Check if element is visible in viewport
 * @param {Element} el - Element
 * @returns {boolean}
 */
export function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
    );
}

/**
 * Scroll element into view
 * @param {Element} el - Element
 * @param {Object} options - Scroll options
 */
export function scrollIntoView(el, options = { behavior: 'smooth', block: 'center' }) {
    el.scrollIntoView(options);
}

/**
 * Focus element
 * @param {Element} el - Element
 */
export function focus(el) {
    el.focus();
}

/**
 * Get element value (for inputs/selects)
 * @param {Element} el - Element
 * @returns {*} Element value
 */
export function getValue(el) {
    return el.value;
}

/**
 * Set element value
 * @param {Element} el - Element
 * @param {*} value - Value to set
 */
export function setValue(el, value) {
    el.value = value;
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date
 */
export function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: 'USD')
 * @returns {string} Formatted currency
 */
export function formatCurrency(amount, currency = 'PEN') {
    return new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

/**
 * Show loading spinner
 * @param {Element} el - Element to show spinner in
 * @param {boolean} show - Show or hide
 */
export function setLoading(el, show = true) {
    if (show) {
        el.classList.add('btn-loading');
        el.disabled = true;
    } else {
        el.classList.remove('btn-loading');
        el.disabled = false;
    }
}

/**
 * Show toast notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type ('success', 'error', 'warning', 'info')
 * @param {number} duration - Duration in ms (0 = manual close)
 * @returns {Object} Toast object with close method
 */
export function showToast(message, type = 'info', duration = 4000) {
    // Create toast container if not exists
    let container = q('.toast-container');
    if (!container) {
        container = createElement('div', { classes: 'toast-container' });
        append(document.body, container);
    }

    // Create toast element
    const toast = createElement('div', {
        classes: ['toast', type],
        html: `
            <div class="toast-message">${escapeHTML(message)}</div>
            <button class="toast-close" aria-label="Close notification">×</button>
        `
    });

    append(container, toast);

    // Add close functionality
    const closeBtn = q('.toast-close', toast);
    const close = () => {
        toast.style.animation = 'slideOutRight 300ms ease forwards';
        setTimeout(() => remove(toast), 300);
    };

    on(closeBtn, 'click', close);

    // Auto-close after duration
    if (duration > 0) {
        setTimeout(close, duration);
    }

    return { close };
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Debounce function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
    let timeoutId;

    return function debounced(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Throttle function
 * @param {Function} fn - Function to throttle
 * @param {number} delay - Delay in ms
 * @returns {Function} Throttled function
 */
export function throttle(fn, delay = 300) {
    let lastCall = 0;
    let timeoutId;

    return function throttled(...args) {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;

        if (timeSinceLastCall >= delay) {
            lastCall = now;
            fn.apply(this, args);
        } else {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(
                () => {
                    lastCall = Date.now();
                    fn.apply(this, args);
                },
                delay - timeSinceLastCall
            );
        }
    };
}

/**
 * Check if element is in viewport
 * @param {Element} el - Element
 * @returns {boolean}
 */
export function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
    );
}

/**
 * Wait for element to exist in DOM
 * @param {string} selector - Element selector
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Element>} Promise resolving to element
 */
export async function waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            const el = q(selector);
            if (el) {
                resolve(el);
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            } else {
                requestAnimationFrame(check);
            }
        };

        check();
    });
}

export default {
    q, qAll, getId, createElement, on, delegate,
    toggleClass, hasClass, show, hide, setVisible,
    setText, setHTML, getText, setAttr, getAttr,
    setStyle, remove, clear, append, prepend,
    insertBefore, insertAfter, isVisible, scrollIntoView,
    focus, getValue, setValue, formatDate, formatCurrency,
    setLoading, showToast, escapeHTML, debounce, throttle,
    isInViewport, waitForElement
};
