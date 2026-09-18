/**
 * Modal Component - Reusable modal dialog
 */

import { createElement, on, append, remove, q } from '../ui.js';

export class Modal {
    /**
     * Create a modal component
     * @param {Object} options - Modal options
     */
    constructor(options = {}) {
        const {
            title = 'Modal',
            body = '',
            footer = null,
            closeButton = true,
            cancelButton = true,
            submitButton = false,
            submitText = 'Submit',
            onClose = null,
            onCancel = null,
            onSubmit = null
        } = options;

        this.options = options;
        this.el = null;
        this.contentEl = null;
        this.isVisible = false;
        this.onClose = onClose;
        this.onCancel = onCancel;
        this.onSubmit = onSubmit;

        this.create(title, body, footer, closeButton, cancelButton, submitButton, submitText);
    }

    /**
     * Create modal element
     * @private
     */
    create(title, body, footer, closeButton, cancelButton, submitButton, submitText) {
        // Create modal container
        this.el = createElement('div', {
            classes: ['modal']
        });

        // Create content wrapper
        this.contentEl = createElement('div', {
            classes: 'modal-content'
        });

        // Create header
        const headerEl = createElement('div', {
            classes: 'modal-header'
        });

        const titleEl = createElement('h2', {
            classes: 'modal-title',
            text: title
        });
        append(headerEl, titleEl);

        if (closeButton) {
            const closeBtn = createElement('button', {
                classes: 'modal-close',
                text: '×',
                attributes: { type: 'button', 'aria-label': 'Close modal' }
            });
            on(closeBtn, 'click', () => this.close());
            append(headerEl, closeBtn);
        }

        append(this.contentEl, headerEl);

        // Create body
        const bodyEl = createElement('div', {
            classes: 'modal-body'
        });

        if (typeof body === 'string') {
            bodyEl.innerHTML = body;
        } else if (body instanceof Element) {
            append(bodyEl, body);
        }

        append(this.contentEl, bodyEl);

        // Create footer with buttons
        if (footer || cancelButton || submitButton) {
            const footerEl = createElement('div', {
                classes: 'modal-footer'
            });

            if (cancelButton) {
                const cancelBtn = createElement('button', {
                    classes: 'btn btn-secondary',
                    text: 'Cancel',
                    attributes: { type: 'button' }
                });
                on(cancelBtn, 'click', () => this.cancel());
                append(footerEl, cancelBtn);
            }

            if (submitButton) {
                const submitBtn = createElement('button', {
                    classes: 'btn btn-primary',
                    text: submitText,
                    attributes: { type: 'button' }
                });
                on(submitBtn, 'click', () => this.submit());
                append(footerEl, submitBtn);
            }

            if (footer && typeof footer === 'string') {
                const customFooter = createElement('div', {
                    html: footer
                });
                append(footerEl, customFooter);
            } else if (footer instanceof Element) {
                append(footerEl, footer);
            }

            append(this.contentEl, footerEl);
        }

        append(this.el, this.contentEl);

        // Close on outside click
        on(this.el, 'click', (e) => {
            if (e.target === this.el) {
                this.close();
            }
        });

        // Add to body
        append(document.body, this.el);
    }

    /**
     * Show modal
     */
    show() {
        this.el.classList.add('visible');
        this.isVisible = true;
        document.body.style.overflow = 'hidden';
    }

    /**
     * Hide modal
     */
    hide() {
        this.el.classList.remove('visible');
        this.isVisible = false;
        document.body.style.overflow = '';
    }

    /**
     * Close modal (trigger onClose callback)
     */
    close() {
        this.hide();
        if (this.onClose) {
            this.onClose();
        }
    }

    /**
     * Cancel modal (trigger onCancel callback)
     */
    cancel() {
        this.hide();
        if (this.onCancel) {
            this.onCancel();
        }
    }

    /**
     * Submit modal (trigger onSubmit callback)
     */
    submit() {
        if (this.onSubmit) {
            this.onSubmit();
        }
    }

    /**
     * Check if modal is visible
     * @returns {boolean}
     */
    isOpen() {
        return this.isVisible;
    }

    /**
     * Set modal title
     * @param {string} title - New title
     */
    setTitle(title) {
        const titleEl = q('.modal-title', this.contentEl);
        if (titleEl) {
            titleEl.textContent = title;
        }
    }

    /**
     * Set modal body content
     * @param {string|Element} content - Body content
     */
    setBody(content) {
        const bodyEl = q('.modal-body', this.contentEl);
        if (bodyEl) {
            if (typeof content === 'string') {
                bodyEl.innerHTML = content;
            } else {
                bodyEl.innerHTML = '';
                append(bodyEl, content);
            }
        }
    }

    /**
     * Get body element
     * @returns {Element|null}
     */
    getBodyElement() {
        return q('.modal-body', this.contentEl);
    }

    /**
     * Get form data from inputs in modal
     * @returns {Object} Form data
     */
    getFormData() {
        const inputs = qAll('input, textarea, select', this.contentEl);
        const data = {};

        inputs.forEach(input => {
            const name = input.name || input.id;
            if (name) {
                if (input.type === 'checkbox') {
                    data[name] = input.checked;
                } else if (input.type === 'radio') {
                    if (input.checked) {
                        data[name] = input.value;
                    }
                } else {
                    data[name] = input.value;
                }
            }
        });

        return data;
    }

    /**
     * Destroy modal and remove from DOM
     */
    destroy() {
        remove(this.el);
    }
}

// Helper function for query
function q(selector, parent = document) {
    return parent.querySelector(selector);
}

// Helper function for queryAll
function qAll(selector, parent = document) {
    return parent.querySelectorAll(selector);
}

export default Modal;
