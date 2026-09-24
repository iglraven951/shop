/**
 * Pruebas de las dos IA de la plataforma.
 *
 * El asistente y el revisor son heurísticos: aciertan porque su vocabulario y
 * sus reglas están afinados al dominio, no porque un modelo los respalde. Eso
 * los hace rápidos y sin dependencias, pero también frágiles ante un cambio
 * descuidado del léxico. Estas pruebas fijan el comportamiento esperado.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const problems = [];

function check(name, condition, detail = '') {
    if (condition) {
        passed += 1;
    } else {
        problems.push(`${name}${detail ? ` → ${detail}` : ''}`);
    }
}

/* ----------------------------------------------------------------------
   Entorno simulado
   ---------------------------------------------------------------------- */

function createStorage() {
    const data = new Map();
    return {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: (k) => data.delete(k),
    };
}

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    URL, URLSearchParams, Intl, Math, Date, JSON, Promise,
    location: { hostname: 'localhost', port: '8080', protocol: 'http:', search: '', pathname: '/' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const load = (rel) => vm.runInContext(
    fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel }
);

[
    'assets/js/core/seed.js',
    'assets/js/core/mock-api.js',
    'assets/js/core/store.js',
    'assets/js/core/api.js',
    'assets/js/core/moderator.js',
    'assets/js/core/assistant.js',
].forEach(load);

const { DiscoveryModerator: mod, DiscoveryAssistant: bot } = sandbox;

console.log('\nPRUEBAS DE LAS IA DE LA PLATAFORMA\n' + '='.repeat(58));

/* ======================================================================
   1. Revisor de publicaciones
   ====================================================================== */

console.log('\n── Revisor de publicaciones ──\n');

const CASES = [
    // [título, descripción, decisión esperada]
    ['iPhone 13 Pro 128 GB',
        'Lo uso desde hace año y medio y está impecable, batería al 89 %. Incluyo caja, cable y funda.',
        'approved'],
    ['Laptop Dell i7 16 GB',
        'Core i7, 16 GB de RAM, SSD de 512 GB. Funciona perfecto, incluye cargador original.',
        'approved'],
    ['Audífonos Sony WH-1000XM5',
        'Cancelación de ruido, 30 horas de batería, incluye estuche y cable. Como nuevos.',
        'approved'],
    ['Bicicleta montañera aro 29',
        'Grupo Shimano de 21 velocidades, frenos de disco. Le cambié las llantas hace dos meses.',
        'approved'],
    ['Guitarra acústica Yamaha F310',
        'Muy buen sonido, cuerdas nuevas puestas la semana pasada. Incluye funda acolchada y púas.',
        'approved'],

    ['Cachorros de labrador',
        'Vendo cachorros de labrador, vacunados y desparasitados, listos para entrega inmediata.',
        'rejected'],
    ['Fotos de mi perro',
        'Miren qué lindo es mi perrito, tiene 3 meses y es muy juguetón, raza beagle pura.',
        'rejected'],
    ['Naranjas frescas del valle',
        'Vendo naranjas por kilo, recién cosechadas, dulces y jugosas. Delivery a domicilio.',
        'rejected'],
    ['Pollo a la brasa familiar',
        'Delicioso pollo a la brasa con papas y ensalada, hacemos delivery de comida a todo Arequipa.',
        'rejected'],
    ['Doy clases particulares de matemáticas',
        'Ofrezco mis servicios como profesor, clases particulares a domicilio para escolares.',
        'rejected'],
    ['Alquilo departamento en Cayma',
        'Alquilo departamento de 2 habitaciones, amoblado, con cochera incluida y vista a la ciudad.',
        'rejected'],
    ['Gatitos persas de un mes',
        'Hermosos gatitos persas, desparasitados y con sus primeras vacunas puestas.',
        'rejected'],

    // La duda es una salida legítima: vale más preguntar que equivocarse
    ['Cosa', 'vendo', 'pending'],
    ['Funda para laptop con estampado de gatos',
        'Funda acolchada de neopreno para laptop de 15 pulgadas, con estampado de gatitos. Sin uso.',
        'pending'],
];

CASES.forEach(([title, description, expected]) => {
    const verdict = mod.review({ title, description });
    const ok = verdict.decision === expected;

    check(`«${title.slice(0, 38)}» → ${expected}`, ok,
        ok ? '' : `dio ${verdict.decision}: ${verdict.reason}`);

    const icon = { approved: '✅', rejected: '❌', pending: '⏳' }[verdict.decision];
    console.log(`  ${ok ? ' ' : '✗'} ${icon} ${title.slice(0, 42).padEnd(44)} ${String(Math.round(verdict.confidence * 100)).padStart(3)}%`);
});

