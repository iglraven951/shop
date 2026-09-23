/**
 * Banco de pruebas del núcleo de datos de DiscoveryShop.
 *
 * Ejecuta el backend simulado fuera del navegador, con un DOM mínimo, y
 * comprueba el contrato del **comercio inverso** de punta a punta:
 *
 *   pedido → ofertas → aceptada → conversación → compra → calificación
 *
 * La regla que gobierna el modelo entero: pedir no requiere permiso, ofrecer sí.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* --- Simulación mínima del entorno del navegador --- */
function createStorage() {
    const data = new Map();
    return {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: (k) => data.delete(k),
        clear: () => data.clear(),
    };
}

const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    URL,
    URLSearchParams,
    Intl,
    Math,
    Date,
    JSON,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

function load(relPath) {
    const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    vm.runInContext(code, sandbox, { filename: relPath });
}

load('assets/js/core/seed.js');
load('assets/js/core/mock-api.js');

/* --- Utilidades de prueba --- */
let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) {
        passed += 1;
    } else {
        failed += 1;
        failures.push(`${name}${detail ? ` → ${detail}` : ''}`);
    }
}

/** Ejecuta una petición esperando que falle, y devuelve el error. */
async function expectFail(api, route, options = {}) {
    try {
        await api.request(route, options);
        return null;
    } catch (error) {
        return error;
    }
}

