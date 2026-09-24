/**
 * Pruebas del chat: el vendedor que negocia y las fotos que se mandan.
 *
 * El vendedor de la demostración no es un repertorio de frases: recuerda la
 * conversación y regatea con un margen real. Esa memoria es justo lo que un
 * cambio descuidado rompe sin avisar —basta reordenar dos ramas del árbol de
 * intenciones para que «lo vi más barato en otro lado» se convierta en una
 * rebaja automática, o para que el precio vuelva al de salida al recargar—.
 *
 * Lo que aquí se fija:
 *   · que ceder tenga un suelo, y que se note que cada vez cede menos
 *   · que la memoria sobreviva a guardar y volver a leer
 *   · que cada pregunta caiga en su rama, incluidas las que se solapan
 *   · que un mensaje pueda ser solo fotos
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

load('assets/js/core/seller-bot.js');

const bot = sandbox.window.SellerBot;
check('el módulo se expone como SellerBot', Boolean(bot && bot.reply));

/** Una conversación nueva, como la que crea `conversationForOffer`. */
const freshConversation = (price = 300) => ({
    id: 'conv-test',
    price,
    request_title: 'una bicicleta montañera',
    seller: { id: 'u-seller', username: 'Juan Quispe', district: 'Cayma' },
    buyer: { id: 'u-buyer', username: 'Patricia' },
    photos_of_offer: [{ url: 'a.jpg' }, { url: 'b.jpg' }],
    messages: [],
});

/* ======================================================================
   El regateo tiene suelo
   ====================================================================== */

{
    const conv = freshConversation(300);

    /* El suelo se redondea a cinco soles, como se regatea de verdad: el 82 %
       de 300 son 246, y lo que el vendedor defiende son 245. Se compara
       contra el suelo que él mismo se fijó, no contra el porcentaje puro. */
    bot.reply(conv, 'hola');
    const suelo = conv.haggle.floor;

    // Diez peticiones de rebaja seguidas: el margen no puede ser infinito
    const precios = [];
    for (let i = 0; i < 10; i += 1) {
        bot.reply(conv, 'me haces una rebaja?');
        precios.push(conv.haggle.current);
    }

    check('el precio baja al pedir rebaja', precios[0] < 300, String(precios[0]));
    check('nunca baja del suelo que se fijó',
        precios.every((p) => p >= suelo),
        `mínimo alcanzado ${Math.min(...precios)} con suelo ${suelo}`);
    check('acaba declarándose firme', conv.haggle.firm === true);

    /* Cada ronda cede menos que la anterior: así se comporta quien tiene un
       margen de verdad, y es lo que distingue un regateo de un descuento. */
    const primera = 300 - precios[0];
    const segunda = precios[0] - precios[1];
    check('cada rebaja es menor que la anterior', primera >= segunda,
        `primera ${primera}, segunda ${segunda}`);

    // Insistir cuando ya no puede bajar no devuelve la misma frase tres veces
    const insistencias = new Set();
    for (let i = 0; i < 3; i += 1) {
        insistencias.add(bot.reply(conv, 'ya pues, un poco menos').text);
    }
    check('insistir no repite la misma respuesta', insistencias.size >= 2,
        `${insistencias.size} respuestas distintas de 3`);
}

/* ======================================================================
   Una cifra sobre la mesa
   ====================================================================== */

{
    const conv = freshConversation(300);

    const alta = bot.reply(conv, 'te doy 320');
    check('una oferta por encima del precio se acepta',
        /cerramos|aparto/i.test(alta.text) && conv.haggle.deal === true,
        alta.text.slice(0, 70));
}

{
    const conv = freshConversation(300);

    const baja = bot.reply(conv, 'te doy 100');
    check('una oferta muy baja recibe contraoferta, no un sí',
        conv.haggle.deal !== true && /\d/.test(baja.text),
        baja.text.slice(0, 70));
    check('la contraoferta no baja del suelo',
        conv.haggle.current >= conv.haggle.floor, String(conv.haggle.current));
}

{
    const conv = freshConversation(300);

    // 250 está por debajo de 300 pero por encima del suelo (246)
    const justa = bot.reply(conv, 'te doy 250');
    check('una oferta entre el suelo y el precio se acepta como última',
        conv.haggle.current === 250 && conv.haggle.firm === true,
        `${conv.haggle.current}, firme ${conv.haggle.firm}`);
    check('y lo dice con esas palabras',
        /último precio|no puedo bajar/i.test(justa.text), justa.text.slice(0, 70));
}

