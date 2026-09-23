/**
 * DiscoveryShop · Perfil de usuario
 *
 * Tres piezas: la cabecera con las métricas, el bloque de estado de vendedor
 * —el corazón del modelo, porque decide si la cuenta puede publicar— y dos
 * pestañas enlazables por ancla (#datos, #publicaciones).
 *
 * Las publicaciones se piden una sola vez y se mantienen en memoria: editar o
 * eliminar repinta la lista y recalcula contadores sin volver al servidor.
 */
(function (global) {
    'use strict';

    const { $, $$, escapeHtml, escapeAttr, format, theme } = global.DS;
    const api = global.api;
    const store = global.store;
    const toast = global.toast;
    const modal = global.modal;
    const UI = global.UI;

    const TABS = ['datos', 'pedidos'];
    /* Hasta dónde cede quien pide. Tiene que coincidir con MockAPI.CONDITIONS:
       si no, el desplegable ofrece valores que el servidor no reconoce. */
    const CONDITIONS = ['Solo nuevo', 'Como nuevo o mejor', 'Cualquiera que funcione'];
    const BIO_MAX = 200;
    const MOTIVATION_MAX = 280;

    const state = {
        user: null,
        posts: [],
        postsLoaded: false,
        filter: 'all',
        savedCount: 0,
    };

    let postsRequest = null;
    let activeTab = 'datos';

    /* ----------------------------------------------------------------------
       Ayudas de dominio
       ---------------------------------------------------------------------- */

    /** Nombres de los 18 distritos de Arequipa, desde la semilla compartida. */
    function districtNames() {
        const seed = global.DiscoverySeed;
        return seed && Array.isArray(seed.DISTRICTS)
            ? seed.DISTRICTS.map((district) => district.name)
            : [];
    }

    /** Opciones de un `select`, garantizando que el valor guardado siga presente. */
    function optionsFrom(values, selected) {
        const list = values.slice();
        if (selected && !list.includes(selected)) list.unshift(selected);

        return list
            .map((value) => `<option value="${escapeAttr(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`)
            .join('');
    }

    /** Solo el administrador y el vendedor aprobado pueden publicar. */
    /**
     * Pedir algo no necesita permiso: quien tiene cuenta, pide. La cuenta de
     * vendedor aprobada sirve para lo contrario —responder ofertas—, y eso se
     * mira en la ficha del pedido, no aquí.
     */
    function canPublish() {
        return !!state.user;
    }

    /** Pastilla de rol: la señal más visible de qué permite la cuenta. */
    function roleBadge(user) {
        if (user.role === 'admin') {
            return { label: 'Administrador', className: 'badge badge-brand' };
        }

        switch (user.seller_status) {
            case 'approved':
                return { label: 'Vendedor verificado', className: 'badge badge-success' };
            case 'pending':
                return { label: 'Vendedor en revisión', className: 'badge badge-warning' };
            case 'rejected':
                return { label: 'Solicitud rechazada', className: 'badge badge-danger' };
            default:
                return { label: 'Comprador', className: 'badge' };
        }
    }

    /* ----------------------------------------------------------------------
       Cabecera de perfil
       ---------------------------------------------------------------------- */

    function renderIdentity() {
        const user = state.user;
        const role = roleBadge(user);

        $('#profile-avatar').textContent = format.initials(user.username);
        $('#profile-name').textContent = user.username || 'Sin nombre';
        $('#profile-email').textContent = user.email || '';
        $('#profile-district').textContent = `📍 ${user.district || 'Arequipa'}`;
        $('#profile-since').textContent = `🗓️ Miembro desde ${format.date(user.created_at)}`;

        const badge = $('#profile-role');
        badge.className = `profile-role ${role.className}`;
        badge.textContent = role.label;

        document.title = `${user.username || 'Mi perfil'} · Mi perfil · DiscoveryShop`;
    }

    function setMetric(name, value) {
        const node = $(`[data-metric="${name}"]`);
        if (node) node.textContent = value;
    }

    /** Métricas que dependen de las publicaciones ya cargadas. */
    function renderPostMetrics() {
        if (!state.postsLoaded) return;

        const summary = computeSummary();
        const views = state.posts.reduce((total, post) => total + (Number(post.views) || 0), 0);

        setMetric('approved', format.number(summary.approved));
        setMetric('pending', format.number(summary.pending));
        setMetric('views', format.number(views));
    }

    function renderSavedMetric() {
        setMetric('saved', format.number(state.savedCount));
    }

    /* ----------------------------------------------------------------------
       Bloque de estado de vendedor
       ---------------------------------------------------------------------- */

    /** Cinco variantes: comprador, en revisión, aprobado, rechazado y administrador. */
    function sellerVariant(user) {
        if (user.role === 'admin') return 'admin';
        if (['approved', 'pending', 'rejected'].includes(user.seller_status)) {
            return user.seller_status;
        }
        return 'invite';
    }

    /**
     * Contenido del bloque para cada variante. `badge`, `extra`, `meta` y
     * `actions` ya son HTML de confianza; `title` y `message` se escapan al
     * pintar, porque podrían crecer con datos del servidor.
     */
    function sellerContent(user, variant) {
        if (variant === 'admin') return {
            icon: '🛡️',
            title: 'Cuenta de administración',
            message: 'Tu cuenta revisa las publicaciones y las solicitudes de vendedor del foro.',
            actions: '<a class="btn btn-secondary" href="admin.html">Abrir el panel de administración</a>',
        };

        if (variant === 'approved') return {
            icon: '✅',
            title: 'Cuenta de vendedor verificada',
            badge: '<span class="badge badge-success">Verificada</span>',
            message: 'Ya puedes publicar tus artículos. Cada publicación pasa por una revisión rápida del equipo antes de aparecer en el foro.',
            actions: '<a class="btn btn-primary" href="publicar.html">Publicar un artículo</a>',
        };

        if (variant === 'pending') {
            const since = user.applied_at || user.created_at;
            return {
                icon: '⏳',
                title: 'Tu solicitud está en revisión',
                badge: '<span class="badge badge-warning">En revisión</span>',
                message: 'Mientras tanto puedes usar el foro con normalidad: comentar, guardar publicaciones y escribir a quien vende. Todavía no puedes publicar artículos.',
                meta: `Enviada el ${escapeHtml(format.date(since))} · ${escapeHtml(format.relative(since))}`,
            };
        }

        if (variant === 'rejected') return {
            icon: '⚠️',
            title: 'Tu solicitud de vendedor fue rechazada',
            badge: '<span class="badge badge-danger">Rechazada</span>',
            message: 'Puedes corregir lo que haga falta y volver a enviarla cuando quieras.',
            extra: user.rejection_reason
                ? `<blockquote class="profile-seller-quote">${escapeHtml(user.rejection_reason)}</blockquote>`
                : '<p class="profile-seller-message">El equipo no indicó un motivo concreto.</p>',
            actions: '<button class="btn btn-primary" type="button" data-action="apply-seller">Volver a solicitar</button>',
        };

        return {
            icon: '🏪',
            title: '¿Tienes una tienda y quieres responder pedidos?',
            message: 'Pedir no necesita permiso: ya puedes. Responder sí. Con una cuenta de tienda ofreces lo que tengas a quien lo esté buscando. La solicitud es gratuita y la revisa el equipo.',
            extra: `
                <ul class="profile-seller-list">
                    <li>Ofrece lo que tienes a quien ya lo está buscando.</li>
                    <li>Al aceptarte una oferta se abre el chat con esa persona.</li>
                    <li>Apareces en el mapa de tiendas de tu distrito.</li>
                </ul>`,
            actions: '<button class="btn btn-primary" type="button" data-action="apply-seller">Solicitar cuenta de vendedor</button>',
        };
    }

    function renderSeller() {
        const variant = sellerVariant(state.user);
        const {
            icon, title, badge = '', message = '', extra = '', meta = '', actions = '',
        } = sellerContent(state.user, variant);

        const container = $('#profile-seller');
        container.className = `profile-seller is-${variant}`;
        container.innerHTML = `
        <span class="profile-seller-icon" aria-hidden="true">${icon}</span>

        <div class="profile-seller-text">
            <div class="profile-seller-head">
                <h2 class="profile-seller-title">${escapeHtml(title)}</h2>
                ${badge}
            </div>
            ${message ? `<p class="profile-seller-message">${escapeHtml(message)}</p>` : ''}
            ${extra}
            ${meta ? `<p class="profile-seller-meta">${meta}</p>` : ''}
        </div>

        ${actions ? `<div class="profile-seller-actions">${actions}</div>` : ''}`;

        // El botón de publicar de la pestaña sigue al mismo permiso.
        const publish = $('#posts-publish');
        if (publish) publish.hidden = !canPublish();
    }

    function bindSeller() {
        $('#profile-seller').addEventListener('click', (event) => {
            if (event.target.closest('[data-action="apply-seller"]')) openSellerModal();
        });
    }

    /* --- Solicitud de vendedor --------------------------------------------- */

    function openSellerModal() {
        const again = state.user.seller_status === 'rejected';

        const instance = modal.open({
            title: again ? 'Volver a solicitar cuenta de vendedor' : 'Solicitar cuenta de vendedor',
            size: 'md',
            content: `
            <form class="profile-apply-form" id="seller-form" novalidate>
                <p class="profile-apply-intro">
                    El equipo revisa las solicitudes a mano. Mientras esperas puedes seguir
                    usando el foro con tu cuenta actual.
                </p>

                <div class="field">
                    <div class="profile-label-row">
                        <label class="label" for="seller-motivation">
                            Cuéntanos brevemente qué piensas publicar
                        </label>
                        <span class="profile-counter" id="seller-counter">0/${MOTIVATION_MAX}</span>
                    </div>
                    <textarea class="textarea" id="seller-motivation" name="motivation" rows="4"
                              maxlength="${MOTIVATION_MAX}" autofocus
                              aria-describedby="seller-counter seller-optional"
                              placeholder="Por ejemplo: ropa y juguetes de mis hijos, libros y algo de tecnología."></textarea>
                    <p class="field-hint" id="seller-optional">Es opcional, pero ayuda a que la revisión sea más rápida.</p>
                </div>

                <p class="field-error" data-error-for="form" aria-live="polite"></p>
            </form>`,
            actions: [
                { label: 'Ahora no', variant: 'ghost' },
                {
                    label: 'Enviar solicitud',
                    variant: 'primary',
                    action: (dialog) => submitSellerApplication(dialog),
                },
            ],
        });

        bindCounter(
            instance.element.querySelector('#seller-motivation'),
            instance.element.querySelector('#seller-counter'),
            MOTIVATION_MAX
        );
    }

    async function submitSellerApplication(dialog) {
        const form = dialog.element.querySelector('#seller-form');
        const slot = form.querySelector('[data-error-for="form"]');
        const motivation = form.elements.motivation.value.trim();

        try {
            const data = await api.applyAsSeller(motivation);
            applyUser(data.user || data);

            toast.success('Solicitud enviada. Te avisaremos en cuanto la revisemos.');
            return true;
        } catch (error) {
            const message = error.message || 'No se pudo enviar la solicitud.';
            slot.textContent = message;
            toast.error(message);
            return false;   // `false` mantiene el modal abierto
        }
    }

    /** Punto único de verdad: guarda el usuario y repinta todo lo que depende de él. */
    function applyUser(user) {
        state.user = user;
        store.set({ user });   // la cabecera del sitio se refresca sola
        renderIdentity();
        renderSeller();
        if (state.postsLoaded) renderPosts();
    }

    /* ----------------------------------------------------------------------
       Pestañas con anclas reales
       ---------------------------------------------------------------------- */

    function tabFromHash() {
        const hash = (global.location.hash || '').replace('#', '');
        return TABS.includes(hash) ? hash : 'datos';
    }

    function activateTab(name, options = {}) {
        const { focus = false, syncHash = true } = options;
        if (!TABS.includes(name)) return;

        activeTab = name;

        $$('.profile-tab').forEach((tab) => {
            const selected = tab.dataset.tab === name;
            tab.classList.toggle('is-active', selected);
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected && focus) tab.focus();
        });

        TABS.forEach((tabName) => {
            const panel = $(`#panel-${tabName}`);
            if (panel) panel.hidden = tabName !== name;
        });

        // Ningún elemento usa esos identificadores, así que escribir el ancla
        // no provoca saltos de scroll; solo deja una entrada en el historial.
        if (syncHash && tabFromHash() !== name) {
            global.location.hash = name;
        }

        if (name === 'pedidos') openPostsTab();
    }

    function bindTabs() {
        const list = $('#profile-tabs');

        list.addEventListener('click', (event) => {
            const tab = event.target.closest('.profile-tab');
            if (tab) activateTab(tab.dataset.tab);
        });

        // Flechas, Inicio y Fin, como pide el patrón «tablist».
        list.addEventListener('keydown', (event) => {
            const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
            if (!keys.includes(event.key)) return;

            event.preventDefault();
            const index = TABS.indexOf(activeTab);
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
            if (name !== activeTab) activateTab(name, { syncHash: false });
        });
    }

    /* ----------------------------------------------------------------------
       Pestaña «Mis datos»
       ---------------------------------------------------------------------- */

    const VALIDATORS = {
        username(value) {
            const name = value.trim();
            if (!name) return 'Escribe tu nombre.';
            if (name.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
            return '';
        },
        district(value) {
            return value ? '' : 'Elige tu distrito.';
        },
        phone(value) {
            if (!value.trim()) return '';
            return /^[+()\d\s-]{6,20}$/.test(value.trim())
                ? ''
                : 'Usa solo números, espacios, guiones y paréntesis (entre 6 y 20 caracteres).';
        },
        bio(value) {
            return value.length > BIO_MAX
                ? `La biografía no puede superar los ${BIO_MAX} caracteres.`
                : '';
        },
    };

    function showFieldError(form, name, message) {
        const input = form.elements[name];
        const slot = form.querySelector(`[data-error-for="${name}"]`);

        if (input) {
            input.classList.toggle('is-invalid', Boolean(message));
            input.setAttribute('aria-invalid', message ? 'true' : 'false');
        }
        if (slot) slot.textContent = message;
    }

    function validateProfileForm(form) {
        let valid = true;

        Object.keys(VALIDATORS).forEach((name) => {
            const message = VALIDATORS[name](form.elements[name].value);
            showFieldError(form, name, message);
            if (message) valid = false;
        });

        return valid;
    }

    /** Contador de caracteres compartido por la biografía y la motivación. */
    function bindCounter(field, counter, max) {
        if (!field || !counter) return;

        const paint = () => { counter.textContent = `${field.value.length}/${max}`; };
        field.addEventListener('input', paint);
        paint();
    }

    function fillProfileForm() {
        const form = $('#profile-form');
        const user = state.user;

        form.elements.district.innerHTML = optionsFrom(districtNames(), user.district || 'Cercado');
        form.elements.username.value = user.username || '';
        form.elements.email.value = user.email || '';
        form.elements.phone.value = user.phone || '';
        form.elements.bio.value = user.bio || '';

        $('#pf-bio-counter').textContent = `${form.elements.bio.value.length}/${BIO_MAX}`;
        Object.keys(VALIDATORS).forEach((name) => showFieldError(form, name, ''));
    }

    function bindProfileForm() {
        const form = $('#profile-form');

        // Validación en vivo: el error aparece y desaparece mientras se escribe.
        Object.keys(VALIDATORS).forEach((name) => {
            const input = form.elements[name];
            const check = () => showFieldError(form, name, VALIDATORS[name](input.value));
            input.addEventListener('input', check);
            input.addEventListener('blur', check);
        });

        bindCounter(form.elements.bio, $('#pf-bio-counter'), BIO_MAX);

        $('#profile-revert').addEventListener('click', () => {
            fillProfileForm();
            toast.info('Cambios descartados');
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!validateProfileForm(form)) {
                toast.warning('Revisa los campos marcados');
                return;
            }

            const button = $('#profile-save');
            button.classList.add('is-loading');
            button.disabled = true;

            try {
                const data = await api.updateProfile({
                    username: form.elements.username.value.trim(),
                    district: form.elements.district.value,
                    phone: form.elements.phone.value.trim(),
                    bio: form.elements.bio.value.trim(),
                });

                applyUser(data.user || data);
                toast.success('Perfil actualizado');
            } catch (error) {
                toast.error(error.message || 'No se pudo guardar tu perfil');
            } finally {
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        });
    }

    /* --- Preferencias ------------------------------------------------------ */

    function bindPreferences() {
        const input = $('#pref-theme');
        input.checked = theme.get() === 'dark';

        input.addEventListener('change', () => {
            theme.set(input.checked ? 'dark' : 'light');
            repaintHeaderTheme();
        });

        // Si el tema cambia desde el botón de la cabecera, el interruptor sigue.
        store.subscribe('theme', (value) => {
            input.checked = (value || theme.get()) === 'dark';
            repaintHeaderTheme();
        }, false);
    }

    /** La cabecera pinta su icono al pulsar; aquí hay que avisarla a mano. */
    function repaintHeaderTheme() {
        const button = document.getElementById('theme-toggle');
        const icons = global.DiscoveryShell && global.DiscoveryShell.ICON;
        if (!button || !icons) return;

        const dark = theme.get() === 'dark';
        button.innerHTML = dark ? icons.sun : icons.moon;
        button.setAttribute('aria-label', dark ? 'Activar tema claro' : 'Activar tema oscuro');
    }

    /* ----------------------------------------------------------------------
       Pestaña «Mis pedidos»
       ---------------------------------------------------------------------- */

    function loadPosts() {
        if (state.postsLoaded) return Promise.resolve();

        if (!postsRequest) {
            postsRequest = api.getMyRequests()
                .then((data) => {
                    state.posts = data.requests || [];
                    state.postsLoaded = true;
                })
                .finally(() => { postsRequest = null; });
        }

        return postsRequest;
    }

    async function openPostsTab() {
        const container = $('#posts-list');

        if (!state.postsLoaded) {
            container.setAttribute('aria-busy', 'true');
            container.innerHTML = skeletonRows(3);
        }

        try {
            await loadPosts();
            renderPosts();
            renderPostMetrics();
        } catch (error) {
            container.innerHTML = UI.emptyState({
                icon: '⚠️',
                title: 'No pudimos cargar tus publicaciones',
                message: error.message || 'Inténtalo de nuevo en unos segundos.',
            });
            toast.error(error.message || 'Error al cargar tus publicaciones');
        } finally {
            container.setAttribute('aria-busy', 'false');
        }
    }

    function skeletonRows(count) {
        const row = `
            <div class="profile-skeleton-row" aria-hidden="true">
                <div class="skeleton profile-skeleton-thumb"></div>
                <div class="profile-skeleton-lines">
                    <div class="skeleton skeleton-text w-70"></div>
                    <div class="skeleton skeleton-text w-50"></div>
                </div>
            </div>`;
        return Array.from({ length: count }, () => row).join('');
    }

    function computeSummary() {
        return {
            total: state.posts.length,
            approved: state.posts.filter((post) => post.status === 'approved').length,
            pending: state.posts.filter((post) => post.status === 'pending').length,
            rejected: state.posts.filter((post) => post.status === 'rejected').length,
        };
    }

    function renderCounts(summary) {
        const counts = { all: summary.total, ...summary };

        $$('#posts-filters [data-count]').forEach((node) => {
            node.textContent = format.number(counts[node.dataset.count] || 0);
        });

        const hint = $('#posts-summary');
        if (!summary.total) {
            hint.textContent = 'Todavía no has publicado nada en el foro.';
            return;
        }

        const parts = [`${format.number(summary.total)} ${format.plural(summary.total, 'publicación', 'pedidos')}`];
        if (summary.pending) parts.push(`${format.number(summary.pending)} en revisión`);
        if (summary.rejected) parts.push(`${format.number(summary.rejected)} ${format.plural(summary.rejected, 'rechazada', 'rechazadas')}`);
        hint.textContent = `${parts.join(' · ')}.`;
    }

    /** Fila compacta más, si toca, el motivo del rechazo. */
    function postBlock(post) {
        const actions = `
            <button class="btn btn-secondary btn-sm" type="button" data-action="edit-post"
                    data-id="${escapeAttr(post.id)}"
                    aria-label="Editar «${escapeAttr(post.title)}»">Editar</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="delete-post"
                    data-id="${escapeAttr(post.id)}"
                    aria-label="Eliminar «${escapeAttr(post.title)}»">Eliminar</button>`;

        const reason = post.status === 'rejected' && post.rejection_reason
            ? `
            <div class="profile-post-reason alert alert-danger">
                <span class="alert-icon" aria-hidden="true">⚠️</span>
                <span class="alert-content">
                    <strong class="alert-title">Motivo del rechazo</strong>
                    <span class="alert-body">${escapeHtml(post.rejection_reason)}</span>
                </span>
            </div>`
            : '';

        return `
        <div class="profile-post" data-id="${escapeAttr(post.id)}">
            ${UI.postRow(post, { showStatus: true, actions })}
            ${reason}
        </div>`;
    }

    /** Nadie tiene todavía ningún pedido: la invitación es la misma para todos. */
    function emptyRequests() {
        return UI.emptyState({
            icon: '🔎',
            title: 'Publica tu primer pedido',
            message: 'Di qué estás buscando y cuánto puedes pagar. Las tiendas de Arequipa te responden con lo que tienen.',
            action: { label: 'Pedir lo que busco', href: 'publicar.html' },
        });
    }

    function renderPosts() {
        const container = $('#posts-list');
        const summary = computeSummary();

        renderCounts(summary);

        if (!summary.total) {
            container.innerHTML = emptyRequests();
            return;
        }

        const visible = state.filter === 'all'
            ? state.posts
            : state.posts.filter((post) => post.status === state.filter);

        if (!visible.length) {
            container.innerHTML = UI.emptyState({
                icon: '🗂️',
                title: 'Nada con ese estado',
                message: 'Ninguna de tus publicaciones está en este momento en ese estado.',
            });
            return;
        }

        container.innerHTML = visible.map(postBlock).join('');
    }

    function bindPostsPanel() {
        $('#posts-filters').addEventListener('click', (event) => {
            const button = event.target.closest('[data-filter]');
            if (!button) return;

            state.filter = button.dataset.filter;

            $$('#posts-filters [data-filter]').forEach((item) => {
                const selected = item.dataset.filter === state.filter;
                item.classList.toggle('is-active', selected);
                item.setAttribute('aria-pressed', String(selected));
            });

            renderPosts();
        });

        $('#posts-list').addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button) return;

            const { action, id } = button.dataset;
            if (action === 'edit-post') openEditPost(id);
            if (action === 'delete-post') deletePost(id);
            if (action === 'apply-seller') openSellerModal();
        });
    }

    /* --- Editar publicación ------------------------------------------------ */

    function editFormMarkup(post) {
        const warning = post.status === 'approved'
            ? 'Esta publicación está visible en el foro. Al guardar los cambios volverá a revisión y dejará de verse hasta que el equipo la apruebe de nuevo.'
            : 'Al guardar, la publicación seguirá en revisión hasta que el equipo la apruebe.';

        return `
        <form class="profile-edit-form" id="edit-post-form" novalidate>
            <div class="alert alert-warning profile-edit-warning" role="note">
                <span class="alert-icon" aria-hidden="true">⏳</span>
                <span class="alert-content">
                    <strong class="alert-title">Editar devuelve la publicación a revisión</strong>
                    <span class="alert-body">${escapeHtml(warning)}</span>
                </span>
            </div>

            <div class="field">
                <label class="label" for="ep-title">Título <span class="required">*</span></label>
                <input class="input" id="ep-title" name="title" type="text" maxlength="90"
                       value="${escapeAttr(post.title)}" autofocus>
                <p class="field-error" data-error-for="title" aria-live="polite"></p>
            </div>

            <div class="field">
                <label class="label" for="ep-description">Descripción <span class="required">*</span></label>
                <textarea class="textarea" id="ep-description" name="description" rows="4"
                          maxlength="1200">${escapeHtml(post.description)}</textarea>
                <p class="field-error" data-error-for="description" aria-live="polite"></p>
            </div>

            <div class="profile-edit-grid">
                <div class="field">
                    <label class="label" for="ep-budget-min">Presupuesto desde (S/)</label>
                    <input class="input" id="ep-budget-min" name="budget_min" type="number" min="0" step="1"
                           inputmode="decimal" value="${escapeAttr(post.budget_min || '')}">
                    <p class="field-error" data-error-for="budget_min" aria-live="polite"></p>
                </div>

                <div class="field">
                    <label class="label" for="ep-budget-max">Presupuesto hasta (S/)</label>
                    <input class="input" id="ep-budget-max" name="budget_max" type="number" min="0" step="1"
                           inputmode="decimal" value="${escapeAttr(post.budget_max || '')}">
                    <p class="field-error" data-error-for="budget_max" aria-live="polite"></p>
                </div>

                <div class="field">
                    <label class="label" for="ep-condition">¿En qué estado lo aceptas?</label>
                    <select class="select" id="ep-condition" name="condition">
                        ${optionsFrom(CONDITIONS, post.condition)}
                    </select>
                </div>

                <div class="field">
                    <label class="label" for="ep-district">Distrito</label>
                    <select class="select" id="ep-district" name="district">
                        ${optionsFrom(districtNames(), post.district)}
                    </select>
                </div>
            </div>

            <p class="field-error" data-error-for="form" aria-live="polite"></p>
        </form>`;
    }

    function validateEditForm(form) {
        /* Un presupuesto vacío es «abierto a propuestas», no un error: hay
           cosas cuyo precio no se sabe hasta que alguien las ofrece. */
        const amount = (field) => (field.value.trim() === '' ? null : Number(field.value));

        const values = {
            title: form.elements.title.value.trim(),
            description: form.elements.description.value.trim(),
            budget_min: amount(form.elements.budget_min),
            budget_max: amount(form.elements.budget_max),
            condition: form.elements.condition.value,
            district: form.elements.district.value,
        };

        const negative = (n) => n !== null && (!Number.isFinite(n) || n < 0);

        const errors = {
            title: values.title.length < 4
                ? 'El título debe tener al menos 4 caracteres.'
                : '',
            description: values.description.length < 20
                ? 'Describe con al menos 20 caracteres qué estás buscando.'
                : '',
            budget_min: negative(values.budget_min)
                ? 'El presupuesto no puede ser negativo.'
                : '',
            budget_max: negative(values.budget_max)
                ? 'El presupuesto no puede ser negativo.'
                : (values.budget_min !== null && values.budget_max !== null
                    && values.budget_min > values.budget_max)
                    ? 'El mínimo no puede ser mayor que el máximo.'
                    : '',
        };

        let valid = true;
        Object.entries(errors).forEach(([name, message]) => {
            showFieldError(form, name, message);
            if (message) valid = false;
        });

        return valid ? values : null;
    }

    function openEditPost(id) {
        const post = state.posts.find((item) => item.id === id);
        if (!post) return;

        modal.open({
            title: 'Editar publicación',
            size: 'lg',
            content: editFormMarkup(post),
            actions: [
                { label: 'Cancelar', variant: 'ghost' },
                {
                    label: 'Guardar cambios',
                    variant: 'primary',
                    action: async (dialog) => {
                        const form = dialog.element.querySelector('#edit-post-form');
                        const values = validateEditForm(form);
                        if (!values) return false;   // `false` cancela el cierre

                        try {
                            const data = await api.updateRequest(post.id, values);
                            const updated = data.request || data;
                            const index = state.posts.findIndex((item) => item.id === post.id);
                            if (index !== -1) state.posts[index] = updated;

                            renderPosts();
                            renderPostMetrics();
                            toast.success('Publicación actualizada. Vuelve a estar en revisión.');
                            return true;
                        } catch (error) {
                            const message = error.message || 'No se pudo guardar la publicación.';
                            form.querySelector('[data-error-for="form"]').textContent = message;
                            toast.error(message);
                            return false;
                        }
                    },
                },
            ],
        });
    }

    /* --- Eliminar publicación ---------------------------------------------- */

    async function deletePost(id) {
        const post = state.posts.find((item) => item.id === id);
        if (!post) return;

        const confirmed = await modal.confirm({
            title: 'Eliminar publicación',
            message: `«${post.title}» desaparecerá del foro junto con sus comentarios. Esta acción no se puede deshacer.`,
            confirmLabel: 'Eliminar',
            cancelLabel: 'Cancelar',
            danger: true,
        });

        if (!confirmed) return;

        try {
            await api.deleteRequest(id);

            // Animación de salida antes de repintar: el cambio se entiende mejor.
            const block = $(`.profile-post[data-id="${id}"]`);
            if (block) {
                block.classList.add('is-removing');
                await new Promise((resolve) => setTimeout(resolve, 220));
            }

            state.posts = state.posts.filter((item) => item.id !== id);
            renderPosts();
            renderPostMetrics();
            toast.success('Publicación eliminada');
        } catch (error) {
            toast.error(error.message || 'No se pudo eliminar la publicación');
        }
    }

    /* ----------------------------------------------------------------------
       Guardados y sesión
       ---------------------------------------------------------------------- */

    function bindSavedMetric() {
        store.subscribe('saved', (list) => {
            if (!Array.isArray(list)) return;
            state.savedCount = list.length;
            renderSavedMetric();
        });

        // La cabecera suele rellenar el contador; si no lo hizo, lo pedimos aquí.
        setTimeout(() => {
            if (Array.isArray(store.get('saved'))) return;

            api.getSavedRequests()
                .then((data) => store.set({ saved: data.ids || [] }))
                .catch(() => { /* la métrica se queda en «—» */ });
        }, 1200);
    }

    function bindLogout() {
        $('#profile-logout').addEventListener('click', async () => {
            const confirmed = await modal.confirm({
                title: 'Cerrar sesión',
                message: '¿Seguro que quieres cerrar la sesión en este navegador?',
                confirmLabel: 'Cerrar sesión',
                cancelLabel: 'Seguir conectado',
                danger: true,
            });

            if (!confirmed) return;

            try {
                await api.logout();
            } finally {
                store.set({ user: null, saved: [], unreadMessages: 0, pendingModeration: 0 });
                toast.success('Sesión cerrada. ¡Hasta pronto!');
                setTimeout(() => { global.location.href = 'index.html'; }, 600);
            }
        });
    }

    /* ----------------------------------------------------------------------
       Arranque
       ---------------------------------------------------------------------- */

    function showGate() {
        $('#profile-boot').hidden = true;

        const gate = $('#profile-gate');
        gate.innerHTML = UI.loginGate({
            title: 'Tu perfil te está esperando',
            message: 'Inicia sesión para editar tus datos, seguir el estado de tus pedidos y solicitar tu cuenta de tienda.',
            icon: '🔐',
        });
        gate.hidden = false;
    }

    /** La cabecera resuelve la sesión en paralelo, así que no dependemos de ella. */
    async function resolveUser() {
        const cached = store.get('user');
        if (cached && cached.id) return cached;

        try {
            const session = await api.getCurrentUser();
            return session ? (session.user || session) : null;
        } catch (error) {
            return null;
        }
    }

    async function init() {
        await api.ready();

        const user = await resolveUser();
        if (!user || !user.id) {
            showGate();
            return;
        }

        state.user = user;
        store.set({ user });

        $('#profile-boot').hidden = true;
        $('#profile-content').hidden = false;

        renderIdentity();
        renderSeller();
        fillProfileForm();
        bindProfileForm();
        bindPreferences();
        bindSeller();
        bindPostsPanel();
        bindSavedMetric();
        bindLogout();
        bindTabs();

        activateTab(tabFromHash(), { syncHash: false });

        // Las métricas de la cabecera salen de las publicaciones: se piden en
        // segundo plano para que la pestaña ya las encuentre en memoria.
        setTimeout(() => {
            if (state.postsLoaded) return;
            loadPosts().then(renderPostMetrics).catch(() => { /* la pestaña mostrará el error */ });
        }, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
