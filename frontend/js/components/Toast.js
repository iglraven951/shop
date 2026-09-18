/**
 * Toast Component - Notification toasts
 * Can be used as an alternative to the ui.showToast function
 */

import { createElement, on, append, remove, q } from '../ui.js';

export class Toast {
    /**
     * Create a toast notification
     * @param {Object} options - Toast options
     */
    constructor(options = {}) {
        const {
            message = 'Notification',
            type = 'info',
            duration = 4000,
            dismissible = true
        } = options;

        this.options = options;
        this.el = null;
        this.duration = duration;
        this.timeoutId = null;

        this.create(message, type, dismissible);
    }

    /**
     * Create toast element
     * @private
     */
    create(message, type, dismissible) {
        // Create toast container if not exists
        let container = q('.toast-container');
        if (!container) {
            container = createElement('div', { classes: 'toast-container' });
            append(document.body, container);
        }

        // Validate type
        const validTypes = ['success', 'error', 'warning', 'info'];
        if (!validTypes.includes(type)) {
            type = 'info';
        }

        // Create toast element
        let html = `<div class="toast-message">${this.escapeHTML(message)}</div>`;

        if (dismissible) {
            html += '<button class="toast-close" aria-label="Close notification">×</button>';
        }

        this.el = createElement('div', {
            classes: ['toast', type],
            html
        });

        // Add close functionality
        if (dismissible) {
            const closeBtn = q('.toast-close', this.el);
            on(closeBtn, 'click', () => this.close());
        }

        // Add to container
        append(container, this.el);

        // Auto-close after duration
        if (this.duration > 0) {
            this.timeoutId = setTimeout(() => this.close(), this.duration);
        }
    }

    /**
     * Escape HTML
     * @private
     */
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get DOM element
     * @returns {Element}
     */
    getElement() {
        return this.el;
    }

    /**
     * Close toast
     */
    close() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }

        if (this.el) {
            this.el.style.animation = 'slideOutRight 300ms ease forwards';
            setTimeout(() => {
                remove(this.el);
            }, 300);
        }
    }

    /**
     * Update toast message
     * @param {string} message - New message
     */
    setMessage(message) {
        const messageEl = q('.toast-message', this.el);
        if (messageEl) {
            messageEl.textContent = message;
        }
    }

    /**
     * Get toast message
     * @returns {string}
     */
    getMessage() {
        const messageEl = q('.toast-message', this.el);
        return messageEl ? messageEl.textContent : '';
    }

    /**
     * Change toast type
     * @param {string} type - Toast type
     */
    setType(type) {
        const validTypes = ['success', 'error', 'warning', 'info'];

        validTypes.forEach(t => {
            this.el.classList.remove(t);
        });

        if (validTypes.includes(type)) {
            this.el.classList.add(type);
        }
    }

    /**
     * Keep toast visible (cancel auto-close)
     */
    keepAlive() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    /**
     * Static method to create and show a success toast
     * @param {string} message - Message
     * @param {number} duration - Duration in ms
     * @returns {Toast}
     */
    static success(message, duration = 4000) {
        return new Toast({ message, type: 'success', duration });
    }

    /**
     * Static method to create and show an error toast
     * @param {string} message - Message
     * @param {number} duration - Duration in ms
     * @returns {Toast}
     */
    static error(message, duration = 5000) {
        return new Toast({ message, type: 'error', duration });
    }

    /**
     * Static method to create and show a warning toast
     * @param {string} message - Message
     * @param {number} duration - Duration in ms
     * @returns {Toast}
     */
    static warning(message, duration = 4000) {
        return new Toast({ message, type: 'warning', duration });
    }

    /**
     * Static method to create and show an info toast
     * @param {string} message - Message
     * @param {number} duration - Duration in ms
     * @returns {Toast}
     */
    static info(message, duration = 4000) {
        return new Toast({ message, type: 'info', duration });
    }
}

// Helper function for query
function q(selector, parent = document) {
    return parent.querySelector(selector);
}

export default Toast;