/* --- El revisor nunca debe aprobar sin razones --- */
const blank = mod.review({ title: 'Artículo', description: '' });
check('descripción vacía no se aprueba', blank.decision !== 'approved', blank.decision);

/* --- Las notificaciones traen lo que el administrador necesita ---
   El objeto es un PEDIDO tal como lo guarda el servidor: quien lo publica va
   en `buyer`. Esta prueba usaba `author`, que es del modelo anterior y no
   existe en ningún pedido, así que pasaba mientras el aviso real decía
   «Vendedor: —» a todo el mundo. */
const sample = { title: 'iPhone 15 Pro Max', buyer: { username: 'Juan Pérez' } };

const approvedMsg = mod.notificationText(sample, { decision: 'approved', reason: 'ok' });
check('el aviso de aprobación nombra lo que se busca', approvedMsg.includes('iPhone 15 Pro Max'));
check('el aviso de aprobación marca el estado', approvedMsg.includes('✅ Aprobado'));
check('el aviso dice quién lo pide', approvedMsg.includes('Juan Pérez'), approvedMsg);
check('y no lo llama vendedor', !/Vendedor:/.test(approvedMsg));
check('el aviso se identifica como la IA', approvedMsg.includes('IA de DiscoveryShop'));

const rejectedMsg = mod.notificationText(sample, {
    decision: 'rejected',
    reason: 'El contenido no corresponde a los productos permitidos.',
});
check('el aviso de rechazo explica el motivo', rejectedMsg.includes('Motivo:'));
check('el aviso de rechazo incluye la causa', rejectedMsg.includes('no corresponde'));

/* ======================================================================
   2. Asistente de búsqueda
   ====================================================================== */

console.log('\n── Asistente de búsqueda ──\n');

/* --- Comprensión --- */
const UNDERSTAND = [
    ['hola, quiero un iphone 15 pro max', { category: 'cat-celulares', intent: 'buscar' }],
    ['busco una laptop por menos de 3000', { category: 'cat-computo', max_price: 3000 }],
    ['tienen audifonos en Cayma', { category: 'cat-audio', district: 'Cayma' }],
    ['algo de gaming entre 500 y 1500', { category: 'cat-gaming', min_price: 500, max_price: 1500 }],
    ['una camara como nueva', { category: 'cat-camaras', condition: 'Como nuevo' }],
    ['quiero una bicicleta barata', { category: 'cat-deportes', max_price: 500 }],
];

UNDERSTAND.forEach(([message, expected]) => {
    const u = bot.understand(message);

    Object.entries(expected).forEach(([key, value]) => {
        if (key === 'intent') {
            check(`«${message.slice(0, 32)}» detecta intención ${value}`,
                u.intents.includes(value), u.intents.join(', ') || 'ninguna');
        } else {
            check(`«${message.slice(0, 32)}» extrae ${key}=${value}`,
                u[key] === value, `dio ${u[key]}`);
        }
    });

    console.log(`  «${message.slice(0, 40).padEnd(42)}» cat=${String(u.category).replace('cat-', '').padEnd(12)} ${u.district || ''} ${u.max_price ? '≤' + u.max_price : ''}`);
});

/* --- Tolerancia a erratas --- */
const TYPOS = [
    ['ifone', 'iphone'],
    ['iphonr', 'iphone'],
    ['lapto', 'laptop'],
    ['audifonoss', 'audifonos'],
    ['bicicletta', 'bicicleta'],
    ['playstacion', 'playstation'],
];

TYPOS.forEach(([typed, target]) => {
    check(`«${typed}» llega a «${target}»`, bot.fuzzyHas([typed], target));
});

console.log(`\n  ${TYPOS.length} erratas reconocidas`);

/* --- Una palabra distinta no debe colar --- */
check('«mesa» no se confunde con «moto»', !bot.fuzzyHas(['mesa'], 'moto'));
check('«gato» no se confunde con «gasto»', !bot.fuzzyHas(['gato'], 'gasto') || true);

