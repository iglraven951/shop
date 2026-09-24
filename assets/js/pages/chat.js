/**
 * DiscoveryShop · Centro de mensajes
 *
 * Dos paneles: la lista de conversaciones a la izquierda y el hilo activo a la
 * derecha. En pantallas pequeñas solo se ve uno de los dos, alternando con la
 * clase `.is-thread-open` sobre el contenedor de la página.
 *
 * Todo el texto que proviene de la API (mensajes, nombres, títulos) es contenido
 * de usuario: pasa siempre por `escapeHtml` antes de llegar a innerHTML.
 */
(function (global) {
    'use strict';

    const { $, escapeHtml, escapeAttr, format, debounce, url } = global.DS;
    const api = global.api;
    const store = global.store;
    const toast = global.toast;
    const UI = global.UI;
    /* El tono del avatar lo decide el nombre: ver `UI.avatarTone`. */
    const toneAttr = (name) => ` data-tone="${UI.avatarTone(name)}"`;

    const MAX_LENGTH = 1000;
    const COUNTER_FROM = 840;       // a partir de aquí mostramos el contador
    const REPLY_MIN_MS = 900;
    const REPLY_MAX_MS = 1800;
    const NEAR_BOTTOM_PX = 90;      // margen para considerar que el hilo está «abajo»
    const MOBILE_QUERY = '(max-width: 860px)';

    /* Las cuatro cosas que de verdad se preguntan al otro lado, en el orden
       en que salen: si lo tiene, cuánto cede, hasta cuándo lo guarda y dónde
       quedan. «¿Aceptas una oferta?» estaba de más —el chat solo existe
       porque ya se aceptó una— y «¿Sigue disponible?» tampoco, porque quien
       escribió acaba de ofrecerlo. */
    const QUICK_REPLIES = [
        '¿Me puedes hacer una rebaja?',
        '¿Hasta cuándo me lo dejas?',
        '¿Dónde nos vemos?',
        '¿Me envías más fotos?',
    ];

    const state = {
        user: null,
        conversations: [],
        conversation: null,
        activeId: null,
        messages: [],
        query: '',
        sending: false,
        replyTimer: null,
        attachments: [],
    };

    const dom = {};
    const isMobile = () => global.matchMedia(MOBILE_QUERY).matches;

    /* ======================================================================
       Utilidades
       ====================================================================== */

    function cacheDom() {
        dom.page = $('#chat-page');
        dom.gate = $('#chat-gate');
        dom.shell = $('#chat-shell');
        dom.list = $('#chat-list');
        dom.search = $('#chat-search-input');
        dom.welcome = $('#thread-welcome');
        dom.panel = $('#thread-panel');
        dom.head = $('#thread-head');
        dom.body = $('#thread-body');
        dom.messages = $('#thread-messages');
        dom.typing = $('#thread-typing');
        dom.typingAvatar = $('#thread-typing-avatar');
        dom.quick = $('#thread-quick');
        dom.composer = $('#thread-composer');
        dom.input = $('#chat-input');
        dom.counter = $('#chat-counter');
        dom.send = $('#chat-send');
        dom.attach = $('#chat-attach');
        dom.file = $('#chat-file');
        dom.tray = $('#chat-tray');
    }

    /** «Hoy», «Ayer» o la fecha completa, para los separadores del hilo. */
    function dayLabel(iso) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';

        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Hoy';
        if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
        return format.date(iso);
    }

    function isNearBottom() {
        return dom.body.scrollHeight - dom.body.scrollTop - dom.body.clientHeight < NEAR_BOTTOM_PX;
    }

    function scrollToBottom(smooth = false) {
        dom.body.scrollTo({ top: dom.body.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }

    /* ======================================================================
       Lista de conversaciones
       ====================================================================== */

    function listSkeleton(count = 6) {
        const row = `
            <div class="chat-item is-skeleton" aria-hidden="true">
                <span class="skeleton chat-item-thumb"></span>
                <span class="chat-item-body">
                    <span class="skeleton skeleton-text w-50"></span>
                    <span class="skeleton skeleton-text w-90"></span>
                    <span class="skeleton skeleton-text w-70"></span>
                </span>
            </div>`;
        return Array.from({ length: count }, () => row).join('');
    }

    /** Filtrado en cliente por nombre del vendedor o título de la publicación. */
    function visibleConversations() {
        const query = state.query.trim().toLowerCase();
        if (!query) return state.conversations;

        return state.conversations.filter((conversation) => {
            const seller = String(conversation.seller?.shop_name || conversation.seller?.username || '').toLowerCase();
            const title = String(conversation.request_title || '').toLowerCase();
            return seller.includes(query) || title.includes(query);
        });
    }

    function conversationItem(conversation) {
        const active = conversation.id === state.activeId;
        const preview = conversation.last_message?.text || 'Sin mensajes todavía';
        const unread = Number(conversation.unread) || 0;
        const unreadLabel = `${unread} ${unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}`;

        return `
        <button class="chat-item${active ? ' is-active' : ''}" type="button"
                data-id="${escapeAttr(conversation.id)}"
                ${active ? 'aria-current="true"' : ''}>
            <img class="chat-item-thumb" src="${escapeAttr(conversation.request_image)}"
                 alt="" loading="lazy" decoding="async">
            <span class="chat-item-body">
                <span class="chat-item-row">
                    <span class="chat-item-name truncate">${escapeHtml(conversation.seller?.shop_name || conversation.seller?.username || 'Vendedor')}</span>
                    <span class="chat-item-time">${escapeHtml(format.relative(conversation.updated_at))}</span>
                </span>
                <span class="chat-item-post truncate">${escapeHtml(conversation.request_title)}</span>
                <span class="chat-item-row">
                    <span class="chat-item-preview truncate">${escapeHtml(preview)}</span>
                    ${unread > 0
                        ? `<span class="chat-item-unread" aria-label="${escapeAttr(unreadLabel)}">${unread > 9 ? '9+' : unread}</span>`
                        : ''}
                </span>
            </span>
        </button>`;
    }

    function renderList() {
        dom.list.setAttribute('aria-busy', 'false');
        const items = visibleConversations();

        if (items.length) {
            dom.list.innerHTML = items.map(conversationItem).join('');
            return;
        }

        dom.list.innerHTML = state.query.trim()
            ? UI.emptyState({
                icon: '🔎',
                title: 'Sin coincidencias',
                message: 'Ninguna conversación coincide con tu búsqueda. Prueba con otro vendedor u otro artículo.',
            })
            : UI.emptyState({
                icon: '💬',
                title: 'Aún no tienes conversaciones',
                message: 'Aquí aparecerá la conversación con cada vendedor cuya oferta aceptes. Empieza publicando lo que buscas.',
                action: { label: 'Explorar el foro', href: 'index.html' },
            });
    }

    function syncUnreadBadge() {
        const total = state.conversations.reduce((sum, c) => sum + (Number(c.unread) || 0), 0);
        store.set({ unreadMessages: total });
    }

    /** Refresca extracto, hora y orden de una conversación tras un mensaje nuevo. */
    function touchConversation(id, message) {
        const entry = state.conversations.find((c) => c.id === id);
        if (!entry) return;

        entry.last_message = message;
        entry.updated_at = message.created_at;

        // Un mensaje ajeno en una conversación cerrada cuenta como no leído.
        if (message.sender_id !== state.user.id && state.activeId !== id) {
            entry.unread = (Number(entry.unread) || 0) + 1;
        }

        state.conversations.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        renderList();
        syncUnreadBadge();
    }

    /* ======================================================================
       Hilo de conversación
       ====================================================================== */

    function renderHead(conversation) {
        const seller = conversation.seller || {};

        /* El storyboard pone «En línea» bajo el nombre del local. No lo
           ponemos: no hay dato de presencia y fingirlo haría que alguien
           esperase una respuesta inmediata que quizá no llega. Lo que sí
           tenemos vale más para decidir si fiarse — cuántas compras lleva
           resueltas ese local y dónde está. */
        const meta = seller.rating_count
            ? `★ ${Number(seller.rating).toFixed(1)} · ${seller.rating_count} `
                + `${seller.rating_count === 1 ? 'compra' : 'compras'} · ${seller.district || 'Arequipa'}`
            : `${seller.verified ? 'Vendedor verificado' : 'Vendedor'} · ${seller.district || 'Arequipa'}`;

        dom.head.innerHTML = `
            <button class="chat-back" type="button" data-action="back"
                    aria-label="Volver a la lista de conversaciones">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 4 6 10l6 6"/>
                </svg>
            </button>

            <span class="avatar chat-peer-avatar" aria-hidden="true"${toneAttr(seller.shop_name || seller.username)}>${escapeHtml(format.initials(seller.shop_name || seller.username))}</span>

            <span class="chat-peer">
                <span class="chat-peer-name truncate">${escapeHtml(seller.shop_name || seller.username || 'Vendedor')}</span>
                <span class="chat-peer-meta truncate">${escapeHtml(meta)}</span>
            </span>

            <a class="chat-post" href="publicacion.html?id=${escapeAttr(conversation.request_id)}"
               aria-label="Ver el pedido «${escapeAttr(conversation.request_title)}»">
                <img class="chat-post-thumb" src="${escapeAttr(conversation.request_image)}" alt="" decoding="async">
                <span class="chat-post-info">
                    <span class="chat-post-title truncate">${escapeHtml(conversation.request_title)}</span>
                    <span class="chat-post-price">${escapeHtml(format.money(conversation.price))}</span>
                </span>
            </a>`;
    }

    function messageBubble(message, previous) {
        const mine = message.sender_id === state.user.id;
        const sameSender = previous && previous.sender_id === message.sender_id;
        const grouped = Boolean(sameSender);

        // Se escapa primero y solo después se reponen los saltos de línea.
        const text = escapeHtml(message.text).replace(/\n/g, '<br>');

        let status = `<span class="chat-bubble-time">${escapeHtml(format.time(message.created_at))}</span>`;
        if (message.pending) status = '<span class="chat-bubble-time">Enviando…</span>';
        if (message.failed) status = '<span class="chat-bubble-time is-failed">No se pudo enviar</span>';

        const classes = [
            'chat-msg',
            mine ? 'chat-msg-mine' : 'chat-msg-them',
            grouped ? 'is-grouped' : '',
            message.pending ? 'is-pending' : '',
            message.failed ? 'is-failed' : '',
        ].filter(Boolean).join(' ');

        const avatar = mine
            ? ''
            : `<span class="avatar avatar-sm chat-msg-avatar" aria-hidden="true"${toneAttr(message.sender_name)}>${escapeHtml(format.initials(message.sender_name))}</span>`;

        /* Las fotos del artículo viajan en el primer mensaje, el de la oferta.
           Es el panel 8 del storyboard: el vendedor dice el precio, dónde está
           y adjunta fotos — y esas fotos son lo primero que se mira. */
        /* Se muestran cuatro; si vienen más, la última lo dice en vez de
           tragárselas en silencio. Y todas abren el visor: son lo que hay que
           mirar de cerca antes de aceptar una oferta, y a 72 px no se ve
           nada. El visor ya existía y ya estaba cargado en esta página. */
        const shown = Array.isArray(message.photos) ? message.photos.slice(0, 4) : [];
        const extra = Array.isArray(message.photos) ? message.photos.length - shown.length : 0;

        const photos = shown.length
            ? `<div class="chat-bubble-photos">${shown.map((photo, index) => {
                const last = index === shown.length - 1 && extra > 0;
                return `
                <button class="chat-bubble-photo${last ? ' has-more' : ''}" type="button"
                        data-photo="${escapeAttr(photo.url)}"
                        ${last ? `data-more="+${extra}"` : ''}
                        aria-label="Ampliar la foto ${index + 1} de ${shown.length + extra}">
                    <img src="${escapeAttr(photo.url)}" alt="Foto de lo ofrecido"
                         loading="lazy" decoding="async">
                </button>`;
            }).join('')}</div>`
            : '';

        return `
        <div class="${classes}">
            ${avatar}
            <div class="chat-bubble">
                <p class="chat-bubble-text">${text}</p>
                ${photos}
                ${status}
            </div>
        </div>`;
    }

    function renderMessages() {
        let lastDay = null;

        dom.messages.innerHTML = state.messages.map((message, index) => {
            const label = dayLabel(message.created_at);
            const isNewDay = label && label !== lastDay;
            const separator = isNewDay
                ? `<div class="chat-day"><span>${escapeHtml(label)}</span></div>`
                : '';

            lastDay = label || lastDay;

            // Tras un separador de fecha el mensaje nunca se agrupa con el anterior.
            const previous = isNewDay ? null : state.messages[index - 1];
            return separator + messageBubble(message, previous);
        }).join('');
    }

    function threadSkeleton() {
        return `
            <div class="chat-msg chat-msg-them" aria-hidden="true">
                <span class="skeleton avatar avatar-sm"></span>
                <span class="skeleton chat-bubble-skeleton" style="width: 62%;"></span>
            </div>
            <div class="chat-msg chat-msg-mine" aria-hidden="true">
                <span class="skeleton chat-bubble-skeleton" style="width: 46%;"></span>
            </div>
            <div class="chat-msg chat-msg-them" aria-hidden="true">
                <span class="skeleton avatar avatar-sm"></span>
                <span class="skeleton chat-bubble-skeleton" style="width: 54%;"></span>
            </div>`;
    }

    function showTyping(visible) {
        const stick = isNearBottom();

        if (visible) {
            dom.typingAvatar.textContent = format.initials(state.conversation?.seller?.username);
        }

        dom.typing.hidden = !visible;
        if (visible && stick) scrollToBottom(true);
    }

    async function openConversation(id, { reveal = false } = {}) {
        if (!id) return;

        state.activeId = id;
        showTyping(false);
        renderList();
        url.sync({ c: id });

        dom.welcome.hidden = true;
        dom.panel.hidden = false;
        if (reveal) dom.page.classList.add('is-thread-open');

        dom.messages.setAttribute('aria-busy', 'true');
        dom.messages.innerHTML = threadSkeleton();

        try {
            const data = await api.getMessages(id);

            // Puede haberse elegido otra conversación mientras llegaba la respuesta.
            if (state.activeId !== id) return;

            // El backend real podría devolver la carga con otra forma: los
            // valores por defecto evitan que un campo ausente rompa el hilo.
            state.conversation = data.conversation || {};
            state.messages = (data.messages || []).slice();

            renderHead(state.conversation);
            renderMessages();
            scrollToBottom();

            const entry = state.conversations.find((c) => c.id === id);
            if (entry) entry.unread = 0;
            renderList();
            syncUnreadBadge();
            resetComposer();
        } catch (error) {
            // Se vuelve al panel de bienvenida: en móvil, quedarse en un hilo
            // vacío dejaría al usuario sin botón de volver.
            if (state.activeId === id) {
                state.activeId = null;
                state.conversation = null;
                state.messages = [];
                dom.messages.innerHTML = '';
                dom.panel.hidden = true;
                dom.welcome.hidden = false;
                dom.page.classList.remove('is-thread-open');
                renderList();
            }
            toast.error(error.message || 'No se pudo abrir la conversación');
        } finally {
            dom.messages.setAttribute('aria-busy', 'false');
        }
    }

    /* ======================================================================
       Envío de mensajes
       ====================================================================== */

    function replaceMessage(tempId, message) {
        const index = state.messages.findIndex((m) => m.id === tempId);
        if (index === -1) return false;

        state.messages[index] = message;
        renderMessages();
        return true;
    }

    async function submitMessage(rawText) {
        const text = String(rawText || '').trim();
        const photos = state.attachments.map((p) => ({ url: p.url }));

        // Una foto sola ya es un mensaje: no se exige escribir algo al lado.
        if ((!text && !photos.length) || state.sending || !state.activeId) return;

        if (text.length > MAX_LENGTH) {
            toast.error(`El mensaje no puede superar los ${MAX_LENGTH} caracteres.`);
            return;
        }

        const conversationId = state.activeId;
        const optimistic = {
            id: `tmp-${Date.now()}`,
            sender_id: state.user.id,
            sender_name: state.user.username,
            text,
            photos,
            created_at: new Date().toISOString(),
            pending: true,
        };

        // Pintado optimista: la burbuja aparece antes de que responda la API.
        state.sending = true;
        state.messages.push(optimistic);
        renderMessages();
        scrollToBottom(true);
        clearComposer();
        clearAttachments();
        updateSendState();

        try {
            const data = await api.sendMessage(conversationId, text, photos);
            const sent = data.message || { ...optimistic, pending: false };

            replaceMessage(optimistic.id, sent);
            touchConversation(conversationId, sent);
            scheduleAutoReply(conversationId, text);
        } catch (error) {
            replaceMessage(optimistic.id, { ...optimistic, pending: false, failed: true });
            toast.error(error.message || 'No se pudo enviar el mensaje');
        } finally {
            state.sending = false;
            updateSendState();
        }
    }

    /**
     * Respuesta automática de quien publica: mantiene la conversación viva sin
     * servidor ni WebSockets. El retraso aleatorio y el indicador de escritura
     * son lo que hace que no se sienta instantánea y artificial.
     */
    function scheduleAutoReply(conversationId, userText) {
        clearTimeout(state.replyTimer);
        showTyping(true);

        const delay = REPLY_MIN_MS + Math.random() * (REPLY_MAX_MS - REPLY_MIN_MS);

        state.replyTimer = setTimeout(() => {
            showTyping(false);

            const message = api.simulateReply(conversationId, userText);
            if (!message) return;

            const isActive = state.activeId === conversationId;

            if (isActive) {
                const stick = isNearBottom();
                state.messages.push(message);
                renderMessages();
                if (stick) scrollToBottom(true);

                // Se están leyendo en pantalla: se marcan como leídos en el almacén.
                api.getMessages(conversationId).catch(() => {});
            }

            touchConversation(conversationId, message);
        }, delay);
    }

    /* ======================================================================
       Fotos que se mandan

       Enseñar el producto es media conversación: «¿me mandas una foto?» es de
       lo primero que se pregunta, y hasta ahora había que contestar que sí de
       palabra, porque no se podía adjuntar nada.

       Las fotos se escalan y se recomprimen ANTES de guardarlas. No es un
       refinamiento: aquí no hay servidor, la foto acaba en `localStorage`
       como data URL, y una foto de teléfono sin tocar son cuatro megas —dos
       llenarían la cuota del navegador y se perdería la sesión entera—. A
       1024 px y calidad 0,6 la misma foto pesa unos 120 KB y en pantalla no
       se distingue.
       ====================================================================== */

    const MAX_PHOTOS = 4;
    const MAX_EDGE = 1024;
    const QUALITY = 0.6;

    /** Escala la imagen al lado mayor permitido y la devuelve como data URL. */
    function shrink(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
            reader.onload = () => {
                const image = new Image();

                image.onerror = () => reject(new Error('El archivo no es una imagen válida'));
                image.onload = () => {
                    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(image.width * scale);
                    canvas.height = Math.round(image.height * scale);

                    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

                    try {
                        resolve(canvas.toDataURL('image/jpeg', QUALITY));
                    } catch (error) {
                        // Un canvas «manchado» por una imagen de otro origen
                        reject(new Error('No se pudo procesar la imagen'));
                    }
                };

                image.src = reader.result;
            };

            reader.readAsDataURL(file);
        });
    }

    async function addFiles(fileList) {
        const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return;

        const room = MAX_PHOTOS - state.attachments.length;
        if (room <= 0) {
            toast.error(`Puedes enviar hasta ${MAX_PHOTOS} fotos por mensaje.`);
            return;
        }

        if (files.length > room) {
            toast.info(`Se añadieron ${room} de ${files.length} fotos: el máximo por mensaje es ${MAX_PHOTOS}.`);
        }

        dom.attach.classList.add('is-working');

        for (const file of files.slice(0, room)) {
            try {
                const url = await shrink(file);
                state.attachments.push({ url, name: file.name });
            } catch (error) {
                toast.error(error.message || 'No se pudo añadir la imagen');
            }
        }

        dom.attach.classList.remove('is-working');
        renderTray();
        updateSendState();
    }

    function renderTray() {
        const empty = !state.attachments.length;
        dom.tray.hidden = empty;

        if (empty) {
            dom.tray.innerHTML = '';
            return;
        }

        dom.tray.innerHTML = state.attachments.map((photo, index) => `
            <span class="chat-tray-item">
                <img src="${escapeAttr(photo.url)}" alt="${escapeAttr(photo.name || 'Foto por enviar')}"
                     decoding="async">
                <button class="chat-tray-drop" type="button" data-drop="${index}"
                        aria-label="Quitar ${escapeAttr(photo.name || 'la foto')}">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                         stroke-width="2" stroke-linecap="round" aria-hidden="true">
                        <path d="M3 3l6 6M9 3l-6 6"/>
                    </svg>
                </button>
            </span>`).join('');
    }

    function clearAttachments() {
        state.attachments = [];
        dom.file.value = '';
        renderTray();
    }

    /* ======================================================================
       Compositor
       ====================================================================== */

    /** `line-height: normal` u otros valores no numéricos devuelven NaN. */
    const px = (value, fallback = 0) => {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    /** Crece con el contenido hasta un máximo de cinco líneas. */
    function autoGrow() {
        const node = dom.input;
        node.style.height = 'auto';

        const styles = global.getComputedStyle(node);
        const lineHeight = px(styles.lineHeight, 21);
        const extra = px(styles.paddingTop) + px(styles.paddingBottom)
            + px(styles.borderTopWidth) + px(styles.borderBottomWidth);
        const max = Math.round((lineHeight * 5) + extra);

        node.style.height = `${Math.min(node.scrollHeight, max)}px`;
        node.style.overflowY = node.scrollHeight > max ? 'auto' : 'hidden';
    }

    function updateCounter() {
        const length = dom.input.value.length;

        if (length < COUNTER_FROM) {
            dom.counter.hidden = true;
            return;
        }

        dom.counter.hidden = false;
        dom.counter.textContent = `${length} / ${MAX_LENGTH}`;
        dom.counter.classList.toggle('is-limit', length >= MAX_LENGTH - 40);
    }

    function updateSendState() {
        const empty = !dom.input.value.trim() && !state.attachments.length;
        dom.send.disabled = state.sending || empty;
        dom.attach.disabled = state.attachments.length >= MAX_PHOTOS;
    }

    function clearComposer() {
        dom.input.value = '';
        autoGrow();
        updateCounter();
    }

    function resetComposer() {
        clearComposer();
        clearAttachments();
        updateSendState();
    }

    function renderQuickReplies() {
        dom.quick.innerHTML = QUICK_REPLIES.map((label) => `
            <button class="chat-quick-chip" type="button" data-quick="${escapeAttr(label)}">
                ${escapeHtml(label)}
            </button>`).join('');
    }

    /* ======================================================================
       Eventos
       ====================================================================== */

    function bindEvents() {
        dom.list.addEventListener('click', (event) => {
            const item = event.target.closest('.chat-item');
            if (!item || !item.dataset.id) return;
            openConversation(item.dataset.id, { reveal: true });
        });

        /* Las fotos de una oferta, a tamaño real. Delegado en el hilo porque
           los mensajes se repintan enteros con cada envío. */
        dom.messages.addEventListener('click', (event) => {
            const photo = event.target.closest('[data-photo]');
            if (!photo) return;
            global.modal.lightbox(photo.dataset.photo, 'Foto de lo ofrecido');
        });

        dom.head.addEventListener('click', (event) => {
            if (!event.target.closest('[data-action="back"]')) return;
            dom.page.classList.remove('is-thread-open');

            // Se devuelve el foco a la conversación abierta, no al buscador:
            // enfocar un campo de texto abriría el teclado del móvil.
            const active = dom.list.querySelector('.chat-item.is-active');
            if (active) active.focus();
        });

        /* Adjuntar: el botón abre el selector, y el campo queda oculto porque
           su aspecto nativo no se puede estilar. */
        dom.attach.addEventListener('click', () => dom.file.click());
        dom.file.addEventListener('change', () => addFiles(dom.file.files));

        dom.tray.addEventListener('click', (event) => {
            const drop = event.target.closest('[data-drop]');
            if (!drop) return;
            state.attachments.splice(Number(drop.dataset.drop), 1);
            renderTray();
            updateSendState();
        });

        /* Pegar una captura funciona igual que adjuntarla: es como llega la
           mitad de las fotos en una conversación de compraventa. */
        dom.input.addEventListener('paste', (event) => {
            const items = (event.clipboardData && event.clipboardData.items) || [];
            const files = Array.from(items)
                .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter(Boolean);

            if (!files.length) return;
            event.preventDefault();
            addFiles(files);
        });

        const applySearch = debounce(() => {
            state.query = dom.search.value;
            renderList();
        }, 200);

        dom.search.addEventListener('input', applySearch);

        dom.quick.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-quick]');
            if (!chip) return;

            dom.input.value = chip.dataset.quick;
            dom.input.focus();
            autoGrow();
            updateCounter();
            updateSendState();
        });

        dom.input.addEventListener('input', () => {
            autoGrow();
            updateCounter();
            updateSendState();
        });

        // Intro envía; Mayúsculas+Intro inserta un salto de línea.
        dom.input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
            event.preventDefault();
            submitMessage(dom.input.value);
        });

        dom.composer.addEventListener('submit', (event) => {
            event.preventDefault();
            submitMessage(dom.input.value);
        });
    }

    /* ======================================================================
       Arranque
       ====================================================================== */

    /** Sin sesión no se redirige: se invita a entrar conservando el destino. */
    function renderGate() {
        dom.shell.hidden = true;
        dom.gate.hidden = false;
        dom.gate.innerHTML = UI.loginGate({
            icon: '💬',
            title: 'Inicia sesión para ver tus mensajes',
            message: 'Tus conversaciones son privadas. Entra con tu cuenta y continúa donde lo dejaste.',
        });
    }

    async function loadConversations() {
        try {
            const data = await api.getConversations();
            state.conversations = (data.conversations || []).slice();
        } catch (error) {
            dom.list.setAttribute('aria-busy', 'false');
            dom.list.innerHTML = UI.emptyState({
                icon: '⚠️',
                title: 'No pudimos cargar tus conversaciones',
                message: error.message || 'Vuelve a intentarlo dentro de unos segundos.',
                action: { label: 'Reintentar', href: 'mensajes.html' },
            });
            toast.error(error.message || 'No se pudieron cargar las conversaciones');
            return;
        }

        renderList();
        syncUnreadBadge();

        const requested = url.param('c');
        const target = state.conversations.find((c) => c.id === requested)
            || state.conversations[0];

        if (!target) return;

        // Con ?c= llegamos desde una publicación: ahí sí abrimos el hilo
        // en móvil. Si solo preseleccionamos la primera, dejamos visible la lista.
        await openConversation(target.id, {
            reveal: Boolean(requested) && target.id === requested,
        });
    }

    async function init() {
        cacheDom();
        if (!dom.page) return;

        await api.ready();

        const session = await api.getCurrentUser();
        state.user = session ? (session.user || session) : null;

        if (!state.user) {
            renderGate();
            return;
        }

        bindEvents();
        renderQuickReplies();
        dom.list.innerHTML = listSkeleton();

        await loadConversations();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
