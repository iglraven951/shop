/**
 * DiscoveryShop · Chat flotante del asistente
 *
 * La interfaz del motor que vive en `core/assistant.js`. Aquí no hay ninguna
 * inteligencia: se recoge lo que escribe la persona, se le pasa al motor y se
 * pinta lo que devuelve —texto, publicaciones, enlace y sugerencias—. Los
 * únicos textos propios de este archivo son la bienvenida y los avisos de
 * error, porque el motor no los redacta.
 *
 * Se monta en las once páginas, así que todo cuelga de un único contenedor
 * fijo y no toca el marcado de ninguna de ellas.
 *
 * La conversación se guarda en `sessionStorage`: al navegar de una página a
 * otra el widget se reconstruye desde cero, y sin eso el hilo se perdería en
 * cada clic.
 */
(function (global) {
    'use strict';

    const DS = global.DS;
    const UI = global.UI;
    const engine = global.DiscoveryAssistant;

    // Sin motor no hay asistente: es preferible no pintar nada a ofrecer un
    // botón que al pulsarlo no responde.
    if (!DS || !UI || !engine || !global.document) return;

    const { escapeHtml, escapeAttr, format } = DS;

    /* ----------------------------------------------------------------------
       Constantes
       ---------------------------------------------------------------------- */

    const THREAD_KEY = 'discoveryshop:assistant';
    const SEEN_KEY = 'discoveryshop:assistant-seen';

    /** Tope del historial: lo suficiente para una conversación real. */
    const MAX_MESSAGES = 40;

    /** Alto máximo del compositor antes de permitirle desplazarse. */
    const INPUT_MAX = 132;

    /* Retraso antes de responder. Una respuesta instantánea se siente
       artificial —nadie lee y contesta en cero— y además no da tiempo a
       releer la propia pregunta antes de que llegue la respuesta. */
    const THINK_MIN = 400;
    const THINK_SPREAD = 300;

    /* ----------------------------------------------------------------------
       Iconos

       En línea y con `currentColor` para que hereden el tema sin pedir un
       segundo archivo.
       ---------------------------------------------------------------------- */

    const ICON = {
        close: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m5 5 8 8M13 5l-8 8"/></svg>',
        broom: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 15.5h11"/><path d="M7 12.5h7l-.8 3H7.8Z"/><path d="M10.5 12.5V7.2a2.7 2.7 0 0 1 2.7-2.7h1.3"/></svg>',
        send: '<svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 2.5 9 11"/><path d="M17.5 2.5 12 17.5l-3-6.5-6.5-3Z"/></svg>',
    };

    /**
     * Símbolo de la marca: la bolsa con la lupa recortada, igual que en la
     * cabecera. La máscara necesita un identificador propio en cada copia:
     * dos elementos con el mismo `id` en la misma página son HTML inválido y
     * algunos navegadores aplican la primera máscara a todas.
     */
    function brandMark(maskId) {
        const id = escapeAttr(maskId);
        return [
            '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">',
            '<path d="M13.4 10.6 9.1 29.4a1.1 1.1 0 0 0 1.07 1.35h3.23Z" fill="currentColor" opacity="0.5"/>',
            '<path d="M16.6 11.2V9.4a4.6 4.6 0 0 1 9.2 0v1.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
            `<mask id="${id}">`,
            '<rect width="40" height="40" fill="#fff"/>',
            '<circle cx="21.3" cy="19.4" r="5.2" fill="none" stroke="#000" stroke-width="2.3"/>',
            '<path d="m25.2 23.3 4.6 4.6" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>',
            '</mask>',
            '<path d="M13.4 10.6h15.9a1.6 1.6 0 0 1 1.6 1.45l1.62 17.1a1.6 1.6 0 0 1-1.6 1.75H10.9a1.1 1.1 0 0 1-1.07-1.35Z"',
            ` fill="currentColor" mask="url(#${id})"/>`,
            '</svg>',
        ].join('');
    }

    /* ----------------------------------------------------------------------
       Almacenamiento

       Cualquier acceso puede fallar (modo privado, cuota agotada, políticas
       del navegador). Nada de esto debe impedir conversar: si no se puede
       guardar, el hilo simplemente no sobrevive al cambio de página.
       ---------------------------------------------------------------------- */

    function loadThread() {
        try {
            const raw = global.sessionStorage.getItem(THREAD_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? parsed.filter((m) => m && m.text) : [];
        } catch (error) {
            return [];
        }
    }

    function saveThread() {
        try {
            global.sessionStorage.setItem(THREAD_KEY, JSON.stringify(thread));
        } catch (error) {
            /* sin persistencia: la conversación sigue viva en esta página */
        }
    }

    function everOpened() {
        try {
            return global.localStorage.getItem(SEEN_KEY) === '1';
        } catch (error) {
            return false;
        }
    }

    function rememberOpened() {
        try {
            global.localStorage.setItem(SEEN_KEY, '1');
        } catch (error) {
            /* el punto pulsante reaparecerá; es un detalle, no un fallo */
        }
    }

    /* ----------------------------------------------------------------------
       Estado
       ---------------------------------------------------------------------- */

    let thread = loadThread();
    let isOpen = false;
    let isBusy = false;
    let isClosing = false;
    let lastQuestion = '';
    let typingNode = null;
    let timeTimer = null;
    let closeTimer = null;

    const dom = {};

    /* ----------------------------------------------------------------------
       Utilidades
       ---------------------------------------------------------------------- */

    const nowIso = () => new Date().toISOString();

    const wait = (ms) => new Promise((resolve) => { global.setTimeout(resolve, ms); });

    const thinkTime = () => THINK_MIN + Math.floor(Math.random() * THINK_SPREAD);

    /**
     * Reduce una publicación a lo que la ficha necesita.
     * El hilo entero viaja a `sessionStorage` en cada mensaje: guardar el
     * objeto completo del catálogo agotaría la cuota en pocas respuestas.
     */
    function compactPost(raw) {
        const post = UI.normalizePost(raw);
        return {
            id: post.id,
            title: post.title,
            budget_min: post.budget_min,
            budget_max: post.budget_max,
            district: post.district,
            seller: post.buyer.username,
            image_url: post.image_url,
            fallback_url: post.fallback_url,
        };
    }

    /**
     * Respaldo de imagen, con el mismo mecanismo que usan las tarjetas del
     * foro: las fotos vienen de una red externa y, si no cargan, el SVG
     * generado no necesita conexión. `onerror` se anula a sí mismo para que
     * un respaldo que también fallara no entre en bucle.
     */
    function fallbackAttr(post) {
        if (!post.fallback_url) return '';
        return ` onerror="this.onerror=null;this.src='${escapeAttr(post.fallback_url)}'"`;
    }

    /* ----------------------------------------------------------------------
       Mensajes propios de la interfaz
       ---------------------------------------------------------------------- */

    function welcomeMessage() {
        return {
            role: 'assistant',
            at: nowIso(),
            text: 'Hola, soy el asistente de DiscoveryShop. Dime con tus palabras qué artículo buscas —marca, precio o distrito— y lo rastreo en el foro por ti.',
            posts: [],
            link: null,
            suggestions: ['Busco un celular', '¿Qué hay en Cayma?', '¿Cómo publico un artículo?'],
        };
    }

    function errorMessage() {
        return {
            role: 'assistant',
            at: nowIso(),
            error: true,
            retry: true,
            text: 'No pude consultar el catálogo en este momento. Puede ser algo pasajero: inténtalo otra vez.',
            posts: [],
            link: null,
            suggestions: [],
        };
    }

    /* ----------------------------------------------------------------------
       Plantillas
       ---------------------------------------------------------------------- */

    function shellMarkup() {
        return `
        <button class="asst-fab" type="button" id="asst-fab"
                aria-label="Abrir el asistente de DiscoveryShop"
                aria-expanded="false" aria-controls="asst-panel">
            ${brandMark('asst-mark-fab')}
            <span class="asst-ping" id="asst-ping" aria-hidden="true"></span>
        </button>

        <section class="asst-panel" id="asst-panel" role="dialog" aria-modal="true"
                 aria-labelledby="asst-title" hidden>
            <header class="asst-head">
                <span class="asst-avatar" aria-hidden="true">${brandMark('asst-mark-head')}</span>

                <span class="asst-id">
                    <span class="asst-name" id="asst-title">Asistente DiscoveryShop</span>
                    <span class="asst-status">
                        <span class="asst-status-dot" aria-hidden="true"></span>
                        En línea · responde al instante
                    </span>
                </span>

                <button class="asst-head-btn" type="button" id="asst-clear"
                        aria-label="Limpiar conversación" title="Limpiar conversación">${ICON.broom}</button>

                <button class="asst-head-btn" type="button" id="asst-close"
                        aria-label="Cerrar el asistente">${ICON.close}</button>
            </header>

            <div class="asst-thread" id="asst-thread">
                <div class="asst-log" id="asst-log" role="log" aria-live="polite"
                     aria-relevant="additions" aria-label="Conversación con el asistente"></div>
                <div class="asst-suggest" id="asst-suggest" hidden></div>
            </div>

            <form class="asst-composer" id="asst-composer">
                <textarea class="asst-input" id="asst-input" rows="1"
                          placeholder="Escribe qué estás buscando…"
                          aria-label="Mensaje para el asistente"
                          autocomplete="off" maxlength="400"></textarea>

                <button class="asst-send" type="submit" id="asst-send"
                        aria-label="Enviar mensaje" disabled>${ICON.send}</button>
            </form>
        </section>`;
    }

    /** Fichas compactas de las publicaciones que devolvió el motor. */
    function resultsMarkup(posts) {
        const cards = posts.map((post) => {
            const href = `publicacion.html?id=${encodeURIComponent(post.id)}`;

            return `
            <a class="asst-card" href="${escapeAttr(href)}">
                <img class="asst-card-thumb" src="${escapeAttr(post.image_url)}" alt=""
                     loading="lazy" decoding="async"${fallbackAttr(post)}>
                <span class="asst-card-body">
                    <span class="asst-card-title">${escapeHtml(post.title)}</span>
                    <span class="asst-card-meta">${escapeHtml(post.district)} · ${escapeHtml(post.seller)}</span>
                </span>
                <span class="asst-card-price">${escapeHtml(format.money(post.price))}</span>
            </a>`;
        }).join('');

        return `<span class="asst-results">${cards}</span>`;
    }

    /**
     * Contenido de una burbuja.
     * Todo lo que llega aquí es texto de la persona o del catálogo: se escapa
     * sin excepciones antes de tocar `innerHTML`.
     */
    function bubbleMarkup(message) {
        const own = message.role === 'user';
        const parts = [`<span class="asst-text">${escapeHtml(message.text)}</span>`];

        if (!own && Array.isArray(message.requests) && message.requests.length) {
            parts.push(resultsMarkup(message.requests));
        }

        if (!own && message.link) {
            parts.push(`<a class="asst-more" href="${escapeAttr(message.link)}">${escapeHtml(message.linkLabel || 'Ver en el foro')}</a>`);
        }

        if (!own && message.retry) {
            parts.push('<button class="asst-retry" type="button" data-asst-retry>Reintentar</button>');
        }

        parts.push(`<time class="asst-time" datetime="${escapeAttr(message.at)}">${escapeHtml(format.relative(message.at))}</time>`);

        return `<span class="asst-bubble">${parts.join('')}</span>`;
    }

    function messageNode(message, animate) {
        const own = message.role === 'user';
        const classes = ['asst-msg', own ? 'asst-msg-mine' : 'asst-msg-bot'];
        if (message.error) classes.push('is-error');
        if (animate) classes.push('is-new');

        const node = document.createElement('div');
        node.className = classes.join(' ');
        node.innerHTML = bubbleMarkup(message);
        return node;
    }

    /* ----------------------------------------------------------------------
       Pintado
       ---------------------------------------------------------------------- */

    function renderThread() {
        dom.log.innerHTML = '';
        thread.forEach((message) => dom.log.appendChild(messageNode(message, false)));
        renderSuggestions();
    }

    function pushMessage(message, { animate = true } = {}) {
        thread.push(message);
        if (thread.length > MAX_MESSAGES) thread = thread.slice(-MAX_MESSAGES);

        saveThread();

        // Si el historial se recortó, el nodo suelto ya no basta: se repinta.
        if (thread.length === MAX_MESSAGES && dom.log.children.length >= MAX_MESSAGES) {
            renderThread();
        } else {
            dom.log.appendChild(messageNode(message, animate));
        }

        scrollToEnd();
    }

    /** Solo el último mensaje del asistente propone continuaciones. */
    function renderSuggestions() {
        const last = thread[thread.length - 1];
        const list = (!isBusy && last && last.role === 'assistant' && Array.isArray(last.suggestions))
            ? last.suggestions
            : [];

        if (!list.length) {
            dom.suggest.hidden = true;
            dom.suggest.innerHTML = '';
            return;
        }

        dom.suggest.innerHTML = list
            .map((text) => `<button class="asst-chip" type="button" data-asst-suggestion="${escapeAttr(text)}">${escapeHtml(text)}</button>`)
            .join('');
        dom.suggest.hidden = false;
    }

    function clearSuggestions() {
        dom.suggest.hidden = true;
        dom.suggest.innerHTML = '';
    }

    function showTyping() {
        if (typingNode) return;

        typingNode = document.createElement('div');
        typingNode.className = 'asst-msg asst-msg-bot';
        typingNode.innerHTML = [
            '<span class="asst-typing">',
            '<span class="sr-only">El asistente está escribiendo…</span>',
            '<span class="asst-typing-dot" aria-hidden="true"></span>',
            '<span class="asst-typing-dot" aria-hidden="true"></span>',
            '<span class="asst-typing-dot" aria-hidden="true"></span>',
            '</span>',
        ].join('');

        dom.log.appendChild(typingNode);
        scrollToEnd();
    }

    function hideTyping() {
        if (!typingNode) return;
        typingNode.remove();
        typingNode = null;
    }

    function scrollToEnd() {
        // Tras un `appendChild` el alto todavía no está calculado; se espera
        // al siguiente fotograma para desplazarse al final de verdad.
        global.requestAnimationFrame(() => {
            dom.thread.scrollTop = dom.thread.scrollHeight;
        });
    }

    /** «hace un momento» envejece: mientras el panel está abierto se refresca. */
    function refreshTimes() {
        const stamps = dom.log.querySelectorAll('time.asst-time');
        Array.prototype.forEach.call(stamps, (stamp) => {
            const iso = stamp.getAttribute('datetime');
            if (iso) stamp.textContent = format.relative(iso);
        });
    }

    /* ----------------------------------------------------------------------
       Conversación
       ---------------------------------------------------------------------- */

    async function send(raw) {
        const text = String(raw || '').trim();
        if (!text || isBusy) return;

        lastQuestion = text;
        pushMessage({ role: 'user', text, at: nowIso() });
        clearSuggestions();
        resetInput();

        isBusy = true;
        syncSend();
        showTyping();

        // La pausa corre en paralelo al motor: se respeta el mínimo sin
        // sumarle el tiempo real de la consulta.
        const pause = wait(thinkTime());
        let reply = null;

        try {
            reply = await engine.respond(text);
        } catch (error) {
            reply = null;
        }

        await pause;
        hideTyping();

        if (reply && reply.text) {
            pushMessage({
                role: 'assistant',
                at: nowIso(),
                text: reply.text,
                requests: (reply.requests || []).map(compactPost),
                link: reply.link || null,
                linkLabel: reply.linkLabel || 'Ver en el foro',
                suggestions: Array.isArray(reply.suggestions) ? reply.suggestions : [],
            });
        } else {
            pushMessage(errorMessage());
        }

        isBusy = false;
        syncSend();
        renderSuggestions();
        scrollToEnd();

        if (isOpen) dom.input.focus();
    }

    function clearConversation() {
        thread = [];
        saveThread();
        dom.log.innerHTML = '';
        hideTyping();
        pushMessage(welcomeMessage());
        renderSuggestions();
        dom.input.focus();
    }

    /* ----------------------------------------------------------------------
       Compositor
       ---------------------------------------------------------------------- */

    function autoGrow() {
        dom.input.style.height = 'auto';
        dom.input.style.height = `${Math.min(dom.input.scrollHeight, INPUT_MAX)}px`;
    }

    function resetInput() {
        dom.input.value = '';
        autoGrow();
        syncSend();
    }

    function syncSend() {
        dom.send.disabled = isBusy || dom.input.value.trim().length === 0;
    }

    /* ----------------------------------------------------------------------
       Apertura y cierre
       ---------------------------------------------------------------------- */

    const FOCUSABLE = [
        'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
        'input:not([disabled])', '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    function focusables() {
        return Array.prototype.filter.call(
            dom.panel.querySelectorAll(FOCUSABLE),
            (node) => node.offsetParent !== null || node === document.activeElement
        );
    }

    function openPanel() {
        if (isOpen) return;
        isOpen = true;

        global.clearTimeout(closeTimer);
        isClosing = false;

        dom.root.classList.add('is-open');
        dom.panel.classList.remove('is-closing');
        dom.panel.hidden = false;
        dom.fab.setAttribute('aria-expanded', 'true');
        dom.fab.setAttribute('aria-label', 'Cerrar el asistente de DiscoveryShop');

        rememberOpened();
        if (dom.ping) {
            dom.ping.remove();
            dom.ping = null;
        }

        if (!thread.length) pushMessage(welcomeMessage());

        refreshTimes();
        renderSuggestions();
        scrollToEnd();

        // El teclado virtual tapando media pantalla nada más abrir estorba más
        // de lo que ayuda: en táctil el foco va al cierre y la persona decide.
        const finePointer = global.matchMedia && global.matchMedia('(pointer: fine)').matches;
        (finePointer ? dom.input : dom.close).focus();

        document.addEventListener('keydown', onKeydown);
        timeTimer = global.setInterval(refreshTimes, 60000);
    }

    function closePanel() {
        if (!isOpen || isClosing) return;
        isOpen = false;
        isClosing = true;

        dom.root.classList.remove('is-open');
        dom.panel.classList.add('is-closing');
        dom.fab.setAttribute('aria-expanded', 'false');
        dom.fab.setAttribute('aria-label', 'Abrir el asistente de DiscoveryShop');

        document.removeEventListener('keydown', onKeydown);
        global.clearInterval(timeTimer);
        timeTimer = null;

        // El foco vuelve al botón que lo abrió, no al vacío.
        dom.fab.focus();

        closeTimer = global.setTimeout(() => {
            dom.panel.hidden = true;
            dom.panel.classList.remove('is-closing');
            isClosing = false;
        }, 200);
    }

    function togglePanel() {
        if (isOpen) closePanel();
        else openPanel();
    }

    /**
     * Escape cierra y Tab circula dentro del panel.
     * Si hay un modal abierto no se interviene: el modal ya gestiona ambas
     * teclas y el asistente está oculto debajo.
     */
    function onKeydown(event) {
        if (document.body.classList.contains('is-modal-open')) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closePanel();
            return;
        }

        if (event.key !== 'Tab') return;

        const items = focusables();
        if (!items.length) return;

        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const inside = dom.panel.contains(active);

        if (event.shiftKey && (active === first || !inside)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (active === last || !inside)) {
            event.preventDefault();
            first.focus();
        }
    }

    /* ----------------------------------------------------------------------
       Enlaces de eventos
       ---------------------------------------------------------------------- */

    function bind() {
        dom.fab.addEventListener('click', togglePanel);
        dom.close.addEventListener('click', closePanel);
        dom.clear.addEventListener('click', clearConversation);

        dom.form.addEventListener('submit', (event) => {
            event.preventDefault();
            send(dom.input.value);
        });

        dom.input.addEventListener('input', () => {
            autoGrow();
            syncSend();
        });

        dom.input.addEventListener('keydown', (event) => {
            // Enter envía; Mayúsculas+Enter salta de línea, como en cualquier
            // chat. `isComposing` respeta los teclados con acentos muertos.
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
            event.preventDefault();
            send(dom.input.value);
        });

        // Una sola delegación para las sugerencias: se repintan en cada turno.
        dom.suggest.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-asst-suggestion]');
            if (chip) send(chip.dataset.asstSuggestion);
        });

        // El reintento revive la última pregunta tal como se escribió.
        dom.log.addEventListener('click', (event) => {
            if (event.target.closest('[data-asst-retry]') && lastQuestion) send(lastQuestion);
        });
    }

    /* ----------------------------------------------------------------------
       Montaje
       ---------------------------------------------------------------------- */

    function mount() {
        if (document.getElementById('ds-assistant')) return;

        const root = document.createElement('div');
        root.className = 'ds-assistant';
        root.id = 'ds-assistant';
        root.innerHTML = shellMarkup();
        document.body.appendChild(root);

        dom.root = root;
        dom.fab = root.querySelector('#asst-fab');
        dom.ping = root.querySelector('#asst-ping');
        dom.panel = root.querySelector('#asst-panel');
        dom.close = root.querySelector('#asst-close');
        dom.clear = root.querySelector('#asst-clear');
        dom.thread = root.querySelector('#asst-thread');
        dom.log = root.querySelector('#asst-log');
        dom.suggest = root.querySelector('#asst-suggest');
        dom.form = root.querySelector('#asst-composer');
        dom.input = root.querySelector('#asst-input');
        dom.send = root.querySelector('#asst-send');

        // Quien ya lo abrió alguna vez no necesita que se lo señalen de nuevo.
        if (everOpened() && dom.ping) {
            dom.ping.remove();
            dom.ping = null;
        }

        renderThread();
        syncSend();
        bind();
    }

    global.DiscoveryAssistantWidget = {
        mount,
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        ask: send,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})(window);
