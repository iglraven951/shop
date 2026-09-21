/**
 * DiscoveryShop · Cinta de productos
 *
 * Una banda de fotos del catálogo que se desplaza sin parar bajo la portada,
 * como un vídeo. Sirve de muestra viva: enseña qué se publica aquí antes de
 * que nadie haga scroll.
 *
 * El movimiento es una animación CSS sobre una lista duplicada: al llegar la
 * copia al punto donde empezaba el original, el bucle reinicia y el salto es
 * invisible. Así no hay temporizadores ni trabajo en cada fotograma.
 */
(function (global) {
    'use strict';

    const { escapeHtml, escapeAttr, format } = global.DS;

    /** Cuántas publicaciones se piden para llenar la cinta. */
    const COUNT = 14;

    /**
     * Una tarjeta de la cinta. Es un enlace: lo que se ve pasar se puede
     * abrir, que es el sentido de enseñarlo.
     */
    function slide(post) {
        const fallback = post.fallback_url
            ? ` onerror="this.onerror=null;this.src='${escapeAttr(post.fallback_url)}'"`
            : '';

        return `
        <a class="showcase-item" href="publicacion.html?id=${escapeAttr(post.id)}"
           tabindex="-1" aria-hidden="true">
            <img src="${escapeAttr(post.image_url)}" alt="" loading="lazy" decoding="async"${fallback}>
            <span class="showcase-info">
                <span class="showcase-title">${escapeHtml(post.title)}</span>
                <span class="showcase-price">${escapeHtml(format.money(post.price))}</span>
            </span>
        </a>`;
    }

    async function init() {
        const track = document.getElementById('showcase-track');
        if (!track) return;

        const section = track.closest('.showcase');

        try {
            await global.api.ready();

            // Las más recientes: la cinta debe reflejar lo que hay ahora
            const data = await global.api.getPosts({ per_page: COUNT, sort: 'recent' });
            const posts = (data.posts || []).filter((p) => p.image_url);

            if (posts.length < 4) {
                // Con tan pocas publicaciones la cinta se ve pobre y repetida
                if (section) section.hidden = true;
                return;
            }

            /* La lista va duplicada: la animación desplaza exactamente el
               ancho de la primera copia, así que cuando termina, la segunda
               está justo donde empezó la primera y el reinicio no se nota. */
            const html = posts.map(slide).join('');
            track.innerHTML = html + html;

            // Un recorrido más largo cuanto más contenido, para que la
            // velocidad aparente sea la misma con 6 tarjetas que con 14.
            track.style.setProperty('--showcase-duration', `${posts.length * 4.5}s`);

            if (section) section.hidden = false;
        } catch (error) {
            // La cinta es decorativa: si falla, se retira sin ruido
            if (section) section.hidden = true;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.DiscoveryShowcase = { init };
})(window);
