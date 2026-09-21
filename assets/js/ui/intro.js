/**
 * DiscoveryShop · Entrada
 *
 * La secuencia vive en CSS y se completa sola, así que esto solo aporta lo
 * que el CSS no puede: recordar que ya se mostró en esta sesión, permitir
 * saltarla, medir el trazo con precisión y llevar el contador incluso donde
 * `@property` no está disponible.
 *
 * Se ejecuta cuanto antes para que, en la segunda visita, la capa desaparezca
 * antes de llegar a verse.
 */
(function (global) {
    'use strict';

    const SESSION_KEY = 'discoveryshop:intro-seen';
    /* Debe cubrir el retraso más la duración de `intro-exit` en intro.css */
    const TOTAL_MS = 2100;
    const COUNT_MS = 1250;

    /** El almacenamiento falla en ventana privada: nunca debe romper la página. */
    function alreadySeen() {
        try {
            return sessionStorage.getItem(SESSION_KEY) === '1';
        } catch (error) {
            return false;
        }
    }

    function remember() {
        try {
            sessionStorage.setItem(SESSION_KEY, '1');
        } catch (error) {
            /* sin memoria: volverá a verse, preferible a fallar */
        }
    }

    function prefersReducedMotion() {
        return global.matchMedia
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /** Retira la capa y deja la página libre. */
    function dismiss(intro, immediate) {
        if (!intro || intro.dataset.dismissed === 'true') return;
        intro.dataset.dismissed = 'true';

        remember();

        if (immediate) {
            intro.remove();
            return;
        }

        intro.classList.add('is-done');
        intro.addEventListener('animationend', () => intro.remove(), { once: true });
        setTimeout(() => intro.remove(), 500);
    }

    /**
     * Lleva el contador de 0 a 100 con la misma curva que usa el CSS.
     * Se hace aquí además de en CSS porque `@property` todavía no está en
     * todos los navegadores, y un contador congelado en 0 parece un fallo.
     */
    function runCounter(intro) {
        const box = intro.querySelector('.intro-count');
        const value = intro.querySelector('.intro-count-value');
        if (!box || !value) return;

        box.classList.add('is-scripted');
        value.textContent = '0';

        const start = performance.now();

        const step = (now) => {
            const t = Math.min(1, (now - start) / COUNT_MS);
            // Misma sensación que --ease-out: rápido al principio, frena al final
            const eased = 1 - (1 - t) ** 3;

            value.textContent = String(Math.round(eased * 100));

            if (t < 1 && intro.dataset.dismissed !== 'true') {
                requestAnimationFrame(step);
            }
        };

        requestAnimationFrame(step);
    }

    /**
     * Envuelve cada palabra del nombre para poder subirlas por separado.
     * Se hace desde aquí y no en el marcado para que el texto siga siendo una
     * cadena legible por buscadores y lectores de pantalla.
     */
    function splitWords(node) {
        if (!node) return;

        const text = node.textContent.trim();
        node.setAttribute('aria-label', text);
        node.textContent = '';

        text.split(/\s+/).forEach((word, index) => {
            const wrapper = document.createElement('span');
            wrapper.className = 'intro-word';
            wrapper.style.setProperty('--w', String(index));
            wrapper.setAttribute('aria-hidden', 'true');

            // La segunda palabra lleva el degradado de acento
            if (index > 0) wrapper.classList.add('is-accent');

            const inner = document.createElement('span');
            inner.textContent = word;
            wrapper.appendChild(inner);
            node.appendChild(wrapper);
        });
    }

    /** Da a cada trazo su longitud real para que se dibuje de forma uniforme. */
    function prepareStrokes(intro) {
        intro.querySelectorAll('.draw').forEach((path) => {
            if (typeof path.getTotalLength !== 'function') return;
            try {
                path.style.setProperty('--len', String(Math.ceil(path.getTotalLength())));
            } catch (error) {
                /* SVG no medible: el valor del CSS sirve igual */
            }
        });
    }

    function init() {
        const intro = document.getElementById('intro');
        if (!intro) return;

        if (alreadySeen() || prefersReducedMotion()) {
            dismiss(intro, true);
            return;
        }

        prepareStrokes(intro);
        splitWords(intro.querySelector('.intro-name'));
        runCounter(intro);

        const skip = intro.querySelector('.intro-skip');
        if (skip) skip.addEventListener('click', () => dismiss(intro));

        // Cualquier intención de interactuar la salta: nadie debe sentirse atrapado
        document.addEventListener('keydown', (event) => {
            if (['Escape', 'Enter', ' '].includes(event.key)) dismiss(intro);
        }, { once: true });

        intro.addEventListener('click', () => dismiss(intro));

        // Red de seguridad por si alguna animación no dispara su evento
        setTimeout(() => dismiss(intro), TOTAL_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.DiscoveryIntro = { dismiss, alreadySeen };
})(window);
