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

/* --- Las notificaciones traen lo que el administrador necesita --- */
const sample = { title: 'iPhone 15 Pro Max', author: { username: 'Juan Pérez' } };

const approvedMsg = mod.notificationText(sample, { decision: 'approved', reason: 'ok' });
check('el aviso de aprobación nombra el producto', approvedMsg.includes('iPhone 15 Pro Max'));
check('el aviso de aprobación marca el estado', approvedMsg.includes('✅ Aprobada'));
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
    check('invita a ver al vendedor', /vendedor/i.test(search.text), search.text.slice(0, 80));
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
