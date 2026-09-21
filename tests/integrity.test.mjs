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
   avisar, que es peor. Esta lista es la que impide que vuelva a ocurrir. */
const CORE_ORDER = [
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

/* === 3c. La cinta de productos de la portada ===

   Las tres piezas —marcado, hoja y script— solo sirven juntas. Si alguien
   quita una, la sección queda como un hueco vacío o como una columna de
   fotos sin animar, y ninguna de las dos cosas da un error visible. */
{
    const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const piezas = [
        ['marcado', 'id="showcase-track"'],
        ['hoja', 'assets/css/showcase.css'],
        ['script', 'assets/js/ui/showcase.js'],
    ];
    const presentes = piezas.filter(([, aguja]) => home.includes(aguja));
    check('index.html: la cinta lleva marcado, hoja y script',
        presentes.length === piezas.length,
        presentes.length === piezas.length ? ''
            : `falta: ${piezas.filter(([, a]) => !home.includes(a)).map(([n]) => n).join(', ')}`);

    check('existe assets/css/showcase.css', exists('assets/css/showcase.css'));
    check('existe assets/js/ui/showcase.js', exists('assets/js/ui/showcase.js'));

    // El script se apoya en el shell para el tema y en api para los datos
    const posShell = home.indexOf('assets/js/ui/shell.js');
    const posCinta = home.indexOf('assets/js/ui/showcase.js');
    check('index.html: la cinta carga tras el shell', posCinta > posShell && posShell !== -1);
}

/* === 3d. La entrada con movimiento reducido ===

   La secuencia construye la composición desde la nada: casi cada pieza parte
   de opacity:0 o desplazada y llega a su sitio por animación. Con movimiento
   reducido no hay animaciones, así que la variante quieta tiene que dejarlas
   ya colocadas — o esconder las que solo existen para moverse.

   Sin esto, un acto nuevo en la entrada quedaría invisible en cualquier móvil
   con ahorro de batería, que es donde el navegador activa esa preferencia por
   su cuenta. Y no daría ningún error: simplemente faltaría. */
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
        const quieto = css.slice(inicio, fin);

        const invisibles = [...secuencia.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
            .map(([, sel, cuerpo]) => ({ sel: sel.trim().replace(/\s+/g, ' '), cuerpo }))
            .filter(({ sel }) => sel.startsWith('.intro') && !sel.includes('%') && !sel.includes('@'))
            .filter(({ cuerpo }) => /opacity:\s*0\s*[;}]?/.test(cuerpo)
                || /transform:\s*[^;]*(translate|scale[XY]?\(0|rotate)/.test(cuerpo)
                || /stroke-dashoffset:\s*var\(--len/.test(cuerpo));

        check('intro.css: hay piezas que nacen invisibles', invisibles.length >= 8,
            `encontradas ${invisibles.length}`);

        invisibles.forEach(({ sel }) => {
            // Basta con que el bloque quieto lo nombre: o lo recoloca, o lo
            // esconde por ser puro movimiento. Las dos cosas son correctas.
            const cubierto = sel.split(',').every((uno) => quieto.includes(uno.trim()));
            check(`intro.css: ${sel} se ve sin movimiento`, cubierto);
        });

        // La capa entera no puede desaparecer: ese era el fallo corregido.
        check('intro.css: la entrada no se oculta del todo',
            !/\.intro\s*\{[^}]*display:\s*none/.test(quieto));
        check('intro.css: la variante quieta tiene su propia salida',
            quieto.includes('intro-exit-quiet'));
    }

    // Y el script debe acompañarla, no retirarla de golpe
    const js = read('assets/js/ui/intro.js');
    check('intro.js: el movimiento reducido ya no la descarta',
        !/alreadySeen\(\)\s*\|\|\s*prefersReducedMotion\(\)/.test(js));
    check('intro.js: la variante quieta tiene su propia duración', js.includes('QUIET_MS'));
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

/* === 7. Configuración de publicación === */
check('existe .nojekyll', exists('.nojekyll'));
check('existe README.md', exists('README.md'));

if (exists('.github/workflows/pages.yml')) {
    const yml = read('.github/workflows/pages.yml');
    check('workflow: sin tabuladores', !yml.includes('\t'));
    check('workflow: despliega en push a main', /branches:\s*\[?\s*["']?main/.test(yml));
    check('workflow: permisos de pages', yml.includes('pages: write'));
    check('workflow: id-token', yml.includes('id-token: write'));
} else {
    problems.push('falta .github/workflows/pages.yml');
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
