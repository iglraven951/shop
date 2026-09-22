/**
 * Banco de pruebas del transporte de la capa de datos.
 *
 * `api.js` decide entre hablar con un servidor real y resolverlo todo contra
 * MockAPI en el navegador. Esa decisión no se puede comprobar mirando el
 * código: depende de qué conteste la red, y lo que más importa es justo lo
 * que no se ve — que un 4xx llegue intacto en vez de convertirse en un éxito
 * silencioso de la demo.
 *
 * Aquí se levanta el núcleo fuera del navegador, con un `fetch` de mentira que
 * responde lo que cada escenario necesite, y se comprueba el comportamiento.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ----------------------------------------------------------------------
   Entorno simulado
   ---------------------------------------------------------------------- */

function createStorage() {
    const data = new Map();
    return {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: (k) => data.delete(k),
        clear: () => data.clear(),
        size: () => data.size,
    };
}

/**
 * @param {{config?: object, fetch?: Function}} [options]
 * @returns {object} El sandbox, con `api`, `toastLog` y `storage` accesibles.
 */
function createClient({ config = {}, fetch: fetchImpl } = {}) {
    const toastLog = [];
    const storage = createStorage();

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        localStorage: storage,
        sessionStorage: createStorage(),
        URL,
        URLSearchParams,
        AbortController,
        Intl,
        Math,
        Date,
        JSON,
        DS_CONFIG: config,
        toast: {
            warning: (message, options) => toastLog.push({ message, options }),
        },
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    if (fetchImpl) sandbox.fetch = fetchImpl;

    vm.createContext(sandbox);

    ['assets/js/core/seed.js', 'assets/js/core/mock-api.js', 'assets/js/core/api.js']
        .forEach((rel) => {
            vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
        });

    // Sin latencia simulada: las pruebas no tienen por qué esperar.
    sandbox.api.mock.latency = 0;
    sandbox.toastLog = toastLog;
    sandbox.storage = storage;

    return sandbox;
}

/* --- Respuestas de mentira --- */

const jsonResponse = (status, payload) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
});

const textResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
});

/** Fallo de red: lo que `fetch` lanza cuando no hay a quién llamar. */
function networkFailure() {
    const error = new TypeError('Failed to fetch');
    return error;
}

/** Nunca responde, pero obedece al abort: sirve para probar el tiempo límite. */
function hangingFetch(url, init = {}) {
    return new Promise((resolve, reject) => {
        if (!init.signal) return;
        init.signal.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
        });
    });
}

/**
 * Registra cada llamada y delega en `handler(url, init, n)`.
 * Si el handler lanza, `fetch` rechaza, igual que el de verdad.
 */
function recordingFetch(handler) {
    const calls = [];
    const impl = async (url, init = {}) => {
        calls.push({ url, init, method: (init.method || 'GET').toUpperCase() });
        return handler(url, init, calls.length);
    };
    impl.calls = calls;
    return impl;
}

const BASE = 'https://demo.functions.supabase.co';
const REMOTE = { apiBaseUrl: BASE, anonKey: 'anon-key-publica' };

/* ----------------------------------------------------------------------
   Utilidades de prueba
   ---------------------------------------------------------------------- */

let passed = 0;
const problems = [];

function check(name, condition, detail = '') {
    if (condition) {
        passed += 1;
    } else {
        problems.push(`${name}${detail ? ` → ${detail}` : ''}`);
    }
}

/** Ejecuta algo que debe fallar y devuelve el error, o null si no falló. */
async function failure(fn) {
    try {
        await fn();
        return null;
    } catch (error) {
        return error;
    }
}

/* ----------------------------------------------------------------------
   Escenarios
   ---------------------------------------------------------------------- */