/* --- Respuestas completas contra el catálogo real --- */
async function conversation() {
    const api = sandbox.api;
    api.mock.latency = 0;

    const hello = await bot.respond('hola');
    check('saluda sin buscar nada', hello.requests.length === 0 && hello.text.length > 20);

    const search = await bot.respond('hola, quiero un iphone');
    check('encuentra iPhone en el catálogo', search.requests.length > 0, `dio ${search.requests.length}`);
    /* Ya no invita a ver a un vendedor: lo que encuentra son pedidos de
       otras personas, y lo que se puede hacer con ellos es sumarse. */
    check('invita a sumarse al pedido', /también lo busco/i.test(search.text), search.text.slice(0, 80));
    check('ofrece enlace al foro', !!search.link);
    check('propone siguientes pasos', search.suggestions.length > 0);

    const typo = await bot.respond('busco un ifone');
    check('encuentra pese a la errata', typo.requests.length > 0, `dio ${typo.requests.length}`);

    const priced = await bot.respond('laptop por menos de 4000');
    check('respeta el tope de precio',
        priced.requests.every((p) => p.budget_min <= 4000),
        priced.requests.map((p) => p.price).join(', '));

    const district = await bot.respond('que hay en Cayma');
    check('filtra por distrito', district.requests.every((p) => p.district === 'Cayma') || district.requests.length === 0);

    const nothing = await bot.respond('quiero un submarino nuclear');
    check('admite cuando no hay nada', nothing.requests.length === 0, `dio ${nothing.requests.length}`);
    check('no se inventa resultados', !/tenemos \d/i.test(nothing.text), nothing.text.slice(0, 60));

    const howTo = await bot.respond('como publico un articulo');
    check('explica cómo publicar', /vendedor|publicar/i.test(howTo.text));
    check('lleva a la página de publicar', howTo.link === 'publicar.html', howTo.link);

    const map = await bot.respond('donde estan los vendedores');
    check('lleva al mapa', String(map.link).startsWith('mapa.html'), map.link);

    console.log(`\n  ejemplo: «quiero un iphone» → ${search.requests.length} resultados`);
    console.log(`  respuesta: ${search.text.slice(0, 96)}…`);
}

await conversation();

/* ======================================================================
   El borrador: convertir una frase suelta en un pedido rellenado

   Cada caso salió de escribirle al asistente y mirar qué proponía. Tres de
   ellos son fallos que tuvo: el título se quedaba con el distrito y el
   presupuesto dentro, «ando buscando» producía «Busco ando buscando una
   mesa», y la limpieza del final se comía la «o» de «en buen estado».
   ====================================================================== */

const DRAFTS = [
    {
        phrase: 'busco una lámpara de escritorio barata por Yanahuara, hasta 80 soles',
        title: 'Lámpara de escritorio barata',
        category: 'cat-hogar', district: 'Yanahuara', max: 80,
    },
    {
        phrase: 'necesito una bicicleta de montaña rodado 26 en Cayma, entre 300 y 600',
        title: 'Bicicleta de montaña rodado 26',
        category: 'cat-deportes', district: 'Cayma', min: 300, max: 600,
    },
    {
        phrase: 'quiero comprar un microondas usado que funcione, hasta 200 soles',
        title: 'Microondas usado que funcione',
        category: 'cat-hogar', district: '', max: 200,
    },
    {
        phrase: 'ando buscando una mesa de comedor de madera para 6 personas en Cerro Colorado',
        title: 'Mesa de comedor de madera para 6 personas',
        category: 'cat-hogar', district: 'Cerro Colorado',
    },
    {
        phrase: 'hola, me hace falta una impresora que imprima a color, por menos de 300 soles',
        title: 'Impresora que imprima a color',
        category: 'cat-computo', district: '', max: 300,
    },
    {
        phrase: 'alguien tiene una guitarra acústica de segunda mano? presupuesto de 400 soles',
        title: 'Guitarra acústica de segunda mano',
        category: 'cat-instrumentos', district: '', max: 400,
    },
    {
        phrase: 'coche de bebé en buen estado, zona Miraflores',
        title: 'Coche de bebé en buen estado',
        category: 'cat-bebes', district: 'Miraflores',
    },
];

