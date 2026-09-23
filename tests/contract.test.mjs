/**
 * Verificación de contrato entre capas.
 *
 * Las suites anteriores comprueban que el JavaScript compila y que los datos
 * se comportan, pero no que los métodos que invocan las páginas existan. Un
 * `api.getProducts(...)` sobreviviente de un modelo anterior compila sin
 * problema y solo estalla cuando alguien abre esa página.
 *
 * Aquí se carga el núcleo real en un DOM simulado y se comprueba, llamada por
 * llamada, que todo lo que usan los scripts de página está definido.
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

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ----------------------------------------------------------------------
   DOM mínimo: lo justo para que el núcleo se registre sin navegador
   ---------------------------------------------------------------------- */

function createStorage() {
    const data = new Map();
    return {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: (k) => data.delete(k),
        clear: () => data.clear(),
    };
}

function createElement() {
    const node = {
        style: {},
        dataset: {},
        classList: {
            add() {}, remove() {}, toggle() {}, contains: () => false,
        },
        children: [],
        innerHTML: '',
        textContent: '',
        hidden: false,
        appendChild(child) { this.children.push(child); return child; },
        append() {}, remove() {}, replaceChildren() {},
        setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
        addEventListener() {}, removeEventListener() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        closest: () => null,
        contains: () => false,
        focus() {}, blur() {}, click() {},
        insertAdjacentHTML() {},
        matches: () => false,
    };
    return node;
}

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    URL, URLSearchParams, Intl, Math, Date, JSON, Promise,
    location: {
        hostname: 'localhost', port: '8080', protocol: 'http:',
        origin: 'http://localhost:8080', pathname: '/index.html', search: '', hash: '',
        href: 'http://localhost:8080/index.html',
    },
    history: { replaceState() {}, pushState() {} },
    navigator: { onLine: true },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    document: {
        readyState: 'complete',
        documentElement: createElement(),
        body: createElement(),
        activeElement: null,
        createElement,
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        addEventListener() {}, removeEventListener() {},
    },
    addEventListener() {}, removeEventListener() {},
    fetch: () => Promise.reject(new Error('sin red en las pruebas')),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document.defaultView = sandbox;

vm.createContext(sandbox);

/* ----------------------------------------------------------------------
   Cargar el núcleo tal cual lo carga el navegador
   ---------------------------------------------------------------------- */

const CORE = [
    'assets/js/core/seed.js',
    'assets/js/core/mock-api.js',
    'assets/js/core/store.js',
    'assets/js/core/api.js',
    'assets/js/ui/toast.js',
    'assets/js/ui/modal.js',
    'assets/js/ui/components.js',
];

console.log('\nVERIFICACIÓN DE CONTRATO\n' + '='.repeat(58));

for (const file of CORE) {
    try {
        vm.runInContext(read(file), sandbox, { filename: file });
        check(`${path.basename(file)} se carga sin errores`, true);
    } catch (error) {
        check(`${path.basename(file)} se carga sin errores`, false, error.message);
    }
}

// shell.js se auto-arranca al cargar, así que se evalúa aparte y se tolera
// que su init falle: aquí solo interesa el objeto que exporta.
try {
    vm.runInContext(read('assets/js/ui/shell.js'), sandbox, { filename: 'shell.js' });
    check('shell.js se carga sin errores', true);
} catch (error) {
    check('shell.js se carga sin errores', false, error.message);
}

/* ----------------------------------------------------------------------
   Los globales que esperan las páginas
   ---------------------------------------------------------------------- */

const GLOBALS = ['DiscoverySeed', 'MockAPI', 'DS', 'store', 'api', 'toast', 'modal', 'UI', 'DiscoveryShell'];
GLOBALS.forEach((name) => {
    check(`window.${name} existe`, sandbox[name] !== undefined);
});

/* ----------------------------------------------------------------------
   Cada método invocado desde las páginas debe existir
   ---------------------------------------------------------------------- */

/** Resuelve una ruta tipo `DS.format.money` sobre el sandbox. */
function resolve(chain) {
    return chain.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), sandbox);
}

