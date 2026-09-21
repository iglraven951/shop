/**
 * DiscoveryShop · Componentes de presentación
 *
 * La pieza central es la publicación del foro: una tarjeta al estilo de una red
 * social, con cabecera de autor, contenido, imagen, resumen de reacciones y una
 * barra de acciones (me gusta, me interesa, comentar, guardar).
 *
 * Todo texto proveniente de datos pasa por `escapeHtml`: nunca se interpola
 * contenido sin escapar dentro de HTML.
 */
(function (global) {
    'use strict';

    const { escapeHtml, escapeAttr, format } = global.DS;

    /* ----------------------------------------------------------------------
       Iconos
       ---------------------------------------------------------------------- */

    const I = {
        heart: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17s-6.5-4-6.5-8.4A3.6 3.6 0 0 1 10 6.2a3.6 3.6 0 0 1 6.5 2.4C16.5 13 10 17 10 17Z"/></svg>',
        heartFill: '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M10 17s-6.5-4-6.5-8.4A3.6 3.6 0 0 1 10 6.2a3.6 3.6 0 0 1 6.5 2.4C16.5 13 10 17 10 17Z"/></svg>',
        hand: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V4.2a1.2 1.2 0 0 1 2.4 0V9"/><path d="M9.4 8.6V3.4a1.2 1.2 0 0 1 2.4 0v5.2"/><path d="M11.8 9V5.2a1.2 1.2 0 0 1 2.4 0V12a5 5 0 0 1-5 5h-.6a4.4 4.4 0 0 1-3.3-1.5L2.8 13a1.2 1.2 0 0 1 1.7-1.7L7 13.4"/></svg>',
        handFill: '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M14.2 5.2a1.2 1.2 0 0 0-2.4 0V3.4a1.2 1.2 0 0 0-2.4 0v.8a1.2 1.2 0 0 0-2.4 0V13.4l-2.5-2.1A1.2 1.2 0 0 0 2.8 13l2.7 2.5A4.4 4.4 0 0 0 8.8 17h.6a5 5 0 0 0 5-5V5.2Z"/></svg>',
        comment: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 11.5a2 2 0 0 1-2 2H7.5L4 16.5V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6.5Z"/></svg>',
        bookmark: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.8h10v14.4l-5-3.4-5 3.4V2.8Z"/></svg>',
        bookmarkFill: '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5 2.8h10v14.4l-5-3.4-5 3.4V2.8Z"/></svg>',
        pin: '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.5S11.5 8.9 11.5 5.9A4.5 4.5 0 0 0 2.5 5.9C2.5 8.9 7 12.5 7 12.5Z"/><circle cx="7" cy="5.8" r="1.6"/></svg>',
        check: '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7.2 2.6 2.6L11 4.4"/></svg>',
        more: '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><circle cx="5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/></svg>',
        eye: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/></svg>',
    };

    /* ----------------------------------------------------------------------
       Normalización
       ---------------------------------------------------------------------- */

    /**
     * Rellena los huecos que un backend real podría devolver como null, para
     * que la plantilla nunca falle en modo conectado.
     */
    function normalizePost(post) {
        return {
            ...post,
            author: post.author || { id: null, username: 'Usuario', district: 'Arequipa', verified: false },
            category: post.category || { id: null, name: 'Sin categoría', icon: '📦' },
            location: post.location || { district: 'Arequipa', city: 'Arequipa', country: 'Perú' },
            district: post.district || (post.location && post.location.district) || 'Arequipa',
            image_url: post.image_url || (post.images && post.images[0] && post.images[0].url) || '',
            fallback_url: post.fallback_url || '',
            likes_count: Number(post.likes_count) || 0,
            interested_count: Number(post.interested_count) || 0,
            comment_count: Number(post.comment_count) || 0,
            saves_count: Number(post.saves_count) || 0,
            views: Number(post.views) || 0,
        };
    }

    /**
     * Atributo de respaldo para una imagen.
     *
     * Las fotos del catálogo vienen de una red externa. Si alguna no carga,
     * sin esto quedaría un hueco roto; así se sustituye por el SVG generado,
     * que no necesita conexión. `onerror` se anula a sí mismo para que un
     * respaldo que también fallara no entre en bucle.
     */
    function imageFallback(post) {
        if (!post.fallback_url) return '';
        return ` onerror="this.onerror=null;this.src='${escapeAttr(post.fallback_url)}'"`;
    }

    /* ----------------------------------------------------------------------
       Piezas reutilizables
       ---------------------------------------------------------------------- */

    /** Insignia de verificación del vendedor. */
    function verifiedBadge(author) {
        if (!author.verified) return '';
        return `<span class="verified-badge" title="Vendedor verificado por el equipo"
                      aria-label="Vendedor verificado">${I.check}</span>`;
    }

    /** Etiqueta de estado de moderación. Solo se muestra al autor y al admin. */
    function statusBadge(status, reason) {
        switch (status) {
            case 'pending':
                return '<span class="badge badge-warning">⏳ En revisión</span>';
            case 'rejected':
                return `<span class="badge badge-danger" title="${escapeAttr(reason || '')}">✕ Rechazada</span>`;
            case 'approved':
                return '<span class="badge badge-success">✓ Publicada</span>';
            default:
                return '';
        }
    }

    /**
     * Cabecera de la publicación: quién la escribió, desde dónde y cuándo.
     */
    function postHeader(post, options) {
        const { showStatus = false, showMenu = false } = options;

        return `
        <header class="post-header">
            <a class="post-author" href="index.html?author_id=${escapeAttr(post.author.id)}">
                <span class="avatar">${escapeHtml(format.initials(post.author.username))}</span>
                <span class="post-author-info">
                    <span class="post-author-name">
                        ${escapeHtml(post.author.username)}${verifiedBadge(post.author)}
                    </span>
                    <span class="post-author-meta">
                        <span class="post-district">${I.pin}${escapeHtml(post.district)}</span>
                        <span aria-hidden="true">·</span>
                        <time datetime="${escapeAttr(post.created_at)}">${escapeHtml(format.relative(post.created_at))}</time>
                    </span>
                </span>
            </a>

            <div class="post-header-side">
                ${showStatus ? statusBadge(post.status, post.rejection_reason) : ''}
                ${showMenu ? `
                <button class="post-menu-btn" type="button" data-action="post-menu"
                        data-id="${escapeAttr(post.id)}"
                        aria-label="Opciones de la publicación">${I.more}</button>` : ''}
            </div>
        </header>`;
    }

    /**
     * Resumen de reacciones. Solo aparece si hay alguna: una fila vacía resta
     * más de lo que aporta.
     */
    function reactionSummary(post) {
        const parts = [];

        if (post.likes_count > 0) {
            parts.push(`
                <span class="reaction-count">
                    <span class="reaction-bubble" aria-hidden="true">❤️</span>
                    ${format.number(post.likes_count)}
                </span>`);
        }

        if (post.interested_count > 0) {
            parts.push(`
                <span class="reaction-count">
                    ${format.number(post.interested_count)}
                    ${format.plural(post.interested_count, 'interesado', 'interesados')}
                </span>`);
        }

        if (post.comment_count > 0) {
            parts.push(`
                <span class="reaction-count">
                    ${format.number(post.comment_count)}
                    ${format.plural(post.comment_count, 'comentario', 'comentarios')}
                </span>`);
        }

        if (!parts.length) return '';

        return `<div class="post-reactions">${parts.join('')}</div>`;
    }

    /** Barra de acciones del foro. */
    function actionBar(post) {
        return `
        <div class="post-actions" role="group" aria-label="Acciones de la publicación">
            <button class="post-action${post.liked ? ' is-active is-like' : ''}" type="button"
                    data-action="like" data-id="${escapeAttr(post.id)}"
                    aria-pressed="${!!post.liked}">
                <span class="post-action-icon">${post.liked ? I.heartFill : I.heart}</span>
                <span class="post-action-label">Me gusta</span>
            </button>

            <button class="post-action${post.interested_by_me ? ' is-active is-interest' : ''}" type="button"
                    data-action="interest" data-id="${escapeAttr(post.id)}"
                    aria-pressed="${!!post.interested_by_me}">
                <span class="post-action-icon">${post.interested_by_me ? I.handFill : I.hand}</span>
                <span class="post-action-label">Me interesa</span>
            </button>

            <button class="post-action" type="button"
                    data-action="comment" data-id="${escapeAttr(post.id)}">
                <span class="post-action-icon">${I.comment}</span>
                <span class="post-action-label">Comentar</span>
            </button>

            <button class="post-action${post.saved ? ' is-active is-save' : ''}" type="button"
                    data-action="save" data-id="${escapeAttr(post.id)}"
                    aria-pressed="${!!post.saved}">
                <span class="post-action-icon">${post.saved ? I.bookmarkFill : I.bookmark}</span>
                <span class="post-action-label">Guardar</span>
            </button>
        </div>`;
    }

    /* ----------------------------------------------------------------------
       Publicación completa
       ---------------------------------------------------------------------- */

    /**
     * Tarjeta de publicación del foro.
     * @param {object} raw
     * @param {{index?: number, showStatus?: boolean, showMenu?: boolean,
     *          compact?: boolean, showActions?: boolean}} [options]
     */
    function postCard(raw, options = {}) {
        const post = normalizePost(raw);
        const {
            index = 0,
            showStatus = false,
            showMenu = false,
            showActions = true,
        } = options;

        const href = `publicacion.html?id=${encodeURIComponent(post.id)}`;

        return `
        <article class="post-card" data-post-id="${escapeAttr(post.id)}"
                 style="animation-delay: ${Math.min(index * 55, 330)}ms">

            ${postHeader(post, { showStatus, showMenu })}

            <div class="post-body">
                <h2 class="post-title">
                    <a href="${escapeAttr(href)}">${escapeHtml(post.title)}</a>
                </h2>

                <p class="post-text">${escapeHtml(post.description)}</p>

                <div class="post-tags">
                    <span class="badge badge-brand">${escapeHtml(post.category.icon)} ${escapeHtml(post.category.name)}</span>
                    <span class="badge">${escapeHtml(post.condition)}</span>
                    <span class="post-price-tag">${escapeHtml(format.money(post.price))}</span>
                </div>
            </div>

            <a class="post-media" href="${escapeAttr(href)}"
               aria-label="Ver «${escapeAttr(post.title)}»">
                <img src="${escapeAttr(post.image_url)}" alt="${escapeAttr(post.title)}"
                     loading="lazy" decoding="async"${imageFallback(post)}>
            </a>

            <div class="post-footer">
                <div class="post-stats">
                    ${reactionSummary(post)}
                    <span class="post-views" title="Visitas">${I.eye}${format.number(post.views)}</span>
                </div>

                ${showActions ? actionBar(post) : ''}
            </div>

            ${post.status === 'rejected' && post.rejection_reason ? `
            <div class="post-rejection alert alert-danger">
                <span class="alert-icon" aria-hidden="true">⚠️</span>
                <span class="alert-content">
                    <strong class="alert-title">Publicación rechazada</strong>
                    <span class="alert-body">${escapeHtml(post.rejection_reason)}</span>
                </span>
            </div>` : ''}
        </article>`;
    }

    /** Silueta de carga con la misma forma que la publicación real. */
    function postSkeleton(count = 4) {
        const card = `
            <div class="post-card" aria-hidden="true">
                <div class="post-header">
                    <div class="post-author">
                        <div class="skeleton" style="width: 40px; height: 40px; border-radius: 50%;"></div>
                        <div style="flex: 1;">
                            <div class="skeleton skeleton-text w-50"></div>
                            <div class="skeleton skeleton-text w-30"></div>
                        </div>
                    </div>
                </div>
                <div class="post-body">
                    <div class="skeleton skeleton-text w-70" style="height: 1.2em;"></div>
                    <div class="skeleton skeleton-text w-90"></div>
                    <div class="skeleton skeleton-text w-50"></div>
                </div>
                <div class="skeleton" style="aspect-ratio: 3 / 2;"></div>
                <div class="post-footer">
                    <div class="skeleton skeleton-text w-30"></div>
                </div>
            </div>`;

        return Array.from({ length: count }, () => card).join('');
    }

    /** Fila compacta, para listas densas (panel de administración, perfil). */
    function postRow(raw, options = {}) {
        const post = normalizePost(raw);
        const { showStatus = true, actions = '' } = options;

        return `
        <article class="post-row" data-post-id="${escapeAttr(post.id)}">
            <img class="post-row-thumb" src="${escapeAttr(post.image_url)}"
                 alt="" loading="lazy"${imageFallback(post)}>

            <div class="post-row-body">
                <a class="post-row-title" href="publicacion.html?id=${escapeAttr(post.id)}">
                    ${escapeHtml(post.title)}
                </a>
                <p class="post-row-meta">
                    ${escapeHtml(post.author.username)}
                    <span aria-hidden="true">·</span>
                    ${escapeHtml(post.district)}
                    <span aria-hidden="true">·</span>
                    ${escapeHtml(format.relative(post.created_at))}
                </p>
                <p class="post-row-tags">
                    <span class="badge badge-brand">${escapeHtml(post.category.name)}</span>
                    <span class="badge">${escapeHtml(post.condition)}</span>
                    ${showStatus ? statusBadge(post.status, post.rejection_reason) : ''}
                </p>
            </div>

            <div class="post-row-side">
                <span class="post-row-price">${escapeHtml(format.money(post.price))}</span>
                ${actions ? `<div class="post-row-actions">${actions}</div>` : ''}
            </div>
        </article>`;
    }

    /** Comentario del foro. */
    function commentItem(comment, options = {}) {
        const { canDelete = false } = options;
        const author = comment.author || { username: 'Usuario' };

        return `
        <article class="comment" data-comment-id="${escapeAttr(comment.id)}">
            <span class="avatar avatar-sm">${escapeHtml(format.initials(author.username))}</span>
            <div class="comment-body">
                <div class="comment-bubble">
                    <span class="comment-author">
                        ${escapeHtml(author.username)}
                        ${author.role === 'admin' ? '<span class="badge badge-brand">Equipo</span>' : ''}
                    </span>
                    <p class="comment-text">${escapeHtml(comment.text)}</p>
                </div>
                <div class="comment-meta">
                    <time datetime="${escapeAttr(comment.created_at)}">${escapeHtml(format.relative(comment.created_at))}</time>
                    ${canDelete ? `
                    <button class="comment-delete" type="button"
                            data-action="delete-comment" data-id="${escapeAttr(comment.id)}">
                        Eliminar
                    </button>` : ''}
                </div>
            </div>
        </article>`;
    }

    /* ----------------------------------------------------------------------
       Estados y navegación
       ---------------------------------------------------------------------- */

    function emptyState({ icon = '🔍', title, message = '', action = null }) {
        return `
        <div class="empty-state">
            <div class="empty-icon" aria-hidden="true">${icon}</div>
            <h3 class="empty-title">${escapeHtml(title)}</h3>
            ${message ? `<p class="empty-message">${escapeHtml(message)}</p>` : ''}
            ${action ? (action.href
                ? `<a class="btn btn-primary" href="${escapeAttr(action.href)}">${escapeHtml(action.label)}</a>`
                : `<button class="btn btn-primary" type="button" data-action="${escapeAttr(action.onClick)}">${escapeHtml(action.label)}</button>`)
            : ''}
        </div>`;
    }

    /** Invitación a iniciar sesión, conservando la página de retorno. */
    function loginGate({ title = 'Necesitas una cuenta', message, icon = '🔐' } = {}) {
        const next = encodeURIComponent(
            global.location.pathname.split('/').pop() + global.location.search
        );

        return `
        <div class="empty-state">
            <div class="empty-icon" aria-hidden="true">${icon}</div>
            <h3 class="empty-title">${escapeHtml(title)}</h3>
            <p class="empty-message">${escapeHtml(message)}</p>
            <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; justify-content: center;">
                <a class="btn btn-primary" href="login.html?next=${next}">Iniciar sesión</a>
                <a class="btn btn-secondary" href="registro.html?next=${next}">Crear cuenta</a>
            </div>
        </div>`;
    }

    /** Paginación con elipsis. */
    function pagination({ page, total_pages: totalPages }) {
        if (!totalPages || totalPages <= 1) return '';

        const pages = [1];
        const from = Math.max(2, page - 1);
        const to = Math.min(totalPages - 1, page + 1);

        if (from > 2) pages.push('…');
        for (let i = from; i <= to; i += 1) pages.push(i);
        if (to < totalPages - 1) pages.push('…');
        if (totalPages > 1) pages.push(totalPages);

        const buttons = pages.map((value) => {
            if (value === '…') return '<span class="page-ellipsis" aria-hidden="true">…</span>';
            return `
                <button class="page-btn" type="button" data-page="${value}"
                        ${value === page ? 'aria-current="page"' : ''}
                        aria-label="Página ${value}">${value}</button>`;
        }).join('');

        return `
        <nav class="pagination" aria-label="Paginación de resultados">
            <button class="page-btn" type="button" data-page="${page - 1}"
                    ${page <= 1 ? 'disabled' : ''} aria-label="Página anterior">←</button>
            ${buttons}
            <button class="page-btn" type="button" data-page="${page + 1}"
                    ${page >= totalPages ? 'disabled' : ''} aria-label="Página siguiente">→</button>
        </nav>`;
    }

    /* ----------------------------------------------------------------------
       Acciones compartidas
       ---------------------------------------------------------------------- */

    /**
     * Conecta las acciones del foro de un contenedor mediante delegación,
     * de modo que sigue funcionando aunque las tarjetas se vuelvan a pintar.
     *
     * @param {HTMLElement} container
     * @param {{onSaveChange?: Function, onComment?: Function, onMenu?: Function}} [hooks]
     */
    function bindPostActions(container, hooks = {}) {
        if (!container || container.dataset.actionsBound === 'true') return;
        container.dataset.actionsBound = 'true';

        container.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-action]');
            if (!button || !container.contains(button)) return;

            const { action, id } = button.dataset;
            if (!['like', 'interest', 'save', 'comment', 'post-menu'].includes(action)) return;

            event.preventDefault();

            if (action === 'comment') {
                if (typeof hooks.onComment === 'function') {
                    hooks.onComment(id, button);
                } else {
                    global.location.href = `publicacion.html?id=${encodeURIComponent(id)}#comentarios`;
                }
                return;
            }

            if (action === 'post-menu') {
                if (typeof hooks.onMenu === 'function') hooks.onMenu(id, button);
                return;
            }

            if (!global.store.get('user')) {
                requireLogin(MESSAGES[action]);
                return;
            }

            await runReaction(action, id, button, hooks);
        });
    }

    const MESSAGES = {
        like: 'Inicia sesión para dejar tu corazón en las publicaciones.',
        interest: 'Inicia sesión para avisar al vendedor que te interesa su artículo.',
        save: 'Inicia sesión para guardar publicaciones y revisarlas después.',
    };

    /** Ejecuta la reacción y refleja el nuevo estado en el botón. */
    async function runReaction(action, id, button, hooks) {
        button.disabled = true;

        try {
            let result;
            let active;
            let icons;

            if (action === 'like') {
                result = await global.api.toggleLike(id);
                active = result.liked;
                icons = [I.heart, I.heartFill];
                button.classList.toggle('is-like', active);
            } else if (action === 'interest') {
                result = await global.api.toggleInterest(id);
                active = result.interested;
                icons = [I.hand, I.handFill];
                button.classList.toggle('is-interest', active);
                if (active) {
                    global.toast.success('Avisamos a quien publicó que te interesa');
                }
            } else {
                result = await global.api.toggleSave(id);
                active = result.saved;
                icons = [I.bookmark, I.bookmarkFill];
                button.classList.toggle('is-save', active);

                const saved = global.store.get('saved') || [];
                global.store.set({
                    saved: active
                        ? [...saved, id]
                        : saved.filter((x) => x !== id),
                });

                if (typeof hooks.onSaveChange === 'function') hooks.onSaveChange(id, active);
            }

            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
            button.querySelector('.post-action-icon').innerHTML = active ? icons[1] : icons[0];

            // Una animación breve confirma que la acción surtió efecto.
            if (active) {
                button.classList.add('just-activated');
                setTimeout(() => button.classList.remove('just-activated'), 420);
            }

            updateReactionSummary(button, result);
        } catch (error) {
            global.toast.error(error.message || 'No se pudo completar la acción');
        } finally {
            button.disabled = false;
        }
    }

    /** Repinta el resumen de reacciones de la tarjeta tras una interacción. */
    function updateReactionSummary(button, result) {
        const card = button.closest('.post-card');
        if (!card) return;

        const stats = card.querySelector('.post-stats');
        if (!stats) return;

        const postId = card.dataset.postId;
        const existing = stats.querySelector('.post-reactions');

        // Se reconstruye a partir de los contadores que devolvió el servidor,
        // combinados con los que ya estaban en la tarjeta.
        const current = {
            id: postId,
            likes_count: result.likes_count ?? readCount(card, 'likes'),
            interested_count: result.interested_count ?? readCount(card, 'interested'),
            comment_count: readCount(card, 'comments'),
        };

        card.dataset.likes = current.likes_count;
        card.dataset.interested = current.interested_count;

        const markup = reactionSummary(current);

        if (existing) {
            existing.outerHTML = markup || '';
        } else if (markup) {
            stats.insertAdjacentHTML('afterbegin', markup);
        }
    }

    function readCount(card, key) {
        return Number(card.dataset[key]) || 0;
    }

    /** Invita a iniciar sesión conservando la página de retorno. */
    function requireLogin(message) {
        global.modal.open({
            title: 'Necesitas una cuenta',
            size: 'sm',
            content: `<p style="color: var(--text-secondary); font-size: var(--text-sm);">${escapeHtml(message)}</p>`,
            actions: [
                { label: 'Ahora no', variant: 'ghost' },
                {
                    label: 'Iniciar sesión',
                    variant: 'primary',
                    action: () => {
                        const next = encodeURIComponent(
                            global.location.pathname.split('/').pop() + global.location.search
                        );
                        global.location.href = `login.html?next=${next}`;
                    },
                },
            ],
        });
    }

    global.UI = {
        postCard,
        postRow,
        postSkeleton,
        postHeader,
        commentItem,
        reactionSummary,
        statusBadge,
        verifiedBadge,
        normalizePost,
        emptyState,
        loginGate,
        pagination,
        bindPostActions,
        requireLogin,
        icons: I,
    };
})(window);