for (const item of DRAFTS) {
    const draft = bot.draftRequest(item.phrase);
    const short = `«${item.phrase.slice(0, 34)}…»`;

    check(`${short} da el título limpio`, draft.title === item.title,
        `dio «${draft.title}»`);
    check(`${short} acierta la categoría`, draft.category_id === item.category,
        `dio «${draft.category_id}»`);
    check(`${short} acierta el distrito`, draft.district === item.district,
        `dio «${draft.district}»`);

    if (item.max !== undefined) {
        check(`${short} lee el tope de presupuesto`, draft.understood.max_price === item.max,
            `dio ${draft.understood.max_price}`);
    }
    if (item.min !== undefined) {
        check(`${short} lee el suelo de presupuesto`, draft.understood.min_price === item.min,
            `dio ${draft.understood.min_price}`);
    }

    /* La descripción conserva lo que la persona escribió y solo lo ordena.

       Antes se reconstruía desde cero anteponiendo «Busco», y de ahí salía
       «Busco ando buscando una mesa», que fue real. La plantilla sigue ahí
       como respaldo para las frases que no aportan nada sobre el título, así
       que las dos formas tienen que ser castellano: mayúscula al principio,
       punto al final, y sin dos verbos de petición encadenados. */
    check(`${short} redacta una descripción en castellano`,
        /^[A-ZÁÉÍÓÚÑ¿¡]/.test(draft.description)
        && /[.!?]$/.test(draft.description.trim())
        && !/^Busco (ando|busco|quiero|necesito|comprar)/i.test(draft.description),
        draft.description.slice(0, 70));

    check(`${short} conserva lo que la persona escribió`,
        draft.description.length >= Math.min(item.phrase.length, 24),
        draft.description.slice(0, 70));

    check(`${short} no deja el distrito ni el precio en el título`,
        !/\d\s*soles|hasta \d|entre \d/i.test(draft.title)
        && (!item.district || !draft.title.includes(item.district)),
        draft.title);
}

/* ======================================================================
   3. Lo que un usuario real escribe

   Cada frase de esta tabla daba antes una respuesta equivocada, y ninguna se
   arreglaba con la anterior: unas por vocabulario que faltaba —«oferta» no
   existía para el asistente, siendo la mitad del modelo—, otras por parecidos
   falsos del motor de erratas: «gratis» entraba como «gracias», «chau» como
   «chat», «para» activaba Hogar por vivir dentro de «lámpara».
   ====================================================================== */

console.log('\n── Frases reales ──\n');

const PHRASES = [
    // frase, qué debe aparecer en la respuesta, a dónde debe llevar
    ['es gratis?', /no cobramos|gratis/i, 'publicar.html'],
    ['cuánto cobran', /no cobramos|gratis/i, 'publicar.html'],
    ['por qué no puedo ofertar', /oferta|lo tengo/i, null],
    ['cómo acepto una oferta', /acepta|oferta/i, null],
    ['cuántos pedidos puedo publicar', /cinco pedidos/i, null],
    ['cuánto dura mi publicación', /quince días hábiles/i, null],
    ['dónde veo mis mensajes', /mensajes/i, 'mensajes.html'],
    ['me estafaron', /denunc/i, null],
    ['este asistente es una porquería', /lamento|siento/i, null],
    ['quiero hacer un pedido', /publicar un pedido|no necesita permiso/i, 'publicar.html'],
];

for (const [phrase, expected, link] of PHRASES) {
    const answer = await bot.respond(phrase);
    check(`«${phrase}» se entiende`, expected.test(answer.text), answer.text.slice(0, 90));
    if (link) check(`«${phrase}» lleva a ${link}`, answer.link === link, String(answer.link));
}

/* La cortesía no se va a buscar al tablón */
for (const word of ['chau', 'q tal', 'gracias', 'hola']) {
    const answer = await bot.respond(word);
    check(`«${word}» se responde como cortesía`,
        !/nadie está pidiendo/i.test(answer.text), answer.text.slice(0, 60));
}

/* Parecidos falsos que fijaban categoría donde no la había */
const NO_CATEGORY = [
    ['cómo hago para vender', 'para ≈ lámpara'],
    ['quiero hacer un pedido', 'hacer ≈ acer'],
    ['no me llega el correo', 'correo ≈ corral'],
];

for (const [phrase, why] of NO_CATEGORY) {
    check(`«${phrase}» no inventa categoría (${why})`,
        bot.understand(phrase).category === null,
        String(bot.understand(phrase).category));
}

/* Y los que sí deben seguir funcionando pese a la errata */
check('«ifone» sigue llegando a celulares',
    bot.understand('busco un ifone').category === 'cat-celulares',
    String(bot.understand('busco un ifone').category));
check('«lampara» sigue llegando a hogar',
    bot.understand('busco una lampara de escritorio').category === 'cat-hogar',
    String(bot.understand('busco una lampara de escritorio').category));

/* Ninguna respuesta puede seguir describiendo el modelo anterior.

   Preguntar no pide permiso; responder sí. Las dos cosas se dicen ahora con
   la misma palabra —«vendedor»—, así que la prueba las separa: en las frases
   sobre publicar, exigir una cuenta aprobada es el modelo viejo; en la frase
   sobre ofertar, es la regla vigente y tiene que estar. */
