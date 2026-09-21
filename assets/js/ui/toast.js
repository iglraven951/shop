/**
 * DiscoveryShop · Notificaciones toast
 *
 * Apiladas abajo a la derecha, se cierran solas y son accesibles: el contenedor
 * es una región `aria-live` para que los lectores de pantalla las anuncien.
 */
(function (global) {
    'use strict';

    const { escapeHtml } = global.DS;

    const ICONS = {
        success: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.7 5.8 8.2 14.2 3.9 10"/></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 6.5v4M10 13.5h.01"/></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5 18.5 17h-17L10 2.5Z"/><path d="M10 8v3.5M10 14.5h.01"/></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 13.5v-4M10 6.5h.01"/></svg>',
    };

    const CLOSE_ICON = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m3.5 3.5 7 7M10.5 3.5l-7 7"/></svg>';

    const TITLES = {
        success: 'Listo',
        error: 'Algo salió mal',
        warning: 'Atención',
        info: 'Información',
    };

    let stack = null;

    function getStack() {
        if (stack && document.body.contains(stack)) return stack;

        stack = document.createElement('div');
        stack.className = 'toast-stack';
        stack.setAttribute('role', 'region');
        stack.setAttribute('aria-live', 'polite');
        stack.setAttribute('aria-label', 'Notificaciones');
        document.body.appendChild(stack);

        return stack;
    }

    function dismiss(node) {
        if (!node || node.dataset.leaving === 'true') return;

        node.dataset.leaving = 'true';
        node.classList.add('is-leaving');

        // Espera a que termine la animación de salida antes de quitarlo del DOM
        node.addEventListener('animationend', () => node.remove(), { once: true });
        setTimeout(() => node.remove(), 400);
    }

    /**
     * @param {string} message - Texto principal.
     * @param {'success'|'error'|'warning'|'info'} [type='info']
     * @param {{title?: string, duration?: number}} [options]
     */
    function show(message, type = 'info', options = {}) {
        const container = getStack();
        const duration = options.duration ?? (type === 'error' ? 6000 : 4000);
        const title = options.title ?? TITLES[type];

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

        toast.innerHTML = `
            <span class="toast-icon" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
            <div class="toast-content">
                <p class="toast-title">${escapeHtml(title)}</p>
                <p class="toast-message">${escapeHtml(message)}</p>
            </div>
            <button class="toast-close" type="button" aria-label="Cerrar notificación">${CLOSE_ICON}</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => dismiss(toast));

        // Mantiene un máximo de 4 visibles para no tapar la pantalla
        while (container.children.length >= 4) {
            dismiss(container.firstElementChild);
        }

        container.appendChild(toast);

        let timer = setTimeout(() => dismiss(toast), duration);

        // Pausa la cuenta atrás mientras el cursor está encima
        toast.addEventListener('mouseenter', () => clearTimeout(timer));
        toast.addEventListener('mouseleave', () => {
            timer = setTimeout(() => dismiss(toast), 1800);
        });

        return { dismiss: () => dismiss(toast) };
    }

    global.toast = {
        show,
        success: (message, options) => show(message, 'success', options),
        error: (message, options) => show(message, 'error', options),
        warning: (message, options) => show(message, 'warning', options),
        info: (message, options) => show(message, 'info', options),
    };
})(window);
