/**
 * DiscoveryShop · Capa de datos
 *
 * Único punto por el que la interfaz obtiene o modifica datos. Todo se resuelve
 * en el navegador contra MockAPI, con persistencia en localStorage: no hay
 * servidor ni peticiones de red, así que el sitio funciona igual publicado en
 * GitHub Pages, servido en local o abierto directamente desde el disco.
 *
 * Las páginas nunca llaman a MockAPI: siempre pasan por aquí. Si algún día se
 * añade un servidor, este archivo es el único que tendría que cambiar.
 */
(function (global) {
    'use strict';

    const TOKEN_KEY = 'discoveryshop:token';

    class ApiClient {
        constructor() {
            this.mock = new global.MockAPI();
            this.token = this.readToken();
        }

        /* ------------------------------------------------------------------
           Disponibilidad
           ------------------------------------------------------------------ */

        /**
         * Se mantiene para que las páginas puedan esperar a la capa de datos sin
         * conocer su implementación. Hoy resuelve de inmediato.
         */
        ready() {
            return Promise.resolve();
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

        setToken(token) {
            this.token = token;
            try {
                if (token) {
                    localStorage.setItem(TOKEN_KEY, token);
                } else {
                    localStorage.removeItem(TOKEN_KEY);
                }
            } catch (error) {
                /* sin persistencia: la sesión dura lo que la pestaña */
            }
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
                const response = await this.mock.request(path, {
                    method: options.method,
                    body: options.body,
                    token: this.token,
                });
                return response.data;
            } catch (error) {
                throw this.normalizeError(error);
            }
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
         *   sort: recent | price_asc | price_desc | popular | interest | commented
         */
        getPosts(filters = {}) {
            return this.request(`/api/posts${this.toQuery(filters)}`);
        }

        getPost(id) {
            return this.request(`/api/posts/${id}`);
        }

        getCategories() {
            return this.request('/api/posts/categories');
        }

        getMyPosts() {
            return this.request('/api/posts/mine');
        }

        getSavedPosts() {
            return this.request('/api/posts/saved');
        }

        createPost(data) {
            return this.request('/api/posts', { method: 'POST', body: data });
        }

        updatePost(id, data) {
            return this.request(`/api/posts/${id}`, { method: 'PUT', body: data });
        }

        deletePost(id) {
            return this.request(`/api/posts/${id}`, { method: 'DELETE' });
        }

        /* ------------------------------------------------------------------
           Interacciones del foro
           ------------------------------------------------------------------ */

        toggleLike(postId) {
            return this.request(`/api/posts/${postId}/like`, { method: 'POST' });
        }

        toggleInterest(postId) {
            return this.request(`/api/posts/${postId}/interest`, { method: 'POST' });
        }

        toggleSave(postId) {
            return this.request(`/api/posts/${postId}/save`, { method: 'POST' });
        }

        getComments(postId) {
            return this.request(`/api/posts/${postId}/comments`);
        }

        createComment(postId, text) {
            return this.request(`/api/posts/${postId}/comments`, {
                method: 'POST',
                body: { text },
            });
        }

        deleteComment(postId, commentId) {
            return this.request(`/api/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
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

        getAdminPosts(status = 'pending', q = '') {
            return this.request(`/api/admin/posts${this.toQuery({ status, q })}`);
        }

        approvePost(id) {
            return this.request(`/api/admin/posts/${id}/approve`, { method: 'POST' });
        }

        rejectPost(id, reason) {
            return this.request(`/api/admin/posts/${id}/reject`, {
                method: 'POST',
                body: { reason },
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

        getCurrentUser() {
            if (!this.token) return Promise.resolve(null);
            return this.request('/api/auth/me').catch(() => {
                // Token caducado o inválido: limpiamos y seguimos como invitado.
                this.setToken(null);
                return null;
            });
        }

        updateProfile(data) {
            return this.request('/api/auth/me', { method: 'PUT', body: data });
        }

        /** Un comprador solicita permiso para publicar artículos. */
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

        openConversation(postId) {
            return this.request('/api/chat/conversations', {
                method: 'POST',
                body: { post_id: postId },
            });
        }

        getMessages(conversationId) {
            return this.request(`/api/chat/conversations/${conversationId}/messages`);
        }

        sendMessage(conversationId, text) {
            return this.request(`/api/chat/conversations/${conversationId}/messages`, {
                method: 'POST',
                body: { text },
            });
        }

        /**
         * Respuesta automática de quien publica. Es síncrona a propósito: la
         * interfaz decide cuánto esperar para simular que está escribiendo.
         */
        simulateReply(conversationId, userText) {
            return this.mock.autoReply(conversationId, userText);
        }

        /* ------------------------------------------------------------------
           Datos locales
           ------------------------------------------------------------------ */

        /** Devuelve el catálogo a su estado inicial y cierra la sesión. */
        resetData() {
            this.mock.resetDemo();
            this.setToken(null);
        }
    }

    // Instancia única compartida por todas las páginas.
    global.api = new ApiClient();
})(window);
