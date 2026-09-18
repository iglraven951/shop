/**
 * Card Component - Reusable card with header, body, and footer
 */

import { createElement, append } from '../ui.js';

export class Card {
    /**
     * Create a card component
     * @param {Object} options - Card options
     */
    constructor(options = {}) {
        const {
            header = null,
            body = null,
            footer = null,
            className = '',
            clickable = false,
            onClick = null
        } = options;

        this.options = options;
        this.el = null;
        this.clickable = clickable;
        this.onClick = onClick;

        this.create(header, body, footer, className, clickable);
    }

    /**
     * Create card element
     * @private
     */
    create(header, body, footer, className, clickable) {
        const classes = ['card', className].filter(Boolean);

        if (clickable) {
            classes.push('cursor-pointer');
        }

        this.el = createElement('div', {
            classes: classes
        });

        // Add header if provided
        if (header) {
            const headerEl = createElement('div', { classes: 'card-header' });
            if (typeof header === 'string') {
                headerEl.textContent = header;
            } else {
                append(headerEl, header);
            }
            append(this.el, headerEl);
        }

        // Add body
        if (body) {
            const bodyEl = createElement('div', { classes: 'card-body' });
            if (typeof body === 'string') {
                bodyEl.textContent = body;
            } else {
                append(bodyEl, body);
            }
            append(this.el, bodyEl);
        }

        // Add footer if provided
        if (footer) {
            const footerEl = createElement('div', { classes: 'card-footer' });
            if (typeof footer === 'string') {
                footerEl.textContent = footer;
            } else {
                append(footerEl, footer);
            }
            append(this.el, footerEl);
        }

        // Add click handler if clickable
        if (clickable && this.onClick) {
            this.el.addEventListener('click', this.onClick);
        }
    }

    /**
     * Get DOM element
     * @returns {Element}
     */
    getElement() {
        return this.el;
    }

    /**
     * Set header content
     * @param {string|Element} content - Header content
     */
    setHeader(content) {
        const headerEl = this.el.querySelector('.card-header');
        if (headerEl) {
            if (typeof content === 'string') {
                headerEl.textContent = content;
            } else {
                headerEl.innerHTML = '';
                append(headerEl, content);
            }
        }
    }

    /**
     * Set body content
     * @param {string|Element} content - Body content
     */
    setBody(content) {
        const bodyEl = this.el.querySelector('.card-body');
        if (bodyEl) {
            if (typeof content === 'string') {
                bodyEl.textContent = content;
            } else {
                bodyEl.innerHTML = '';
                append(bodyEl, content);
            }
        }
    }

    /**
     * Set footer content
     * @param {string|Element} content - Footer content
     */
    setFooter(content) {
        const footerEl = this.el.querySelector('.card-footer');
        if (footerEl) {
            if (typeof content === 'string') {
                footerEl.textContent = content;
            } else {
                footerEl.innerHTML = '';
                append(footerEl, content);
            }
        }
    }

    /**
     * Get header element
     * @returns {Element|null}
     */
    getHeaderElement() {
        return this.el.querySelector('.card-header');
    }

    /**
     * Get body element
     * @returns {Element|null}
     */
    getBodyElement() {
        return this.el.querySelector('.card-body');
    }

    /**
     * Get footer element
     * @returns {Element|null}
     */
    getFooterElement() {
        return this.el.querySelector('.card-footer');
    }

    /**
     * Make card clickable
     * @param {Function} handler - Click handler
     */
    makeClickable(handler) {
        this.el.classList.add('cursor-pointer');
        this.el.addEventListener('click', handler);
    }

    /**
     * Add CSS class to card
     * @param {string} className - Class name
     */
    addClass(className) {
        this.el.classList.add(className);
    }

    /**
     * Remove CSS class from card
     * @param {string} className - Class name
     */
    removeClass(className) {
        this.el.classList.remove(className);
    }

    /**
     * Set data attribute
     * @param {string} key - Attribute key
     * @param {*} value - Attribute value
     */
    setData(key, value) {
        this.el.dataset[key] = value;
    }

    /**
     * Get data attribute
     * @param {string} key - Attribute key
     * @returns {*}
     */
    getData(key) {
        return this.el.dataset[key];
    }
}

export default Card;
