/**
 * Auditoría de comportamiento responsive.
 *
 * Busca los patrones que provocan desbordes horizontales y elementos
 * inalcanzables en pantallas pequeñas. No sustituye a mirar el sitio en un
 * teléfono, pero atrapa lo que se puede demostrar leyendo el CSS.
 *
 * Anchos de referencia: 360 px (móvil pequeño), 768 px (tableta), 1440 px (PC).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MOBILE = 360;   // el ancho más estrecho que soportamos
const GUTTER = 32;    // margen lateral mínimo (16 px a cada lado)
const SAFE = MOBILE - GUTTER;   // 328 px de contenido utilizable
const TOUCH = 44;     // área táctil mínima accesible

let passed = 0;
const problems = [];
const notes = [];

function check(name, condition, detail = '') {
    if (condition) {
        passed += 1;
    } else {
        problems.push(`${name}${detail ? ` → ${detail}` : ''}`);
    }
}

const readRaw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Los comentarios estorban al identificar qué selector gobierna una regla:
 * no terminan en `;` ni `}`, así que quedarían pegados al selector siguiente.
 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const read = (rel) => stripComments(readRaw(rel));

const cssFiles = [
    ...fs.readdirSync(path.join(ROOT, 'assets/css'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => `assets/css/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'assets/css/pages'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => `assets/css/pages/${f}`),
];

console.log('\nAUDITORÍA RESPONSIVE\n' + '='.repeat(58));
console.log(`Ancho de referencia: ${MOBILE} px (${SAFE} px de contenido útil)\n`);

/* ----------------------------------------------------------------------
   Utilidades de análisis
   ---------------------------------------------------------------------- */

/**
 * Divide el CSS en tramos: los de fuera de media queries y los de dentro,
 * con el ancho máximo al que aplican. Así se sabe qué regla gobierna en móvil.
 */
function splitByMedia(css) {
    const segments = [];
    let base = '';
    let i = 0;

    while (i < css.length) {
        const start = css.indexOf('@media', i);

        if (start === -1) {
            base += css.slice(i);
            break;
        }

        base += css.slice(i, start);

        const headerEnd = css.indexOf('{', start);
        if (headerEnd === -1) { base += css.slice(start); break; }

        const header = css.slice(start, headerEnd);

        // Recorrer hasta la llave que cierra el bloque de la media query
        let depth = 1;
        let j = headerEnd + 1;
        while (j < css.length && depth > 0) {
            if (css[j] === '{') depth += 1;
            else if (css[j] === '}') depth -= 1;
            j += 1;
        }

        const maxMatch = header.match(/max-width:\s*(\d+)px/);
        const minMatch = header.match(/min-width:\s*(\d+)px/);

        segments.push({
            // Una media query de min-width no gobierna en móvil.
            maxWidth: minMatch ? -1 : (maxMatch ? Number(maxMatch[1]) : Infinity),
            text: css.slice(headerEnd + 1, j - 1),
        });

        i = j;
    }

    // El bloque sin media query va primero: es el que la cascada sobrescribe.
    segments.unshift({ maxWidth: Infinity, text: base });
    return segments;
}

/** Declaraciones que gobiernan a 360 px: fuera de media, o en max-width >= 360. */
function mobileText(css) {
    return splitByMedia(css)
        .filter((s) => s.maxWidth >= MOBILE)
        .map((s) => s.text)
        .join('\n');
}

/**
 * Texto que aplica SOLO dentro de media queries que alcanzan el móvil.
 * Sirve para saber si una regla base fue corregida más abajo en la cascada.
 */
function mobileOverrides(css) {
    return splitByMedia(css)
        .filter((s) => s.maxWidth >= MOBILE && s.maxWidth !== Infinity)
        .map((s) => s.text)
        .join('\n');
}

