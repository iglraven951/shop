/**
 * Verificación de la app Android que envuelve el sitio.
 *
 * La app es un WebView que sirve el sitio desde su propio paquete, así que
 * hay dos cosas que ningún test del sitio ve: que el proyecto Android esté
 * completo y bien configurado, y que la copia del sitio que viaja dentro del
 * APK sea la misma que el sitio de verdad. Una app que se queda con la versión
 * de hace tres commits no da ningún error: simplemente muestra otra cosa.
 *
 * La copia del sitio la genera Gradle al compilar, dentro de `build/`, así que
 * esas comprobaciones se OMITEN mientras no exista —no se dan por buenas— y se
 * ejecutan enteras en cuanto se ha compilado una vez.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const abs = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(abs(rel));
const read = (rel) => fs.readFileSync(abs(rel), 'utf8');

/* Lectura tolerante: si el archivo todavía no existe devuelve null en lugar
   de reventar. Su ausencia ya la denuncia la sección 1; las secciones que
   dependen de él se apartan y lo anotan como omitido. */
function readSafe(rel) {
    return exists(rel) ? read(rel) : null;
}

/* Recorre un directorio y devuelve las rutas de sus archivos relativas a la
   raíz del repositorio, siempre con barras hacia delante. */
function walk(rel, out = []) {
    const dir = abs(rel);
    if (!fs.existsSync(dir)) return out;

    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(child, out);
        else out.push(child);
    });

    return out;
}

const APP = 'android/app/src/main';

/*
   Dónde acaba la copia del sitio.

   La tarea `syncWebAssets` deja el sitio en `build/`, no en `src/`: así
   `gradlew clean` limpia de verdad y no hay archivos generados conviviendo
   con los escritos a mano. La ruta exacta la elige el plugin de Android, no
   la tarea: al engancharla con `addGeneratedSourceDirectory`, AGP se queda
   con la carpeta y la coloca bajo `generated/assets/<tarea>/`.

   El precio de vivir en `build/` es que estas comprobaciones solo pueden
   ejecutarse después de compilar; mientras no exista el directorio se OMITEN,
   que no es lo mismo que darlas por buenas.
*/
const WWW = 'android/app/build/generated/assets/syncWebAssets/www';

/* Densidades de lanzador y el lado exacto que debe tener cada PNG */
const DENSIDADES = [
    ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
];

console.log('\nVERIFICACIÓN DE LA APP ANDROID\n' + '='.repeat(58));

/* === 1. Esqueleto del proyecto === */
const GRADLE_FILES = [
    'android/settings.gradle.kts',
    'android/build.gradle.kts',
    'android/gradle.properties',
    'android/gradle/wrapper/gradle-wrapper.properties',
    'android/gradlew',
    'android/gradlew.bat',
    'android/app/build.gradle.kts',
    'android/app/proguard-rules.pro',
];

const SOURCE_FILES = [
    `${APP}/AndroidManifest.xml`,
    `${APP}/java/pe/discoveryshop/app/MainActivity.kt`,
];

const RES_FILES = [
    `${APP}/res/mipmap-anydpi-v26/ic_launcher.xml`,
    `${APP}/res/mipmap-anydpi-v26/ic_launcher_round.xml`,
    `${APP}/res/drawable/ic_launcher_background.xml`,
    `${APP}/res/drawable/ic_launcher_foreground.xml`,
    `${APP}/res/drawable/ic_launcher_monochrome.xml`,
    `${APP}/res/drawable/ic_splash_logo.xml`,
    `${APP}/res/values/colors.xml`,
    `${APP}/res/values/strings.xml`,
    `${APP}/res/values/themes.xml`,
    `${APP}/res/values-night/themes.xml`,
    `${APP}/res/xml/network_security_config.xml`,
    `${APP}/res/xml/backup_rules.xml`,
    `${APP}/res/xml/data_extraction_rules.xml`,
];

