/**
 * Banco de pruebas del núcleo de datos de DiscoveryShop.
 * Ejecuta el backend simulado fuera del navegador con un DOM mínimo simulado.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// La raíz del proyecto es el directorio padre de tests/
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
async function expectFail(api, path, options = {}) {
    try {
        await api.request(path, options);
        return null;
    } catch (error) {
        return error;
    }
}

async function run() {
    const api = new sandbox.MockAPI();
    api.latency = 0;

    /* ================= CATÁLOGO DEL FORO ================= */
    const feed = await api.request('/api/posts?per_page=10');
    check('feed devuelve publicaciones', feed.data.posts.length === 10, `obtuve ${feed.data.posts.length}`);
    check('feed solo muestra aprobadas',
        feed.data.posts.every((p) => p.status === 'approved'));
    check('paginación presente', feed.data.pagination.total > 0);

    const all = await api.request('/api/posts?per_page=48');
    const approvedTotal = all.data.pagination.total;
    check('hay publicaciones aprobadas', approvedTotal > 25, `aprobadas=${approvedTotal}`);

    const p = feed.data.posts[0];
    check('publicación tiene título', typeof p.title === 'string' && p.title.length > 0);
    check('publicación tiene precio', typeof p.price === 'number');
    check('publicación tiene distrito', typeof p.district === 'string');
    check('publicación tiene coordenadas',
        typeof p.location.lat === 'number' && typeof p.location.lng === 'number');
    check('coordenadas dentro de Arequipa',
        p.location.lat < -16 && p.location.lat > -17 && p.location.lng < -71 && p.location.lng > -72,
        `lat=${p.location.lat} lng=${p.location.lng}`);
    check('publicación tiene autor', typeof p.author.username === 'string');
    check('publicación tiene categoría', typeof p.category.name === 'string');
    check('imagen es data URI', p.image_url.startsWith('data:image/svg+xml'));
    check('tiene contadores sociales',
        typeof p.likes_count === 'number'
        && typeof p.interested_count === 'number'
        && typeof p.comment_count === 'number');
    check('sin sesión, liked es false', p.liked === false && p.saved === false);
    check('no existe campo de stock', p.stock === undefined);

    /* ================= BÚSQUEDA Y FILTROS ================= */
    const search = await api.request('/api/posts?q=camara');
    check('búsqueda ignora acentos', search.data.posts.length > 0,
        `"camara" debería hallar "Cámaras"; obtuve ${search.data.posts.length}`);

    const noResults = await api.request('/api/posts?q=zzzznoexiste');
    check('búsqueda sin resultados', noResults.data.posts.length === 0);

    const byCat = await api.request('/api/posts?category=cat-gaming&per_page=48');
    check('filtro categoría', byCat.data.posts.every((x) => x.category.id === 'cat-gaming'));
    check('filtro categoría no vacío', byCat.data.posts.length > 0);

    const byDistrict = await api.request('/api/posts?district=Cayma&per_page=48');
    check('filtro distrito', byDistrict.data.posts.every((x) => x.district === 'Cayma'));

    const byPrice = await api.request('/api/posts?min_price=200&max_price=500&per_page=48');
    check('filtro precio', byPrice.data.posts.every((x) => x.price >= 200 && x.price <= 500));

    const byCondition = await api.request('/api/posts?condition=Como nuevo&per_page=48');
    check('filtro condición', byCondition.data.posts.every((x) => x.condition === 'Como nuevo'));

    const combined = await api.request('/api/posts?category=cat-celulares&min_price=500&sort=price_asc');
    check('filtros combinados',
        combined.data.posts.every((x) => x.category.id === 'cat-celulares' && x.price >= 500));

    /* ================= ORDENACIÓN ================= */
    const asc = await api.request('/api/posts?sort=price_asc&per_page=48');
    const ascPrices = asc.data.posts.map((x) => x.price);
    check('orden precio ascendente', ascPrices.every((v, i) => i === 0 || ascPrices[i - 1] <= v));

    const desc = await api.request('/api/posts?sort=price_desc&per_page=48');
    const descPrices = desc.data.posts.map((x) => x.price);
    check('orden precio descendente', descPrices.every((v, i) => i === 0 || descPrices[i - 1] >= v));

    const popular = await api.request('/api/posts?sort=popular&per_page=48');
    const likes = popular.data.posts.map((x) => x.likes_count);
    check('orden por me gusta', likes.every((v, i) => i === 0 || likes[i - 1] >= v));

    const interest = await api.request('/api/posts?sort=interest&per_page=48');
    const interests = interest.data.posts.map((x) => x.interested_count);
    check('orden por interés', interests.every((v, i) => i === 0 || interests[i - 1] >= v));

    const recent = await api.request('/api/posts?sort=recent&per_page=48');
    const dates = recent.data.posts.map((x) => new Date(x.created_at).getTime());
    check('orden reciente', dates.every((v, i) => i === 0 || dates[i - 1] >= v));

    const overflow = await api.request('/api/posts?page=999');
    check('página fuera de rango se acota',
        overflow.data.pagination.page === overflow.data.pagination.total_pages);
    check('página fuera de rango devuelve datos', overflow.data.posts.length > 0);

    /* ================= CATEGORÍAS Y DISTRITOS ================= */
    const cats = await api.request('/api/posts/categories');
    check('categorías cargan', cats.data.categories.length === 12);
    check('categorías con contador', cats.data.categories.every((c) => typeof c.count === 'number'));
    const sumCats = cats.data.categories.reduce((s, c) => s + c.count, 0);
    check('contadores de categoría cuadran', sumCats === approvedTotal, `suma=${sumCats} total=${approvedTotal}`);

    const districts = await api.request('/api/map/districts');
    check('distritos cargan', districts.data.districts.length === 18);
    check('distritos con coordenadas',
        districts.data.districts.every((d) => typeof d.lat === 'number' && typeof d.lng === 'number'));
    check('centro del mapa definido', typeof districts.data.center.lat === 'number');

    /* ================= AUTENTICACIÓN Y ROLES ================= */
    const badLogin = await expectFail(api, '/api/auth/login', {
        method: 'POST', body: { email: 'x@y.z', password: 'malo' },
    });
    check('login incorrecto rechazado', badLogin && badLogin.status === 401);

    // Vendedor aprobado
    const sellerLogin = await api.request('/api/auth/login', {
        method: 'POST', body: { email: 'juan@discoveryshop.pe', password: 'demo1234' },
    });
    const sellerToken = sellerLogin.data.access_token;
    check('login de vendedor', !!sellerToken);
    check('vendedor aprobado', sellerLogin.data.user.seller_status === 'approved');
    check('login no filtra contraseña', sellerLogin.data.user.password_hash === undefined);

    // Administrador
    const adminLogin = await api.request('/api/auth/login', {
        method: 'POST', body: { email: 'admin@discoveryshop.pe', password: 'demo1234' },
    });
    const adminToken = adminLogin.data.access_token;
    check('login de administrador', adminLogin.data.user.role === 'admin');

    // Registro como comprador
    const buyerReg = await api.request('/api/auth/register', {
        method: 'POST',
        body: { username: 'Compradora Nueva', email: 'compradora@test.pe', password: 'clave12345', role: 'buyer', district: 'Miraflores' },
    });
    const buyerToken = buyerReg.data.access_token;
    check('registro de comprador', !!buyerToken);
    check('comprador sin estado de vendedor', buyerReg.data.user.seller_status === null);
    check('comprador tiene rol buyer', buyerReg.data.user.role === 'buyer');
    check('comprador tiene coordenadas', typeof buyerReg.data.user.location.lat === 'number');

    // Registro pidiendo ser vendedor
    const sellerReg = await api.request('/api/auth/register', {
        method: 'POST',
        body: { username: 'Vendedor Nuevo', email: 'vendedor@test.pe', password: 'clave12345', role: 'seller', district: 'Cayma' },
    });
    const newSellerToken = sellerReg.data.access_token;
    check('registro pidiendo vender', sellerReg.data.seller_requested === true);
    check('solicitud queda pendiente', sellerReg.data.user.seller_status === 'pending');
    check('aún no es vendedor', sellerReg.data.user.role === 'buyer');

    const dupEmail = await expectFail(api, '/api/auth/register', {
        method: 'POST', body: { username: 'Otra', email: 'vendedor@test.pe', password: 'clave12345' },
    });
    check('correo duplicado rechazado', dupEmail && /ya existe/i.test(dupEmail.message));

    const shortPass = await expectFail(api, '/api/auth/register', {
        method: 'POST', body: { username: 'Corta', email: 'corta@test.pe', password: '123' },
    });
    check('contraseña corta rechazada', shortPass && /8 caracteres/.test(shortPass.message));

    /* ================= PERMISOS DE PUBLICACIÓN ================= */
    const buyerPost = await expectFail(api, '/api/posts', {
        method: 'POST', token: buyerToken,
        body: { title: 'Intento de comprador', description: 'Descripción suficientemente larga para pasar.', price: 100, category_id: 'cat-hogar' },
    });
    check('comprador no puede publicar', buyerPost && buyerPost.status === 403);
    check('mensaje explica el permiso', buyerPost && /vendedor/i.test(buyerPost.message));

    const pendingPost = await expectFail(api, '/api/posts', {
        method: 'POST', token: newSellerToken,
        body: { title: 'Intento pendiente', description: 'Descripción suficientemente larga para pasar.', price: 100, category_id: 'cat-hogar' },
    });
    check('vendedor pendiente no puede publicar', pendingPost && pendingPost.status === 403);
    check('mensaje menciona la revisión', pendingPost && /revisi[óo]n/i.test(pendingPost.message));

    const created = await api.request('/api/posts', {
        method: 'POST', token: sellerToken,
        body: {
            title: 'Cámara analógica Nikon FM2',
            description: 'Cuerpo en excelente estado con lente de 50 mm. La usé muy poco.',
            price: 1250, category_id: 'cat-camaras', condition: 'Como nuevo', district: 'Cayma',
        },
    });
    check('vendedor aprobado publica', !!created.data.post.id);
    check('publicación nace pendiente', created.data.post.status === 'pending');
    check('publicación recibe coordenadas del distrito',
        created.data.post.location.district === 'Cayma' && typeof created.data.post.location.lat === 'number');
    check('publicación genera imagen', created.data.post.image_url.startsWith('data:image/svg+xml'));

    const newPostId = created.data.post.id;

    // Una publicación pendiente no aparece en el feed público
    const feedAfter = await api.request('/api/posts?q=Nikon FM2');
    check('pendiente no aparece en el feed', feedAfter.data.posts.length === 0);

    // Pero su autor sí la ve
    const mine = await api.request('/api/posts/mine', { token: sellerToken });
    check('el autor ve su pendiente', mine.data.posts.some((x) => x.id === newPostId));
    check('resumen de publicaciones propio', mine.data.summary.pending >= 1);

    const shortTitle = await expectFail(api, '/api/posts', {
        method: 'POST', token: sellerToken,
        body: { title: 'ab', description: 'Descripción suficientemente larga para pasar.', price: 10, category_id: 'cat-hogar' },
    });
    check('título corto rechazado', shortTitle && /4 caracteres/.test(shortTitle.message));

    const noCategory = await expectFail(api, '/api/posts', {
        method: 'POST', token: sellerToken,
        body: { title: 'Sin categoría', description: 'Descripción suficientemente larga para pasar.', price: 10 },
    });
    check('categoría obligatoria', noCategory && /categor[íi]a/i.test(noCategory.message));

    /* ================= MODERACIÓN ================= */
    const notAdmin = await expectFail(api, '/api/admin/stats', { token: sellerToken });
    check('no-admin no entra al panel', notAdmin && notAdmin.status === 403);

    const stats = await api.request('/api/admin/stats', { token: adminToken });
    check('estadísticas del panel', stats.data.posts.total > 0 && stats.data.sellers.pending > 0);
    check('estadísticas cuentan aprobadas', stats.data.posts.approved === approvedTotal);

    const queue = await api.request('/api/admin/posts?status=pending', { token: adminToken });
    check('cola de moderación', queue.data.posts.length > 0);
    check('cola contiene la nueva', queue.data.posts.some((x) => x.id === newPostId));

    const approved = await api.request(`/api/admin/posts/${newPostId}/approve`, {
        method: 'POST', token: adminToken,
    });
    check('admin aprueba publicación', approved.data.post.status === 'approved');

    const feedNow = await api.request('/api/posts?q=Nikon FM2');
    check('aprobada ya aparece en el feed', feedNow.data.posts.length === 1);

    const doubleApprove = await expectFail(api, `/api/admin/posts/${newPostId}/approve`, {
        method: 'POST', token: adminToken,
    });
    check('no se aprueba dos veces', !!doubleApprove);

    // Rechazo con motivo obligatorio
    const pendingQueue = await api.request('/api/admin/posts?status=pending', { token: adminToken });
    const toReject = pendingQueue.data.posts[0];

    const noReason = await expectFail(api, `/api/admin/posts/${toReject.id}/reject`, {
        method: 'POST', token: adminToken, body: { reason: 'no' },
    });
    check('rechazo exige motivo', noReason && /motivo/i.test(noReason.message));

    const rejected = await api.request(`/api/admin/posts/${toReject.id}/reject`, {
        method: 'POST', token: adminToken, body: { reason: 'Las fotos no corresponden al artículo descrito.' },
    });
    check('admin rechaza publicación', rejected.data.post.status === 'rejected');
    check('se guarda el motivo', rejected.data.post.rejection_reason.length > 8);

    /* ================= APROBACIÓN DE VENDEDORES ================= */
    const sellerQueue = await api.request('/api/admin/sellers?status=pending', { token: adminToken });
    check('cola de vendedores', sellerQueue.data.sellers.length > 0);
    check('la nueva solicitud está en cola',
        sellerQueue.data.sellers.some((s) => s.email === 'vendedor@test.pe'));

    const newSellerId = sellerReg.data.user.id;
    const sellerApproved = await api.request(`/api/admin/sellers/${newSellerId}/approve`, {
        method: 'POST', token: adminToken,
    });
    check('admin aprueba vendedor', sellerApproved.data.user.seller_status === 'approved');
    check('rol pasa a seller', sellerApproved.data.user.role === 'seller');
    check('queda verificado', sellerApproved.data.user.verified === true);

    // Ahora sí puede publicar
    const nowCanPost = await api.request('/api/posts', {
        method: 'POST', token: newSellerToken,
        body: { title: 'Mesa de centro de madera', description: 'En buen estado, la vendo por mudanza de casa.', price: 180, category_id: 'cat-hogar', district: 'Cayma' },
    });
    check('vendedor recién aprobado publica', nowCanPost.data.post.status === 'pending');

    // Solicitud de un comprador ya registrado
    const application = await api.request('/api/auth/seller-application', {
        method: 'POST', token: buyerToken, body: { motivation: 'Quiero vender cosas que ya no uso.' },
    });
    check('comprador solicita ser vendedor', application.data.user.seller_status === 'pending');

    const dupApplication = await expectFail(api, '/api/auth/seller-application', {
        method: 'POST', token: buyerToken, body: {},
    });
    check('no se duplica la solicitud', dupApplication && /revisi[óo]n/i.test(dupApplication.message));

    const buyerId = buyerReg.data.user.id;
    const sellerRejected = await api.request(`/api/admin/sellers/${buyerId}/reject`, {
        method: 'POST', token: adminToken, body: { reason: 'Falta verificar la identidad del titular.' },
    });
    check('admin rechaza vendedor', sellerRejected.data.user.seller_status === 'rejected');

    const stillCannot = await expectFail(api, '/api/posts', {
        method: 'POST', token: buyerToken,
        body: { title: 'Otro intento', description: 'Descripción suficientemente larga para pasar.', price: 50, category_id: 'cat-hogar' },
    });
    check('rechazado sigue sin poder publicar', stillCannot && stillCannot.status === 403);

    const log = await api.request('/api/admin/log', { token: adminToken });
    check('registro de moderación', log.data.log.length >= 4);
    check('registro guarda quién actuó', log.data.log[0].admin_name === 'Administración');

    /* ================= INTERACCIONES DEL FORO ================= */
    const target = feed.data.posts[1];

    const like1 = await api.request(`/api/posts/${target.id}/like`, { method: 'POST', token: buyerToken });
    check('me gusta se activa', like1.data.liked === true);
    const likeCountAfter = like1.data.likes_count;

    const like2 = await api.request(`/api/posts/${target.id}/like`, { method: 'POST', token: buyerToken });
    check('me gusta se alterna', like2.data.liked === false);
    check('contador de me gusta baja', like2.data.likes_count === likeCountAfter - 1);

    const interest1 = await api.request(`/api/posts/${target.id}/interest`, { method: 'POST', token: buyerToken });
    check('me interesa se activa', interest1.data.interested === true);

    const ownInterest = await expectFail(api, `/api/posts/${target.id}/interest`, {
        method: 'POST', token: sellerToken,
    });
    // Solo falla si la publicación es del propio vendedor
    const targetIsSellers = target.author.id === sellerLogin.data.user.id;
    check('no se marca interés en lo propio', targetIsSellers ? !!ownInterest : true);

    const save1 = await api.request(`/api/posts/${target.id}/save`, { method: 'POST', token: buyerToken });
    check('guardar se activa', save1.data.saved === true);

    const saved = await api.request('/api/posts/saved', { token: buyerToken });
    check('aparece en guardados', saved.data.posts.some((x) => x.id === target.id));

    await api.request(`/api/posts/${target.id}/save`, { method: 'POST', token: buyerToken });
    const savedAfter = await api.request('/api/posts/saved', { token: buyerToken });
    check('se quita de guardados', !savedAfter.data.posts.some((x) => x.id === target.id));

    // El estado personalizado viaja en el feed
    await api.request(`/api/posts/${target.id}/like`, { method: 'POST', token: buyerToken });
    const personalized = await api.request('/api/posts?per_page=10', { token: buyerToken });
    const seen = personalized.data.posts.find((x) => x.id === target.id);
    check('el feed refleja mi me gusta', seen && seen.liked === true);
    check('el feed refleja mi interés', seen && seen.interested_by_me === true);

    const anonLike = await expectFail(api, `/api/posts/${target.id}/like`, { method: 'POST' });
    check('sin sesión no se reacciona', anonLike && anonLike.status === 401);

    /* ================= COMENTARIOS ================= */
    const comment = await api.request(`/api/posts/${target.id}/comments`, {
        method: 'POST', token: buyerToken, body: { text: '¿Sigue disponible? Me interesa mucho.' },
    });
    check('comentario creado', !!comment.data.comment.id);
    check('contador de comentarios sube', comment.data.comment_count >= 1);
    check('comentario guarda autor', comment.data.comment.author.username === 'Compradora Nueva');

    const emptyComment = await expectFail(api, `/api/posts/${target.id}/comments`, {
        method: 'POST', token: buyerToken, body: { text: '   ' },
    });
    check('comentario vacío rechazado', emptyComment && /vac[íi]o/.test(emptyComment.message));

    const comments = await api.request(`/api/posts/${target.id}/comments`);
    check('comentarios se listan', comments.data.comments.length === comment.data.comment_count);

    const commentId = comment.data.comment.id;
    const otherUserDelete = await expectFail(api,
        `/api/posts/${target.id}/comments/${commentId}`, { method: 'DELETE', token: newSellerToken });
    check('no se borra comentario ajeno', otherUserDelete && otherUserDelete.status === 403);

    const deleted = await api.request(`/api/posts/${target.id}/comments/${commentId}`, {
        method: 'DELETE', token: buyerToken,
    });
    check('autor borra su comentario', deleted.data.deleted === commentId);

    /* ================= MAPA ================= */
    const map = await api.request('/api/map/sellers');
    check('mapa devuelve vendedores', map.data.sellers.length > 0);
    check('todos los del mapa están verificados',
        map.data.sellers.every((s) => s.verified === true));
    check('todos tienen publicaciones', map.data.sellers.every((s) => s.post_count > 0));
    check('todos tienen coordenadas',
        map.data.sellers.every((s) => typeof s.location.lat === 'number'));
    check('el mapa trae vista previa', map.data.sellers.every((s) => Array.isArray(s.preview)));
    check('el mapa trae centro', typeof map.data.center.lat === 'number');

    const mapFiltered = await api.request('/api/map/sellers?district=Cayma');
    check('mapa filtra por distrito',
        mapFiltered.data.sellers.every((s) => s.district === 'Cayma'));

    /* ================= MENSAJERÍA ================= */
    const conv = await api.request('/api/chat/conversations', {
        method: 'POST', token: buyerToken, body: { post_id: target.id },
    });
    check('conversación abierta', !!conv.data.conversation.id);
    check('mensaje de bienvenida', conv.data.conversation.messages.length === 1);

    const convId = conv.data.conversation.id;
    const dupConv = await api.request('/api/chat/conversations', {
        method: 'POST', token: buyerToken, body: { post_id: target.id },
    });
    check('no duplica conversación', dupConv.data.conversation.id === convId);

    const sent = await api.request(`/api/chat/conversations/${convId}/messages`, {
        method: 'POST', token: buyerToken, body: { text: '¿Sigue disponible?' },
    });
    check('mensaje enviado', sent.data.message.text === '¿Sigue disponible?');

    const reply = api.autoReply(convId, 'en que distrito estas?');
    check('respuesta automática contextual', reply && /distrito|zona|punto/i.test(reply.text));

    const convList = await api.request('/api/chat/conversations', { token: buyerToken });
    check('conversación listada', convList.data.conversations.length === 1);
    check('último mensaje presente', !!convList.data.conversations[0].last_message);

    /* ================= ENDPOINTS ELIMINADOS ================= */
    const cartGone = await expectFail(api, '/api/cart', { token: buyerToken });
    check('el carrito ya no existe', cartGone && cartGone.status === 404);

    const ordersGone = await expectFail(api, '/api/orders', { token: buyerToken });
    check('los pedidos ya no existen', ordersGone && ordersGone.status === 404);

    /* ================= PERSISTENCIA ================= */
    const api2 = new sandbox.MockAPI();
    api2.latency = 0;
    const persisted = await api2.request('/api/posts/mine', { token: sellerToken });
    check('los datos persisten entre instancias',
        persisted.data.posts.some((x) => x.id === newPostId));

    /* ================= CIERRE DE SESIÓN ================= */
    await api.request('/api/auth/logout', { method: 'POST', token: buyerToken });
    const loggedOut = await expectFail(api, '/api/auth/me', { token: buyerToken });
    check('logout invalida el token', loggedOut && loggedOut.status === 401);

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