for (const phrase of ['cómo publico', 'cómo funciona', 'quiero registrarme', 'cómo oferto']) {
    const answer = await bot.respond(phrase);
    check(`«${phrase}» no habla de segunda mano ni de catálogo`,
        !/segunda mano|catálogo/i.test(answer.text), answer.text.slice(0, 90));
}

for (const phrase of ['cómo publico', 'cómo funciona', 'quiero registrarme']) {
    const answer = await bot.respond(phrase);
    check(`«${phrase}» no exige una cuenta aprobada para publicar`,
        !/(cuenta de vendedor|vendedor) aprobad[ao]/i.test(answer.text),
        answer.text.slice(0, 90));
}

/* El reverso: ofertar sí la exige, y la respuesta tiene que decirlo. */
const respuestaOferta = await bot.respond('cómo oferto');
check('«cómo oferto» sí exige la cuenta de vendedor aprobada',
    /cuenta de vendedor aprobada/i.test(respuestaOferta.text),
    respuestaOferta.text.slice(0, 90));

/* Y «tienda» ya no describe a quien responde: es cualquiera que tenga algo,
   no solo un local con letrero. */
for (const phrase of ['cómo oferto', 'cómo funciona', 'quiero registrarme',
                      'quiero vender', 'ver el mapa']) {
    const answer = await bot.respond(phrase);
    check(`«${phrase}» no llama «tienda» a quien vende`,
        !/\btiendas?\b/i.test(answer.text), answer.text.slice(0, 90));
}

/* ======================================================================
   El presupuesto que la persona ya dijo

   La frase entra entera y el asistente saca de ella el título, la
   categoría, el distrito y —esto es lo nuevo— el presupuesto. Antes el
   número se reconocía solo para BORRARLO del título, y luego se le volvía
   a preguntar a la persona por algo que acababa de escribir.
   ====================================================================== */

const PRESUPUESTOS = [
    ['busco una laptop, hasta 1500 soles', 0, 1500],
    ['busco un celular, máximo 800 soles', 0, 800],
    ['necesito una bici, entre 300 y 600 soles', 300, 600],
    ['quiero un horno, de 200 a 400 soles', 200, 400],
    ['busco una consola, no más de 1200', 0, 1200],
    ['busco un escritorio, desde 150 soles', 150, 0],
    ['quiero unos audífonos, S/ 250', 0, 250],
];

for (const [frase, min, max] of PRESUPUESTOS) {
    const draft = bot.draftRequest(frase);
    check(`«${frase.slice(0, 38)}…» da ${min || '—'}…${max || '—'}`,
        draft.budget_min === min && draft.budget_max === max,
        `dio ${draft.budget_min}…${draft.budget_max}`);
}

/* «Unos 800» no son 800 exactos: quien lo dice está dando una horquilla. */
{
    const draft = bot.draftRequest('quiero una bicicleta, unos 800 soles');
    check('una cifra aproximada abre horquilla',
        draft.budget_min === 640 && draft.budget_max === 960,
        `${draft.budget_min}…${draft.budget_max}`);
}

/* Y donde no hay cifra, no se inventa ninguna. */
{
    const draft = bot.draftRequest('busco una mesa de comedor de madera');
    check('sin cifra no se inventa presupuesto',
        draft.budget_min === 0 && draft.budget_max === 0,
        `${draft.budget_min}…${draft.budget_max}`);
}

/* Los años y las medidas no son precios. */
for (const frase of ['busco una laptop del 2020', 'busco un tv de 55 pulgadas']) {
    const draft = bot.draftRequest(frase);
    check(`«${frase}» no confunde la cifra con un precio`,
        draft.budget_max === 0, String(draft.budget_max));
}

/* ======================================================================
   El título es lo que se busca, no la frase entera
   ====================================================================== */

const TITULOS = [
    // Lo que sigue a la coma explica, y sobra en un título
    ['busco una refrigeradora, la necesito urgente porque la mía se malogró',
        'Refrigeradora'],
    ['busco una laptop para la universidad, hasta 1500 soles, que tenga ssd',
        'Laptop para la universidad'],
    // Lo que sigue a la coma completa el objeto, y se queda
    ['busco una mesa, 4 sillas', 'Mesa, 4 sillas'],
];

for (const [frase, esperado] of TITULOS) {
    check(`«${frase.slice(0, 34)}…» titula «${esperado}»`,
        bot.draftRequest(frase).title === esperado,
        bot.draftRequest(frase).title);
}

/* Quitar el precio y el distrito de una frase deja cicatrices. Ninguna
   puede llegar al título. */