const ICON_PNGS = DENSIDADES.flatMap(([densidad]) => [
    `${APP}/res/mipmap-${densidad}/ic_launcher.png`,
    `${APP}/res/mipmap-${densidad}/ic_launcher_round.png`,
]);

[...GRADLE_FILES, ...SOURCE_FILES, ...RES_FILES, ...ICON_PNGS]
    .forEach((file) => check(`existe ${file}`, exists(file)));

/* === 2. Configuración de Gradle === */
{
    const rel = 'android/app/build.gradle.kts';
    const gradle = readSafe(rel);

    if (gradle === null) {
        notes.push(`configuración de Gradle: sin revisar, todavía falta ${rel}`);
    } else {
        // El identificador es el nombre con el que la app vive en el teléfono
        // y en Play: cambiarlo por accidente instala una app distinta.
        check('build.gradle.kts: namespace pe.discoveryshop.app',
            /namespace\s*=\s*"pe\.discoveryshop\.app"/.test(gradle));
        check('build.gradle.kts: applicationId pe.discoveryshop.app',
            /applicationId\s*=\s*"pe\.discoveryshop\.app"/.test(gradle));

        // Se acepta tanto `compileSdk = 35` como `compileSdk 35`
        check('build.gradle.kts: compileSdk 35', /compileSdk\s*=?\s*35\b/.test(gradle));
        check('build.gradle.kts: minSdk 24', /minSdk\s*=?\s*24\b/.test(gradle));
        check('build.gradle.kts: targetSdk 35', /targetSdk\s*=?\s*35\b/.test(gradle));

        check('build.gradle.kts: declara versionCode', /versionCode\s*=?\s*\d+/.test(gradle));
        check('build.gradle.kts: declara versionName',
            /versionName\s*=?\s*"[^"]+"/.test(gradle));

        /* La tarea que copia el sitio dentro del APK. Sin ella el APK se
           compila igual, pero sale vacío.

           Heurística: no se comprueba su nombre —lo elige quien escribe el
           build— ni se exige la ruta literal `assets/www`, porque la tarea
           puede componerla (`into("www")` sobre un directorio generado y
           luego `assets.srcDir(...)`). Se piden las dos señales que no pueden
           faltar en ninguna de las dos formas: que se registre una tarea y
           que su salida acabe enganchada a los assets. */
        const declaraTarea = /tasks\.(register|create)/.test(gradle)
            || /\bregister<\s*(Sync|Copy)\b/.test(gradle);
        const apuntaAlSitio = /assets\/www/.test(gradle)
            || /assets\.srcDir/.test(gradle)
            || /into\(\s*"www"\s*\)/.test(gradle);

        check('build.gradle.kts: declara la tarea que copia el sitio',
            declaraTarea && apuntaAlSitio,
            [!declaraTarea && 'no registra ninguna tarea',
                !apuntaAlSitio && 'su salida no llega a los assets'].filter(Boolean).join(', '));
    }
}

