/**
 * DiscoveryShop · Panel de administración
 *
 * Dos colas de trabajo: publicaciones que esperan aprobación y solicitudes de
 * cuenta de vendedor. El acceso se resuelve antes de pintar cualquier dato: sin
 * sesión se invita a entrar, y con sesión sin permisos se explica el porqué.
 * Ninguna cifra ni botón de moderación llega al DOM de quien no es admin.
 *
 * Cada pestaña carga sus datos la primera vez que se abre (carga perezosa) y
 * toda acción de moderación refresca las métricas, para que la insignia de la
 * cabecera y el panel cuenten siempre lo mismo.
 */
(function (global) {
    'use strict';

    const { $, $$, escapeHtml, escapeAttr, format, debounce } = global.DS;
    const api = global.api;
    const store = global.store;
    const UI = global.UI;
    const toast = global.toast;
    const modal = global.modal;

    const TABS = ['publicaciones', 'vendedores', 'historial'];

    /** Motivos que el equipo escribe una y otra vez: un clic rellena el campo. */
    const REJECTION_PRESETS = [
        'Las fotos no muestran el artículo real',
        'La descripción es insuficiente',
        'El precio no corresponde al artículo',
        'Contenido no permitido en el foro',
        'Publicación duplicada',
    ];

    // El servidor exige 8 caracteres; validamos aquí para no gastar una petición.
    const MIN_REASON = 8;
    const MAX_REASON = 300;

    const POST_STATUS_WORDS = {
        pending: ['pendiente', 'pendientes'],
        approved: ['aprobada', 'aprobadas'],
        rejected: ['rechazada', 'rechazadas'],
        all: ['en total', 'en total'],
    };

    const SELLER_STATUS_WORDS = {
        pending: ['pendiente', 'pendientes'],
        approved: ['aprobado', 'aprobados'],
        rejected: ['rechazado', 'rechazados'],
        all: ['en total', 'en total'],
    };

    const SELLER_BADGES = {
        pending: ['badge-warning', '⏳ En revisión'],
        approved: ['badge-success', '✓ Aprobado'],
        rejected: ['badge-danger', '✕ Rechazado'],
    };

    const LOG_META = {
        approve_post: { label: 'Publicación aprobada', tone: 'approve', icon: '✓', badge: 'badge-success' },
        reject_post: { label: 'Publicación rechazada', tone: 'reject', icon: '✕', badge: 'badge-danger' },
        approve_seller: { label: 'Vendedor aprobado', tone: 'approve', icon: '✓', badge: 'badge-success' },
        reject_seller: { label: 'Vendedor rechazado', tone: 'reject', icon: '✕', badge: 'badge-danger' },
    };

    const EMPTY_POSTS = {
        pending: {
            icon: '✅',
            title: 'No hay publicaciones pendientes',
            message: 'Todo al día. Cuando alguien publique un artículo aparecerá aquí para su revisión.',
        },
        approved: {
            icon: '📭',
            title: 'Todavía no hay publicaciones aprobadas',
            message: 'En cuanto apruebes la primera, se mostrará en esta lista.',
        },
        rejected: {
            icon: '🙌',
            title: 'No hay publicaciones rechazadas',
            message: 'Ninguna publicación ha sido rechazada hasta ahora.',
        },
        all: {
            icon: '📭',
            title: 'Todavía no hay publicaciones',
            message: 'El foro está vacío. Las publicaciones de los vendedores aparecerán aquí.',
        },
    };

    const EMPTY_SELLERS = {
        pending: {
            icon: '✅',
            title: 'No hay solicitudes pendientes',
            message: 'Cuando alguien pida una cuenta de vendedor, su solicitud aparecerá aquí.',
        },
        approved: {
            icon: '🧑‍💼',
            title: 'Todavía no hay vendedores aprobados',
            message: 'Aprueba una solicitud y la persona podrá publicar sus artículos.',
        },
        rejected: {
            icon: '🙌',
            title: 'No hay solicitudes rechazadas',
            message: 'Ninguna solicitud de vendedor ha sido rechazada hasta ahora.',
        },
        all: {
            icon: '📭',
            title: 'No hay solicitudes de vendedor',
            message: 'Nadie ha pedido todavía una cuenta para publicar en el foro.',
        },
    };

    const state = {
        user: null,
        tab: 'publicaciones',
        stats: null,
        posts: { status: 'pending', q: '', items: [], loaded: false },
        sellers: { status: 'pending', items: [], loaded: false },
        log: { items: [], loaded: false },
        selection: new Set(),
        bulkRunning: false,
        // Índice de fila a la que devolver el foco tras repintar (atajos de teclado).
        focusIndex: null,
    };

    // Descarta respuestas que llegan tarde: teclear rápido en el buscador
    // no puede dejar en pantalla el resultado de una consulta anterior.
    let postsTicket = 0;
    let sellersTicket = 0;

    /* ======================================================================
       Arranque y control de acceso
       ====================================================================== */

    async function init() {
        await api.ready();

        state.user = await resolveUser();

        if (!state.user) {
            showGate();
            return;
        }

        if (state.user.role !== 'admin') {
            showDenied();
            return;
        }

        showContent();
        bindEvents();

        await refreshStats();
        activateTab(tabFromHash(), { syncHash: false });
    }

    /** shell.js resuelve la sesión en paralelo, así que no dependemos de su orden. */
    async function resolveUser() {
        const cached = store.get('user');
        if (cached) return cached;

        try {
            const session = await api.getCurrentUser();
            return session && session.user ? session.user : null;
        } catch (error) {
            return null;
        }
    }

    function hideBoot() {
        const boot = $('#admin-boot');
        boot.hidden = true;
        boot.setAttribute('aria-busy', 'false');
    }

    function showGate() {
        hideBoot();
        const gate = $('#admin-gate');
        gate.innerHTML = UI.loginGate({
            icon: '🛡️',
            title: 'Panel de administración',
            message: 'Inicia sesión con una cuenta del equipo de moderación para revisar la cola.',
        });
        gate.hidden = false;
    }

    function showDenied() {
        hideBoot();
        $('#admin-denied').hidden = false;
    }

    function showContent() {
        hideBoot();
        $('#admin-content').hidden = false;
    }

    /* ======================================================================
       Métricas
       ====================================================================== */

    async function refreshStats() {
        try {
            const stats = await api.getAdminStats();
            state.stats = stats;
            renderMetrics(stats);

            // Mantiene al día la insignia de la cabecera inyectada por shell.js.
            store.set({ pendingModeration: stats.posts.pending + stats.sellers.pending });
        } catch (error) {
            toast.error(error.message);
        }
    }

    function setMetric(name, value) {
        $$(`[data-metric="${name}"]`).forEach((node) => { node.textContent = value; });
    }

    function setCount(name, value) {
        $$(`[data-count="${name}"]`).forEach((node) => { node.textContent = format.number(value); });
    }

    function renderMetrics(stats) {
        const activity = stats.activity.comments + stats.activity.interested + stats.activity.views;
        const sellersTotal = stats.sellers.approved + stats.sellers.pending + stats.sellers.rejected;

        setMetric('posts-pending', format.number(stats.posts.pending));
        setMetric('sellers-pending', format.number(stats.sellers.pending));
        setMetric('posts-approved', format.number(stats.posts.approved));
        setMetric('posts-rejected', format.number(stats.posts.rejected));
        setMetric('users-total', format.number(stats.users.total));
        setMetric('activity-total', format.number(activity));
        setMetric(
            'activity-detail',
            `${format.number(stats.activity.comments)} comentarios · `
            + `${format.number(stats.activity.interested)} interesados · `
            + `${format.number(stats.activity.views)} visitas`
        );

        // Solo se tiñen de aviso si de verdad hay trabajo esperando.
        const postsCard = $('[data-metric-card="posts-pending"]');
        if (postsCard) postsCard.classList.toggle('is-warning', stats.posts.pending > 0);

        const sellersCard = $('[data-metric-card="sellers-pending"]');
        if (sellersCard) sellersCard.classList.toggle('is-brand', stats.sellers.pending > 0);

        setCount('posts-pending', stats.posts.pending);
        setCount('posts-approved', stats.posts.approved);
        setCount('posts-rejected', stats.posts.rejected);
        setCount('posts-total', stats.posts.total);
        setCount('sellers-pending', stats.sellers.pending);
        setCount('sellers-approved', stats.sellers.approved);
        setCount('sellers-rejected', stats.sellers.rejected);
        setCount('sellers-total', sellersTotal);

        setTabCount('publicaciones', stats.posts.pending);
        setTabCount('vendedores', stats.sellers.pending);
    }

    function setTabCount(tab, value) {
        const node = $(`[data-tab-count="${tab}"]`);
        if (!node) return;
        node.textContent = format.number(value);
        node.hidden = value <= 0;
    }

    /* ======================================================================
       Pestañas
       ====================================================================== */

    function tabFromHash() {
        const name = global.location.hash.replace('#', '');
        return TABS.includes(name) ? name : TABS[0];
    }

    function activateTab(name, options = {}) {
        const { syncHash = true, focus = false } = options;
        const tab = TABS.includes(name) ? name : TABS[0];
        state.tab = tab;

        TABS.forEach((item) => {
            const button = $(`#tab-${item}`);
            const panel = $(`#panel-${item}`);
            const active = item === tab;

            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
            panel.hidden = !active;
        });

        if (focus) $(`#tab-${tab}`).focus();

        // El hash deja rastro en el historial: atrás vuelve a la pestaña previa.
        if (syncHash && global.location.hash.replace('#', '') !== tab) {
            global.location.hash = tab;
        }

        loadTab(tab);
    }

    function loadTab(tab) {
        if (tab === 'publicaciones' && !state.posts.loaded) loadPosts();
        if (tab === 'vendedores' && !state.sellers.loaded) loadSellers();
        if (tab === 'historial' && !state.log.loaded) loadLog();
    }

    /* ======================================================================
       Cola de publicaciones
       ====================================================================== */

    function listSkeleton(count) {
        const row = `
            <div class="admin-queue-skeleton" aria-hidden="true">
                <div class="skeleton admin-skeleton-thumb"></div>
                <div class="admin-skeleton-body">
                    <div class="skeleton skeleton-text w-50"></div>
                    <div class="skeleton skeleton-text w-30"></div>
                </div>
                <div class="skeleton admin-skeleton-side"></div>
            </div>`;
        return Array.from({ length: count }, () => row).join('');
    }

    async function loadPosts() {
        const list = $('#admin-post-list');
        const ticket = ++postsTicket;

        state.selection.clear();
        syncBulkBar();

        $('#admin-queue-head').hidden = true;
        list.setAttribute('aria-busy', 'true');
        list.innerHTML = listSkeleton(4);

        try {
            const data = await api.getAdminPosts(state.posts.status, state.posts.q);
            if (ticket !== postsTicket) return;

            state.posts.items = data.posts || [];
            state.posts.loaded = true;
            renderPosts();
        } catch (error) {
            if (ticket !== postsTicket) return;

            state.posts.items = [];
            list.innerHTML = UI.emptyState({
                icon: '⚠️',
                title: 'No se pudo cargar la cola',
                message: error.message,
            });
            toast.error(error.message);
        } finally {
            if (ticket === postsTicket) list.setAttribute('aria-busy', 'false');
        }
    }

    function rowActions(post) {
        const id = escapeAttr(post.id);
        const parts = [
            `<a class="btn btn-ghost btn-sm" href="publicacion.html?id=${id}"
                target="_blank" rel="noopener">Ver</a>`,
        ];

        // Acciones contextuales: aprobar lo ya aprobado solo daría un error.
        if (post.status !== 'approved') {
            parts.push(`<button class="btn btn-success btn-sm" type="button"
                                data-approve-post="${id}">Aprobar</button>`);
        }
        if (post.status !== 'rejected') {
            parts.push(`<button class="btn btn-danger btn-sm" type="button"
                                data-reject-post="${id}">Rechazar</button>`);
        }

        return parts.join('');
    }

    function queueItem(post) {
        const selected = state.selection.has(post.id);

        return `
        <div class="admin-queue-item${selected ? ' is-selected' : ''}"
             data-id="${escapeAttr(post.id)}" tabindex="0">
            <label class="admin-check">
                <input type="checkbox" data-select="${escapeAttr(post.id)}" ${selected ? 'checked' : ''}
                       aria-label="Seleccionar «${escapeAttr(post.title)}»">
            </label>

            <div class="admin-queue-body">
                ${UI.postRow(post, { showStatus: true, actions: rowActions(post) })}
                ${post.status === 'rejected' && post.rejection_reason ? `
                <p class="admin-queue-reason">
                    <strong>Motivo del rechazo:</strong> ${escapeHtml(post.rejection_reason)}
                </p>` : ''}
            </div>
        </div>`;
    }

    function renderPosts() {
        const list = $('#admin-post-list');
        const head = $('#admin-queue-head');
        const items = state.posts.items;

        if (!items.length) {
            head.hidden = true;
            state.focusIndex = null; // no queda fila a la que devolver el foco
            list.innerHTML = UI.emptyState(state.posts.q
                ? {
                    icon: '🔍',
                    title: 'Sin resultados para tu búsqueda',
                    message: 'Prueba con otro título, con el nombre de quien publica o con un distrito.',
                }
                : EMPTY_POSTS[state.posts.status]);
            updatePostsStatusLine();
            syncBulkBar();
            return;
        }

        head.hidden = false;
        list.innerHTML = items.map(queueItem).join('');

        updatePostsStatusLine();
        syncBulkBar();
        restoreFocus();
    }

    /** Devuelve el foco a la fila equivalente tras repintar por un atajo. */
    function restoreFocus() {
        if (state.focusIndex === null) return;

        const rows = $$('.admin-queue-item', $('#admin-post-list'));
        const target = rows[Math.min(state.focusIndex, rows.length - 1)];
        state.focusIndex = null;

        if (target) target.focus();
    }

    function updatePostsStatusLine() {
        const total = state.posts.items.length;
        const words = POST_STATUS_WORDS[state.posts.status] || POST_STATUS_WORDS.all;
        const node = $('#admin-posts-status');

        node.textContent = total
            ? `${format.number(total)} ${format.plural(total, 'publicación', 'publicaciones')} `
              + `${format.plural(total, words[0], words[1])}`
            : '';
    }

    function findRow(id) {
        return $$('.admin-queue-item', $('#admin-post-list'))
            .find((node) => node.dataset.id === id) || null;
    }

    /** Anima la salida de una fila antes de repintar la lista. */
    function fadeOut(row) {
        return new Promise((resolve) => {
            if (!row) { resolve(); return; }
            row.classList.add('is-leaving');
            setTimeout(resolve, 260);
        });
    }

    function setRowBusy(row, busy) {
        if (!row) return;
        row.classList.toggle('is-busy', busy);
        $$('button, a', row).forEach((node) => {
            if (busy) node.setAttribute('aria-disabled', 'true');
            else node.removeAttribute('aria-disabled');
        });
    }

    /**
     * Lleva al estado local el resultado de una moderación.
     * @returns {boolean} true si la publicación sigue encajando en el filtro.
     */
    function applyPostUpdate(id, post) {
        const index = state.posts.items.findIndex((item) => item.id === id);
        const stays = state.posts.status === 'all' || post.status === state.posts.status;

        if (index !== -1) {
            if (stays) state.posts.items[index] = post;
            else state.posts.items.splice(index, 1);
        }

        state.selection.delete(id);
        state.log.loaded = false; // el historial tiene una entrada nueva

        return stays;
    }

    async function approveOne(id) {
        if (state.bulkRunning) return;

        const row = findRow(id);
        setRowBusy(row, true);

        try {
            const { post } = await api.approvePost(id);
            const stays = applyPostUpdate(id, post);

            toast.success(`«${post.title}» fue aprobada y ya es visible en el feed.`);

            if (!stays) await fadeOut(row);
            renderPosts();
            await refreshStats();
        } catch (error) {
            toast.error(error.message);
            setRowBusy(row, false);
        }
    }

    function openRejectPost(id) {
        if (state.bulkRunning) return;

        const post = state.posts.items.find((item) => item.id === id);
        if (!post) return;

        openReasonDialog({
            title: 'Rechazar publicación',
            subject: post.title,
            note: 'Quien publicó recibirá este motivo tal cual. Sé claro y respetuoso.',
            confirmLabel: 'Rechazar publicación',
            submit: async (reason) => {
                const data = await api.rejectPost(id, reason);
                const row = findRow(id);
                const stays = applyPostUpdate(id, data.post);

                toast.warning(`«${data.post.title}» fue rechazada. Se avisó a quien la publicó.`);

                if (!stays) await fadeOut(row);
                renderPosts();
                await refreshStats();
            },
        });
    }

    /* ======================================================================
       Acciones en lote
       ====================================================================== */

    function toggleSelection(id, checked) {
        if (checked) state.selection.add(id);
        else state.selection.delete(id);

        const row = findRow(id);
        if (row) row.classList.toggle('is-selected', checked);

        syncBulkBar();
    }

    function syncBulkBar() {
        const count = state.selection.size;
        const total = state.posts.items.length;

        $('#admin-bulk').hidden = count === 0;
        $('#admin-bulk-count').textContent =
            `${format.number(count)} ${format.plural(count, 'seleccionada', 'seleccionadas')}`;

        const all = $('#admin-select-all');
        all.checked = total > 0 && count === total;
        all.indeterminate = count > 0 && count < total;
    }

    function setBulkDisabled(disabled) {
        $$('[data-bulk]').forEach((button) => { button.disabled = disabled; });
        $('#admin-select-all').disabled = disabled;
    }

    function startBulk(action) {
        if (state.bulkRunning || !state.selection.size) return;

        const ids = Array.from(state.selection);

        if (action === 'approve') {
            processBulk(ids, 'approve', null);
            return;
        }

        openReasonDialog({
            title: `Rechazar ${format.number(ids.length)} ${format.plural(ids.length, 'publicación', 'publicaciones')}`,
            subject: `Se aplicará el mismo motivo a ${format.number(ids.length)} `
                + `${format.plural(ids.length, 'publicación', 'publicaciones')}.`,
            note: 'Cada autor recibirá este texto. Asegúrate de que encaja con todas.',
            confirmLabel: 'Rechazar todas',
            submit: async (reason) => {
                // El lote corre con el diálogo ya cerrado: el progreso se ve en la barra.
                Promise.resolve().then(() => processBulk(ids, 'reject', reason));
            },
        });
    }

    async function processBulk(ids, action, reason) {
        state.bulkRunning = true;
        setBulkDisabled(true);

        const progress = $('#admin-bulk-progress');
        progress.hidden = false;

        let done = 0;
        let failed = 0;
        let skipped = 0;

        // En serie y no en paralelo: el progreso es honesto y el servidor respira.
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            progress.textContent = `Procesando ${i + 1} de ${ids.length}…`;

            const current = state.posts.items.find((item) => item.id === id);

            if (action === 'approve' && current && current.status === 'approved') {
                skipped += 1;
                continue;
            }

            try {
                /* eslint-disable no-await-in-loop */
                const data = action === 'approve'
                    ? await api.approvePost(id)
                    : await api.rejectPost(id, reason);
                /* eslint-enable no-await-in-loop */

                applyPostUpdate(id, data.post);
                done += 1;
            } catch (error) {
                failed += 1;
            }
        }

        progress.hidden = true;
        progress.textContent = '';

        state.bulkRunning = false;
        setBulkDisabled(false);
        state.selection.clear();

        renderPosts();
        await refreshStats();
        reportBulk(action, done, failed, skipped);
    }

    function reportBulk(action, done, failed, skipped) {
        if (done) {
            const word = format.plural(done, 'publicación', 'publicaciones');
            const verb = action === 'approve'
                ? format.plural(done, 'aprobada', 'aprobadas')
                : format.plural(done, 'rechazada', 'rechazadas');
            toast.success(`${format.number(done)} ${word} ${verb}.`);
        }

        if (skipped) {
            toast.info(`${format.number(skipped)} ${format.plural(skipped,
                'publicación ya estaba aprobada', 'publicaciones ya estaban aprobadas')}.`);
        }

        if (failed) {
            toast.error(`${format.number(failed)} ${format.plural(failed,
                'publicación no se pudo procesar', 'publicaciones no se pudieron procesar')}.`);
        }

        if (!done && !failed && !skipped) toast.info('No había nada que procesar.');
    }

    /* ======================================================================
       Solicitudes de vendedor
       ====================================================================== */

    async function loadSellers() {
        const list = $('#admin-seller-list');
        const ticket = ++sellersTicket;

        list.setAttribute('aria-busy', 'true');
        list.innerHTML = Array.from({ length: 3 },
            () => '<div class="skeleton admin-seller-skeleton" aria-hidden="true"></div>').join('');

        try {
            const data = await api.getAdminSellers(state.sellers.status);
            if (ticket !== sellersTicket) return;

            state.sellers.items = data.sellers || [];
            state.sellers.loaded = true;
            renderSellers();
        } catch (error) {
            if (ticket !== sellersTicket) return;

            state.sellers.items = [];
            list.innerHTML = UI.emptyState({
                icon: '⚠️',
                title: 'No se pudieron cargar las solicitudes',
                message: error.message,
            });
            toast.error(error.message);
        } finally {
            if (ticket === sellersTicket) list.setAttribute('aria-busy', 'false');
        }
    }

    function fact(term, value) {
        return `
            <div class="admin-fact">
                <dt class="admin-fact-term">${escapeHtml(term)}</dt>
                <dd class="admin-fact-value truncate">${escapeHtml(value)}</dd>
            </div>`;
    }

    function sellerBadge(status) {
        const badge = SELLER_BADGES[status];
        if (!badge) return '';
        return `<span class="badge ${badge[0]}">${escapeHtml(badge[1])}</span>`;
    }

    function sellerCard(seller) {
        const status = seller.seller_status;
        const applied = seller.applied_at || seller.created_at;
        const posts = Number(seller.post_count) || 0;
        const id = escapeAttr(seller.id);

        return `
        <article class="admin-seller" data-seller-id="${id}">
            <header class="admin-seller-head">
                <span class="avatar avatar-lg" aria-hidden="true">${escapeHtml(format.initials(seller.username))}</span>
                <div class="admin-seller-identity">
                    <h3 class="admin-seller-name truncate">${escapeHtml(seller.username)}</h3>
                    <p class="admin-seller-email truncate">${escapeHtml(seller.email || 'Sin correo registrado')}</p>
                </div>
                ${sellerBadge(status)}
            </header>

            <dl class="admin-seller-facts">
                ${fact('Distrito', seller.district || 'Sin distrito')}
                ${fact('Teléfono', seller.phone || 'No indicado')}
                ${fact('Solicitud', format.relative(applied))}
                ${fact('Publicaciones', `${format.number(posts)} ${format.plural(posts, 'publicación', 'publicaciones')}`)}
            </dl>

            ${seller.seller_motivation ? `
            <blockquote class="admin-seller-motivation">
                <p>${escapeHtml(seller.seller_motivation)}</p>
            </blockquote>` : ''}

            ${status === 'rejected' && seller.rejection_reason ? `
            <p class="admin-seller-reason">
                <strong>Motivo del rechazo:</strong> ${escapeHtml(seller.rejection_reason)}
            </p>` : ''}

            <footer class="admin-seller-actions">
                <a class="btn btn-ghost btn-sm" href="index.html?author_id=${id}"
                   target="_blank" rel="noopener">Ver sus publicaciones</a>
                ${status !== 'approved' ? `
                <button class="btn btn-success btn-sm" type="button"
                        data-approve-seller="${id}">Aprobar vendedor</button>` : ''}
                ${status !== 'rejected' ? `
                <button class="btn btn-danger btn-sm" type="button"
                        data-reject-seller="${id}">Rechazar</button>` : ''}
            </footer>
        </article>`;
    }

    function renderSellers() {
        const list = $('#admin-seller-list');
        const items = state.sellers.items;
        const total = items.length;
        const words = SELLER_STATUS_WORDS[state.sellers.status] || SELLER_STATUS_WORDS.all;

        $('#admin-sellers-status').textContent = total
            ? `${format.number(total)} ${format.plural(total, 'solicitud', 'solicitudes')} `
              + `${format.plural(total, words[0], words[1])}`
            : '';

        list.innerHTML = total
            ? items.map(sellerCard).join('')
            : UI.emptyState(EMPTY_SELLERS[state.sellers.status]);
    }

    function applySellerUpdate(id, user) {
        const index = state.sellers.items.findIndex((item) => item.id === id);
        const stays = state.sellers.status === 'all' || user.seller_status === state.sellers.status;

        if (index !== -1) {
            // El servidor no devuelve el recuento de publicaciones: lo conservamos.
            const merged = { ...state.sellers.items[index], ...user };
            if (stays) state.sellers.items[index] = merged;
            else state.sellers.items.splice(index, 1);
        }

        state.log.loaded = false;
        return stays;
    }

    function findSellerCard(id) {
        return $$('.admin-seller', $('#admin-seller-list'))
            .find((node) => node.dataset.sellerId === id) || null;
    }

    async function approveSeller(id) {
        const card = findSellerCard(id);

        try {
            const { user } = await api.approveSeller(id);
            const stays = applySellerUpdate(id, user);

            toast.success(`${user.username} ya puede publicar sus artículos en el foro.`);

            if (!stays && card) {
                card.classList.add('is-leaving');
                await new Promise((resolve) => setTimeout(resolve, 260));
            }

            renderSellers();
            await refreshStats();
        } catch (error) {
            toast.error(error.message);
        }
    }

    function openRejectSeller(id) {
        const seller = state.sellers.items.find((item) => item.id === id);
        if (!seller) return;

        openReasonDialog({
            title: 'Rechazar solicitud de vendedor',
            subject: seller.username,
            note: 'La persona recibirá este motivo y podrá volver a solicitarlo desde su perfil.',
            confirmLabel: 'Rechazar solicitud',
            submit: async (reason) => {
                const data = await api.rejectSeller(id, reason);
                const card = findSellerCard(id);
                const stays = applySellerUpdate(id, data.user);

                toast.warning(`Se rechazó la solicitud de ${data.user.username}.`);

                if (!stays && card) {
                    card.classList.add('is-leaving');
                    await new Promise((resolve) => setTimeout(resolve, 260));
                }

                renderSellers();
                await refreshStats();
            },
        });
    }

    /* ======================================================================
       Historial de moderación
       ====================================================================== */

    async function loadLog() {
        const list = $('#admin-log');

        list.setAttribute('aria-busy', 'true');
        list.innerHTML = Array.from({ length: 4 },
            () => '<div class="skeleton admin-log-skeleton" aria-hidden="true"></div>').join('');

        try {
            const data = await api.getModerationLog();
            state.log.items = data.log || [];
            state.log.loaded = true;
            renderLog();
        } catch (error) {
            state.log.items = [];
            list.innerHTML = UI.emptyState({
                icon: '⚠️',
                title: 'No se pudo cargar el historial',
                message: error.message,
            });
            toast.error(error.message);
        } finally {
            list.setAttribute('aria-busy', 'false');
        }
    }

    function logItem(entry) {
        const meta = LOG_META[entry.action]
            || { label: 'Acción de moderación', tone: 'neutral', icon: '•', badge: '' };
        const isPost = String(entry.action || '').endsWith('_post');

        return `
        <li class="admin-timeline-item is-${meta.tone}">
            <span class="admin-timeline-dot" aria-hidden="true">${meta.icon}</span>
            <div class="admin-timeline-body">
                <p class="admin-timeline-text">${escapeHtml(entry.description || meta.label)}</p>
                <p class="admin-timeline-meta">
                    <span class="badge ${meta.badge}">${escapeHtml(meta.label)}</span>
                    <span class="admin-timeline-author">${escapeHtml(entry.admin_name || 'Equipo')}</span>
                    <span aria-hidden="true">·</span>
                    <time datetime="${escapeAttr(entry.created_at)}">${escapeHtml(format.relative(entry.created_at))}</time>
                    ${isPost && entry.target_id ? `
                    <a class="admin-timeline-link" href="publicacion.html?id=${escapeAttr(entry.target_id)}"
                       target="_blank" rel="noopener">Ver publicación</a>` : ''}
                </p>
            </div>
        </li>`;
    }

    function renderLog() {
        const list = $('#admin-log');

        list.innerHTML = state.log.items.length
            ? `<ol class="admin-timeline">${state.log.items.map(logItem).join('')}</ol>`
            : UI.emptyState({
                icon: '🕑',
                title: 'Todavía no hay decisiones registradas',
                message: 'Cada vez que apruebes o rechaces algo, quedará anotado aquí.',
            });
    }

    /* ======================================================================
       Diálogo de motivo obligatorio
       ====================================================================== */

    function openReasonDialog({ title, subject, note, confirmLabel, submit }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'admin-reason';
        wrapper.innerHTML = `
            <p class="admin-reason-subject">${escapeHtml(subject)}</p>
            <p class="admin-reason-note">${escapeHtml(note)}</p>

            <div class="field">
                <label class="label" for="admin-reason-input">
                    Motivo del rechazo <span class="required" aria-hidden="true">*</span>
                </label>
                <textarea class="textarea" id="admin-reason-input" rows="4" maxlength="${MAX_REASON}"
                          placeholder="Explica en una o dos frases por qué no se aprueba."></textarea>
                <p class="field-error" id="admin-reason-error" role="alert" hidden></p>
                <p class="field-hint">
                    Mínimo ${MIN_REASON} caracteres ·
                    <span id="admin-reason-counter">0</span>/${MAX_REASON}
                </p>
            </div>

            <p class="admin-reason-presets-label">Motivos frecuentes</p>
            <div class="admin-reason-presets">
                ${REJECTION_PRESETS.map((preset) => `
                <button class="admin-preset" type="button" data-preset="${escapeAttr(preset)}">
                    ${escapeHtml(preset)}
                </button>`).join('')}
            </div>`;

        const input = wrapper.querySelector('#admin-reason-input');
        const errorNode = wrapper.querySelector('#admin-reason-error');
        const counter = wrapper.querySelector('#admin-reason-counter');

        const showError = (message) => {
            errorNode.textContent = message || '';
            errorNode.hidden = !message;
            input.classList.toggle('is-invalid', !!message);
        };

        const sync = () => {
            const length = input.value.trim().length;
            counter.textContent = String(length);
            if (!errorNode.hidden && length >= MIN_REASON) showError('');
        };

        input.addEventListener('input', sync);

        wrapper.querySelectorAll('[data-preset]').forEach((button) => {
            button.addEventListener('click', () => {
                input.value = button.dataset.preset;
                sync();
                input.focus();
            });
        });

        return modal.open({
            title,
            size: 'md',
            content: wrapper,
            actions: [
                { label: 'Cancelar', variant: 'ghost' },
                {
                    label: confirmLabel,
                    variant: 'danger',
                    action: async () => {
                        const reason = input.value.trim();

                        // Se valida antes de enviar: el servidor exige lo mismo.
                        if (reason.length < MIN_REASON) {
                            showError(`Escribe un motivo de al menos ${MIN_REASON} caracteres.`);
                            input.focus();
                            return false; // el diálogo sigue abierto
                        }

                        try {
                            await submit(reason);
                        } catch (error) {
                            showError(error.message);
                            toast.error(error.message);
                            return false;
                        }

                        return true;
                    },
                },
            ],
        });
    }

    /* ======================================================================
       Eventos
       ====================================================================== */

    function bindEvents() {
        bindTabs();
        bindPostControls();
        bindSellerControls();
        bindBulk();
        bindShortcuts();

        $('#admin-refresh').addEventListener('click', refreshAll);
    }

    async function refreshAll() {
        state.posts.loaded = false;
        state.sellers.loaded = false;
        state.log.loaded = false;

        await refreshStats();
        loadTab(state.tab);
        toast.info('Datos actualizados.');
    }

    function bindTabs() {
        const list = $('#admin-tabs');

        list.addEventListener('click', (event) => {
            const tab = event.target.closest('.admin-tab');
            if (tab) activateTab(tab.dataset.tab);
        });

        // Navegación con flechas, inicio y fin, como pide el patrón «tablist»
        list.addEventListener('keydown', (event) => {
            const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
            if (!keys.includes(event.key)) return;

            event.preventDefault();
            const index = TABS.indexOf(state.tab);
            let next = index;

            if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
            if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = TABS.length - 1;

            activateTab(TABS[next], { focus: true });
        });

        $$('[data-goto-tab]').forEach((button) => {
            button.addEventListener('click', () => activateTab(button.dataset.gotoTab));
        });

        global.addEventListener('hashchange', () => {
            const name = tabFromHash();
            if (name !== state.tab) activateTab(name, { syncHash: false });
        });
    }

    function bindPostControls() {
        $$('[data-post-status]').forEach((button) => {
            button.addEventListener('click', () => {
                if (state.bulkRunning) return;

                state.posts.status = button.dataset.postStatus;
                $$('[data-post-status]').forEach((other) => {
                    other.setAttribute('aria-pressed', String(other === button));
                });
                loadPosts();
            });
        });

        const search = $('#admin-search');
        const run = debounce(() => {
            state.posts.q = search.value.trim();
            loadPosts();
        }, 280);

        search.addEventListener('input', run);
        search.addEventListener('search', () => {
            run.cancel();
            state.posts.q = search.value.trim();
            loadPosts();
        });

        const list = $('#admin-post-list');

        list.addEventListener('click', (event) => {
            const approve = event.target.closest('[data-approve-post]');
            if (approve) {
                approveOne(approve.dataset.approvePost);
                return;
            }

            const reject = event.target.closest('[data-reject-post]');
            if (reject) openRejectPost(reject.dataset.rejectPost);
        });

        list.addEventListener('change', (event) => {
            const box = event.target.closest('[data-select]');
            if (box) toggleSelection(box.dataset.select, box.checked);
        });
    }

    function bindSellerControls() {
        $$('[data-seller-status]').forEach((button) => {
            button.addEventListener('click', () => {
                state.sellers.status = button.dataset.sellerStatus;
                $$('[data-seller-status]').forEach((other) => {
                    other.setAttribute('aria-pressed', String(other === button));
                });
                loadSellers();
            });
        });

        $('#admin-seller-list').addEventListener('click', (event) => {
            const approve = event.target.closest('[data-approve-seller]');
            if (approve) {
                approveSeller(approve.dataset.approveSeller);
                return;
            }

            const reject = event.target.closest('[data-reject-seller]');
            if (reject) openRejectSeller(reject.dataset.rejectSeller);
        });
    }

    function bindBulk() {
        $('#admin-select-all').addEventListener('change', (event) => {
            if (event.target.checked) {
                state.posts.items.forEach((post) => state.selection.add(post.id));
            } else {
                state.selection.clear();
            }
            renderPosts();
        });

        $$('[data-bulk]').forEach((button) => {
            button.addEventListener('click', () => {
                const action = button.dataset.bulk;
                if (action === 'clear') {
                    state.selection.clear();
                    renderPosts();
                    return;
                }
                startBulk(action);
            });
        });
    }

    function isTyping(node) {
        if (!node || !node.tagName) return false;
        const tag = node.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    }

    function bindShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (state.tab !== 'publicaciones' || state.bulkRunning) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTyping(event.target)) return;
            // Con un modal abierto los atajos estorbarían.
            if (document.querySelector('.modal-backdrop')) return;

            const key = String(event.key).toLowerCase();
            if (key !== 'a' && key !== 'r') return;

            const active = document.activeElement;
            const row = active && active.closest ? active.closest('.admin-queue-item') : null;
            if (!row) return;

            const post = state.posts.items.find((item) => item.id === row.dataset.id);
            if (!post) return;

            event.preventDefault();

            // Tras repintar, el foco vuelve a la fila que ocupa ahora esta posición.
            state.focusIndex = $$('.admin-queue-item', $('#admin-post-list')).indexOf(row);

            if (key === 'a' && post.status !== 'approved') approveOne(post.id);
            else if (key === 'r' && post.status !== 'rejected') openRejectPost(post.id);
            else state.focusIndex = null;
        });
    }

    /* ====================================================================== */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