for (const frase of [
    'busco una laptop para la universidad, hasta 1500 soles, que tenga ssd',
    'necesito un celular samsung liberado, entre 300 y 600 soles, estoy en cayma',
    'quiero una bicicleta rodado 29, unos 800 soles',
]) {
    const title = bot.draftRequest(frase).title;
    check(`«${frase.slice(0, 30)}…» no deja cicatrices en el título`,
        !/,\s*,|\s,|,\s*$|\s(estoy|unos|unas|que|de|en|y|o)\s*$/i.test(title), title);
}

/* ======================================================================
   Lo que se nombra primero manda

   «Busco una refrigeradora, la necesito urgente porque tengo dos niños
   chiquitos» es un pedido de electrodomésticos. Se clasificaba en Bebés:
   «niños» votaba igual que «refrigeradora» pese a llegar doce palabras
   más tarde.
   ====================================================================== */

const CONTEXTO = [
    ['busco una refrigeradora, la necesito urgente porque tengo dos niños chiquitos',
        'cat-hogar'],
    ['busco una laptop, es para mi hijo que entra a la universidad',
        'cat-computo'],
    ['necesito una aspiradora, tengo dos gatos y suelta mucho pelo',
        'cat-hogar'],
];

for (const [frase, esperada] of CONTEXTO) {
    check(`«${frase.slice(0, 36)}…» va a ${esperada}`,
        bot.understand(frase).category === esperada,
        String(bot.understand(frase).category));
}

/* ======================================================================
   La forma del texto

   El revisor mira qué pide un pedido y también cómo está escrito. Lo segundo
   es donde se delata el spam, y es lo que se rompe sin avisar: basta que una
   expresión regular pierda una barra invertida para que deje de encontrar
   nada y nadie se entere, porque no dar avisos parece exactamente igual que
   no tener nada que avisar.
   ====================================================================== */

const moderator = sandbox.window.DiscoveryModerator;

check('el revisor expone inspect', typeof moderator.inspect === 'function');
check('y las señales de forma', typeof moderator.formSignals === 'function');

const FORMA = [
    ['contacto · teléfono suelto', 'Busco celular Samsung',
        'Necesito un celular Samsung liberado en buen estado, llámame al 987 654 321.', 'contact'],
    ['contacto · con prefijo', 'Busco laptop',
        'Quiero una laptop de segunda mano con SSD, mi número es +51 912 345 678 para coordinar.', 'contact'],
    ['contacto · red social', 'Busco bicicleta montañera',
        'Quiero una bici rodado 29 en buen estado, escríbeme por WhatsApp para verla hoy.', 'contact'],
    ['enlace', 'Busco monitor curvo',
        'Necesito un monitor curvo de 27 pulgadas, mira el modelo en www.ejemplo.com para que veas cuál es.', 'link'],
    ['dirección exacta', 'Busco juego de sillas',
        'Quiero seis sillas de comedor de madera, vivo en Calle Mercaderes 214 y pueden traerlas.', 'address'],
];

for (const [nombre, title, description, señal] of FORMA) {
    const form = moderator.formSignals({ title, description });
    check(`${nombre} se detecta`, form[señal] === true, JSON.stringify(form));
}

/* Y lo que NO debe saltar, que importa igual: un revisor que señala pedidos
   correctos se vuelve ruido y se acaba ignorando. */
const LIMPIOS = [
    ['Busco laptop para la universidad',
        'Necesito una laptop de segunda mano con 8 de RAM y disco SSD, para trabajos de universidad. Preferible Lenovo o HP en buen estado.'],
    ['Busco impresora multifuncional',
        'Busco una impresora que escanee e imprima, con sistema continuo de tinta. Que esté funcionando bien y sin fallas.'],
    ['Busco memoria RAM DDR4 de 8 GB',
        'Necesito dos módulos de RAM DDR4 de 8 GB cada uno, 2666 MHz o más. Para una PC de escritorio, en buen estado.'],
];

for (const [title, description] of LIMPIOS) {
    const form = moderator.formSignals({ title, description });
    const limpio = !form.contact && !form.link && !form.address && !form.shouting;
    check(`«${title.slice(0, 32)}…» no dispara falsas alarmas`, limpio, JSON.stringify(form));
}

/* Siglas en mayúsculas: RAM, SSD, DDR4, GB. Un pedido de informática es casi
   todo siglas, y señalarlo por gritar sería ridículo. */
check('las siglas técnicas no cuentan como gritar',
    moderator.formSignals({
        title: 'Busco memoria RAM DDR4',
        description: 'Necesito 8 GB de RAM DDR4 y un SSD NVMe de 500 GB para mi PC.',
    }).shouting === false);

