/**
 * DiscoveryShop · Profundidad
 *
 * Tres efectos que comparten un mismo presupuesto de trabajo, porque los tres
 * quieren escribir en el momento equivocado: mientras el puntero se mueve o
 * mientras la página rueda.
 *
 *   · **Inclinación.** Una tarjeta gira hacia donde está el puntero, como una
 *     pieza apoyada que cede bajo el dedo. Es el patrón de Vanilla-Tilt escrito
 *     a mano: ocho kilobytes de librería para cincuenta líneas no compensan en
 *     un sitio sin empaquetador que además viaja dentro de un APK, donde cada
 *     dependencia de CDN es una cosa más que puede faltar sin red.
 *   · **Luz.** La misma tarjeta recibe un brillo especular en el punto exacto
 *     donde está el puntero, y la portada entera un resplandor que lo sigue.
 *     Es lo que separa una superficie pintada de una superficie iluminada.
 *   · **Paralaje.** Al rodar la página, las capas decorativas de la portada se
 *     desplazan menos que el texto. Da fondo a una pantalla que de otro modo
 *     sube en bloque, como una diapositiva.
 *
 * Cuatro decisiones gobiernan el módulo:
 *
 *   · **La inclinación y la luz, solo con ratón.** Un táctil no tiene puntero
 *     al que seguir, y el giro continuo gasta batería sin decir nada. La
 *     consulta `(hover: hover) and (pointer: fine)` deja fuera el teléfono,
 *     que es donde vive la app. El paralaje sí corre en ambos: no depende del
 *     puntero y es lo que da cuerpo a la primera pantalla de un móvil.
 *   · **Un solo `requestAnimationFrame` para todo.** Los eventos de puntero y
 *     de desplazamiento llegan más deprisa que los fotogramas; escribir en
 *     cada uno provoca recálculos de estilo que el navegador tira a la basura.
 *   · **Nada se mide por fotograma.** Las cajas se toman al empezar y al
 *     cambiar el tamaño de la ventana; dentro del bucle solo se leen números
 *     que el navegador ya tiene. Y si la portada no está en pantalla, el bucle
 *     ni siquiera escribe.
 *   · **El CSS manda.** Aquí solo se escriben variables: `--tilt-x`/`--tilt-y`
 *     para el giro, `--glow-x`/`--glow-y` para el brillo, `--px`/`--py` para el
 *     resplandor y `--scroll` para el paralaje. Qué se hace con ellas —y si se
 *     hace algo— lo decide la hoja de estilos, que ya sabe de
 *     `prefers-reduced-motion`.
 */
