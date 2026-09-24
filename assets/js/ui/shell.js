/**
 * DiscoveryShop · Shell de la aplicación
 *
 * Inyecta la cabecera y el pie en todas las páginas para garantizar que la
 * navegación, la sesión y el buscador se comporten igual en cualquier vista.
 * Cada página solo necesita incluir `<div id="app-header">` y `<div id="app-footer">`.
 */
(function (global) {
    'use strict';

    const { escapeHtml, escapeAttr, format, $, debounce, theme, url } = global.DS;
    const api = global.api;
    const store = global.store;

    const ICON = {
        search: '<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7.5" cy="7.5" r="5"/><path d="m11.5 11.5 4 4"/></svg>',
        bookmark: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h10v15l-5-3.5-5 3.5v-15Z"/></svg>',
        bell: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.5 13.5h13L15 10.7V7.5a5 5 0 0 0-5-5Z"/><path d="M8 16a2 2 0 0 0 4 0"/></svg>',
        home: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.5Z"/></svg>',
        orders: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3h9a1 1 0 0 1 1 1v13l-2.2-1.6L11 17l-1-1.6L9 17l-2.3-1.6L4.5 17V4a1 1 0 0 1 1-1Z"/><path d="M8 7h4M8 10.5h4"/></svg>',
        map: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 2.5 2.5 5v12.5l5-2.5 5 2.5 5-2.5V2.5l-5 2.5-5-2.5Z"/><path d="M7.5 2.5V15M12.5 5v12.5"/></svg>',
        chat: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 12a2 2 0 0 1-2 2H7l-4 3V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7Z"/></svg>',
        shield: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5 3.5 5v5c0 3.8 2.7 6.9 6.5 7.5 3.8-.6 6.5-3.7 6.5-7.5V5L10 2.5Z"/><path d="m7.3 10 1.9 1.9 3.5-3.5"/></svg>',
        sun: '<svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M16 4l-1.4 1.4M5.4 14.6 4 16M16 16l-1.4-1.4M5.4 5.4 4 4"/></svg>',
        moon: '<svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 11.3A7.5 7.5 0 0 1 8.7 3a7.5 7.5 0 1 0 8.3 8.3Z"/></svg>',
        user: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6.5" r="3.2"/><path d="M3.8 17a6.2 6.2 0 0 1 12.4 0"/></svg>',
        plus: '<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8.5 3v11M3 8.5h11"/></svg>',
        menu: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h14M3 10h14M3 14h14"/></svg>',
        logout: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15.5H3.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1H7"/><path d="m12 12.5 3.5-3.5L12 5.5M15.5 9H7"/></svg>',
        store: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7h13v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7Z"/><path d="M2.5 7 4 2.5h10L15.5 7"/></svg>',
    };

    /**
     * Símbolo de la marca: bolsa con la lupa recortada. Va en línea y no como
     * <img> para que herede `currentColor` y funcione en ambos temas sin
     * pedir un segundo archivo. La lupa se recorta con una máscara en vez de
     * dibujarse con trazo, porque a 24 px un trazo fino desaparece.
     */
    const LOGO = [
        '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">',
        '<path d="M13.4 10.6 9.1 29.4a1.1 1.1 0 0 0 1.07 1.35h3.23Z" fill="currentColor" opacity="0.5"/>',
        '<path d="M16.6 11.2V9.4a4.6 4.6 0 0 1 9.2 0v1.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
        '<mask id="ds-mark-lens">',
        '<rect width="40" height="40" fill="#fff"/>',
        '<circle cx="21.3" cy="19.4" r="5.2" fill="none" stroke="#000" stroke-width="2.3"/>',
        '<path d="m25.2 23.3 4.6 4.6" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>',
        '</mask>',
        '<path d="M13.4 10.6h15.9a1.6 1.6 0 0 1 1.6 1.45l1.62 17.1a1.6 1.6 0 0 1-1.6 1.75H10.9a1.1 1.1 0 0 1-1.07-1.35Z" fill="currentColor" mask="url(#ds-mark-lens)"/>',
        '</svg>',
    ].join('');

    const NAV_LINKS = [
        { href: 'index.html', label: 'Inicio' },
        { href: 'mapa.html', label: 'Vendedores que responden' },
        { href: 'guardados.html', label: 'Guardados' },
        { href: 'mensajes.html', label: 'Mensajes' },
        { href: 'publicar.html', label: 'Pedir lo que busco' },
        { href: 'perfil.html', label: 'Mi perfil' },
    ];

    /* El menú del móvil llevaba solo texto, con estilos escritos en el
       atributo y sin señalar dónde estabas. Cada destino tiene su icono, el
       mismo que ya usa la cabecera o la barra inferior. */
    const NAV_ICON = {
        'index.html': ICON.home,
        'mapa.html': ICON.map,
        'guardados.html': ICON.bookmark,
        'mensajes.html': ICON.chat,
        'publicar.html': ICON.plus,
        'perfil.html': ICON.user,
    };

    /** Página actual, para marcar dónde estás. */
    const here = (global.location.pathname.split('/').pop() || 'index.html');

    /* ----------------------------------------------------------------------
       Cabecera
       ---------------------------------------------------------------------- */

    function headerMarkup() {
        return `
        <header class="site-header" id="site-header">
            <div class="header-inner">
                <button class="header-icon-btn menu-toggle" id="menu-toggle" type="button"
                        aria-label="Abrir menú" aria-expanded="false">${ICON.menu}</button>

                <a class="brand" href="index.html" aria-label="DiscoveryShop, ir al inicio">
                    <span class="brand-mark" aria-hidden="true">${LOGO}</span>
                    <span>
                        <span class="brand-name">DiscoveryShop</span>
                        <span class="brand-tagline">Lo que buscas, lo encuentras</span>
                    </span>
                </a>

                <div class="header-search">
                    <div class="input-group">
                        <span class="input-icon" aria-hidden="true">${ICON.search}</span>
                        <input type="search" class="input" id="global-search"
                               placeholder="Buscar pedidos, categorías o distritos…"
                               autocomplete="off" role="combobox" aria-expanded="false"
                               aria-controls="search-suggestions" aria-label="Buscar pedidos en DiscoveryShop">
                        <span class="search-kbd" aria-hidden="true"><kbd>/</kbd></span>
                    </div>
                    <div class="search-suggestions" id="search-suggestions" role="listbox" hidden></div>
                </div>

                <nav class="header-actions" aria-label="Acciones de usuario">
                    <a class="btn btn-primary btn-sm header-publish" href="publicar.html" id="publish-btn">
                        ${ICON.plus}<span>Pedir</span>
                    </a>

                    <button class="header-icon-btn" id="theme-toggle" type="button"
                            data-tooltip="Cambiar tema" aria-label="Cambiar tema"></button>

                    <a class="header-icon-btn" href="mapa.html"
                       data-tooltip="Vendedores que responden" aria-label="Vendedores que responden">
                        ${ICON.map}
                    </a>

                    <a class="header-icon-btn" href="guardados.html"
                       data-tooltip="Guardados" aria-label="Pedidos guardados">
                        ${ICON.bookmark}
                        <!-- Se llama saved-badge, no saved-count: ese id ya lo usa el
                             recuento de la propia página de guardados y, como DS.$ es
                             querySelector, ganaba este por salir antes en el documento.
                             El contador de la página se quedaba en «Cargando tus
                             guardados…» para siempre, y esa frase entera acababa dentro
                             de la burbuja del icono, desbordando la barra. -->
                        <span class="count-dot is-quiet hidden" id="saved-badge">0</span>
                    </a>

                    <a class="header-icon-btn" href="mensajes.html"
                       data-tooltip="Mensajes" aria-label="Mensajes">
                        ${ICON.chat}
                        <span class="count-dot hidden" id="msg-count">0</span>
                    </a>

                    <div class="dropdown notifications hidden" id="notifications">
                        <button class="header-icon-btn" id="notif-trigger" type="button"
                                data-tooltip="Avisos" aria-label="Avisos"
                                aria-haspopup="menu" aria-expanded="false" aria-controls="notif-panel">
                            ${ICON.bell}
                            <span class="count-dot hidden" id="notif-count">0</span>
                        </button>
                        <div class="dropdown-menu notif-panel" id="notif-panel" role="menu" hidden>
                            <div class="notif-head">
                                <span class="dropdown-label">Avisos</span>
                                <button class="notif-readall" id="notif-readall" type="button" hidden>
                                    Marcar todo como leído
                                </button>
                            </div>
                            <div class="notif-list" id="notif-list" aria-live="polite"></div>
                        </div>
                    </div>

                    <a class="header-icon-btn hidden" href="admin.html" id="admin-link"
                       data-tooltip="Panel de administración" aria-label="Panel de administración">
                        ${ICON.shield}
                        <span class="count-dot hidden" id="admin-count">0</span>
                    </a>

                    <div class="dropdown" id="user-menu"></div>
                </nav>
            </div>
        </header>
        `;
    }

    function renderUserMenu() {
        const container = $('#user-menu');
        if (!container) return;

        const user = store.get('user');

        if (!user) {
            container.innerHTML = `
                <a class="btn btn-primary btn-sm" href="login.html">Iniciar sesión</a>
            `;
            return;
        }

        container.innerHTML = `
            <button class="header-icon-btn" id="user-menu-trigger" type="button"
                    aria-haspopup="menu" aria-expanded="false" aria-label="Menú de ${escapeAttr(user.username)}">
                <span class="avatar avatar-sm">${escapeHtml(format.initials(user.username))}</span>
            </button>
            <div class="dropdown-menu" id="user-menu-panel" role="menu" hidden>
                <div class="dropdown-label">${escapeHtml(user.username)}</div>
                <div class="dropdown-role">${roleBadge(user)}</div>
                <div class="dropdown-separator"></div>
                <a class="dropdown-item" href="perfil.html" role="menuitem">
                    ${ICON.user}<span>Mi perfil</span>
                </a>
                <a class="dropdown-item" href="perfil.html#pedidos" role="menuitem">
                    ${ICON.store}<span>Mis pedidos</span>
                </a>
                <a class="dropdown-item" href="guardados.html" role="menuitem">
                    ${ICON.bookmark}<span>Guardados</span>
                </a>
                ${user.role === 'admin' ? `
                <div class="dropdown-separator"></div>
                <a class="dropdown-item" href="admin.html" role="menuitem">
                    ${ICON.shield}<span>Panel de administración</span>
                </a>` : ''}
                <div class="dropdown-separator"></div>
                <button class="dropdown-item is-danger" id="logout-btn" type="button" role="menuitem">
                    ${ICON.logout}<span>Cerrar sesión</span>
                </button>
            </div>
        `;

        bindUserMenu();
    }

    /**
     * Etiqueta que resume qué puede hacer la cuenta. Es la señal principal de
     * por qué el botón de publicar aparece o no.
     */
    function roleBadge(user) {
        if (user.role === 'admin') {
            return '<span class="badge badge-brand">Administrador</span>';
        }

        switch (user.seller_status) {
            case 'approved':
                return '<span class="badge badge-success">Vendedor verificado</span>';
            case 'pending':
                return '<span class="badge badge-warning">Vendedor en revisión</span>';
            case 'rejected':
                return '<span class="badge badge-danger">Solicitud rechazada</span>';
            default:
                return '<span class="badge">Comprador</span>';
        }
    }

    /**
     * El botón «Pedir» se ve con cualquier sesión iniciada.
     *
     * Exigía `seller_status === 'approved'`, que es la condición para
     * RESPONDER pedidos, no para hacerlos (ADR-019). El resultado era el peor
     * posible: la acción que define la plataforma, y la única que un comprador
     * viene a hacer, estaba escondida precisamente para los compradores —
     * mientras `publicar.html` los dejaba pasar sin problema si llegaban por
     * otro camino.
     */
    function updatePublishButton(user) {
        const button = $('#publish-btn');
        if (!button) return;

        button.classList.toggle('hidden', !user);
    }

    function updateAdminLink(user) {
        const link = $('#admin-link');
        if (!link) return;
        link.classList.toggle('hidden', !user || user.role !== 'admin');
    }

    function bindUserMenu() {
        const trigger = $('#user-menu-trigger');
        const panel = $('#user-menu-panel');
        if (!trigger || !panel) return;

        const close = () => {
            panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        };

        trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            const willOpen = panel.hidden;
            panel.hidden = !willOpen;
            trigger.setAttribute('aria-expanded', String(willOpen));
        });

        document.addEventListener('click', (event) => {
            if (!panel.hidden && !panel.contains(event.target)) close();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !panel.hidden) {
                close();
                trigger.focus();
            }
        });

        const logout = $('#logout-btn');
        if (logout) logout.addEventListener('click', signOut);
    }

    /**
     * Cerrar sesión, desde donde se pida.
     *
     * Vive aparte porque ahora hay dos puertas: el menú de la cuenta en
     * escritorio y el menú desplegable del móvil, donde antes no había
     * ninguna y había que entrar al perfil y bajar hasta el final.
     */
    async function signOut() {
        await api.logout();
        store.set({ user: null, saved: [], unreadMessages: 0, pendingModeration: 0 });
        global.toast.success('Cerraste sesión correctamente');
        setTimeout(() => { global.location.href = 'index.html'; }, 700);
    }

    /* ----------------------------------------------------------------------
       Buscador global
       ---------------------------------------------------------------------- */

    function bindSearch() {
        const input = $('#global-search');
        const panel = $('#search-suggestions');
        if (!input || !panel) return;

        let results = [];
        let highlighted = -1;

        const hide = () => {
            panel.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            highlighted = -1;
        };

        const goToSearch = (term) => {
            const query = term.trim();
            if (!query) return;
            global.location.href = url.build('index.html', { q: query });
        };

        const render = () => {
            if (!results.length) {
                panel.innerHTML = `
                    <div style="padding: var(--space-5); text-align: center; color: var(--text-muted); font-size: var(--text-xs);">
                        No encontramos coincidencias
                    </div>`;
                panel.hidden = false;
                input.setAttribute('aria-expanded', 'true');
                return;
            }

            panel.innerHTML = results.map((product, index) => `
                <button class="suggestion${index === highlighted ? ' is-highlighted' : ''}"
                        type="button" role="option" aria-selected="${index === highlighted}"
                        data-id="${escapeAttr(product.id)}">
                    <img class="suggestion-thumb" src="${escapeAttr(product.image_url)}"
                         alt="" loading="lazy">
                    <span class="suggestion-body">
                        <span class="suggestion-title">${escapeHtml(product.title)}</span>
                        <span class="suggestion-meta">${escapeHtml(product.category.name)} · ${escapeHtml(product.location.city)}</span>
                    </span>
                    <span class="suggestion-price">${escapeHtml(UI.budgetText(product))}</span>
                </button>
            `).join('');

            panel.querySelectorAll('.suggestion').forEach((button) => {
                button.addEventListener('click', () => {
                    global.location.href = url.build('publicacion.html', { id: button.dataset.id });
                });
            });

            panel.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        };

        const search = debounce(async (term) => {
            if (term.trim().length < 2) {
                hide();
                return;
            }

            try {
                const data = await api.getRequests({ q: term, per_page: 6 });
                results = data.requests || [];
                highlighted = -1;
                render();
            } catch (error) {
                hide();
            }
        }, 220);

        input.addEventListener('input', (event) => search(event.target.value));

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (highlighted >= 0 && results[highlighted]) {
                    global.location.href = url.build('publicacion.html', { id: results[highlighted].id });
                } else {
                    goToSearch(input.value);
                }
                return;
            }

            if (event.key === 'Escape') {
                hide();
                input.blur();
                return;
            }

            if (panel.hidden || !results.length) return;

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                highlighted = (highlighted + 1) % results.length;
                render();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                highlighted = highlighted <= 0 ? results.length - 1 : highlighted - 1;
                render();
            }
        });

        document.addEventListener('click', (event) => {
            if (!panel.hidden && !panel.contains(event.target) && event.target !== input) {
                hide();
            }
        });

        // Atajo «/» para saltar al buscador desde cualquier punto
        document.addEventListener('keydown', (event) => {
            const tag = document.activeElement?.tagName;
            const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

            if (event.key === '/' && !isTyping) {
                event.preventDefault();
                input.focus();
                input.select();
            }
        });

        // Refleja el término activo al llegar desde una búsqueda
        const currentQuery = url.param('q');
        if (currentQuery) input.value = currentQuery;
    }

    /* ----------------------------------------------------------------------
       Pie
       ---------------------------------------------------------------------- */

    function footerMarkup() {
        const year = new Date().getFullYear();

        return `
        <footer class="site-footer">
            <div class="footer-inner">
                <div class="footer-grid">
                    <div class="footer-about">
                        <a class="brand" href="index.html">
                            <span class="brand-mark" aria-hidden="true">${LOGO}</span>
                            <span class="brand-name">DiscoveryShop</span>
                        </a>
                        <p>
                            El comercio inverso de Arequipa: publicas lo que buscas y los
                            vendedores de la ciudad te responden. Sin intermediarios,
                            sin comisiones ocultas.
                        </p>
                    </div>

                    <div>
                        <h3 class="footer-heading">Explorar</h3>
                        <div class="footer-links">
                            <a href="index.html">Todos los pedidos</a>
                            <a href="mapa.html">Vendedores que responden</a>
                            <a href="index.html?sort=popular">Más populares</a>
                            <a href="index.html?sort=recent">Recién publicados</a>
                        </div>
                    </div>

                    <div>
                        <h3 class="footer-heading">Tu cuenta</h3>
                        <div class="footer-links">
                            <a href="perfil.html">Mi perfil</a>
                            <a href="guardados.html">Guardados</a>
                            <a href="mensajes.html">Mis mensajes</a>
                            <a href="publicar.html">Publicar un pedido</a>
                        </div>
                    </div>

                    <div>
                        <h3 class="footer-heading">Ayuda</h3>
                        <div class="footer-links">
                            <a href="mensajes.html">Centro de mensajes</a>
                            <a href="#" data-action="about">Cómo funciona</a>
                            <a href="#" data-action="reset-demo">Reiniciar datos demo</a>
                        </div>
                    </div>
                </div>

                <div class="footer-bottom">
                    <span>© ${year} DiscoveryShop · Hecho en Arequipa, Perú</span>
                    <span class="mode-pill" id="mode-pill"
                          title="Este sitio no tiene servidor: tu cuenta, tus publicaciones y tus mensajes se guardan solo en este navegador.">
                        <span class="mode-dot" aria-hidden="true"></span>
                        <span>Datos guardados en tu navegador</span>
                    </span>
                </div>
            </div>
        </footer>
        `;
    }

    function bindFooter() {
        const about = document.querySelector('[data-action="about"]');
        if (about) {
            about.addEventListener('click', (event) => {
                event.preventDefault();
                global.modal.open({
                    title: 'Cómo funciona DiscoveryShop',
                    content: `
                        <div style="display: flex; flex-direction: column; gap: var(--space-4); font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.7;">
                            <p><strong style="color: var(--text-primary);">1. Mira lo que busca la gente.</strong> Cada publicación es un pedido de alguien: filtra por categoría, distrito, presupuesto y en qué estado lo acepta.</p>
                            <p><strong style="color: var(--text-primary);">2. Súmate o responde.</strong> Si buscas lo mismo, marca «También lo busco» y contará como demanda. Si lo tienes, pulsa «Lo tengo» y haz tu oferta.</p>
                            <p><strong style="color: var(--text-primary);">3. Ubica.</strong> Cada pedido muestra en un mapa el distrito de Arequipa donde hace falta. Y el mapa general reúne a los vendedores que ya han resuelto pedidos.</p>
                            <p><strong style="color: var(--text-primary);">4. Acepta y cierra el trato.</strong> Al aceptar una oferta se abre el chat con ese vendedor y acuerdan dónde verse. DiscoveryShop no cobra comisiones ni gestiona pagos: solo conecta a las personas.</p>
                            <p><strong style="color: var(--text-primary);">5. Pide lo que buscas.</strong> Con una cuenta basta. Para <em>responder</em> pedidos sí hace falta cuenta de vendedor aprobado: solicítala al registrarte o desde tu perfil.</p>
                        </div>
                    `,
                    actions: [{ label: 'Entendido', variant: 'primary' }],
                });
            });
        }

        const reset = document.querySelector('[data-action="reset-demo"]');
        if (reset) {
            reset.addEventListener('click', async (event) => {
                event.preventDefault();

                const confirmed = await global.modal.confirm({
                    title: 'Restaurar los datos originales',
                    message: 'Se recuperará el catálogo inicial y se borrarán tu cuenta, tus publicaciones, tus guardados y tus mensajes de este navegador. Esta acción no se puede deshacer.',
                    confirmLabel: 'Sí, restaurar',
                    danger: true,
                });

                if (!confirmed) return;

                api.resetData();
                global.toast.success('Datos restaurados. Recargando…');
                setTimeout(() => global.location.reload(), 900);
            });
        }
    }

    /* ----------------------------------------------------------------------
       Navegación inferior (solo en móvil)

       Es el panel 7 del storyboard: Inicio · Pedidos · Mensajes · Perfil. En
       un teléfono la cabecera solo deja sitio para el logo y el buscador, y
       las cuatro cosas que se usan a diario quedaban a dos toques dentro del
       menú. Aquí están a uno.
       ---------------------------------------------------------------------- */

    /* El del medio es la acción, no un destino: es lo único que esta
       plataforma hace, y hasta ahora había que buscarlo en el menú. */
    const BOTTOM_NAV = [
        { href: 'index.html', label: 'Inicio', icon: 'home', match: ['index.html', ''] },
        { href: 'guardados.html', label: 'Guardados', icon: 'bookmark', match: ['guardados.html'] },
        { href: 'publicar.html', label: 'Pedir', icon: 'plus', match: ['publicar.html'], primary: true },
        { href: 'mensajes.html', label: 'Mensajes', icon: 'chat', match: ['mensajes.html'], badge: 'nav-msg-count' },
        { href: 'perfil.html', label: 'Perfil', icon: 'user', match: ['perfil.html'] },
    ];

    function mountBottomNav() {
        if (document.getElementById('bottom-nav')) return;

        const page = (global.location.pathname.split('/').pop() || 'index.html');

        const nav = document.createElement('nav');
        nav.className = 'bottom-nav';
        nav.id = 'bottom-nav';
        nav.setAttribute('aria-label', 'Navegación principal');

        nav.innerHTML = BOTTOM_NAV.map((item) => {
            const active = item.match.includes(page);
            return `
            <a class="bottom-nav-item${active ? ' is-active' : ''}${item.primary ? ' is-primary' : ''}"
               href="${item.href}" ${active ? 'aria-current="page"' : ''}>
                <span class="bottom-nav-icon" aria-hidden="true">${ICON[item.icon]}</span>
                <span class="bottom-nav-label">${escapeHtml(item.label)}</span>
                ${item.badge ? `<span class="count-dot hidden" id="${item.badge}">0</span>` : ''}
            </a>`;
        }).join('');

        document.body.appendChild(nav);
        document.body.classList.add('has-bottom-nav');
    }

    /* ----------------------------------------------------------------------
       Avisos

       El núcleo los escribía desde el primer día — interés, comentarios,
       decisiones de moderación — y no había ni una pantalla que los leyera.
       La señal que sostiene el foro, que alguien quiere tu cosa, no llegaba.
       ---------------------------------------------------------------------- */

    /* Cada aviso que el servidor sabe emitir, con el nombre de su familia y su
       tono. Los tipos son los que escribe `notify()`: esta tabla decía
       `post_approved` e `interest`, que nadie emite desde la migración, así
       que casi todos los avisos —incluido el que sostiene la plataforma, «una
       vendedor respondió tu pedido»— caían en el 🔔 genérico y se leían todos
       iguales. El título da la familia de un vistazo; el texto, el detalle. */
    const NOTIF_META = {
        offer_received: { icon: '🏷️', title: 'Nueva oferta', tone: 'brand' },
        offer_accepted: { icon: '🤝', title: 'Tu oferta fue aceptada', tone: 'success' },
        offer_declined: { icon: '📭', title: 'Oferta descartada', tone: 'muted' },
        deal_confirmed: { icon: '✅', title: 'Compra confirmada', tone: 'success' },
        deal_rated: { icon: '⭐', title: 'Te calificaron', tone: 'brand' },
        me_too: { icon: '🙌', title: 'También lo buscan', tone: 'brand' },
        comment: { icon: '💬', title: 'Nuevo comentario', tone: 'muted' },
        request_approved: { icon: '📢', title: 'Pedido publicado', tone: 'success' },
        request_rejected: { icon: '⛔', title: 'Pedido rechazado', tone: 'danger' },
        request_flagged_adult: { icon: '🔞', tone: 'warn', title: 'Marcado +18' },
        request_unflagged_adult: { icon: '🔞', tone: 'info', title: 'Marca +18 retirada' },
        request_pending: { icon: '⏳', title: 'Pedido en revisión', tone: 'muted' },
        seller_approved: { icon: '🎉', title: 'Vendedor aprobado', tone: 'success' },
        seller_rejected: { icon: '📄', title: 'Solicitud rechazada', tone: 'danger' },
        report_resolved: { icon: '🛡️', title: 'Denuncia resuelta', tone: 'muted' },
    };

    const NOTIF_FALLBACK = { icon: '🔔', title: 'Aviso', tone: 'muted' };

    /** A dónde lleva cada aviso al tocarlo. */
    function notificationHref(item) {
        if (item.request_id) return `publicacion.html?id=${encodeURIComponent(item.request_id)}`;
        if (String(item.type || '').startsWith('seller_')) return 'perfil.html';
        return 'index.html';
    }

    function renderNotifications() {
        const list = $('#notif-list');
        if (!list) return;

        const items = store.get('notifications') || [];
        const readAll = $('#notif-readall');
        const unread = items.filter((n) => !n.read).length;

        if (readAll) readAll.hidden = unread === 0;

        if (!items.length) {
            list.innerHTML = `
                <div class="notif-empty">
                    <span class="notif-empty-icon" aria-hidden="true">🔔</span>
                    <p class="notif-empty-title">Aquí no hay nada todavía</p>
                    <p class="notif-empty-text">
                        Te avisamos cuando un vendedor responda a un pedido tuyo,
                        cuando acepten tu oferta o cuando se decida sobre lo que publicaste.
                    </p>
                </div>`;
            return;
        }

        list.innerHTML = items.map((item) => {
            const meta = NOTIF_META[item.type] || NOTIF_FALLBACK;

            return `
            <a class="notif-item${item.read ? '' : ' is-unread'}"
               href="${escapeAttr(notificationHref(item))}"
               data-notif-id="${escapeAttr(item.id)}" role="menuitem">
                <span class="notif-icon is-${meta.tone}" aria-hidden="true">${meta.icon}</span>
                <span class="notif-body">
                    <span class="notif-title">${escapeHtml(meta.title)}</span>
                    <span class="notif-text">${escapeHtml(item.text)}</span>
                    <span class="notif-time">${escapeHtml(format.relative(item.created_at))}</span>
                </span>
                ${item.read ? '' : '<span class="notif-dot" aria-label="Sin leer"></span>'}
            </a>`;
        }).join('');
    }

    async function refreshNotifications() {
        const container = $('#notifications');
        if (!container) return;

        if (!store.get('user')) {
            container.classList.add('hidden');
            store.set({ notifications: [], unreadNotifications: 0 });
            return;
        }

        container.classList.remove('hidden');

        const data = await api.getNotifications().catch(() => null);
        if (!data) return;

        store.set({
            notifications: data.notifications || [],
            unreadNotifications: data.unread || 0,
        });
    }

    function bindNotifications() {
        const trigger = $('#notif-trigger');
        const panel = $('#notif-panel');
        if (!trigger || !panel) return;

        const close = () => {
            panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        };

        trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            const willOpen = panel.hidden;
            panel.hidden = !willOpen;
            trigger.setAttribute('aria-expanded', String(willOpen));
            // Se repinta al abrir: entre carga y clic pudo llegar algo nuevo.
            if (willOpen) renderNotifications();
        });

        document.addEventListener('click', (event) => {
            if (!panel.hidden && !panel.contains(event.target)) close();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !panel.hidden) {
                close();
                trigger.focus();
            }
        });

        panel.addEventListener('click', async (event) => {
            const link = event.target.closest('[data-notif-id]');
            if (!link) return;

            const id = link.dataset.notifId;
            const item = (store.get('notifications') || []).find((n) => n.id === id);
            if (!item || item.read) return;

            // Se espera al acuse antes de navegar: si se deja en marcha y la
            // página cambia, la marca se pierde y el aviso vuelve sin leer.
            event.preventDefault();

            await api.markNotificationRead(id).catch(() => null);

            store.set({
                notifications: (store.get('notifications') || [])
                    .map((n) => (n.id === id ? { ...n, read: true } : n)),
                unreadNotifications: Math.max(0, (store.get('unreadNotifications') || 1) - 1),
            });

            global.location.href = link.getAttribute('href');
        });

        const readAll = $('#notif-readall');
        if (readAll) {
            readAll.addEventListener('click', async (event) => {
                event.stopPropagation();

                const done = await api.markAllNotificationsRead().catch(() => null);
                if (!done) {
                    global.toast.error('No se pudieron marcar los avisos');
                    return;
                }

                store.set({
                    notifications: (store.get('notifications') || []).map((n) => ({ ...n, read: true })),
                    unreadNotifications: 0,
                });
            });
        }
    }

    /* ----------------------------------------------------------------------
       Contadores e insignias
       ---------------------------------------------------------------------- */

    function updateBadge(id, count) {
        const badge = $(`#${id}`);
        if (!badge) return;

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    async function refreshCounters() {
        const user = store.get('user');

        if (!user) {
            store.set({
                saved: [], unreadMessages: 0, pendingModeration: 0,
                notifications: [], unreadNotifications: 0,
            });
            const bell = $('#notifications');
            if (bell) bell.classList.add('hidden');
            return;
        }

        // Cada contador falla de forma independiente: uno caído no tumba al resto.
        const [saved, conversations, adminStats] = await Promise.all([
            api.getSavedRequests().catch(() => null),
            api.getConversations().catch(() => null),
            user.role === 'admin' ? api.getAdminStats().catch(() => null) : Promise.resolve(null),
        ]);

        store.set({
            saved: saved?.ids || [],
            unreadMessages: (conversations?.conversations || [])
                .reduce((sum, c) => sum + (c.unread || 0), 0),
            // Pedidos, vendedores y denuncias esperando revisión, en una sola
            // cifra: es lo que el escudo de la cabecera anuncia. La clave es
            // `requests`; mientras dijo `posts` esto lanzaba un TypeError al
            // construir el objeto, así que `store.set` no llegaba a ejecutarse
            // y un administrador se quedaba sin campana, sin guardados y sin
            // mensajes sin leer en todas las páginas del sitio.
            pendingModeration: adminStats && adminStats.requests
                ? (adminStats.requests.pending
                    + adminStats.sellers.pending
                    + (adminStats.reports ? adminStats.reports.open : 0))
                : 0,
        });

        await refreshNotifications();
    }

    /* ----------------------------------------------------------------------
       Tema y comportamiento de cabecera
       ---------------------------------------------------------------------- */

    function bindTheme() {
        const button = $('#theme-toggle');
        if (!button) return;

        const paint = (value) => {
            button.innerHTML = value === 'dark' ? ICON.sun : ICON.moon;
            button.setAttribute('aria-label', value === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro');
        };

        paint(theme.get());

        button.addEventListener('click', () => {
            theme.toggle();
            paint(theme.get());
        });
    }

    function bindScrollState() {
        const header = $('#site-header');
        if (!header) return;

        const update = () => {
            header.classList.toggle('is-scrolled', global.scrollY > 8);
        };

        update();
        global.addEventListener('scroll', update, { passive: true });
    }

    function bindMobileMenu() {
        const toggle = $('#menu-toggle');
        if (!toggle) return;

        toggle.addEventListener('click', () => {
            // Antes, en el feed este botón abría los filtros y dejaba la
            // navegación sin acceso en móvil. Los filtros ya tienen su propio
            // botón flotante, así que este es siempre el menú.
            global.modal.open({
                title: 'Navegación',
                size: 'sm',
                content: `
                    <nav class="nav-sheet" aria-label="Secciones">
                        ${NAV_LINKS.map((link) => {
                            const current = here === link.href;
                            return `
                            <a class="nav-sheet-item${current ? ' is-current' : ''}"
                               href="${escapeAttr(link.href)}"
                               ${current ? 'aria-current="page"' : ''}>
                                <span class="nav-sheet-icon" aria-hidden="true">${NAV_ICON[link.href] || ICON.home}</span>
                                <span>${escapeHtml(link.label)}</span>
                            </a>`;
                        }).join('')}
                        ${store.get('user')?.role === 'admin'
                            ? `<a class="nav-sheet-item is-admin" href="admin.html">
                                   <span class="nav-sheet-icon" aria-hidden="true">${ICON.shield}</span>
                                   <span>Panel de administración</span>
                               </a>`
                            : ''}
                        ${store.get('user')
                            ? `<button class="nav-sheet-item is-logout" type="button" data-action="logout">
                                   <span class="nav-sheet-icon" aria-hidden="true">${ICON.logout}</span>
                                   <span>Cerrar sesión</span>
                               </button>`
                            : ''}
                    </nav>
                `,
            });

            // El modal se pinta después de abrirse; el botón vive dentro de él
            const sheet = document.querySelector('.nav-sheet [data-action="logout"]');
            if (sheet) sheet.addEventListener('click', signOut);
        });
    }

    /** Abre o cierra el panel de filtros en pantallas pequeñas. */
    function toggleFilters(force) {
        const panel = $('.filters-panel');
        if (!panel) return;

        const willOpen = force ?? !panel.classList.contains('is-open');
        panel.classList.toggle('is-open', willOpen);

        let scrim = $('#filters-scrim');

        if (willOpen) {
            if (!scrim) {
                scrim = document.createElement('div');
                scrim.className = 'scrim';
                scrim.id = 'filters-scrim';
                scrim.addEventListener('click', () => toggleFilters(false));
                document.body.appendChild(scrim);
            }
            scrim.hidden = false;
            document.body.classList.add('is-modal-open');
        } else if (scrim) {
            scrim.hidden = true;
            document.body.classList.remove('is-modal-open');
        }
    }

    /* ----------------------------------------------------------------------
       Arranque
       ---------------------------------------------------------------------- */

    async function init() {
        theme.apply();
        theme.follow();

        const headerSlot = $('#app-header');
        if (headerSlot) headerSlot.outerHTML = headerMarkup();

        const footerSlot = $('#app-footer');
        if (footerSlot) footerSlot.outerHTML = footerMarkup();

        mountBottomNav();

        bindTheme();
        bindScrollState();
        bindSearch();
        bindMobileMenu();
        bindFooter();
        bindNotifications();

        // Los contadores se repintan solos ante cualquier cambio de estado
        store.subscribe('saved', (list) => updateBadge('saved-badge', (list || []).length));
        store.subscribe('unreadMessages', (count) => {
            updateBadge('msg-count', count);
            updateBadge('nav-msg-count', count);
        });
        store.subscribe('pendingModeration', (count) => updateBadge('admin-count', count));
        store.subscribe('unreadNotifications', (count) => updateBadge('notif-count', count));
        store.subscribe('notifications', () => renderNotifications());
        store.subscribe('user', (user) => {
            renderUserMenu();
            updatePublishButton(user);
            updateAdminLink(user);
        });

        await api.ready();

        const user = await api.getCurrentUser();
        store.set({ user: user ? user.user || user : null });

        await refreshCounters();
    }

    global.DiscoveryShell = { init, refreshCounters, toggleFilters, ICON };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
