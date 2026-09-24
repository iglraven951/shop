/**
 * Verificación de integridad del sitio estático.
 *
 * Comprueba lo que un test de unidad no ve: que los enlaces apunten a archivos
 * que existen, que cada página cargue el núcleo en el orden correcto, que no
 * queden URLs al backend local incrustadas y que no haya restos de depuración.
 */
import fs from 'node:fs';
import path from 'node:path';
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
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/* --- Páginas que deben existir --- */
const PAGES = [
    'index.html', 'publicacion.html', 'mapa.html', 'admin.html', 'login.html',
    'registro.html', 'perfil.html', 'publicar.html', 'guardados.html',
    'mensajes.html', '404.html',
];

/* --- Páginas retiradas al pasar de tienda a foro --- */
const REMOVED_PAGES = ['carrito.html', 'producto.html', 'vender.html', 'favoritos.html'];

/* Orden obligatorio del núcleo: cada script depende de los anteriores.
   Los dos motores propios van aquí y no aparte porque el resto del núcleo
   cuenta con ellos: mock-api llama al revisor al crear una publicación, y el
   chat flotante al buscador. Ambos se leen de forma perezosa, así que su
   ausencia no rompe nada de golpe —simplemente la función desaparece sin
   avisar, que es peor. Esta lista es la que impide que vuelva a ocurrir.

   native.js abre la lista porque es el único que tiene que correr antes de que
   se pinte nada: marca <html> con `ds-native` y publica ahí las medidas de las
   barras del sistema, y lo que se dibujase antes quedaría colocado con los
   márgenes equivocados. En el navegador no hace nada observable, así que
   olvidarlo tampoco daría un error visible —solo una aplicación con la
   cabecera bajo la barra de estado—, que es exactamente el fallo silencioso
   que esta lista existe para atrapar. */
const CORE_ORDER = [
    // La configuración va primero: api.js la lee al construirse, y si no
    // estuviera cargada el sitio arrancaría siempre en modo demo.
    'assets/js/core/config.js',
    'assets/js/core/native.js',
    'assets/js/core/seed.js',
    'assets/js/core/moderator.js',
    'assets/js/core/mock-api.js',
    'assets/js/core/store.js',
    'assets/js/core/api.js',
    'assets/js/core/assistant.js',
    'assets/js/ui/toast.js',
    'assets/js/ui/modal.js',
    'assets/js/ui/components.js',
    'assets/js/ui/shell.js',
    'assets/js/ui/assistant-widget.js',
];

const CORE_CSS = [
    'assets/css/tokens.css',
    'assets/css/base.css',
    'assets/css/components.css',
    'assets/css/layout.css',
    // El chat flotante está en las once páginas; sin su hoja se vería como
    // una lista suelta de texto encima del contenido.
    'assets/css/assistant.css',
    // Los ajustes de la aplicación Android. En el navegador no cambia ni un
    // píxel, y por eso se olvida con facilidad; sin ella, dentro de la
    // aplicación la cabecera y el asistente flotante se meten debajo de las
    // barras del sistema.
    'assets/css/native.css',
];

console.log('\nVERIFICACIÓN DE INTEGRIDAD\n' + '='.repeat(58));

/* === 1. Existencia de archivos === */
PAGES.forEach((page) => check(`existe ${page}`, exists(page)));
CORE_ORDER.forEach((file) => check(`existe ${file}`, exists(file)));
CORE_CSS.forEach((file) => check(`existe ${file}`, exists(file)));

// Las páginas del modelo anterior no deben reaparecer
REMOVED_PAGES.forEach((page) => check(`${page} sigue eliminada`, !exists(page)));

const presentPages = PAGES.filter(exists);

