/**
 * DiscoveryShop · Ficha de publicación
 *
 * Muestra una publicación del foro con su texto completo, la conversación de
 * comentarios, la tarjeta de quien publica y —lo más vistoso— un mapa real de
 * Leaflet centrado en el distrito de Arequipa donde está el artículo.
 *
 * El mapa es un extra, nunca un requisito: si Leaflet no llega (sin red, CDN
 * bloqueada) la ficha sigue completa y en su lugar aparece una tarjeta estática
 * con el distrito. La página jamás se queda en blanco.
 */
(function (global) {
    'use strict';

    const { $, escapeHtml, escapeAttr, format, url } = global.DS;
    const api = global.api;
    const UI = global.UI;
    const store = global.store;
    const toast = global.toast;
    const modal = global.modal;

    /** Límite de un comentario, el mismo que aplica el servidor. */
    const COMMENT_MAX = 600;
    /** A partir de aquí el contador avisa de que queda poco margen. */
    const COMMENT_WARN = 540;
    /** Alto máximo del compositor al crecer, en píxeles (coincide con el CSS). */
    const COMPOSER_MAX_HEIGHT = 160;
    /** Radio del círculo de privacidad alrededor del marcador, en metros. */
    const PRIVACY_RADIUS = 800;
    /** Zoom con el que se abre el mapa: suficiente para reconocer el distrito. */
    const MAP_ZOOM = 14;

    const state = {
        post: null,
        comments: [],
        user: null,
        map: null,
    };

    /* ======================================================================
       Utilidades
       ====================================================================== */

    /** Lee un token de color del tema actual; devuelve '' si no existe. */
    function readToken(name) {
        try {
            return getComputedStyle(document.documentElement)
                .getPropertyValue(name)
                .trim();
        } catch (error) {
            return '';
        }
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /**
     * Ejecuta el callback la primera vez que el elemento entra en pantalla.
     * Sin IntersectionObserver se ejecuta de inmediato: mejor un mapa de más
     * que una tarjeta vacía.
     */
    function whenVisible(element, callback) {
        if (typeof global.IntersectionObserver === 'undefined') {
            callback();
            return;
        }

        const observer = new global.IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                observer.disconnect();
                callback();
            });
        }, { rootMargin: '200px' });

        observer.observe(element);
    }

    /* ======================================================================
       Estados de error
       ====================================================================== */

    /** Oculta la carga y muestra un estado vacío con salida hacia el feed. */
    function showFatal({ icon = '🔍', title, message }) {
        const boot = $('#post-boot');
        const detail = $('#post-detail');
        const error = $('#post-error');

        if (boot) {
            boot.hidden = true;
            boot.setAttribute('aria-busy', 'false');
        }
        if (detail) detail.hidden = true;

        if (!error) return;

        error.hidden = false;
        error.innerHTML = UI.emptyState({
            icon,
            title,
            message,
            action: { label: 'Volver al foro', href: 'index.html' },
        });
    }

    /* ======================================================================
       Migas de pan
       ====================================================================== */

    function renderBreadcrumb(post) {
        const nav = $('#breadcrumb');
        if (!nav) return;

        const categoryHref = url.build('index.html', { category: post.category.id });

        nav.innerHTML = `
            <ol class="breadcrumb-list">
                <li class="breadcrumb-item"><a href="index.html">Inicio</a></li>
                <li class="breadcrumb-item">
                    <a href="${escapeAttr(categoryHref)}">${escapeHtml(post.category.name)}</a>
                </li>
                <li class="breadcrumb-item breadcrumb-current" aria-current="page">
                    <span class="truncate">${escapeHtml(post.title)}</span>
                </li>
            </ol>`;
    }

    /* ======================================================================
       La publicación
       ====================================================================== */

    /**
     * Barra de acciones del foro. Reproduce el marcado de `UI.postCard` para
     * que `UI.bindPostActions` la gestione igual que en el feed.
     */
    function actionBarMarkup(post) {
        const I = UI.icons;
        const id = escapeAttr(post.id);

        return `
        <div class="post-actions" role="group" aria-label="Acciones de la publicación">
            <button class="post-action${post.liked ? ' is-active is-like' : ''}" type="button"
                    data-action="like" data-id="${id}" aria-pressed="${!!post.liked}">
                <span class="post-action-icon">${post.liked ? I.heartFill : I.heart}</span>
                <span class="post-action-label">Me gusta</span>
            </button>

            <button class="post-action${post.interested_by_me ? ' is-active is-interest' : ''}" type="button"
                    data-action="interest" data-id="${id}" aria-pressed="${!!post.interested_by_me}">
                <span class="post-action-icon">${post.interested_by_me ? I.handFill : I.hand}</span>
                <span class="post-action-label">Me interesa</span>
            </button>

            <button class="post-action" type="button" data-action="comment" data-id="${id}">
                <span class="post-action-icon">${I.comment}</span>
                <span class="post-action-label">Comentar</span>
            </button>

            <button class="post-action${post.saved ? ' is-active is-save' : ''}" type="button"
                    data-action="save" data-id="${id}" aria-pressed="${!!post.saved}">
                <span class="post-action-icon">${post.saved ? I.bookmarkFill : I.bookmark}</span>
                <span class="post-action-label">Guardar</span>
            </button>

            <button class="post-action" type="button" data-action="share" data-id="${id}">
                <span class="post-action-icon">${I.share}</span>
                <span class="post-action-label">Compartir</span>
            </button>
        </div>`;
    }

    /**
     * La publicación en detalle: mismas clases que la tarjeta del feed, pero
     * con título principal, texto íntegro e imagen ampliable.
     */
    function articleMarkup(post) {
        // Solo el autor y el administrador ven una publicación sin aprobar,
        // así que la etiqueta de estado es información útil, no un adorno.
        const showStatus = Boolean(post.is_mine) || post.status !== 'approved';

        return `
        <article class="post-card post-detail" data-post-id="${escapeAttr(post.id)}"
                 data-likes="${escapeAttr(post.likes_count)}"
                 data-interested="${escapeAttr(post.interested_count)}"
                 data-comments="${escapeAttr(post.comment_count)}">

            ${UI.postHeader(post, { showStatus, showMenu: false })}

            <div class="post-body">
                <h1 class="post-title post-detail-title">${escapeHtml(post.title)}</h1>

                <p class="post-text">${escapeHtml(post.description)}</p>

                <div class="post-tags">
                    <span class="badge badge-brand">${escapeHtml(post.category.icon)} ${escapeHtml(post.category.name)}</span>
                    <span class="badge">${escapeHtml(post.condition)}</span>
                    <span class="post-price-tag">${escapeHtml(format.money(post.price))}</span>
                </div>
            </div>

            <button class="post-media post-detail-media" type="button"
                    aria-label="Ampliar la imagen de «${escapeAttr(post.title)}»">
                <img src="${escapeAttr(post.image_url)}" alt="${escapeAttr(post.title)}" decoding="async">
            </button>

            <div class="post-footer">
                <div class="post-stats">
                    ${UI.reactionSummary(post)}
                    <span class="post-views" title="Visitas">${UI.icons.eye}${format.number(post.views)}</span>
                </div>

                ${actionBarMarkup(post)}
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

    function renderArticle(post) {
        const container = $('#post-article');
        if (!container) return;

        container.innerHTML = articleMarkup(post);

        // La imagen se amplía en un visor en lugar de navegar a ninguna parte.
        const media = container.querySelector('.post-detail-media');
        if (media) {
            media.addEventListener('click', () => {
                modal.lightbox(post.image_url, post.title);
            });
        }

        // Me gusta / me interesa / guardar / comentar, con su aviso de sesión.
        UI.bindPostActions(container, {
            onComment: () => focusComposer(),
        });
    }

    /* ======================================================================
       Ficha de datos
       ====================================================================== */

    function renderFacts(post) {
        const list = $('#post-facts');
        if (!list) return;

        const rows = [
            ['Categoría', `${post.category.icon} ${post.category.name}`],
            ['Estado del artículo', post.condition],
            ['Distrito', `${post.district}, Arequipa`],
            ['Precio', format.money(post.price)],
            ['Visitas', format.number(post.views)],
            ['Publicado', format.relative(post.created_at)],
        ];

        list.innerHTML = rows.map(([label, value]) => `
            <div class="post-detail-row">
                <dt class="post-detail-term">${escapeHtml(label)}</dt>
                <dd class="post-detail-desc">${escapeHtml(value)}</dd>
            </div>`).join('');
    }

    /* ======================================================================
       Comentarios
       ====================================================================== */

    /** Puedes borrar tu comentario, los de tu publicación y, si eres admin, todos. */
    function canDeleteComment(comment) {
        if (!state.user) return false;
        if (state.user.role === 'admin') return true;
        if (state.post && state.post.is_mine) return true;
        return Boolean(comment.author && comment.author.id === state.user.id);
    }

    function renderComments() {
        const list = $('#comment-list');
        if (!list) return;

        if (!state.comments.length) {
            list.innerHTML = UI.emptyState({
                icon: '💬',
                title: 'Todavía no hay comentarios',
                message: 'Sé la primera persona en preguntar.',
            });
            return;
        }

        list.innerHTML = state.comments
            .map((comment) => UI.commentItem(comment, { canDelete: canDeleteComment(comment) }))
            .join('');

        // Los comentarios pintados de forma optimista se ven atenuados hasta
        // que el servidor los confirma.
        state.comments.filter((comment) => comment.pending).forEach((comment) => {
            const node = list.querySelector(`[data-comment-id="${comment.id}"]`);
            if (node) node.classList.add('is-pending');
        });
    }

    /** Refleja el nuevo número de comentarios en el título y en la publicación. */
    function syncCommentCount(count) {
        // `null` también debe caer al recuento local: `Number(null)` daría 0 y
        // borraría el contador en cuanto el servidor no lo devolviera.
        const total = count === null || count === undefined ? NaN : Number(count);
        const value = Number.isFinite(total) ? total : state.comments.length;

        state.post.comment_count = value;

        const counter = $('#comment-count');
        if (counter) counter.textContent = format.number(value);

        const article = $('#post-article .post-card');
        if (!article) return;

        article.dataset.comments = String(value);

        const stats = article.querySelector('.post-stats');
        if (!stats) return;

        const markup = UI.reactionSummary({
            likes_count: Number(article.dataset.likes) || 0,
            interested_count: Number(article.dataset.interested) || 0,
            comment_count: value,
        });

        const existing = stats.querySelector('.post-reactions');
        if (existing) {
            existing.outerHTML = markup || '';
        } else if (markup) {
            stats.insertAdjacentHTML('afterbegin', markup);
        }
    }

    /** Compositor con sesión, o invitación a crear cuenta sin ella. */
    function renderComposer() {
        const slot = $('#comment-composer-slot');
        if (!slot) return;

        if (!state.user) {
            slot.innerHTML = UI.loginGate({
                icon: '💬',
                title: 'Únete a la conversación',
                message: 'Inicia sesión para preguntar por el artículo o dejar un comentario.',
            });
            return;
        }

        slot.innerHTML = `
        <form class="comment-composer" id="comment-form" novalidate>
            <span class="avatar avatar-sm" aria-hidden="true">${escapeHtml(format.initials(state.user.username))}</span>

            <div class="comment-composer-field">
                <label class="sr-only" for="comment-text">Escribe un comentario</label>
                <textarea class="textarea" id="comment-text" name="text" rows="1"
                          placeholder="Pregunta por el estado, la zona o el precio…"
                          aria-describedby="comment-counter comment-hint"></textarea>

                <div class="comment-composer-footer">
                    <span class="comment-counter" id="comment-counter" aria-live="polite">0 / ${COMMENT_MAX}</span>
                    <button class="btn btn-primary btn-sm" type="submit" id="comment-submit" disabled>
                        Comentar
                    </button>
                </div>

                <p class="post-detail-hint" id="comment-hint">
                    Pulsa Intro para enviar · Mayúsculas + Intro para un salto de línea
                </p>
            </div>
        </form>`;

        bindComposer();
    }

    function bindComposer() {
        const form = $('#comment-form');
        const field = $('#comment-text');
        const counter = $('#comment-counter');
        const submit = $('#comment-submit');

        if (!form || !field || !counter || !submit) return;

        const refresh = () => {
            const length = field.value.trim().length;

            counter.textContent = `${format.number(length)} / ${COMMENT_MAX}`;
            counter.classList.toggle('is-warning', length >= COMMENT_WARN && length <= COMMENT_MAX);
            counter.classList.toggle('is-error', length > COMMENT_MAX);

            submit.disabled = length === 0 || length > COMMENT_MAX;

            // El campo crece con el texto hasta el tope que marca la hoja de estilos.
            field.style.height = 'auto';
            field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
        };

        field.addEventListener('input', refresh);

        // Intro envía; Mayúsculas + Intro escribe un salto de línea.
        field.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            submitComment();
        });

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            submitComment();
        });

        refresh();
    }

    /** Lleva el foco al compositor (o a la invitación de sesión). */
    function focusComposer() {
        const field = $('#comment-text');
        const target = field || $('#comment-composer-slot');
        if (!target) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (field) field.focus({ preventScroll: true });
    }

    async function submitComment() {
        const field = $('#comment-text');
        const submit = $('#comment-submit');
        if (!field || !state.post) return;

        // La sesión pudo cerrarse en otra pestaña mientras se escribía.
        if (!state.user) {
            UI.requireLogin('Inicia sesión para dejar tu comentario en esta publicación.');
            return;
        }

        const text = field.value.trim();

        if (!text) {
            toast.warning('Escribe algo antes de comentar.');
            return;
        }

        if (text.length > COMMENT_MAX) {
            toast.error(`El comentario no puede superar los ${COMMENT_MAX} caracteres.`);
            return;
        }

        // Pintado optimista: el comentario aparece al instante y se confirma
        // (o se retira) cuando responde el servidor.
        const temporaryId = `tmp-${Date.now()}`;
        const optimistic = {
            id: temporaryId,
            post_id: state.post.id,
            author: {
                id: state.user.id,
                username: state.user.username,
                role: state.user.role,
            },
            text,
            created_at: new Date().toISOString(),
            pending: true,
        };

        state.comments.push(optimistic);
        renderComments();
        syncCommentCount(state.comments.length);

        field.value = '';
        field.dispatchEvent(new Event('input'));
        if (submit) submit.disabled = true;

        try {
            const result = await api.createComment(state.post.id, text);
            const index = state.comments.findIndex((comment) => comment.id === temporaryId);

            if (index !== -1) {
                state.comments[index] = result.comment;
            }

            renderComments();
            syncCommentCount(result.comment_count);
        } catch (error) {
            // Se revierte y se devuelve el texto: escribirlo costó esfuerzo.
            state.comments = state.comments.filter((comment) => comment.id !== temporaryId);
            renderComments();
            syncCommentCount(state.comments.length);

            field.value = text;
            field.dispatchEvent(new Event('input'));

            toast.error(error.message || 'No se pudo publicar tu comentario.');
        }
    }

    async function removeComment(commentId) {
        const confirmed = await modal.confirm({
            title: 'Eliminar comentario',
            message: 'El comentario desaparecerá para todos. Esta acción no se puede deshacer.',
            confirmLabel: 'Eliminar',
            cancelLabel: 'Cancelar',
            danger: true,
        });

        if (!confirmed) return;

        const list = $('#comment-list');
        const node = list ? list.querySelector(`[data-comment-id="${CSS.escape(commentId)}"]`) : null;

        try {
            const result = await api.deleteComment(state.post.id, commentId);

            if (node) {
                node.classList.add('is-leaving');
                await wait(220);
            }

            state.comments = state.comments.filter((comment) => comment.id !== commentId);
            renderComments();
            syncCommentCount(result.comment_count);
            toast.success('Comentario eliminado');
        } catch (error) {
            if (node) node.classList.remove('is-leaving');
            toast.error(error.message || 'No se pudo eliminar el comentario.');
        }
    }

    function bindCommentList() {
        const list = $('#comment-list');
        if (!list) return;

        list.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action="delete-comment"]');
            if (!button || !list.contains(button)) return;

            event.preventDefault();
            removeComment(button.dataset.id);
        });
    }

    async function loadComments(post) {
        // La publicación ya trae sus comentarios; la petición solo los refresca.
        state.comments = Array.isArray(post.comments) ? post.comments.slice() : [];
        renderComments();
        syncCommentCount(state.comments.length);

        try {
            const result = await api.getComments(post.id);
            state.comments = Array.isArray(result.comments) ? result.comments : state.comments;
            renderComments();
            syncCommentCount(result.total);
        } catch (error) {
            // Los comentarios que venían con la publicación siguen en pantalla:
            // no hace falta molestar con un aviso.
        }
    }

    /* ======================================================================
       Tarjeta de quien publica
       ====================================================================== */

    function ratingMarkup(rating) {
        const value = Number(rating);
        if (!Number.isFinite(value) || value <= 0) return '';

        const fill = Math.max(0, Math.min(100, (value / 5) * 100));

        return `
        <span class="rating" title="Calificación de ${escapeAttr(value.toFixed(1))} sobre 5">
            <span class="rating-stars" data-stars="★★★★★" style="--fill: ${fill.toFixed(1)}%;"
                  aria-hidden="true">★★★★★</span>
            <span class="rating-value">${escapeHtml(value.toFixed(1))}</span>
            <span class="rating-count">de 5</span>
        </span>`;
    }

    function renderSeller(post) {
        const card = $('#seller-card');
        if (!card) return;

        const author = post.author;
        const authorHref = url.build('index.html', { author_id: author.id });

        card.innerHTML = `
            <h2 class="sr-only" id="seller-card-title">Quién publica</h2>

            <div class="seller-card-head">
                <span class="avatar avatar-lg" aria-hidden="true">${escapeHtml(format.initials(author.username))}</span>
                <div class="seller-card-identity">
                    <p class="seller-card-name">
                        <span class="truncate">${escapeHtml(author.username)}</span>
                        ${UI.verifiedBadge(author)}
                    </p>
                    <p class="seller-card-district">
                        ${UI.icons.pin}<span class="truncate">${escapeHtml(post.district)}, Arequipa</span>
                    </p>
                    ${ratingMarkup(author.rating)}
                </div>
            </div>

            <dl class="seller-card-stats" id="seller-stats">
                <div class="seller-card-stat">
                    <dt class="seller-card-stat-label">Publicaciones</dt>
                    <dd class="seller-card-stat-value" data-stat="posts">—</dd>
                </div>
                <div class="seller-card-stat">
                    <dt class="seller-card-stat-label" data-stat="since-label">Miembro desde</dt>
                    <dd class="seller-card-stat-value" data-stat="since">—</dd>
                </div>
            </dl>

            <div class="seller-card-actions">
                ${post.is_mine ? `
                <p class="seller-card-own">Esta publicación es tuya. Responde los comentarios para resolver dudas.</p>
                ` : `
                <button class="btn btn-primary btn-block" type="button" id="seller-message">
                    Enviar mensaje
                </button>`}
                <a class="btn btn-secondary btn-block" href="${escapeAttr(authorHref)}">
                    Ver sus publicaciones
                </a>
            </div>`;

        const messageButton = $('#seller-message');
        if (messageButton) {
            messageButton.addEventListener('click', () => openConversation(messageButton));
        }
    }

    /** Abre (o recupera) la conversación sobre esta publicación. */
    async function openConversation(button) {
        if (!state.user) {
            UI.requireLogin('Inicia sesión para escribirle a quien publica el artículo.');
            return;
        }

        button.disabled = true;
        button.classList.add('is-loading');

        try {
            const result = await api.openConversation(state.post.id);
            global.location.href = url.build('mensajes.html', { c: result.conversation.id });
        } catch (error) {
            toast.error(error.message || 'No se pudo abrir la conversación.');
            button.disabled = false;
            button.classList.remove('is-loading');
        }
    }

    /**
     * Completa la tarjeta con datos que no viajan dentro de la publicación:
     * cuántas publicaciones tiene quien vende y desde cuándo está en el foro.
     */
    async function loadSellerStats(post) {
        const stats = $('#seller-stats');
        if (!stats) return;

        const postsCell = stats.querySelector('[data-stat="posts"]');
        const sinceCell = stats.querySelector('[data-stat="since"]');
        const sinceLabel = stats.querySelector('[data-stat="since-label"]');

        // La fecha de alta real solo la conocemos si el servidor la envía o si
        // la publicación es nuestra; si no, decimos desde cuándo publica.
        const accountDate = post.author.created_at
            || (post.is_mine && state.user ? state.user.created_at : null);

        try {
            const result = await api.getPosts({ author_id: post.author.id, per_page: 48 });
            const total = result.pagination ? result.pagination.total : result.posts.length;

            if (postsCell) {
                postsCell.textContent = `${format.number(total)} ${format.plural(total, 'artículo', 'artículos')}`;
            }

            if (accountDate) {
                if (sinceCell) sinceCell.textContent = format.date(accountDate);
                return;
            }

            const oldest = result.posts.reduce((earliest, item) => {
                const time = new Date(item.created_at).getTime();
                return !earliest || time < earliest ? time : earliest;
            }, 0);

            if (oldest) {
                if (sinceLabel) sinceLabel.textContent = 'Publica desde';
                if (sinceCell) sinceCell.textContent = format.date(new Date(oldest).toISOString());
            } else if (sinceCell) {
                sinceCell.textContent = 'Sin datos';
            }
        } catch (error) {
            if (postsCell) postsCell.textContent = 'Sin datos';
            if (sinceCell) sinceCell.textContent = 'Sin datos';
        }
    }

    /* ======================================================================
       Publicaciones relacionadas
       ====================================================================== */

    async function loadRelated(post) {
        const section = $('#related-section');
        const list = $('#related-list');
        if (!section || !list) return;

        try {
            const result = await api.getPosts({ category: post.category.id, per_page: 4 });
            const related = (result.posts || [])
                .filter((item) => item.id !== post.id)
                .slice(0, 3);

            if (!related.length) return;

            list.innerHTML = related
                .map((item) => UI.postRow(item, { showStatus: false }))
                .join('');

            section.hidden = false;
        } catch (error) {
            // Las relacionadas son un extra: si fallan, la sección no aparece.
        }
    }

    /* ======================================================================
       Mapa del distrito
       ====================================================================== */

    /** Coordenadas del artículo, con respaldo por distrito y por ciudad. */
    function resolveLocation(post) {
        const location = post.location || {};

        if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
            return { lat: location.lat, lng: location.lng };
        }

        const seed = global.DiscoverySeed;
        if (!seed) return null;

        const district = seed.districtByName(post.district);
        if (district && Number.isFinite(district.lat)) {
            return { lat: district.lat, lng: district.lng };
        }

        const center = seed.AREQUIPA_CENTER;
        return center ? { lat: center.lat, lng: center.lng } : null;
    }

    /** Tarjeta estática cuando no hay mapa interactivo disponible. */
    function renderMapFallback(post) {
        const container = $('#post-map');
        if (!container) return;

        container.classList.add('post-map-is-static');
        container.innerHTML = `
            <div class="post-map-fallback">
                <span class="post-map-fallback-icon" aria-hidden="true">📍</span>
                <p class="post-map-fallback-title">${escapeHtml(post.district)}, Arequipa</p>
                <p class="post-map-fallback-text">
                    No se pudo cargar el mapa interactivo. Puedes ver la zona en el mapa de vendedores.
                </p>
                <a class="btn btn-secondary btn-sm"
                   href="${escapeAttr(url.build('mapa.html', { district: post.district }))}">
                    Abrir el mapa
                </a>
            </div>`;
    }

    /** Globo informativo del marcador. */
    function popupMarkup(post) {
        return `
            <div class="post-map-popup">
                <p class="post-map-popup-district">${escapeHtml(post.district)}, Arequipa</p>
                <p class="post-map-popup-title">${escapeHtml(post.title)}</p>
                <p class="post-map-popup-price">${escapeHtml(format.money(post.price))}</p>
            </div>`;
    }

    function createMap(post) {
        const container = $('#post-map');
        const coords = resolveLocation(post);
        if (!container || !coords) {
            renderMapFallback(post);
            return;
        }

        const L = global.L;

        try {
            const map = L.map(container, {
                // Con la rueda activa, desplazar la página sobre el mapa haría
                // zoom sin querer. Se habilita solo tras hacer clic en él.
                scrollWheelZoom: false,
                zoomControl: true,
            }).setView([coords.lat, coords.lng], MAP_ZOOM);

            map.on('click', () => map.scrollWheelZoom.enable());
            map.on('mouseout', () => map.scrollWheelZoom.disable());

            // La atribución de OpenStreetMap es obligatoria por licencia.
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(map);

            // Círculo de privacidad: deja claro que la posición es aproximada.
            const brand = readToken('--brand');
            const circleOptions = {
                radius: PRIVACY_RADIUS,
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.12,
            };
            if (brand) {
                circleOptions.color = brand;
                circleOptions.fillColor = brand;
            }
            L.circle([coords.lat, coords.lng], circleOptions).addTo(map);

            // Marcador propio: evita depender de las imágenes del CDN.
            const marker = L.marker([coords.lat, coords.lng], {
                title: post.title,
                keyboard: true,
                alt: `Ubicación aproximada en ${post.district}`,
                icon: L.divIcon({
                    className: 'post-map-pin',
                    html: '<span class="post-map-pin-dot"></span>',
                    iconSize: [26, 26],
                    iconAnchor: [13, 13],
                    popupAnchor: [0, -14],
                }),
            }).addTo(map);

            marker.bindPopup(popupMarkup(post)).openPopup();

            state.map = map;

            // El contenedor estaba oculto hasta hace un instante: sin esto,
            // Leaflet calcularía un tamaño equivocado y dejaría teselas grises.
            global.requestAnimationFrame(() => map.invalidateSize());
            global.addEventListener('resize', global.DS.debounce(() => map.invalidateSize(), 200));
        } catch (error) {
            renderMapFallback(post);
        }
    }

    /**
     * Monta el mapa en cuanto es visible. Si Leaflet aún no llegó espera al
     * evento `load`; si tampoco está entonces, degrada a la tarjeta estática.
     */
    function mountMap(post) {
        const container = $('#post-map');
        const link = $('#post-map-link');
        const districtLabel = $('#post-map-district');

        if (districtLabel) {
            districtLabel.textContent = `${post.district}, Arequipa`;
        }

        if (link) {
            link.href = url.build('mapa.html', { district: post.district });
        }

        if (!container) return;

        const start = () => {
            if (typeof global.L !== 'undefined') {
                createMap(post);
                return;
            }

            if (document.readyState !== 'complete') {
                global.addEventListener('load', start, { once: true });
                return;
            }

            renderMapFallback(post);
        };

        whenVisible(container, start);
    }

    /* ======================================================================
       Metadatos de la página
       ====================================================================== */

    function updateMetadata(post) {
        document.title = `${post.title} · DiscoveryShop`;

        const meta = document.querySelector('meta[name="description"]');
        if (!meta) return;

        const summary = `${post.title} · ${post.condition} · ${format.money(post.price)} `
            + `en ${post.district}, Arequipa. ${post.description}`;

        meta.setAttribute(
            'content',
            summary.length > 158 ? `${summary.slice(0, 157).trimEnd()}…` : summary
        );
    }

    /* ======================================================================
       Arranque
       ====================================================================== */

    function revealDetail() {
        const boot = $('#post-boot');
        const detail = $('#post-detail');
        const error = $('#post-error');

        if (boot) {
            boot.hidden = true;
            boot.setAttribute('aria-busy', 'false');
        }
        if (error) error.hidden = true;
        if (detail) detail.hidden = false;
    }

    /** Resuelve la sesión sin depender del orden en que arranque la cabecera. */
    async function resolveUser() {
        const cached = store.get('user');
        if (cached) return cached;

        try {
            const data = await api.getCurrentUser();
            return data && data.user ? data.user : null;
        } catch (error) {
            return null;
        }
    }

    async function init() {
        await api.ready();

        const id = url.param('id');

        if (!id) {
            showFatal({
                icon: '🧭',
                title: 'No sabemos qué publicación mostrar',
                message: 'El enlace no incluye ninguna publicación. Vuelve al foro y elige una.',
            });
            return;
        }

        state.user = await resolveUser();

        let post;
        try {
            const data = await api.getPost(id);
            post = UI.normalizePost(data.post);
        } catch (error) {
            const missing = error.status === 404;

            showFatal({
                icon: missing ? '🔍' : '⚠️',
                title: missing ? 'No encontramos esta publicación' : 'No se pudo cargar la publicación',
                message: missing
                    ? 'Esta publicación no está disponible o aún está en revisión.'
                    : (error.message || 'Inténtalo de nuevo en unos instantes.'),
            });
            return;
        }

        state.post = post;

        updateMetadata(post);
        renderBreadcrumb(post);
        renderArticle(post);
        renderFacts(post);
        renderComposer();
        bindCommentList();
        renderSeller(post);
        revealDetail();

        // El mapa se monta con la ficha ya visible: Leaflet necesita que su
        // contenedor tenga tamaño real para calcular las teselas.
        mountMap(post);

        // Lo accesorio se carga después de que la ficha ya esté en pantalla.
        loadComments(post);
        loadSellerStats(post);
        loadRelated(post);

        // Si la sesión se resuelve más tarde (o se cierra), el compositor y los
        // botones de borrado se rehacen con los permisos correctos.
        store.subscribe('user', (user) => {
            const previousId = state.user ? state.user.id : null;
            const nextId = user ? user.id : null;
            if (previousId === nextId) return;

            state.user = user || null;
            renderComposer();
            renderComments();
        }, false);

        // El enlace directo a los comentarios debe llevar hasta ellos aunque la
        // sección se haya pintado después de que el navegador buscara el ancla.
        if (global.location.hash === '#comentarios') {
            const section = $('#comentarios');
            if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