async function run() {
    /* === 1. Sin servidor configurado: nunca se toca la red === */
    {
        const touched = [];
        const sandbox = createClient({
            config: {},
            fetch: async (url) => { touched.push(url); throw networkFailure(); },
        });

        const api = sandbox.api;

        check('sin apiBaseUrl arranca en modo demo', api.mode === 'demo', api.mode);
        check('ready() confirma demo', (await api.ready()) === 'demo');

        const feed = await api.getPosts({ per_page: 3 });
        check('la demo responde el feed', feed.posts.length === 3, `obtuve ${feed.posts.length}`);
        check('no se hizo ninguna petición de red', touched.length === 0, `${touched.length} llamadas`);
        check('sin servidor no se avisa de nada', sandbox.toastLog.length === 0);
    }

    /* === 2. Servidor sano: modo remoto === */
    {
        const fetchImpl = recordingFetch((url) => {
            if (url.endsWith('/api/health')) return jsonResponse(200, { data: { status: 'ok' } });
            return jsonResponse(200, { data: { posts: [{ id: 'p-1' }], pagination: { total: 1 } } });
        });

        const sandbox = createClient({ config: REMOTE, fetch: fetchImpl });
        const api = sandbox.api;

        check('con servidor arranca sin decidir', api.mode === 'unknown', api.mode);
        check('ready() detecta el servidor', (await api.ready()) === 'remote', api.mode);
        check('el sondeo va a /api/health', fetchImpl.calls[0].url === `${BASE}/api/health`, fetchImpl.calls[0].url);

        const data = await api.getPosts({ page: 2, per_page: 5 });
        check('devuelve el contenido de data', data.posts[0].id === 'p-1');
        check('la URL conserva la query',
            fetchImpl.calls[1].url === `${BASE}/api/posts?page=2&per_page=5`,
            fetchImpl.calls[1].url);

        const headers = fetchImpl.calls[1].init.headers;
        check('envía la clave pública en apikey', headers.apikey === 'anon-key-publica');
        check('sin sesión, el Bearer es la clave pública',
            headers.Authorization === 'Bearer anon-key-publica', headers.Authorization);
        check('pide y envía JSON', headers['Content-Type'] === 'application/json');
        check('no arrastra cookies', fetchImpl.calls[1].init.credentials === 'omit');

        // Un cuerpo sin envoltorio no se pierde por el camino
        const plain = createClient({
            config: REMOTE,
            fetch: recordingFetch((url) => (url.endsWith('/api/health')
                ? jsonResponse(200, { data: { status: 'ok' } })
                : jsonResponse(200, { sueltos: true }))),
        });
        await plain.api.ready();
        const raw = await plain.api.getCategories();
        check('una respuesta sin data se devuelve tal cual', raw && raw.sueltos === true);
    }

    /* === 3. El servidor no contesta: se baja a demo y se avisa === */
    {
        const fetchImpl = recordingFetch(() => { throw networkFailure(); });
        const sandbox = createClient({ config: REMOTE, fetch: fetchImpl });
        const api = sandbox.api;

        check('el sondeo fallido deja modo demo', (await api.ready()) === 'demo', api.mode);
        check('se avisó una vez', sandbox.toastLog.length === 1, `${sandbox.toastLog.length} avisos`);
        check('el aviso se titula Modo demostración',
            sandbox.toastLog[0].options.title === 'Modo demostración');
        check('el aviso dice que los datos se quedan en el dispositivo',
            /este dispositivo/.test(sandbox.toastLog[0].message));

        const before = fetchImpl.calls.length;
        const feed = await api.getPosts({ per_page: 2 });
        check('tras caer, la demo responde', feed.posts.length === 2);
        check('ya no se insiste contra el servidor', fetchImpl.calls.length === before,
            `${fetchImpl.calls.length - before} llamadas de más`);
        check('no se repite el aviso', sandbox.toastLog.length === 1);
    }

    /* === 4. Un 4xx es una respuesta, no un fallo: nunca activa el respaldo === */
    {
        const fetchImpl = recordingFetch((url) => {
            if (url.endsWith('/api/health')) return jsonResponse(200, { data: { status: 'ok' } });
            return jsonResponse(400, { message: 'El título debe tener al menos 4 caracteres' });
        });

        const sandbox = createClient({ config: REMOTE, fetch: fetchImpl });
        const api = sandbox.api;
        await api.ready();

        const error = await failure(() => api.createPost({ title: 'ab' }));
        check('el 400 llega como error', !!error);
        check('conserva el mensaje del servidor',
            error && error.message === 'El título debe tener al menos 4 caracteres', error && error.message);
        check('conserva el código', error && error.status === 400, error && String(error.status));
        check('un 4xx no baja a demo', api.mode === 'remote', api.mode);
        check('un 4xx no dispara el aviso', sandbox.toastLog.length === 0);

        // Mensajes por defecto cuando el servidor no manda ninguno
        const bare = createClient({
            config: REMOTE,
            fetch: recordingFetch((url) => (url.endsWith('/api/health')
                ? jsonResponse(200, { data: { status: 'ok' } })
                : jsonResponse(401, {}))),
        });
        await bare.api.ready();
        const authError = await failure(() => bare.api.getMyPosts());
        check('un 401 sin cuerpo trae mensaje en español',
            authError && authError.message === 'Necesitas iniciar sesión para continuar',
            authError && authError.message);
    }

    /* === 5. Un 5xx sí: el servidor se rompió, la demo recoge === */
    {
        const fetchImpl = recordingFetch((url) => {
            if (url.endsWith('/api/health')) return jsonResponse(200, { data: { status: 'ok' } });
            return jsonResponse(503, { message: 'Service Unavailable' });
        });

        const sandbox = createClient({ config: REMOTE, fetch: fetchImpl });
        const api = sandbox.api;
        await api.ready();

        const feed = await api.getPosts({ per_page: 4 });
        check('un 5xx se resuelve contra la demo', feed.posts.length === 4, `obtuve ${feed && feed.posts.length}`);
        check('y deja el sitio en modo demo', api.mode === 'demo', api.mode);
        check('avisando una vez', sandbox.toastLog.length === 1);

        // Un cuerpo que no es JSON (página de error de un proxy) tampoco se pierde
        const proxy = createClient({
            config: { ...REMOTE, fallback: false },
            fetch: recordingFetch((url) => (url.endsWith('/api/health')
                ? jsonResponse(200, { data: { status: 'ok' } })
                : textResponse(502, '<html>Bad Gateway</html>'))),
        });
        await proxy.api.ready();
        const proxyError = await failure(() => proxy.api.getPosts());
        check('un cuerpo no-JSON conserva su texto como mensaje',
            proxyError && /Bad Gateway/.test(proxyError.message), proxyError && proxyError.message);
        check('y su código', proxyError && proxyError.status === 502);
    }

    /* === 6. Tiempo límite === */
    {
        const sandbox = createClient({
            config: { ...REMOTE, fallback: false, timeoutMs: 40 },
            fetch: recordingFetch((url, init) => (url.endsWith('/api/health')
                ? jsonResponse(200, { data: { status: 'ok' } })
                : hangingFetch(url, init))),
        });

        const api = sandbox.api;
        await api.ready();

        const started = Date.now();
        const error = await failure(() => api.getPosts());
        const elapsed = Date.now() - started;

        check('la petición colgada se corta', !!error);
        check('el mensaje habla de tardanza', error && /tard/.test(error.message), error && error.message);
        check('el corte es por transporte, no del servidor', error && error.status === 0);
        check('se corta cerca del límite, no al final', elapsed < 2000, `${elapsed} ms`);
    }

    /* === 7. fallback:false — el sitio exige servidor === */
    {
        const sandbox = createClient({
            config: { ...REMOTE, fallback: false },
            fetch: recordingFetch(() => { throw networkFailure(); }),
        });

        const api = sandbox.api;
        check('sin respaldo, el sondeo fallido no baja a demo', (await api.ready()) === 'remote', api.mode);
        check('sin respaldo no se avisa de modo demostración', sandbox.toastLog.length === 0);

        const error = await failure(() => api.getPosts());
        check('sin respaldo, el error de red se propaga', !!error);
        check('con status 0', error && error.status === 0, error && String(error.status));
        check('y mensaje en español',
            error && /No se pudo contactar/.test(error.message), error && error.message);
    }

    /* === 8. Los dos backends emiten tokens distintos y no se confunden === */
    {
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.remoto';
        const fetchImpl = recordingFetch((url, init, n) => {
            if (url.endsWith('/api/health')) return jsonResponse(200, { data: { status: 'ok' } });
            if (url.endsWith('/api/auth/login')) {
                return jsonResponse(200, { data: { access_token: jwt, user: { id: 'u-1' } } });
            }
            // A partir de la tercera llamada el servidor deja de existir
            if (n >= 3) throw networkFailure();
            return jsonResponse(200, { data: {} });
        });

        const sandbox = createClient({ config: REMOTE, fetch: fetchImpl });
        const api = sandbox.api;
        await api.ready();

        await api.login('juan@discoveryshop.pe', 'demo1234');
        check('la sesión remota guarda el token', api.token === jwt);
        check('y recuerda quién lo emitió', api.tokenMode === 'remote', api.tokenMode);
        check('el token persiste', sandbox.storage.getItem('discoveryshop:token') === jwt);
        check('y su procedencia también',
            sandbox.storage.getItem('discoveryshop:token:mode') === 'remote');

        // La siguiente llamada ya lleva el JWT
        await api.getSavedPosts().catch(() => {});
        const withToken = fetchImpl.calls.find((c) => c.url.endsWith('/api/posts/saved'));
        check('el JWT viaja en Authorization',
            withToken && withToken.init.headers.Authorization === `Bearer ${jwt}`,
            withToken && withToken.init.headers.Authorization);

        // Ahora el servidor cae: el token remoto no vale contra la demo
        const user = await api.getCurrentUser();
        check('tras caer, no hay sesión local', user === null);
        check('pero el token no se borra', sandbox.storage.getItem('discoveryshop:token') === jwt);

        const denied = await failure(() => api.getMyPosts());
        check('la demo trata la sesión remota como invitado',
            denied && denied.status === 401, denied && String(denied.status));

        // Reiniciar la demo no debe tirar una sesión que emitió el servidor
        api.resetData();
        check('reiniciar la demo respeta el token remoto', api.token === jwt);
    }

    /* === 9. Un fallo pasajero no cierra la sesión === */
    {
        const sandbox = createClient({
            config: {},
            fetch: async () => { throw networkFailure(); },
        });

        const api = sandbox.api;
        const session = await api.login('patricia@discoveryshop.pe', 'demo1234');
        check('la demo inicia sesión', !!session.access_token);

        const token = api.token;
        check('el token es de la demo', api.tokenMode === 'demo');

        // Un 500 del backend no es motivo para cerrarle la sesión a nadie
        const original = api.request.bind(api);
        api.request = async (path) => {
            if (path === '/api/auth/me') {
                const error = new Error('Se cayó algo por dentro');
                error.status = 500;
                throw error;
            }
            return original(path);
        };

        const user = await api.getCurrentUser();
        check('un 500 en /me no devuelve usuario', user === null);
        check('pero conserva la sesión', api.token === token);

        api.request = async () => {
            const error = new Error('Necesitas iniciar sesión para continuar');
            error.status = 401;
            throw error;
        };

        await api.getCurrentUser();
        check('un 401 sí cierra la sesión', api.token === null);
        check('y limpia el almacenamiento',
            sandbox.storage.getItem('discoveryshop:token') === null);
    }

    /* === 10. La respuesta automática del chat es solo de la demo === */
    {
        const demo = createClient({ config: {} });
        await demo.api.ready();
        await demo.api.login('patricia@discoveryshop.pe', 'demo1234');

        const feed = await demo.api.getPosts({ per_page: 1 });
        const conversation = await demo.api.openConversation(feed.posts[0].id);
        const reply = demo.api.simulateReply(conversation.conversation.id, 'hola');
        check('en demo el vendedor responde solo', reply && typeof reply.text === 'string');

        const remote = createClient({
            config: REMOTE,
            fetch: recordingFetch(() => jsonResponse(200, { data: { status: 'ok' } })),
        });
        await remote.api.ready();
        check('con servidor detrás no se inventan respuestas',
            remote.api.simulateReply('conv-1', 'hola') === null);
    }

    /* === 11. El archivo de configuración que se publica === */
    {
        const sandbox = { window: null };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(
            fs.readFileSync(path.join(ROOT, 'assets/js/core/config.js'), 'utf8'),
            sandbox,
            { filename: 'assets/js/core/config.js' },
        );

        const config = sandbox.DS_CONFIG;
        check('config.js define DS_CONFIG', !!config);
        check('con apiBaseUrl', config && typeof config.apiBaseUrl === 'string');
        check('con anonKey', config && typeof config.anonKey === 'string');
        check('con fallback booleano', config && typeof config.fallback === 'boolean');
        check('con timeoutMs numérico y razonable',
            config && Number.isFinite(config.timeoutMs) && config.timeoutMs >= 1000,
            config && String(config.timeoutMs));
        check('la service_role nunca aparece en el archivo publicado',
            !/service_role\s*:/.test(fs.readFileSync(path.join(ROOT, 'assets/js/core/config.js'), 'utf8')));
    }

    /* ------------------------------------------------------------------
       Resultado
       ------------------------------------------------------------------ */

    console.log(`\n  ${passed} comprobaciones correctas, ${problems.length} problemas\n`);

    if (problems.length) {
        console.log('PROBLEMAS:');
        problems.forEach((p) => console.log(`  ✗ ${p}`));
        console.log('');
        process.exitCode = 1;
    } else {
        console.log('  El transporte se comporta como se espera.\n');
    }
}

run().catch((error) => {
    console.error('Fallo inesperado en las pruebas de transporte:', error);
    process.exitCode = 1;
});
