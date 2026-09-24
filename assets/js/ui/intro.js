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
    /* Debe cubrir el retraso más la duración de la salida en intro.css:
       4400 ms de secuencia + 800 ms de telón, con holgura. */
    /* Estas tres cifras son la coreografía de `intro.css`, escrita arriba del
       todo de esa hoja. Tienen que ir en hora con ella: cuando la entrada se
       acortó de 5200 a 2200 ms y esto se quedó en 5600, el telón seguía en el
       documento tres segundos y medio después de haberse desvanecido —
       invisible, pero encima de todo— y la portada nunca llegaba a entrar.

         EXIT_MS   cuándo empieza a subir el telón
         TOTAL_MS  cuándo ha terminado y se puede retirar del documento
         COUNT_MS  cuánto tarda el contador en llegar a 100, que debe ser
                   ANTES de que el telón empiece a irse o se quedaría a medias */
    const EXIT_MS = 1860;
    const TOTAL_MS = 2260;
    const COUNT_MS = 1440;

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

    /**
     * `?intro` en la dirección vuelve a mostrarla aunque ya se haya visto en
     * esta sesión. Sirve para revisarla sin cerrar la pestaña —y para saber,
     * desde un móvil, si lo que la escondía era la memoria de sesión o la
     * preferencia de movimiento.
     */
    function replayRequested() {
        try {
            return new URLSearchParams(global.location.search).has('intro');
        } catch (error) {
            return false;
        }
    }

    /** Retira la capa y deja la página libre. */
    /**
     * Avisa a la página de que el telón se va.
     *
     * La portada tiene su propia entrada escalonada, y sin esta señal solo se
     * veía en la segunda visita: en la primera, la intro la tapa dos segundos
     * y para cuando se retira ya está compuesta y quieta. El trabajo estaba
     * hecho y no lo veía nadie.
     *
     * Se marca `<html>` y no `<body>` porque la hoja de la portada se
     * evalúa antes de que exista el cuerpo, y porque una clase en la raíz es
     * lo que el CSS puede consultar desde cualquier altura del documento.
     */
    function curtainUp() {
        document.documentElement.classList.add('intro-done');
    }

    /* La señal se da cuando el telón EMPIEZA a subir, no cuando acaba: las dos
       animaciones tienen que solaparse o queda un hueco en el que no se mueve
       nada, y el corte se nota más que la transición. */
    function scheduleCurtain() {
        setTimeout(curtainUp, EXIT_MS);
    }

    function dismiss(intro, immediate) {
        if (!intro || intro.dataset.dismissed === 'true') return;
        intro.dataset.dismissed = 'true';

        remember();

        if (immediate) {
            intro.remove();
            curtainUp();
            return;
        }

        intro.classList.add('is-done');

        /* La señal se da al EMPEZAR la salida, no al terminarla: las dos
           animaciones tienen que solaparse, o queda un hueco en el que no se
           mueve nada y el corte se nota. */
        curtainUp();

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

        // Sin intro que esperar, el telón ya está arriba
        if (!intro) {
            curtainUp();
            return;
        }

        if (alreadySeen() && !replayRequested()) {
            dismiss(intro, true);
            return;
        }

        /* El movimiento reducido ya no se decide aquí: intro.css representa la
           misma secuencia con fundidos en vez de desplazamientos, con los
           mismos retrasos y la misma duración. Desde este lado, las dos
           versiones son la misma —y el contador, que solo cambia de cifra,
           corre en ambas. */
        prepareStrokes(intro);
        splitWords(intro.querySelector('.intro-name'));
        runCounter(intro);
        scheduleCurtain();

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
