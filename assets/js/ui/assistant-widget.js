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
        /* Antes aquí había una escoba: la cabeza del cepillo se apoyaba justo
           sobre la línea del suelo y a 17 px las dos formas se fundían en un
           borrón. Una papelera se lee entera a ese tamaño y dice lo mismo. */
        broom: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 5.2h11.2"/><path d="M7.2 5.2V4a1.1 1.1 0 0 1 1.1-1.1h1.4A1.1 1.1 0 0 1 10.8 4v1.2"/><path d="m5.3 5.2.62 8.05A1.4 1.4 0 0 0 7.32 14.6h3.36a1.4 1.4 0 0 0 1.4-1.35l.62-8.05"/><path d="M7.7 7.9v3.9M10.3 7.9v3.9"/></svg>',
        send: '<svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 2.5 9 11"/><path d="M17.5 2.5 12 17.5l-3-6.5-6.5-3Z"/></svg>',
        /* Lápiz: encabeza la respuesta que redacta un pedido. */
        pencil: '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.6 1.9 12.1 4.4 4.9 11.6 1.9 12.1l.5-3Z"/><path d="M8.3 3.2l2.5 2.5"/></svg>',
        /* Tablón: encabeza los pedidos que el motor encontró. */
        board: '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="2.4" width="10.4" height="9.2" rx="1.6"/><path d="M4.4 5.4h5.2M4.4 8.2h3.2"/></svg>',
    };

    /**
     * Sello del asistente: el destello de cuatro puntas, grande y pequeño.
     *
     * Antes aquí iba la bolsa de la marca, la misma que preside la cabecera.
     * Copiarla le quitaba identidad a las dos cosas: el asistente no era nadie
     * —solo el logo otra vez, más pequeño— y el logo dejaba de significar «la
     * casa» para significar también «pregúntame». El destello es el sello que
     * comparten las dos IA de la casa, el asistente y el revisor de pedidos,
     * y a 24 px se sigue leyendo, que es donde un símbolo con recortes se
     * convierte en una mancha.
     */
    function sigil() {
        return [
            '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">',
            '<path d="M17 6.5C17.86 14.44 20.56 17.14 28.5 18C20.56 18.86 17.86 21.56 17 29.5',
            'C16.14 21.56 13.44 18.86 5.5 18C13.44 17.14 16.14 14.44 17 6.5Z" fill="currentColor"/>',
            '<path d="M29.5 24.5C29.86 27.62 30.88 28.64 34 29C30.88 29.36 29.86 30.38 29.5 33.5',
            'C29.14 30.38 28.12 29.36 25 29C28.12 28.64 29.14 27.62 29.5 24.5Z"',
            ' fill="currentColor" opacity="0.6"/>',
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
            asker: post.buyer.username,
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
            text: 'Hola, soy el asistente de DiscoveryShop. Dime con tus palabras qué estás buscando —marca, presupuesto o distrito— y lo rastreo en el tablón por ti. Si nadie lo está pidiendo todavía, te ayudo a redactar tu pedido.',
            posts: [],
            link: null,
            suggestions: ['Busco un celular', '¿Qué hay en Cayma?', '¿Cómo publico un pedido?'],
        };
    }

    function errorMessage() {
        return {
            role: 'assistant',
            at: nowIso(),
            error: true,
            retry: true,
            text: 'No pude consultar el tablón en este momento. Puede ser algo pasajero: inténtalo otra vez.',
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
            <span class="asst-fab-halo" aria-hidden="true"></span>
            <span class="asst-fab-mark" aria-hidden="true">${sigil()}</span>
            <span class="asst-ping" id="asst-ping" aria-hidden="true"></span>
        </button>

        <section class="asst-panel" id="asst-panel" role="dialog" aria-modal="true"
                 aria-labelledby="asst-title" hidden>
            <header class="asst-head">
                <span class="asst-avatar" aria-hidden="true">
                    <span class="asst-avatar-orbit"></span>
                    ${sigil()}
                </span>

                <span class="asst-id">
                    <span class="asst-name" id="asst-title">
                        <span class="asst-name-text">Asistente<span class="asst-name-suffix"> DiscoveryShop</span></span>
                        <span class="asst-badge">IA</span>
                    </span>
                    <span class="asst-status">
                        <span class="asst-status-dot" aria-hidden="true"></span>
                        En línea<span class="asst-status-more"> · busca y redacta por ti</span>
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
            </div>

            <div class="asst-suggest" id="asst-suggest" hidden></div>

            <form class="asst-composer" id="asst-composer">
                <textarea class="asst-input" id="asst-input" rows="1"
                          placeholder="Dime qué estás buscando…"
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
                    <span class="asst-card-meta">${escapeHtml(post.district)} · ${escapeHtml(post.asker)}</span>
                </span>
                <span class="asst-card-price">${escapeHtml(UI.budgetText(post))}</span>
            </a>`;
        }).join('');

        return `<span class="asst-results">${cards}</span>`;
    }

    /**
     * ¿Esta respuesta está redactando un pedido, o solo contestando?
     *
     * Es la distinción que más importa de cara a quien mira: buscar en el
     * tablón es un servicio, pero convertir «una lámpara vintage dorada» en un
     * pedido publicable es LO que hace esta plataforma. El motor ya la marca
     * sin saberlo —cuando lleva a `publicar.html` es porque nadie está pidiendo
     * eso y toca escribirlo—, así que se lee de ahí en lugar de inventar un
     * campo nuevo en el contrato. Se compara solo el nombre del archivo: el
     * enlace puede traer parámetros detrás.
     */
    function isComposing(message) {
        return message.role !== 'user'
            && typeof message.link === 'string'
            && /^publicar\.html(?:[?#]|$)/.test(message.link);
    }

    /** Rótulo que encabeza un bloque dentro de la burbuja. */
    function kickerMarkup(icon, label) {
        return `<span class="asst-kicker">${icon}<span>${escapeHtml(label)}</span></span>`;
    }

    /**
     * Contenido de una burbuja.
     * Todo lo que llega aquí es texto de la persona o del tablón: se escapa
     * sin excepciones antes de tocar `innerHTML`.
     */
    function bubbleMarkup(message) {
        const own = message.role === 'user';
        const composing = isComposing(message);
        const parts = [];

        if (composing) parts.push(kickerMarkup(ICON.pencil, 'Redactar tu pedido'));

        parts.push(`<span class="asst-text">${escapeHtml(message.text)}</span>`);

        if (!own && Array.isArray(message.requests) && message.requests.length) {
            parts.push(kickerMarkup(ICON.board, 'En el tablón'));
            parts.push(resultsMarkup(message.requests));
        }

        if (!own && message.link) {
            parts.push(`<a class="asst-more" href="${escapeAttr(message.link)}">${escapeHtml(message.linkLabel || 'Ver en el tablón')}</a>`);
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
        if (isComposing(message)) classes.push('is-composing');
        if (animate) classes.push('is-new');

        const node = document.createElement('div');
        node.className = classes.join(' ');

        // El sello solo acompaña a lo que dice el asistente; quien escribe ya
        // sabe quién es. En una ráfaga seguida lo esconde el CSS, no el JS.
        node.innerHTML = (own ? '' : `<span class="asst-msg-mark" aria-hidden="true">${sigil()}</span>`)
            + bubbleMarkup(message);

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
        typingNode.className = 'asst-msg asst-msg-bot is-thinking';
        typingNode.innerHTML = [
            `<span class="asst-msg-mark" aria-hidden="true">${sigil()}</span>`,
            '<span class="asst-typing">',
            '<span class="sr-only">El asistente está pensando…</span>',
            '<span class="asst-typing-dots" aria-hidden="true">',
            '<span class="asst-typing-dot"></span>',
            '<span class="asst-typing-dot"></span>',
            '<span class="asst-typing-dot"></span>',
            '</span>',
            '<span class="asst-typing-label" aria-hidden="true">Pensando…</span>',
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
