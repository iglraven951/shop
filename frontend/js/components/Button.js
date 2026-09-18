/**
 * Button Component - Reusable button with variants
 */

import { createElement, on, toggleClass, setLoading } from '../ui.js';

export class Button {
    /**
     * Create a button component
     * @param {Object} options - Button options
     */
    constructor(options = {}) {
        const {
            text = 'Button',
            type = 'button',
            variant = 'primary',
            size = 'md',
            disabled = false,
            loading = false,
            icon = null,
            className = '',
            onClick = null,
            attributes = {}
        } = options;

        this.options = options;
        this.el = null;
        this.onClick = onClick;

        this.create(text, type, variant, size, disabled, loading, icon, className, attributes);
    }

    /**
     * Create button element
     * @private
     */
    create(text, type, variant, size, disabled, loading, icon, className, attributes) {
        const classes = [
            'btn',
            `btn-${variant}`,
            `btn-${size}`,
            className
        ].filter(Boolean);

        if (loading) {
            classes.push('btn-loading');
        }

        let html = '';
        if (icon) {
            html = `<span class="btn-icon">${icon}</span>`;
        }
        html += `<span class="btn-text">${this.escapeHTML(text)}</span>`;

        this.el = createElement('button', {
            classes,
            html,
            attributes: {
                type,
                disabled: disabled || loading,
                ...attributes
            }
        });

        // Bind click handler
        if (this.onClick) {
            on(this.el, 'click', (e) => {
                if (!this.el.disabled) {
                    this.onClick(e);
                }
            });
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
     * Set button text
     * @param {string} text - New text
     */
    setText(text) {
        const textEl = this.el.querySelector('.btn-text');
        if (textEl) {
            textEl.textContent = text;
        }
    }

    /**
     * Get button text
     * @returns {string}
     */
    getText() {
        const textEl = this.el.querySelector('.btn-text');
        return textEl ? textEl.textContent : '';
    }

    /**
     * Set button disabled state
     * @param {boolean} disabled - Disabled state
     */
    setDisabled(disabled) {
        this.el.disabled = disabled;
    }

    /**
     * Check if button is disabled
     * @returns {boolean}
     */
    isDisabled() {
        return this.el.disabled;
    }

    /**
     * Set loading state
     * @param {boolean} loading - Loading state
     */
    setLoading(loading) {
        setLoading(this.el, loading);
    }

    /**
     * Set button variant
     * @param {string} variant - Variant name
     */
    setVariant(variant) {
        const validVariants = ['primary', 'secondary', 'danger', 'success'];
        if (!validVariants.includes(variant)) {
            console.warn(`Invalid variant: ${variant}`);
            return;
        }

        validVariants.forEach(v => {
            this.el.classList.remove(`btn-${v}`);
        });

        this.el.classList.add(`btn-${variant}`);
    }

    /**
     * Set click handler
     * @param {Function} handler - Click handler
     */
    setOnClick(handler) {
        this.onClick = handler;
    }
}

export default Button;