const NAMESPACES = {
    api: sandbox.api,
    UI: sandbox.UI,
    DS: sandbox.DS,
    store: sandbox.store,
    modal: sandbox.modal,
    toast: sandbox.toast,
    DiscoverySeed: sandbox.DiscoverySeed,
    DiscoveryShell: sandbox.DiscoveryShell,
};

const pageScripts = fs.readdirSync(path.join(ROOT, 'assets/js/pages'))
    .filter((f) => f.endsWith('.js'));

check('hay scripts de página', pageScripts.length >= 9, `encontrados ${pageScripts.length}`);

pageScripts.forEach((file) => {
    const code = read(`assets/js/pages/${file}`);

    // Comentarios y cadenas fuera: solo interesan las llamadas reales.
    const source = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    const missing = new Set();

    Object.keys(NAMESPACES).forEach((ns) => {
        if (!NAMESPACES[ns]) return;

        // api.getPosts(  ·  DS.format.money(  ·  store.subscribe(
        const pattern = new RegExp(`\\b${ns}\\.((?:\\w+\\.)*\\w+)\\s*\\(`, 'g');

        for (const match of source.matchAll(pattern)) {
            const chain = `${ns}.${match[1]}`;
            const value = resolve(chain);
            if (typeof value !== 'function') {
                missing.add(chain);
            }
        }
    });

    check(`${file}: todos los métodos que invoca existen`, missing.size === 0,
        missing.size ? [...missing].join(', ') : '');
});

/* ----------------------------------------------------------------------
   El núcleo y la UI también se llaman entre sí
   ---------------------------------------------------------------------- */

['assets/js/ui/shell.js', 'assets/js/ui/components.js'].forEach((rel) => {
    const source = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    const missing = new Set();

    ['api', 'store', 'modal', 'toast'].forEach((ns) => {
        // En estos archivos los globales se acceden como global.api.foo(...)
        const pattern = new RegExp(`\\bglobal\\.${ns}\\.((?:\\w+\\.)*\\w+)\\s*\\(`, 'g');

        for (const match of source.matchAll(pattern)) {
            const chain = `${ns}.${match[1]}`;
            if (typeof resolve(chain) !== 'function') missing.add(chain);
        }
    });

    check(`${path.basename(rel)}: todos los métodos que invoca existen`, missing.size === 0,
        missing.size ? [...missing].join(', ') : '');
});

/* ----------------------------------------------------------------------
   Las rutas que declara el cliente deben existir en el servidor simulado
   ---------------------------------------------------------------------- */

const apiSource = read('assets/js/core/api.js');

/* Se captura la plantilla entera, no el trozo hasta el primer `${`: si no,
   `/api/offers/${id}/accept` se quedaba en `/api/offers/`, que no es ninguna
   ruta real y fallaba por un motivo que no era el que importa. Cada hueco se
   sustituye por un identificador de ejemplo. */
const routes = [...apiSource.matchAll(/this\.request\(\s*[`'"]([^`'"]*)[`'"]/g)]
    .map((m) => m[1])
    /* Un hueco detrás de una barra es un identificador dentro de la ruta y se
       sustituye por uno de ejemplo. Uno pegado al segmento anterior es la
       query (`/api/requests${this.toQuery(…)}`), que el enrutador no mira: se
       corta ahí. */
    .map((r) => r.replace(/\/\$\{[^${}]*\}/g, '/ejemplo-1'))
    .map((r) => r.split('${')[0].replace(/\/$/, ''))
    .filter((r) => r.startsWith('/api/'));

const mock = new sandbox.MockAPI();

routes.forEach((route) => {
    // La query no forma parte de la ruta que resuelve el enrutador
    const probe = route.split('?')[0].replace(/\/$/, '') || '/api';

    const resolved = mock.resolve('GET', probe)
        || mock.resolve('POST', probe)
        || mock.resolve('PUT', probe)
        || mock.resolve('DELETE', probe);

    check(`ruta ${probe} atendida por MockAPI`, !!resolved);
});

/* ----------------------------------------------------------------------
   Resultado
   ---------------------------------------------------------------------- */

console.log(`\n  ${passed} comprobaciones correctas, ${problems.length} problemas\n`);

if (problems.length) {
    console.log('PROBLEMAS:');
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log('');
    process.exitCode = 1;
} else {
    console.log('  Contrato entre capas verificado.\n');
}
