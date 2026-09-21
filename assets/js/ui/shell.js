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
        { href: 'mapa.html', label: 'Mapa de vendedores' },
        { href: 'guardados.html', label: 'Guardados' },
        { href: 'mensajes.html', label: 'Mensajes' },
        { href: 'publicar.html', label: 'Publicar artículo' },
        { href: 'perfil.html', label: 'Mi perfil' },
    ];

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
                        <span class="brand-tagline">Compra · Vende · Conecta</span>
                    </span>
                </a>

                <div class="header-search">
                    <div class="input-group">
                        <span class="input-icon" aria-hidden="true">${ICON.search}</span>
                        <input type="search" class="input" id="global-search"
                               placeholder="Buscar productos, categorías o vendedores…"
                               autocomplete="off" role="combobox" aria-expanded="false"
                               aria-controls="search-suggestions" aria-label="Buscar en DiscoveryShop">
                        <span class="search-kbd" aria-hidden="true"><kbd>/</kbd></span>
                    </div>
                    <div class="search-suggestions" id="search-suggestions" role="listbox" hidden></div>
                </div>

                <nav class="header-actions" aria-label="Acciones de usuario">
                    <a class="btn btn-primary btn-sm header-publish" href="publicar.html" id="publish-btn">
                        ${ICON.plus}<span>Publicar</span>
                    </a>

                    <button class="header-icon-btn" id="theme-toggle" type="button"
                            data-tooltip="Cambiar tema" aria-label="Cambiar tema"></button>

                    <a class="header-icon-btn" href="mapa.html"
                       data-tooltip="Mapa de vendedores" aria-label="Mapa de vendedores">
                        ${ICON.map}
                    </a>

                    <a class="header-icon-btn" href="guardados.html"
                       data-tooltip="Guardados" aria-label="Publicaciones guardadas">
                        ${ICON.bookmark}
                        <span class="count-dot hidden" id="saved-count">0</span>
                    </a>

                    <a class="header-icon-btn" href="mensajes.html"
                       data-tooltip="Mensajes" aria-label="Mensajes">
                        ${ICON.chat}
                        <span class="count-dot hidden" id="msg-count">0</span>
                    </a>

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
                <a class="dropdown-item" href="perfil.html#publicaciones" role="menuitem">
                    ${ICON.store}<span>Mis publicaciones</span>
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

    /** Solo los vendedores aprobados (y el admin) ven el botón de publicar. */
    function updatePublishButton(user) {
        const button = $('#publish-btn');
        if (!button) return;

        const canPublish = !!user && (user.role === 'admin' || user.seller_status === 'approved');
        button.classList.toggle('hidden', !canPublish);
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
        if (logout) {
            logout.addEventListener('click', async () => {
                await api.logout();
                store.set({ user: null, saved: [], unreadMessages: 0, pendingModeration: 0 });
                global.toast.success('Cerraste sesión correctamente');
                setTimeout(() => { global.location.href = 'index.html'; }, 700);
            });
        }
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
                    <span class="suggestion-price">${escapeHtml(format.money(product.price))}</span>
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
                const data = await api.getPosts({ q: term, per_page: 6 });
                results = data.posts || [];
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
                            El foro de compraventa donde encuentras lo que buscas y
                            conversas directamente con quien lo vende. Sin intermediarios,
                            sin comisiones ocultas.
                        </p>
                    </div>

                    <div>
                        <h3 class="footer-heading">Explorar</h3>
                        <div class="footer-links">
                            <a href="index.html">Todas las publicaciones</a>
                            <a href="mapa.html">Mapa de vendedores</a>
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
                            <a href="publicar.html">Publicar artículo</a>
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
                            <p><strong style="color: var(--text-primary);">1. Explora el foro.</strong> Las publicaciones aparecen como en una red social: filtra por categoría, distrito, precio y estado del artículo.</p>
                            <p><strong style="color: var(--text-primary);">2. Reacciona.</strong> Deja tu corazón, marca «Me interesa» para avisar a quien publica, guarda lo que quieras revisar después y comenta tus dudas a la vista de todos.</p>
                            <p><strong style="color: var(--text-primary);">3. Ubica.</strong> Cada publicación muestra en un mapa real el distrito de Arequipa donde está el artículo. También puedes ver el mapa con todos los vendedores.</p>
                            <p><strong style="color: var(--text-primary);">4. Conversa y cierra el trato.</strong> Escribe por mensaje directo y acuerden dónde encontrarse. DiscoveryShop no cobra comisiones ni gestiona pagos: solo conecta a las personas.</p>
                            <p><strong style="color: var(--text-primary);">5. Publica.</strong> Para publicar necesitas una cuenta de vendedor aprobada. Solicítala al registrarte o desde tu perfil, y el equipo la revisa.</p>
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
            store.set({ saved: [], unreadMessages: 0, pendingModeration: 0 });
            return;
        }

        // Cada contador falla de forma independiente: uno caído no tumba al resto.
        const [saved, conversations, adminStats] = await Promise.all([
            api.getSavedPosts().catch(() => null),
            api.getConversations().catch(() => null),
            user.role === 'admin' ? api.getAdminStats().catch(() => null) : Promise.resolve(null),
        ]);

        store.set({
            saved: saved?.ids || [],
            unreadMessages: (conversations?.conversations || [])
                .reduce((sum, c) => sum + (c.unread || 0), 0),
            // Publicaciones y vendedores esperando revisión, en una sola cifra.
            pendingModeration: adminStats
                ? (adminStats.posts.pending + adminStats.sellers.pending)
                : 0,
        });
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
            // En páginas con filtros, el botón abre el panel lateral.
            const panel = $('.filters-panel');
            if (panel) {
                global.DiscoveryShell.toggleFilters();
                return;
            }

            global.modal.open({
                title: 'Navegación',
                size: 'sm',
                content: `
                    <div class="footer-links" style="gap: var(--space-4);">
                        ${NAV_LINKS.map((link) => `
                            <a href="${escapeAttr(link.href)}" style="font-size: var(--text-base); color: var(--text-primary);">
                                ${escapeHtml(link.label)}
                            </a>`).join('')}
                        ${store.get('user')?.role === 'admin'
                            ? '<a href="admin.html" style="font-size: var(--text-base); color: var(--brand);">Panel de administración</a>'
                            : ''}
                    </div>
                `,
            });
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

        const headerSlot = $('#app-header');
        if (headerSlot) headerSlot.outerHTML = headerMarkup();

        const footerSlot = $('#app-footer');
        if (footerSlot) footerSlot.outerHTML = footerMarkup();

        bindTheme();
        bindScrollState();
        bindSearch();
        bindMobileMenu();
        bindFooter();

        // Los contadores se repintan solos ante cualquier cambio de estado
        store.subscribe('saved', (list) => updateBadge('saved-count', (list || []).length));
        store.subscribe('unreadMessages', (count) => updateBadge('msg-count', count));
        store.subscribe('pendingModeration', (count) => updateBadge('admin-count', count));
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
