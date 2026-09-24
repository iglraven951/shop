/**
 * DiscoveryShop · Panel de administración
 *
 * Dos colas de trabajo —pedidos y solicitudes de vendedor— más la
 * bandeja de la IA, que cuenta lo que ha decidido por su cuenta. El acceso se
 * resuelve antes de pintar cualquier dato: sin sesión se invita a entrar, y
 * con sesión sin permisos se explica el porqué. Ninguna cifra ni botón de
 * moderación llega al DOM de quien no es admin.
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
    /* El tono del avatar lo decide el nombre: ver `UI.avatarTone`. */
    const toneAttr = (name) => ` data-tone="${UI.avatarTone(name)}"`;
    const toast = global.toast;
    const modal = global.modal;

    const TABS = ['pedidos', 'vendedores', 'denuncias', 'ia', 'historial'];

    /** Cómo se lee cada motivo de denuncia en pantalla. */
    const REPORT_CATEGORIES = {
        engano: 'El pedido engaña',
        prohibido: 'Busca algo prohibido',
        duplicado: 'Está repetido',
        ofensivo: 'Contenido ofensivo',
        menores: 'No es apto para menores',
        otro: 'Otro motivo',
    };

    /** Motivos que el equipo escribe una y otra vez: un clic rellena el campo. */
    const REJECTION_PRESETS = [
        'No se entiende qué está buscando',
        'La descripción es insuficiente',
        'El presupuesto no es realista para lo que pide',
        'Contenido no permitido en el foro',
        'Pedido duplicado',
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

    /* Las claves son las que escribe el servidor en `logModeration`, no las
       que se le parecen: con la migración pasaron a `_request` y aquí seguían
       diciendo `_post`, así que toda decisión sobre un pedido —a mano o de la
       IA— salía como un punto gris «Acción de moderación» y sin enlace. */
    const LOG_META = {
        approve_request: { label: 'Pedido aprobado', tone: 'approve', icon: '✓', badge: 'badge-success' },
        reject_request: { label: 'Pedido rechazado', tone: 'reject', icon: '✕', badge: 'badge-danger' },
        flag_request: { label: 'Pedido en duda', tone: 'neutral', icon: '⚑', badge: 'badge-warning' },
        approve_seller: { label: 'Vendedor aprobado', tone: 'approve', icon: '✓', badge: 'badge-success' },
        reject_seller: { label: 'Vendedor rechazado', tone: 'reject', icon: '✕', badge: 'badge-danger' },
        resolve_report: { label: 'Denuncia resuelta', tone: 'approve', icon: '⚖', badge: 'badge-info' },
        flag_adult: { label: 'Marcado +18', tone: 'neutral', icon: '🔞', badge: 'badge-warning' },
        unflag_adult: { label: 'Marca +18 retirada', tone: 'neutral', icon: '🔞', badge: '' },
    };

    const EMPTY_POSTS = {
        pending: {
            icon: '✅',
            title: 'No hay pedidos pendientes',
            message: 'Todo al día. Cuando alguien publique un pedido aparecerá aquí para su revisión.',
        },
        approved: {
            icon: '📭',
            title: 'Todavía no hay pedidos aprobadas',
            message: 'En cuanto apruebes la primera, se mostrará en esta lista.',
        },
        rejected: {
            icon: '🙌',
            title: 'No hay pedidos rechazadas',
            message: 'Ninguna pedido ha sido rechazada hasta ahora.',
        },
        all: {
            icon: '📭',
            title: 'Todavía no hay pedidos',
            message: 'El tablón está vacío. Los pedidos que publique la gente aparecerán aquí.',
        },
    };

    /**
     * Las tres salidas del revisor automático. La tercera no es un fallo: es
     * la IA reconociendo que no lo tiene claro, y por eso se presenta en ámbar
     * de «pendiente de ti», no en rojo de error.
     */
    const AI_DECISIONS = {
        approved: { label: 'Aprobada', badge: 'badge-success', icon: '✅' },
        rejected: { label: 'Rechazada', badge: 'badge-danger', icon: '🚫' },
        pending: { label: 'En duda', badge: 'badge-warning', icon: '🤔' },
    };

    const INBOX_FILTERS = ['all', 'approved', 'rejected', 'pending'];

    const EMPTY_INBOX = {
        all: {
            icon: '🤖',
            title: 'La IA aún no ha revisado ninguna pedido',
            message: 'En cuanto alguien publique un pedido, la decisión aparecerá aquí como un mensaje.',
        },
        approved: {
            icon: '✅',
            title: 'Todavía no ha aprobado nada',
            message: 'Cuando una pedido encaje claramente con el foro, la IA la aprobará y te lo contará aquí.',
        },
        rejected: {
            icon: '🙌',
            title: 'Todavía no ha rechazado nada',
            message: 'Ninguna pedido ha dado motivos para rechazarla de forma automática.',
        },
        pending: {
            icon: '👌',
            title: 'No hay nada en duda',
            message: 'La IA resolvió sola todo lo que le llegó. Cuando dude, te lo dejará aquí.',
        },
    };

    /** Texto del mensaje de prueba: sirve para comprobar que el número es el bueno. */
    const TEST_MESSAGE = [
        '🤖 IA de DiscoveryShop',
        '',
        'Mensaje de prueba.',
        'Si lees esto, los avisos de la revisión llegarán a este chat.',
    ].join('\n');

    const EMPTY_SELLERS = {
        pending: {
            icon: '✅',
            title: 'No hay solicitudes pendientes',
            message: 'Cuando alguien pida una cuenta de vendedor, su solicitud aparecerá aquí.',
        },
        approved: {
            icon: '🧑‍💼',
            title: 'Todavía no hay vendedores aprobados',
            message: 'Aprueba una solicitud y ese vendedor podrá responder pedidos con sus ofertas.',
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
        tab: 'pedidos',
        stats: null,
        posts: { status: 'pending', q: '', items: [], loaded: false },
        sellers: { status: 'pending', items: [], loaded: false },
        reports: { status: 'open', items: [], open: 0, total: 0, loaded: false },
        log: { items: [], loaded: false },
        inbox: {
            decision: 'all',
            items: [],
            unread: 0,
            summary: { approved: 0, rejected: 0, pending: 0 },
            loaded: false,
            // Avisos ya anunciados con un toast en esta visita: sin esto,
            // pulsar «Actualizar» volvería a cantar lo mismo.
            announced: new Set(),
        },
        // Pedidos que siguen esperando a una persona. Se usa dos veces:
        // para la métrica de dudas y para saber si un aviso todavía se puede
        // resolver desde su propia burbuja.
        doubt: { ids: new Set(), count: 0 },
        settings: { whatsapp: '', auto_notify: true },
        selection: new Set(),
        bulkRunning: false,
        // Índice de fila a la que devolver el foco tras repintar (atajos de teclado).
        focusIndex: null,
    };

    // Descarta respuestas que llegan tarde: teclear rápido en el buscador
    // no puede dejar en pantalla el resultado de una consulta anterior.
    let postsTicket = 0;
    let sellersTicket = 0;
    let inboxTicket = 0;

    // Vigila qué burbujas sin leer entran en pantalla para darlas por leídas.
    let inboxObserver = null;

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

        // Los ajustes van primero: de ellos depende si un aviso nuevo puede
        // abrir WhatsApp y si hay que anunciarlo con un toast.
        await loadSettings();
        await refreshStats();

        // La bandeja se carga aunque la pestaña activa sea otra: su insignia y
        // el aviso de lo que la IA decidió no pueden esperar a que se abra.
        await loadInbox();

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

            await refreshDoubtQueue();
            renderMetrics(stats);

            // Mantiene al día la insignia de la cabecera inyectada por shell.js.
            store.set({ pendingModeration: stats.requests.pending + stats.sellers.pending });
        } catch (error) {
            toast.error(error.message);
        }
    }

    /**
     * Relee la cola pendiente para saber cuántas pedidos dejó la IA en
     * duda y cuáles siguen sin resolver.
     *
     * Las estadísticas generales cuentan todo lo pendiente sin distinguir quién
     * lo dejó así, y la diferencia importa: una duda de la IA viene con un
     * motivo escrito y se resuelve desde su propia burbuja.
     */
    async function refreshDoubtQueue() {
        try {
            const data = await api.getAdminRequests('pending', '');
            const items = data.requests || [];

            state.doubt.ids = new Set(items.map((post) => post.id));
            state.doubt.count = items.filter(
                (post) => post.review && post.review.decision === 'pending'
            ).length;
        } catch (error) {
            // Sin este dato el panel sigue siendo utilizable: se deja a cero.
            state.doubt.ids = new Set();
            state.doubt.count = 0;
        }
    }

    function setMetric(name, value) {
        $$(`[data-metric="${name}"]`).forEach((node) => { node.textContent = value; });
    }

    function setCount(name, value) {
        $$(`[data-count="${name}"]`).forEach((node) => { node.textContent = format.number(value); });
    }

    /* ======================================================================
       Dos gráficos, sin una sola dependencia

       Un panel que solo enseña números obliga a comparar de memoria. Estos se
       dibujan con lo que ya trae el navegador: un `conic-gradient` para la
       proporción y una polilínea SVG para la serie. Cero kilobytes de
       librería, y ambos heredan el color del tema.
       ====================================================================== */

    /** El anillo de «cuánto de lo que se pide encuentra respuesta». */
    function paintRate(percent) {
        const slot = $('#admin-rate-ring');
        if (!slot) return;

        slot.style.setProperty('--pct', String(percent));
        slot.setAttribute('aria-label', `${percent} % de los pedidos encuentra respuesta`);
        const value = slot.querySelector('.admin-ring-value');
        if (value) value.textContent = `${percent}%`;
    }

    /**
     * La actividad de los últimos catorce días.
     *
     * Sale del propio historial de moderación, que ya viaja con la fecha de
     * cada decisión: no hace falta pedir nada nuevo al servidor.
     */
    function paintActivity() {
        const slot = $('#admin-activity-chart');
        if (!slot) return;

        const DAYS = 14;
        const counts = new Array(DAYS).fill(0);
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        (state.log.items || []).forEach((entry) => {
            const when = new Date(entry.created_at);
            const ago = Math.floor((today - when) / 86400000);
            if (ago >= 0 && ago < DAYS) counts[DAYS - 1 - ago] += 1;
        });

        const peak = Math.max(1, ...counts);
        const W = 140;
        const H = 32;
        const step = W / (DAYS - 1);

        const points = counts
            .map((n, i) => `${(i * step).toFixed(1)},${(H - (n / peak) * (H - 4) - 2).toFixed(1)}`)
            .join(' ');

        const total = counts.reduce((sum, n) => sum + n, 0);

        slot.innerHTML = `
            <svg class="admin-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
                 role="img" aria-label="${total} decisiones en los últimos ${DAYS} días">
                <polyline points="${points}" fill="none" stroke="currentColor"
                          stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="admin-spark-caption">${format.number(total)} decisiones · ${DAYS} días</span>`;
    }

    function renderMetrics(stats) {
        const activity = stats.activity.comments + stats.activity.me_too + stats.activity.views;
        const sellersTotal = stats.sellers.approved + stats.sellers.pending + stats.sellers.rejected;

        setMetric('posts-pending', format.number(stats.requests.pending));
        setMetric('sellers-pending', format.number(stats.sellers.pending));
        setMetric('posts-doubt', format.number(state.doubt.count));
        /* El ciclo de vida, no el estado de moderación: «aprobado» incluye
           lo que ya se resolvió, y esa cifra solo sabe subir. */
        const life = stats.lifecycle || { open: 0, matched: 0, fulfilled: 0, cancelled: 0 };
        const closed = life.fulfilled + life.matched;
        const live = life.open + closed;

        setMetric('posts-open', format.number(life.open));
        setMetric('posts-fulfilled', format.number(life.fulfilled));
        setMetric(
            'fulfilled-detail',
            live > 0
                ? `${Math.round((closed / live) * 100)} % de lo pedido encuentra respuesta`
                : 'Todavía no hay pedidos que medir'
        );

        // Ese porcentaje, además, como anillo: una cifra se lee, una forma se ve
        paintRate(live > 0 ? Math.round((closed / live) * 100) : 0);
        setMetric('posts-rejected', format.number(stats.requests.rejected));
        setMetric('users-total', format.number(stats.users.total));
        setMetric('activity-total', format.number(activity));
        setMetric(
            'activity-detail',
            `${format.number(stats.activity.comments)} comentarios · `
            + `${format.number(stats.activity.me_too)} «también lo busco» · `
            + `${format.number(stats.activity.views)} visitas`
        );

        paintActivity();

        // Solo se tiñen de aviso si de verdad hay trabajo esperando.
        const postsCard = $('[data-metric-card="posts-pending"]');
        if (postsCard) postsCard.classList.toggle('is-warning', stats.requests.pending > 0);

        const sellersCard = $('[data-metric-card="sellers-pending"]');
        if (sellersCard) sellersCard.classList.toggle('is-brand', stats.sellers.pending > 0);

        const doubtCard = $('[data-metric-card="posts-doubt"]');
        if (doubtCard) doubtCard.classList.toggle('is-accent', state.doubt.count > 0);

        setCount('posts-pending', stats.requests.pending);
        setCount('posts-approved', stats.requests.approved);
        setCount('posts-rejected', stats.requests.rejected);
        setCount('posts-total', stats.requests.total);
        setCount('sellers-pending', stats.sellers.pending);
        setCount('sellers-approved', stats.sellers.approved);
        setCount('sellers-rejected', stats.sellers.rejected);
        setCount('sellers-total', sellersTotal);

        // Las denuncias abiertas viajan en las estadísticas, así que la
        // pestaña se entera aunque nunca se haya abierto.
        const reports = stats.reports || { open: 0, total: 0 };
        setCount('reports-open', reports.open);
        setCount('reports-total', reports.total);

        setTabCount('pedidos', stats.requests.pending);
        setTabCount('vendedores', stats.sellers.pending);
        setTabCount('denuncias', reports.open);
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

            /* Si una pestaña no está en el HTML, se salta. Esto no es un
               remilgo: cuando el vocabulario pasó de «publicaciones» a
               «pedidos» el JS se renombró y el HTML no, y al leer `.classList`
               de `null` en la PRIMERA vuelta el `forEach` moría entero. Las
               otras cuatro pestañas dejaron de poder abrirse y la cola de
               pedidos se quedó cargando para siempre. Un panel al que le falta
               una sección debe perder esa sección, no todas. */
            if (!button || !panel) return;

            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
            panel.hidden = !active;
        });

        if (focus) {
            const head = $(`#tab-${tab}`);
            if (head) head.focus();
        }

        // El hash deja rastro en el historial: atrás vuelve a la pestaña previa.
        if (syncHash && global.location.hash.replace('#', '') !== tab) {
            global.location.hash = tab;
        }

        loadTab(tab);
    }

    function loadTab(tab) {
        if (tab === 'pedidos' && !state.posts.loaded) loadPosts();
        if (tab === 'vendedores' && !state.sellers.loaded) loadSellers();
        if (tab === 'denuncias' && !state.reports.loaded) loadReports();
        if (tab === 'ia' && !state.inbox.loaded) loadInbox();
        if (tab === 'historial' && !state.log.loaded) loadLog();
    }

    /* ======================================================================
       Denuncias de la comunidad

       La IA revisa todo lo que entra. Esto es para lo que se le cuela: lo
       señala quien lo ve, y aterriza en la misma mesa donde ya se modera.
       ====================================================================== */

    async function loadReports() {
        const list = $('#admin-report-list');
        if (!list) return;

        list.setAttribute('aria-busy', 'true');
        list.innerHTML = listSkeleton(3);

        try {
            const data = await api.getAdminReports(state.reports.status);

            state.reports.items = data.reports || [];
            state.reports.open = data.open || 0;
            state.reports.total = data.total || 0;
            state.reports.loaded = true;

            renderReports();
        } catch (error) {
            list.innerHTML = UI.emptyState({
                icon: '⚠️',
                title: 'No se pudieron cargar las denuncias',
                message: error.message || 'Vuelve a intentarlo en un momento.',
            });
        } finally {
            list.setAttribute('aria-busy', 'false');
        }
    }

    function renderReports() {
        const list = $('#admin-report-list');
        const status = $('#admin-reports-status');
        if (!list) return;

        setTabCount('denuncias', state.reports.open);
        setCount('reports-open', state.reports.open);

        if (status) {
            status.textContent = state.reports.items.length
                ? `${format.number(state.reports.items.length)} ${state.reports.items.length === 1 ? 'denuncia' : 'denuncias'}`
                : '';
        }

        if (!state.reports.items.length) {
            list.innerHTML = UI.emptyState({
                icon: '🕊️',
                title: state.reports.status === 'open'
                    ? 'No hay denuncias abiertas'
                    : 'Nada que mostrar aquí',
                message: state.reports.status === 'open'
                    ? 'Cuando alguien señale una pedido, aparecerá en esta lista.'
                    : 'Prueba con otro filtro.',
            });
            return;
        }

        list.innerHTML = state.reports.items.map((report) => `
            <article class="admin-report${report.status === 'open' ? ' is-open' : ''}"
                     data-report-id="${escapeAttr(report.id)}">
                <div class="admin-report-head">
                    <a class="admin-report-title" href="publicacion.html?id=${escapeAttr(report.request_id)}">
                        ${escapeHtml(report.request_title)}
                    </a>
                    <span class="badge ${report.status === 'open' ? 'badge-warning' : 'badge-success'}">
                        ${report.status === 'open' ? 'Abierta' : 'Resuelta'}
                    </span>
                </div>

                <p class="admin-report-meta">
                    ${escapeHtml(REPORT_CATEGORIES[report.category] || REPORT_CATEGORIES.otro)}
                    <span aria-hidden="true">·</span>
                    la envió ${escapeHtml(report.reporter)}
                    <span aria-hidden="true">·</span>
                    publica ${escapeHtml(report.author)}
                    <span aria-hidden="true">·</span>
                    ${escapeHtml(format.relative(report.created_at))}
                </p>

                <blockquote class="admin-report-reason">${escapeHtml(report.reason)}</blockquote>

                ${report.status === 'open' ? `
                <div class="admin-report-actions">
                    <button class="btn btn-secondary btn-sm" type="button"
                            data-resolve="${escapeAttr(report.id)}" data-resolution="Revisada, la pedido se mantiene">
                        Se mantiene
                    </button>
                    <button class="btn btn-danger btn-sm" type="button"
                            data-resolve="${escapeAttr(report.id)}" data-resolution="Revisada, se actuó sobre la pedido">
                        Actuamos sobre ella
                    </button>
                </div>` : `
                <p class="admin-report-resolution">
                    ${escapeHtml(report.resolution || '')}
                    <span aria-hidden="true">·</span>
                    ${escapeHtml(format.relative(report.resolved_at))}
                </p>`}
            </article>`).join('');
    }

    function bindReportControls() {
        $$('[data-report-status]').forEach((button) => {
            button.addEventListener('click', () => {
                state.reports.status = button.dataset.reportStatus;
                $$('[data-report-status]').forEach((other) => {
                    other.setAttribute('aria-pressed', String(other === button));
                });
                loadReports();
            });
        });

        const list = $('#admin-report-list');
        if (!list) return;

        list.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-resolve]');
            if (!button) return;

            button.classList.add('is-loading');

            try {
                await api.resolveReport(button.dataset.resolve, button.dataset.resolution);
                toast.success('Denuncia resuelta. Avisamos a quien la envió.');
                await loadReports();
                await refreshStats();
            } catch (error) {
                button.classList.remove('is-loading');
                toast.error(error.message || 'No se pudo resolver la denuncia');
            }
        });
    }

    /* ======================================================================
       Cola de pedidos
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
            const data = await api.getAdminRequests(state.posts.status, state.posts.q);
            if (ticket !== postsTicket) return;

            state.posts.items = data.requests || [];
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

        /* La edad es otro eje: un pedido puede estar aprobado y ser +18, o
           estar rechazado por algo que no tiene que ver con la edad. */
        parts.push(post.adult
            ? `<button class="btn btn-ghost btn-sm" type="button"
                       data-adult-post="${id}" data-adult-to="0"
                       title="Quitar la marca de mayoría de edad">Quitar +18</button>`
            : `<button class="btn btn-ghost btn-sm" type="button"
                       data-adult-post="${id}" data-adult-to="1"
                       title="Avisar de que hay que ser mayor de edad para responder">Marcar +18</button>`);

        return parts.join('');
    }

    /** Porcentaje legible a partir de la confianza (0-1) que devuelve la IA. */
    function confidencePercent(value) {
        return Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
    }

    /**
     * Etiqueta discreta con lo que opinó la IA de una pedido.
     *
     * El motivo va en `title` para quien usa ratón y repetido en texto oculto
     * para quien no lo tiene: un `title` no lo anuncia ningún lector de
     * pantalla por sí solo.
     */
    function reviewTag(post) {
        const review = post.review;
        const meta = review && AI_DECISIONS[review.decision];
        if (!meta) return '';

        const score = confidencePercent(review.confidence);
        const reason = review.reason || '';

        return `
        <p class="admin-ai-verdict is-${escapeAttr(review.decision)}"
           title="${escapeAttr(`La IA la marcó como «${meta.label.toLowerCase()}» con ${score} % de confianza. ${reason}`)}">
            <span class="admin-ai-verdict-mark" aria-hidden="true"></span>
            <span class="admin-ai-verdict-label">La IA: ${escapeHtml(meta.label.toLowerCase())}</span>
            <span class="admin-ai-verdict-score">${score} % de confianza</span>
            <span class="sr-only">Motivo: ${escapeHtml(reason)}</span>
        </p>
        ${signalTags(review.signals)}`;
    }

    /**
     * En qué se fijó la IA, dicho en una línea.
     *
     * El veredicto ya dice qué decidió y con cuánta confianza; esto dice
     * dónde miró. Para quien modera es la diferencia entre confiar en un
     * número y poder comprobarlo: «teléfono en el texto» se verifica de un
     * vistazo, «55 % de confianza» no se verifica de ninguna manera.
     */
    const SIGNAL_TAGS = [
        ['contact', '📞', 'Teléfono o red social'],
        ['link', '🔗', 'Enlace externo'],
        ['address', '📍', 'Dirección exacta'],
        ['shouting', '🔊', 'Todo en mayúsculas'],
    ];

    function signalTags(signals) {
        if (!signals) return '';

        const form = signals.form || {};
        const tags = SIGNAL_TAGS
            .filter(([key]) => form[key])
            .map(([, icon, label]) => ({ icon, label }));

        if (form.repetition) {
            tags.push({ icon: '🔁', label: `Repite «${form.repetition}»` });
        }

        if (signals.adult) {
            tags.push({ icon: '🔞', label: 'Requiere mayoría de edad' });
        }

        if (!tags.length) return '';

        return `
        <p class="admin-ai-signals">
            <span class="sr-only">La IA se fijó en:</span>
            ${tags.map((tag) => `
            <span class="admin-ai-signal">
                <span aria-hidden="true">${tag.icon}</span>
                ${escapeHtml(tag.label)}
            </span>`).join('')}
        </p>`;
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
                ${reviewTag(post)}
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
            ? `${format.number(total)} ${format.plural(total, 'pedido', 'pedidos')} `
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
     * @returns {boolean} true si la pedido sigue encajando en el filtro.
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


    /**
     * Marca o desmarca la mayoría de edad.
     *
     * Ni aprueba ni rechaza: es el otro eje (ADR-027). Un pedido puede estar
     * aprobado y ser +18, y quitar la marca no lo publica ni lo retira. Por eso
     * no reutiliza `approveOne` ni su mensaje.
     */
    async function setAdult(id, adult, button) {
        if (state.bulkRunning) return;

        const row = findRow(id);
        setRowBusy(row, true);
        if (button) button.classList.add('is-loading');

        try {
            const { request } = await api.setRequestAdult(id, adult);
            applyPostUpdate(id, request);

            toast.success(adult
                ? `«${request.title}» queda marcado +18. Sigue publicado: solo avisa a quien responda.`
                : `«${request.title}» ya no está marcado +18.`);

            await refreshStats();
        } catch (error) {
            toast.error(error.message || 'No se pudo cambiar la marca de edad');
        } finally {
            setRowBusy(row, false);
            if (button) button.classList.remove('is-loading');
        }
    }
    async function approveOne(id) {
        if (state.bulkRunning) return;

        const row = findRow(id);
        setRowBusy(row, true);

        try {
            /* La respuesta trae `request`. Cuando esto decía `post` la petición
               salía bien, el servidor aprobaba, y aquí reventaba al leer el
               título: salía «algo salió mal», la fila se quedaba, y al segundo
               intento el servidor contestaba que ya estaba aprobada. */
            const { request } = await api.approveRequest(id);
            const stays = applyPostUpdate(id, request);

            toast.success(`«${request.title}» ya es visible en el tablón.`);

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
            title: 'Rechazar pedido',
            subject: post.title,
            note: 'Quien publicó recibirá este motivo tal cual. Sé claro y respetuoso.',
            confirmLabel: 'Rechazar pedido',
            submit: async (reason) => {
                const data = await api.rejectRequest(id, reason);
                const row = findRow(id);
                const stays = applyPostUpdate(id, data.request);

                toast.warning(`«${data.request.title}» fue rechazado. Se avisó a quien la publicó.`);

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

        /* En el teléfono esa barra se ancla al pie de la pantalla, y al salirse
           del flujo taparía la última fila de la cola justo cuando hace falta
           verla. La clase reserva su hueco solo mientras hay algo seleccionado;
           sin selección, la lista recupera su final. */
        const panel = $('#panel-pedidos');
        if (panel) panel.classList.toggle('has-bulk', count > 0);

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
            title: `Rechazar ${format.number(ids.length)} ${format.plural(ids.length, 'pedido', 'pedidos')}`,
            subject: `Se aplicará el mismo motivo a ${format.number(ids.length)} `
                + `${format.plural(ids.length, 'pedido', 'pedidos')}.`,
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
                    ? await api.approveRequest(id)
                    : await api.rejectRequest(id, reason);
                /* eslint-enable no-await-in-loop */

                applyPostUpdate(id, data.request);
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
            const word = format.plural(done, 'pedido', 'pedidos');
            const verb = action === 'approve'
                ? format.plural(done, 'aprobada', 'aprobadas')
                : format.plural(done, 'rechazada', 'rechazadas');
            toast.success(`${format.number(done)} ${word} ${verb}.`);
        }

        if (skipped) {
            toast.info(`${format.number(skipped)} ${format.plural(skipped,
                'pedido ya estaba aprobada', 'pedidos ya estaban aprobadas')}.`);
        }

        if (failed) {
            toast.error(`${format.number(failed)} ${format.plural(failed,
                'pedido no se pudo procesar', 'pedidos no se pudieron procesar')}.`);
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
        const answered = Number(seller.offer_count) || 0;
        const id = escapeAttr(seller.id);

        return `
        <article class="admin-seller" data-seller-id="${id}">
            <header class="admin-seller-head">
                <span class="avatar avatar-lg" aria-hidden="true"${toneAttr(seller.username)}>${escapeHtml(format.initials(seller.username))}</span>
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
                ${fact('Ha respondido', `${format.number(answered)} ${format.plural(answered, 'pedido', 'pedidos')}`)}
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
                   target="_blank" rel="noopener">Ver sus pedidos</a>
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
            // El servidor no devuelve el recuento de pedidos: lo conservamos.
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

            toast.success(`${user.username} ya puede responder pedidos con sus ofertas.`);

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
        /* Solo las acciones sobre un pedido apuntan a una publicación. Las de
           vendedor guardan el id de la cuenta, y enlazarlas como pedido llevaba
           a un 404. */
        const isPost = String(entry.action || '').endsWith('_request');

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
                       target="_blank" rel="noopener">Ver pedido</a>` : ''}
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
       Ajustes de aviso

       El número de WhatsApp es un dato personal y el repositorio es público,
       así que no está escrito en ninguna parte del código: lo introduce el
       administrador una vez y queda guardado en su propio navegador.
       ====================================================================== */

    async function loadSettings() {
        try {
            const data = await api.getSettings();
            state.settings = { whatsapp: '', auto_notify: true, ...(data.settings || {}) };
        } catch (error) {
            // Sin ajustes se trabaja igual: solo no habrá enlaces a WhatsApp.
            state.settings = { whatsapp: '', auto_notify: false };
        }

        applySettings();
    }

    function applySettings() {
        const input = $('#admin-whatsapp');
        const notify = $('#admin-auto-notify');

        if (input) input.value = state.settings.whatsapp || '';
        if (notify) notify.checked = !!state.settings.auto_notify;
    }

    function showWhatsappError(message) {
        const node = $('#admin-whatsapp-error');
        const input = $('#admin-whatsapp');

        node.textContent = message || '';
        node.hidden = !message;
        input.classList.toggle('is-invalid', !!message);
    }

    async function saveWhatsapp() {
        const input = $('#admin-whatsapp');
        // Se guarda solo el número: espacios, guiones y paréntesis sobran y el
        // enlace de WhatsApp no los admite.
        const digits = input.value.replace(/\D/g, '');

        if (digits && digits.length < 9) {
            showWhatsappError('Un móvil peruano tiene nueve dígitos. Revísalo y vuelve a guardarlo.');
            input.focus();
            return;
        }

        try {
            const data = await api.updateSettings({ whatsapp: digits });
            state.settings = { ...state.settings, ...(data.settings || {}) };

            input.value = state.settings.whatsapp || '';
            showWhatsappError('');

            // Las burbujas cambian: con número guardado ya pueden abrir WhatsApp.
            if (state.inbox.loaded) renderInbox();

            toast.success(digits
                ? 'Número guardado. Los avisos se abrirán en tu WhatsApp.'
                : 'Número borrado. Los avisos se quedarán solo en este panel.');
        } catch (error) {
            showWhatsappError(error.message);
        }
    }

    async function toggleAutoNotify(enabled) {
        try {
            const data = await api.updateSettings({ auto_notify: enabled });
            state.settings = { ...state.settings, ...(data.settings || {}) };
        } catch (error) {
            // Se devuelve el interruptor a su sitio: mentir sobre el estado
            // guardado es peor que no poder cambiarlo.
            $('#admin-auto-notify').checked = !enabled;
            toast.error(error.message);
        }
    }

    /**
     * Abre WhatsApp con el mensaje ya redactado.
     *
     * En el navegador es una pestaña nueva. Dentro de la app Android una
     * pestaña nueva no existe, y `window.open` dejaría al administrador
     * atrapado en una página web dentro de su propia app: `DSApp.openExternal`
     * entrega el enlace al sistema para que lo atienda WhatsApp de verdad.
     * En la web esa misma llamada acaba en `window.open`, así que sirve para
     * los dos entornos.
     */
    function openWhatsapp(link) {
        if (global.DSApp && typeof global.DSApp.openExternal === 'function') {
            global.DSApp.openExternal(link);
            return;
        }

        global.open(link, '_blank', 'noopener');
    }

    /** Lleva la atención al campo cuando todavía no hay número que usar. */
    function requireWhatsapp() {
        activateTab('ia');
        showWhatsappError('Escribe aquí tu número para que podamos abrirte el aviso en WhatsApp.');

        const reduce = global.matchMedia
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const input = $('#admin-whatsapp');
        input.focus();
        input.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }

    function sendTestMessage() {
        const link = api.whatsappLink(state.settings.whatsapp, TEST_MESSAGE);

        if (!link) {
            requireWhatsapp();
            return;
        }

        openWhatsapp(link);
        toast.info('Abrimos WhatsApp con el mensaje de prueba.');
    }

    /* ======================================================================
       Bandeja de la IA

       Se pinta como una conversación y no como una tabla porque eso es lo que
       es: la IA cuenta lo que ha hecho, en el mismo orden en que lo hizo. Lo
       más reciente va arriba, que es como se lee una bandeja de avisos.
       ====================================================================== */

    async function loadInbox() {
        const thread = $('#admin-inbox-thread');
        const ticket = ++inboxTicket;

        thread.setAttribute('aria-busy', 'true');
        thread.innerHTML = Array.from({ length: 3 },
            () => '<div class="skeleton admin-ai-skeleton" aria-hidden="true"></div>').join('');

        try {
            const data = await api.getAdminInbox(state.inbox.decision);
            if (ticket !== inboxTicket) return;

            state.inbox.items = data.inbox || [];
            state.inbox.unread = data.unread || 0;
            state.inbox.summary = data.summary || { approved: 0, rejected: 0, pending: 0 };
            state.inbox.loaded = true;

            renderInbox();
            announceNew();
        } catch (error) {
            if (ticket !== inboxTicket) return;

            state.inbox.items = [];
            thread.innerHTML = UI.emptyState({
                icon: '⚠️',
                title: 'No se pudo cargar la bandeja',
                message: error.message,
            });
            toast.error(error.message);
        } finally {
            if (ticket === inboxTicket) thread.setAttribute('aria-busy', 'false');
        }
    }

    /**
     * Anuncia con un toast lo que la IA decidió sin que nadie lo viera.
     *
     * Un sitio sin servidor no recibe avisos por su cuenta: la bandeja solo
     * cambia cuando el navegador vuelve a leerla. Por eso lo que se anuncia es
     * lo que está sin leer al abrir el panel, y cada aviso se canta una vez.
     */
    function announceNew() {
        const fresh = state.inbox.items.filter(
            (item) => !item.read && !state.inbox.announced.has(item.id)
        );

        state.inbox.items.forEach((item) => state.inbox.announced.add(item.id));

        if (!state.settings.auto_notify || !fresh.length) return;

        const newest = fresh[0];
        const doubts = fresh.filter((item) => item.decision === 'pending').length;

        const message = fresh.length === 1
            ? `La IA revisó «${newest.request_title}».`
            : `La IA revisó ${format.number(fresh.length)} pedidos mientras no estabas`
              + `${doubts ? `, ${format.number(doubts)} de ellas en duda` : ''}.`;

        toast.info(message, { title: 'Aviso de la IA', duration: 9000 });
        attachWhatsappAction(newest);
    }

    /**
     * Añade el enlace a WhatsApp al último toast pintado.
     *
     * El componente de avisos del núcleo no admite acciones y no es de este
     * panel para cambiarlo: se le cuelga el enlace al vuelo, que es menos
     * invasivo que duplicar todo el componente solo para esto.
     */
    function attachWhatsappAction(item) {
        const link = api.whatsappLink(state.settings.whatsapp, item.message);
        if (!link) return;

        const content = document.querySelector('.toast-stack .toast:last-child .toast-content');
        if (!content) return;

        const anchor = document.createElement('a');
        anchor.className = 'admin-ai-toast-link';
        anchor.href = link;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.textContent = 'Enviar a mi WhatsApp';
        anchor.addEventListener('click', () => { markSent(item.id); });

        content.appendChild(anchor);
    }

    function inboxBubble(item) {
        const meta = AI_DECISIONS[item.decision] || AI_DECISIONS.pending;
        const id = escapeAttr(item.id);
        const score = confidencePercent(item.confidence);

        // Solo se ofrece resolver lo que de verdad sigue esperando: si ya se
        // decidió desde la cola, los botones aquí solo darían un error.
        const unresolved = item.decision === 'pending' && state.doubt.ids.has(item.request_id);

        return `
        <article class="admin-ai-msg is-${escapeAttr(item.decision)}${item.read ? '' : ' is-unread'}"
                 data-inbox-id="${id}">
            <span class="admin-ai-avatar" aria-hidden="true"></span>

            <div class="admin-ai-bubble">
                <header class="admin-ai-head">
                    <span class="admin-ai-author">IA de DiscoveryShop</span>
                    <span class="badge ${meta.badge}">${escapeHtml(`${meta.icon} ${meta.label}`)}</span>
                    <span class="admin-ai-score">${score} % de confianza</span>
                    ${item.read ? '' : '<span class="admin-ai-new">Nuevo</span>'}
                    <time class="admin-ai-time" datetime="${escapeAttr(item.created_at)}">
                        ${escapeHtml(format.relative(item.created_at))}
                    </time>
                </header>

                <!-- Tal cual, con sus saltos de línea: esto es exactamente lo
                     que se enviará por WhatsApp, así que se ve antes de enviarlo -->
                <p class="admin-ai-text">${escapeHtml(item.message)}</p>

                <footer class="admin-ai-actions">
                    <button class="btn btn-primary btn-sm" type="button" data-inbox-send="${id}">
                        <span aria-hidden="true">📲</span>
                        <span>Enviar a mi WhatsApp</span>
                    </button>
                    <a class="btn btn-ghost btn-sm" href="publicacion.html?id=${escapeAttr(item.request_id)}"
                       target="_blank" rel="noopener">Ver pedido</a>
                    ${unresolved ? `
                    <button class="btn btn-success btn-sm" type="button" data-inbox-approve="${id}">
                        Aprobar
                    </button>
                    <button class="btn btn-danger btn-sm" type="button" data-inbox-reject="${id}">
                        Rechazar
                    </button>` : ''}
                    ${item.sent_whatsapp ? `
                    <span class="admin-ai-sent" title="Ya lo enviaste a tu WhatsApp">
                        <span aria-hidden="true">✓</span> Enviado
                    </span>` : ''}
                </footer>
            </div>
        </article>`;
    }

    function renderInbox() {
        const thread = $('#admin-inbox-thread');
        const items = state.inbox.items;

        renderInboxSummary();
        updateInboxStatusLine();
        setTabCount('ia', state.inbox.unread);

        if (!items.length) {
            thread.innerHTML = UI.emptyState(EMPTY_INBOX[state.inbox.decision] || EMPTY_INBOX.all);
            return;
        }

        thread.innerHTML = items.map(inboxBubble).join('');
        watchUnread();
    }

    function renderInboxSummary() {
        const summary = state.inbox.summary || { approved: 0, rejected: 0, pending: 0 };
        const total = summary.approved + summary.rejected + summary.pending;

        Object.keys(AI_DECISIONS).forEach((decision) => {
            const node = $(`[data-ai-stat="${decision}"]`);
            if (node) node.textContent = format.number(summary[decision] || 0);
        });

        setCount('inbox-all', total);
        setCount('inbox-approved', summary.approved || 0);
        setCount('inbox-rejected', summary.rejected || 0);
        setCount('inbox-pending', summary.pending || 0);
    }

    function updateInboxStatusLine() {
        const total = state.inbox.items.length;
        const unread = state.inbox.unread;
        const node = $('#admin-inbox-status');

        if (!total) {
            node.textContent = '';
            return;
        }

        node.textContent = `${format.number(total)} ${format.plural(total, 'aviso', 'avisos')}`
            + (unread ? ` · ${format.number(unread)} sin leer` : '');
    }

    /**
     * Da por leído cada aviso cuando de verdad aparece en pantalla.
     *
     * Marcarlos todos al pintarlos sería más simple, pero entonces «sin leer»
     * no significaría nada: bastaría con abrir la pestaña para perder de vista
     * lo que acababa de llegar.
     */
    function watchUnread() {
        if (inboxObserver) inboxObserver.disconnect();

        const pendingNodes = $$('.admin-ai-msg.is-unread', $('#admin-inbox-thread'));
        if (!pendingNodes.length) return;

        // Sin IntersectionObserver no hay forma de saber qué se ha visto: se
        // dan por leídos al pintarlos, que es la lectura más conservadora.
        if (typeof global.IntersectionObserver !== 'function') {
            pendingNodes.forEach(markNodeRead);
            return;
        }

        inboxObserver = new global.IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                markNodeRead(entry.target);
            });
        }, { threshold: 0.55 });

        pendingNodes.forEach((node) => inboxObserver.observe(node));
    }

    async function markNodeRead(node) {
        const id = node.dataset.inboxId;
        const item = state.inbox.items.find((entry) => entry.id === id);
        if (!item || item.read) return;

        try {
            await api.markInboxRead(id);
        } catch (error) {
            return;   // sigue sin leer: se reintentará en la próxima carga
        }

        item.read = true;
        state.inbox.unread = Math.max(0, state.inbox.unread - 1);
        setTabCount('ia', state.inbox.unread);
        updateInboxStatusLine();

        // Se deja ver un instante como nuevo: apagarlo en el acto impediría
        // distinguir lo que acaba de llegar de lo ya revisado.
        setTimeout(() => {
            node.classList.remove('is-unread');
            const flag = node.querySelector('.admin-ai-new');
            if (flag) flag.remove();
        }, 1600);
    }

    /** Marca un aviso como enviado y refleja el cambio sin repintar la bandeja. */
    async function markSent(id) {
        const item = state.inbox.items.find((entry) => entry.id === id);
        if (!item || item.sent_whatsapp) return;

        try {
            await api.markInboxSent(id);
        } catch (error) {
            toast.error(error.message);
            return;
        }

        const wasUnread = !item.read;
        item.sent_whatsapp = true;
        item.read = true;

        if (wasUnread) {
            state.inbox.unread = Math.max(0, state.inbox.unread - 1);
            setTabCount('ia', state.inbox.unread);
            updateInboxStatusLine();
        }

        const node = findBubble(id);
        if (node) node.outerHTML = inboxBubble(item);
    }

    function findBubble(id) {
        return $$('.admin-ai-msg', $('#admin-inbox-thread'))
            .find((node) => node.dataset.inboxId === id) || null;
    }

    function sendInboxToWhatsapp(id) {
        const item = state.inbox.items.find((entry) => entry.id === id);
        if (!item) return;

        const link = api.whatsappLink(state.settings.whatsapp, item.message);

        if (!link) {
            requireWhatsapp();
            return;
        }

        openWhatsapp(link);
        markSent(id);
    }

    async function approveFromInbox(id) {
        const item = state.inbox.items.find((entry) => entry.id === id);
        if (!item) return;

        try {
            const { request } = await api.approveRequest(item.request_id);
            toast.success(`«${request.title}» ya es visible en el tablón.`);
            await afterInboxDecision();
        } catch (error) {
            toast.error(error.message);
        }
    }

    function openRejectFromInbox(id) {
        const item = state.inbox.items.find((entry) => entry.id === id);
        if (!item) return;

        openReasonDialog({
            title: 'Rechazar pedido',
            subject: item.request_title,
            note: 'Quien publicó recibirá este motivo tal cual. Sé claro y respetuoso.',
            confirmLabel: 'Rechazar pedido',
            submit: async (reason) => {
                const data = await api.rejectRequest(item.request_id, reason);
                toast.warning(`«${data.request.title}» fue rechazado. Se avisó a quien lo publicó.`);
                await afterInboxDecision();
            },
        });
    }

    /** Tras resolver una duda desde la bandeja, nada de lo demás sigue al día. */
    async function afterInboxDecision() {
        state.posts.loaded = false;
        state.log.loaded = false;

        await refreshStats();   // recalcula también qué dudas quedan abiertas
        renderInbox();          // la burbuja resuelta pierde sus dos botones
    }

    async function emptyInbox() {
        if (!state.inbox.items.length && !state.inbox.unread) {
            toast.info('La bandeja ya está vacía.');
            return;
        }

        const confirmed = await modal.confirm({
            title: '¿Vaciar la bandeja?',
            message: 'Se borrarán todos los avisos de la IA. Las pedidos en duda '
                + 'seguirán en la cola de Pedidos, esperando tu decisión.',
            confirmLabel: 'Vaciar bandeja',
            danger: true,
        });

        if (!confirmed) return;

        try {
            await api.clearInbox();

            state.inbox.items = [];
            state.inbox.unread = 0;
            state.inbox.summary = { approved: 0, rejected: 0, pending: 0 };
            state.inbox.announced.clear();

            renderInbox();
            toast.success('Bandeja vaciada.');
        } catch (error) {
            toast.error(error.message);
        }
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
        bindReportControls();
        bindBulk();
        bindInboxControls();
        bindSettingsControls();
        bindShortcuts();

        $('#admin-refresh').addEventListener('click', refreshAll);
    }

    async function refreshAll() {
        state.posts.loaded = false;
        state.sellers.loaded = false;
        state.log.loaded = false;
        state.inbox.loaded = false;

        await refreshStats();
        await loadInbox();      // deja `loaded` en true: `loadTab` no repetirá
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
            if (reject) {
                openRejectPost(reject.dataset.rejectPost);
                return;
            }

            const adult = event.target.closest('[data-adult-post]');
            if (adult) setAdult(adult.dataset.adultPost, adult.dataset.adultTo === '1', adult);
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

    function bindInboxControls() {
        $$('[data-inbox-decision]').forEach((button) => {
            button.addEventListener('click', () => {
                const decision = button.dataset.inboxDecision;
                if (!INBOX_FILTERS.includes(decision)) return;

                state.inbox.decision = decision;
                $$('[data-inbox-decision]').forEach((other) => {
                    other.setAttribute('aria-pressed', String(other === button));
                });
                loadInbox();
            });
        });

        $('#admin-inbox-clear').addEventListener('click', emptyInbox);

        $('#admin-inbox-thread').addEventListener('click', (event) => {
            const send = event.target.closest('[data-inbox-send]');
            if (send) {
                sendInboxToWhatsapp(send.dataset.inboxSend);
                return;
            }

            const approve = event.target.closest('[data-inbox-approve]');
            if (approve) {
                approveFromInbox(approve.dataset.inboxApprove);
                return;
            }

            const reject = event.target.closest('[data-inbox-reject]');
            if (reject) openRejectFromInbox(reject.dataset.inboxReject);
        });
    }

    function bindSettingsControls() {
        $('#admin-ai-form').addEventListener('submit', (event) => {
            event.preventDefault();
            saveWhatsapp();
        });

        // Mientras se corrige el número, el error deja de tener sentido.
        $('#admin-whatsapp').addEventListener('input', () => {
            const error = $('#admin-whatsapp-error');
            if (!error.hidden) showWhatsappError('');
        });

        $('#admin-auto-notify').addEventListener('change', (event) => {
            toggleAutoNotify(event.target.checked);
        });

        $('#admin-whatsapp-test').addEventListener('click', sendTestMessage);
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
            if (state.tab !== 'pedidos' || state.bulkRunning) return;
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
