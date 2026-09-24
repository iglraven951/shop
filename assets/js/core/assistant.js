/**
 * DiscoveryShop · Asistente
 *
 * Motor de comprensión propio de la plataforma. No llama a ningún servicio
 * externo ni necesita claves: todo el razonamiento ocurre en el navegador,
 * sobre el tablón real de pedidos de DiscoveryShop.
 *
 * Funciona en cuatro pasos:
 *   1. Normaliza el mensaje (minúsculas, sin tildes, signos aparte).
 *   2. Deduce la intención: buscar, preguntar el precio, ubicar, publicar…
 *   3. Extrae lo concreto: marca, categoría, distrito, rango de precio, estado.
 *   4. Consulta el tablón y redacta una respuesta con los resultados reales.
 *
 * La tolerancia a erratas se resuelve con distancia de edición: «ifone»,
 * «iphonr» o «айфон» mal tecleado siguen llegando a «iPhone».
 */
(function (global) {
    'use strict';

    /* ----------------------------------------------------------------------
       Texto
       ---------------------------------------------------------------------- */

    /** Minúsculas, sin tildes y sin signos: la base de toda comparación. */
    function normalize(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[¿?¡!.,;:()"'`]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const tokenize = (text) => normalize(text).split(' ').filter(Boolean);

    /**
     * Distancia de edición con corte temprano.
     * Se detiene en cuanto supera `max`, que es lo que interesa: no importa
     * cuán lejos está una palabra, solo si está lo bastante cerca.
     */
    function editDistance(a, b, max = 3) {
        if (a === b) return 0;
        if (Math.abs(a.length - b.length) > max) return max + 1;

        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

        for (let i = 1; i <= a.length; i += 1) {
            const row = [i];
            let best = i;

            for (let j = 1; j <= b.length; j += 1) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
                if (row[j] < best) best = row[j];
            }

            if (best > max) return max + 1;
            prev = row;
        }

        return prev[b.length];
    }

    /** Tolerancia proporcional: una palabra corta admite menos error. */
    function tolerance(word) {
        if (word.length <= 3) return 0;
        if (word.length <= 5) return 1;
        if (word.length <= 8) return 2;
        return 3;
    }

    /**
     * Tolerancia para el vocabulario de intención, más estricta que la de
     * producto.
     *
     * Un nombre de producto se escribe mal a menudo —«ifone», «samsun»— y ahí
     * conviene ser generoso. Las palabras con las que se pide algo, en cambio,
     * son de uso diario y se escriben bien; siendo igual de generosos,
     * «gratis» entraba como «gracias» (distancia 2) y el asistente contestaba
     * «un placer ayudarte» a quien preguntaba si esto cuesta dinero, mientras
     * «chau» activaba «chat» (distancia 1) y rompía la despedida.
     */
    function intentTolerance(word) {
        return word.length <= 5 ? 0 : 1;
    }

    /**
     * ¿Alguna palabra del mensaje se parece lo suficiente a `target`?
     *
     * @param {string[]} tokens Palabras del mensaje, ya normalizadas.
     * @param {string} target Palabra buscada.
     * @param {(word: string) => number} [scale] Qué margen de errata se admite.
     */
    function fuzzyHas(tokens, target, scale = tolerance) {
        const goal = normalize(target);
        if (!goal) return false;

        const margin = scale(goal);

        return tokens.some((token) => {
            if (token === goal) return true;

            /* Un término contenido cuenta solo si va AL PRINCIPIO: «iphone15»
               empieza por «iphone», y eso es lo que quiere decir escribir el
               modelo pegado. Buscándolo en cualquier posición, en cambio,
               media lengua española activaba categorías: «para» vive dentro de
               «lámpara», «esto» dentro de «repuesto», «mano» dentro de
               «mando», y «hacer» contiene «acer». Con eso, «cómo hago para
               vender» se clasificaba en Hogar y «quiero hacer un pedido» en
               Cómputo. */
            if (goal.length >= 4 && token.startsWith(goal)) return true;
            if (token.length >= 4 && goal.startsWith(token)) return true;

            /* La primera letra tiene que coincidir. Sin esto, «lámpara» y
               «cámara» quedan a distancia 2 y el asistente clasificaba una
               lámpara en Cámaras. Quien escribe deprisa se come letras o las
               cambia de sitio; casi nunca se equivoca en la primera. */
            if (token[0] !== goal[0]) return false;

            return editDistance(token, goal, margin) <= margin;
        });
    }

    /**
     * A cuántas letras quedó la palabra más parecida del mensaje.
     *
     * Sirve para distinguir una errata de una palabra distinta que casualmente
     * se le parece. Una contención por delante («iphone15» sobre «iphone»)
     * cuenta como distancia cero: es la misma palabra escrita de corrido.
     */
    function closestDistance(tokens, target) {
        const goal = normalize(target);
        let best = Infinity;

        tokens.forEach((token) => {
            if (token === goal || token.startsWith(goal) || goal.startsWith(token)) {
                best = 0;
                return;
            }
            if (token[0] !== goal[0]) return;
            const d = editDistance(token, goal, 3);
            if (d < best) best = d;
        });

        return best;
    }

    /* ----------------------------------------------------------------------
       Vocabulario del dominio
       ---------------------------------------------------------------------- */

    /** Marcas y modelos que la gente escribe al buscar. */
    const BRANDS = {
        'cat-celulares': ['iphone', 'apple', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'poco',
            'huawei', 'motorola', 'moto', 'oppo', 'realme', 'honor', 'celular', 'telefono',
            'movil', 'smartphone', 'pixel'],
        'cat-computo': ['macbook', 'laptop', 'portatil', 'notebook', 'dell', 'hp', 'lenovo',
            'asus', 'acer', 'msi', 'computadora', 'pc', 'monitor', 'pantalla', 'teclado',
            'mouse', 'ipad', 'tablet', 'impresora'],
        'cat-audio': ['audifonos', 'auriculares', 'cascos', 'headphones', 'airpods', 'sony',
            'jbl', 'bose', 'parlante', 'altavoz', 'bocina', 'speaker', 'microfono',
            'interfaz', 'behringer', 'focusrite'],
        'cat-gaming': ['playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'switch', 'consola',
            'juego', 'gamer', 'gaming', 'mando', 'control', 'joystick', 'steam'],
        'cat-camaras': ['camara', 'canon', 'nikon', 'sony', 'gopro', 'dji', 'dron', 'drone',
            'lente', 'tripode', 'fotografia', 'reflex', 'dslr', 'mirrorless'],
        'cat-hogar': ['cafetera', 'aspiradora', 'licuadora', 'microondas', 'refrigeradora',
            'televisor', 'tele', 'tv', 'smart', 'freidora', 'airfryer', 'cocina', 'horno',
            'lavadora', 'ventilador',
            // Muebles y decoración: en el comercio inverso se piden mucho, y
            // sin estas palabras el asistente no sabía dónde ponerlos.
            'lampara', 'mueble', 'mesa', 'silla', 'escritorio', 'repisa',
            'sofa', 'colchon', 'cama', 'espejo', 'alfombra', 'cortina', 'vajilla'],
        'cat-moda': ['zapatillas', 'zapatos', 'nike', 'adidas', 'puma', 'reebok', 'casaca',
            'chaqueta', 'polo', 'camisa', 'pantalon', 'jean', 'reloj', 'casio', 'mochila',
            'cartera', 'lentes', 'ropa'],
        'cat-deportes': ['bicicleta', 'bici', 'mtb', 'trek', 'shimano', 'mancuerna', 'pesas',
            'gimnasio', 'patineta', 'skate', 'scooter', 'tabla', 'surf', 'pelota', 'raqueta'],
        'cat-instrumentos': ['guitarra', 'yamaha', 'fender', 'piano', 'teclado', 'bateria',
            'cajon', 'bajo', 'violin', 'ukelele', 'amplificador'],
        'cat-libros': ['libro', 'libros', 'novela', 'coleccion', 'manga', 'comic', 'texto',
            'universitario', 'lectura'],
        'cat-bebes': ['coche', 'cochecito', 'corral', 'cuna', 'bebe', 'niño', 'niños',
            'juguete', 'pañalera', 'silla'],
        'cat-vehiculos': ['moto', 'motocicleta', 'casco', 'llanta', 'llantas', 'neumatico',
            'auto', 'carro', 'repuesto', 'scooter', 'bateria'],
    };

    /* --- Señales de intención --- */
    const INTENTS = {
        /* «q tal» y «ke tal» se escriben así en un chat de aquí, y las frases
           con espacio se comparan literalmente, sin margen de errata. */
        saludo: ['hola', 'buenas', 'buenos', 'hey', 'saludos', 'que tal', 'q tal', 'ke tal',
            'holi', 'alo'],
        despedida: ['chau', 'adios', 'bye', 'hasta luego', 'nos vemos'],
        gracias: ['gracias', 'grax', 'thanks', 'genial', 'perfecto', 'excelente'],
        buscar: ['quiero', 'busco', 'buscar', 'necesito', 'tienen', 'tienes', 'hay', 'venden',
            'vendes', 'consigo', 'encuentro', 'muestrame', 'muestra', 'dame', 'ver',
            'estoy buscando', 'me interesa', 'ando buscando'],
        precio: ['precio', 'cuesta', 'cuanto', 'vale', 'barato', 'economico', 'presupuesto',
            'menos de', 'hasta', 'maximo', 'rango', 'gratis', 'comision', 'cobran',
            'cobras', 'pagar', 'pago'],
        publicar: ['publicar', 'vender', 'subir', 'anunciar', 'ofrecer', 'quiero vender',
            'como vendo', 'como publico', 'pedir', 'pedido', 'hacer un pedido'],
        cuenta: ['registrar', 'registro', 'cuenta', 'sesion', 'ingresar', 'entrar',
            'contraseña', 'vendedor', 'aprobar', 'verificado', 'correo', 'email', 'vende'],
        ayuda: ['ayuda', 'como funciona', 'que es', 'explicame', 'no entiendo', 'ayudame',
            'como hago', 'funciona'],
        ubicacion: ['distrito', 'zona', 'donde', 'cerca', 'ubicacion', 'mapa', 'queda'],
        contacto: ['contactar', 'escribir', 'mensaje', 'mensajes', 'hablar', 'comunicar',
            'chat', 'conversacion', 'privado'],

        /* Lo que la plataforma hace y el asistente no sabía nombrar. «Oferta»
           es, con «pedido», la mitad del modelo, y no aparecía en ninguna
           parte: quien preguntaba «por qué no puedo ofertar» recibía una
           búsqueda vacía en el tablón. */
        oferta: ['oferta', 'ofertar', 'ofertas', 'responder', 'lo tengo', 'aceptar',
            'acepto', 'rechazar', 'descartar', 'postular'],
        /* Sin «vencer»: está a una letra de «vender» y «cómo hago para
           vender» acababa aquí. «vence» basta y no colisiona con nada. */
        vigencia: ['caduca', 'caducar', 'vence', 'expira', 'expirar', 'dura',
            'duracion', 'plazo', 'cuantos pedidos', 'cuantas publicaciones',
            'limite', 'tope'],
        soporte: ['estafa', 'estafaron', 'estafo', 'fraude', 'robaron', 'denunciar',
            'denuncia', 'reportar', 'reclamo', 'enganaron'],
        queja: ['pesimo', 'malo', 'inutil', 'no sirve', 'no funciona', 'porqueria',
            'basura', 'horrible', 'terrible'],
    };

    /** Vocabulario de la plataforma: no describe productos, sino acciones. */
    const FUNCTION_WORDS = new Set(
        Object.values(INTENTS)
            .flat()
            .filter((phrase) => !phrase.includes(' '))
            .map(normalize)
    );

    /** Estado del artículo tal como lo escribe la gente. */
    const CONDITIONS = {
        'Nuevo': ['nuevo', 'nueva', 'sellado', 'sin uso', 'a estrenar'],
        'Como nuevo': ['como nuevo', 'casi nuevo', 'impecable', 'seminuevo'],
        'Buen estado': ['usado', 'usada', 'segunda', 'buen estado', 'conservado'],
    };

    /* ----------------------------------------------------------------------
       Comprensión
       ---------------------------------------------------------------------- */

    /** Puntúa cada intención y devuelve las que superan el umbral. */
    function detectIntents(text, tokens) {
        const found = [];

        Object.entries(INTENTS).forEach(([intent, phrases]) => {
            const hit = phrases.some((phrase) => (
                phrase.includes(' ') ? text.includes(phrase) : fuzzyHas(tokens, phrase, intentTolerance)
            ));
            if (hit) found.push(intent);
        });

        return found;
    }

    /**
     * Extrae un rango de precio en soles.
     * Entiende «menos de 500», «hasta 1000», «entre 200 y 600», «de 300 a 900»
     * y el «barato» sin número, que se interpreta como un techo razonable.
     */
    function extractPrice(text) {
        /* El separador de millares es opcional, pero si aparece tiene que ir
           seguido de tres cifras. Sin exigirlo, «3000» se leía como «300»:
           el primer tramo tomaba tres dígitos y el grupo de millares quedaba
           vacío por ser opcional. */
        const num = '(\\d{1,3}(?:[.,]\\d{3})+|\\d+)';
        const clean = (s) => Number(String(s).replace(/[.,]/g, ''));

        let match = text.match(new RegExp(`entre\\s+${num}\\s*(?:y|a)\\s*${num}`));
        if (match) return { min_price: clean(match[1]), max_price: clean(match[2]) };

        match = text.match(new RegExp(`de\\s+${num}\\s+a\\s+${num}`));
        if (match) return { min_price: clean(match[1]), max_price: clean(match[2]) };

        match = text.match(new RegExp(`(?:menos de|hasta|maximo|max|bajo|no mas de)\\s*(?:s/)?\\s*${num}`));
        if (match) return { max_price: clean(match[1]) };

        // «tengo un presupuesto de 400 soles»: de las formas más naturales
        match = text.match(new RegExp(`presupuesto\\s+(?:de\\s+)?(?:s/)?\\s*${num}`));
        if (match) return { max_price: clean(match[1]) };

        match = text.match(new RegExp(`(?:mas de|desde|minimo|min|sobre)\\s*(?:s/)?\\s*${num}`));
        if (match) return { min_price: clean(match[1]) };

        // «barato» sin cifra: un techo prudente para lo que se pide en Arequipa.
        // Se admite el femenino porque la gente escribe «bicicleta barata».
        if (/\b(barat[oa]s?|economic[oa]s?|accesibles?|low cost)\b/.test(text)) {
            return { max_price: 500 };
        }

        return {};
    }

    /** Distrito mencionado, tolerando erratas y nombres compuestos. */
    function extractDistrict(text, tokens) {
        const districts = (global.DiscoverySeed && global.DiscoverySeed.DISTRICTS) || [];

        // Primero los nombres largos, que contienen a los cortos
        const sorted = [...districts].sort((a, b) => b.name.length - a.name.length);

        for (const district of sorted) {
            const name = normalize(district.name);
            if (text.includes(name)) return district.name;

            // Nombres de una sola palabra admiten errata
            if (!name.includes(' ') && fuzzyHas(tokens, name)) return district.name;
        }

        return null;
    }

    /**
     * Categoría deducida por sus marcas y palabras propias.
     *
     * Una coincidencia exacta pesa mucho más que una aproximada: «cámara» es
     * literal en «Cámaras», mientras que en «Moda» solo se parecía a «camisa»
     * por dos letras. Sin esa diferencia de peso, dos parecidos flojos ganaban
     * a un acierto exacto.
     */
    function extractCategory(rawTokens) {
        /* Las palabras con las que se habla DE la plataforma no son nombres de
           producto, y no deben votar una categoría. «correo» está a dos letras
           de «corral», así que «no me llega el correo» se clasificaba en Bebés
           y la respuesta sobre la cuenta no llegaba a darse. */
        const tokens = rawTokens.filter((token) => !FUNCTION_WORDS.has(token));

        /* Una coincidencia exacta debe poder más que varios parecidos sumados:
           «cámara» es literal en «Cámaras» y a la vez se parece a «camisa» y
           «cartera» de «Moda». Un parecido sobre una palabra larga vale más
           que sobre una corta, porque acertar seis letras seguidas por azar es
           mucho menos probable. */
        const EXACT = 10;
        const FUZZY_LONG = 2;
        const FUZZY_SHORT = 1;
        const THRESHOLD = 2;

        /* Lo que se nombra primero es lo que se busca; lo que viene después
           es el porqué. «Busco una refrigeradora, la necesito urgente porque
           tengo dos niños chiquitos» es un pedido de electrodomésticos, y se
           estaba clasificando en Bebés: «niños» votaba igual que
           «refrigeradora» pese a llegar doce palabras más tarde.

           Las seis primeras palabras valen el doble, por el mismo motivo por
           el que el revisor pesa doble el título. */
        const HEAD = 6;
        const weightAt = (index) => (index >= 0 && index < HEAD ? 2 : 1);

        let best = null;
        let bestScore = 0;

        Object.entries(BRANDS).forEach(([categoryId, words]) => {
            const score = words.reduce((sum, word) => {
                const target = normalize(word);
                const at = tokens.indexOf(target);

                if (at >= 0) return sum + EXACT * weightAt(at);
                if (!fuzzyHas(tokens, target)) return sum;
                return sum + (target.length >= 6 ? FUZZY_LONG : FUZZY_SHORT);
            }, 0);

            if (score > bestScore) {
                bestScore = score;
                best = categoryId;
            }
        });

        // Un único parecido sobre una palabra corta no basta
        return bestScore >= THRESHOLD ? best : null;
    }

    /**
     * Estado del artículo. Se comprueban primero las expresiones largas:
     * «como nueva» contiene «nueva», así que buscar el término corto antes
     * devolvía «Nuevo» para algo que es «Como nuevo».
     */
    function extractCondition(text) {
        const entries = Object.entries(CONDITIONS)
            .flatMap(([condition, words]) => words.map((word) => [condition, word]))
            .sort((a, b) => b[1].length - a[1].length);

        for (const [condition, word] of entries) {
            // El femenino es habitual: «como nueva», «usada». La sustitución
            // es global porque en «como nuevo» hay dos palabras que acaban
            // en «o» y solo interesa flexionar ambas.
            const pattern = new RegExp(`\\b${word.replace(/o\b/g, '[oa]')}s?\\b`);
            if (pattern.test(text)) return condition;
        }

        return null;
    }

    /** Palabras que describen el artículo, sin las de relleno. */
    const STOPWORDS = new Set([
        'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'por', 'favor', 'quiero',
        'busco', 'buscar', 'necesito', 'tienen', 'tienes', 'hay', 'venden', 'vendes', 'un',
        'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'de', 'del', 'en', 'con', 'para',
        'me', 'mi', 'que', 'algun', 'alguna', 'algo', 'y', 'o', 'a', 'es', 'esta', 'estan',
        'ver', 'muestrame', 'dame', 'gracias', 'porfa', 'estoy', 'ando', 'interesa', 'mas',
        'menos', 'barato', 'precio', 'soles', 'nuevo', 'usado', 'como', 'segunda', 'mano',
        'distrito', 'zona', 'cerca', 'disponible', 'informacion', 'info',
    ]);

    function extractQuery(tokens) {
        return tokens
            .filter((t) => !STOPWORDS.has(t))
            .filter((t) => !/^\d+$/.test(t))
            .join(' ')
            .trim();
    }

    /**
     * Lee un mensaje y devuelve todo lo que se ha podido entender de él.
     * @param {string} message
     */
    function understand(message) {
        const text = normalize(message);
        const tokens = tokenize(message);

        const district = extractDistrict(text, tokens);
        const condition = extractCondition(text);

        /* Lo que ya se entendió como filtro no debe quedarse además como
           texto libre: «qué hay en Cayma» buscaba la palabra «cayma» dentro
           de los títulos *y* filtraba por distrito, y la respuesta salía
           redundante («coinciden con «cayma» en Cayma»). */
        const consumed = new Set();
        if (district) tokenize(district).forEach((t) => consumed.add(t));
        if (condition) tokenize(condition).forEach((t) => consumed.add(t));

        const queryTokens = tokens.filter((t) => !consumed.has(t));

        return {
            text,
            tokens,
            intents: detectIntents(text, tokens),
            query: extractQuery(queryTokens),
            category: extractCategory(tokens),
            district,
            condition,
            ...extractPrice(text),
        };
    }

    /* ----------------------------------------------------------------------
       Búsqueda
       ---------------------------------------------------------------------- */

    /**
     * Busca en el tablón con lo entendido, aflojando los filtros si hace
     * falta: es preferible ofrecer algo cercano a decir «no hay nada».
     * @returns {Promise<{requests: Array, total: number, relaxed: boolean, filters: object}>}
     */
    async function search(understood) {
        const api = global.api;

        const base = {
            q: understood.query || undefined,
            category: understood.category || undefined,
            district: understood.district || undefined,
            condition: understood.condition || undefined,
            min_price: understood.min_price,
            max_price: understood.max_price,
            per_page: 6,
            sort: 'recent',
        };

        let data = await api.getRequests(base);

        // Sin resultados: se quita el término libre y se confía en la categoría
        if (!data.requests.length && base.q && base.category) {
            data = await api.getRequests({ ...base, q: undefined });
            if (data.requests.length) {
                return { ...data, total: data.pagination.total, relaxed: true, filters: { ...base, q: undefined } };
            }
        }

        // Sigue sin nada: se sueltan precio y distrito
        if (!data.requests.length && (base.min_price || base.max_price || base.district)) {
            const loose = { ...base, min_price: undefined, max_price: undefined, district: undefined };
            data = await api.getRequests(loose);
            if (data.requests.length) {
                return { ...data, total: data.pagination.total, relaxed: true, filters: loose };
            }
        }

        return {
            requests: data.requests,
            total: data.pagination.total,
            relaxed: false,
            filters: base,
        };
    }

    /** Enlace al feed con los mismos filtros, para «ver todos». */
    function feedLink(filters) {
        const params = new URLSearchParams();

        if (filters.q) params.set('q', filters.q);
        if (filters.category) params.set('category', filters.category);
        if (filters.district) params.set('district', filters.district);
        if (filters.condition) params.set('condition', filters.condition);
        if (filters.min_price) params.set('min_price', String(filters.min_price));
        if (filters.max_price) params.set('max_price', String(filters.max_price));

        const query = params.toString();
        return `index.html${query ? `?${query}` : ''}`;
    }

    /* ----------------------------------------------------------------------
       Respuestas

       El tono es el de alguien que atiende bien: reconoce lo que le pidieron,
       responde concreto y propone el siguiente paso. Nunca inventa: si no hay
       resultados lo dice y ofrece alternativas reales del tablón.
       ---------------------------------------------------------------------- */

    const money = (value) => (global.DS ? global.DS.format.money(value) : `S/ ${value}`);

    /** Describe en palabras lo que se está filtrando, para confirmarlo. */
    function describeFilters(u) {
        const parts = [];

        if (u.district) parts.push(`en ${u.district}`);
        if (u.condition) parts.push(`en estado «${u.condition.toLowerCase()}»`);

        if (u.min_price && u.max_price) parts.push(`entre ${money(u.min_price)} y ${money(u.max_price)}`);
        else if (u.max_price) parts.push(`por debajo de ${money(u.max_price)}`);
        else if (u.min_price) parts.push(`desde ${money(u.min_price)}`);

        return parts.join(', ');
    }

    /** Nombre legible de una categoría. */
    function categoryName(id) {
        const found = (global.DiscoverySeed && global.DiscoverySeed.CATEGORIES || [])
            .find((c) => c.id === id);
        return found ? found.name : null;
    }

    const ANSWERS = {
        saludo: [
            '¡Hola! Soy el asistente de DiscoveryShop. Dime qué buscas y te digo si alguien más lo está pidiendo, o te ayudo a publicarlo.',
            '¡Buenas! ¿Qué estás buscando hoy? Puedo filtrar por marca, presupuesto o distrito.',
        ],
        gracias: [
            'Con mucho gusto. Si necesitas otra cosa, aquí estoy.',
            'Un placer ayudarte. ¿Buscamos algo más?',
        ],
        despedida: [
            '¡Hasta pronto! Que encuentres justo lo que buscas.',
            'Nos vemos. Vuelve cuando quieras.',
        ],
    };

    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    /** Preguntas de seguimiento que tienen sentido según lo que se buscó. */
    function suggestionsFor(u, hasResults) {
        if (!hasResults) {
            return ['Ver todo el tablón', '¿Cómo publico un pedido?', 'Buscar en mi distrito'];
        }

        const out = [];
        if (!u.max_price) out.push('Solo los de menos de S/ 500');
        if (!u.district) out.push('¿Hay alguno en Cayma?');
        if (!u.condition) out.push('Prefiero los que estén como nuevos');
        out.push('Ver todos los resultados');

        return out.slice(0, 3);
    }

    /**
     * Responde a un mensaje.
     * @param {string} message
     * @returns {Promise<{text: string, requests: Array, link: string|null,
     *                    suggestions: string[], total: number}>}
     */
    async function respond(message) {
        const u = understand(message);
        const has = (intent) => u.intents.includes(intent);

        const empty = { requests: [], link: null, total: 0 };

        /* --- Cortesía: solo si no hay nada más que atender --- */
        const onlyCourtesy = u.intents.length > 0
            && u.intents.every((i) => ['saludo', 'gracias', 'despedida'].includes(i))
            && !u.category && !u.district && !u.min_price && !u.max_price;

        if (onlyCourtesy) {
            const kind = has('gracias') ? 'gracias' : has('despedida') ? 'despedida' : 'saludo';
            return {
                ...empty,
                text: pick(ANSWERS[kind]),
                suggestions: ['Busco un celular', '¿Qué hay en Cayma?', '¿Cómo funciona esto?'],
            };
        }

        /* --- Quejas y sospechas de fraude: antes que nada --- */
        if (has('soporte')) {
            return {
                ...empty,
                text: 'Siento que hayas pasado por eso. Si algo no cuadra, denúncialo desde el propio pedido —el botón está bajo la publicación, en «Denunciar»— y el equipo lo revisa. Recuerda que DiscoveryShop no cobra ni gestiona pagos: nadie de la plataforma te va a pedir dinero por adelantado.',
                link: 'index.html',
                linkLabel: 'Ir al tablón',
                suggestions: ['¿Cómo denuncio un pedido?', '¿Cómo funciona?', 'Ver mis mensajes'],
            };
        }

        /* Una queja trae siempre texto libre —«este asistente es una
           porquería»— así que exigir que no lo hubiera equivalía a no atender
           ninguna: se iban a buscar esas palabras al tablón y la respuesta era
           «nadie está pidiendo eso, ¿quieres publicarlo?». */
        if (has('queja') && !u.category) {
            return {
                ...empty,
                text: 'Lamento no haberte servido de ayuda. Dime con tus palabras qué necesitas —qué buscas, en qué distrito y hasta cuánto— y lo intento otra vez. Si prefieres verlo tú mismo, el tablón está completo y se puede filtrar.',
                link: 'index.html',
                linkLabel: 'Ver el tablón',
                suggestions: ['Busco un celular', '¿Cómo funciona?', '¿Cómo publico un pedido?'],
            };
        }

        /* --- Cuántos pedidos y cuánto duran --- */
        if (has('vigencia')) {
            return {
                ...empty,
                text: 'Dos reglas mantienen el tablón limpio: puedes tener cinco pedidos abiertos a la vez, y cada pedido vive quince días hábiles. Pasado ese plazo se retira solo, para que nadie pierda el tiempo respondiendo a algo que ya no buscas. Cuando cierras o eliminas uno, recuperas el sitio para pedir otra cosa.',
                link: 'perfil.html#pedidos',
                linkLabel: 'Ver mis pedidos',
                suggestions: ['¿Cómo publico un pedido?', '¿Es gratis?', 'Ver el tablón'],
            };
        }

        /* --- Cómo publicar --- */
        if (has('publicar') && !u.category) {
            return {
                ...empty,
                text: 'Publicar un pedido no necesita permiso: con una cuenta basta. Cuentas qué buscas, hasta cuánto quieres gastar y en qué distrito estás, y los vendedores de Arequipa te responden con lo que tengan. Lo que sí pasa por revisión del equipo es la cuenta de vendedor, que es la que permite responder pedidos ajenos con una oferta.',
                link: 'publicar.html',
                linkLabel: 'Publicar un pedido',
                suggestions: ['¿Cuántos pedidos puedo tener?', '¿Es gratis?', '¿Cómo respondo un pedido?'],
            };
        }

        /* --- Ofertas: la otra mitad del modelo --- */
        if (has('oferta') && !u.category) {
            return {
                ...empty,
                text: 'Las ofertas son la respuesta a un pedido. Abres el pedido que te interesa y, si tienes una cuenta de vendedor aprobada, usas «Lo tengo» para responder con tu precio, un mensaje y fotos. Quien pidió recibe el aviso, compara las respuestas y acepta una: ahí se abre la conversación privada entre ustedes dos.',
                link: 'index.html',
                linkLabel: 'Ver pedidos abiertos',
                suggestions: ['¿Cómo pido la cuenta de vendedor?', '¿Dónde veo mis mensajes?', '¿Es gratis?'],
            };
        }

        /* --- Qué cuesta usar esto --- */
        const asksAboutCost = /\b(gratis|comision|cobran|cobras|cobra|pagar|pago|cuesta|cuestan|comisión)\b/
            .test(normalize(message));
        if (has('precio') && asksAboutCost && !u.category && !u.max_price && !u.min_price) {
            return {
                ...empty,
                text: 'Usar DiscoveryShop es gratis: no cobramos comisión ni se paga nada dentro de la plataforma. Lo que pones al publicar es tu presupuesto —hasta cuánto quieres gastar—, y cada vendedor te responde con su precio. El dinero se acuerda y se entrega directamente entre ustedes.',
                link: 'publicar.html',
                linkLabel: 'Publicar un pedido',
                suggestions: ['¿Cómo publico un pedido?', '¿Cuánto dura mi pedido?', 'Ver el tablón'],
            };
        }

        /* --- Dónde se habla --- */
        if (has('contacto') && !u.category) {
            return {
                ...empty,
                text: 'La conversación privada se abre cuando aceptas una oferta, no antes: así nadie escribe hasta que hay un trato en marcha. Todos tus hilos están en Mensajes, y desde ahí coordinas dónde y cuándo se encuentran.',
                link: 'mensajes.html',
                linkLabel: 'Abrir Mensajes',
                suggestions: ['¿Cómo acepto una oferta?', '¿Cómo funciona?', 'Ver el tablón'],
            };
        }

        /* --- Ubicación sin artículo concreto --- */
        if (has('ubicacion') && !u.category) {
            return {
                ...empty,
                text: u.district
                    ? `En el mapa puedes ver los vendedores verificados que responden pedidos en ${u.district} y en los demás distritos de Arequipa.`
                    : 'Tenemos un mapa con los vendedores verificados que responden pedidos, repartidos por los 18 distritos de Arequipa. Puedes filtrarlo por distrito y por categoría.',
                link: u.district ? `mapa.html?district=${encodeURIComponent(u.district)}` : 'mapa.html',
                linkLabel: 'Abrir el mapa',
                suggestions: ['Busco un celular', '¿Qué hay en Yanahuara?', '¿Dónde veo mis mensajes?'],
            };
        }

        /* --- Cuenta y verificación --- */
        if (has('cuenta') && !u.category) {
            return {
                ...empty,
                text: 'Al crear tu cuenta dices si además quieres vender. Con cualquier cuenta ya puedes publicar pedidos, marcar «También lo busco», guardar, comentar y conversar cuando aceptes una oferta. La cuenta de vendedor pasa por una revisión del equipo, y lo que habilita es responder pedidos ajenos con tus ofertas.',
                link: 'registro.html',
                linkLabel: 'Crear cuenta',
                suggestions: ['¿Cómo publico un pedido?', 'Ver el tablón', '¿Dónde veo mis guardados?'],
            };
        }

        /* --- Cómo funciona --- */
        if (has('ayuda') && !u.category) {
            return {
                ...empty,
                text: 'DiscoveryShop funciona al revés que el comercio de siempre: aquí publicas lo que BUSCAS —con tu presupuesto, el estado en que lo aceptas y tu distrito— y los vendedores de Arequipa que lo tengan te responden con una oferta. Comparas, aceptas la que prefieras, se abre la conversación privada y quedan para verse. No se paga nada por la plataforma.',
                link: 'index.html',
                linkLabel: 'Ver el tablón',
                suggestions: ['¿Cómo publico un pedido?', '¿Es gratis?', 'Ver el mapa de vendedores'],
            };
        }

        /* --- Nada que buscar --- */
        if (!u.query && !u.category && !u.district && !u.min_price && !u.max_price) {
            return {
                ...empty,
                text: 'Cuéntame qué necesitas y lo busco en el tablón. Puedes decirlo con tus palabras: «un iPhone por menos de 2000», «laptop en Cerro Colorado» o «algo de gaming como nuevo».',
                suggestions: ['Busco un iPhone', 'Laptop hasta S/ 3000', '¿Qué hay en Cayma?'],
            };
        }

        /* --- Búsqueda en el tablón --- */
        let result;
        try {
            result = await search(u);
        } catch (error) {
            return {
                ...empty,
                text: 'Tuve un problema al consultar el tablón. ¿Lo intentamos otra vez?',
                suggestions: ['Reintentar', 'Ver todo el tablón'],
            };
        }

        const link = feedLink(result.filters);
        const detail = describeFilters(u);
        const cat = categoryName(u.category);

        if (!result.requests.length) {
            const what = u.query || (cat ? cat.toLowerCase() : 'eso');
            return {
                ...empty,
                text: `Nadie está pidiendo ${what}${detail ? ` ${detail}` : ''} ahora mismo. Serías la primera persona: publícalo y los vendedores de Arequipa lo verán. ¿O prefieres que busque algo parecido?`,
                link: 'publicar.html',
                linkLabel: 'Pedir lo que busco',
                suggestions: suggestionsFor(u, false),
            };
        }

        const n = result.total;
        const plural = n === 1 ? 'pedido' : 'pedidos';
        const people = n === 1 ? 'Otra persona está buscando' : `Otras ${n} personas están buscando`;
        const open = n === 1 ? 'Ábrelo' : 'Ábrelos';
        const what = u.query ? `«${u.query}»` : (cat ? cat.toLowerCase() : 'lo mismo que tú');

        let text;
        if (result.relaxed) {
            text = `Eso exacto no lo pide nadie, pero hay ${n} ${plural} parecidos. Si alguno es lo mismo que buscas, marca «También lo busco»: cuanta más gente lo pida, más motivos tiene un vendedor para responder.`;
        } else {
            text = `${people} ${what}${detail ? ` ${detail}` : ''}. ${open} para sumarte con «También lo busco», o publica el tuyo si lo quieres con otras condiciones.`;
        }

        return {
            text,
            requests: result.requests,
            total: n,
            link,
            linkLabel: n > result.requests.length ? `Ver los ${n} pedidos` : 'Ver en el tablón',
            suggestions: suggestionsFor(u, true),
        };
    }

    /* ----------------------------------------------------------------------
       Ayuda para redactar un pedido

       En el comercio inverso lo difícil no es buscar, es explicar qué buscas.
       Quien llega escribe «una lámpara vintage dorada» y se encuentra seis
       campos vacíos. Esto convierte esa frase en un borrador: título,
       categoría, icono, hasta dónde cede y un esqueleto de descripción con
       las preguntas que un vendedor va a hacer de todos modos.
       ---------------------------------------------------------------------- */

    /** Lo que un vendedor necesita saber, por categoría, para poder ofrecer. */
    const ASK_BY_CATEGORY = {
        'cat-celulares': ['capacidad', 'si lo quieres liberado', 'estado de la batería'],
        'cat-computo': ['para qué lo vas a usar', 'memoria y almacenamiento', 'si necesitas cargador'],
        'cat-audio': ['con cable o inalámbrico', 'si necesitas estuche'],
        'cat-gaming': ['qué accesorios te hacen falta', 'si quieres juegos incluidos'],
        'cat-camaras': ['si necesitas lente', 'cuántos disparos aceptas'],
        'cat-hogar': ['medidas o capacidad', 'color', 'si lo recoges tú'],
        'cat-moda': ['talla', 'color'],
        'cat-deportes': ['talla o medida', 'para qué uso'],
        'cat-instrumentos': ['si eres principiante', 'si necesitas funda'],
        'cat-libros': ['edición o año', 'si aceptas subrayados'],
        'cat-bebes': ['edad del niño o niña', 'si necesitas que esté lavado'],
        'cat-vehiculos': ['medida', 'año', 'si tiene papeles en regla'],
    };

    const GENERIC_ASKS = ['para cuándo lo necesitas', 'en qué distrito te viene bien recogerlo'];

    /* Con lo que la gente abre una petición en Arequipa. Va del más largo al
       más corto para que «me hace falta» no lo corte antes «me». */
    const ASKING_VERBS = [
        'me gustaría conseguir', 'me gustaría encontrar', 'ando buscando',
        'estoy buscando', 'me hace falta', 'me gustaría', 'quién tiene',
        'quien tiene', 'alguien tiene', 'necesitaría', 'hace falta',
        'quisiera', 'querría', 'necesito', 'busco', 'buscando', 'buscar',
        'quiero', 'ocupo', 'preciso',
    ];

    /* Y con lo que la continúan: «quiero comprar», «busco conseguir». */
    const ASKING_TAILS = ['comprar', 'conseguir', 'encontrar', 'adquirir', 'que me vendan'];

    /* Cláusulas de dinero. Todas piden o una palabra de cantidad o «soles»,
       para que «rodado 26» y «para 6 personas» sobrevivan intactos. */
    const PRICE_CLAUSES = [
        /\b(entre|de)\s+s?\/?\s*\d[\d.,]*\s*(soles)?\s+(y|a)\s+s?\/?\s*\d[\d.,]*\s*(soles)?/gi,
        /\b(por|de)?\s*menos de\s+s?\/?\s*\d[\d.,]*\s*(soles)?/gi,
        /\b(hasta|máximo|maximo|desde|sobre|como)\s+(de\s+)?s?\/?\s*\d[\d.,]*\s*(soles)?/gi,
        /\b(unos|unas|como)?\s*s\/\s*\d[\d.,]*/gi,
        /\b\d[\d.,]*\s*soles\b/gi,
        /\bpresupuesto\s+de\s+[^,.;]*/gi,
    ];

    /** Quita `needle` y la preposición que lo introduce, sin distinguir tildes de caja. */
    function stripPhrase(text, needle) {
        if (!needle) return text;

        const lower = text.toLowerCase();
        const at = lower.indexOf(needle.toLowerCase());
        if (at === -1) return text;

        let from = at;
        for (const preposition of ['por ', 'en ', 'zona ', 'de ', 'para ']) {
            const start = at - preposition.length;
            if (start >= 0 && lower.slice(start, at) === preposition) { from = start; break; }
        }

        return `${text.slice(0, from)} ${text.slice(at + needle.length)}`;
    }

    /** Deja solo la cosa que se busca: sin verbo, sin precio y sin distrito. */
    function subjectFrom(message, understood) {
        let base = String(message || '').replace(/\s+/g, ' ').trim();
        if (!base) return String(understood.query || '').trim();

        base = base.replace(/^\s*hola[,!.\s]+/i, '');

        // El verbo con el que se pide, y el infinitivo que lo acompaña
        const lower = base.toLowerCase();
        const verb = ASKING_VERBS.find((v) => lower.startsWith(`${v} `));
        if (verb) base = base.slice(verb.length).trim();

        const tail = ASKING_TAILS.find((t) => base.toLowerCase().startsWith(`${t} `));
        if (tail) base = base.slice(tail.length).trim();

        PRICE_CLAUSES.forEach((clause) => { base = base.replace(clause, ' '); });
        base = stripPhrase(base, understood.district);

        return base
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.;:])/g, '$1')
            /* La conjunción suelta del final se va, pero exigiendo el espacio
               que la separa: sin él, «en buen estado» perdía su última «o». */
            .replace(/\s+(y|o|que|de|en|con|para)\s*$/i, '')
            .replace(/[\s,;:.¿?¡!]+$/, '')
            .trim();
    }

    /** Título en condiciones: el asunto sin su artículo, que en un tablón sobra. */
    function titleFrom(message, understood) {
        const subject = subjectFrom(message, understood);
        if (!subject) return '';

        const naked = subject.replace(/^(un|una|unos|unas|el|la|los|las)\s+/i, '');

        /* Quitar el precio y el distrito de la frase deja cicatrices: comas
           pegadas —«laptop para la universidad,, que tenga ssd»— y palabras
           sueltas que introducían lo que ya no está —«celular liberado,
           estoy»—. Se cosen antes de cortar. */
        const healed = naked
            .replace(/\s*,\s*(?=,)/g, '')
            .replace(/,\s*,+/g, ',')
            .replace(/\s{2,}/g, ' ')
            .trim();

        /* Un título es lo que se busca, no la frase entera. Se corta en la
           primera coma cuando lo de después es una explicación y no parte del
           objeto: «Refrigeradora» es mejor título que «Refrigeradora, la
           necesito urgente porque la mía se malogró y tengo dos niños
           chiquitos», pero «Mesa, 4 sillas» tiene que quedarse entera.

           La diferencia está en la cola: una explicación es larga; lo que
           completa al objeto, corto. Y en la cabeza: tres palabras ya
           describen bastante como para no necesitar más. */
        const comma = healed.indexOf(',');
        const head = comma > 0 ? healed.slice(0, comma).trim() : healed;
        const tail = comma > 0 ? healed.slice(comma + 1).trim() : '';

        const words = head.split(/\s+/).filter(Boolean);
        const solid = words.some((w) => w.length >= 4);
        const cutHere = solid && (tail.length > 20 || words.length >= 3);

        const cut = (cutHere ? head : healed).slice(0, 90)
            .replace(/\s+(y|o|que|de|en|con|para|unos|unas)\s*$/i, '')
            .replace(/[.,;:\s]+$/, '');

        return cut.charAt(0).toUpperCase() + cut.slice(1);
    }

    /**
     * Convierte una frase suelta en un borrador de pedido.
     *
     * No inventa presupuesto: eso lo pone quien llama, con lo que de verdad
     * han pedido otros en esa categoría. Aquí solo se lee la frase.
     *
     * @param {string} message
     * @returns {{title: string, category_id: string, emoji: string,
     *            condition: string, district: string, description: string,
     *            asks: string[], understood: object}}
     */

    /* ======================================================================
       El presupuesto que la persona ya dijo

       `PRICE_CLAUSES` sabía QUITAR el precio del título —«busco laptop hasta
       1500 soles» tiene que titularse «laptop»— pero el número se tiraba a la
       basura, y luego se le preguntaba a la persona por un dato que acababa de
       escribir. Aquí se recoge antes de descartarlo.
       ====================================================================== */

    /** Un número en soles, con o sin separadores: «1500», «1.500», «1,500». */
    const toAmount = (text) => {
        const digits = String(text || '').replace(/[^\d]/g, '');
        const value = Number(digits);
        return Number.isFinite(value) && value > 0 ? value : null;
    };

    /**
     * Qué presupuesto se deduce de la frase.
     * @returns {{min: number, max: number}|null}
     */
    function budgetFrom(message) {
        const text = String(message || '');

        /* El orden va de la forma más explícita a la más vaga: «entre 300 y
           500» dice las dos puntas, «hasta 500» solo el techo, y «500 soles»
           a secas es un techo aproximado, no una cifra exacta. */

        const range = text.match(/\b(?:entre|de)\s+s?\/?\s*(\d[\d.,]*)\s*(?:soles)?\s+(?:y|a)\s+s?\/?\s*(\d[\d.,]*)/i);
        if (range) {
            const min = toAmount(range[1]);
            const max = toAmount(range[2]);
            if (min && max) return { min: Math.min(min, max), max: Math.max(min, max) };
        }

        const ceiling = text.match(/\b(?:hasta|m[áa]ximo|menos de|no m[áa]s de|tope de)\s+(?:de\s+)?s?\/?\s*(\d[\d.,]*)/i);
        if (ceiling) {
            const max = toAmount(ceiling[1]);
            if (max) return { min: 0, max };
        }

        const floor = text.match(/\b(?:desde|a partir de|m[íi]nimo)\s+(?:de\s+)?s?\/?\s*(\d[\d.,]*)/i);
        if (floor) {
            const min = toAmount(floor[1]);
            if (min) return { min, max: 0 };
        }

        /* Una cifra suelta con «soles» o con «S/» delante. Se toma como techo
           y se abre un margen del 20 % por debajo: quien dice «unos 500» no
           quiere decir 500 exactos, quiere decir por ahí. */
        const loose = text.match(/(?:s\/\s*(\d[\d.,]*)|(\d[\d.,]*)\s*soles)/i);
        if (loose) {
            const amount = toAmount(loose[1] || loose[2]);
            if (amount) {
                /* El aproximador tiene que ir pegado a la cifra. Suelto vale
                   para cualquier cosa: en «quiero unos audífonos, S/ 250» el
                   «unos» es el artículo de los audífonos, y tomarlo por una
                   aproximación convertía un tope exacto de 250 en una
                   horquilla de 200 a 300 que nadie había pedido. */
                const vague = /\b(unos|unas|como|aprox\w*|alrededor de|m[áa]s o menos)\s+(?:s\/\s*)?\d/i
                    .test(text);
                return vague
                    ? { min: Math.round(amount * 0.8), max: Math.round(amount * 1.2) }
                    : { min: 0, max: amount };
            }
        }

        return null;
    }
    function draftRequest(message) {
        const understood = understand(message);
        const categoryId = understood.category || '';

        const category = (global.DiscoverySeed && global.DiscoverySeed.CATEGORIES || [])
            .find((c) => c.id === categoryId);

        /* Lo que el buscador entiende como «condición del artículo» aquí
           significa otra cosa: hasta dónde cede quien pide. */
        const condition = {
            'Nuevo': 'Solo nuevo',
            'Como nuevo': 'Como nuevo o mejor',
            'Buen estado': 'Cualquiera que funcione',
        }[understood.condition] || 'Cualquiera que funcione';

        const asks = [...(ASK_BY_CATEGORY[categoryId] || []), ...GENERIC_ASKS].slice(0, 4);
        const title = titleFrom(message, understood);
        const subject = subjectFrom(message, understood);

        const budget = budgetFrom(message);

        /* Lo que la persona escribió va primero y entero.

           Antes se reconstruía la frase desde cero a partir de lo entendido, y
           el matiz se perdía por el camino: «la necesito para el trabajo, ya se
           me rompió dos veces la anterior» se convertía en «Busco una laptop.».
           Organizar lo que alguien dice no es sustituirlo — y ese matiz es justo
           lo que hace que un vendedor sepa si puede ayudar.

           Se conserva salvo cuando no añade nada sobre el título: si toda la
           frase era «busco una laptop», repetirla como descripción es ruido. */
        const own = ownWords(message, subject);

        const description = [
            own || (subject ? `Busco ${subject.charAt(0).toLowerCase()}${subject.slice(1)}.` : ''),
            understood.district ? `Estoy por ${understood.district}.` : '',
            budget ? budgetSentence(budget) : '',
            asks.length ? `Detalles que importan: ${asks.join(', ')}.` : '',
        ].filter(Boolean).join(' ');

        return {
            title,
            category_id: categoryId,
            emoji: category ? category.icon : '',
            condition,
            district: understood.district || '',
            description,
            budget_min: budget ? budget.min : 0,
            budget_max: budget ? budget.max : 0,
            asks,
            understood,
        };
    }

    /** Cómo se cuenta un presupuesto en una descripción. */
    function budgetSentence({ min, max }) {
        if (min && max) return `Mi presupuesto está entre S/ ${min} y S/ ${max}.`;
        if (max) return `Puedo gastar hasta S/ ${max}.`;
        if (min) return `Cuento con al menos S/ ${min}.`;
        return '';
    }

    /**
     * La frase de la persona, lista para usarse como descripción.
     *
     * Devuelve cadena vacía cuando no aporta nada que el título no diga ya:
     * una descripción que repite el título palabra por palabra es peor que
     * ninguna, porque ocupa el sitio de lo que sí habría que contar.
     */
    function ownWords(message, subject) {
        let text = String(message || '').replace(/\s+/g, ' ').trim();
        if (!text) return '';

        text = text.replace(/^\s*hola[,!.\s]+/i, '');

        // Poco más que el título: no hay nada que conservar
        const extra = text.length - String(subject || '').length;
        if (extra < 12) return '';

        text = text.charAt(0).toUpperCase() + text.slice(1);
        return /[.!?]$/.test(text) ? text : `${text}.`;
    }

    /**
     * Horquilla de presupuesto sugerida a partir de lo que otros han pedido
     * en la misma categoría. Es un dato real, no una corazonada: si no hay
     * con qué compararlo, no se sugiere nada.
     *
     * @param {Array<{budget_min: number, budget_max: number}>} requests
     * @returns {{min: number, max: number, sample: number}|null}
     */
    function suggestBudget(requests) {
        const values = (requests || [])
            .filter((r) => Number(r.budget_min) > 0 || Number(r.budget_max) > 0)
            .map((r) => ({ min: Number(r.budget_min) || 0, max: Number(r.budget_max) || 0 }));

        if (values.length < 3) return null;

        const median = (list) => {
            const sorted = [...list].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
        };

        const min = median(values.map((v) => v.min).filter(Boolean));
        const max = median(values.map((v) => v.max).filter(Boolean));

        if (!min && !max) return null;

        return { min: min || 0, max: max || min, sample: values.length };
    }

    global.DiscoveryAssistant = {
        normalize,
        tokenize,
        editDistance,
        fuzzyHas,
        understand,
        search,
        respond,
        feedLink,
        draftRequest,
        suggestBudget,
        BRANDS,
        INTENTS,
    };
})(window);
