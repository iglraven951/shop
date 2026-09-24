/**
 * DiscoveryShop · Capa de datos
 *
 * Único punto por el que la interfaz obtiene o modifica datos. Funciona en dos
 * modos y las páginas no notan la diferencia:
 *
 *   · remoto — hay servidor configurado en `config.js` y responde. Los datos
 *     son reales y compartidos entre todo el mundo.
 *   · demo   — no hay servidor, o no contesta. Todo se resuelve contra MockAPI
 *     en el propio navegador, con persistencia en localStorage, así que el
 *     sitio sigue funcionando en GitHub Pages, servido en local, abierto desde
 *     el disco o dentro de la app Android.
 *
 * El modo se decide una sola vez, en `ready()`, y después se mantiene. Si el
 * servidor se cae a mitad de sesión, el sitio baja a demo y lo avisa una vez,
 * en lugar de dejar pantallas rotas.
 *
 * Un 4xx **no** activa el respaldo: eso es el servidor respondiendo, y su
 * mensaje tiene que llegar intacto. Convertir «el título es muy corto» en un
 * éxito silencioso de la demo sería mucho peor que el propio error.
 *
 * Las páginas nunca llaman a MockAPI: siempre pasan por aquí.
 */
(function (global) {
    'use strict';

    const TOKEN_KEY = 'discoveryshop:token';

    // Quién emitió el token que hay guardado. Un token del servidor no
    // significa nada para MockAPI y al revés, así que hay que recordarlo.
    const TOKEN_MODE_KEY = 'discoveryshop:token:mode';

    const DEFAULTS = {
        apiBaseUrl: '',
        anonKey: '',
        fallback: true,
        timeoutMs: 8000,
    };

    class ApiClient {
        constructor() {
            this.mock = new global.MockAPI();
            this.config = { ...DEFAULTS, ...(global.DS_CONFIG || {}) };
            this.baseUrl = String(this.config.apiBaseUrl || '').replace(/\/+$/, '');

            // 'unknown' hasta que ready() lo averigüe; sin servidor, demo ya.
            this.mode = this.baseUrl ? 'unknown' : 'demo';
            this.announced = false;
            this.readyPromise = null;

            this.token = this.readToken();
            this.tokenMode = this.readTokenMode();
        }

        /* ------------------------------------------------------------------
           Disponibilidad
           ------------------------------------------------------------------ */

        /**
         * Decide el modo y lo deja fijado. Todas las páginas la esperan antes
         * de pedir nada, así que la comprobación ocurre una sola vez por carga
         * por mucho que la llamen desde varios sitios.
         *
         * @returns {Promise<'remote'|'demo'>}
         */
        ready() {
            if (!this.readyPromise) this.readyPromise = this.probe();
            return this.readyPromise;
        }

        async probe() {
            if (this.mode !== 'unknown') return this.mode;

            if (typeof global.fetch !== 'function') {
                // Navegador sin fetch, o página abierta en un entorno que no
                // lo expone: no hay forma de hablar con el servidor.
                this.mode = 'demo';
                return this.mode;
            }

            try {
                // Sondeo corto: nadie debería esperar ocho segundos mirando una
                // pantalla en blanco solo para descubrir que no hay servidor.
                await this.fetchJson('/api/health', {}, Math.min(4000, this.config.timeoutMs));
                this.mode = 'remote';
            } catch (error) {
                if (this.config.fallback === false) {
                    // Sin respaldo, el sitio exige servidor: se sigue en modo
                    // remoto para que cada petición falle con su error real, en
                    // vez de resolverse a escondidas contra la demo.
                    this.mode = 'remote';
                    return this.mode;
                }

                this.degrade(error);
            }

            return this.mode;
        }

        /** Baja a modo demo y lo anuncia, como mucho una vez por carga. */
        degrade(error) {
            if (this.mode === 'demo') return;
            this.mode = 'demo';

            if (this.announced) return;
            this.announced = true;

            const message = 'No hay conexión con el servidor. Estás viendo la '
                + 'demostración local: lo que hagas se queda en este dispositivo.';

            try {
                if (global.toast && typeof global.toast.warning === 'function') {
                    global.toast.warning(message, {
                        title: 'Modo demostración',
                        duration: 8000,
                    });
                } else {
                    console.warn(`[DiscoveryShop] ${message}`, error);
                }
            } catch (notifyError) {
                console.warn('[DiscoveryShop] Modo demostración', notifyError);
            }
        }

        /* ------------------------------------------------------------------
           Sesión
           ------------------------------------------------------------------ */

        readToken() {
            try {
                return localStorage.getItem(TOKEN_KEY);
            } catch (error) {
                return null;
            }
        }

        readTokenMode() {
            try {
                return localStorage.getItem(TOKEN_MODE_KEY) || 'demo';
            } catch (error) {
                return 'demo';
            }
        }

        /**
         * @param {string|null} token
         * @param {'remote'|'demo'} [mode] - Quién lo emitió. Por defecto, el
         *   modo en el que estamos ahora mismo, que es quien acaba de darlo.
         */
        setToken(token, mode) {
            const issuer = mode || (this.mode === 'remote' ? 'remote' : 'demo');

            this.token = token;
            this.tokenMode = token ? issuer : 'demo';

            try {
                if (token) {
                    localStorage.setItem(TOKEN_KEY, token);
                    localStorage.setItem(TOKEN_MODE_KEY, issuer);
                } else {
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(TOKEN_MODE_KEY);
                }
            } catch (error) {
                /* sin persistencia: la sesión dura lo que la pestaña */
            }
        }

        /**
         * El token que entiende el backend que va a responder. Tras caer a
         * modo demo, uno emitido por el servidor no vale aquí: se conserva
         * guardado para cuando el servidor vuelva, pero no se envía.
         */
        tokenFor(mode) {
            if (!this.token) return null;
            return this.tokenMode === mode ? this.token : null;
        }

        /* ------------------------------------------------------------------
           Petición genérica
           ------------------------------------------------------------------ */

        /**
         * @param {string} path - Ruta de la API, p. ej. "/api/posts?page=2".
         * @param {{method?: string, body?: object}} [options]
         * @returns {Promise<any>} El contenido de "data" de la respuesta.
         * @throws {Error} Con "message" legible en español y "status".
         */
        async request(path, options = {}) {
            try {
                if (this.mode === 'unknown') await this.ready();

                if (this.mode === 'remote') {
                    try {
                        return await this.fetchJson(path, options);
                    } catch (error) {
                        // Un 4xx, o el modo sin respaldo, salen por aquí con el
                        // error del servidor intacto.
                        if (!this.shouldFallBack(error)) throw error;
                        this.degrade(error);
                    }
                }

                const response = await this.mock.request(path, {
                    method: options.method,
                    body: options.body,
                    token: this.tokenFor('demo'),
                });
                return response.data;
            } catch (error) {
                throw this.normalizeError(error);
            }
        }

        /**
         * Solo se recurre a la demo cuando el servidor no ha llegado a
         * responder: red caída, tiempo agotado o un fallo suyo (5xx). Un 4xx
         * es una respuesta legítima y se propaga.
         */
        shouldFallBack(error) {
            if (this.config.fallback === false) return false;
            const status = error && typeof error.status === 'number' ? error.status : 0;
            return status === 0 || status >= 500;
        }

        /* ------------------------------------------------------------------
           Transporte HTTP
           ------------------------------------------------------------------ */

        async fetchJson(path, options = {}, timeoutMs) {
            const limit = timeoutMs || this.config.timeoutMs;
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), limit) : null;

            let response;
            try {
                response = await global.fetch(`${this.baseUrl}${path}`, {
                    method: (options.method || 'GET').toUpperCase(),
                    headers: this.headers(),
                    body: options.body === undefined ? undefined : JSON.stringify(options.body),
                    signal: controller ? controller.signal : undefined,
                    credentials: 'omit',
                });
            } catch (error) {
                throw this.transportError(error, limit);
            } finally {
                if (timer) clearTimeout(timer);
            }

            const payload = await this.readBody(response);
            if (!response.ok) throw this.httpError(response, payload);

            // El contrato envuelve todo en { data: … }; si alguna vez llega
            // algo plano, se devuelve tal cual antes que perderlo.
            return payload && typeof payload === 'object' && 'data' in payload
                ? payload.data
                : payload;
        }

        headers() {
            const headers = {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            };

            // Supabase exige la clave pública en toda petición, y el Bearer es
            // el JWT de quien ha iniciado sesión o la propia clave si nadie lo ha hecho.
            if (this.config.anonKey) headers.apikey = this.config.anonKey;

            const bearer = this.tokenFor('remote') || this.config.anonKey;
            if (bearer) headers.Authorization = `Bearer ${bearer}`;

            return headers;
        }

        async readBody(response) {
            let text = '';
            try {
                text = await response.text();
            } catch (error) {
                return null;
            }

            if (!text) return null;

            try {
                return JSON.parse(text);
            } catch (error) {
                // Un proxy o una página de error del hosting: el cuerpo no es
                // JSON, pero su texto sigue siendo la mejor pista que hay.
                return { message: text.slice(0, 200) };
            }
        }

        httpError(response, payload) {
            const known = {
                401: 'Necesitas iniciar sesión para continuar',
                403: 'No tienes permiso para hacer esto',
                404: 'No encontramos lo que buscabas',
                429: 'Demasiadas peticiones seguidas. Espera un momento.',
            };

            const message = (payload && (payload.message || payload.error))
                || known[response.status]
                || `El servidor respondió con un error (${response.status})`;

            const error = new Error(String(message));
            error.status = response.status;
            return error;
        }

        transportError(error, limit) {
            const aborted = error && (error.name === 'AbortError' || error.name === 'TimeoutError');

            const wrapped = new Error(aborted
                ? `El servidor tardó más de ${Math.round(limit / 1000)} s en responder`
                : 'No se pudo contactar con el servidor');

            wrapped.status = 0;
            wrapped.cause = error;
            return wrapped;
        }

        normalizeError(error) {
            if (error instanceof Error) return error;
            const wrapped = new Error(String(error));
            wrapped.status = 500;
            return wrapped;
        }

        /* ------------------------------------------------------------------
           Publicaciones
           ------------------------------------------------------------------ */

        /** Serializa filtros a query string, omitiendo vacíos y uniendo arrays. */
        toQuery(filters = {}) {
            const params = new URLSearchParams();

            Object.entries(filters).forEach(([key, value]) => {
                if (value === undefined || value === null || value === '') return;
                if (Array.isArray(value)) {
                    if (value.length) params.set(key, value.join(','));
                } else {
                    params.set(key, String(value));
                }
            });

            const query = params.toString();
            return query ? `?${query}` : '';
        }

        /**
         * @param {object} [filters] - q, category, district, condition,
         *   min_price, max_price, sort, page, per_page, author_id.
         *   sort: recent | budget_asc | budget_desc | popular | interest | commented
         */
        getRequests(filters = {}) {
            return this.request(`/api/requests${this.toQuery(filters)}`);
        }

        getRequest(id) {
            return this.request(`/api/requests/${id}`);
        }

        getCategories() {
            return this.request('/api/requests/categories');
        }

        getMyRequests() {
            return this.request('/api/requests/mine');
        }

        getSavedRequests() {
            return this.request('/api/requests/saved');
        }

        createRequest(data) {
            return this.request('/api/requests', { method: 'POST', body: data });
        }

        updateRequest(id, data) {
            return this.request(`/api/requests/${id}`, { method: 'PUT', body: data });
        }

        deleteRequest(id) {
            return this.request(`/api/requests/${id}`, { method: 'DELETE' });
        }

        /** Quien pidió algo puede retirarlo mientras nadie haya cerrado trato. */
        cancelRequest(id) {
            return this.request(`/api/requests/${id}/cancel`, { method: 'POST' });
        }

        /** Otros pedidos parecidos, del mismo comprador o de la misma categoría. */
        getRelatedRequests(id) {
            return this.request(`/api/requests/${id}/related`);
        }

        /* ------------------------------------------------------------------
           Ofertas — lo que un vendedor responde a un pedido
           ------------------------------------------------------------------ */

        /** Las ofertas de un pedido. Solo su dueño las ve todas. */
        getOffers(requestId) {
            return this.request(`/api/requests/${requestId}/offers`);
        }

        /**
         * Responder a un pedido.
         * @param {{message: string, price: number, photos?: string[],
         *          shop_address_hint?: string}} offer
         */
        createOffer(requestId, offer) {
            return this.request(`/api/requests/${requestId}/offers`, {
                method: 'POST',
                body: offer,
            });
        }

        /** @param {'all'|'pending'|'accepted'|'declined'} [status] */
        getMyOffers(status = 'all') {
            return this.request(`/api/offers/mine${this.toQuery({ status })}`);
        }

        /** Aceptar abre la conversación privada y crea el trato. */
        acceptOffer(offerId) {
            return this.request(`/api/offers/${offerId}/accept`, { method: 'POST' });
        }

        declineOffer(offerId) {
            return this.request(`/api/offers/${offerId}/decline`, { method: 'POST' });
        }

        /* ------------------------------------------------------------------
           Tratos: la compra y su calificación
           ------------------------------------------------------------------ */

        /** @param {'all'|'buyer'|'seller'} [role] */
        getDeals(role = 'all') {
            return this.request(`/api/deals${this.toQuery({ role })}`);
        }

        /** «Compra realizada»: lo confirma quien compró, que es quien lo sabe. */
        confirmDeal(dealId) {
            return this.request(`/api/deals/${dealId}/confirm`, { method: 'POST' });
        }

        /** @param {number} stars - De 1 a 5. */
        rateDeal(dealId, stars, comment = '') {
            return this.request(`/api/deals/${dealId}/rate`, {
                method: 'POST',
                body: { stars, comment },
            });
        }

        /* ------------------------------------------------------------------
           Interacciones sobre un pedido
           ------------------------------------------------------------------ */

        /** «También lo busco»: demanda acumulada, no un aplauso. */
        toggleMeToo(requestId) {
            return this.request(`/api/requests/${requestId}/me-too`, { method: 'POST' });
        }

        toggleSave(requestId) {
            return this.request(`/api/requests/${requestId}/save`, { method: 'POST' });
        }

        getComments(requestId) {
            return this.request(`/api/requests/${requestId}/comments`);
        }

        createComment(requestId, text) {
            return this.request(`/api/requests/${requestId}/comments`, {
                method: 'POST',
                body: { text },
            });
        }

        deleteComment(requestId, commentId) {
            return this.request(`/api/requests/${requestId}/comments/${commentId}`, { method: 'DELETE' });
        }

        /** Denunciar una publicación que ya está visible en el foro. */
        reportRequest(requestId, { category = 'otro', reason = '' } = {}) {
            return this.request(`/api/requests/${requestId}/report`, {
                method: 'POST',
                body: { category, reason },
            });
        }

        /* ------------------------------------------------------------------
           Avisos
           ------------------------------------------------------------------ */

        getNotifications({ unreadOnly = false } = {}) {
            return this.request(`/api/notifications${unreadOnly ? '?unread=1' : ''}`);
        }

        markNotificationRead(id) {
            return this.request(`/api/notifications/${id}/read`, { method: 'POST' });
        }

        markAllNotificationsRead() {
            return this.request('/api/notifications/read-all', { method: 'POST' });
        }

        /* ------------------------------------------------------------------
           Mapa
           ------------------------------------------------------------------ */

        getMapSellers(filters = {}) {
            return this.request(`/api/map/sellers${this.toQuery(filters)}`);
        }

        getDistricts() {
            return this.request('/api/map/districts');
        }

        /* ------------------------------------------------------------------
           Administración
           ------------------------------------------------------------------ */

        getAdminStats() {
            return this.request('/api/admin/stats');
        }

        getAdminRequests(status = 'pending', q = '') {
            return this.request(`/api/admin/requests${this.toQuery({ status, q })}`);
        }

        approveRequest(id) {
            return this.request(`/api/admin/requests/${id}/approve`, { method: 'POST' });
        }

        rejectRequest(id, reason) {
            return this.request(`/api/admin/requests/${id}/reject`, {
                method: 'POST',
                body: { reason },
            });
        }

        /** Marca o desmarca un pedido como no apto para menores (ADR-027). */
        setRequestAdult(id, adult) {
            return this.request(`/api/admin/requests/${id}/adult`, {
                method: 'POST',
                body: { adult: Boolean(adult) },
            });
        }

        getAdminSellers(status = 'pending') {
            return this.request(`/api/admin/sellers${this.toQuery({ status })}`);
        }

        approveSeller(id) {
            return this.request(`/api/admin/sellers/${id}/approve`, { method: 'POST' });
        }

        rejectSeller(id, reason) {
            return this.request(`/api/admin/sellers/${id}/reject`, {
                method: 'POST',
                body: { reason },
            });
        }

        getModerationLog() {
            return this.request('/api/admin/log');
        }

        /** @param {'open'|'resolved'|'all'} [status] */
        getAdminReports(status = 'open') {
            return this.request(`/api/admin/reports${this.toQuery({ status })}`);
        }

        resolveReport(id, resolution) {
            return this.request(`/api/admin/reports/${id}/resolve`, {
                method: 'POST',
                body: { resolution },
            });
        }

        /* ------------------------------------------------------------------
           Bandeja de la IA y ajustes
           ------------------------------------------------------------------ */

        /** @param {'all'|'approved'|'rejected'|'pending'} [decision] */
        getAdminInbox(decision = 'all') {
            return this.request(`/api/admin/inbox${this.toQuery({ decision })}`);
        }

        markInboxRead(id) {
            return this.request(`/api/admin/inbox/${id}/read`, { method: 'POST' });
        }

        markInboxSent(id) {
            return this.request(`/api/admin/inbox/${id}/sent`, { method: 'POST' });
        }

        clearInbox() {
            return this.request('/api/admin/inbox', { method: 'DELETE' });
        }

        getSettings() {
            return this.request('/api/admin/settings');
        }

        updateSettings(data) {
            return this.request('/api/admin/settings', { method: 'PUT', body: data });
        }

        /**
         * Enlace que abre WhatsApp con el aviso ya redactado.
         *
         * Un sitio sin servidor no puede enviar mensajes por su cuenta: haría
         * falta guardar credenciales, y en un sitio estático quedarían a la
         * vista de cualquiera. Con este enlace el mensaje llega igual, en el
         * chat propio del administrador, a un clic.
         *
         * @param {string} phone - Número con código de país, solo dígitos.
         * @param {string} message
         * @returns {string|null}
         */
        whatsappLink(phone, message) {
            const digits = String(phone || '').replace(/\D/g, '');
            if (!digits) return null;

            // Perú: si llega un móvil de 9 dígitos, se antepone el 51
            const full = digits.length === 9 ? `51${digits}` : digits;

            return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
        }

        /* ------------------------------------------------------------------
           Autenticación
           ------------------------------------------------------------------ */

        async login(email, password) {
            const data = await this.request('/api/auth/login', {
                method: 'POST',
                body: { email, password },
            });

            if (data.access_token) this.setToken(data.access_token);
            return data;
        }

        async register(payload) {
            const data = await this.request('/api/auth/register', {
                method: 'POST',
                body: payload,
            });

            if (data.access_token) this.setToken(data.access_token);
            return data;
        }

        async logout() {
            try {
                await this.request('/api/auth/logout', { method: 'POST' });
            } finally {
                this.setToken(null);
            }
        }

        async getCurrentUser() {
            if (!this.token) return null;

            await this.ready();

            // El token lo emitió el otro backend: aquí no vale, pero tampoco
            // se borra. Si el servidor vuelve, la sesión sigue en pie.
            if (!this.tokenFor(this.mode)) return null;

            try {
                return await this.request('/api/auth/me');
            } catch (error) {
                // Solo un rechazo de autenticación significa que el token ya no
                // sirve. Un fallo de red no debe cerrarle la sesión a nadie.
                if (error.status === 401 || error.status === 403) this.setToken(null);
                return null;
            }
        }

        updateProfile(data) {
            return this.request('/api/auth/me', { method: 'PUT', body: data });
        }

        /** Una cuenta solicita ser vendedor, que es lo que habilita ofertar. */
        applyAsSeller(motivation = '') {
            return this.request('/api/auth/seller-application', {
                method: 'POST',
                body: { motivation },
            });
        }

        /* ------------------------------------------------------------------
           Mensajería
           ------------------------------------------------------------------ */

        getConversations() { return this.request('/api/chat/conversations'); }

        openConversation(requestId) {
            return this.request('/api/chat/conversations', {
                method: 'POST',
                body: { request_id: requestId },
            });
        }

        getMessages(conversationId) {
            return this.request(`/api/chat/conversations/${conversationId}/messages`);
        }

        /**
         * Enseñar el producto es media conversación, así que un mensaje puede
         * ser solo fotos: `text` viaja vacío y el almacén lo admite.
         */
        sendMessage(conversationId, text, photos) {
            return this.request(`/api/chat/conversations/${conversationId}/messages`, {
                method: 'POST',
                body: { text, photos: Array.isArray(photos) ? photos : [] },
            });
        }

        /**
         * Respuesta automática de quien publica. Es síncrona a propósito: la
         * interfaz decide cuánto esperar para simular que está escribiendo.
         *
         * Solo existe en modo demo. Con servidor detrás hay una persona real
         * al otro lado y ponerle palabras en la boca sería mentir; `chat.js`
         * ya contempla que no haya respuesta.
         */
        simulateReply(conversationId, userText) {
            if (this.mode === 'remote') return null;
            return this.mock.autoReply(conversationId, userText);
        }

        /* ------------------------------------------------------------------
           Datos locales
           ------------------------------------------------------------------ */

        /**
         * Devuelve el catálogo local a su estado inicial y cierra la sesión.
         *
         * Solo toca los datos de este navegador: con servidor detrás no borra
         * nada suyo, y por eso tampoco tira una sesión que el servidor emitió.
         */
        resetData() {
            this.mock.resetDemo();
            if (this.tokenMode !== 'remote') this.setToken(null);
        }
    }

    // Instancia única compartida por todas las páginas.
    global.api = new ApiClient();
})(window);
