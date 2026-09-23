/**
 * DiscoveryShop · Backend simulado
 *
 * Implementa en el navegador el contrato completo del foro de artículos de
 * segunda mano, con persistencia en localStorage. Gracias a esto el sitio
 * funciona al 100 % en GitHub Pages sin ejecutar `py app.py`.
 *
 * Modelo de permisos:
 *   · comprador  — navega, comenta, reacciona y guarda.
 *   · vendedor   — además publica, pero solo si el administrador lo aprobó.
 *   · admin      — revisa publicaciones y solicitudes de vendedor.
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
    const STORAGE_KEY = 'discoveryshop:db:v4';
    const SCHEMA_VERSION = 4;

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
                rating: 0,
                total_posts: 0,
                total_sales: 0,
                verified: true,
                created_at: nowIso(),
            };

            const state = {
                version: SCHEMA_VERSION,
                users: [admin, ...seed.users],
                posts: seed.posts,
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
            const visible = state.posts.filter((p) => p.status === 'approved');
            const hour = 3600 * 1000;
            let age = 0;

            const push = (post, type, text) => {
                age += 1;
                state.notifications.push({
                    id: `ntf-seed-${state.notifications.length}`,
                    user_id: post.author.id,
                    type,
                    post_id: post.id,
                    text,
                    // Los tres más recientes llegan sin leer: es lo que hace
                    // que la campana tenga algo que contar al entrar.
                    read: age > 3,
                    created_at: new Date(Date.now() - age * 5 * hour).toISOString(),
                });
            };

            visible
                .filter((post) => post.comments.length)
                .slice(0, 5)
                .forEach((post) => {
                    const last = post.comments[post.comments.length - 1];
                    push(post, 'comment', `${last.author.username} comentó en «${post.title}»`);
                });

            visible
                .filter((post) => post.interested_count > 0)
                .slice(0, 6)
                .forEach((post) => {
                    push(post, 'interest',
                        `${post.interested_count} ${post.interested_count === 1 ? 'persona quiere' : 'personas quieren'} «${post.title}»`);
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
                }[user.seller_status] || 'Necesitas una cuenta de vendedor aprobada para publicar artículos.';

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

                // Publicaciones
                ['GET', /^\/api\/posts$/, this.listPosts],
                ['POST', /^\/api\/posts$/, this.createPost],
                ['GET', /^\/api\/posts\/categories$/, this.listCategories],
                ['GET', /^\/api\/posts\/saved$/, this.listSaved],
                ['GET', /^\/api\/posts\/mine$/, this.listMine],
                ['GET', /^\/api\/posts\/([\w-]+)\/related$/, this.relatedPosts],
                ['GET', /^\/api\/posts\/([\w-]+)$/, this.getPost],
                ['PUT', /^\/api\/posts\/([\w-]+)\/availability$/, this.setAvailability],
                ['PUT', /^\/api\/posts\/([\w-]+)$/, this.updatePost],
                ['DELETE', /^\/api\/posts\/([\w-]+)$/, this.deletePost],

                // Interacciones del foro
                ['POST', /^\/api\/posts\/([\w-]+)\/like$/, this.toggleLike],
                ['POST', /^\/api\/posts\/([\w-]+)\/interest$/, this.toggleInterest],
                ['POST', /^\/api\/posts\/([\w-]+)\/save$/, this.toggleSave],
                ['GET', /^\/api\/posts\/([\w-]+)\/comments$/, this.listComments],
                ['POST', /^\/api\/posts\/([\w-]+)\/comments$/, this.createComment],
                ['DELETE', /^\/api\/posts\/([\w-]+)\/comments\/([\w-]+)$/, this.deleteComment],
                ['POST', /^\/api\/posts\/([\w-]+)\/report$/, this.reportPost],

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
                ['GET', /^\/api\/admin\/posts$/, this.adminPosts],
                ['POST', /^\/api\/admin\/posts\/([\w-]+)\/approve$/, this.approvePost],
                ['POST', /^\/api\/admin\/posts\/([\w-]+)\/reject$/, this.rejectPost],
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
                posts: this.state.posts.filter((p) => p.status === 'approved').length,
            });
        }

        /** Añade al objeto los datos que dependen de quién mira. */
        decorate(post, user) {
            const id = user ? user.id : null;
            return {
                ...post,
                liked: id ? post.likes.includes(id) : false,
                interested_by_me: id ? post.interested.includes(id) : false,
                saved: id ? post.saves.includes(id) : false,
                is_mine: id ? post.author.id === id : false,
            };
        }

        listPosts({ query, token }) {
            const user = this.userFromToken(token);

            const page = Math.max(1, parseInt(query.get('page') || '1', 10));
            const perPage = Math.min(48, Math.max(1, parseInt(query.get('per_page') || '10', 10)));
            const search = normalize(query.get('q') || '');
            const categories = (query.get('category') || '').split(',').filter(Boolean);
            const districts = (query.get('district') || '').split(',').filter(Boolean);
            const conditions = (query.get('condition') || '').split(',').filter(Boolean);
            const availability = (query.get('availability') || '').split(',').filter(Boolean);
            const minPrice = parseFloat(query.get('min_price') || '');
            const maxPrice = parseFloat(query.get('max_price') || '');
            const authorId = query.get('author_id');
            const sort = query.get('sort') || 'recent';

            // El feed público solo muestra publicaciones aprobadas.
            let items = this.state.posts.filter((p) => p.status === 'approved');

            if (search) {
                items = items.filter((p) => {
                    const haystack = normalize(
                        `${p.title} ${p.description} ${p.category.name} ${p.author.username} ${p.district}`
                    );
                    return search.split(/\s+/).every((word) => haystack.includes(word));
                });
            }

            if (categories.length) items = items.filter((p) => categories.includes(p.category.id));
            if (districts.length) items = items.filter((p) => districts.includes(p.district));
            if (conditions.length) items = items.filter((p) => conditions.includes(p.condition));
            if (availability.length) {
                items = items.filter((p) => availability.includes(p.availability || 'available'));
            }
            if (!Number.isNaN(minPrice)) items = items.filter((p) => p.price >= minPrice);
            if (!Number.isNaN(maxPrice)) items = items.filter((p) => p.price <= maxPrice);
            if (authorId) items = items.filter((p) => p.author.id === authorId);

            items = this.sortPosts(items, sort);

            const total = items.length;
            const totalPages = Math.max(1, Math.ceil(total / perPage));
            const safePage = Math.min(page, totalPages);
            const start = (safePage - 1) * perPage;

            return ok({
                posts: items.slice(start, start + perPage).map((p) => this.decorate(p, user)),
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

        sortPosts(items, sort) {
            const sorted = [...items];

            switch (sort) {
                case 'price_asc': return sorted.sort((a, b) => a.price - b.price);
                case 'price_desc': return sorted.sort((a, b) => b.price - a.price);
                case 'popular': return sorted.sort((a, b) => b.likes_count - a.likes_count);
                case 'interest': return sorted.sort((a, b) => b.interested_count - a.interested_count);
                case 'commented': return sorted.sort((a, b) => b.comment_count - a.comment_count);
                case 'recent':
                default: return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
        }

        listCategories() {
            const categories = this.state.categories.map((cat) => ({
                ...cat,
                count: this.state.posts.filter(
                    (p) => p.category.id === cat.id && p.status === 'approved'
                ).length,
            }));
            return ok({ categories });
        }

        listDistricts() {
            const districts = this.state.districts.map((d) => ({
                ...d,
                count: this.state.posts.filter((p) => p.district === d.name && p.status === 'approved').length,
            }));
            return ok({ districts, center: global.DiscoverySeed.AREQUIPA_CENTER });
        }

        getPost({ params, token }) {
            const user = this.userFromToken(token);
            const post = this.state.posts.find((p) => p.id === params.id);

            if (!post) fail('Publicación no encontrada', 404);

            // Una publicación no aprobada solo la ve su autor o el administrador.
            const isOwner = user && post.author.id === user.id;
            const isAdmin = user && user.role === 'admin';
            if (post.status !== 'approved' && !isOwner && !isAdmin) {
                fail('Esta publicación no está disponible', 404);
            }

            post.views += 1;
            this.save();

            return ok({ post: this.decorate(post, user) });
        }

        createPost({ body, token }) {
            const user = this.requireApprovedSeller(token);

            const title = String(body.title || '').trim();
            const description = String(body.description || '').trim();
            const price = Number(body.price);

            if (title.length < 4) fail('El título debe tener al menos 4 caracteres');
            if (title.length > 90) fail('El título no puede superar los 90 caracteres');
            if (description.length < 20) fail('Describe el artículo con al menos 20 caracteres');
            if (!Number.isFinite(price) || price <= 0) fail('El precio debe ser mayor que cero');

            const category = this.state.categories.find((c) => c.id === body.category_id);
            if (!category) fail('Elige una categoría para tu publicación');

            const districtName = body.district || user.district;
            const district = global.DiscoverySeed.districtByName(districtName);
            const emoji = body.emoji || category.icon;

            const post = {
                id: uid('post'),
                title,
                description,
                price,
                condition: body.condition || 'Buen estado',
                emoji,
                image_url: global.DiscoverySeed.createImage(title, emoji),
                images: [{
                    id: uid('img'),
                    url: global.DiscoverySeed.createImage(title, emoji),
                    order: 0,
                    is_primary: true,
                }],
                category: { id: category.id, name: category.name, icon: category.icon },
                author: {
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
                // Toda publicación nueva pasa por revisión antes de salir al feed.
                status: 'pending',
                rejection_reason: null,
                // Estado de venta, independiente de la moderación
                availability: 'available',
                availability_at: null,
                likes: [], likes_count: 0,
                interested: [], interested_count: 0,
                saves: [], saves_count: 0, saved_at: {},
                comments: [], comment_count: 0,
                views: 0,
                created_at: nowIso(),
                updated_at: nowIso(),
            };

            // La IA de la plataforma revisa la publicación en el acto. Puede
            // aprobarla, rechazarla o dejarla en duda para que la vea una
            // persona; lo que decide queda registrado con su motivo.
            const verdict = this.autoReview(post);

            this.state.posts.unshift(post);
            this.refreshAuthorCounters(user.id);
            this.save();

            return ok({ post: this.decorate(post, user), review: verdict });
        }

        /**
         * Aplica el veredicto del revisor automático a una publicación recién
         * creada y deja constancia para el administrador.
         *
         * @param {object} post - Se modifica en el sitio.
         * @returns {{decision: string, reason: string, confidence: number}}
         */
        autoReview(post) {
            const moderator = global.DiscoveryModerator;

            // Sin el revisor cargado, la publicación espera revisión humana:
            // nunca se publica algo sin que alguien o algo lo haya mirado.
            if (!moderator) {
                return { decision: 'pending', reason: 'Revisión automática no disponible.', confidence: 0 };
            }

            const verdict = moderator.review(post);

            post.status = verdict.decision;
            post.rejection_reason = verdict.decision === 'rejected' ? verdict.reason : null;
            post.review = {
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
                action: verdict.decision === 'approved' ? 'approve_post'
                    : verdict.decision === 'rejected' ? 'reject_post' : 'flag_post',
                target_id: post.id,
                description: verdict.decision === 'approved'
                    ? `Aprobó «${post.title}»: ${verdict.reason}`
                    : verdict.decision === 'rejected'
                        ? `Rechazó «${post.title}»: ${verdict.reason}`
                        : `Dejó en revisión «${post.title}»: ${verdict.reason}`,
                confidence: verdict.confidence,
                created_at: nowIso(),
            });

            // Aviso a quien publicó
            const toAuthor = {
                approved: `Tu publicación «${post.title}» fue aprobada y ya es visible en el foro.`,
                rejected: `Tu publicación «${post.title}» fue rechazada: ${verdict.reason}`,
                pending: `Tu publicación «${post.title}» quedó en revisión. Te avisaremos en cuanto se resuelva.`,
            }[verdict.decision];

            this.notify(post.author.id, `post_${verdict.decision}`, post.id, toAuthor);

            // Aviso para el administrador, en su bandeja de la plataforma
            this.state.admin_inbox = this.state.admin_inbox || [];
            this.state.admin_inbox.unshift({
                id: uid('ai'),
                post_id: post.id,
                post_title: post.title,
                author: post.author.username,
                decision: verdict.decision,
                reason: verdict.reason,
                confidence: verdict.confidence,
                message: moderator.notificationText(post, verdict),
                read: false,
                sent_whatsapp: false,
                created_at: nowIso(),
            });

            return verdict;
        }

        updatePost({ params, body, token }) {
            const user = this.requireUser(token);
            const post = this.state.posts.find((p) => p.id === params.id);

            if (!post) fail('Publicación no encontrada', 404);
            if (post.author.id !== user.id && user.role !== 'admin') {
                fail('Solo puedes editar tus propias publicaciones', 403);
            }

            ['title', 'description', 'condition', 'district'].forEach((key) => {
                if (body[key]) post[key] = body[key];
            });

            if (body.price !== undefined && body.price !== '') {
                const price = Number(body.price);
                if (!Number.isFinite(price) || price <= 0) fail('El precio debe ser mayor que cero');
                post.price = price;
            }

            if (body.district) {
                const district = global.DiscoverySeed.districtByName(body.district);
                post.location = {
                    lat: district.lat,
                    lng: district.lng,
                    district: body.district,
                    city: 'Arequipa',
                    country: 'Perú',
                };
                post.author.district = body.district;
            }

            // Editar una publicación ya aprobada la devuelve a revisión.
            if (post.status === 'approved' && user.role !== 'admin') {
                post.status = 'pending';
                post.rejection_reason = null;
            }

            post.updated_at = nowIso();
            this.save();

            return ok({ post: this.decorate(post, user) });
        }

        deletePost({ params, token }) {
            const user = this.requireUser(token);
            const index = this.state.posts.findIndex((p) => p.id === params.id);

            if (index === -1) fail('Publicación no encontrada', 404);
            if (this.state.posts[index].author.id !== user.id && user.role !== 'admin') {
                fail('Solo puedes eliminar tus propias publicaciones', 403);
            }

            this.state.posts.splice(index, 1);
            this.save();

            return ok({ deleted: params.id });
        }

        /* ---------------------- Estado de venta ---------------------- */

        /** Los tres estados posibles y cómo se cuentan a quien mira. */
        static get AVAILABILITY() {
            return {
                available: 'Disponible',
                reserved: 'Reservado',
                sold: 'Vendido',
            };
        }

        /**
         * Marca una publicación como disponible, reservada o vendida.
         *
         * Es lo que distingue un tablón vivo de una lista de fantasmas: sin
         * esto nada se puede dar por cerrado y la gente escribe por cosas que
         * ya no están. No toca `status`, que es la moderación.
         */
        setAvailability({ params, body, token }) {
            const user = this.requireUser(token);
            const post = this.state.posts.find((p) => p.id === params.id);

            if (!post) fail('Publicación no encontrada', 404);
            if (post.author.id !== user.id && user.role !== 'admin') {
                fail('Solo quien publica puede cambiar el estado del artículo', 403);
            }

            const value = String(body.availability || '');
            if (!Object.prototype.hasOwnProperty.call(MockAPI.AVAILABILITY, value)) {
                fail('Estado no válido. Usa disponible, reservado o vendido.');
            }

            if (post.availability === value) {
                fail(`La publicación ya está marcada como «${MockAPI.AVAILABILITY[value].toLowerCase()}»`);
            }

            post.availability = value;
            post.availability_at = value === 'available' ? null : nowIso();
            post.updated_at = nowIso();

            // Avisar a quien había mostrado interés: es su señal de que la
            // cosa se movió, y evita que sigan esperando respuesta.
            if (value !== 'available') {
                post.interested.forEach((id) => {
                    if (id === user.id) return;
                    this.notify(id, `post_${value}`, post.id,
                        `«${post.title}» se marcó como ${MockAPI.AVAILABILITY[value].toLowerCase()}`);
                });
            }

            this.save();
            return ok({ post: this.decorate(post, user) });
        }

        /**
         * Otras publicaciones que le pueden interesar a quien está mirando
         * esta: primero del mismo vendedor, luego de la misma categoría.
         */
        relatedPosts({ params, token }) {
            const user = this.userFromToken(token);
            const post = this.state.posts.find((p) => p.id === params.id);

            if (!post) fail('Publicación no encontrada', 404);

            const candidates = this.state.posts.filter((p) =>
                p.id !== post.id
                && p.status === 'approved'
                && p.availability !== 'sold');

            const sameAuthor = candidates.filter((p) => p.author.id === post.author.id);
            const sameCategory = candidates.filter((p) =>
                p.category.id === post.category.id && p.author.id !== post.author.id);

            const pick = [...sameAuthor.slice(0, 3), ...sameCategory].slice(0, 6);

            return ok({
                related: pick.map((p) => this.decorate(p, user)),
                from_author: sameAuthor.length,
                from_category: sameCategory.length,
            });
        }

        listMine({ token }) {
            const user = this.requireUser(token);
            const posts = this.state.posts
                .filter((p) => p.author.id === user.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((p) => this.decorate(p, user));

            return ok({
                posts,
                summary: {
                    total: posts.length,
                    approved: posts.filter((p) => p.status === 'approved').length,
                    pending: posts.filter((p) => p.status === 'pending').length,
                    rejected: posts.filter((p) => p.status === 'rejected').length,
                },
            });
        }

        listSaved({ token }) {
            const user = this.requireUser(token);

            const posts = this.state.posts
                .filter((p) => p.saves.includes(user.id) && p.status === 'approved')
                // Por cuándo se guardó, no por cuándo se publicó: la pantalla
                // se titula «guardados recientes» y antes ordenaba por otra
                // cosa. Lo guardado antes de que existiera la fecha va al final.
                .sort((a, b) => {
                    const at = (p) => ((p.saved_at || {})[user.id] || '');
                    return String(at(b)).localeCompare(String(at(a)));
                })
                .map((p) => ({ ...this.decorate(p, user), saved_at: (p.saved_at || {})[user.id] || null }));

            return ok({ posts, ids: posts.map((p) => p.id) });
        }

        /* ------------------------- Interacciones ------------------------- */

        /** Localiza una publicación aprobada sobre la que se puede interactuar. */
        interactivePost(id) {
            const post = this.state.posts.find((p) => p.id === id);
            if (!post) fail('Publicación no encontrada', 404);
            if (post.status !== 'approved') fail('Esta publicación aún no está publicada', 403);
            return post;
        }

        toggleLike({ params, token }) {
            const user = this.requireUser(token);
            const post = this.interactivePost(params.id);

            const liked = toggleIn(post.likes, user.id);
            post.likes_count = Math.max(0, post.likes_count + (liked ? 1 : -1));
            this.save();

            return ok({ liked, likes_count: post.likes_count });
        }

        toggleInterest({ params, token }) {
            const user = this.requireUser(token);
            const post = this.interactivePost(params.id);

            if (post.author.id === user.id) fail('No puedes marcar interés en tu propia publicación');

            // Ya se vendió: dejar marcar interés solo alimentaría una espera
            // que no va a ninguna parte.
            if (post.availability === 'sold' && !post.interested.includes(user.id)) {
                fail('Este artículo ya se vendió');
            }

            const interested = toggleIn(post.interested, user.id);
            post.interested_count = Math.max(0, post.interested_count + (interested ? 1 : -1));

            // Avisar al vendedor: es la señal principal del foro.
            if (interested) {
                this.state.notifications.push({
                    id: uid('ntf'),
                    user_id: post.author.id,
                    type: 'interest',
                    post_id: post.id,
                    text: `${user.username} marcó "Me interesa" en «${post.title}»`,
                    read: false,
                    created_at: nowIso(),
                });
            }

            this.save();
            return ok({ interested, interested_count: post.interested_count });
        }

        toggleSave({ params, token }) {
            const user = this.requireUser(token);
            const post = this.interactivePost(params.id);

            const saved = toggleIn(post.saves, user.id);
            post.saves_count = Math.max(0, post.saves_count + (saved ? 1 : -1));

            // Cuándo lo guardó, para poder ordenar «guardados recientes» por
            // lo que su nombre dice y no por la fecha de publicación.
            post.saved_at = post.saved_at || {};
            if (saved) post.saved_at[user.id] = nowIso();
            else delete post.saved_at[user.id];

            this.save();

            return ok({ saved, saves_count: post.saves_count, saved_at: post.saved_at[user.id] || null });
        }

        /* --------------------------- Comentarios --------------------------- */

        listComments({ params }) {
            const post = this.state.posts.find((p) => p.id === params.id);
            if (!post) fail('Publicación no encontrada', 404);
            return ok({ comments: post.comments, total: post.comments.length });
        }

        createComment({ params, body, token }) {
            const user = this.requireUser(token);
            const post = this.interactivePost(params.id);

            const text = String(body.text || '').trim();
            if (!text) fail('El comentario no puede estar vacío');
            if (text.length > 600) fail('El comentario no puede superar los 600 caracteres');

            const comment = {
                id: uid('cm'),
                post_id: post.id,
                author: {
                    id: user.id,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    role: user.role,
                },
                text,
                created_at: nowIso(),
            };

            post.comments.push(comment);
            post.comment_count = post.comments.length;

            if (post.author.id !== user.id) {
                this.state.notifications.push({
                    id: uid('ntf'),
                    user_id: post.author.id,
                    type: 'comment',
                    post_id: post.id,
                    text: `${user.username} comentó en «${post.title}»`,
                    read: false,
                    created_at: nowIso(),
                });
            }

            this.save();
            return ok({ comment, comment_count: post.comment_count });
        }

        deleteComment({ params, token }) {
            const user = this.requireUser(token);
            const post = this.state.posts.find((p) => p.id === params.id);

            if (!post) fail('Publicación no encontrada', 404);

            const index = post.comments.findIndex((c) => c.id === params.sub);
            if (index === -1) fail('Comentario no encontrado', 404);

            const comment = post.comments[index];
            const canDelete = comment.author.id === user.id
                || post.author.id === user.id
                || user.role === 'admin';

            if (!canDelete) fail('No puedes eliminar este comentario', 403);

            post.comments.splice(index, 1);
            post.comment_count = post.comments.length;
            this.save();

            return ok({ deleted: params.sub, comment_count: post.comment_count });
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
                total_posts: 0,
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

        /** Vendedores aprobados con al menos una publicación visible. */
        mapSellers({ query }) {
            const districtFilter = query.get('district');
            const categoryFilter = query.get('category');

            const sellers = this.state.users
                .filter((u) => u.seller_status === 'approved')
                .map((user) => {
                    let posts = this.state.posts.filter(
                        (p) => p.author.id === user.id && p.status === 'approved'
                    );

                    if (categoryFilter) {
                        posts = posts.filter((p) => p.category.id === categoryFilter);
                    }

                    return {
                        id: user.id,
                        username: user.username,
                        district: user.district,
                        location: user.location,
                        rating: user.rating,
                        verified: user.verified,
                        post_count: posts.length,
                        // Muestra breve para el globo del mapa
                        preview: posts.slice(0, 3).map((p) => ({
                            id: p.id,
                            title: p.title,
                            price: p.price,
                            image_url: p.image_url,
                        })),
                    };
                })
                .filter((s) => s.post_count > 0)
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

            const posts = this.state.posts;
            const users = this.state.users;

            return ok({
                posts: {
                    total: posts.length,
                    approved: posts.filter((p) => p.status === 'approved').length,
                    pending: posts.filter((p) => p.status === 'pending').length,
                    rejected: posts.filter((p) => p.status === 'rejected').length,
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
                    comments: posts.reduce((sum, p) => sum + p.comment_count, 0),
                    interested: posts.reduce((sum, p) => sum + p.interested_count, 0),
                    views: posts.reduce((sum, p) => sum + p.views, 0),
                },
                availability: {
                    available: posts.filter((p) => p.availability === 'available').length,
                    reserved: posts.filter((p) => p.availability === 'reserved').length,
                    sold: posts.filter((p) => p.availability === 'sold').length,
                },
                reports: {
                    open: this.openReports().length,
                    total: (this.state.reports || []).length,
                },
            });
        }

        adminPosts({ query, token }) {
            this.requireAdmin(token);

            const status = query.get('status') || 'pending';
            const search = normalize(query.get('q') || '');

            let posts = status === 'all'
                ? [...this.state.posts]
                : this.state.posts.filter((p) => p.status === status);

            if (search) {
                posts = posts.filter((p) =>
                    normalize(`${p.title} ${p.author.username} ${p.district}`).includes(search));
            }

            // Lo más antiguo primero: se revisa por orden de llegada.
            posts.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            return ok({ posts, total: posts.length });
        }

        approvePost({ params, token }) {
            const admin = this.requireAdmin(token);
            const post = this.state.posts.find((p) => p.id === params.id);

            if (!post) fail('Publicación no encontrada', 404);
            if (post.status === 'approved') fail('Esta publicación ya está aprobada');

            post.status = 'approved';
            post.rejection_reason = null;
            post.updated_at = nowIso();

            this.logModeration(admin, 'approve_post', post.id, `Aprobó «${post.title}»`);
            this.notify(post.author.id, 'post_approved', post.id,
                `Tu publicación «${post.title}» fue aprobada y ya es visible.`);

            this.refreshAuthorCounters(post.author.id);
            this.save();

            return ok({ post });
        }

        rejectPost({ params, body, token }) {
            const admin = this.requireAdmin(token);
            const post = this.state.posts.find((p) => p.id === params.id);

            if (!post) fail('Publicación no encontrada', 404);

            const reason = String(body.reason || '').trim();
            if (reason.length < 8) fail('Indica un motivo de al menos 8 caracteres');

            post.status = 'rejected';
            post.rejection_reason = reason;
            post.updated_at = nowIso();

            this.logModeration(admin, 'reject_post', post.id, `Rechazó «${post.title}»: ${reason}`);
            this.notify(post.author.id, 'post_rejected', post.id,
                `Tu publicación «${post.title}» fue rechazada: ${reason}`);

            this.refreshAuthorCounters(post.author.id);
            this.save();

            return ok({ post });
        }

        adminSellers({ query, token }) {
            this.requireAdmin(token);

            const status = query.get('status') || 'pending';

            const sellers = this.state.users
                .filter((u) => (status === 'all' ? !!u.seller_status : u.seller_status === status))
                .map((u) => ({
                    ...this.publicUser(u),
                    post_count: this.state.posts.filter((p) => p.author.id === u.id).length,
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
                post_id: postId,
                text,
                read: false,
                created_at: nowIso(),
            });
        }

        /** Mantiene al día el número de publicaciones visibles de un autor. */
        refreshAuthorCounters(userId) {
            const user = this.state.users.find((u) => u.id === userId);
            if (!user) return;
            user.total_posts = this.state.posts.filter(
                (p) => p.author.id === userId && p.status === 'approved'
            ).length;
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
        reportPost({ params, body, token }) {
            const user = this.requireUser(token);
            const post = this.state.posts.find((p) => p.id === params.id);

            if (!post) fail('Publicación no encontrada', 404);
            if (post.author.id === user.id) fail('No puedes denunciar tu propia publicación');

            const reason = String(body.reason || '').trim();
            if (reason.length < 10) fail('Cuéntanos el motivo con al menos 10 caracteres');
            if (reason.length > 400) fail('El motivo no puede superar los 400 caracteres');

            this.state.reports = this.state.reports || [];

            const already = this.state.reports.find(
                (r) => r.post_id === post.id && r.reporter_id === user.id && r.status === 'open'
            );
            if (already) fail('Ya denunciaste esta publicación; la estamos revisando');

            const report = {
                id: uid('rep'),
                post_id: post.id,
                post_title: post.title,
                author: post.author.username,
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

            this.logModeration(admin, 'resolve_report', report.post_id,
                `Resolvió la denuncia sobre «${report.post_title}»: ${resolution}`);

            this.notify(report.reporter_id, 'report_resolved', report.post_id,
                `Revisamos tu denuncia sobre «${report.post_title}». ${resolution}`);

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

        openConversation({ body, token }) {
            const user = this.requireUser(token);
            const post = this.interactivePost(body.post_id);

            if (post.author.id === user.id) fail('No puedes escribirte a ti mismo');

            let conversation = this.state.conversations.find(
                (c) => c.post_id === post.id && c.participants.includes(user.id)
            );

            if (!conversation) {
                conversation = {
                    id: uid('conv'),
                    post_id: post.id,
                    post_title: post.title,
                    post_image: post.image_url,
                    post_price: post.price,
                    participants: [user.id, post.author.id],
                    seller: post.author,
                    messages: [{
                        id: uid('msg'),
                        sender_id: post.author.id,
                        sender_name: post.author.username,
                        text: `¡Hola! Soy ${post.author.username}. Gracias por tu interés en «${post.title}». ¿En qué te puedo ayudar?`,
                        read: false,
                        created_at: nowIso(),
                    }],
                    created_at: nowIso(),
                    updated_at: nowIso(),
                };

                this.state.conversations.push(conversation);
                this.save();
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
                reply = `Lo tengo en S/ ${conversation.post_price.toFixed(2)}. Si lo recoges esta semana podemos conversar el precio.`;
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