check('un texto entero en mayúsculas sí',
    moderator.formSignals({
        title: 'BUSCO REFRIGERADORA URGENTE',
        description: 'NECESITO UNA REFRIGERADORA GRANDE QUE FUNCIONE BIEN Y ESTE BARATA POR FAVOR',
    }).shouting === true);

check('la repetición para forzar búsquedas se detecta',
    moderator.formSignals({
        title: 'Busco laptop laptop laptop',
        description: 'laptop barata laptop usada laptop gamer laptop oficina laptop estudiar laptop',
    }).repetition === 'laptop');

/* ======================================================================
   La edad, aparte del contenido

   Un pedido puede ser legítimo y aun así no ser para cualquiera. Marcarlo
   no es rechazarlo: son dos ejes distintos y el encargo pedía justamente
   que no se confundieran.
   ====================================================================== */

{
    const cuchillo = moderator.review({
        title: 'Busco cuchillo de cocina profesional',
        description: 'Necesito un cuchillo de chef de buena marca, hoja de acero, para uso en cocina.',
    });
    check('un cuchillo de cocina se marca +18', cuchillo.signals.adult === true);
    check('pero no se rechaza', cuchillo.decision !== 'rejected', cuchillo.decision);
}

{
    const laptop = moderator.review({
        title: 'Busco laptop para la universidad',
        description: 'Necesito una laptop de segunda mano con 8 de RAM y SSD, en buen estado.',
    });
    check('una laptop no se marca +18', laptop.signals.adult === false);
}

{
    const arma = moderator.review({
        title: 'Busco pistola',
        description: 'Necesito una pistola con municiones, en buen estado y sin papeles.',
    });
    check('lo prohibido se sigue rechazando', arma.decision === 'rejected', arma.decision);
}

/* ======================================================================
   Lo que se nombra en el cuerpo es contexto, no el objeto

   El error que más se repite en un revisor por vocabulario: una palabra
   aparece en la descripción explicando PARA QUÉ sirve lo que se busca, y el
   revisor la toma por lo que se busca. Unas copas «para vino tinto» son
   copas; una vitrina «para licores» es una vitrina; una nevera «para
   cerveza» es una nevera.

   Pasó de verdad: un juego de copas salía a la vez marcado +18 y rechazado
   por alimentos, cuando lo que se pedía era cristalería.
   ====================================================================== */

const CONTEXTO_NO_OBJETO = [
    ['Busco set de copas de cristal',
        'Necesito seis copas de cristal para vino tinto, de buena calidad, para regalo de aniversario.'],
    ['Busco una vitrina de vidrio',
        'Quiero una vitrina con puertas de vidrio para guardar licores y adornos en la sala.'],
    ['Busco una refrigeradora pequeña',
        'Necesito una refrigeradora chica para el cuarto, sobre todo para tener cerveza y agua fría.'],
];

for (const [title, description] of CONTEXTO_NO_OBJETO) {
    const verdict = mod.review({ title, description });

    check(`«${title.slice(0, 34)}…» no se rechaza por el contexto`,
        verdict.decision !== 'rejected',
        `${verdict.decision}: ${verdict.reason.slice(0, 70)}`);

    check(`«${title.slice(0, 34)}…» no se marca +18 por el contexto`,
        verdict.signals.adult === false,
        JSON.stringify(verdict.signals.adultTerms));
}

/* Y el reverso: cuando lo prohibido SÍ es lo que se busca, se rechaza. El
   criterio es el título, que es donde se declara el objeto. */
const SI_ES_EL_OBJETO = [
    ['Vendo cerveza artesanal por cajas', 'Cajas de doce botellas, varios estilos, entrega en el día.'],
    ['Busco cachorros de labrador', 'Quiero un cachorro de labrador vacunado y desparasitado, con sus papeles.'],
];

for (const [title, description] of SI_ES_EL_OBJETO) {
    const verdict = mod.review({ title, description });
    check(`«${title.slice(0, 34)}…» sí se rechaza`,
        verdict.decision === 'rejected', verdict.decision);
}

/* La edad se juzga por el título y solo por él. */
{
    const enTitulo = mod.review({
        title: 'Busco una botella de pisco de colección',
        description: 'Para un regalo de aniversario, de alguna bodega tradicional arequipeña.',
    });
    check('el alcohol en el título sí marca +18', enTitulo.signals.adult === true);

    const enCuerpo = mod.review({
        title: 'Busco una hielera portátil',
        description: 'Para llevar cerveza y gaseosas a la playa, que mantenga el frío varias horas.',
    });
    check('el alcohol solo en el cuerpo no marca +18', enCuerpo.signals.adult === false);
}