/* === 2. Estructura de cada página === */
presentPages.forEach((page) => {
    const html = read(page);

    check(`${page}: lang="es"`, /<html[^>]+lang="es"/.test(html));
    check(`${page}: charset UTF-8`, /<meta\s+charset="UTF-8">/i.test(html));
    check(`${page}: viewport`, /name="viewport"/.test(html));
    check(`${page}: tiene <title>`, /<title>[^<]+<\/title>/.test(html));
    check(`${page}: meta description`, /name="description"/.test(html));
    // El favicon es un SVG en línea dentro de un data URI, así que su href
    // contiene ">" y es fácil partirlo con una sustitución descuidada.
    // Se toma la línea entera: buscar hasta el primer ">" cortaría dentro de
    // un favicon escrito como data URI, cuyo href contiene marcado.
    const faviconLine = html.split('\n').find((line) => line.includes('<link rel="icon"'));
    check(`${page}: tiene favicon`, !!faviconLine);

    if (faviconLine) {
        const href = faviconLine.match(/href="([^"]*)"/);
        check(`${page}: el favicon declara href`, !!href, faviconLine.trim().slice(0, 70));

        if (href) {
            const value = href[1];

            if (value.startsWith('data:')) {
                // Un data URI debe estar completo: el SVG entero en una línea
                check(`${page}: data URI del favicon íntegro`,
                    /^data:image\/svg\+xml,<svg[\s\S]*<\/svg>$/.test(value),
                    value.slice(0, 70));
            } else {
                check(`${page}: el archivo del favicon existe`, exists(value), value);
            }
        }
    }

    // Ninguna etiqueta del head debe haber quedado anidada dentro de otra.
    const head = html.slice(0, html.indexOf('</head>'));
    check(`${page}: sin <link> anidado en un atributo`,
        !/<link[^>]*href="[^"]*<link/.test(head));

    check(`${page}: manifest enlazado una sola vez`,
        (html.match(/rel="manifest"/g) || []).length === 1);

    check(`${page}: contenedor de cabecera`, html.includes('id="app-header"'));
    check(`${page}: contenedor de pie`, html.includes('id="app-footer"'));
    check(`${page}: enlace de salto`, html.includes('class="skip-link"'));
    check(`${page}: main con id`, /<main[^>]+id="main"/.test(html));

    // CSS del núcleo completo
    CORE_CSS.forEach((css) => {
        check(`${page}: enlaza ${path.basename(css)}`, html.includes(css));
    });

    // Scripts del núcleo, en orden
    const positions = CORE_ORDER.map((src) => html.indexOf(src));
    const allPresent = positions.every((pos) => pos !== -1);
    check(`${page}: incluye los ${CORE_ORDER.length} scripts del núcleo`, allPresent,
        allPresent ? '' : `faltan: ${CORE_ORDER.filter((_, i) => positions[i] === -1).map((s) => path.basename(s)).join(', ')}`);

    if (allPresent) {
        const ordered = positions.every((pos, i) => i === 0 || positions[i - 1] < pos);
        check(`${page}: orden correcto del núcleo`, ordered);
    }

    // El script de página va después del shell
    const shellPos = html.indexOf('assets/js/ui/shell.js');
    const pageScript = html.match(/assets\/js\/pages\/([\w-]+)\.js/);
    if (pageScript) {
        check(`${page}: script de página tras el shell`, html.indexOf(pageScript[0]) > shellPos);
        check(`${page}: existe ${pageScript[0]}`, exists(pageScript[0]));
    }

    // CSS de página existe si se referencia
    const pageCss = html.match(/assets\/css\/pages\/([\w-]+)\.css/);
    if (pageCss) {
        check(`${page}: existe ${pageCss[0]}`, exists(pageCss[0]));
    }

    // Nada debe apuntar al backend local ni al frontend antiguo
    check(`${page}: sin URL a localhost:5000`, !html.includes('localhost:5000'));
    check(`${page}: sin referencias a frontend/`, !/(?:src|href)="frontend\//.test(html));

    // Ni a las páginas que retiramos al pasar de tienda a foro
    REMOVED_PAGES.forEach((removed) => {
        check(`${page}: no enlaza ${removed}`, !html.includes(removed));
    });

    // Módulos ES romperían el orden de carga por <script> clásico
    check(`${page}: sin type="module"`, !html.includes('type="module"'));
});

/* === 3. Enlaces internos === */
const KNOWN_ANCHORS = new Set(['#main', '#catalogo', '#datos', '#publicaciones', '#pedidos', '#favoritos', '#resenas', '#']);