/* === 3. AndroidManifest === */
{
    const rel = `${APP}/AndroidManifest.xml`;
    const manifest = readSafe(rel);

    if (manifest === null) {
        notes.push(`AndroidManifest: sin revisar, todavía falta ${rel}`);
    } else {
        check('AndroidManifest: declara el permiso INTERNET',
            manifest.includes('android.permission.INTERNET'));

        check('AndroidManifest: icono @mipmap/ic_launcher',
            /android:icon\s*=\s*"@mipmap\/ic_launcher"/.test(manifest));
        check('AndroidManifest: icono redondo @mipmap/ic_launcher_round',
            /android:roundIcon\s*=\s*"@mipmap\/ic_launcher_round"/.test(manifest));

        check('AndroidManifest: enlaza network_security_config',
            /android:networkSecurityConfig\s*=\s*"@xml\/network_security_config"/.test(manifest));

        // El sitio se sirve desde https://appassets.androidplatform.net/,
        // así que abrir el tráfico en claro solo puede ser un descuido.
        check('AndroidManifest: sin usesCleartextTraffic="true"',
            !/android:usesCleartextTraffic\s*=\s*"true"/.test(manifest));

        /* Los bloques <activity>. No vale una expresión no codiciosa hasta
           "/>": el primer <action ... /> de un intent-filter la cortaría por
           dentro. Se busca el cierre de la etiqueta de apertura y, si no es
           autocontenida, su </activity>. El lookahead evita confundirla con
           <activity-alias>. */
        const actividades = [];
        for (const m of manifest.matchAll(/<activity(?=[\s>])/g)) {
            const finApertura = manifest.indexOf('>', m.index);
            if (finApertura === -1) continue;

            const apertura = manifest.slice(m.index, finApertura + 1);
            const fin = apertura.endsWith('/>')
                ? finApertura + 1
                : manifest.indexOf('</activity>', finApertura) + '</activity>'.length;

            actividades.push({ apertura, bloque: manifest.slice(m.index, fin) });
        }

        const lanzadoras = actividades.filter(({ bloque }) =>
            bloque.includes('android.intent.action.MAIN')
            && bloque.includes('android.intent.category.LAUNCHER'));

        check('AndroidManifest: exactamente una actividad de lanzamiento',
            lanzadoras.length === 1, `encontradas ${lanzadoras.length}`);

        if (lanzadoras.length === 1) {
            // Obligatorio desde API 31: sin android:exported la app ni instala
            check('AndroidManifest: la actividad de lanzamiento declara android:exported',
                /android:exported\s*=\s*"(true|false)"/.test(lanzadoras[0].apertura));
        }

        // Desde Android 13 el gesto de atrás se anima antes de soltarlo, pero
        // solo si la app se declara preparada. Sin esto el gesto funciona y se
        // ve peor, que es la clase de detalle que nadie reporta.
        check('AndroidManifest: atrás predictivo habilitado',
            /android:enableOnBackInvokedCallback\s*=\s*"true"/.test(manifest));

        /* Los <queries> tienen que cubrir todo lo que el puente promete. Si
           NativeBridge deja pasar `tel:` y el manifiesto no lo declara, en
           Android 11+ la llamada sale del WebView y muere en un aviso. */
        const bridge = readSafe(`${APP}/java/pe/discoveryshop/app/NativeBridge.kt`);
        const queries = manifest.match(/<queries>[\s\S]*?<\/queries>/)?.[0] ?? '';

        check('AndroidManifest: declara un bloque <queries>', queries.length > 0);

        if (bridge) {
            const permitidos = bridge.match(/ALLOWED_SCHEMES\s*=\s*setOf\(([^)]*)\)/)?.[1] ?? '';
            const esquemas = [...permitidos.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);

            // http y https se cubren con el mismo filtro de esquema https.
            const declarado = (esquema) => esquema === 'http'
                ? /android:scheme\s*=\s*"https?"/.test(queries)
                : new RegExp(`android:scheme\\s*=\\s*"${esquema}"`).test(queries);

            const huerfanos = esquemas.filter((e) => !declarado(e));
            check('AndroidManifest: <queries> cubre los esquemas del puente',
                huerfanos.length === 0,
                huerfanos.length ? `sin declarar: ${huerfanos.join(', ')}` : '');
        }

        check('AndroidManifest: <queries> cubre el selector de archivos',
            /GET_CONTENT/.test(queries));

        /* Enlaces de entrada: el esquema propio y la URL pública del sitio. */
        check('AndroidManifest: enlace profundo con esquema propio',
            /android:scheme\s*=\s*"discoveryshop"/.test(manifest));

        check('AndroidManifest: enlace profundo hacia el sitio publicado',
            /android:host\s*=\s*"iglraven951\.github\.io"/.test(manifest)
            && /android:pathPrefix\s*=\s*"\/shop\/"/.test(manifest));

        check('AndroidManifest: enlaza los accesos directos',
            /android:resource\s*=\s*"@xml\/shortcuts"/.test(manifest));
    }
}

