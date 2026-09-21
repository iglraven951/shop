/**
 * Auditoría de contraste de los tokens de color.
 *
 * Lee `tokens.css`, resuelve las variables de cada tema y mide cada
 * combinación de texto sobre fondo que el sitio usa de verdad. Es la única
 * forma de saber si la paleta cumple WCAG sin abrir el navegador y sin
 * fiarse de la intuición: dos azules que «se ven bien» pueden quedarse en 3,4.
 *
 * Umbrales WCAG 2.1 AA:
 *   4.5  texto normal
 *   3.0  texto grande (≥18,66 px en negrita o ≥24 px) y elementos gráficos
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AA_TEXT = 4.5;
const AA_LARGE = 3.0;

let passed = 0;
const problems = [];
const notes = [];

function check(name, value, threshold) {
    if (value >= threshold) {
        passed += 1;
    } else {
        problems.push(`${name} → ${value.toFixed(2)} (exige ${threshold})`);
    }
}

/* ----------------------------------------------------------------------
   Color
   ---------------------------------------------------------------------- */

function parseColor(value) {
    const text = String(value).trim();

    const hex = text.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
        let h = hex[1];
        if (h.length === 3) h = [...h].map((c) => c + c).join('');
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
            a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
        };
    }

    const rgba = text.match(/^rgba?\(([^)]+)\)$/i);
    if (rgba) {
        const parts = rgba[1].split(',').map((p) => parseFloat(p));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    }

    return null;
}

/** Compone un color translúcido sobre su fondo, como hace el navegador. */
function flatten(color, backdrop) {
    if (color.a >= 1) return color;
    return {
        r: color.r * color.a + backdrop.r * (1 - color.a),
        g: color.g * color.a + backdrop.g * (1 - color.a),
        b: color.b * color.a + backdrop.b * (1 - color.a),
        a: 1,
    };
}

