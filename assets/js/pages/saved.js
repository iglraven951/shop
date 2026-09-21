/**
 * DiscoveryShop · Publicaciones guardadas
 *
 * Guardar (🔖) y me gusta (❤️) son acciones distintas: esta página solo lista
 * lo que alguien apartó para revisarlo más tarde.
 *
 * La API de guardados no admite orden ni paginación —devuelve la lista
 * completa—, así que el orden se resuelve en el cliente sobre `state.posts`.
 * Todo lo que se pinta sale de `UI.postCard`, que ya escapa su contenido.
 */
(function (global) {
    'use strict';

    const { $, format } = global.DS;
    const api = global.api;
    const store = global.store;
    const toast = global.toast;
    const modal = global.modal;
    const UI = global.UI;

    const SKELETON_COUNT = 3;
    // Debe acompañar a la transición de `.post-card.is-removing` en saved.css.
    const EXIT_MS = 240;

    /**
     * Sin un `saved_at` en la API no se puede ordenar por el momento en que se
     * guardó cada publicación: «recientes» usa la fecha de la publicación, que
     * es el único dato temporal disponible.
     */
    const SORTERS = {
        recent: (a, b) => new Date(b.created_at) - new Date(a.created_at),
        price_asc: (a, b) => Number(a.price) - Number(b.price),
        price_desc: (a, b) => Number(b.price) - Number(a.price),
        commented: (a, b) => (Number(b.comment_count) || 0) - (Number(a.comment_count) || 0),
    };

    const state = {
        user: null,
        posts: [],
        sort: 'recent',
        clearing: false,
    };

    const dom = {};
    let actionsBound = false;

    /* ======================================================================
       Utilidades
       ====================================================================== */

    function cacheDom() {
        dom.page = $('#saved-page');
        dom.gate = $('#saved-gate');
        dom.shell = $('#saved-shell');
        dom.count = $('#saved-count');
        dom.sort = $('#saved-sort');
        dom.actions = $('#saved-actions');
        dom.clear = $('#saved-clear');
        dom.progress = $('#saved-progress');
        dom.feed = $('#saved-feed');
        dom.state = $('#saved-state');
    }

    /** Busca la tarjeta por dato, no por selector: un id raro rompería el CSS. */
    function findCard(id) {
        return Array.from(dom.feed.children).find((node) => node.dataset.postId === id) || null;
    }

    /** Mantiene el contador de la cabecera del sitio al día. */
    function forgetInStore(id) {
        const saved = store.get('saved') || [];
        store.set({ saved: saved.filter((entry) => entry !== id) });
    }

    /* ======================================================================
       Pintado
       ====================================================================== */

    function renderCount() {
        const total = state.posts.length;

        dom.count.textContent = total === 0
            ? 'No tienes publicaciones guardadas'
            : `${format.number(total)} ${format.plural(total, 'publicación guardada', 'publicaciones guardadas')}`;
    }

    function renderEmpty() {
        dom.feed.innerHTML = '';
        dom.actions.hidden = true;
        dom.state.innerHTML = UI.emptyState({
            icon: '🔖',
            title: 'Todavía no has guardado nada',
            message: 'Pulsa «Guardar» en cualquier publicación para tenerla aquí a mano.',
            action: { label: 'Explorar el foro', href: 'index.html' },
        });
    }

    function renderError(error) {
        dom.feed.innerHTML = '';
        dom.feed.setAttribute('aria-busy', 'false');
        dom.actions.hidden = true;
        dom.count.textContent = 'No se pudo cargar la lista';
        dom.state.innerHTML = UI.emptyState({
            icon: '⚠️',
            title: 'No pudimos cargar tus guardados',
            message: error.message || 'Vuelve a intentarlo dentro de unos segundos.',
            action: { label: 'Reintentar', href: 'guardados.html' },
        });
    }

    function renderFeed() {
        dom.state.innerHTML = '';
        dom.feed.setAttribute('aria-busy', 'false');

        if (!state.posts.length) {
            renderEmpty();
            return;
        }

        const ordered = state.posts.slice().sort(SORTERS[state.sort] || SORTERS.recent);

        dom.feed.innerHTML = ordered
            .map((post, index) => UI.postCard(post, { index }))
            .join('');

        dom.actions.hidden = false;

        // La delegación se instala una sola vez: sobrevive a cada repintado.
        if (!actionsBound) {
            UI.bindPostActions(dom.feed, { onSaveChange: handleSaveChange });
            actionsBound = true;
        }
    }

    /* ======================================================================
       Quitar de la lista
       ====================================================================== */

    /**
     * Desguardar desde la propia tarjeta la saca de la lista: dejarla ahí, ya
     * apagada, confundiría sobre qué sigue guardado.
     */
    function handleSaveChange(id, saved) {
        if (saved) return;
        dropPost(id);
    }

    /**
     * El estado vacío espera a que la última tarjeta termine de salir: al
     * vaciar la lista entera, las bajas se solapan con sus animaciones.
     */
    function renderEmptyWhenDone() {
        if (state.posts.length || dom.feed.children.length) return;
        renderEmpty();
    }

    /** Quita la publicación del estado y retira su tarjeta con una salida suave. */
    function dropPost(id) {
        state.posts = state.posts.filter((post) => post.id !== id);
        renderCount();

        const card = findCard(id);

        if (!card) {
            renderEmptyWhenDone();
            return;
        }

        card.classList.add('is-removing');

        setTimeout(() => {
            card.remove();
            renderEmptyWhenDone();
        }, EXIT_MS);
    }

    function showProgress(done, total) {
        dom.progress.hidden = false;
        dom.progress.textContent = `Quitando ${format.number(done)} de ${format.number(total)}…`;
    }

    async function clearAll() {
        if (state.clearing || !state.posts.length) return;

        const total = state.posts.length;

        const confirmed = await modal.confirm({
            title: 'Vaciar guardados',
            message: `Se quitarán ${total} ${format.plural(total, 'publicación', 'publicaciones')} de tu lista. `
                + 'Seguirán publicadas en el foro y podrás volver a guardarlas cuando quieras.',
            confirmLabel: 'Sí, vaciar',
            cancelLabel: 'Conservar',
            danger: true,
        });

        if (!confirmed) return;

        state.clearing = true;
        dom.clear.disabled = true;

        const ids = state.posts.map((post) => post.id);
        let failed = 0;

        // En serie a propósito: una ráfaga en paralelo dejaría el contador y el
        // listado desacompasados si alguna llamada fallara a mitad de camino.
        for (let index = 0; index < ids.length; index += 1) {
            showProgress(index + 1, total);

            try {
                // eslint-disable-next-line no-await-in-loop -- progreso visible paso a paso
                await api.toggleSave(ids[index]);
                forgetInStore(ids[index]);
                dropPost(ids[index]);
            } catch (error) {
                failed += 1;
            }
        }

        dom.progress.hidden = true;
        dom.progress.textContent = '';
        dom.clear.disabled = false;
        state.clearing = false;

        if (failed) {
            toast.error(`No pudimos quitar ${failed} ${format.plural(failed, 'publicación', 'publicaciones')}. Inténtalo de nuevo.`);
        } else {
            toast.success('Tu lista de guardados quedó vacía');
        }
    }

    /* ======================================================================
       Carga
       ====================================================================== */

    async function load() {
        dom.feed.setAttribute('aria-busy', 'true');
        dom.feed.innerHTML = UI.postSkeleton(SKELETON_COUNT);

        try {
            const data = await api.getSavedPosts();
            state.posts = (data.posts || []).slice();

            // La lista recién traída es la verdad: sincroniza la insignia de la cabecera.
            store.set({ saved: data.ids || state.posts.map((post) => post.id) });
        } catch (error) {
            renderError(error);
            toast.error(error.message || 'No se pudieron cargar tus guardados');
            return;
        }

        renderCount();
        renderFeed();
    }

    /* ======================================================================
       Eventos
       ====================================================================== */

    function bindEvents() {
        dom.sort.addEventListener('change', () => {
            state.sort = SORTERS[dom.sort.value] ? dom.sort.value : 'recent';
            renderFeed();
        });

        dom.clear.addEventListener('click', clearAll);
    }

    /* ======================================================================
       Arranque
       ====================================================================== */

    /** Sin sesión no se redirige: se invita a entrar conservando el destino. */
    function renderGate() {
        dom.shell.hidden = true;
        dom.gate.hidden = false;
        dom.gate.innerHTML = UI.loginGate({
            icon: '🔖',
            title: 'Inicia sesión para ver tus guardados',
            message: 'Tu lista es privada. Entra con tu cuenta y encuentra aquí todo lo que apartaste para revisar con calma.',
        });
    }

    async function init() {
        cacheDom();
        if (!dom.page) return;

        await api.ready();

        // El shell resuelve la sesión en paralelo, así que puede no estar lista.
        state.user = store.get('user');

        if (!state.user) {
            const session = await api.getCurrentUser();
            state.user = session ? (session.user || session) : null;
        }

        if (!state.user) {
            renderGate();
            return;
        }

        dom.gate.hidden = true;
        dom.shell.hidden = false;

        bindEvents();
        await load();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
