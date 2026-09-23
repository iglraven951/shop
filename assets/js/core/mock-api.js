/**
 * DiscoveryShop · Backend simulado
 *
 * Implementa en el navegador el contrato completo del comercio inverso, con
 * persistencia en localStorage. Gracias a esto el sitio funciona al 100 % en
 * GitHub Pages sin ningún servidor detrás.
 *
 * **Comercio inverso**: aquí no hay un catálogo de lo que alguien vende. Hay
 * una lista de lo que la gente necesita. El comprador publica un **pedido**,
 * los vendedores responden con **ofertas**, el comprador acepta una, hablan por
 * privado, confirma la compra y califica al vendedor. De ahí sale la
 * reputación de cada local: de compras reales, no de un número puesto a mano.
 *
 *   pedido → ofertas → aceptada → conversación → compra → calificación
 *
 * Modelo de permisos:
 *   · comprador  — publica pedidos, acepta ofertas, confirma y califica.
 *   · vendedor   — responde pedidos con ofertas, si el administrador lo aprobó.
 *   · admin      — revisa pedidos, solicitudes de vendedor y denuncias.
 *
 * Toda respuesta sigue la forma { success, data } o lanza un Error con .status.
 */
(function (global) {
    'use strict';

/* Al subir la versión, los datos guardados en el navegador se descartan y se
   regeneran desde `seed.js`. Se sube cada vez que el modelo cambia: la v3 trajo
   las fotos reales del catálogo, la bandeja de la IA y los ajustes; la v4 trae
   el estado de venta, la fecha de guardado, las denuncias y los avisos que ya
   se escribían pero que nadie llegaba a ver. */
    const STORAGE_KEY = 'discoveryshop:db:v5';
    const SCHEMA_VERSION = 5;

    /* ----------------------------------------------------------------------
       Utilidades
       ---------------------------------------------------------------------- */

    function uid(prefix) {
        return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }

    const nowIso = () => new Date().toISOString();

    /** Lee de localStorage tolerando modo privado o almacenamiento bloqueado. */
    function safeRead(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.warn('[MockAPI] No se pudo leer el almacenamiento local:', error);
            return null;
        }
    }

    function safeWrite(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('[MockAPI] No se pudo guardar en el almacenamiento local:', error);
            return false;
        }
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const ok = (data) => ({ success: true, data });

    function fail(message, status = 400) {
        const error = new Error(message);
        error.status = status;
        throw error;
    }

    /** Normaliza texto para búsquedas: minúsculas y sin acentos. */
    function normalize(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    }

    /** Hash ligero para contraseñas del modo demo (no es seguridad real). */
    function weakHash(text) {
        let hash = 5381;
        for (let i = 0; i < text.length; i += 1) {
            hash = (hash * 33) ^ text.charCodeAt(i);
        }
        return (hash >>> 0).toString(36);
    }

    /** Alterna la pertenencia de un id en una lista. Devuelve si quedó dentro. */
    function toggleIn(list, id) {
        const index = list.indexOf(id);
        if (index === -1) {
            list.push(id);
            return true;
        }
        list.splice(index, 1);
        return false;
    }

    /* ----------------------------------------------------------------------
       Base de datos
       ---------------------------------------------------------------------- */

    class MockDatabase {
        constructor() {
            this.state = this.load();
        }

        load() {
            const stored = safeRead(STORAGE_KEY);
            if (stored && stored.version === SCHEMA_VERSION) return stored;
            return this.createInitialState();
        }

        createInitialState() {
            const seed = global.DiscoverySeed.build();

            // Todas las cuentas de demostración comparten la misma contraseña
            // para que probar el sitio publicado sea inmediato.
            const demoHash = weakHash('demo1234');
            seed.users.forEach((user) => { user.password_hash = demoHash; });

            const admin = {
                id: 'u-admin',
                username: 'Administración',
                email: 'admin@discoveryshop.pe',
                password_hash: demoHash,
                avatar_url: null,
                role: 'admin',
                seller_status: null,
                district: 'Cercado',
                location: { lat: -16.3989, lng: -71.5350, district: 'Cercado', city: 'Arequipa', country: 'Perú' },
                phone: '',
                bio: 'Equipo de moderación de DiscoveryShop.',
                shop_name: null,
                rating: 0,
                rating_count: 0,
                total_requests: 0,
                total_offers: 0,
                total_sales: 0,
                verified: true,
                created_at: nowIso(),
            };

            const state = {
                version: SCHEMA_VERSION,
                users: [admin, ...seed.users],
                requests: seed.requests,
                // Lo que los vendedores responden, y los tratos que se cerraron
                offers: seed.offers,
                deals: seed.deals,
                categories: seed.categories,
                districts: seed.districts,
                sessions: {},
                conversations: [],
                notifications: [],
                // Denuncias de la comunidad sobre publicaciones ya visibles
                reports: [],
                // Registro de decisiones de moderación, humanas y de la IA
                moderation_log: [],
                // Avisos de la IA dirigidos al administrador
                admin_inbox: [],
                // Ajustes: a qué número de WhatsApp van las notificaciones
                settings: { whatsapp: '', auto_notify: true },
            };

            this.seedNotifications(state);

            this.persist(state);
            return state;
        }

        /**
         * Avisos de partida, derivados del propio catálogo.
         *
         * Sin esto la campana nace vacía y la función más importante del foro
         * — enterarte de que alguien quiere tu cosa — no se ve hasta que otra
         * persona reacciona, que en una demo de un solo navegador no pasa
         * nunca. Se construyen de lo que ya hay: quien comentó, comentó de
         * verdad, y la publicación existe.
         */
        seedNotifications(state) {
            const visible = state.requests.filter((p) => p.status === 'approved');
            const hour = 3600 * 1000;
            let age = 0;

            const push = (request, type, text) => {
                age += 1;
                state.notifications.push({
                    id: `ntf-seed-${state.notifications.length}`,
                    user_id: request.buyer.id,
                    type,
                    request_id: request.id,
                    text,
                    // Los tres más recientes llegan sin leer: es lo que hace
                    // que la campana tenga algo que contar al entrar.
                    read: age > 3,
                    created_at: new Date(Date.now() - age * 5 * hour).toISOString(),
                });
            };

            visible
                .filter((request) => request.comments.length)
                .slice(0, 5)
                .forEach((request) => {
                    const last = request.comments[request.comments.length - 1];
                    push(request, 'comment', `${last.author.username} comentó en «${request.title}»`);
                });

            /* Lo que de verdad espera quien publicó: que alguien responda.
               Se deriva de las ofertas que el propio catálogo ya trae. */
            (state.offers || [])
                .filter((offer) => offer.status === 'pending')
                .slice(0, 6)
                .forEach((offer) => {
                    const request = visible.find((r) => r.id === offer.request_id);
                    if (!request) return;
                    push(request, 'offer_received',
                        `${offer.shop_name} respondió a tu pedido «${request.title}»`);
                });

            // El más reciente arriba, como los lee la interfaz
            state.notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        persist(state = this.state) {
            safeWrite(STORAGE_KEY, state);
        }

        reset() {
            this.state = this.createInitialState();
            return this.state;
        }
    }

    /* ----------------------------------------------------------------------
       API simulada
       ---------------------------------------------------------------------- */

    class MockAPI {
        constructor() {
            this.db = new MockDatabase();
            this.latency = 160;
        }

        get state() { return this.db.state; }

        save() { this.db.persist(); }

        /* ------------------------------ Sesión ------------------------------ */

        userFromToken(token) {
            if (!token) return null;
            const userId = this.state.sessions[token];
            return userId ? this.state.users.find((u) => u.id === userId) || null : null;
        }

        requireUser(token) {
            const user = this.userFromToken(token);
            if (!user) fail('Necesitas iniciar sesión para continuar', 401);
            return user;
        }

        requireAdmin(token) {
            const user = this.requireUser(token);
            if (user.role !== 'admin') fail('Esta sección es solo para administradores', 403);
            return user;
        }

        /** Un vendedor solo publica si el administrador aprobó su solicitud. */
        requireApprovedSeller(token) {
            const user = this.requireUser(token);

            if (user.role === 'admin') return user;

            if (user.seller_status !== 'approved') {
                const reason = {
                    pending: 'Tu solicitud de vendedor está en revisión. Te avisaremos cuando la aprobemos.',
                    rejected: 'Tu solicitud de vendedor fue rechazada. Puedes volver a enviarla desde tu perfil.',
                }[user.seller_status] || 'Necesitas una cuenta de vendedor aprobada para responder pedidos.';

                fail(reason, 403);
            }

            return user;
        }

        publicUser(user) {
            const { password_hash: _omit, ...rest } = user;
            return rest;
        }

        /* ---------------------------- Enrutado ---------------------------- */

        async request(path, options = {}) {
            await delay(this.latency);

            const method = (options.method || 'GET').toUpperCase();
            const url = new URL(path, 'https://demo.local');
            const route = url.pathname.replace(/\/+$/, '') || '/';

            const handler = this.resolve(method, route);
            if (!handler) fail(`Recurso no encontrado: ${method} ${route}`, 404);

            return handler.fn.call(this, {
                query: url.searchParams,
                body: options.body || {},
                token: options.token || null,
                params: handler.params,
            });
        }

        resolve(method, route) {
            const table = [
                ['GET', /^\/api\/health$/, this.health],

                // Pedidos: lo que un comprador busca
                ['GET', /^\/api\/requests$/, this.listRequests],
                ['POST', /^\/api\/requests$/, this.createRequest],
                ['GET', /^\/api\/requests\/categories$/, this.listCategories],
                ['GET', /^\/api\/requests\/saved$/, this.listSaved],
                ['GET', /^\/api\/requests\/mine$/, this.listMyRequests],
                ['GET', /^\/api\/requests\/([\w-]+)\/related$/, this.relatedRequests],
                ['GET', /^\/api\/requests\/([\w-]+)$/, this.getRequest],
                ['PUT', /^\/api\/requests\/([\w-]+)$/, this.updateRequest],
                ['DELETE', /^\/api\/requests\/([\w-]+)$/, this.deleteRequest],
                ['POST', /^\/api\/requests\/([\w-]+)\/cancel$/, this.cancelRequest],

                // Ofertas: lo que un vendedor responde
                ['GET', /^\/api\/offers\/mine$/, this.listMyOffers],
                ['GET', /^\/api\/requests\/([\w-]+)\/offers$/, this.listOffers],
                ['POST', /^\/api\/requests\/([\w-]+)\/offers$/, this.createOffer],
                ['POST', /^\/api\/offers\/([\w-]+)\/accept$/, this.acceptOffer],
                ['POST', /^\/api\/offers\/([\w-]+)\/decline$/, this.declineOffer],

                // Tratos cerrados y su calificación
                ['GET', /^\/api\/deals$/, this.listDeals],
                ['POST', /^\/api\/deals\/([\w-]+)\/confirm$/, this.confirmDeal],
                ['POST', /^\/api\/deals\/([\w-]+)\/rate$/, this.rateDeal],

                // Interacciones sobre un pedido
                ['POST', /^\/api\/requests\/([\w-]+)\/me-too$/, this.toggleMeToo],
                ['POST', /^\/api\/requests\/([\w-]+)\/save$/, this.toggleSave],
                ['GET', /^\/api\/requests\/([\w-]+)\/comments$/, this.listComments],
                ['POST', /^\/api\/requests\/([\w-]+)\/comments$/, this.createComment],
                ['DELETE', /^\/api\/requests\/([\w-]+)\/comments\/([\w-]+)$/, this.deleteComment],
                ['POST', /^\/api\/requests\/([\w-]+)\/report$/, this.reportRequest],

                // Avisos dirigidos a quien ha iniciado sesión
                ['GET', /^\/api\/notifications$/, this.listNotifications],
                ['POST', /^\/api\/notifications\/read-all$/, this.markAllNotificationsRead],
                ['POST', /^\/api\/notifications\/([\w-]+)\/read$/, this.markNotificationRead],

                // Autenticación y cuenta
                ['POST', /^\/api\/auth\/register$/, this.register],
                ['POST', /^\/api\/auth\/login$/, this.login],
                ['POST', /^\/api\/auth\/logout$/, this.logout],
                ['GET', /^\/api\/auth\/me$/, this.me],
                ['PUT', /^\/api\/auth\/me$/, this.updateProfile],
                ['POST', /^\/api\/auth\/seller-application$/, this.applyAsSeller],

                // Mapa
                ['GET', /^\/api\/map\/sellers$/, this.mapSellers],
                ['GET', /^\/api\/map\/districts$/, this.listDistricts],

                // Administración
                ['GET', /^\/api\/admin\/stats$/, this.adminStats],
                ['GET', /^\/api\/admin\/requests$/, this.adminRequests],
                ['POST', /^\/api\/admin\/requests\/([\w-]+)\/approve$/, this.approveRequest],
                ['POST', /^\/api\/admin\/requests\/([\w-]+)\/reject$/, this.rejectRequest],
                ['GET', /^\/api\/admin\/sellers$/, this.adminSellers],
                ['POST', /^\/api\/admin\/sellers\/([\w-]+)\/approve$/, this.approveSeller],
                ['POST', /^\/api\/admin\/sellers\/([\w-]+)\/reject$/, this.rejectSeller],
                ['GET', /^\/api\/admin\/log$/, this.adminLog],
                ['GET', /^\/api\/admin\/reports$/, this.adminReports],
                ['POST', /^\/api\/admin\/reports\/([\w-]+)\/resolve$/, this.resolveReport],
                ['GET', /^\/api\/admin\/inbox$/, this.adminInbox],
                ['POST', /^\/api\/admin\/inbox\/([\w-]+)\/read$/, this.markInboxRead],
                ['POST', /^\/api\/admin\/inbox\/([\w-]+)\/sent$/, this.markInboxSent],
                ['DELETE', /^\/api\/admin\/inbox$/, this.clearInbox],
                ['GET', /^\/api\/admin\/settings$/, this.getSettings],
                ['PUT', /^\/api\/admin\/settings$/, this.updateSettings],

                // Mensajería directa
                ['GET', /^\/api\/chat\/conversations$/, this.listConversations],
                ['POST', /^\/api\/chat\/conversations$/, this.openConversation],
                ['GET', /^\/api\/chat\/conversations\/([\w-]+)\/messages$/, this.listMessages],
                ['POST', /^\/api\/chat\/conversations\/([\w-]+)\/messages$/, this.sendMessage],
            ];

            for (const [verb, pattern, fn] of table) {
                if (verb !== method) continue;
                const match = route.match(pattern);
                if (match) return { fn, params: { id: match[1], sub: match[2] } };
            }

            return null;
        }

        /* --------------------------- Publicaciones --------------------------- */

        health() {
            return ok({
                status: 'ok',
                mode: 'demo',
                requests: this.state.requests.filter((p) => p.status === 'approved').length,
            });
        }

        /** Añade al pedido los datos que dependen de quién lo mira. */
        decorate(request, user) {
            const id = user ? user.id : null;
            const offers = (this.state.offers || []).filter((o) => o.request_id === request.id);

            return {
                ...request,
                me_too_by_me: id ? request.me_too.includes(id) : false,
                saved: id ? request.saves.includes(id) : false,
                is_mine: id ? request.buyer.id === id : false,
                offers_count: offers.length,
                // Si quien mira es vendedor, si ya respondió y con qué
                my_offer: id ? (offers.find((o) => o.seller.id === id) || null) : null,
            };
        }

        /** El pedido, o un 404 que no distingue entre «no existe» y «no es tuyo». */
        findRequest(id) {
            const request = this.state.requests.find((r) => r.id === id);
            if (!request) fail('Pedido no encontrado', 404);
            return request;
        }

        listRequests({ query, token }) {
            const user = this.userFromToken(token);

            const page = Math.max(1, parseInt(query.get('page') || '1', 10));
            const perPage = Math.min(48, Math.max(1, parseInt(query.get('per_page') || '10', 10)));
            const search = normalize(query.get('q') || '');
            const categories = (query.get('category') || '').split(',').filter(Boolean);
            const districts = (query.get('district') || '').split(',').filter(Boolean);
            const states = (query.get('state') || '').split(',').filter(Boolean);
            const conditions = (query.get('condition') || '').split(',').filter(Boolean);
            const minPrice = parseFloat(query.get('min_price') || '');
            const maxPrice = parseFloat(query.get('max_price') || '');
            const buyerId = query.get('buyer_id');
            const sort = query.get('sort') || 'recent';

            // El tablón público solo muestra pedidos aprobados.
            let items = this.state.requests.filter((p) => p.status === 'approved');

            if (search) {
                items = items.filter((p) => {
                    const haystack = normalize(
                        `${p.title} ${p.description} ${p.category.name} ${p.buyer.username} ${p.district}`
                    );
                    return search.split(/\s+/).every((word) => haystack.includes(word));
                });
            }

            if (categories.length) items = items.filter((p) => categories.includes(p.category.id));
            if (districts.length) items = items.filter((p) => districts.includes(p.district));
            if (states.length) items = items.filter((p) => states.includes(p.state || 'open'));
            if (conditions.length) items = items.filter((p) => conditions.includes(p.condition));

            /* El presupuesto es un rango, no un precio, así que el filtro
               busca solapamiento: «hasta 500» tiene que encontrar a quien
               ofrece pagar entre 400 y 600, porque ahí hay trato posible. */
            if (!Number.isNaN(minPrice)) items = items.filter((p) => p.budget_max >= minPrice);
            if (!Number.isNaN(maxPrice)) items = items.filter((p) => p.budget_min <= maxPrice);
            if (buyerId) items = items.filter((p) => p.buyer.id === buyerId);

            items = this.sortRequests(items, sort);

            const total = items.length;
            const totalPages = Math.max(1, Math.ceil(total / perPage));
            const safePage = Math.min(page, totalPages);
            const start = (safePage - 1) * perPage;

            return ok({
                requests: items.slice(start, start + perPage).map((p) => this.decorate(p, user)),
                pagination: {
                    page: safePage,
                    per_page: perPage,
                    total,
                    total_pages: totalPages,
                    has_next: safePage < totalPages,
                    has_prev: safePage > 1,
                },
            });
        }

        sortRequests(items, sort) {
            const sorted = [...items];

            const offersOf = (request) =>
                (this.state.offers || []).filter((o) => o.request_id === request.id).length;

            switch (sort) {
                // Por presupuesto: para un vendedor, saber cuánto está dispuesto
                // a pagar quien pide es la primera criba.
                case 'price_asc': return sorted.sort((a, b) => a.budget_max - b.budget_max);
                case 'price_desc': return sorted.sort((a, b) => b.budget_max - a.budget_max);
                // Lo que más gente busca
                case 'popular': return sorted.sort((a, b) => b.me_too_count - a.me_too_count);
                // Lo que nadie ha respondido todavía: la mejor oportunidad
                case 'interest': return sorted.sort((a, b) => offersOf(a) - offersOf(b));
                case 'commented': return sorted.sort((a, b) => b.comment_count - a.comment_count);
                case 'recent':
                default: return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
        }

        listCategories() {
            const categories = this.state.categories.map((cat) => ({
                ...cat,
                count: this.state.requests.filter(
                    (p) => p.category.id === cat.id && p.status === 'approved'
                ).length,
            }));
            return ok({ categories });
        }

        listDistricts() {
            const districts = this.state.districts.map((d) => ({
                ...d,
                count: this.state.requests.filter((p) => p.district === d.name && p.status === 'approved').length,
            }));
            return ok({ districts, center: global.DiscoverySeed.AREQUIPA_CENTER });
        }

        getRequest({ params, token }) {
            const user = this.userFromToken(token);
            const request = this.state.requests.find((p) => p.id === params.id);

            if (!request) fail('Pedido no encontrado', 404);

            // Una publicación no aprobada solo la ve su autor o el administrador.
            const isOwner = user && request.buyer.id === user.id;
            const isAdmin = user && user.role === 'admin';
            if (request.status !== 'approved' && !isOwner && !isAdmin) {
                fail('Este pedido no está disponible', 404);
            }

            request.views += 1;
            this.save();

            return ok({ request: this.decorate(request, user) });
        }

        /**
         * Publicar un pedido: «Cuéntanos qué buscas».
         *
         * Aquí está la inversión. Antes esto exigía ser vendedor aprobado
         * porque se publicaba mercancía; ahora lo usa cualquiera con una
         * cuenta, porque lo que se publica es una necesidad. Pedir no
         * requiere permiso — vender sí.
         */
        createRequest({ body, token }) {
            const user = this.requireUser(token);

            const title = String(body.title || '').trim();
            const description = String(body.description || '').trim();

            if (title.length < 4) fail('Dile en pocas palabras qué buscas (mínimo 4 caracteres)');
            if (title.length > 90) fail('El título no puede superar los 90 caracteres');
            if (description.length < 20) {
                fail('Describe lo que buscas con al menos 20 caracteres: cuanto más claro, mejores respuestas');
            }

            const category = this.state.categories.find((c) => c.id === body.category_id);
            if (!category) fail('Elige una categoría para tu pedido');

            // El presupuesto es opcional, pero si se da tiene que tener sentido
            const hasBudget = body.budget_min !== undefined && body.budget_min !== ''
                || body.budget_max !== undefined && body.budget_max !== '';

            const budgetMin = Number(body.budget_min || 0);
            const budgetMax = Number(body.budget_max || 0);

            if (hasBudget) {
                if (!Number.isFinite(budgetMin) || !Number.isFinite(budgetMax)) {
                    fail('El presupuesto debe ser un número');
                }
                if (budgetMin < 0 || budgetMax < 0) fail('El presupuesto no puede ser negativo');
                if (budgetMax && budgetMin > budgetMax) {
                    fail('El presupuesto mínimo no puede ser mayor que el máximo');
                }
            }

            const districtName = body.district || user.district;
            const district = global.DiscoverySeed.districtByName(districtName);
            const emoji = body.emoji || category.icon;

            /* En qué estado le sirve. Al revés que antes: no describe la
               mercancía de nadie, sino hasta dónde está dispuesto a ceder
               quien busca — y es lo primero que un vendedor necesita saber
               para decidir si le merece la pena contestar. */
            const condition = MockAPI.CONDITIONS.includes(body.condition)
                ? body.condition
                : MockAPI.CONDITIONS[2];

            const request = {
                id: uid('req'),
                title,
                description,
                emoji,
                condition,
                /* Un pedido nuevo no trae foto: el objeto todavía no existe y
                   nadie va a subir la foto de algo que no tiene. Se ilustra
                   con el icono elegido sobre un degradado, que se genera aquí
                   mismo y no depende de ninguna red. Las fotos reales llegan
                   después, en la oferta del vendedor, que sí lo tiene delante. */
                image_url: global.DiscoverySeed.createImage(title, emoji),
                fallback_url: global.DiscoverySeed.createImage(title, emoji),
                budget_min: hasBudget ? budgetMin : 0,
                budget_max: hasBudget ? (budgetMax || budgetMin) : 0,
                category: { id: category.id, name: category.name, icon: category.icon },
                buyer: {
                    id: user.id,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    district: districtName,
                    rating: user.rating,
                    verified: user.verified,
                },
                district: districtName,
                location: {
                    lat: district.lat,
                    lng: district.lng,
                    district: districtName,
                    city: 'Arequipa',
                    country: 'Perú',
                },
                // Todo pedido pasa por revisión antes de que lo vean los vendedores.
                status: 'pending',
                rejection_reason: null,
                // Ciclo de vida, aparte de la moderación
                state: 'open',
                accepted_offer_id: null,
                offers_count: 0,
                me_too: [], me_too_count: 0,
                saves: [], saves_count: 0, saved_at: {},
                comments: [], comment_count: 0,
                views: 0,
                created_at: nowIso(),
                updated_at: nowIso(),
            };

            // La IA de la plataforma revisa la publicación en el acto. Puede
            // aprobarla, rechazarla o dejarla en duda para que la vea una
            // persona; lo que decide queda registrado con su motivo.
            const verdict = this.autoReview(request);

            this.state.requests.unshift(request);
            this.refreshBuyerCounters(user.id);
            this.save();

            return ok({ request: this.decorate(request, user), review: verdict });
        }

        /**
         * Aplica el veredicto del revisor automático a una publicación recién
         * creada y deja constancia para el administrador.
         *
         * @param {object} request - Se modifica en el sitio.
         * @returns {{decision: string, reason: string, confidence: number}}
         */
        autoReview(request) {
            const moderator = global.DiscoveryModerator;

            // Sin el revisor cargado, la publicación espera revisión humana:
            // nunca se publica algo sin que alguien o algo lo haya mirado.
            if (!moderator) {
                return { decision: 'pending', reason: 'Revisión automática no disponible.', confidence: 0 };
            }

            const verdict = moderator.review(request);

            request.status = verdict.decision;
            request.rejection_reason = verdict.decision === 'rejected' ? verdict.reason : null;
            request.review = {
                by: 'ia',
                decision: verdict.decision,
                reason: verdict.reason,
                confidence: verdict.confidence,
                signals: verdict.signals,
                at: nowIso(),
            };

            // Registro de moderación, igual que el de una decisión humana
            this.state.moderation_log.push({
                id: uid('log'),
                admin_id: 'ia',
                admin_name: 'IA de DiscoveryShop',
                action: verdict.decision === 'approved' ? 'approve_request'
                    : verdict.decision === 'rejected' ? 'reject_request' : 'flag_request',
                target_id: request.id,
                description: verdict.decision === 'approved'
                    ? `Aprobó «${request.title}»: ${verdict.reason}`
                    : verdict.decision === 'rejected'
                        ? `Rechazó «${request.title}»: ${verdict.reason}`
                        : `Dejó en revisión «${request.title}»: ${verdict.reason}`,
                confidence: verdict.confidence,
                created_at: nowIso(),
            });

            // Aviso a quien publicó
            const toAuthor = {
                approved: `Tu publicación «${request.title}» fue aprobada y ya es visible en el foro.`,
                rejected: `Tu publicación «${request.title}» fue rechazada: ${verdict.reason}`,
                pending: `Tu publicación «${request.title}» quedó en revisión. Te avisaremos en cuanto se resuelva.`,
            }[verdict.decision];

            this.notify(request.buyer.id, `request_${verdict.decision}`, request.id, toAuthor);

            // Aviso para el administrador, en su bandeja de la plataforma
            this.state.admin_inbox = this.state.admin_inbox || [];
            this.state.admin_inbox.unshift({
                id: uid('ai'),
                request_id: request.id,
                request_title: request.title,
                author: request.buyer.username,
                decision: verdict.decision,
                reason: verdict.reason,
                confidence: verdict.confidence,
                message: moderator.notificationText(request, verdict),
                read: false,
                sent_whatsapp: false,
                created_at: nowIso(),
            });

            return verdict;
        }

        updateRequest({ params, body, token }) {
            const user = this.requireUser(token);
            const request = this.state.requests.find((p) => p.id === params.id);

            if (!request) fail('Pedido no encontrado', 404);
            if (request.buyer.id !== user.id && user.role !== 'admin') {
                fail('Solo puedes editar tus propios pedidos', 403);
            }

            // Un pedido ya aceptado no se edita: cambiaría el trato por debajo
            // de quien ya respondió a lo que decía antes.
            if (request.state === 'matched' || request.state === 'fulfilled') {
                fail('Este pedido ya tiene una oferta aceptada y no se puede editar');
            }

            ['title', 'description', 'district'].forEach((key) => {
                if (body[key]) request[key] = body[key];
            });

            if (body.budget_min !== undefined && body.budget_min !== '') {
                const min = Number(body.budget_min);
                if (!Number.isFinite(min) || min < 0) fail('El presupuesto no puede ser negativo');
                request.budget_min = min;
            }

            if (body.budget_max !== undefined && body.budget_max !== '') {
                const max = Number(body.budget_max);
                if (!Number.isFinite(max) || max < 0) fail('El presupuesto no puede ser negativo');
                request.budget_max = max;
            }

            if (request.budget_max && request.budget_min > request.budget_max) {
                fail('El presupuesto mínimo no puede ser mayor que el máximo');
            }

            if (body.district) {
                const district = global.DiscoverySeed.districtByName(body.district);
                request.location = {
                    lat: district.lat,
                    lng: district.lng,
                    district: body.district,
                    city: 'Arequipa',
                    country: 'Perú',
                };
                request.buyer.district = body.district;
            }

            // Editar una publicación ya aprobada la devuelve a revisión.
            if (request.status === 'approved' && user.role !== 'admin') {
                request.status = 'pending';
                request.rejection_reason = null;
            }

            request.updated_at = nowIso();
            this.save();

            return ok({ request: this.decorate(request, user) });
        }

        deleteRequest({ params, token }) {
            const user = this.requireUser(token);
            const index = this.state.requests.findIndex((p) => p.id === params.id);

            if (index === -1) fail('Pedido no encontrado', 404);
            if (this.state.requests[index].buyer.id !== user.id && user.role !== 'admin') {
                fail('Solo puedes eliminar tus propios pedidos', 403);
            }

            this.state.requests.splice(index, 1);
            this.save();

            return ok({ deleted: params.id });
        }

        /* ====================================================================
           Ofertas — lo que un vendedor responde a un pedido

           Aquí vive el recorrido del storyboard: el vendedor responde, el
           comprador recibe el aviso, acepta, se abre la conversación, confirma
           la compra y califica. Cada paso deja rastro para el siguiente.
           ==================================================================== */

        /** Hasta dónde cede quien pide. El orden va de más exigente a menos. */
        static get CONDITIONS() {
            return ['Solo nuevo', 'Como nuevo o mejor', 'Cualquiera que funcione'];
        }

        /** Estados por los que pasa una oferta. */
        static get OFFER_STATUS() {
            return {
                pending: 'Esperando respuesta',
                accepted: 'Aceptada',
                declined: 'Descartada',
                withdrawn: 'Retirada',
            };
        }

        offersFor(requestId) {
            return (this.state.offers || []).filter((o) => o.request_id === requestId);
        }

        findOffer(id) {
            const offer = (this.state.offers || []).find((o) => o.id === id);
            if (!offer) fail('Oferta no encontrada', 404);
            return offer;
        }

        /** Las ofertas de un pedido. Solo su dueño y el admin las ven todas. */
        listOffers({ params, token }) {
            const user = this.userFromToken(token);
            const request = this.findRequest(params.id);

            const isOwner = user && request.buyer.id === user.id;
            const isAdmin = user && user.role === 'admin';

            let offers = this.offersFor(request.id);

            /* Quien no es el comprador solo ve la suya. Las ofertas de los
               demás son su estrategia comercial, no un escaparate público:
               enseñarlas convertiría esto en una subasta a la baja. */
            if (!isOwner && !isAdmin) {
                offers = user ? offers.filter((o) => o.seller.id === user.id) : [];
            }

            offers = [...offers].sort((a, b) => {
                if (a.status === 'accepted') return -1;
                if (b.status === 'accepted') return 1;
                return new Date(b.created_at) - new Date(a.created_at);
            });

            return ok({
                offers,
                total: this.offersFor(request.id).length,
                can_see_all: Boolean(isOwner || isAdmin),
            });
        }

        /**
         * Un vendedor responde a un pedido: «esto que buscas, lo tengo».
         *
         * Es la mitad que faltaba del comercio inverso. Pedir no requiere
         * permiso; ofrecer sí, porque quien ofrece es quien cobra.
         */
        createOffer({ params, body, token }) {
            const user = this.requireApprovedSeller(token);
            const request = this.answerableRequest(params.id);

            if (request.buyer.id === user.id) fail('No puedes responder a tu propio pedido');
            if (request.state === 'fulfilled') fail('Este pedido ya se cerró con otra oferta');
            if (request.state === 'cancelled') fail('Quien lo pidió canceló este pedido');

            if (this.offersFor(request.id).some((o) => o.seller.id === user.id && o.status !== 'withdrawn')) {
                fail('Ya respondiste a este pedido. Puedes escribirle por la conversación.');
            }

            const message = String(body.message || '').trim();
            const price = Number(body.price);

            if (message.length < 15) {
                fail('Cuéntale qué tienes y dónde estás, con al menos 15 caracteres');
            }
            if (message.length > 700) fail('El mensaje no puede superar los 700 caracteres');
            if (!Number.isFinite(price) || price <= 0) fail('Indica un precio mayor que cero');

            const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];

            const offer = {
                id: uid('off'),
                request_id: request.id,
                request_title: request.title,
                seller: {
                    id: user.id,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    shop_name: user.shop_name || user.username,
                    district: user.district,
                    rating: user.rating,
                    rating_count: user.rating_count || 0,
                    verified: user.verified,
                },
                message,
                price,
                photos: photos.map((url, i) => ({ id: uid('ph'), url: String(url) })),
                shop_name: user.shop_name || user.username,
                shop_address_hint: String(body.shop_address_hint || '').trim() || null,
                district: user.district,
                location: { ...user.location },
                status: 'pending',
                created_at: nowIso(),
            };

            this.state.offers = this.state.offers || [];
            this.state.offers.unshift(offer);

            request.offers_count = this.offersFor(request.id).length;
            request.updated_at = nowIso();

            /* El aviso del panel 6: «¡Alguien aceptó tu pedido!». Es la razón
               por la que quien publica puede cerrar la app y olvidarse. */
            this.notify(request.buyer.id, 'offer_received', request.id,
                `${offer.shop_name} respondió a tu pedido «${request.title}»`);

            this.refreshUserCounters(user.id);
            this.save();

            return ok({ offer, offers_count: request.offers_count });
        }

        /** Las ofertas que ha enviado quien ha iniciado sesión, como vendedor. */
        listMyOffers({ query, token }) {
            const user = this.requireUser(token);
            const status = query.get('status') || 'all';

            let offers = (this.state.offers || []).filter((o) => o.seller.id === user.id);
            if (status !== 'all') offers = offers.filter((o) => o.status === status);

            offers = [...offers]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((offer) => {
                    const request = this.state.requests.find((r) => r.id === offer.request_id);
                    return { ...offer, request: request ? this.decorate(request, user) : null };
                });

            const mine = (this.state.offers || []).filter((o) => o.seller.id === user.id);

            return ok({
                offers,
                summary: {
                    total: mine.length,
                    pending: mine.filter((o) => o.status === 'pending').length,
                    accepted: mine.filter((o) => o.status === 'accepted').length,
                    declined: mine.filter((o) => o.status === 'declined').length,
                },
            });
        }

        /**
         * El comprador acepta una oferta (paneles 6 y 7).
         *
         * Aceptar hace tres cosas de golpe: descarta las demás ofertas, abre la
         * conversación privada con ese vendedor y crea el trato que después se
         * confirmará y se calificará.
         */
        acceptOffer({ params, token }) {
            const user = this.requireUser(token);
            const offer = this.findOffer(params.id);
            const request = this.findRequest(offer.request_id);

            if (request.buyer.id !== user.id) fail('Solo quien hizo el pedido puede aceptar una oferta', 403);
            if (offer.status === 'accepted') fail('Ya aceptaste esta oferta');
            if (offer.status !== 'pending') fail('Esta oferta ya no está disponible');
            if (request.state === 'fulfilled') fail('Este pedido ya se cerró');

            offer.status = 'accepted';
            request.state = 'matched';
            request.accepted_offer_id = offer.id;
            request.updated_at = nowIso();

            // El resto de vendedores deja de esperar una respuesta que no llegará
            this.offersFor(request.id).forEach((other) => {
                if (other.id === offer.id || other.status !== 'pending') return;
                other.status = 'declined';
                this.notify(other.seller.id, 'offer_declined', request.id,
                    `«${request.title}» se cerró con otra oferta. Gracias por responder.`);
            });

            const conversation = this.conversationForOffer(request, offer, user);

            const deal = {
                id: uid('deal'),
                request_id: request.id,
                request_title: request.title,
                offer_id: offer.id,
                buyer_id: request.buyer.id,
                buyer_name: request.buyer.username,
                seller_id: offer.seller.id,
                seller_name: offer.seller.username,
                shop_name: offer.shop_name,
                price: offer.price,
                status: 'agreed',
                confirmed_at: null,
                rating: null,
                created_at: nowIso(),
            };

            this.state.deals = this.state.deals || [];
            this.state.deals.unshift(deal);

            this.notify(offer.seller.id, 'offer_accepted', request.id,
                `${user.username} aceptó tu oferta por «${request.title}». Ya pueden coordinar.`);

            this.save();

            return ok({ offer, request: this.decorate(request, user), conversation, deal });
        }

        declineOffer({ params, token }) {
            const user = this.requireUser(token);
            const offer = this.findOffer(params.id);
            const request = this.findRequest(offer.request_id);

            if (request.buyer.id !== user.id) fail('Solo quien hizo el pedido puede descartar una oferta', 403);
            if (offer.status !== 'pending') fail('Esta oferta ya no está pendiente');

            offer.status = 'declined';
            this.notify(offer.seller.id, 'offer_declined', request.id,
                `Tu oferta por «${request.title}» fue descartada.`);

            this.save();
            return ok({ offer });
        }

        /**
         * Abre —o recupera— la conversación de un pedido con su vendedor.
         * El primer mensaje es el de la oferta: lo que el vendedor ya escribió
         * no se le hace repetir.
         */
        conversationForOffer(request, offer, user) {
            let conversation = this.state.conversations.find((c) => c.offer_id === offer.id);
            if (conversation) return conversation;

            conversation = {
                id: uid('conv'),
                request_id: request.id,
                request_title: request.title,
                request_image: request.image_url,
                offer_id: offer.id,
                price: offer.price,
                participants: [request.buyer.id, offer.seller.id],
                seller: offer.seller,
                buyer: request.buyer,
                messages: [{
                    id: uid('msg'),
                    sender_id: offer.seller.id,
                    sender_name: offer.shop_name || offer.seller.username,
                    text: offer.message,
                    photos: offer.photos || [],
                    read: false,
                    created_at: offer.created_at,
                }],
                created_at: nowIso(),
                updated_at: nowIso(),
            };

            this.state.conversations.push(conversation);
            return conversation;
        }

        /* ====================================================================
           Tratos: la compra y su calificación
           ==================================================================== */

        findDeal(id) {
            const deal = (this.state.deals || []).find((d) => d.id === id);
            if (!deal) fail('Trato no encontrado', 404);
            return deal;
        }

        listDeals({ query, token }) {
            const user = this.requireUser(token);
            const role = query.get('role') || 'all';

            let deals = (this.state.deals || []).filter((d) =>
                d.buyer_id === user.id || d.seller_id === user.id);

            if (role === 'buyer') deals = deals.filter((d) => d.buyer_id === user.id);
            if (role === 'seller') deals = deals.filter((d) => d.seller_id === user.id);

            deals = [...deals].sort((a, b) =>
                new Date(b.confirmed_at || b.created_at) - new Date(a.confirmed_at || a.created_at));

            return ok({
                deals,
                summary: {
                    total: deals.length,
                    // Confirmadas pero todavía sin calificar: es lo que el
                    // comprador tiene pendiente de hacer.
                    to_rate: deals.filter((d) =>
                        d.buyer_id === user.id && d.confirmed_at && !d.rating).length,
                },
            });
        }

        /**
         * «Compra realizada» (panel 9).
         *
         * Lo confirma el comprador, no el vendedor: es quien sabe si recibió
         * lo que pidió. Aquí no se mueve dinero — esto registra que el trato
         * se cerró, que es lo único que la plataforma puede saber de verdad.
         */
        confirmDeal({ params, token }) {
            const user = this.requireUser(token);
            const deal = this.findDeal(params.id);

            if (deal.buyer_id !== user.id) fail('Solo quien hizo el pedido puede confirmar la compra', 403);
            if (deal.confirmed_at) fail('Esta compra ya estaba confirmada');

            deal.status = 'confirmed';
            deal.confirmed_at = nowIso();

            const request = this.state.requests.find((r) => r.id === deal.request_id);
            if (request) {
                request.state = 'fulfilled';
                request.updated_at = nowIso();
            }

            this.notify(deal.seller_id, 'deal_confirmed', deal.request_id,
                `${user.username} confirmó la compra de «${deal.request_title}».`);

            this.save();
            return ok({ deal, request: request ? this.decorate(request, user) : null });
        }

        /**
         * «Califica tu experiencia» (panel 10).
         *
         * De aquí sale la reputación de cada local. Es la única fuente: sin
         * compras calificadas, un vendedor no tiene estrellas — y eso se dice,
         * en vez de inventarle un número.
         */
        rateDeal({ params, body, token }) {
            const user = this.requireUser(token);
            const deal = this.findDeal(params.id);

            if (deal.buyer_id !== user.id) fail('Solo quien compró puede calificar', 403);
            if (!deal.confirmed_at) fail('Confirma primero que recibiste el producto');
            if (deal.rating) fail('Ya calificaste esta compra');

            const stars = Number(body.stars);
            if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
                fail('La calificación va de 1 a 5 estrellas');
            }

            const comment = String(body.comment || '').trim();
            if (comment.length > 500) fail('El comentario no puede superar los 500 caracteres');

            deal.rating = { stars, comment, created_at: nowIso() };

            this.refreshUserCounters(deal.seller_id);

            this.notify(deal.seller_id, 'deal_rated', deal.request_id,
                `${user.username} te calificó con ${stars} ${stars === 1 ? 'estrella' : 'estrellas'}.`);

            this.save();

            const seller = this.state.users.find((u) => u.id === deal.seller_id);
            return ok({
                deal,
                seller_rating: seller ? seller.rating : 0,
                seller_rating_count: seller ? seller.rating_count : 0,
            });
        }
        /**
         * Otras publicaciones que le pueden interesar a quien está mirando
         * esta: primero del mismo vendedor, luego de la misma categoría.
         */
        relatedRequests({ params, token }) {
            const user = this.userFromToken(token);
            const request = this.state.requests.find((p) => p.id === params.id);

            if (!request) fail('Pedido no encontrado', 404);

            const candidates = this.state.requests.filter((p) =>
                p.id !== request.id
                && p.status === 'approved'
                && p.state === 'open');

            const sameAuthor = candidates.filter((p) => p.buyer.id === request.buyer.id);
            const sameCategory = candidates.filter((p) =>
                p.category.id === request.category.id && p.buyer.id !== request.buyer.id);

            const pick = [...sameAuthor.slice(0, 3), ...sameCategory].slice(0, 6);

            return ok({
                related: pick.map((p) => this.decorate(p, user)),
                from_author: sameAuthor.length,
                from_category: sameCategory.length,
            });
        }

        listMyRequests({ token }) {
            const user = this.requireUser(token);
            const requests = this.state.requests
                .filter((p) => p.buyer.id === user.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((p) => this.decorate(p, user));

            return ok({
                requests,
                summary: {
                    total: requests.length,
                    approved: requests.filter((p) => p.status === 'approved').length,
                    pending: requests.filter((p) => p.status === 'pending').length,
                    rejected: requests.filter((p) => p.status === 'rejected').length,
                },
            });
        }

        listSaved({ token }) {
            const user = this.requireUser(token);

            const requests = this.state.requests
                .filter((p) => p.saves.includes(user.id) && p.status === 'approved')
                // Por cuándo se guardó, no por cuándo se publicó: la pantalla
                // se titula «guardados recientes» y antes ordenaba por otra
                // cosa. Lo guardado antes de que existiera la fecha va al final.
                .sort((a, b) => {
                    const at = (p) => ((p.saved_at || {})[user.id] || '');
                    return String(at(b)).localeCompare(String(at(a)));
                })
                .map((p) => ({ ...this.decorate(p, user), saved_at: (p.saved_at || {})[user.id] || null }));

            return ok({ requests, ids: requests.map((p) => p.id) });
        }

        /* ------------------------- Interacciones ------------------------- */

        /** Localiza un pedido aprobado sobre el que todavía se puede actuar. */
        answerableRequest(id) {
            const request = this.findRequest(id);
            if (request.status !== 'approved') fail('Este pedido aún no está publicado', 403);
            return request;
        }

        /**
         * «También lo busco».
         *
         * En el comercio inverso esto no es un aplauso: es demanda. Varias
         * personas buscando lo mismo es exactamente la señal que hace que a un
         * vendedor le merezca la pena responder.
         */
        toggleMeToo({ params, token }) {
            const user = this.requireUser(token);
            const request = this.answerableRequest(params.id);

            if (request.buyer.id === user.id) fail('Este pedido ya es tuyo');

            const meToo = toggleIn(request.me_too, user.id);
            request.me_too_count = Math.max(0, request.me_too_count + (meToo ? 1 : -1));

            if (meToo) {
                this.notify(request.buyer.id, 'me_too', request.id,
                    `${user.username} también está buscando «${request.title}»`);
            }

            this.save();
            return ok({ me_too: meToo, me_too_count: request.me_too_count });
        }

        toggleSave({ params, token }) {
            const user = this.requireUser(token);
            const request = this.answerableRequest(params.id);

            const saved = toggleIn(request.saves, user.id);
            request.saves_count = Math.max(0, request.saves_count + (saved ? 1 : -1));

            // Cuándo lo guardó, para poder ordenar «guardados recientes» por
            // lo que su nombre dice y no por la fecha de publicación.
            request.saved_at = request.saved_at || {};
            if (saved) request.saved_at[user.id] = nowIso();
            else delete request.saved_at[user.id];

            this.save();

            return ok({ saved, saves_count: request.saves_count, saved_at: request.saved_at[user.id] || null });
        }

        /* --------------------------- Comentarios --------------------------- */

        listComments({ params }) {
            const request = this.state.requests.find((p) => p.id === params.id);
            if (!request) fail('Pedido no encontrado', 404);
            return ok({ comments: request.comments, total: request.comments.length });
        }

        createComment({ params, body, token }) {
            const user = this.requireUser(token);
            const request = this.answerableRequest(params.id);

            const text = String(body.text || '').trim();
            if (!text) fail('El comentario no puede estar vacío');
            if (text.length > 600) fail('El comentario no puede superar los 600 caracteres');

            const comment = {
                id: uid('cm'),
                request_id: request.id,
                author: {
                    id: user.id,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    role: user.role,
                },
                text,
                created_at: nowIso(),
            };

            request.comments.push(comment);
            request.comment_count = request.comments.length;

            if (request.buyer.id !== user.id) {
                this.state.notifications.push({
                    id: uid('ntf'),
                    user_id: request.buyer.id,
                    type: 'comment',
                    request_id: request.id,
                    text: `${user.username} comentó en «${request.title}»`,
                    read: false,
                    created_at: nowIso(),
                });
            }

            this.save();
            return ok({ comment, comment_count: request.comment_count });
        }

        deleteComment({ params, token }) {
            const user = this.requireUser(token);
            const request = this.state.requests.find((p) => p.id === params.id);

            if (!request) fail('Pedido no encontrado', 404);

            const index = request.comments.findIndex((c) => c.id === params.sub);
            if (index === -1) fail('Comentario no encontrado', 404);

            const comment = request.comments[index];
            const canDelete = comment.author.id === user.id
                || request.buyer.id === user.id
                || user.role === 'admin';

            if (!canDelete) fail('No puedes eliminar este comentario', 403);

            request.comments.splice(index, 1);
            request.comment_count = request.comments.length;
            this.save();

            return ok({ deleted: params.sub, comment_count: request.comment_count });
        }

        /* -------------------------- Autenticación -------------------------- */

        register({ body }) {
            const username = String(body.username || '').trim();
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '');
            const role = body.role === 'seller' ? 'seller' : 'buyer';
            const district = body.district || 'Cercado';

            if (username.length < 3) fail('El nombre debe tener al menos 3 caracteres');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('El correo electrónico no es válido');
            if (password.length < 8) fail('La contraseña debe tener al menos 8 caracteres');
            if (this.state.users.some((u) => u.email === email)) {
                fail('Ya existe una cuenta registrada con ese correo');
            }

            const districtData = global.DiscoverySeed.districtByName(district);

            const user = {
                id: uid('u'),
                username,
                email,
                password_hash: weakHash(password),
                avatar_url: null,
                // Quien pide ser vendedor entra como comprador hasta la aprobación.
                role: 'buyer',
                seller_status: role === 'seller' ? 'pending' : null,
                district,
                location: {
                    lat: districtData.lat,
                    lng: districtData.lng,
                    district,
                    city: 'Arequipa',
                    country: 'Perú',
                },
                phone: body.phone || '',
                bio: '',
                rating: 0,
                total_requests: 0,
                total_sales: 0,
                verified: false,
                created_at: nowIso(),
            };

            this.state.users.push(user);

            const token = uid('tok');
            this.state.sessions[token] = user.id;
            this.save();

            return ok({
                access_token: token,
                user: this.publicUser(user),
                seller_requested: role === 'seller',
            });
        }

        login({ body }) {
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '');
            const user = this.state.users.find((u) => u.email === email);

            // Mismo mensaje para usuario inexistente y contraseña incorrecta.
            if (!user || user.password_hash !== weakHash(password)) {
                fail('Correo o contraseña incorrectos', 401);
            }

            const token = uid('tok');
            this.state.sessions[token] = user.id;
            this.save();

            return ok({ access_token: token, user: this.publicUser(user) });
        }

        logout({ token }) {
            if (token) {
                delete this.state.sessions[token];
                this.save();
            }
            return ok({ message: 'Sesión cerrada' });
        }

        me({ token }) {
            const user = this.requireUser(token);
            const unread = this.state.notifications.filter(
                (n) => n.user_id === user.id && !n.read
            ).length;

            return ok({ user: this.publicUser(user), unread_notifications: unread });
        }

        updateProfile({ body, token }) {
            const user = this.requireUser(token);

            ['username', 'phone', 'bio', 'avatar_url'].forEach((key) => {
                if (body[key] !== undefined) user[key] = body[key];
            });

            if (body.district) {
                const district = global.DiscoverySeed.districtByName(body.district);
                user.district = body.district;
                user.location = {
                    lat: district.lat,
                    lng: district.lng,
                    district: body.district,
                    city: 'Arequipa',
                    country: 'Perú',
                };
            }

            this.save();
            return ok({ user: this.publicUser(user) });
        }

        /** Un comprador solicita convertirse en vendedor. */
        applyAsSeller({ body, token }) {
            const user = this.requireUser(token);

            if (user.role === 'admin') fail('Tu cuenta ya tiene todos los permisos');
            if (user.seller_status === 'approved') fail('Tu cuenta de vendedor ya está aprobada');
            if (user.seller_status === 'pending') fail('Ya tienes una solicitud en revisión');

            user.seller_status = 'pending';
            user.seller_motivation = String(body.motivation || '').trim();
            user.applied_at = nowIso();
            this.save();

            return ok({ user: this.publicUser(user) });
        }

        /* ------------------------------ Mapa ------------------------------ */

        /**
         * Los locales que responden pedidos, situados en el mapa.
         *
         * Antes esto mostraba a quien tenía cosas publicadas. Ahora muestra a
         * quien las consigue: para quien busca algo, saber qué tiendas hay
         * cerca y qué han resuelto ya vale más que un catálogo.
         */
        mapSellers({ query }) {
            const districtFilter = query.get('district');
            const categoryFilter = query.get('category');

            const sellers = this.state.users
                .filter((u) => u.seller_status === 'approved')
                .map((user) => {
                    let supplied = (this.state.deals || []).filter((d) => d.seller_id === user.id);

                    if (categoryFilter) {
                        supplied = supplied.filter((deal) => {
                            const request = this.state.requests.find((r) => r.id === deal.request_id);
                            return request && request.category.id === categoryFilter;
                        });
                    }

                    const offers = (this.state.offers || []).filter((o) => o.seller.id === user.id);

                    return {
                        id: user.id,
                        username: user.username,
                        shop_name: user.shop_name || user.username,
                        district: user.district,
                        location: user.location,
                        rating: user.rating,
                        rating_count: user.rating_count || 0,
                        verified: user.verified,
                        // Cuántos pedidos ha resuelto: es su carta de presentación
                        deal_count: supplied.length,
                        offer_count: offers.length,
                        // Muestra breve para el globo del mapa: lo último que consiguió
                        preview: supplied.slice(0, 3).map((deal) => ({
                            id: deal.request_id,
                            title: deal.request_title,
                            price: deal.price,
                            image_url: (this.state.requests.find((r) => r.id === deal.request_id) || {}).image_url,
                        })),
                    };
                })
                .filter((s) => s.deal_count > 0 || s.offer_count > 0)
                .filter((s) => !districtFilter || s.district === districtFilter);

            return ok({
                sellers,
                center: global.DiscoverySeed.AREQUIPA_CENTER,
                districts: this.state.districts,
            });
        }

        /* -------------------------- Administración -------------------------- */

        adminStats({ token }) {
            this.requireAdmin(token);

            const requests = this.state.requests;
            const users = this.state.users;

            return ok({
                requests: {
                    total: requests.length,
                    approved: requests.filter((p) => p.status === 'approved').length,
                    pending: requests.filter((p) => p.status === 'pending').length,
                    rejected: requests.filter((p) => p.status === 'rejected').length,
                },
                sellers: {
                    approved: users.filter((u) => u.seller_status === 'approved').length,
                    pending: users.filter((u) => u.seller_status === 'pending').length,
                    rejected: users.filter((u) => u.seller_status === 'rejected').length,
                },
                users: {
                    total: users.length,
                    buyers: users.filter((u) => u.role === 'buyer' && !u.seller_status).length,
                },
                activity: {
                    comments: requests.reduce((sum, p) => sum + p.comment_count, 0),
                    me_too: requests.reduce((sum, p) => sum + (p.me_too_count || 0), 0),
                    views: requests.reduce((sum, p) => sum + p.views, 0),
                },
                // Cómo va el ciclo de vida de los pedidos, que es la salud real
                // de la plataforma: pedir es fácil, lo difícil es que se cumpla.
                lifecycle: {
                    open: requests.filter((p) => p.state === 'open').length,
                    matched: requests.filter((p) => p.state === 'matched').length,
                    fulfilled: requests.filter((p) => p.state === 'fulfilled').length,
                    cancelled: requests.filter((p) => p.state === 'cancelled').length,
                },
                offers: {
                    total: (this.state.offers || []).length,
                    pending: (this.state.offers || []).filter((o) => o.status === 'pending').length,
                    accepted: (this.state.offers || []).filter((o) => o.status === 'accepted').length,
                },
                deals: {
                    total: (this.state.deals || []).length,
                    confirmed: (this.state.deals || []).filter((d) => d.confirmed_at).length,
                    rated: (this.state.deals || []).filter((d) => d.rating).length,
                },
                reports: {
                    open: this.openReports().length,
                    total: (this.state.reports || []).length,
                },
            });
        }

        adminRequests({ query, token }) {
            this.requireAdmin(token);

            const status = query.get('status') || 'pending';
            const search = normalize(query.get('q') || '');

            let requests = status === 'all'
                ? [...this.state.requests]
                : this.state.requests.filter((p) => p.status === status);

            if (search) {
                requests = requests.filter((p) =>
                    normalize(`${p.title} ${p.buyer.username} ${p.district}`).includes(search));
            }

            // Lo más antiguo primero: se revisa por orden de llegada.
            requests.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            return ok({ requests, total: requests.length });
        }

        approveRequest({ params, token }) {
            const admin = this.requireAdmin(token);
            const request = this.state.requests.find((p) => p.id === params.id);

            if (!request) fail('Pedido no encontrado', 404);
            if (request.status === 'approved') fail('Esta publicación ya está aprobada');

            request.status = 'approved';
            request.rejection_reason = null;
            request.updated_at = nowIso();

            this.logModeration(admin, 'approve_request', request.id, `Aprobó «${request.title}»`);
            this.notify(request.buyer.id, 'request_approved', request.id,
                `Tu publicación «${request.title}» fue aprobada y ya es visible.`);

            this.refreshBuyerCounters(request.buyer.id);
            this.save();

            return ok({ request });
        }

        rejectRequest({ params, body, token }) {
            const admin = this.requireAdmin(token);
            const request = this.state.requests.find((p) => p.id === params.id);

            if (!request) fail('Pedido no encontrado', 404);

            const reason = String(body.reason || '').trim();
            if (reason.length < 8) fail('Indica un motivo de al menos 8 caracteres');

            request.status = 'rejected';
            request.rejection_reason = reason;
            request.updated_at = nowIso();

            this.logModeration(admin, 'reject_request', request.id, `Rechazó «${request.title}»: ${reason}`);
            this.notify(request.buyer.id, 'request_rejected', request.id,
                `Tu publicación «${request.title}» fue rechazada: ${reason}`);

            this.refreshBuyerCounters(request.buyer.id);
            this.save();

            return ok({ request });
        }

        adminSellers({ query, token }) {
            this.requireAdmin(token);

            const status = query.get('status') || 'pending';

            const sellers = this.state.users
                .filter((u) => (status === 'all' ? !!u.seller_status : u.seller_status === status))
                .map((u) => ({
                    ...this.publicUser(u),
                    post_count: this.state.requests.filter((p) => p.buyer.id === u.id).length,
                }))
                .sort((a, b) => new Date(a.applied_at || a.created_at) - new Date(b.applied_at || b.created_at));

            return ok({ sellers, total: sellers.length });
        }

        approveSeller({ params, token }) {
            const admin = this.requireAdmin(token);
            const user = this.state.users.find((u) => u.id === params.id);

            if (!user) fail('Usuario no encontrado', 404);
            if (user.seller_status === 'approved') fail('Este vendedor ya está aprobado');

            user.seller_status = 'approved';
            user.role = 'seller';
            user.verified = true;
            user.approved_at = nowIso();

            this.logModeration(admin, 'approve_seller', user.id, `Aprobó a ${user.username} como vendedor`);
            this.notify(user.id, 'seller_approved', null,
                '¡Tu cuenta de vendedor fue aprobada! Ya puedes publicar tus artículos.');

            this.save();
            return ok({ user: this.publicUser(user) });
        }

        rejectSeller({ params, body, token }) {
            const admin = this.requireAdmin(token);
            const user = this.state.users.find((u) => u.id === params.id);

            if (!user) fail('Usuario no encontrado', 404);

            const reason = String(body.reason || '').trim();
            if (reason.length < 8) fail('Indica un motivo de al menos 8 caracteres');

            user.seller_status = 'rejected';
            user.role = 'buyer';
            user.verified = false;
            user.rejection_reason = reason;

            this.logModeration(admin, 'reject_seller', user.id, `Rechazó a ${user.username}: ${reason}`);
            this.notify(user.id, 'seller_rejected', null,
                `Tu solicitud de vendedor fue rechazada: ${reason}`);

            this.save();
            return ok({ user: this.publicUser(user) });
        }

        /* ---- Bandeja de la IA: lo que ha decidido, para el administrador ---- */

        adminInbox({ query, token }) {
            this.requireAdmin(token);

            const filter = query.get('decision');
            let items = this.state.admin_inbox || [];

            if (filter && filter !== 'all') {
                items = items.filter((i) => i.decision === filter);
            }

            return ok({
                inbox: items,
                unread: (this.state.admin_inbox || []).filter((i) => !i.read).length,
                summary: {
                    approved: (this.state.admin_inbox || []).filter((i) => i.decision === 'approved').length,
                    rejected: (this.state.admin_inbox || []).filter((i) => i.decision === 'rejected').length,
                    pending: (this.state.admin_inbox || []).filter((i) => i.decision === 'pending').length,
                },
            });
        }

        markInboxRead({ params, token }) {
            this.requireAdmin(token);

            const item = (this.state.admin_inbox || []).find((i) => i.id === params.id);
            if (!item) fail('Aviso no encontrado', 404);

            item.read = true;
            this.save();
            return ok({ item });
        }

        /** Marca que el aviso ya se envió por WhatsApp, para no repetirlo. */
        markInboxSent({ params, token }) {
            this.requireAdmin(token);

            const item = (this.state.admin_inbox || []).find((i) => i.id === params.id);
            if (!item) fail('Aviso no encontrado', 404);

            item.sent_whatsapp = true;
            item.read = true;
            this.save();
            return ok({ item });
        }

        clearInbox({ token }) {
            this.requireAdmin(token);
            this.state.admin_inbox = [];
            this.save();
            return ok({ cleared: true });
        }

        /* ---- Ajustes del administrador ---- */

        getSettings({ token }) {
            this.requireAdmin(token);
            return ok({ settings: this.state.settings || {} });
        }

        updateSettings({ body, token }) {
            this.requireAdmin(token);

            this.state.settings = this.state.settings || {};

            if (body.whatsapp !== undefined) {
                // Solo dígitos: el enlace de WhatsApp no admite otra cosa
                const digits = String(body.whatsapp).replace(/\D/g, '');
                if (digits && digits.length < 9) fail('El número parece incompleto');
                this.state.settings.whatsapp = digits;
            }

            if (body.auto_notify !== undefined) {
                this.state.settings.auto_notify = !!body.auto_notify;
            }

            this.save();
            return ok({ settings: this.state.settings });
        }

        adminLog({ token }) {
            this.requireAdmin(token);
            const log = [...this.state.moderation_log]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 60);
            return ok({ log });
        }

        logModeration(admin, action, targetId, description) {
            this.state.moderation_log.push({
                id: uid('log'),
                admin_id: admin.id,
                admin_name: admin.username,
                action,
                target_id: targetId,
                description,
                created_at: nowIso(),
            });
        }

        notify(userId, type, postId, text) {
            this.state.notifications.push({
                id: uid('ntf'),
                user_id: userId,
                type,
                request_id: postId,
                text,
                read: false,
                created_at: nowIso(),
            });
        }

        /**
         * Recalcula lo que una cuenta tiene acumulado: pedidos publicados,
         * ofertas enviadas y —lo importante— su reputación.
         *
         * Las estrellas salen solo de compras calificadas. Sin ninguna, un
         * vendedor no tiene nota, y la interfaz lo dice en vez de inventarla.
         */
        refreshUserCounters(userId) {
            const user = this.state.users.find((u) => u.id === userId);
            if (!user) return;

            user.total_requests = this.state.requests.filter(
                (r) => r.buyer.id === userId && r.status === 'approved'
            ).length;

            user.total_offers = (this.state.offers || []).filter(
                (o) => o.seller.id === userId
            ).length;

            const rated = (this.state.deals || []).filter(
                (d) => d.seller_id === userId && d.rating
            );

            if (rated.length) {
                const sum = rated.reduce((total, d) => total + d.rating.stars, 0);
                user.rating = Math.round((sum / rated.length) * 10) / 10;
                user.rating_count = rated.length;
                user.total_sales = rated.length;
            } else {
                user.rating = 0;
                user.rating_count = 0;
            }

            // La reputación que viaja copiada dentro de cada oferta y pedido
            (this.state.offers || []).forEach((offer) => {
                if (offer.seller.id !== userId) return;
                offer.seller.rating = user.rating;
                offer.seller.rating_count = user.rating_count;
            });
        }

        /** Se mantiene el nombre viejo como puente mientras quedan llamadas. */
        refreshBuyerCounters(userId) {
            this.refreshUserCounters(userId);
        }

        /* ---------------------------- Avisos ---------------------------- */

        /**
         * Los avisos de quien ha iniciado sesión.
         *
         * Se escribían desde el principio — interés, comentarios, decisiones de
         * moderación — y no había ni una pantalla que los leyera. La señal más
         * importante del foro, que alguien quiere tu cosa, no llegaba nunca.
         */
        listNotifications({ query, token }) {
            const user = this.requireUser(token);

            const mine = this.state.notifications
                .filter((n) => n.user_id === user.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            const unread = mine.filter((n) => !n.read).length;
            const items = query.get('unread') === '1' ? mine.filter((n) => !n.read) : mine;

            return ok({
                notifications: items.slice(0, 40),
                unread,
                total: mine.length,
            });
        }

        markNotificationRead({ params, token }) {
            const user = this.requireUser(token);

            const item = this.state.notifications.find(
                (n) => n.id === params.id && n.user_id === user.id
            );
            if (!item) fail('Aviso no encontrado', 404);

            item.read = true;
            this.save();

            return ok({ notification: item, unread: this.unreadCount(user.id) });
        }

        markAllNotificationsRead({ token }) {
            const user = this.requireUser(token);

            let changed = 0;
            this.state.notifications.forEach((n) => {
                if (n.user_id === user.id && !n.read) {
                    n.read = true;
                    changed += 1;
                }
            });

            this.save();
            return ok({ marked: changed, unread: 0 });
        }

        unreadCount(userId) {
            return this.state.notifications.filter((n) => n.user_id === userId && !n.read).length;
        }

        /* --------------------------- Denuncias --------------------------- */

        /**
         * Denunciar una publicación ya visible.
         *
         * La IA revisa todo lo que entra, pero lo que se le cuela solo lo
         * cazaba un administrador que pasara por ahí. Esto pone a la comunidad
         * en el circuito de moderación que ya existe.
         */
        reportRequest({ params, body, token }) {
            const user = this.requireUser(token);
            const request = this.state.requests.find((p) => p.id === params.id);

            if (!request) fail('Pedido no encontrado', 404);
            if (request.buyer.id === user.id) fail('No puedes denunciar tu propia publicación');

            const reason = String(body.reason || '').trim();
            if (reason.length < 10) fail('Cuéntanos el motivo con al menos 10 caracteres');
            if (reason.length > 400) fail('El motivo no puede superar los 400 caracteres');

            this.state.reports = this.state.reports || [];

            const already = this.state.reports.find(
                (r) => r.request_id === request.id && r.reporter_id === user.id && r.status === 'open'
            );
            if (already) fail('Ya denunciaste esta publicación; la estamos revisando');

            const report = {
                id: uid('rep'),
                request_id: request.id,
                request_title: request.title,
                author: request.buyer.username,
                reporter_id: user.id,
                reporter: user.username,
                category: String(body.category || 'otro'),
                reason,
                status: 'open',
                created_at: nowIso(),
                resolved_at: null,
                resolution: null,
            };

            this.state.reports.unshift(report);
            this.save();

            return ok({ report, total_open: this.openReports().length });
        }

        openReports() {
            return (this.state.reports || []).filter((r) => r.status === 'open');
        }

        adminReports({ query, token }) {
            this.requireAdmin(token);

            const status = query.get('status') || 'open';
            const all = this.state.reports || [];

            const reports = (status === 'all' ? [...all] : all.filter((r) => r.status === status))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return ok({
                reports,
                total: reports.length,
                open: this.openReports().length,
            });
        }

        /** Cierra una denuncia. La decisión sobre la publicación va aparte. */
        resolveReport({ params, body, token }) {
            const admin = this.requireAdmin(token);

            const report = (this.state.reports || []).find((r) => r.id === params.id);
            if (!report) fail('Denuncia no encontrada', 404);
            if (report.status !== 'open') fail('Esta denuncia ya estaba resuelta');

            const resolution = String(body.resolution || '').trim();
            if (resolution.length < 4) fail('Indica qué se hizo con la denuncia');

            report.status = 'resolved';
            report.resolution = resolution;
            report.resolved_at = nowIso();

            this.logModeration(admin, 'resolve_report', report.request_id,
                `Resolvió la denuncia sobre «${report.request_title}»: ${resolution}`);

            this.notify(report.reporter_id, 'report_resolved', report.request_id,
                `Revisamos tu denuncia sobre «${report.request_title}». ${resolution}`);

            this.save();
            return ok({ report, open: this.openReports().length });
        }

        /* --------------------------- Mensajería --------------------------- */

        listConversations({ token }) {
            const user = this.requireUser(token);

            const conversations = this.state.conversations
                .filter((c) => c.participants.includes(user.id))
                .map((c) => ({
                    ...c,
                    last_message: c.messages[c.messages.length - 1] || null,
                    unread: c.messages.filter((m) => m.sender_id !== user.id && !m.read).length,
                }))
                .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

            return ok({ conversations });
        }

        /**
         * Recupera la conversación de un pedido.
         *
         * En el comercio inverso una conversación no se abre por las buenas:
         * nace cuando el comprador acepta una oferta, y solo entonces. Antes de
         * eso no hay nada que coordinar, y dejar escribir a cualquier vendedor
         * convertiría la bandeja del comprador en un buzón de publicidad.
         */
        openConversation({ body, token }) {
            const user = this.requireUser(token);
            const request = this.answerableRequest(body.request_id);

            const conversation = this.state.conversations.find(
                (c) => c.request_id === request.id && c.participants.includes(user.id)
            );

            if (!conversation) {
                if (request.buyer.id === user.id) {
                    fail('Acepta una de las ofertas para empezar a coordinar', 409);
                }
                fail('Responde al pedido con una oferta; si la aceptan, se abre la conversación', 409);
            }

            return ok({ conversation });
        }

        listMessages({ params, token }) {
            const user = this.requireUser(token);
            const conversation = this.state.conversations.find((c) => c.id === params.id);

            if (!conversation) fail('Conversación no encontrada', 404);
            if (!conversation.participants.includes(user.id)) {
                fail('No tienes acceso a esta conversación', 403);
            }

            conversation.messages.forEach((m) => {
                if (m.sender_id !== user.id) m.read = true;
            });
            this.save();

            return ok({ conversation, messages: conversation.messages });
        }

        sendMessage({ params, body, token }) {
            const user = this.requireUser(token);
            const conversation = this.state.conversations.find((c) => c.id === params.id);

            if (!conversation) fail('Conversación no encontrada', 404);
            if (!conversation.participants.includes(user.id)) {
                fail('No tienes acceso a esta conversación', 403);
            }

            const text = String(body.text || '').trim();
            if (!text) fail('El mensaje no puede estar vacío');
            if (text.length > 1000) fail('El mensaje no puede superar los 1000 caracteres');

            const message = {
                id: uid('msg'),
                sender_id: user.id,
                sender_name: user.username,
                text,
                read: true,
                created_at: nowIso(),
            };

            conversation.messages.push(message);
            conversation.updated_at = nowIso();
            this.save();

            return ok({ message, conversation });
        }

        /**
         * Respuesta automática del vendedor en modo demo: mantiene la
         * conversación viva sin necesidad de WebSockets.
         */
        autoReply(conversationId, userText) {
            const conversation = this.state.conversations.find((c) => c.id === conversationId);
            if (!conversation) return null;

            const text = normalize(userText);
            let reply;

            if (/precio|cuesta|descuento|rebaja|oferta|barato|ultimo/.test(text)) {
                reply = `Lo tengo en S/ ${Number(conversation.price || 0).toFixed(2)}. Si lo recoges esta semana podemos conversar el precio.`;
            } else if (/donde|zona|distrito|direccion|ver|recoger|entrega/.test(text)) {
                reply = `Estoy en ${conversation.seller.district}. Podemos quedar en un punto céntrico del distrito cuando te acomode.`;
            } else if (/estado|condicion|usado|funciona|falla|detalle/.test(text)) {
                reply = 'Está tal cual lo describí en la publicación, funcionando perfecto. Si quieres te envío más fotos ahora mismo.';
            } else if (/foto|imagen|video/.test(text)) {
                reply = 'Claro, te mando fotos adicionales por aquí en un momento.';
            } else if (/hola|buenas|buenos dias|buenas tardes|saludos/.test(text)) {
                reply = '¡Hola! Qué tal, dime en qué te puedo ayudar con la publicación.';
            } else if (/gracias|perfecto|listo|ok|dale/.test(text)) {
                reply = '¡Con gusto! Cualquier otra duda me escribes sin problema.';
            } else {
                reply = 'Claro que sí, déjame revisarlo y te confirmo enseguida. ¿Necesitas algún otro detalle?';
            }

            const message = {
                id: uid('msg'),
                sender_id: conversation.seller.id,
                sender_name: conversation.seller.username,
                text: reply,
                read: false,
                created_at: nowIso(),
            };

            conversation.messages.push(message);
            conversation.updated_at = nowIso();
            this.save();

            return message;
        }

        /** Restaura el catálogo original descartando los cambios locales. */
        resetDemo() {
            this.db.reset();
            return ok({ message: 'Datos de demostración restaurados' });
        }
    }

    global.MockAPI = MockAPI;
})(window);