/* === 4. Iconos de lanzador === */

/* Lee el ancho y el alto del encabezado IHDR de un PNG, sin dependencias:
   8 bytes de firma, 4 de longitud, 4 del nombre del trozo y, a partir del
   byte 16, ancho y alto como enteros de 32 bits big-endian. */
function medirPng(rel) {
    const fd = fs.openSync(abs(rel), 'r');
    const cabecera = Buffer.alloc(24);
    const leidos = fs.readSync(fd, cabecera, 0, 24, 0);
    fs.closeSync(fd);

    if (leidos < 24) return null;
    if (cabecera.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
    if (cabecera.subarray(12, 16).toString('ascii') !== 'IHDR') return null;

    return { ancho: cabecera.readUInt32BE(16), alto: cabecera.readUInt32BE(20) };
}

DENSIDADES.forEach(([densidad, lado]) => {
    ['ic_launcher', 'ic_launcher_round'].forEach((nombre) => {
        const rel = `${APP}/res/mipmap-${densidad}/${nombre}.png`;
        if (!exists(rel)) return; // ya denunciado en la sección 1

        const medida = medirPng(rel);
        check(`${densidad}/${nombre}.png: es un PNG válido`, medida !== null);

        if (medida) {
            check(`${densidad}/${nombre}.png: mide ${lado}×${lado}`,
                medida.ancho === lado && medida.alto === lado,
                `mide ${medida.ancho}×${medida.alto}`);
        }
    });
});

// Los iconos adaptativos necesitan sus tres capas: sin monochrome el tema
// dinámico de Android 13 deja el lanzador en blanco.
['ic_launcher.xml', 'ic_launcher_round.xml'].forEach((archivo) => {
    const xml = readSafe(`${APP}/res/mipmap-anydpi-v26/${archivo}`);
    if (xml === null) return; // ya denunciado en la sección 1

    check(`${archivo}: es un <adaptive-icon>`, /<adaptive-icon[\s>]/.test(xml));

    ['background', 'foreground', 'monochrome'].forEach((capa) => {
        check(`${archivo}: declara la capa ${capa}`,
            new RegExp(`<${capa}[\\s/>]`).test(xml));
    });
});

/* === 5. Seguridad: nada de tráfico en claro === */
{
    const rel = `${APP}/res/xml/network_security_config.xml`;
    const config = readSafe(rel);

    if (config === null) {
        notes.push(`configuración de red: sin revisar, todavía falta ${rel}`);
    } else {
        // Vale declararlo en false o no permitirlo en ninguna parte
        check('network_security_config: prohíbe el tráfico en claro',
            !/cleartextTrafficPermitted\s*=\s*"true"/.test(config));
    }
}

// Ningún archivo del proyecto —tampoco el sitio ya copiado— puede llevar una
// URL http:// escrita a mano. Los espacios de nombres de XML la usan por
// definición y no son tráfico, así que se descuentan.
//
// Se exige al menos un carácter de host detrás del `//`: la política de red
// explica en prosa qué pasa con «un http:// que se cuele», y esa mención no
// es una URL. Un comentario con una URL de verdad sí cuenta: suele ser el
// paso previo a descomentarla.
const BINARIOS = /\.(png|jpe?g|webp|gif|ico|jar|aar|so|ttf|otf|woff2?|zip|keystore|jks|bin|mp4|pdf)$/i;
const NAMESPACES = ['http://schemas.android.com/', 'http://www.w3.org/'];

/* Se mira cuántos archivos hay, no si el directorio existe: un `src/main`
   creado pero todavía vacío no recorrería nada y la sección se daría por
   buena sin haber leído ni una línea. */
const revisables = walk(APP).filter((rel) => !BINARIOS.test(rel));

if (revisables.length === 0) {
    notes.push(`URLs en claro: sin revisar, todavía no hay archivos en ${APP}`);
} else {
    revisables.forEach((rel) => {
        const hits = [...read(rel).matchAll(/http:\/\/[A-Za-z0-9][^\s"'<>)]*/g)]
            .map((m) => m[0])
            .filter((url) => !NAMESPACES.some((ns) => url.startsWith(ns)));

        check(`${rel}: sin URL http:// en claro`, hits.length === 0,
            hits.length ? [...new Set(hits)].slice(0, 3).join(', ') : '');
    });
}

/* === 6. El mapa sin conexión === */
{
    // Leaflet va empaquetado dentro de la app: desde el CDN no cargaría con
    // el teléfono sin datos, y el mapa es media pantalla de dos páginas.
    const LEAFLET_JS = 'assets/vendor/leaflet/leaflet.js';
    const LEAFLET_CSS = 'assets/vendor/leaflet/leaflet.css';

    check(`existe ${LEAFLET_JS}`, exists(LEAFLET_JS));
    check(`existe ${LEAFLET_CSS}`, exists(LEAFLET_CSS));

    // Un archivo diminuto sería un marcador de posición o una descarga a medias
    if (exists(LEAFLET_JS)) {
        const kb = fs.statSync(abs(LEAFLET_JS)).size / 1024;
        check('leaflet.js es la biblioteca completa', kb > 100, `pesa ${kb.toFixed(1)} KB`);
    }

    if (exists(LEAFLET_CSS)) {
        const kb = fs.statSync(abs(LEAFLET_CSS)).size / 1024;
        check('leaflet.css es la hoja completa', kb > 5, `pesa ${kb.toFixed(1)} KB`);
    }

    ['mapa.html', 'publicacion.html'].forEach((page) => {
        const html = readSafe(page);
        if (html === null) {
            check(`existe ${page}`, false);
            return;
        }

        check(`${page}: usa la copia local de leaflet.js`, html.includes(LEAFLET_JS));
        check(`${page}: usa la copia local de leaflet.css`, html.includes(LEAFLET_CSS));
    });
}

/* === 7. Paridad sitio ↔ app === */
/* La copia que viaja dentro del APK la genera Gradle y no está versionada.
   Mientras no exista se OMITE: darla por buena sería justo lo contrario de
   lo que hace falta. */
if (!exists(WWW)) {
    notes.push(`paridad sitio ↔ app: omitida, ${WWW} lo genera Gradle al compilar y aún no existe`);
} else {
    const espejo = [
        ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
        ...walk('assets'),
    ];

    check('la app lleva una copia del sitio', espejo.length > 0);

    espejo.forEach((rel) => {
        const copia = `${WWW}/${rel}`;

        if (!exists(copia)) {
            check(`www: ${rel} copiado`, false, 'no está dentro de la app');
            return;
        }

        const origen = fs.statSync(abs(rel)).size;
        const dentro = fs.statSync(abs(copia)).size;

        check(`www: ${rel} idéntico`, origen === dentro,
            `sitio ${origen} B, app ${dentro} B`);
    });
}

/* === 8. Contrato del puente nativo === */
{
    const rel = 'assets/js/core/native.js';
    const code = readSafe(rel);

    check(`existe ${rel}`, code !== null);

    if (code !== null) {
        check('native.js: habla con DSNative', code.includes('DSNative'));

        /* `window.DSNative` solo existe dentro de la app: en el navegador,
           en GitHub Pages y abriendo el archivo desde el disco no está. Cada
           llamada sin proteger es un TypeError que corta el script entero.

           Heurística —deliberadamente simple— para darla por protegida:
             a) está dentro de un bloque try { ... }, delimitado contando
                llaves desde cada `try` (una expresión no codiciosa se comería
                el cierre del primer objeto literal que encontrase); o
             b) su propia línea comprueba con typeof; o
             c) alguna de las tres líneas anteriores comprueba DSNative con
                typeof (el guardia clásico al principio de la función). */
        const regiones = [];
        for (const m of code.matchAll(/\btry\s*\{/g)) {
            const abre = m.index + m[0].length - 1;
            let nivel = 0;

            for (let n = abre; n < code.length; n += 1) {
                if (code[n] === '{') nivel += 1;
                else if (code[n] === '}') {
                    nivel -= 1;
                    if (nivel === 0) { regiones.push([abre, n]); break; }
                }
            }
        }

        const lineas = code.split('\n');
        const sueltas = [];

        for (const m of code.matchAll(/DSNative\./g)) {
            const numero = code.slice(0, m.index).split('\n').length;
            const linea = lineas[numero - 1] || '';
            const previas = lineas.slice(Math.max(0, numero - 4), numero - 1).join('\n');

            const protegida = regiones.some(([a, b]) => m.index > a && m.index < b)
                || /typeof/.test(linea)
                || /typeof[^\n]*DSNative/.test(previas);

            if (!protegida) sueltas.push(`línea ${numero}: ${linea.trim().slice(0, 50)}`);
        }

        check('native.js: ninguna llamada a DSNative sin proteger', sueltas.length === 0,
            sueltas.length ? sueltas.slice(0, 3).join(' · ') : '');
    }
}

/* === 9. Accesos directos: la app no puede ofrecer menos que la web ===

   `site.webmanifest` ya prometía tres atajos cuando el sitio se instalaba
   como PWA. La app los repite en `shortcuts.xml`, y aquí se comprueba que
   siguen siendo los mismos: son dos listas que nadie va a recordar
   sincronizar a mano. */
{
    const rel = `${APP}/res/xml/shortcuts.xml`;
    const atajos = readSafe(rel);
    const manifestWeb = readSafe('site.webmanifest');

    if (atajos === null) {
        notes.push(`Accesos directos: sin revisar, todavía falta ${rel}`);
    } else {
        const destinos = [...atajos.matchAll(/android:data\s*=\s*"discoveryshop:\/\/([^"]+)"/g)]
            .map((m) => m[1]);

        check('shortcuts.xml: define al menos un acceso directo', destinos.length > 0);

        // Un atajo a una página que no existe abre la app en la portada sin
        // decir nada: el usuario cree que el atajo no hace nada.
        const rotos = destinos.filter((d) => !exists(d.split('?')[0]));
        check('shortcuts.xml: todos los destinos existen en el sitio',
            rotos.length === 0, rotos.join(', '));

        // Cada atajo necesita etiqueta corta, larga e icono propios.
        const bloques = [...atajos.matchAll(/<shortcut[\s\S]*?<\/shortcut>/g)].map((m) => m[0]);
        const incompletos = bloques.filter((b) =>
            !/shortcutShortLabel/.test(b)
            || !/shortcutLongLabel/.test(b)
            || !/android:icon/.test(b));
        check('shortcuts.xml: cada acceso directo trae etiquetas e icono',
            incompletos.length === 0, `${incompletos.length} incompletos`);

        // Los iconos referenciados tienen que existir de verdad.
        const iconos = [...atajos.matchAll(/android:icon\s*=\s*"@drawable\/([^"]+)"/g)]
            .map((m) => `${APP}/res/drawable/${m[1]}.xml`);
        const ausentes = iconos.filter((i) => !exists(i));
        check('shortcuts.xml: los iconos referenciados existen',
            ausentes.length === 0, ausentes.join(', '));

        if (manifestWeb === null) {
            notes.push('Accesos directos: sin comparar con site.webmanifest');
        } else {
            const web = (JSON.parse(manifestWeb).shortcuts || [])
                .map((s) => s.url.replace(/^\.\//, ''))
                .sort();

            check('shortcuts.xml: los mismos atajos que site.webmanifest',
                JSON.stringify([...destinos].sort()) === JSON.stringify(web),
                `app: ${destinos.join(', ')} · web: ${web.join(', ')}`);
        }
    }
}

/* === 10. Enlaces de entrada y gestos ===

   La lista blanca de páginas que `MainActivity` acepta desde fuera tiene que
   ser exactamente la de páginas que el sitio publica. Si se queda corta, un
   enlace legítimo abre la portada; si se pasa, un enlace de fuera puede pedir
   una ruta que no es una página. */
{
    const rel = `${APP}/java/pe/discoveryshop/app/MainActivity.kt`;
    const activity = readSafe(rel);

    if (activity === null) {
        notes.push(`Enlaces de entrada: sin revisar, todavía falta ${rel}`);
    } else {
        const blanca = activity.match(/SITE_PAGES\s*=\s*setOf\(([\s\S]*?)\)/)?.[1] ?? '';
        const aceptadas = [...blanca.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();

        const publicadas = fs.readdirSync(ROOT)
            .filter((f) => f.endsWith('.html'))
            .sort();

        check('MainActivity: la lista blanca cubre las páginas del sitio',
            JSON.stringify(aceptadas) === JSON.stringify(publicadas),
            `app: ${aceptadas.length} · sitio: ${publicadas.length}`);

        check('MainActivity: atiende un segundo enlace con la app abierta',
            /override fun onNewIntent/.test(activity));

        check('MainActivity: tirar para recargar solo desde arriba',
            /setOnChildScrollUpCallback/.test(activity));

        check('MainActivity: contesta siempre al selector de archivos',
            /onShowFileChooser/.test(activity)
            && /pendingFileCallback\s*=\s*null/.test(activity));

        check('MainActivity: confirma antes de salir',
            /EXIT_CONFIRM_WINDOW_MS/.test(activity) && /R\.string\.exit_confirm/.test(activity));
    }

    const layout = readSafe(`${APP}/res/layout/activity_main.xml`);
    if (layout !== null) {
        check('activity_main: el WebView va dentro de un SwipeRefreshLayout',
            /SwipeRefreshLayout/.test(layout));
    }

    const gradle = readSafe('android/app/build.gradle.kts');
    if (gradle !== null) {
        check('build.gradle.kts: declara swiperefreshlayout',
            /swiperefreshlayout/.test(gradle));
    }
}

/* === 11. Compartir: la web decide qué, la plataforma decide cómo === */
{
    const componentes = readSafe('assets/js/ui/components.js');
    const store = readSafe('assets/js/core/store.js');

    if (componentes === null || store === null) {
        notes.push('Compartir: sin revisar, falta components.js o store.js');
    } else {
        check('components.js: la acción de compartir pasa por DSApp.share',
            /DSApp\.share\(/.test(componentes));

        // Compartir el origen interno de la app manda a un callejón sin
        // salida: dentro del WebView la URL es appassets.androidplatform.net.
        check('components.js: comparte una dirección pública, no la interna',
            /publicHref\(/.test(componentes));

        check('store.js: publicHref reescribe el origen dentro de la app',
            /publicHref\(/.test(store) && /DSApp && global\.DSApp\.isNative/.test(store));

        check('components.js: la confirmación háptica no asume el puente',
            /if \(global\.DSApp\) global\.DSApp\.vibrate\(/.test(componentes));
    }
}

/* === Resultado === */
console.log(`\n  ${passed} comprobaciones correctas, ${problems.length} problemas\n`);

if (problems.length) {
    console.log('PROBLEMAS:');
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log('');
}

if (notes.length) {
    console.log('OMITIDAS:');
    notes.forEach((n) => console.log(`  · ${n}`));
    console.log('');
}

if (problems.length) {
    process.exitCode = 1;
} else {
    console.log('  La app Android está en orden.\n');
}
