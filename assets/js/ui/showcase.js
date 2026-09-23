/**
 * DiscoveryShop · Muro de fotos de la portada
 *
 * Dos hileras de fotos del catálogo que pasan en sentidos contrarios detrás
 * del texto de la portada. No es una galería: es textura. Por eso no lleva
 * títulos, ni precios, ni enlaces —una foto que se puede pulsar pide que la
 * mires, y aquí lo que importa es el titular que tiene delante.
 *
 * El movimiento es una animación CSS sobre una lista duplicada: al llegar la
 * copia al punto donde empezaba el original, el bucle reinicia y el salto es
 * invisible. Así no hay temporizadores ni trabajo en cada fotograma.
 */
(function (global) {
    'use strict';

    const { escapeAttr } = global.DS;

    /** Cuántas publicaciones se piden para llenar el muro. */
    const COUNT = 18;

    /** Por debajo de esto el muro se repite demasiado y se nota. */
    const MINIMUM = 6;

    /**
     * Una foto del muro. Sin enlace, sin texto y fuera del árbol de
     * accesibilidad: el feed de abajo ya ofrece lo mismo de forma navegable.
     */
    function tile(post) {
        // Las fotos vienen de una red externa. Si alguna no carga, sin esto
        // quedaría un hueco; así se sustituye por el SVG generado, que no
        // necesita conexión. `onerror` se anula para no entrar en bucle.
        const fallback = post.fallback_url
            ? ` onerror="this.onerror=null;this.src='${escapeAttr(post.fallback_url)}'"`
            : '';

        return `<span class="showcase-item"><img src="${escapeAttr(post.image_url)}"`
             + ` alt="" loading="lazy" decoding="async"${fallback}></span>`;
    }

    /**
     * Llena una hilera con la lista duplicada.
     *
     * La animación desplaza exactamente el ancho de la primera copia, así que
     * cuando termina, la segunda está justo donde empezó la primera.
     */
    function fill(track, posts) {
        if (!track) return;
        const html = posts.map(tile).join('');
        track.innerHTML = html + html;
    }

    async function init() {
        const track = document.getElementById('showcase-track');
        if (!track) return;

        const back = document.getElementById('showcase-track-2');
        const wall = track.closest('.showcase');

        try {
            await global.api.ready();

            // Las más recientes: el muro debe reflejar lo que hay ahora
            const data = await global.api.getRequests({ per_page: COUNT, sort: 'recent' });
            const posts = (data.requests || []).filter((p) => p.image_url);

            if (posts.length < MINIMUM) {
                if (wall) wall.hidden = true;
                return;
            }

            fill(track, posts);

            // La hilera de abajo arranca por la mitad de la lista, para que las
            // dos no muestren la misma foto a la misma altura.
            if (back) {
                const half = Math.floor(posts.length / 2);
                fill(back, posts.slice(half).concat(posts.slice(0, half)));
            }

            // Un recorrido más largo cuanto más contenido, para que la
            // velocidad aparente sea la misma con 8 fotos que con 18.
            if (wall) wall.style.setProperty('--showcase-duration', `${posts.length * 5}s`);

            if (wall) wall.hidden = false;
        } catch (error) {
            // El muro es decorativo: si falla, se retira sin ruido
            if (wall) wall.hidden = true;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.DiscoveryShowcase = { init };
})(window);