/* ======================================================================
   La memoria sobrevive al almacén

   Es el punto entero del ejercicio: el estado vive en la conversación, que
   se serializa a `localStorage` con todo lo demás. Si dejara de ser
   serializable —un Set, un Map, una fecha viva— el vendedor volvería al
   precio de salida en cuanto recargaras la página.
   ====================================================================== */

{
    const conv = freshConversation(300);
    bot.reply(conv, 'me haces rebaja?');
    bot.reply(conv, 'hasta cuando me lo guardas?');

    const revivida = JSON.parse(JSON.stringify(conv));

    check('el estado del regateo es serializable',
        revivida.haggle && revivida.haggle.current === conv.haggle.current,
        JSON.stringify(conv.haggle).slice(0, 80));

    const despues = bot.reply(revivida, 'y cuanto era?');
    check('tras recargar sigue en el precio al que había bajado',
        despues.text.includes(String(revivida.haggle.current)),
        despues.text.slice(0, 80));
    check('y recuerda hasta cuándo lo apartó',
        Boolean(revivida.haggle.held_until));
}

/* ======================================================================
   Cada pregunta, en su rama

   Las tres primeras son las que se solapan entre sí y por eso el orden de
   evaluación importa: «hasta cuándo me lo dejas» lleva «dejas», que también
   aparece al negociar; «lo vi más barato en otro lado» lleva «más barato».
   ====================================================================== */

const RAMAS = [
    ['hasta cuando me lo dejas?', /guardar|apartad|hasta/i, 'reserva'],
    ['lo vi mas barato en facebook', /veas|pruebes|boleta/i, 'competencia'],
    ['en cuanto quedamos?', /quedamos en/i, 'recapitulación'],
    ['donde nos vemos?', /Cayma/, 'lugar'],
    ['a que hora puedes?', /hora|mañana|noche/i, 'hora'],
    ['esta en buen estado?', /estado|fallas|pruebas/i, 'estado'],
    ['tiene garantia?', /garantía/i, 'garantía'],
    ['me das boleta?', /boleta/i, 'boleta'],
    ['aceptas yape?', /Yape|efectivo/i, 'pago'],
    ['haces delivery?', /envío|llevar|agencia/i, 'envío'],
    ['que marca es?', /modelo|datos|etiqueta/i, 'detalles'],
    ['viene con su caja?', /completo|accesorio/i, 'accesorios'],
    ['tienes mas de uno?', /uno solo|cantidad/i, 'cantidad'],
    ['aceptas cambio?', /cambio no|venta directa/i, 'permuta'],
];

for (const [pregunta, esperado, rama] of RAMAS) {
    const conv = freshConversation(300);
    const answer = bot.reply(conv, pregunta);
    check(`«${pregunta}» llega a ${rama}`, esperado.test(answer.text),
        answer.text.slice(0, 80));
}

/* Preguntar por el precio ya acordado no debe rebajarlo otra vez. */
{
    const conv = freshConversation(300);
    bot.reply(conv, 'me haces rebaja?');
    const acordado = conv.haggle.current;

    bot.reply(conv, 'en cuanto quedamos?');
    check('recapitular el precio no lo vuelve a bajar',
        conv.haggle.current === acordado,
        `${acordado} → ${conv.haggle.current}`);
}

/* ======================================================================
   Fotos
   ====================================================================== */

{
    const conv = freshConversation(300);
    const answer = bot.reply(conv, 'me mandas fotos?');

    check('pedir fotos devuelve fotos, no la promesa de mandarlas',
        Array.isArray(answer.photos) && answer.photos.length === 2,
        String(answer.photos && answer.photos.length));
    check('y son las que adjuntó a su oferta',
        answer.photos[0].url === 'a.jpg');
}

{
    const sinFotos = freshConversation(300);
    sinFotos.photos_of_offer = [];
    const answer = bot.reply(sinFotos, 'mandame una foto');

    check('sin fotos que mandar, lo dice en vez de adjuntar nada',
        !answer.photos && /luz|fotos/i.test(answer.text), answer.text.slice(0, 70));
}

/* ======================================================================
   Nunca responde vacío

   Un chat que se queda callado parece roto. Cualquier cosa que se escriba
   —incluido lo que no entiende— tiene que producir una frase.
   ====================================================================== */

const SUELTAS = ['asdfgh', '???', 'ke', '👍', 'me interesa mucho la verdad',
    'y eso como funciona', '25', 'ok', ''];

