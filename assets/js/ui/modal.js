/**
 * DiscoveryShop · Modales accesibles
 *
 * Atrapan el foco mientras están abiertos, se cierran con Escape o clic en el
 * fondo, y devuelven el foco al elemento que los abrió. Bloquean el scroll del
 * documento compensando el ancho de la barra para evitar el salto de layout.
 */
(function (global) {
    'use strict';

    const { escapeHtml } = global.DS;

    const FOCUSABLE = [
        'a[href]', 'button:not([disabled])', 'input:not([disabled])',
        'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const CLOSE_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>';

    // Pila de modales abiertos: permite anidarlos correctamente.
    const openModals = [];

    function lockScroll() {
        if (openModals.length > 1) return;
        const scrollbarWidth = global.innerWidth - document.documentElement.clientWidth;
        document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
        document.body.classList.add('is-modal-open');
    }

    function unlockScroll() {
        if (openModals.length) return;
        document.body.classList.remove('is-modal-open');
        document.documentElement.style.removeProperty('--scrollbar-width');
    }

    class Modal {
        /**
         * @param {object} options
         * @param {string} [options.title] - Encabezado. Si se omite, no hay barra superior.
         * @param {string|Node} options.content - Cuerpo del modal.
         * @param {Array<{label: string, variant?: string, action?: Function, close?: boolean}>} [options.actions]
         * @param {'sm'|'md'|'lg'|'xl'} [options.size='md']
         * @param {boolean} [options.dismissible=true] - Permitir cerrar con Escape o clic fuera.
         * @param {Function} [options.onClose]
         */
        constructor(options = {}) {
            this.options = { size: 'md', dismissible: true, ...options };
            this.previousFocus = document.activeElement;
            this.backdrop = null;
            this.element = null;
            this.onKeydown = this.handleKeydown.bind(this);
        }

        open() {
            this.backdrop = document.createElement('div');
            this.backdrop.className = 'modal-backdrop';

            const sizeClass = this.options.size === 'md' ? '' : ` modal-${this.options.size}`;
            const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;

            this.element = document.createElement('div');
            this.element.className = `modal${sizeClass}`;
            this.element.setAttribute('role', 'dialog');
            this.element.setAttribute('aria-modal', 'true');
            if (this.options.title) this.element.setAttribute('aria-labelledby', titleId);

            const parts = [];

            if (this.options.title) {
                parts.push(`
                    <header class="modal-header">
                        <h2 class="modal-title" id="${titleId}">${escapeHtml(this.options.title)}</h2>
                        ${this.options.dismissible
                            ? `<button class="modal-close" type="button" data-modal-close aria-label="Cerrar">${CLOSE_ICON}</button>`
                            : ''}
                    </header>
                `);
            }

            parts.push('<div class="modal-body"></div>');

            if (this.options.actions && this.options.actions.length) {
                const buttons = this.options.actions.map((action, index) => {
                    const variant = action.variant || 'secondary';
                    return `<button class="btn btn-${variant}" type="button" data-action-index="${index}">${escapeHtml(action.label)}</button>`;
                }).join('');
                parts.push(`<footer class="modal-footer">${buttons}</footer>`);
            }

            this.element.innerHTML = parts.join('');

            // El contenido se inserta como nodo o como HTML ya confiable
            const body = this.element.querySelector('.modal-body');
            if (this.options.content instanceof Node) {
                body.appendChild(this.options.content);
            } else {
                body.innerHTML = this.options.content || '';
            }

            this.backdrop.appendChild(this.element);
            document.body.appendChild(this.backdrop);

            this.bindEvents();

            openModals.push(this);
            lockScroll();
            this.focusFirst();

            return this;
        }

        bindEvents() {
            const closeButton = this.element.querySelector('[data-modal-close]');
            if (closeButton) {
                closeButton.addEventListener('click', () => this.close());
            }

            if (this.options.dismissible) {
                this.backdrop.addEventListener('mousedown', (event) => {
                    // Solo cierra si el clic empezó en el fondo, no al arrastrar texto
                    if (event.target === this.backdrop) this.close();
                });
            }

            this.element.querySelectorAll('[data-action-index]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const action = this.options.actions[Number(button.dataset.actionIndex)];
                    if (!action) return;

                    if (typeof action.action === 'function') {
                        button.classList.add('is-loading');
                        try {
                            const result = await action.action(this);
                            // Un `false` explícito cancela el cierre
                            if (result === false) return;
                        } finally {
                            button.classList.remove('is-loading');
                        }
                    }

                    if (action.close !== false) this.close();
                });
            });

            document.addEventListener('keydown', this.onKeydown);
        }

        handleKeydown(event) {
            // Solo el modal superior de la pila responde
            if (openModals[openModals.length - 1] !== this) return;

            if (event.key === 'Escape' && this.options.dismissible) {
                event.preventDefault();
                this.close();
                return;
            }

            if (event.key !== 'Tab') return;

            // Ciclo de foco confinado al modal
            const focusable = Array.from(this.element.querySelectorAll(FOCUSABLE))
                .filter((node) => node.offsetParent !== null);

            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        focusFirst() {
            const target = this.element.querySelector('[autofocus]')
                || this.element.querySelector(FOCUSABLE);

            if (target) {
                target.focus();
            } else {
                this.element.setAttribute('tabindex', '-1');
                this.element.focus();
            }
        }

        close() {
            if (!this.backdrop) return;

            document.removeEventListener('keydown', this.onKeydown);

            const index = openModals.indexOf(this);
            if (index !== -1) openModals.splice(index, 1);

            this.backdrop.classList.add('is-closing');
            const backdrop = this.backdrop;
            setTimeout(() => backdrop.remove(), 180);

            this.backdrop = null;
            this.element = null;

            unlockScroll();

            if (this.previousFocus && document.body.contains(this.previousFocus)) {
                this.previousFocus.focus();
            }

            if (typeof this.options.onClose === 'function') {
                this.options.onClose();
            }
        }

        /** Reemplaza el cuerpo manteniendo el modal abierto. */
        setContent(content) {
            if (!this.element) return;
            const body = this.element.querySelector('.modal-body');
            if (content instanceof Node) {
                body.replaceChildren(content);
            } else {
                body.innerHTML = content;
            }
        }
    }

    /** Atajo: abre un modal y devuelve la instancia. */
    function open(options) {
        return new Modal(options).open();
    }

    /**
     * Diálogo de confirmación. Resuelve `true` si el usuario confirma.
     * @returns {Promise<boolean>}
     */
    function confirm({
        title = '¿Confirmar acción?',
        message = '',
        confirmLabel = 'Confirmar',
        cancelLabel = 'Cancelar',
        danger = false,
    } = {}) {
        return new Promise((resolve) => {
            let settled = false;

            const done = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            open({
                title,
                size: 'sm',
                content: `<p style="color: var(--text-secondary); font-size: var(--text-sm);">${escapeHtml(message)}</p>`,
                actions: [
                    { label: cancelLabel, variant: 'ghost', action: () => done(false) },
                    {
                        label: confirmLabel,
                        variant: danger ? 'danger' : 'primary',
                        action: () => done(true),
                    },
                ],
                onClose: () => done(false),
            });
        });
    }

    /** Muestra una imagen a pantalla completa. */
    function lightbox(src, alt = '') {
        return open({
            size: 'xl',
            dismissible: true,
            content: `
                <img src="${global.DS.escapeAttr(src)}" alt="${escapeHtml(alt)}"
                     style="width: 100%; border-radius: var(--radius-md);">
            `,
        });
    }

    global.Modal = Modal;
    global.modal = { open, confirm, lightbox };
})(window);