/** Extrae los selectores de un bloque de reglas. */
function selectorsOf(text) {
    return [...text.matchAll(/([^{}]+)\{/g)]
        .map((m) => m[1].trim())
        .filter(Boolean);
}

/**
 * Localiza el selector que contiene una posición dada dentro del CSS.
 * Permite comprobar si esa misma regla se redefine para móvil.
 */
function selectorAt(text, index) {
    const before = text.slice(0, index);
    const open = before.lastIndexOf('{');
    if (open === -1) return null;

    // El delimitador debe buscarse ANTES de la llave: dentro del bloque hay
    // punto y coma en cada declaración, y tomarlos daría un rango inválido.
    const head = before.slice(0, open);
    const prevClose = Math.max(head.lastIndexOf('}'), head.lastIndexOf(';'));

    return head.slice(prevClose + 1).trim() || null;
}

/* ----------------------------------------------------------------------
   1. Anchos fijos que desbordan a 360 px
   ---------------------------------------------------------------------- */

cssFiles.forEach((rel) => {
    const css = read(rel);
    const mobile = mobileText(css);
    const offenders = [];

    // width / min-width en píxeles por encima del ancho útil
    for (const match of mobile.matchAll(/(?:^|[;{]\s*)(min-width|width)\s*:\s*(\d+)px/g)) {
        const [, prop, value] = match;
        if (Number(value) > SAFE) {
            offenders.push(`${prop}: ${value}px`);
        }
    }

    check(`${path.basename(rel)}: sin anchos fijos que desborden en móvil`,
        offenders.length === 0,
        offenders.length ? [...new Set(offenders)].join(', ') : '');
});

/* ----------------------------------------------------------------------
   2. Rejillas cuyas columnas no caben
   ---------------------------------------------------------------------- */

cssFiles.forEach((rel) => {
    const css = read(rel);
    const base = mobileText(css);
    const overrides = mobileOverrides(css);
    const overridden = new Set(selectorsOf(overrides));
    const offenders = [];

    /** Una regla base no gobierna en móvil si su selector se redefine abajo. */
    const isFixedLater = (index) => {
        const selector = selectorAt(base, index);
        return selector !== null && overridden.has(selector);
    };

    // repeat(auto-fill, minmax(420px, 1fr)) desborda si 420 > ancho útil
    for (const match of base.matchAll(/minmax\(\s*(\d+)px/g)) {
        if (Number(match[1]) > SAFE && !isFixedLater(match.index)) {
            offenders.push(`minmax(${match[1]}px…)`);
        }
    }

    // grid-template-columns con varias columnas fijas
    for (const match of base.matchAll(/grid-template-columns:\s*([^;}]+)/g)) {
        const value = match[1];
        const pxCols = [...value.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
        const total = pxCols.reduce((sum, v) => sum + v, 0);

        if (pxCols.length >= 2 && !/fr|auto|minmax|%/.test(value)
            && total > SAFE && !isFixedLater(match.index)) {
            offenders.push(`columnas fijas suman ${total}px`);
        }
    }

    check(`${path.basename(rel)}: rejillas caben en móvil`,
        offenders.length === 0,
        offenders.length ? [...new Set(offenders)].join(', ') : '');
});

/* ----------------------------------------------------------------------
   3. Texto largo sin posibilidad de romperse
   ---------------------------------------------------------------------- */

// Un correo o una URL sin espacios desborda cualquier contenedor si no se
// permite partir la palabra. Estos son los contenedores que reciben datos.
const USER_TEXT = [
    'post-text', 'comment-text', 'post-title', 'post-row-title',
    'empty-message', 'toast-message', 'alert-body',
];

const allCss = cssFiles.map(read).join('\n');

USER_TEXT.forEach((cls) => {
    // Vale con overflow-wrap, word-break, o un recorte de líneas que ya limita
    const block = allCss.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`, 'g')) || [];
    const joined = block.join(' ');
    const handled = /overflow-wrap|word-break|line-clamp|text-overflow/.test(joined);

    check(`.${cls} puede romper texto largo`, block.length === 0 || handled,
        block.length && !handled ? 'sin overflow-wrap ni recorte' : '');
});

/* ----------------------------------------------------------------------
   4. Áreas táctiles
   ---------------------------------------------------------------------- */

// Controles cuya zona pulsable se extiende a 44 px en `pointer: coarse`.
const coarseBlock = allCss.match(/@media\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\n\}/);
const touchExtended = new Set(
    coarseBlock
        ? [...coarseBlock[0].matchAll(/([.#][\w-]+(?:\s+[.#][\w-]+)*)::after/g)]
            .map((m) => m[1].trim().split(/\s+/).pop())
        : []
);

cssFiles.forEach((rel) => {
    const css = read(rel);
    const small = [];

    // Botones e interactivos con altura fija por debajo del mínimo táctil
    for (const match of css.matchAll(/([.#][\w-]+(?:[^{};]*)?)\s*\{([^}]*)\}/g)) {
        const [, selector, body] = match;

        const isInteractive = /btn|button|action|toggle|chip|tab|close|nav|link|item/i.test(selector);
        if (!isInteractive) continue;

        const height = body.match(/(?:^|[;{]\s*)height\s*:\s*(\d+)px/);
        const minHeight = body.match(/min-height\s*:\s*(\d+)px/);
        const effective = minHeight ? Number(minHeight[1]) : (height ? Number(height[1]) : null);

        // Un icono pequeño dentro de un contenedor mayor es legítimo; se
        // señalan solo los que fijan su propia caja por debajo del mínimo.
        if (effective === null || effective >= TOUCH - 8) continue;

        const name = selector.trim().split(/[\s,]/)[0];

        // Ya resuelto si su zona pulsable se amplía en dispositivos táctiles
        if (touchExtended.has(name)) continue;

        small.push(`${name} (${effective}px)`);
    }

    if (small.length) {
        notes.push(`${path.basename(rel)}: ${[...new Set(small)].slice(0, 6).join(', ')}`);
    }
});

/* ----------------------------------------------------------------------
   5. Cobertura de puntos de ruptura por página
   ---------------------------------------------------------------------- */

const pageCss = cssFiles.filter((f) => f.includes('/pages/'));

pageCss.forEach((rel) => {
    const css = read(rel);
    const breakpoints = [...css.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)]
        .map((m) => Number(m[1]));

    // Cada página necesita al menos un corte para móvil y otro para tableta
    const hasMobile = breakpoints.some((b) => b <= 720);
    const hasTablet = breakpoints.some((b) => b > 720 && b <= 1200);

    check(`${path.basename(rel)}: tiene corte para móvil`, hasMobile,
        hasMobile ? '' : `puntos: ${breakpoints.join(', ') || 'ninguno'}`);

    // Una página de columna única centrada se adapta sola: solo las que montan
    // varias columnas o un lateral necesitan un corte intermedio.
    const isMultiColumn = /grid-template-columns:\s*[^;}]*(?:\d+px|1fr)[^;}]*(?:\d+px|1fr)/.test(css)
        || /position:\s*sticky/.test(css);

    if (isMultiColumn && !hasTablet) {
        notes.push(`${path.basename(rel)}: varias columnas sin corte para tableta`);
    }
});

/* ----------------------------------------------------------------------
   5b. La cabecera compartida cabe en móvil

   Un desborde por acumulación no se detecta mirando declaraciones sueltas:
   ningún ancho es excesivo, pero la suma de los controles de la cabecera
   superaba los 328 px útiles de un móvil de 360. La regresión concreta fue
   que `.menu-toggle` estaba en `display: none` sin ninguna regla que lo
   mostrara, así que los iconos nunca se replegaban al menú.
   ---------------------------------------------------------------------- */
{
    const layout = read('assets/css/layout.css');
    const mobile = mobileOverrides(layout);

    check('la cabecera muestra el botón de menú en móvil',
        /\.menu-toggle\s*\{[^}]*display:\s*(?!none)/.test(mobile),
        'el botón existe pero ninguna media query lo hace visible');

    check('la cabecera repliega sus iconos en móvil',
        /\.header-icon-btn[^{]*\{[^}]*display:\s*none|\.header-actions[^{]*\{[^}]*display:\s*none/.test(mobile),
        'sin una regla que oculte los iconos, la fila desborda');
}

/* ----------------------------------------------------------------------
   6. El HTML declara el viewport y evita el zoom bloqueado
   ---------------------------------------------------------------------- */

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

pages.forEach((page) => {
    const html = read(page);
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/);

    check(`${page}: declara viewport`, !!viewport);

    if (viewport) {
        const content = viewport[1];
        check(`${page}: permite ampliar (accesibilidad)`,
            !/user-scalable\s*=\s*no/.test(content) && !/maximum-scale\s*=\s*1/.test(content),
            content);
    }
});

/* ----------------------------------------------------------------------
   7. Consistencia de puntos de ruptura
   ---------------------------------------------------------------------- */

const allBreakpoints = new Map();

cssFiles.forEach((rel) => {
    for (const match of read(rel).matchAll(/@media[^{]*max-width:\s*(\d+)px/g)) {
        const bp = Number(match[1]);
        if (!allBreakpoints.has(bp)) allBreakpoints.set(bp, new Set());
        allBreakpoints.get(bp).add(path.basename(rel));
    }
});

const sorted = [...allBreakpoints.keys()].sort((a, b) => a - b);
notes.push(`puntos de ruptura en uso: ${sorted.join(', ')}`);

/* ----------------------------------------------------------------------
   Resultado
   ---------------------------------------------------------------------- */

console.log(`  ${passed} comprobaciones correctas, ${problems.length} problemas\n`);

if (problems.length) {
    console.log('PROBLEMAS:');
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log('');
}

if (notes.length) {
    console.log('OBSERVACIONES (no bloquean):');
    notes.forEach((n) => console.log(`  · ${n}`));
    console.log('');
}

if (problems.length) {
    process.exitCode = 1;
} else {
    console.log('  Sin desbordes detectables en el CSS.\n');
}