presentPages.forEach((page) => {
    const html = read(page);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

    hrefs.forEach((href) => {
        // Solo interesan los enlaces internos a páginas
        if (/^(https?:|mailto:|data:|tel:)/.test(href)) return;
        if (href.startsWith('#')) return;

        const file = href.split(/[?#]/)[0];
        if (!file || !file.endsWith('.html')) return;

        check(`${page}: enlace "${file}" resuelve`, exists(file));
    });
});

/* === 4. Scripts de página === */
const pageScripts = fs.existsSync(path.join(ROOT, 'assets/js/pages'))
    ? fs.readdirSync(path.join(ROOT, 'assets/js/pages')).filter((f) => f.endsWith('.js'))
    : [];

check('hay scripts de página', pageScripts.length >= 9, `encontrados ${pageScripts.length}`);

// Métodos de la API que desaparecieron con el carrito y las reseñas
const DEAD_API = [
    'getCart', 'addToCart', 'updateCartItem', 'removeCartItem', 'clearCart',
    'getOrders', 'createOrder', 'getFavorites', 'toggleFavorite',
    'getProducts', 'getProduct', 'createProduct', 'createReview', 'getReviews',
];

pageScripts.forEach((file) => {
    const rel = `assets/js/pages/${file}`;
    const code = read(rel);

    check(`${file}: es un IIFE`, /\(function\s*\(/.test(code));
    check(`${file}: usa 'use strict'`, code.includes("'use strict'"));
    check(`${file}: sin import/export ES`, !/^\s*(import|export)\s/m.test(code));
    check(`${file}: sin console.log`, !/console\.log\(/.test(code));
    check(`${file}: sin alert()`, !/(?<![.\w])alert\(/.test(code));
    check(`${file}: sin localhost:5000`, !code.includes('localhost:5000'));

    // Llamar a un método retirado fallaría en silencio en tiempo de ejecución
    const dead = DEAD_API.filter((method) => code.includes(`api.${method}(`));
    check(`${file}: sin métodos de API retirados`, dead.length === 0,
        dead.length ? `usa: ${dead.join(', ')}` : '');

    // Riesgo real de XSS: interpolar datos en una plantilla que va a innerHTML.
    // Pasar salida ya escapada de UI.* o una cadena vacía es seguro.
    const interpolatesIntoHtml = /(?:innerHTML|insertAdjacentHTML\([^,]+,)\s*=?\s*`[^`]*\$\{/s.test(code)
        || /html\s*=\s*`[^`]*\$\{/s.test(code);

    if (interpolatesIntoHtml) {
        check(`${file}: escapa los datos que interpola en HTML`, /escapeHtml|escapeAttr/.test(code));
    }
});

/* === 3c. El muro de fotos de la portada ===

   Las tres piezas —marcado, hoja y script— solo sirven juntas. Si alguien
   quita una, queda un hueco o una columna de fotos sin animar, y ninguna de
   las dos cosas da un error visible.

   Y el muro tiene que estar DENTRO de la portada: es su fondo. Fuera de ella
   vuelve a ser una banda aparte, que es de donde viene. */
{
    const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const piezas = [
        ['hilera 1', 'id="showcase-track"'],
        ['hilera 2', 'id="showcase-track-2"'],
        ['hoja', 'assets/css/showcase.css'],
        ['script', 'assets/js/ui/showcase.js'],
    ];
    const faltan = piezas.filter(([, aguja]) => !home.includes(aguja));
    check('index.html: el muro lleva sus dos hileras, hoja y script',
        faltan.length === 0,
        faltan.length ? `falta: ${faltan.map(([n]) => n).join(', ')}` : '');

    check('existe assets/css/showcase.css', exists('assets/css/showcase.css'));
    check('existe assets/js/ui/showcase.js', exists('assets/js/ui/showcase.js'));

    // Dentro de la portada, no antes ni después
    const abre = home.indexOf('<section class="feed-hero"');
    const cierra = home.indexOf('</section>', abre);
    const muro = home.indexOf('id="showcase"');
    check('index.html: el muro está dentro de la portada',
        abre !== -1 && muro > abre && muro < cierra);

    // Y por debajo del texto: si el marcado fuera después de .feed-hero-inner,
    // quedaría encima y taparía el titular en cuanto alguien tocase el z-index.
    check('index.html: el muro va antes del texto de la portada',
        muro < home.indexOf('feed-hero-inner'));

    // Decoración pura: ni títulos, ni precios, ni enlaces
    const js = read('assets/js/ui/showcase.js');
    check('showcase.js: el muro no pinta títulos ni precios',
        !js.includes('showcase-title') && !js.includes('showcase-price'));
    check('showcase.js: las fotos del muro no son enlaces', !/<a\s/.test(js));

    // El script se apoya en el shell para el tema y en api para los datos
    const posShell = home.indexOf('assets/js/ui/shell.js');
    const posMuro = home.indexOf('assets/js/ui/showcase.js');
    check('index.html: el muro carga tras el shell', posMuro > posShell && posShell !== -1);
}

/* === 3d. La entrada con movimiento reducido ===

   intro.css representa la secuencia dos veces: con desplazamientos y, bajo
   `prefers-reduced-motion`, con fundidos. La segunda tiene que verse igual
   que la primera —mismos actos, mismos retrasos, misma duración—, porque en
   un móvil Chrome enciende esa preferencia solo en cuanto entra el ahorro de
   batería, y la entrada desaparecía para gente que nunca la pidió.

   El invariante que se mide aquí: ninguna pieza puede quedarse con una
   animación que la desplace, la gire o la escale. Cada fotograma que mueve
   algo obliga a que su selector esté reescrito —o retirado— en el bloque de
   movimiento reducido. Añadir un acto nuevo con un translate y olvidarse de
   su equivalente salta aquí, y no en el teléfono de alguien. */
{
    // Fuera los comentarios primero: si no, el que precede a una regla se lee
    // como parte de su selector.
    const css = read('assets/css/intro.css').replace(/\/\*[\s\S]*?\*\//g, '');

    const inicio = css.indexOf('@media (prefers-reduced-motion: reduce)');
    check('intro.css: contempla el movimiento reducido', inicio !== -1);

    if (inicio !== -1) {
        // Buscar el cierre del bloque contando llaves
        let nivel = 0;
        let fin = css.length;
        for (let n = css.indexOf('{', inicio); n < css.length; n += 1) {
            if (css[n] === '{') nivel += 1;
            else if (css[n] === '}') {
                nivel -= 1;
                if (nivel === 0) { fin = n + 1; break; }
            }
        }

        const secuencia = css.slice(0, inicio);
        const suave = css.slice(inicio, fin);

        /* Qué fotogramas mueven algo de sitio.

           El cuerpo se delimita contando llaves, no con una expresión no
           codiciosa: un @keyframes escrito en una sola línea no termina en
           "\n}", así que la búsqueda seguiría hasta el cierre del siguiente
           y le atribuiría sus transformaciones. */
        const mueven = new Set();
        [...secuencia.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].forEach((m) => {
            let nivel = 0;
            let corte = m.index;
            for (let n = m.index + m[0].length - 1; n < secuencia.length; n += 1) {
                if (secuencia[n] === '{') nivel += 1;
                else if (secuencia[n] === '}') {
                    nivel -= 1;
                    if (nivel === 0) { corte = n; break; }
                }
            }
            const cuerpo = secuencia.slice(m.index + m[0].length, corte);
            if (/transform:\s*[^;]*(translate|scale|rotate)/.test(cuerpo)) mueven.add(m[1]);
        });

        check('intro.css: la secuencia tiene fotogramas con movimiento', mueven.size >= 6,
            `encontrados ${mueven.size}`);

        // Y qué selectores los usan
        [...secuencia.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
            .map(([, sel, cuerpo]) => ({ sel: sel.trim().replace(/\s+/g, ' '), cuerpo }))
            .filter(({ sel }) => sel.startsWith('.intro'))
            .forEach(({ sel, cuerpo }) => {
                const usa = [...cuerpo.matchAll(/animation:\s*([\w-]+)/g)].map((m) => m[1])
                    .filter((nombre) => mueven.has(nombre));
                if (!usa.length) return;

                // Reescrito o retirado: las dos cosas valen
                const atendido = sel.split(',').every((uno) => suave.includes(uno.trim()));
                check(`intro.css: ${sel} no se desplaza sin movimiento`, atendido,
                    atendido ? '' : `usa ${usa.join(', ')}`);
            });

        // La capa entera no puede desaparecer: ese fue el primer fallo.
        check('intro.css: la entrada no se oculta del todo',
            !/\.intro\s*\{[^}]*display:\s*none/.test(suave));

        // Ni quedarse quieta sin secuencia: ese fue el segundo. La salida debe
        // arrancar cuando arranca la normal, para que dure lo mismo que en PC.
        const salidaNormal = secuencia.match(/animation:\s*intro-exit\s[^;]*?(\d+)ms\s+forwards/);
        const salidaSuave = suave.match(/animation:\s*intro-exit-fade\s[^;]*?(\d+)ms\s+forwards/);
        check('intro.css: la versión con fundidos tiene su propia salida', !!salidaSuave);
        if (salidaNormal && salidaSuave) {
            check('intro.css: las dos versiones duran lo mismo',
                salidaNormal[1] === salidaSuave[1],
                `normal ${salidaNormal[1]}ms, fundida ${salidaSuave[1]}ms`);
        }
    }

    // El script no debe decidir nada sobre esto: lo resuelve el CSS entero.
    const js = read('assets/js/ui/intro.js');
    check('intro.js: el movimiento reducido ya no la descarta',
        !js.includes('prefersReducedMotion'));
    check('intro.js: ?intro permite volver a verla', js.includes('replayRequested'));
}


/* === 4b. Los IDs que busca cada script existen en su página === */
// Detecta el desajuste clásico al repartir HTML y JS en archivos distintos.
// Un script puede servir a varias páginas (auth.js cubre login y registro),
// así que se acumulan todas las que lo cargan.
const PAGES_BY_SCRIPT = {};
presentPages.forEach((page) => {
    const match = read(page).match(/assets\/js\/pages\/([\w-]+)\.js/);
    if (!match) return;
    const key = `${match[1]}.js`;
    (PAGES_BY_SCRIPT[key] = PAGES_BY_SCRIPT[key] || []).push(page);
});

Object.entries(PAGES_BY_SCRIPT).forEach(([script, pages]) => {
    const rel = `assets/js/pages/${script}`;
    if (!exists(rel)) return;

    const code = read(rel);
    const html = pages.map(read).join('\n');
    const page = pages.join(' / ');

    const referenced = new Set([
        ...[...code.matchAll(/getElementById\(\s*['"]([\w-]+)['"]/g)].map((m) => m[1]),
        ...[...code.matchAll(/\$\(\s*['"]#([\w-]+)['"]/g)].map((m) => m[1]),
        ...[...code.matchAll(/querySelector\(\s*['"]#([\w-]+)['"]/g)].map((m) => m[1]),
    ]);

    // Un id puede venir del HTML, del shell compartido, o crearlo el propio script.
    const inHtml = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
    const createdByScript = new Set([...code.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
    const fromShell = new Set([
        'site-header', 'app-header', 'app-footer', 'global-search', 'search-suggestions',
        'theme-toggle', 'cart-count', 'fav-count', 'msg-count', 'user-menu',
        'user-menu-trigger', 'user-menu-panel', 'logout-btn', 'mode-pill', 'mode-label',
        'menu-toggle', 'filters-scrim', 'main',
    ]);

    const missing = [...referenced].filter(
        (id) => !inHtml.has(id) && !createdByScript.has(id) && !fromShell.has(id)
    );

    check(`${script}: todos los IDs que consulta existen en ${page}`, missing.length === 0,
        missing.length ? `sin definir: ${missing.join(', ')}` : '');
});

/* === 5. CSS de página === */
const pageCssFiles = fs.existsSync(path.join(ROOT, 'assets/css/pages'))
    ? fs.readdirSync(path.join(ROOT, 'assets/css/pages')).filter((f) => f.endsWith('.css'))
    : [];

pageCssFiles.forEach((file) => {
    const css = read(`assets/css/pages/${file}`);

    // Los colores deben venir de los tokens, no escritos a mano
    const rawHex = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
        .map((m) => m[0])
        // Los data URI de SVG en línea sí llevan color literal
        .filter((_, i, all) => all.length > 0);

    const hexOutsideDataUri = css
        .replace(/url\(["']?data:[^)]*\)/g, '')
        .match(/#[0-9a-fA-F]{3,8}\b/g) || [];

    check(`${file}: colores desde tokens`, hexOutsideDataUri.length === 0,
        hexOutsideDataUri.length ? `hex literales: ${[...new Set(hexOutsideDataUri)].slice(0, 5).join(', ')}` : '');

    check(`${file}: usa variables de diseño`, css.includes('var(--'));
});

/* === 6. Ortografía española frecuente === */
// Errores típicos al omitir tildes y la eñe en la interfaz
const SPELLING_TRAPS = [
    [/\bContrasena\b/i, 'Contraseña'],
    [/\bInformacion\b/i, 'Información'],
    [/\bConfiguracion\b/i, 'Configuración'],
    [/\bDescripcion\b/i, 'Descripción'],
    [/\bCategoria\b/i, 'Categoría'],
    [/\bUbicacion\b/i, 'Ubicación'],
    [/\bTelefono\b/i, 'Teléfono'],
    [/\bSesion\b/i, 'Sesión'],
    [/\bEnvio\b/i, 'Envío'],
    [/\bPagina\b/i, 'Página'],
    [/\bCalificacion\b/i, 'Calificación'],
    [/\bAnadir\b/i, 'Añadir'],
    [/\bNumero\b/i, 'Número'],
    [/\bDireccion\b/i, 'Dirección'],
    [/\bPublicacion\b/i, 'Publicación'],
];

const textFiles = [
    ...presentPages,
    ...pageScripts.map((f) => `assets/js/pages/${f}`),
];

textFiles.forEach((rel) => {
    // Los nombres de archivo y los anclas van sin tilde a propósito
    // (publicacion.html, #publicaciones), así que no cuentan como falta.
    const content = read(rel)
        .replace(/[\w-]+\.(?:html|css|js|png|svg|webmanifest)/g, '')
        .replace(/#[\w-]+/g, '')
        .replace(/['"`][\w-]+['"`]\s*:/g, '');

    SPELLING_TRAPS.forEach(([pattern, correct]) => {
        const match = content.match(pattern);
        check(`${path.basename(rel)}: «${correct}» bien escrito`, !match,
            match ? `encontrado «${match[0]}»` : '');
    });
});

/* === 6b. Las pestañas del panel existen en su HTML ===

   El equivalente de ADR-021 para el DOM. `admin.js` declara sus pestañas en un
   array y luego busca `#tab-X` y `#panel-X` por ese nombre; cuando el
   vocabulario pasó de «publicaciones» a «pedidos» el JS se renombró y el HTML
   no, y `activateTab` murió en la primera vuelta del bucle. El panel entero
   quedó inservible —cuatro secciones inalcanzables y la cola cargando para
   siempre— con las ocho suites en verde. Esto lo convierte en un fallo de
   build. */
if (exists('admin.html') && exists('assets/js/pages/admin.js')) {
    const adminHtml = read('admin.html');
    const adminJs = read('assets/js/pages/admin.js');
    const declared = adminJs.match(/const TABS\s*=\s*\[([^\]]+)\]/);

    if (!declared) {
        problems.push('admin.js: no encuentro la lista TABS');
    } else {
        const tabs = declared[1].match(/'([^']+)'/g).map((t) => t.replace(/'/g, ''));
        check('admin: hay pestañas declaradas', tabs.length > 0);

        tabs.forEach((tab) => {
            check(`admin: existe #tab-${tab}`, adminHtml.includes(`id="tab-${tab}"`));
            check(`admin: existe #panel-${tab}`, adminHtml.includes(`id="panel-${tab}"`));
            check(`admin: la pestaña ${tab} apunta a su panel`,
                adminHtml.includes(`aria-controls="panel-${tab}"`));
        });

        // Y al revés: ningún panel huérfano que el JS no sepa abrir
        const inHtml = [...adminHtml.matchAll(/id="panel-([\w-]+)"/g)].map((m) => m[1]);
        inHtml.forEach((panel) => {
            check(`admin: el panel ${panel} está declarado en TABS`, tabs.includes(panel));
        });

        // Los atajos de las tarjetas de métrica llevan a una pestaña real
        [...adminHtml.matchAll(/data-goto-tab="([\w-]+)"/g)].forEach((m) => {
            check(`admin: el atajo a ${m[1]} lleva a una pestaña real`, tabs.includes(m[1]));
        });

        // Y los contadores de pestaña cuelgan de una que existe
        [...adminHtml.matchAll(/data-tab-count="([\w-]+)"/g)].forEach((m) => {
            check(`admin: el contador de ${m[1]} cuelga de una pestaña real`, tabs.includes(m[1]));
        });
    }
}

/* === 6c. El historial del panel sabe nombrar lo que el servidor registra ===
   `LOG_META` traducía `approve_post`, que el servidor dejó de escribir hace una
   migración: toda decisión sobre un pedido salía como «Acción de moderación». */
if (exists('assets/js/pages/admin.js') && exists('assets/js/core/mock-api.js')) {
    const adminJs = read('assets/js/pages/admin.js');
    const server = read('assets/js/core/mock-api.js');
    const logged = new Set(
        [...server.matchAll(/logModeration\(\s*\w+\s*,\s*'([\w]+)'/g)].map((m) => m[1])
    );
    [...server.matchAll(/action:\s*verdict\.decision[^;]*?'(\w+_request)'/gs)]
        .forEach((m) => logged.add(m[1]));

    check('el servidor registra acciones de moderación', logged.size > 0);
    logged.forEach((action) => {
        check(`el historial sabe nombrar «${action}»`,
            new RegExp(`\\b${action}\\s*:`).test(adminJs));
    });
}

/* === 6d. El sistema de profundidad ===

   La inclinación de las tarjetas es de escritorio a propósito: en un táctil no
   hay puntero al que seguir y el giro continuo gasta batería. Estas
   comprobaciones existen para que nadie lo saque de su consulta de medios sin
   darse cuenta, y para que el módulo no se quede colgado de una página que ya
   no lo carga. */
if (exists('assets/js/ui/depth.js')) {
    const depth = read('assets/js/ui/depth.js');

    check('la profundidad solo se activa con ratón',
        /\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/.test(depth));
    check('y respeta a quien pidió menos movimiento',
        /prefers-reduced-motion/.test(depth));
    check('la inclinación se pinta en un solo fotograma',
        /requestAnimationFrame/.test(depth));
    check('y se suelta al desplazarse',
        /addEventListener\('scroll'/.test(depth));

    /* Donde se pintan tarjetas, el módulo tiene que estar cargado. No basta
       con mirar quién carga `components.js` —lo hacen las once páginas—: hay
       que mirar quién dibuja realmente una `.post-card`. */
    const CARD_PAGES = ['index.html', 'guardados.html', 'perfil.html',
        'publicacion.html', 'publicar.html'];

    CARD_PAGES.filter(exists).forEach((page) => {
        check(`${page}: carga la profundidad`, read(page).includes('assets/js/ui/depth.js'));
    });

    // Y donde no hay tarjetas, no se carga: son bytes que nadie usa
    presentPages
        .filter((p) => !CARD_PAGES.includes(p))
        .forEach((page) => {
            check(`${page}: no carga la profundidad`, !read(page).includes('assets/js/ui/depth.js'));
        });

    // Los tokens que usan el CSS y el módulo
    const tokens = read('assets/css/tokens.css');
    ['--depth-perspective', '--depth-lift', '--depth-press', '--edge-light']
        .forEach((token) => {
            check(`el token ${token} está definido`, tokens.includes(`${token}:`));
        });

    /* El filo se define dos veces, una por tema: sobre fondo claro el blanco
       del tema oscuro se ve como un halo sucio. */
    const edgeDefs = (tokens.match(/--edge-light:/g) || []).length;
    check('el filo de luz está definido en ambos temas', edgeDefs >= 2, `${edgeDefs} definiciones`);

    const layout = read('assets/css/layout.css');
    check('la inclinación vive dentro de su consulta de medios',
        layout.indexOf('.post-card.is-tilting') > layout.indexOf('@media (hover: hover)'));
}

/* === 7. Configuración de publicación === */
check('existe .nojekyll', exists('.nojekyll'));
check('existe README.md', exists('README.md'));

if (exists('.github/workflows/pages.yml')) {
    const yml = read('.github/workflows/pages.yml');
    check('workflow: sin tabuladores', !yml.includes('\t'));
    /* El despliegue tiene que colgar de UNA rama concreta, no de cualquier
       push: sin esa lista, una rama de pruebas publicaría el sitio.

       No se fija cuál: el proyecto se quedó con una sola rama y cambiar de
       nombre no debería obligar a tocar esta prueba. Lo que se comprueba es
       que la lista existe y nombra algo. */
    const rama = yml.match(/branches:\s*\[?\s*["']?([\w.\-/]+)/);
    check('workflow: el despliegue cuelga de una rama concreta',
        Boolean(rama), 'falta `branches:` en el disparador');

    if (rama) {
        check('workflow: esa rama es la de trabajo',
            rama[1] === 'main',
            `despliega desde «${rama[1]}»`);
    }
    check('workflow: permisos de pages', yml.includes('pages: write'));
    check('workflow: id-token', yml.includes('id-token: write'));
} else {
    problems.push('falta .github/workflows/pages.yml');
}

/* ======================================================================
   La entrada: el guion y la hoja tienen que ir en hora

   La coreografía vive en `intro.css` y `intro.js` solo la acompaña: añade la
   memoria de sesión, el poder saltarla y la precisión del contador. Si las
   cifras se separan, no falla nada visible de inmediato y por eso es
   peligroso: cuando la entrada se acortó de 5200 a 2200 ms y el guion se
   quedó en 5600, el telón seguía EN EL DOCUMENTO tres segundos y medio
   después de haberse desvanecido —invisible, pero por encima de todo— y la
   portada no llegaba a entrar nunca.
   ====================================================================== */

{
    const js = read('assets/js/ui/intro.js');
    const css = read('assets/css/intro.css');

    const cifra = (re, src) => {
        const m = src.match(re);
        return m ? Number(m[1]) : null;
    };

    const exitJs = cifra(/const EXIT_MS = (\d+)/, js);
    const totalJs = cifra(/const TOTAL_MS = (\d+)/, js);
    const countJs = cifra(/const COUNT_MS = (\d+)/, js);

    // `animation: intro-exit <duración> <curva> <retardo> forwards`
    const salida = css.match(/animation: intro-exit (\d+)ms [^;]*?(\d+)ms forwards/);
    const duraCss = salida ? Number(salida[1]) : null;
    const empiezaCss = salida ? Number(salida[2]) : null;

    check('intro: el guion declara sus tres tiempos',
        exitJs !== null && totalJs !== null && countJs !== null,
        `EXIT ${exitJs}, TOTAL ${totalJs}, COUNT ${countJs}`);

    check('intro: la hoja declara cuándo sube el telón',
        empiezaCss !== null && duraCss !== null,
        String(salida));

    if (exitJs !== null && empiezaCss !== null) {
        check('intro: la señal se da cuando el telón empieza a subir',
            exitJs === empiezaCss, `guion ${exitJs} · hoja ${empiezaCss}`);

        check('intro: el telón se retira cuando la hoja ya terminó',
            totalJs >= empiezaCss + duraCss,
            `retira a ${totalJs}, la hoja acaba a ${empiezaCss + duraCss}`);

        check('intro: el contador llega a 100 antes de que el telón se vaya',
            countJs < empiezaCss, `contador ${countJs} · telón ${empiezaCss}`);

        /* Nadie aguanta más de dos segundos y pico mirando un logotipo antes
           de poder usar la página. */
        check('intro: no dura más de 2,6 segundos',
            totalJs <= 2600, `${totalJs} ms`);
    }

    check('intro: avisa a la página cuando se retira',
        js.includes('intro-done'),
        'la portada retrasa su entrada hasta esa marca');

    const feed = read('assets/css/pages/feed.css');
    check('la portada espera esa marca antes de entrar',
        feed.includes(':root:not(.intro-done)'));

    /* Retrasar y no pausar: un retardo se cumple solo, y si el guion no llega
       a cargar la portada entra igual, solo más tarde. Pausar exige una señal
       que alguien tiene que dar, y si falla se queda invisible para siempre. */
    check('y lo hace retrasando, no pausando',
        !/:root:not\(\.intro-done\)[^{]*\{[^}]*animation-play-state:\s*paused/.test(feed));
}

/* === Resultado === */
console.log(`\n  ${passed} comprobaciones correctas, ${problems.length} problemas\n`);

if (problems.length) {
    console.log('PROBLEMAS:');
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log('');
    process.exitCode = 1;
} else {
    console.log('  Integridad del sitio verificada.\n');
}