async function run() {
    const api = new sandbox.MockAPI();
    api.latency = 0;

    /* ================= EL TABLÓN DE PEDIDOS ================= */
    const board = await api.request('/api/requests?per_page=10');
    check('el tablón devuelve pedidos', board.data.requests.length === 10,
        `obtuve ${board.data.requests.length}`);
    check('solo muestra los aprobados',
        board.data.requests.every((x) => x.status === 'approved'));
    check('viene paginado', board.data.pagination.total > 0);

    const all = await api.request('/api/requests?per_page=48');
    const approvedTotal = all.data.pagination.total;
    check('hay un tablón poblado', approvedTotal > 40, `aprobados=${approvedTotal}`);

    const one = board.data.requests[0];
    check('un pedido tiene título', typeof one.title === 'string' && one.title.length > 0);
    check('tiene quien lo busca', typeof one.buyer.username === 'string');
    check('tiene categoría', typeof one.category.name === 'string');
    check('tiene distrito', typeof one.district === 'string');
    check('tiene coordenadas',
        typeof one.location.lat === 'number' && typeof one.location.lng === 'number');
    check('las coordenadas caen en Arequipa',
        one.location.lat < -16 && one.location.lat > -17
        && one.location.lng < -71 && one.location.lng > -72,
        `lat=${one.location.lat} lng=${one.location.lng}`);

    check('tiene presupuesto, no precio',
        typeof one.budget_min === 'number' && typeof one.budget_max === 'number'
        && one.price === undefined);
    check('dice en qué estado lo acepta', typeof one.condition === 'string' && one.condition.length > 0);
    check('tiene ciclo de vida', ['open', 'matched', 'fulfilled', 'cancelled'].includes(one.state));
    check('sabe cuántas respuestas lleva', typeof one.offers_count === 'number');
    check('lleva foto de referencia',
        /^https:\/\/images\.unsplash\.com\/photo-/.test(one.image_url), one.image_url.slice(0, 50));
    check('y respaldo sin red', String(one.fallback_url || '').startsWith('data:image/svg+xml'));
    check('sin sesión no hay marcas propias', one.me_too_by_me === false && one.saved === false);
    check('no existe el campo de stock', one.stock === undefined);

    /* ================= BÚSQUEDA Y FILTROS ================= */
    const search = await api.request('/api/requests?q=camara');
    check('la búsqueda ignora acentos', search.data.requests.length > 0,
        `«camara» debería hallar «Cámara»; obtuve ${search.data.requests.length}`);

    const noResults = await api.request('/api/requests?q=zzzznoexiste');
    check('búsqueda sin resultados', noResults.data.requests.length === 0);

    const byCat = await api.request('/api/requests?category=cat-gaming&per_page=48');
    check('filtro por categoría', byCat.data.requests.every((x) => x.category.id === 'cat-gaming'));
    check('el filtro de categoría trae algo', byCat.data.requests.length > 0);

    const byDistrict = await api.request('/api/requests?district=Cayma&per_page=48');
    check('filtro por distrito', byDistrict.data.requests.every((x) => x.district === 'Cayma'));

    const byState = await api.request('/api/requests?state=open&per_page=48');
    check('filtro por situación', byState.data.requests.every((x) => x.state === 'open'));
    check('y hay pedidos abiertos', byState.data.requests.length > 0);

    const byCondition = await api.request('/api/requests?condition=Solo nuevo&per_page=48');
    check('filtro por estado aceptable',
        byCondition.data.requests.every((x) => x.condition === 'Solo nuevo'));

    /* El presupuesto es un rango: «hasta 500» tiene que encontrar a quien
       ofrece pagar entre 400 y 600, porque ahí hay trato posible. */
    const cheap = await api.request('/api/requests?max_price=500&per_page=48');
    check('el filtro de presupuesto busca solapamiento',
        cheap.data.requests.every((x) => x.budget_min <= 500));

    /* ================= ORDENACIÓN ================= */
    const asc = await api.request('/api/requests?sort=budget_asc&per_page=48');
    const ascBudgets = asc.data.requests.map((x) => x.budget_max);
    check('orden por presupuesto ascendente',
        ascBudgets.every((v, i) => i === 0 || ascBudgets[i - 1] <= v));

    const popular = await api.request('/api/requests?sort=popular&per_page=48');
    const meTooCounts = popular.data.requests.map((x) => x.me_too_count);
    check('orden por cuánta gente lo busca',
        meTooCounts.every((v, i) => i === 0 || meTooCounts[i - 1] >= v));

    const recent = await api.request('/api/requests?sort=recent&per_page=48');
    const dates = recent.data.requests.map((x) => new Date(x.created_at).getTime());
    check('orden por más reciente', dates.every((v, i) => i === 0 || dates[i - 1] >= v));

    const overflow = await api.request('/api/requests?page=999');
    check('una página fuera de rango se acota',
        overflow.data.pagination.page === overflow.data.pagination.total_pages);

    /* ================= CATÁLOGOS ================= */
    const cats = await api.request('/api/requests/categories');
    check('hay doce categorías', cats.data.categories.length === 12);
    const sumCats = cats.data.categories.reduce((s, c) => s + c.count, 0);
    check('los contadores de categoría cuadran', sumCats === approvedTotal,
        `suma=${sumCats} total=${approvedTotal}`);

    const districts = await api.request('/api/map/districts');
    check('hay distritos con centro',
        districts.data.districts.length > 10 && !!districts.data.center);

    /* ================= SESIONES ================= */
    const badLogin = await expectFail(api, '/api/auth/login', {
        method: 'POST', body: { email: 'juan@discoveryshop.pe', password: 'mal' },
    });
    check('una contraseña incorrecta no entra', badLogin && badLogin.status === 401);

    const sellerLogin = await api.request('/api/auth/login', {
        method: 'POST', body: { email: 'juan@discoveryshop.pe', password: 'demo1234' },
    });
    const sellerToken = sellerLogin.data.access_token;
    check('entra un vendedor aprobado', sellerLogin.data.user.seller_status === 'approved');
    check('y tiene nombre de local', typeof sellerLogin.data.user.shop_name === 'string');

    const adminLogin = await api.request('/api/auth/login', {
        method: 'POST', body: { email: 'admin@discoveryshop.pe', password: 'demo1234' },
    });
    const adminToken = adminLogin.data.access_token;

    const buyerReg = await api.request('/api/auth/register', {
        method: 'POST',
        body: {
            username: 'Compradora Nueva', email: 'compradora@test.pe',
            password: 'clave12345', role: 'buyer', district: 'Miraflores',
        },
    });
    const buyerToken = buyerReg.data.access_token;
    check('se registra una compradora', !!buyerToken);
    check('sin estado de vendedor', buyerReg.data.user.seller_status === null);

    /* ================= PUBLICAR UN PEDIDO ================= */
    const anon = await expectFail(api, '/api/requests', {
        method: 'POST', body: { title: 'Algo' },
    });
    check('sin sesión no se publica', anon && anon.status === 401);

    const shortTitle = await expectFail(api, '/api/requests', {
        method: 'POST', token: buyerToken,
        body: {
            title: 'ab', description: 'Una descripción suficientemente larga para pasar',
            category_id: 'cat-hogar',
        },
    });
    check('el título corto se rechaza', !!shortTitle);

    const shortDesc = await expectFail(api, '/api/requests', {
        method: 'POST', token: buyerToken,
        body: { title: 'Lámpara vintage', description: 'corta', category_id: 'cat-hogar' },
    });
    check('la descripción corta se rechaza', !!shortDesc);

    const noCategory = await expectFail(api, '/api/requests', {
        method: 'POST', token: buyerToken,
        body: { title: 'Lámpara vintage', description: 'Una descripción suficientemente larga' },
    });
    check('sin categoría se rechaza', !!noCategory);

    const badBudget = await expectFail(api, '/api/requests', {
        method: 'POST', token: buyerToken,
        body: {
            title: 'Lámpara vintage', description: 'Una descripción suficientemente larga',
            category_id: 'cat-hogar', budget_min: 500, budget_max: 100,
        },
    });
    check('un presupuesto al revés se rechaza', !!badBudget);

    /* La inversión, en una sola comprobación: una compradora sin permiso de
       vendedor publica. En el modelo anterior esto era un 403. */
    const created = await api.request('/api/requests', {
        method: 'POST', token: buyerToken,
        body: {
            title: 'Lámpara vintage de escritorio',
            description: 'Busco una lámpara vintage de escritorio, dorada, estilo antiguo.',
            category_id: 'cat-hogar',
            budget_min: 80,
            budget_max: 160,
            condition: 'Como nuevo o mejor',
            district: 'Miraflores',
        },
    });
    const newRequestId = created.data.request.id;
    check('una compradora puede pedir', !!newRequestId);
    check('el pedido nace en revisión', created.data.request.status === 'pending');
    check('y abierto', created.data.request.state === 'open');
    check('guarda el presupuesto',
        created.data.request.budget_min === 80 && created.data.request.budget_max === 160);
    check('guarda hasta dónde cede', created.data.request.condition === 'Como nuevo o mejor');
    check('la IA lo revisó',
        !!created.data.review && typeof created.data.review.decision === 'string');

    const mine = await api.request('/api/requests/mine', { token: buyerToken });
    check('aparece en sus pedidos', mine.data.requests.some((x) => x.id === newRequestId));

    const stillPending = created.data.request.status === 'pending';
    const hidden = await expectFail(api, `/api/requests/${newRequestId}`, { token: sellerToken });
    check('un pedido sin aprobar no lo ve otro', stillPending ? !!hidden : true);

    /* ================= MODERACIÓN ================= */
    const queueAsBuyer = await expectFail(api, '/api/admin/requests', { token: buyerToken });
    check('la cola es solo del admin', queueAsBuyer && queueAsBuyer.status === 403);

    const queue = await api.request('/api/admin/requests?status=pending', { token: adminToken });
    check('el admin ve la cola', Array.isArray(queue.data.requests));

    if (stillPending) {
        const approved = await api.request(`/api/admin/requests/${newRequestId}/approve`, {
            method: 'POST', token: adminToken,
        });
        check('el admin aprueba', approved.data.request.status === 'approved');

        const twice = await expectFail(api, `/api/admin/requests/${newRequestId}/approve`, {
            method: 'POST', token: adminToken,
        });
        check('no se aprueba dos veces', !!twice);
    }

    const shortReason = await expectFail(api, `/api/admin/requests/${newRequestId}/reject`, {
        method: 'POST', token: adminToken, body: { reason: 'no' },
    });
    check('rechazar exige un motivo', !!shortReason);

    /* ================= OFERTAS ================= */
    const openBoard = await api.request('/api/requests?state=open&per_page=48');

    /* Ni del vendedor que va a ofertar ni de la compradora con la que se
       comprueba después qué ve alguien ajeno: si fuera de ninguno de los dos,
       la comprobación de visibilidad mediría lo contrario de lo que dice. */
    const ajeno = (x) => x.buyer.id !== sellerLogin.data.user.id
        && x.buyer.id !== buyerReg.data.user.id;

    const target = openBoard.data.requests.find((x) => ajeno(x) && x.offers_count === 0)
        || openBoard.data.requests.find(ajeno);

    const buyerOffer = await expectFail(api, `/api/requests/${target.id}/offers`, {
        method: 'POST', token: buyerToken,
        body: { message: 'Yo tengo uno de esos aquí mismo', price: 100 },
    });
    check('una compradora no puede ofertar', buyerOffer && buyerOffer.status === 403);

    const shortMessage = await expectFail(api, `/api/requests/${target.id}/offers`, {
        method: 'POST', token: sellerToken, body: { message: 'lo tengo', price: 100 },
    });
    check('una oferta sin explicación se rechaza', !!shortMessage);

    const noPrice = await expectFail(api, `/api/requests/${target.id}/offers`, {
        method: 'POST', token: sellerToken,
        body: { message: 'Tengo justo lo que buscas, pasa a verlo', price: 0 },
    });
    check('una oferta sin precio se rechaza', !!noPrice);

    const offer = await api.request(`/api/requests/${target.id}/offers`, {
        method: 'POST', token: sellerToken,
        body: {
            message: 'Hola, soy de Tecno Cayma. Tengo justo lo que buscas, en buen estado.',
            price: 450,
            shop_address_hint: 'Av. Ejército 123, Cayma',
        },
    });
    const offerId = offer.data.offer.id;
    check('un vendedor aprobado responde', !!offerId);
    check('la oferta nace pendiente', offer.data.offer.status === 'pending');
    check('lleva el nombre del local', !!offer.data.offer.shop_name);
    check('y sube el contador del pedido', offer.data.offers_count >= 1);

    const twiceOffer = await expectFail(api, `/api/requests/${target.id}/offers`, {
        method: 'POST', token: sellerToken,
        body: { message: 'Tengo otro más por si acaso te sirve', price: 400 },
    });
    check('no se oferta dos veces al mismo pedido', !!twiceOffer);

    const ownRequest = await api.request('/api/requests', {
        method: 'POST', token: sellerToken,
        body: {
            title: 'Vitrina para mi local',
            description: 'Necesito una vitrina de vidrio para exhibir en la tienda.',
            category_id: 'cat-hogar',
        },
    });
    const selfOffer = await expectFail(api, `/api/requests/${ownRequest.data.request.id}/offers`, {
        method: 'POST', token: sellerToken,
        body: { message: 'Me la ofrezco a mí mismo, qué cosas', price: 100 },
    });
    check('nadie responde a su propio pedido', !!selfOffer);

    /* Las ofertas ajenas no se enseñan: son la estrategia de cada tienda, y
       publicarlas convertiría esto en una subasta a la baja. */
    const asStranger = await api.request(`/api/requests/${target.id}/offers`, { token: buyerToken });
    check('quien no pidió no ve las ofertas de otros',
        asStranger.data.offers.length === 0 && asStranger.data.can_see_all === false);

    const asSeller = await api.request(`/api/requests/${target.id}/offers`, { token: sellerToken });
    check('un vendedor ve la suya', asSeller.data.offers.length === 1);

    const myOffers = await api.request('/api/offers/mine', { token: sellerToken });
    check('el vendedor lista sus ofertas', myOffers.data.offers.some((o) => o.id === offerId));
    check('con su resumen', myOffers.data.summary.pending >= 1);

    /* ================= ACEPTAR, COMPRAR, CALIFICAR ================= */
    /* Se usa el pedido de la demo — la lámpara de Patricia con la oferta de la
       Tienda Vintage AQP esperando —, que es el storyboard tal cual. */
    const patricia = await api.request('/api/auth/login', {
        method: 'POST', body: { email: 'patricia@discoveryshop.pe', password: 'demo1234' },
    });
    const patriciaToken = patricia.data.access_token;

    const herRequests = await api.request('/api/requests/mine', { token: patriciaToken });
    const lamp = herRequests.data.requests.find((x) => x.offers_count > 0 && x.state === 'open');
    check('la demo trae un pedido con oferta esperando', !!lamp);

    const herOffers = await api.request(`/api/requests/${lamp.id}/offers`, { token: patriciaToken });
    check('quien pidió ve todas sus ofertas', herOffers.data.can_see_all === true);
    check('y hay al menos una', herOffers.data.offers.length > 0);

    const lampOffer = herOffers.data.offers[0];

    const strangerAccept = await expectFail(api, `/api/offers/${lampOffer.id}/accept`, {
        method: 'POST', token: sellerToken,
    });
    check('nadie acepta una oferta ajena', strangerAccept && strangerAccept.status === 403);

    const accepted = await api.request(`/api/offers/${lampOffer.id}/accept`, {
        method: 'POST', token: patriciaToken,
    });
    check('aceptar marca la oferta', accepted.data.offer.status === 'accepted');
    check('y empareja el pedido', accepted.data.request.state === 'matched');
    check('abre la conversación', !!accepted.data.conversation);
    check('con el mensaje de la oferta dentro',
        accepted.data.conversation.messages[0].text === lampOffer.message);
    check('y crea el trato', !!accepted.data.deal && accepted.data.deal.confirmed_at === null);

    const dealId = accepted.data.deal.id;

    const rateEarly = await expectFail(api, `/api/deals/${dealId}/rate`, {
        method: 'POST', token: patriciaToken, body: { stars: 5 },
    });
    check('no se califica antes de confirmar', !!rateEarly);

    const confirmBySeller = await expectFail(api, `/api/deals/${dealId}/confirm`, {
        method: 'POST', token: sellerToken,
    });
    check('solo quien compró confirma', confirmBySeller && confirmBySeller.status === 403);

    const confirmed = await api.request(`/api/deals/${dealId}/confirm`, {
        method: 'POST', token: patriciaToken,
    });
    check('la compra se confirma', !!confirmed.data.deal.confirmed_at);
    check('y cierra el pedido', confirmed.data.request.state === 'fulfilled');

    const badStars = await expectFail(api, `/api/deals/${dealId}/rate`, {
        method: 'POST', token: patriciaToken, body: { stars: 9 },
    });
    check('nueve estrellas no existen', !!badStars);

    const before = lampOffer.seller.rating_count || 0;

    const rated = await api.request(`/api/deals/${dealId}/rate`, {
        method: 'POST', token: patriciaToken,
        body: { stars: 5, comment: '¡Todo excelente! El vendedor fue muy amable.' },
    });
    check('se puede calificar', rated.data.deal.rating.stars === 5);
    check('la reputación crece con la compra',
        rated.data.seller_rating_count === before + 1,
        `${rated.data.seller_rating_count} vs ${before + 1}`);
    check('y la nota sale de estrellas reales',
        rated.data.seller_rating > 0 && rated.data.seller_rating <= 5,
        String(rated.data.seller_rating));

    const rateTwice = await expectFail(api, `/api/deals/${dealId}/rate`, {
        method: 'POST', token: patriciaToken, body: { stars: 1 },
    });
    check('no se califica dos veces', !!rateTwice);

    const deals = await api.request('/api/deals?role=buyer', { token: patriciaToken });
    check('sus compras quedan listadas', deals.data.deals.some((d) => d.id === dealId));

    /* ================= INTERACCIONES ================= */
    const meTooTarget = openBoard.data.requests.find((x) => x.buyer.id !== buyerReg.data.user.id);

    const meToo = await api.request(`/api/requests/${meTooTarget.id}/me-too`, {
        method: 'POST', token: buyerToken,
    });
    check('«también lo busco» se activa', meToo.data.me_too === true);

    const meTooOff = await api.request(`/api/requests/${meTooTarget.id}/me-too`, {
        method: 'POST', token: buyerToken,
    });
    check('y se puede quitar', meTooOff.data.me_too === false);

    const own = await expectFail(api, `/api/requests/${newRequestId}/me-too`, {
        method: 'POST', token: buyerToken,
    });
    check('no se marca en el propio', !!own);

    const saved = await api.request(`/api/requests/${meTooTarget.id}/save`, {
        method: 'POST', token: buyerToken,
    });
    check('guardar funciona', saved.data.saved === true);
    check('y registra cuándo', typeof saved.data.saved_at === 'string');

    const savedList = await api.request('/api/requests/saved', { token: buyerToken });
    check('aparece en guardados', savedList.data.requests.some((x) => x.id === meTooTarget.id));

    /* ================= COMENTARIOS ================= */
    const comment = await api.request(`/api/requests/${meTooTarget.id}/comments`, {
        method: 'POST', token: buyerToken, body: { text: '¿Te sirve de otro color?' },
    });
    check('se puede comentar un pedido', comment.data.comment_count > 0);

    const emptyComment = await expectFail(api, `/api/requests/${meTooTarget.id}/comments`, {
        method: 'POST', token: buyerToken, body: { text: '   ' },
    });
    check('un comentario vacío se rechaza', !!emptyComment);

    /* ================= DENUNCIAS ================= */
    const report = await api.request(`/api/requests/${meTooTarget.id}/report`, {
        method: 'POST', token: buyerToken,
        body: { category: 'engano', reason: 'El pedido no describe nada concreto.' },
    });
    check('se puede denunciar un pedido', report.data.report.status === 'open');

    const reports = await api.request('/api/admin/reports', { token: adminToken });
    check('el admin la recibe', reports.data.reports.some((x) => x.id === report.data.report.id));

    const resolved = await api.request(`/api/admin/reports/${report.data.report.id}/resolve`, {
        method: 'POST', token: adminToken, body: { resolution: 'Revisada, se mantiene' },
    });
    check('y la puede cerrar', resolved.data.report.status === 'resolved');

    /* ================= AVISOS ================= */
    const notifs = await api.request('/api/notifications', { token: patriciaToken });
    check('quien pidió tiene avisos', notifs.data.notifications.length > 0);
    check('entre ellos, que alguien respondió',
        notifs.data.notifications.some((n) => n.type === 'offer_received'));

    /* Quien recibió el «sí» es la tienda de la oferta aceptada, que no tiene
       por qué ser el vendedor con el que se probó ofertar más arriba. Las
       cuentas de demostración son nombre@discoveryshop.pe, sin tildes. */
    const firstName = lampOffer.seller.username
        .split(' ')[0]
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

    const winner = await api.request('/api/auth/login', {
        method: 'POST',
        body: { email: `${firstName}@discoveryshop.pe`, password: 'demo1234' },
    });

    const won = await api.request('/api/notifications', { token: winner.data.access_token });
    check('y la tienda elegida se entera',
        won.data.notifications.some((n) =>
            n.type === 'offer_accepted' || n.type === 'deal_rated' || n.type === 'deal_confirmed'),
        won.data.notifications.map((n) => n.type).join(','));

    const readAll = await api.request('/api/notifications/read-all', {
        method: 'POST', token: patriciaToken,
    });
    check('se pueden marcar todos', readAll.data.unread === 0);

    /* ================= EL MAPA DE TIENDAS ================= */
    const mapData = await api.request('/api/map/sellers');
    check('el mapa lista tiendas', mapData.data.sellers.length > 0);
    check('con nombre de local', mapData.data.sellers.every((s) => !!s.shop_name));
    check('y con los pedidos que resolvieron',
        mapData.data.sellers.every((s) => typeof s.deal_count === 'number'));
    check('todas verificadas', mapData.data.sellers.every((s) => s.verified === true));

    /* ================= ESTADÍSTICAS ================= */
    const stats = await api.request('/api/admin/stats', { token: adminToken });
    check('las estadísticas cuentan el ciclo de vida',
        stats.data.lifecycle && typeof stats.data.lifecycle.open === 'number');
    check('las ofertas', stats.data.offers && stats.data.offers.total > 0);
    check('y los tratos cerrados', stats.data.deals && stats.data.deals.rated > 0);

    /* ================= LO QUE YA NO EXISTE ================= */
    for (const gone of ['/api/cart', '/api/orders', '/api/posts']) {
        const missing = await expectFail(api, gone);
        check(`${gone} sigue sin existir`, missing && missing.status === 404);
    }

    /* ================= LO QUE SE ROMPIÓ EN SILENCIO =================
       Todo lo de este bloque pasó de verdad. Ninguno lanzaba una excepción:
       leer una clave que no existe devuelve `undefined`, y `undefined`
       se pinta tan ricamente como «S/ 0.00» o como nada. */

    /* Un pedido no tiene precio. Si alguna vez vuelve a tenerlo, la interfaz
       lo pintaría como cero en toda la ficha sin que nadie se entere. */
    const shape = (await api.request('/api/requests?per_page=1')).data.requests[0];
    for (const gone of ['price', 'availability', 'likes_count', 'interested_count']) {
        check(`un pedido no trae «${gone}»`, shape[gone] === undefined,
            `vino ${JSON.stringify(shape[gone])}`);
    }
    for (const needed of ['budget_min', 'budget_max', 'state', 'me_too_count', 'offers_count']) {
        check(`un pedido sí trae «${needed}»`, shape[needed] !== undefined);
    }

    /* El panel de administración lee estas claves. Cuando `posts` pasó a
       llamarse `requests`, el panel murió entero al primer render. */
    const statsShape = (await api.request('/api/admin/stats', { token: adminToken })).data;
    check('las cifras del panel traen «requests»', !!statsShape.requests
        && typeof statsShape.requests.pending === 'number');
    check('las cifras del panel traen «activity.me_too»',
        typeof statsShape.activity.me_too === 'number');
    check('las cifras del panel ya no traen «posts»', statsShape.posts === undefined);

    const sellersShape = (await api.request('/api/admin/sellers', { token: adminToken })).data;
    check('de un vendedor interesa lo que ha respondido',
        typeof sellersShape.sellers[0].offer_count === 'number');

    /* Ordenar por presupuesto: quien no puso cifra va al final en los dos
       sentidos. Contarlo como cero lo pondría el primero en «de menor a
       mayor», que es justo lo contrario de lo que se pidió. */
    const ceiling = (r) => Number(r.budget_max) || Number(r.budget_min) || 0;
    const ascList = (await api.request('/api/requests?sort=budget_asc&per_page=48')).data.requests;
    const descList = (await api.request('/api/requests?sort=budget_desc&per_page=48')).data.requests;
    const withBudget = (list) => list.filter((r) => ceiling(r) > 0).map(ceiling);

    check('de menor a mayor, el presupuesto sube',
        withBudget(ascList).every((v, i, a) => i === 0 || a[i - 1] <= v));
    check('de mayor a menor, el presupuesto baja',
        withBudget(descList).every((v, i, a) => i === 0 || a[i - 1] >= v));
    check('un presupuesto abierto no se cuela arriba en «de menor a mayor»',
        ascList.length === 0 || ceiling(ascList[0]) > 0);

    /* Editar: el formulario mandaba un precio que el servidor ni miraba, así
       que el presupuesto no había forma de corregirlo. */
    const editable = (await api.request('/api/requests/mine', { token: buyerToken }))
        .data.requests.find((r) => r.state === 'open');

    if (editable) {
        const edited = await api.request(`/api/requests/${editable.id}`, {
            method: 'PUT', token: buyerToken,
            body: { budget_min: 111, budget_max: 222, condition: 'Solo nuevo' },
        });
        const saved = edited.data.request || edited.data;
        check('editar guarda el presupuesto', saved.budget_min === 111 && saved.budget_max === 222,
            `${saved.budget_min}–${saved.budget_max}`);
        check('editar guarda el estado que se acepta', saved.condition === 'Solo nuevo', saved.condition);

        const bogus = await api.request(`/api/requests/${editable.id}`, {
            method: 'PUT', token: buyerToken, body: { condition: 'Con purpurina' },
        });
        check('un estado inventado no entra',
            (bogus.data.request || bogus.data).condition === 'Solo nuevo');
    }

    /* Una compra sin conversación es imposible en este modelo: el chat nace
       al aceptar la oferta. Los datos de demostración lo incumplían y la
       bandeja de Mensajes salía vacía para todo el mundo. */
    const freshDeals = api.state.deals || [];
    const freshConvs = api.state.conversations || [];
    check('hay tratos de ejemplo', freshDeals.length > 0);
    check('cada trato cerrado tiene su conversación',
        freshDeals.every((d) => freshConvs.some((c) => c.offer_id === d.offer_id)),
        `${freshDeals.length} tratos · ${freshConvs.length} conversaciones`);
    check('en la conversación están los dos',
        freshConvs.every((c) => c.participants.length === 2
            && c.participants.every((p) => api.state.users.some((u) => u.id === p))));
    check('la conversación empieza por la oferta de la tienda',
        freshConvs.every((c) => c.messages.length > 0
            && c.messages[0].sender_id === c.seller.id));
    check('la bandeja de una compradora de ejemplo no está vacía', await (async () => {
        const login = await api.request('/api/auth/login', {
            method: 'POST', body: { email: 'patricia@discoveryshop.pe', password: 'demo1234' },
        });
        const inbox = await api.request('/api/chat/conversations', { token: login.data.access_token });
        return inbox.data.conversations.length > 0;
    })());

    /* ================= LAS FOTOS, CADA UNA EN LO SUYO =================
       La foto de un pedido está para que una tienda reconozca de un vistazo
       qué le piden. Repartidas por índice, un pedido de AirPods enseñaba un
       pueblo costero, y una foto que no viene a cuento estorba más que un
       hueco vacío. */
    const seedSource = fs.readFileSync(path.join(ROOT, 'assets/js/core/seed.js'), 'utf8');

    const photoIds = [...seedSource.match(/const PHOTOS = \[([\s\S]*?)\];/)[1]
        .matchAll(/'([^']+)'/g)].map((m) => m[1]);

    const groups = {};
    const groupBlock = seedSource.match(/const PHOTOS_BY_CATEGORY = \{([\s\S]*?)\};/)[1];
    for (const line of groupBlock.split('\n')) {
        const m = line.match(/'([\w-]+)':\s*\[([\d,\s]+)\]/);
        if (m) groups[m[1]] = m[2].split(',').map((n) => Number(n.trim()));
    }

    const seedCategories = sandbox.DiscoverySeed.CATEGORIES.map((c) => c.id);
    check('todas las categorías tienen fotos propias',
        seedCategories.every((id) => (groups[id] || []).length > 0),
        seedCategories.filter((id) => !(groups[id] || []).length).join(', '));

    const used = Object.values(groups).flat();
    check('ninguna foto está en dos categorías', new Set(used).size === used.length);
    check('todas las fotos del catálogo se usan', new Set(used).size === photoIds.length,
        `${new Set(used).size} repartidas de ${photoIds.length}`);

    const photoIndex = (url) => photoIds.findIndex((photoId) => url.includes(photoId));

    const allRequests = (await api.request('/api/requests?per_page=48')).data.requests;
    const strays = allRequests.filter(
        (r) => !(groups[r.category.id] || []).includes(photoIndex(r.image_url))
    );
    check('cada pedido enseña una foto de su categoría', strays.length === 0,
        strays.slice(0, 3).map((r) => `${r.category.id}: ${r.title}`).join(' · '));

    check('y todos tienen respaldo por si la foto no carga',
        allRequests.every((r) => typeof r.fallback_url === 'string' && r.fallback_url.length > 20));

    /* ================= PERSISTENCIA ================= */
    const api2 = new sandbox.MockAPI();
    api2.latency = 0;
    const persisted = await api2.request('/api/requests/mine', { token: buyerToken });
    check('los datos persisten entre instancias',
        persisted.data.requests.some((x) => x.id === newRequestId));

    /* ================= CIERRE DE SESIÓN ================= */
    await api.request('/api/auth/logout', { method: 'POST', token: buyerToken });
    const loggedOut = await expectFail(api, '/api/auth/me', { token: buyerToken });
    check('cerrar sesión invalida el token', loggedOut && loggedOut.status === 401);

    /* ================= RESULTADOS ================= */
    console.log(`\n${'='.repeat(58)}`);
    console.log(`  RESULTADO: ${passed} correctas, ${failed} fallidas`);
    console.log('='.repeat(58));

    if (failures.length) {
        console.log('\nFALLOS:');
        failures.forEach((f) => console.log(`  ✗ ${f}`));
        process.exitCode = 1;
    } else {
        console.log('\n  Todas las pruebas del núcleo pasaron.\n');
    }
}

run().catch((error) => {
    console.error('\nERROR INESPERADO:', error);
    process.exitCode = 1;
});