(function (global) {
    'use strict';

    /** Inclinación máxima. Cuatro grados: se nota y no marea. */
    const MAX_TILT = 4;

    /** Qué se inclina: las tarjetas del tablón, y lo que lo pida a mano. */
    const SELECTOR = '.post-card, [data-tilt]';

    /** Dónde sigue la luz al puntero. */
    const FIELD = '[data-depth-field]';

    /** Qué capa se desplaza al rodar la página. */
    const PARALLAX = '[data-depth-parallax]';

    const canTilt = global.matchMedia
        && global.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const stillPreferred = global.matchMedia
        && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Tarjeta que se está moviendo ahora mismo, y hacia dónde. */
    let active = null;
    let pendingX = 0;
    let pendingY = 0;
    let glowX = 50;
    let glowY = 50;

    /** Superficie que recibe el resplandor, y dónde cae dentro de ella. */
    let field = null;
    /* Esquina de la portada, en coordenadas de DOCUMENTO: así no hay que
       remedirla al rodar la página. */
    let fieldLeft = 0;
    let fieldTop = 0;
    let lightX = 0;
    let lightY = 0;
    let lightDirty = false;

    /** Capa con paralaje, su recorrido útil y si está a la vista. */
    let parallax = null;
    let parallaxRange = 0;
    let parallaxSeen = true;
    let scrollDirty = false;
    let lastScroll = -1;

    let frame = 0;

    /* ----------------------------------------------------------------------
       El único fotograma
       ---------------------------------------------------------------------- */

    function paint() {
        frame = 0;

        if (active) {
            active.style.setProperty('--tilt-x', `${pendingX.toFixed(2)}deg`);
            active.style.setProperty('--tilt-y', `${pendingY.toFixed(2)}deg`);
            active.style.setProperty('--glow-x', `${glowX.toFixed(1)}%`);
            active.style.setProperty('--glow-y', `${glowY.toFixed(1)}%`);
        }

        if (lightDirty && field) {
            lightDirty = false;
            field.style.setProperty('--px', `${Math.round(lightX)}px`);
            field.style.setProperty('--py', `${Math.round(lightY)}px`);
        }

        if (scrollDirty && parallax) {
            scrollDirty = false;
            /* `scrollY` es un número que el navegador ya tiene: leerlo aquí no
               obliga a recalcular nada, al contrario que medir una caja. */
            const travelled = parallaxRange > 0
                ? Math.min(1, Math.max(0, global.scrollY / parallaxRange))
                : 0;

            // Tres decimales bastan y evitan reescribir el mismo valor
            const value = Number(travelled.toFixed(3));
            if (value !== lastScroll) {
                lastScroll = value;
                parallax.style.setProperty('--scroll', String(value));
            }
        }
    }

    function schedule() {
        if (frame) return;
        frame = global.requestAnimationFrame(paint);
    }

    /* ----------------------------------------------------------------------
       Inclinación y brillo de una tarjeta
       ---------------------------------------------------------------------- */

    /**
     * Traduce la posición del puntero dentro de la tarjeta a dos ángulos y a
     * un punto de luz. El centro es el reposo; las esquinas, la inclinación
     * máxima. La X se invierte porque subir el puntero tiene que levantar el
     * borde de arriba.
     */
    function onCard(event) {
        const card = event.target.closest(SELECTOR);
        if (!card) {
            release();
            return;
        }

        if (active !== card) {
            release();
            active = card;
            card.classList.add('is-tilting');
        }

        const box = card.getBoundingClientRect();
        if (!box.width || !box.height) return;

        const px = (event.clientX - box.left) / box.width - 0.5;
        const py = (event.clientY - box.top) / box.height - 0.5;

        pendingY = px * MAX_TILT * 2;
        pendingX = -py * MAX_TILT * 2;

        // El brillo cae justo bajo el puntero, en coordenadas de la tarjeta
        glowX = (px + 0.5) * 100;
        glowY = (py + 0.5) * 100;
    }

    /** Devuelve la tarjeta a su sitio y le quita el `will-change`. */
    function release() {
        if (!active) return;

        active.style.removeProperty('--tilt-x');
        active.style.removeProperty('--tilt-y');
        active.style.removeProperty('--glow-x');
        active.style.removeProperty('--glow-y');
        active.classList.remove('is-tilting');
        active = null;
    }

    function onLeave(event) {
        if (!active) return;
        // `pointerout` salta también entre hijos: solo cuenta salir de la tarjeta
        if (event.relatedTarget && active.contains(event.relatedTarget)) return;
        release();
    }

    /* ----------------------------------------------------------------------
       El resplandor de la portada
       ---------------------------------------------------------------------- */

    /**
     * La posición se guarda relativa a la portada y en píxeles, para que el
     * CSS pueda consumirla con un `translate3d` —que va por el compositor— en
     * lugar de repintar un degradado entero en cada fotograma.
     *
     * La esquina de la portada está guardada en coordenadas de DOCUMENTO, no
     * de ventana, y el desplazamiento se descuenta aquí con aritmética. Es la
     * diferencia entre medir una vez y medir siempre: con la esquina guardada
     * en coordenadas de ventana había que volver a llamar a
     * `getBoundingClientRect()` en cada evento de desplazamiento —es decir,
     * una recomposición forzada del diseño por fotograma mientras alguien
     * rueda la página—, que es justo lo que este módulo existe para evitar.
     */
    function onField(event) {
        if (!field) return;
        lightX = event.clientX + global.scrollX - fieldLeft;
        lightY = event.clientY + global.scrollY - fieldTop;
        lightDirty = true;
    }

    /** El único oyente de puntero: reparte y pide un fotograma. */
    function onPointerMove(event) {
        onCard(event);
        onField(event);
        schedule();
    }

    /**
     * Mide fuera del bucle lo que el bucle no puede permitirse medir: al
     * arrancar y al cambiar el tamaño de la ventana, y nunca más.
     */
    function measure() {
        if (field) {
            const box = field.getBoundingClientRect();
            fieldLeft = box.left + global.scrollX;
            fieldTop = box.top + global.scrollY;
        }

        if (parallax) {
            const box = parallax.getBoundingClientRect();
            parallaxRange = box.height || 0;
            lastScroll = -1;
            scrollDirty = true;
            schedule();
        }
    }

    /* ----------------------------------------------------------------------
       Desplazamiento
       ---------------------------------------------------------------------- */

    function onScroll() {
        /* Al desplazarse, la tarjeta se va de debajo del puntero sin que llegue
           ningún `pointerout`, y se quedaba inclinada a mitad de la pantalla.

           Aquí no se mide nada: este oyente se dispara al ritmo de los
           fotogramas y cualquier lectura de geometría dentro de él obliga al
           navegador a recalcular el diseño entero para contestarla. */
        release();

        if (!parallax || !parallaxSeen) return;
        scrollDirty = true;
        schedule();
    }

    /* ----------------------------------------------------------------------
       Arranque
       ---------------------------------------------------------------------- */

    function debounce(fn, wait) {
        let timer = 0;
        return function debounced() {
            global.clearTimeout(timer);
            timer = global.setTimeout(fn, wait);
        };
    }

    /** Deja de escribir cuando la portada ya no está en pantalla. */
    function watch(element) {
        if (!global.IntersectionObserver) return;

        const observer = new global.IntersectionObserver((entries) => {
            parallaxSeen = entries.some((entry) => entry.isIntersecting);

            /* Al volver a entrar hay que refrescar una vez, y no esperar al
               siguiente desplazamiento: si la portada reaparece por otra vía
               —el feed que se limpia de filtros, un cambio de tamaño— se
               quedaría con el valor que tenía al salir. */
            if (parallaxSeen) {
                scrollDirty = true;
                schedule();
            }
        }, { rootMargin: '10% 0px' });

        observer.observe(element);
    }

    function init() {
        // Sin movimiento no hay nada que hacer aquí: ni giro, ni luz, ni fondo
        if (stillPreferred) return;

        parallax = document.querySelector(PARALLAX);
        field = canTilt ? document.querySelector(FIELD) : null;

        if (!parallax && !field && !canTilt) return;

        if (parallax) watch(parallax);

        measure();
        global.addEventListener('resize', debounce(measure, 200), { passive: true });
        global.addEventListener('scroll', onScroll, { passive: true });

        if (!canTilt) return;

        /* Un solo oyente para los dos efectos de puntero, y un solo fotograma
           al final. Con un `pointermove` por efecto, el navegador recorre la
           lista de oyentes dos veces por evento y los eventos llegan más
           deprisa que los fotogramas. */
        document.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('pointerout', onLeave, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.DSDepth = { release };
})(window);
