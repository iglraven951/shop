/**
 * DiscoveryShop · Puente con la aplicación Android
 *
 * El sitio se empaqueta tal cual dentro de una WebView y se sirve desde
 * `https://appassets.androidplatform.net/`. Allí la capa nativa publica un
 * objeto `DSNative` con lo que una página no puede hacer por sí misma: abrir
 * WhatsApp, levantar la hoja de compartir, medir las barras del sistema o
 * vibrar. Este archivo es el único que lo conoce.
 *
 * Fuera de la aplicación no hace absolutamente nada observable: ni una clase,
 * ni un oyente, ni una variable CSS. Esa es la condición para que el mismo
 * código siga sirviendo en GitHub Pages, en un servidor local y abierto desde
 * el disco, que es de lo que vive el proyecto entero.
 *
 * Lo que sí existe siempre es `window.DSApp`: la superficie que pueden usar
 * las páginas sin preguntarse dónde se están ejecutando. Cada método trae su
 * alternativa para la web.
 *
 * Nada de aquí puede lanzar. La capa nativa la escribe otra gente, puede
 * cambiar de versión y puede faltarle un método; ninguna de esas tres cosas
 * tiene derecho a romper el sitio.
 */
(function (global) {
    'use strict';

    /* ----------------------------------------------------------------------
       Detección
       ---------------------------------------------------------------------- */

    // Dos señales porque ninguna basta sola: la aplicación añade su marca al
    // user agent, pero la interfaz Java puede tardar en inyectarse; y al
    // revés, un navegador de escritorio jamás tendrá `DSNative`.
    const userAgent = (global.navigator && global.navigator.userAgent) || '';
    const isNative = /DiscoveryShopApp/.test(userAgent) || typeof global.DSNative !== 'undefined';

    /**
     * Invoca un método del puente nativo.
     *
     * @param {string} method - Nombre del método en `DSNative`.
     * @param {Array} [args] - Argumentos posicionales.
     * @returns {{ok: boolean, value: *}} `ok` es false cuando el método no
     *   existe o cuando la llamada falló; quien llama elige entonces su
     *   alternativa en lugar de quedarse sin respuesta.
     */
    function callBridge(method, args) {
        const bridge = global.DSNative;
        if (!bridge || typeof bridge[method] !== 'function') {
            return { ok: false, value: undefined };
        }

        try {
            return { ok: true, value: bridge[method].apply(bridge, args || []) };
        } catch (error) {
            console.warn(`[DSApp] El puente nativo falló en «${method}»:`, error);
            return { ok: false, value: undefined };
        }
    }

    /** Espera a que pasen `wait` ms sin nuevas llamadas antes de ejecutar. */
    function debounce(fn, wait) {
        let timer = null;
        return function debounced() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(fn, wait);
        };
    }

    /* ----------------------------------------------------------------------
       Áreas seguras
       ---------------------------------------------------------------------- */

    const SIDES = ['top', 'bottom', 'left', 'right'];

    /**
     * Pregunta al puente cuánto ocupan las barras del sistema. Llega como
     * cadena JSON porque una interfaz Java solo puede devolver tipos simples.
     *
     * @returns {{top:number,bottom:number,left:number,right:number}|null}
     *   null si no hay puente o si la respuesta no es legible.
     */
    function readInsets() {
        const answer = callBridge('insets');
        if (!answer.ok || typeof answer.value !== 'string' || !answer.value) return null;

        let parsed;
        try {
            parsed = JSON.parse(answer.value);
        } catch (error) {
            return null;
        }

        if (!parsed || typeof parsed !== 'object') return null;

        // Un valor ausente, negativo o absurdo cuenta como cero: es preferible
        // una cabecera pegada al borde que una franja vacía a media pantalla.
        const insets = {};
        SIDES.forEach((side) => {
            const value = Number(parsed[side]);
            insets[side] = Number.isFinite(value) && value > 0 ? value : 0;
        });

        return insets;
    }

    /**
     * Publica los márgenes como propiedades CSS en `:root`, para que las hojas
     * de estilo los sumen donde toque sin saber nada de la capa nativa.
     */
    function applyInsets() {
        const insets = readInsets();
        if (!insets) return;

        const root = document.documentElement;
        SIDES.forEach((side) => {
            root.style.setProperty(`--ds-inset-${side}`, `${insets[side]}px`);
        });
    }

    /* ----------------------------------------------------------------------
       Enlaces externos
       ---------------------------------------------------------------------- */

    /**
     * Sube por el árbol hasta el enlace que contiene al nodo pulsado. Se
     * recorre a mano en lugar de con `closest` porque el objetivo de un clic
     * puede no ser un elemento, y aquí no se puede fallar.
     *
     * @param {Node} node
     * @returns {Element|null}
     */
    function findLink(node) {
        for (let current = node; current; current = current.parentNode) {
            if (current.nodeType === 1
                && current.tagName === 'A'
                && current.getAttribute('href')) {
                return current;
            }
        }
        return null;
    }

    /**
     * ¿El enlace sale de nuestro propio origen?
     *
     * Dentro de la aplicación el origen es `appassets.androidplatform.net`, así
     * que la navegación entre páginas del sitio no se toca. Solo wa.me,
     * openstreetmap y compañía se entregan al sistema.
     *
     * @param {Element} anchor
     * @returns {boolean}
     */
    function isExternalLink(anchor) {
        let target;
        try {
            target = new URL(anchor.href, global.location.href);
        } catch (error) {
            return false;
        }

        // mailto:, tel: y demás los resuelve la propia WebView.
        if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;

        return target.origin !== global.location.origin;
    }

    function onDocumentClick(event) {
        // Un clic ya atendido, o con un modificador, no es nuestro. Dentro de
        // la aplicación no existen, pero respetarlos no cuesta nada.
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const anchor = findLink(event.target);
        if (!anchor || !isExternalLink(anchor)) return;

        // Se evita la navegación, pero no se detiene la propagación: la página
        // puede tener su propio oyente en ese mismo enlace —el aviso de la IA
        // marca el envío al pulsarlo— y tiene que seguir ejecutándose.
        event.preventDefault();
        openExternal(anchor.href);
    }

    /* ----------------------------------------------------------------------
       Superficie pública
       ---------------------------------------------------------------------- */

    /**
     * Abre una URL fuera del sitio: en la aplicación con el navegador o con la
     * app que le corresponda (WhatsApp, mapas…); en la web, en otra pestaña.
     *
     * @param {string} url
     * @returns {boolean} true si alguien se hizo cargo de la URL.
     */
    function openExternal(url) {
        const href = String(url || '').trim();
        if (!href) return false;

        if (callBridge('openExternal', [href]).ok) return true;

        try {
            return !!global.open(href, '_blank', 'noopener');
        } catch (error) {
            return false;
        }
    }

    /** Último recurso de `share`: dejar el enlace en el portapapeles. */
    function copyLink(text) {
        const clipboard = global.navigator && global.navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }

        return clipboard.writeText(text).then(() => true, () => false);
    }

    /**
     * Comparte una publicación. En la aplicación abre la hoja de Android; en la
     * web usa `navigator.share` si existe y, si no, copia el enlace.
     *
     * @param {{title?: string, text?: string, url?: string}} [payload]
     * @returns {Promise<boolean>} true si se compartió o se copió.
     */
    function share(payload) {
        const data = payload || {};
        const title = String(data.title || document.title || 'DiscoveryShop');
        const text = String(data.text || '');
        const link = String(data.url || global.location.href);

        if (callBridge('share', [title, text, link]).ok) return Promise.resolve(true);

        const navigatorRef = global.navigator;
        if (navigatorRef && typeof navigatorRef.share === 'function') {
            // Cancelar la hoja del navegador rechaza la promesa: no es un
            // error, pero tampoco un envío, así que se cae al portapapeles.
            return navigatorRef.share({ title, text, url: link })
                .then(() => true, () => copyLink(link));
        }

        return copyLink(link);
    }

    /**
     * Un toque háptico breve, para confirmar una acción sin ruido ni aviso.
     * Silencioso donde no haya vibración.
     *
     * @param {number} [ms=12] - Duración, acotada para no volverse un zumbido.
     */
    function vibrate(ms) {
        const requested = Number(ms);
        const duration = Number.isFinite(requested) && requested > 0
            ? Math.min(requested, 200)
            : 12;

        if (callBridge('vibrate', [duration]).ok) return;

        const navigatorRef = global.navigator;
        if (navigatorRef && typeof navigatorRef.vibrate === 'function') {
            try {
                navigatorRef.vibrate(duration);
            } catch (error) {
                /* sin vibración: es un adorno, no una función */
            }
        }
    }

    /**
     * Márgenes que ocupan las barras del sistema, en píxeles CSS.
     * @returns {{top:number,bottom:number,left:number,right:number}} Ceros en la web.
     */
    function insets() {
        return readInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
    }

    /* ----------------------------------------------------------------------
       Arranque
       ---------------------------------------------------------------------- */

    /**
     * Lo que ven las páginas. `DSNative` es el detalle de implementación y
     * puede no existir; `DSApp` está siempre, con la web como alternativa.
     */
    global.DSApp = { isNative, openExternal, share, vibrate, insets };

    // En la web el archivo termina aquí, sin dejar rastro.
    if (!isNative) return;

    document.documentElement.classList.add('ds-native');

    applyInsets();

    // Girar el teléfono o abrir el teclado cambia las barras del sistema. Se
    // espera a que el gesto termine: durante el giro las medidas van llegando
    // a medio camino y la cabecera daría un salto por cada una.
    const refreshInsets = debounce(applyInsets, 150);
    global.addEventListener('resize', refreshInsets);
    global.addEventListener('orientationchange', refreshInsets);

    // En captura, para llegar antes que cualquier oyente de la página.
    document.addEventListener('click', onDocumentClick, true);
})(window);
