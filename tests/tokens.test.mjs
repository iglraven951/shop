/**
 * Toda variable que el CSS usa, está definida.
 *
 * Una `var(--x)` que no resuelve no avisa de nada: el navegador **descarta la
 * declaración entera** y sigue como si no existiera. Un borde desaparece, un
 * fondo se queda transparente, una transición no ocurre — y el archivo se lee
 * perfectamente bien, porque el error no está en la sintaxis sino en un
 * nombre que nadie definió.
 *
 * Pasó de verdad, dos veces en la misma tarde: un bloque escrito contra
 * `--border`, `--surface-2`, `--ink-900` y `--transition-fast` —que suenan a
 * este proyecto pero se llaman `--border-subtle`, `--bg-raised`, `--navy-900`
 * y `--duration-fast`— dejó la bandeja de fotos del chat sin borde, sin fondo
 * y sin transiciones, y el panel del revisor igual. Nada falló. Simplemente no
 * se dibujó.
 *
 * También se comprueba `outline: var(--focus-ring)`, que es la otra forma de
 * escribir algo válido que no hace nada: `--focus-ring` guarda una sombra de
 * tres partes, sintaxis que `outline` no acepta, así que el foco del teclado
 * desaparece sin que el archivo deje de ser correcto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_DIR = path.join(ROOT, 'assets/css');

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
   Todas las hojas del proyecto
   ---------------------------------------------------------------------- */

function sheets(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sheets(full);
        return entry.name.endsWith('.css') ? [full] : [];
    });
}

const files = sheets(CSS_DIR).sort();
check('hay hojas que revisar', files.length > 0, String(files.length));

/* ----------------------------------------------------------------------
   Lo definido y lo usado
   ---------------------------------------------------------------------- */

const defined = new Set();
const used = new Map();   // nombre → [archivo:línea]

for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');

    text.split(/\r?\n/).forEach((line, index) => {
        /* Definiciones: `--x: valor`. Se excluye lo que va dentro de una
           `var(...)`, que es uso y no definición. */
        const declaration = line.replace(/var\([^)]*\)/g, '');
        for (const m of declaration.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);

        /* Usos. Los que traen valor de reserva —`var(--x, 0px)`— no pueden
           fallar: si la variable no existe, se usa la reserva. Solo importan
           los que se quedarían sin nada. */
        for (const m of line.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
            if (m[2] === ',') continue;

            if (!used.has(m[1])) used.set(m[1], []);
            used.get(m[1]).push(`${rel}:${index + 1}`);
        }
    });
}

/* ----------------------------------------------------------------------
   Las que escribe el guion

   Media docena de variables no se declaran en ninguna hoja porque su valor
   lo calcula el JavaScript en cada fotograma: la inclinación de una tarjeta
   bajo el puntero, el relleno de una estrella, el avance del desplazamiento,
   los recortes de la pantalla del teléfono. Existen igual, solo que las
   define quien las mide.
   ---------------------------------------------------------------------- */

function scripts(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return scripts(full);
        return entry.name.endsWith('.js') ? [full] : [];
    });
}

const fromScript = new Set();

for (const file of scripts(path.join(ROOT, 'assets/js'))) {
    const text = fs.readFileSync(file, 'utf8');

    // setProperty('--x', …) y los que se escriben dentro de un atributo style
    for (const m of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) fromScript.add(m[1]);
    for (const m of text.matchAll(/(--[\w-]+)\s*:\s*\$\{/g)) fromScript.add(m[1]);
}

// Y las que la propia página escribe en línea
for (const page of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
    const text = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const m of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) fromScript.add(m[1]);
}

fromScript.forEach((name) => defined.add(name));

console.log(`\n  ${defined.size} variables (${fromScript.size} las escribe el guion)`
    + ` · ${used.size} usadas sin reserva · ${files.length} hojas\n`);

/* ----------------------------------------------------------------------
   1. Ninguna variable usada puede faltar
   ---------------------------------------------------------------------- */

const missing = [...used.keys()].filter((name) => !defined.has(name)).sort();

check('ninguna variable usada está sin definir', missing.length === 0,
    missing.map((n) => `${n} (${used.get(n)[0]})`).join(', '));

for (const name of missing) {
    console.log(`  ✗ ${name}`);
    used.get(name).slice(0, 4).forEach((where) => console.log(`      ${where}`));
}

/* ----------------------------------------------------------------------
   2. Las sombras no valen como `outline`

   `--focus-ring` y las sombras guardan varios valores separados por comas.
   `outline` acepta «grosor estilo color» y nada más: cualquier otra cosa se
   descarta en silencio y el foco del teclado deja de verse.
   ---------------------------------------------------------------------- */

const SHADOW_LIKE = /^--(focus-ring|shadow-|edge-light)/;

for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');

    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
        const m = line.match(/^\s*outline\s*:\s*var\(\s*(--[\w-]+)/);
        if (!m || !SHADOW_LIKE.test(m[1])) return;

        check(`${rel}:${index + 1} no usa una sombra como outline`, false,
            `outline: var(${m[1]}) — usa box-shadow, o outline con grosor, estilo y color`);
    });
}

/* ----------------------------------------------------------------------
   3. Las variables del sistema se definen en `tokens.css`

   Cada hoja puede tener variables locales, pero las compartidas viven en un
   solo sitio: si media docena de hojas definen su propio `--surface-2`, deja
   de haber un sistema y pasa a haber seis.
   ---------------------------------------------------------------------- */

const tokens = fs.readFileSync(path.join(CSS_DIR, 'tokens.css'), 'utf8');
const inTokens = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

/* Informativo, no un fallo: una variable local que resuelve funciona
   perfectamente. Lo que se señala aquí es deuda de organización —cuando el
   mismo nombre vive en tres hojas, deja de haber un sistema y pasa a haber
   tres—, y eso lo decide quien mantiene el diseño, no una prueba. */
const shared = [...used.entries()]
    .filter(([name, places]) => {
        const hojas = new Set(places.map((p) => p.split(':')[0]));
        return hojas.size >= 3 && !inTokens.has(name);
    })
    .map(([name]) => name);

if (shared.length) {
    console.log(`  Definidas fuera de tokens.css y usadas por tres hojas o más:`);
    console.log(`    ${shared.join(', ')}\n`);
}

/* ----------------------------------------------------------------------
   4. Nada definido y jamás usado en tokens.css

   Informativo: un token muerto no rompe nada, pero engorda el sistema y
   hace dudar de si algo debería estar usándolo.
   ---------------------------------------------------------------------- */

const unused = [...inTokens].filter((name) => !used.has(name)).sort();

if (unused.length) {
    console.log(`\n  Tokens definidos y no usados (${unused.length}):`);
    console.log(`    ${unused.join(', ')}\n`);
}

/* ======================================================================
   Resultado
   ====================================================================== */

console.log(`  ${passed} comprobaciones correctas, ${problems.length} problemas\n`);

if (problems.length) {
    console.log('PROBLEMAS:');
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log('');
    process.exitCode = 1;
} else {
    console.log('  Todas las variables del CSS resuelven.\n');
}