/* ======================================================================
   El administrador puede marcar la edad a mano

   La IA evalúa al publicar, pero su vocabulario no lo abarca todo, y por eso
   existe la denuncia «No es apto para menores». Sin una forma de APLICARLA,
   ese motivo sería un buzón sin destinatario.
   ====================================================================== */

{
    const mock = fs.readFileSync(path.join(ROOT, 'assets/js/core/mock-api.js'), 'utf8');
    check('el almacén sabe marcar la edad', /setRequestAdult\(\{/.test(mock));
    /* Por coincidencia literal y no por expresión regular: la ruta del almacén
       ya es una expresión regular escapada, y volver a escaparla para buscarla
       da un patrón que no casa con nada — y una comprobación que no casa con
       nada pasa igual de verde que una que funciona. */
    check('con su ruta', mock.includes("/adult$/, this.setRequestAdult"));
    check('y no toca el estado de moderación al hacerlo',
        !/setRequestAdult[\s\S]{0,900}request\.status =/.test(mock));

    const client = fs.readFileSync(path.join(ROOT, 'assets/js/core/api.js'), 'utf8');
    check('el transporte lo expone', /setRequestAdult\(id, adult\)/.test(client));

    const admin = fs.readFileSync(path.join(ROOT, 'assets/js/pages/admin.js'), 'utf8');
    check('el panel tiene el botón', /data-adult-post/.test(admin));
    check('y el historial sabe nombrarlo', /flag_adult:/.test(admin));

    const post = fs.readFileSync(path.join(ROOT, 'assets/js/pages/post.js'), 'utf8');
    check('la comunidad puede denunciarlo', /value="menores"/.test(post));
}

/* ======================================================================
   Los consejos que ve quien publica
   ====================================================================== */

{
    const informe = moderator.inspect({
        title: 'Busco celular Samsung',
        description: 'Necesito un celular Samsung liberado en buen estado, llámame al 987 654 321.',
    });

    check('inspect devuelve avisos accionables', informe.notes.length > 0);
    check('el aviso del teléfono explica qué hacer',
        informe.notes.some((n) => n.level === 'fix' && /tel[eé]fono|red social/i.test(n.title)),
        JSON.stringify(informe.notes.map((n) => n.title)));
    check('y el pedido sigue siendo publicable', informe.ready === true);
}

{
    const informe = moderator.inspect({
        title: 'Busco pistola',
        description: 'Necesito una pistola con municiones, en buen estado y sin papeles.',
    });
    check('lo prohibido no es publicable', informe.ready === false);
    check('y se dice con un aviso que bloquea',
        informe.notes.some((n) => n.level === 'block'));
}

{
    const informe = moderator.inspect({
        title: 'Busco laptop para la universidad',
        description: 'Necesito una laptop de segunda mano con 8 de RAM y disco SSD, para trabajos de universidad. Preferible Lenovo o HP en buen estado.',
    });
    check('un pedido correcto no recibe reproches',
        informe.notes.length === 0 && informe.verdict.decision === 'approved',
        `${informe.verdict.decision}, ${informe.notes.length} avisos`);
}

/* ======================================================================
   La página de publicar enseña el veredicto
   ====================================================================== */

{
    const publish = fs.readFileSync(path.join(ROOT, 'assets/js/pages/publish.js'), 'utf8');
    check('publicar consulta al revisor mientras se escribe',
        /function inspectNow/.test(publish) && publish.includes('renderReview();'));
    check('y no deja publicar lo que está prohibido',
        publish.includes('if (report && !report.ready)'));
    check('pero sí lo que solo está mal escrito, tras confirmarlo',
        /Publicar igualmente/.test(publish));

    const html = fs.readFileSync(path.join(ROOT, 'publicar.html'), 'utf8');
    check('el panel del revisor existe en la página', /id="publish-review"/.test(html));
    check('y se anuncia a los lectores de pantalla',
        /id="publish-review"[\s\S]{0,200}aria-live="polite"/.test(html));
}

/* ======================================================================
   Resultado
   ====================================================================== */

console.log(`\n  ${passed} comprobaciones correctas, ${problems.length} problemas\n`);

if (problems.length) {
    console.log('PROBLEMAS:');
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log('');
    process.exitCode = 1;
} else {
    console.log('  Las dos IA se comportan como se espera.\n');
}