for (const suelta of SUELTAS) {
    const conv = freshConversation(300);
    const answer = bot.reply(conv, suelta);
    check(`«${suelta || '(vacío)'}» recibe una respuesta con contenido`,
        Boolean(answer && answer.text && answer.text.trim().length > 10),
        String(answer && answer.text));
}

/* ======================================================================
   El precio se dice como se habla
   ====================================================================== */

{
    const conv = freshConversation(300);
    const answer = bot.reply(conv, 'cuanto cuesta?');
    check('un precio redondo se dice sin céntimos',
        answer.text.includes('S/ 300') && !answer.text.includes('S/ 300.00'),
        answer.text.slice(0, 60));
}

{
    const conv = freshConversation(149.9);
    const answer = bot.reply(conv, 'cuanto cuesta?');
    check('un precio con céntimos sí los conserva',
        answer.text.includes('149.90'), answer.text.slice(0, 60));
}

/* ======================================================================
   Vendedores distintos suenan distinto
   ====================================================================== */

{
    const voces = new Set();
    for (const id of ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6']) {
        const conv = freshConversation(300);
        conv.seller.id = id;
        voces.add(bot.reply(conv, 'hola').text.split('.')[0]);
    }
    check('no todos los vendedores saludan igual', voces.size >= 2,
        `${voces.size} saludos distintos de 6`);
}

/* ======================================================================
   El transporte admite un mensaje que es solo fotos
   ====================================================================== */

{
    const api = fs.readFileSync(path.join(ROOT, 'assets/js/core/api.js'), 'utf8');
    check('api.sendMessage acepta fotos',
        /sendMessage\(conversationId, text, photos\)/.test(api));

    /* Dentro de SU método, no en cualquiera.

       Esta comprobación buscaba `body: { text, photos:` en todo el archivo, y
       ese cuerpo se coló por error en `createComment` —que ni siquiera tiene
       una variable `photos`, así que habría reventado al comentar— mientras
       `sendMessage` se quedaba con `body: { text }`. La prueba pasaba, el
       transporte no llevaba las fotos y comentar estaba roto.

       Se recorta el método y se mira solo ahí. */
    const cuerpoDe = (nombre) => {
        const desde = api.indexOf(`        ${nombre}(`);
        if (desde < 0) return '';
        const hasta = api.indexOf('\n        }', desde);
        return hasta < 0 ? api.slice(desde) : api.slice(desde, hasta);
    };

    check('y las envía en el cuerpo de sendMessage',
        /body: \{ text, photos:/.test(cuerpoDe('sendMessage')),
        cuerpoDe('sendMessage').slice(0, 120));

    check('sin colarse en el de los comentarios',
        !/photos/.test(cuerpoDe('createComment')),
        cuerpoDe('createComment').slice(0, 120));

    /* Y ninguna variable usada sin declarar en todo el transporte: es la
       forma que tomó ese error y no la habría visto nadie hasta ejecutarlo. */
    for (const metodo of ['createComment', 'sendMessage', 'createRequest']) {
        const cuerpo = cuerpoDe(metodo);
        const firma = cuerpo.slice(0, cuerpo.indexOf(')') + 1);
        const usaFotos = /\bphotos\b/.test(cuerpo);

        check(`${metodo} declara lo que usa`,
            !usaFotos || /photos/.test(firma),
            `firma: ${firma}`);
    }

    const mock = fs.readFileSync(path.join(ROOT, 'assets/js/core/mock-api.js'), 'utf8');
    check('el almacén admite un mensaje sin texto si trae fotos',
        /if \(!text && !photos\.length\) fail/.test(mock));
    check('y normaliza la foto a un objeto con url',
        /typeof p === 'string' \? \{ url: p \}/.test(mock));

    const chat = fs.readFileSync(path.join(ROOT, 'assets/js/pages/chat.js'), 'utf8');
    check('la página escala las fotos antes de guardarlas',
        /canvas\.toDataURL\('image\/jpeg', QUALITY\)/.test(chat));
    check('y limita cuántas van por mensaje',
        /const MAX_PHOTOS = 4;/.test(chat));

    const html = fs.readFileSync(path.join(ROOT, 'mensajes.html'), 'utf8');
    check('el compositor tiene botón de adjuntar', /id="chat-attach"/.test(html));
    check('con su campo de archivo', /id="chat-file"[\s\S]{0,120}accept="image\/\*"/.test(html));
    check('y una bandeja para lo que va a enviarse', /id="chat-tray"/.test(html));
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
    console.log('  El chat negocia y acepta fotos como se espera.\n');
}