function luminance({ r, g, b }) {
    const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* ----------------------------------------------------------------------
   Leer los tokens de cada tema
   ---------------------------------------------------------------------- */

const css = fs.readFileSync(path.join(ROOT, 'assets/css/tokens.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Extrae las declaraciones de un bloque `:root…{ }`. */
function readBlock(selector) {
    const index = css.indexOf(selector);
    if (index === -1) return {};

    const open = css.indexOf('{', index);
    let depth = 1;
    let i = open + 1;
    while (i < css.length && depth > 0) {
        if (css[i] === '{') depth += 1;
        if (css[i] === '}') depth -= 1;
        i += 1;
    }

    const body = css.slice(open + 1, i - 1);
    const out = {};
    for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        out[match[1]] = match[2].trim();
    }
    return out;
}

const darkTokens = readBlock(':root');
const lightTokens = { ...darkTokens, ...readBlock(':root[data-theme="light"]') };

/** Resuelve `var(--x)` encadenados hasta llegar a un color real. */
function resolve(tokens, name, depth = 0) {
    if (depth > 10) return null;

    const raw = tokens[name];
    if (!raw) return null;

    const ref = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (ref) return resolve(tokens, ref[1], depth + 1);

    return parseColor(raw);
}

/* ----------------------------------------------------------------------
   Combinaciones que el sitio usa de verdad
   ---------------------------------------------------------------------- */

const SURFACES = ['--bg-base', '--bg-sunken', '--bg-surface', '--bg-raised', '--bg-overlay'];

const TEXT_ON_SURFACE = [
    ['--text-primary', AA_TEXT],
    ['--text-secondary', AA_TEXT],
    ['--text-muted', AA_TEXT],
    ['--brand', AA_TEXT],
    ['--success', AA_TEXT],
    ['--warning', AA_TEXT],
    ['--danger', AA_TEXT],
    ['--accent', AA_TEXT],
];

/* Relleno sólido + su texto: los botones */
const FILLS = [
    ['--brand', '--brand-contrast', 'botón primario'],
    ['--success', '--text-inverse', 'botón de éxito'],
    ['--danger', '--brand-contrast', 'botón de peligro'],
];

console.log('\nAUDITORÍA DE CONTRASTE DE TOKENS\n' + '='.repeat(58));

[['oscuro', darkTokens], ['claro', lightTokens]].forEach(([themeName, tokens]) => {
    console.log(`\n── Tema ${themeName} ──`);

    SURFACES.forEach((surfaceName) => {
        const surface = resolve(tokens, surfaceName);
        if (!surface) return;

        TEXT_ON_SURFACE.forEach(([textName, threshold]) => {
            const raw = resolve(tokens, textName);
            if (!raw) return;

            const text = flatten(raw, surface);
            const value = contrast(text, surface);

            check(`${themeName}: ${textName} sobre ${surfaceName}`, value, threshold);
        });
    });

    FILLS.forEach(([bgName, fgName, label]) => {
        const bg = resolve(tokens, bgName);
        const fg = resolve(tokens, fgName);
        if (!bg || !fg) return;

        const value = contrast(flatten(fg, bg), bg);
        check(`${themeName}: ${label} (${fgName} sobre ${bgName})`, value, AA_TEXT);
    });

    // Los bordes son elementos gráficos: les basta 3.0
    const base = resolve(tokens, '--bg-surface');
    const border = resolve(tokens, '--border-strong');
    if (base && border) {
        const value = contrast(flatten(border, base), base);
        if (value < AA_LARGE) {
            notes.push(`${themeName}: --border-strong sobre --bg-surface llega a ${value.toFixed(2)}`);
        }
    }
});

/* ----------------------------------------------------------------------
   El muro de fotos de la portada

   Detrás del texto de la portada pasan fotos del catálogo. Una foto es una
   superficie que no se controla: puede ser negra o puede ser blanca, y si es
   blanca, levanta el fondo bajo el texto y el contraste cae.

   Lo que sí se controla son dos números de showcase.css: cuánto se deja ver
   de la foto y cuánto tapa el velo que va encima. Aquí se toma el peor caso
   posible —una foto enteramente blanca— y se exige que aun así todo el texto
   de la portada siga cumpliendo. Si alguien sube la opacidad de las fotos
   porque se ven poco, esto salta antes de que llegue a producción.
   ---------------------------------------------------------------------- */
{
    const wall = fs.readFileSync(path.join(ROOT, 'assets/css/showcase.css'), 'utf8');

    /** Todos los valores que el archivo da a una variable, en cualquier corte. */
    const valores = (nombre) => [...wall.matchAll(new RegExp(`${nombre}:\\s*([\\d.]+)`, 'g'))]
        .map((m) => Number(m[1]))
        .filter((n) => !Number.isNaN(n));

    const fotos = valores('--showcase-photo');
    const velos = valores('--showcase-veil');

    check('showcase.css: declara la opacidad de las fotos', fotos.length, 1);
    check('showcase.css: declara la opacidad del velo', velos.length, 1);

    // El texto de la portada, con el umbral que le corresponde por tamaño
    const TEXTO_PORTADA = [
        ['--text-primary', AA_TEXT, 'titular y cifras'],
        ['--text-secondary', AA_TEXT, 'párrafo de entrada'],
        ['--text-muted', AA_TEXT, 'etiquetas de las cifras'],
        // El titular resaltado se pinta con --brand, que cambia de tono con
        // el tema: claro sobre fondo oscuro y oscuro sobre fondo claro.
        ['--brand', AA_TEXT, 'texto resaltado del titular'],
    ];

    const BLANCO = { r: 255, g: 255, b: 255, a: 1 };

    if (fotos.length && velos.length) {
        // La combinación más exigente de las declaradas
        const foto = Math.max(...fotos);
        const velo = Math.min(...velos);

        [['oscuro', darkTokens], ['claro', lightTokens]].forEach(([themeName, tokens]) => {
            const base = resolve(tokens, '--bg-base');
            if (!base) return;

            // Foto blanca atenuada sobre el fondo, y el velo encima
            const conFoto = flatten({ ...BLANCO, a: foto }, base);
            const fondo = flatten({ ...base, a: velo }, conFoto);

            TEXTO_PORTADA.forEach(([textName, threshold, papel]) => {
                const raw = resolve(tokens, textName);
                if (!raw) return;

                const value = contrast(flatten(raw, fondo), fondo);
                check(`${themeName}: ${papel} sobre una foto blanca del muro`, value, threshold);
            });
        });
    }
}

/* ----------------------------------------------------------------------
   Resultado
   ---------------------------------------------------------------------- */

console.log(`\n  ${passed} combinaciones correctas, ${problems.length} problemas\n`);

if (problems.length) {
    console.log('PROBLEMAS:');
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log('');
}

if (notes.length) {
    console.log('OBSERVACIONES:');
    notes.forEach((n) => console.log(`  · ${n}`));
    console.log('');
}

if (problems.length) {
    process.exitCode = 1;
} else {
    console.log('  Toda la paleta cumple WCAG AA.\n');
}
