/**
 * DiscoveryShop · Entrada cinematográfica
 *
 * La animación vive en CSS y se completa sola, así que esta capa solo aporta
 * lo que el CSS no puede: recordar que ya se mostró en esta sesión, permitir
 * saltarla y devolver el foco al contenido cuando termina.
 *
 * Se ejecuta lo antes posible —no espera a DOMContentLoaded— para que la capa
 * desaparezca de inmediato en las visitas siguientes, sin un parpadeo.
 */
(function (global) {
    'use strict';

    const SESSION_KEY = 'discoveryshop:intro-seen';
    /* Debe coincidir con el retraso + duración de `intro-exit` en intro.css */
    const TOTAL_MS = 2800;

    /** El almacenamiento puede fallar en ventana privada: nunca debe romper la página. */
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
            /* sin memoria: volverá a verse, que es preferible a fallar */
        }
    }

    function prefersReducedMotion() {
        return global.matchMedia
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /** Retira la capa del documento y libera el scroll. */
    function dismiss(intro, immediate) {
        if (!intro || intro.dataset.dismissed === 'true') return;
        intro.dataset.dismissed = 'true';

        remember();
        document.documentElement.classList.remove('has-intro');

        if (immediate) {
            intro.remove();
            return;
        }

        intro.classList.add('is-done');
        // La animación de salida dura 380 ms; se limpia al acabar.
        intro.addEventListener('animationend', () => intro.remove(), { once: true });
        setTimeout(() => intro.remove(), 600);
    }

    /**
     * Parte el nombre en letras para poder escalonarlas. Se hace desde aquí y
     * no en el HTML para que el texto siga siendo una sola cadena legible por
     * buscadores y lectores de pantalla.
     */
    function splitName(node) {
        if (!node) return;

        const text = node.textContent.trim();
        const accentFrom = text.toLowerCase().indexOf('shop');

        node.setAttribute('aria-label', text);
        node.textContent = '';

        [...text].forEach((char, index) => {
            const span = document.createElement('span');
            span.className = 'intro-letter';
            if (accentFrom !== -1 && index >= accentFrom) {
                span.classList.add('is-accent');
            }
            span.style.setProperty('--i', String(index));
            span.setAttribute('aria-hidden', 'true');
            // El espacio necesita un carácter que no colapse
            span.textContent = char === ' ' ? ' ' : char;
            node.appendChild(span);
        });
    }

    /** Da a cada trazo su longitud real para que se dibuje de forma uniforme. */
    function prepareStrokes(intro) {
        intro.querySelectorAll('.draw').forEach((path) => {
            if (typeof path.getTotalLength !== 'function') return;
            try {
                const length = path.getTotalLength();
                path.style.setProperty('--len', String(Math.ceil(length)));
            } catch (error) {
                /* SVG no medible: el valor por defecto del CSS sirve igual */
            }
        });
    }

    function init() {
        const intro = document.getElementById('intro');
        if (!intro) return;

        // Ya vista en esta sesión, o el usuario pidió menos movimiento
        if (alreadySeen() || prefersReducedMotion()) {
            dismiss(intro, true);
            return;
        }

        document.documentElement.classList.add('has-intro');

        prepareStrokes(intro);
        splitName(intro.querySelector('.intro-name'));

        const skip = intro.querySelector('.intro-skip');
        if (skip) {
            skip.addEventListener('click', () => dismiss(intro));
        }

        // Cualquier intención de interactuar la salta: nadie debe sentirse atrapado
        const escape = (event) => {
            if (event.type === 'keydown' && !['Escape', 'Enter', ' '].includes(event.key)) return;
            dismiss(intro);
        };

        document.addEventListener('keydown', escape, { once: true });
        intro.addEventListener('click', (event) => {
            if (event.target === intro || event.target.closest('.intro-stage')) dismiss(intro);
        });

        // Red de seguridad: si alguna animación no dispara su evento, se retira igual
        setTimeout(() => dismiss(intro), TOTAL_MS);
    }

    // Sin esperar a DOMContentLoaded: en la segunda visita la capa debe
    // desaparecer antes de que llegue a verse.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.DiscoveryIntro = { dismiss, alreadySeen };
})(window);
