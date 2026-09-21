/**
 * DiscoveryShop · Asistente
 *
 * Motor de comprensión propio de la plataforma. No llama a ningún servicio
 * externo ni necesita claves: todo el razonamiento ocurre en el navegador,
 * sobre el catálogo real de DiscoveryShop.
 *
 * Funciona en cuatro pasos:
 *   1. Normaliza el mensaje (minúsculas, sin tildes, signos aparte).
 *   2. Deduce la intención: buscar, preguntar el precio, ubicar, publicar…
 *   3. Extrae lo concreto: marca, categoría, distrito, rango de precio, estado.
 *   4. Consulta el catálogo y redacta una respuesta con los resultados reales.
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

    /** ¿Alguna palabra del mensaje se parece lo suficiente a `target`? */
    function fuzzyHas(tokens, target) {
        const goal = normalize(target);
        if (!goal) return false;

        return tokens.some((token) => {
            if (token === goal) return true;
            // Un término largo contenido cuenta: «iphone15» contiene «iphone»
            if (goal.length >= 4 && token.includes(goal)) return true;
            if (token.length >= 4 && goal.includes(token)) return true;
            return editDistance(token, goal, tolerance(goal)) <= tolerance(goal);
        });
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
            'lavadora', 'ventilador'],
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
        saludo: ['hola', 'buenas', 'buenos', 'hey', 'saludos', 'que tal', 'holi', 'alo'],
        despedida: ['chau', 'adios', 'bye', 'hasta luego', 'nos vemos'],
        gracias: ['gracias', 'grax', 'thanks', 'genial', 'perfecto', 'excelente'],
        buscar: ['quiero', 'busco', 'buscar', 'necesito', 'tienen', 'tienes', 'hay', 'venden',
            'vendes', 'consigo', 'encuentro', 'muestrame', 'muestra', 'dame', 'ver',
            'estoy buscando', 'me interesa', 'ando buscando'],
        precio: ['precio', 'cuesta', 'cuanto', 'vale', 'barato', 'economico', 'presupuesto',
            'menos de', 'hasta', 'maximo', 'rango'],
        publicar: ['publicar', 'vender', 'subir', 'anunciar', 'ofrecer', 'quiero vender',
            'como vendo', 'como publico'],
        cuenta: ['registrar', 'registro', 'cuenta', 'sesion', 'ingresar', 'entrar',
            'contraseña', 'vendedor', 'aprobar', 'verificado'],
        ayuda: ['ayuda', 'como funciona', 'que es', 'explicame', 'no entiendo', 'ayudame',
            'como hago', 'funciona'],
        ubicacion: ['distrito', 'zona', 'donde', 'cerca', 'ubicacion', 'mapa', 'queda'],
        contacto: ['contactar', 'escribir', 'mensaje', 'hablar', 'comunicar', 'chat'],
    };

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
                phrase.includes(' ') ? text.includes(phrase) : fuzzyHas(tokens, phrase)
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

        match = text.match(new RegExp(`(?:mas de|desde|minimo|min|sobre)\\s*(?:s/)?\\s*${num}`));
        if (match) return { min_price: clean(match[1]) };

        // «barato» sin cifra: un techo prudente para el catálogo de Arequipa.
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
    function extractCategory(tokens) {
        /* Una coincidencia exacta debe poder más que varios parecidos sumados:
           «cámara» es literal en «Cámaras» y a la vez se parece a «camisa» y
           «cartera» de «Moda». Un parecido sobre una palabra larga vale más
           que sobre una corta, porque acertar seis letras seguidas por azar es
           mucho menos probable. */
        const EXACT = 10;
        const FUZZY_LONG = 2;
        const FUZZY_SHORT = 1;
        const THRESHOLD = 2;

        let best = null;
        let bestScore = 0;

        Object.entries(BRANDS).forEach(([categoryId, words]) => {
            const score = words.reduce((sum, word) => {
                const target = normalize(word);
                if (tokens.includes(target)) return sum + EXACT;
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
     * Busca en el catálogo con lo entendido, aflojando los filtros si hace
     * falta: es preferible ofrecer algo cercano a decir «no hay nada».
     * @returns {Promise<{posts: Array, total: number, relaxed: boolean, filters: object}>}
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

        let data = await api.getPosts(base);

        // Sin resultados: se quita el término libre y se confía en la categoría
        if (!data.posts.length && base.q && base.category) {
            data = await api.getPosts({ ...base, q: undefined });
            if (data.posts.length) {
                return { ...data, total: data.pagination.total, relaxed: true, filters: { ...base, q: undefined } };
            }
        }

        // Sigue sin nada: se sueltan precio y distrito
        if (!data.posts.length && (base.min_price || base.max_price || base.district)) {
            const loose = { ...base, min_price: undefined, max_price: undefined, district: undefined };
            data = await api.getPosts(loose);
            if (data.posts.length) {
                return { ...data, total: data.pagination.total, relaxed: true, filters: loose };
            }
        }

        return {
            posts: data.posts,
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
       resultados lo dice y ofrece alternativas reales del catálogo.
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
            '¡Hola! Soy el asistente de DiscoveryShop. Dime qué artículo buscas y lo rastreo en el foro por ti.',
            '¡Buenas! ¿Qué estás buscando hoy? Puedo filtrar por marca, precio o distrito.',
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
            return ['Ver todo el catálogo', '¿Cómo publico un artículo?', 'Buscar en mi distrito'];
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
     * @returns {Promise<{text: string, posts: Array, link: string|null,
     *                    suggestions: string[], total: number}>}
     */
    async function respond(message) {
        const u = understand(message);
        const has = (intent) => u.intents.includes(intent);

        const empty = { posts: [], link: null, total: 0 };

        /* --- Cortesía: solo si no hay nada más que atender --- */
        const onlyCourtesy = u.intents.length > 0
            && u.intents.every((i) => ['saludo', 'gracias', 'despedida'].includes(i))
            && !u.query && !u.category;

        if (onlyCourtesy) {
            const kind = has('gracias') ? 'gracias' : has('despedida') ? 'despedida' : 'saludo';
            return {
                ...empty,
                text: pick(ANSWERS[kind]),
                suggestions: ['Busco un celular', '¿Qué hay en Cayma?', '¿Cómo funciona el foro?'],
            };
        }

        /* --- Cómo publicar --- */
        if (has('publicar') && !u.category) {
            return {
                ...empty,
                text: 'Para publicar necesitas una cuenta de vendedor aprobada. Al registrarte eliges «Quiero vender» y el equipo revisa tu solicitud; mientras tanto puedes usar el foro con normalidad. Una vez aprobada, publicas desde el botón «Publicar».',
                link: 'publicar.html',
                linkLabel: 'Ir a publicar',
                suggestions: ['¿Cómo me registro?', 'Ver publicaciones', '¿Cuánto cobran?'],
            };
        }

        /* --- Ubicación sin artículo concreto --- */
        if (has('ubicacion') && !u.category) {
            return {
                ...empty,
                text: u.district
                    ? `En el mapa puedes ver a todos los vendedores verificados de ${u.district} y de los demás distritos de Arequipa.`
                    : 'Tenemos un mapa con todos los vendedores verificados, repartidos por los 18 distritos de Arequipa. Puedes filtrarlo por distrito y por categoría.',
                link: u.district ? `mapa.html?district=${encodeURIComponent(u.district)}` : 'mapa.html',
                linkLabel: 'Abrir el mapa',
                suggestions: ['Busco un celular', '¿Qué hay en Yanahuara?', '¿Cómo contacto al vendedor?'],
            };
        }

        /* --- Cuenta y verificación --- */
        if (has('cuenta') && !u.category) {
            return {
                ...empty,
                text: 'Al crear tu cuenta eliges si entras como comprador o como vendedor. La de comprador se activa al instante: puedes reaccionar, guardar, comentar y escribir por privado. La de vendedor pasa por una revisión antes de poder publicar.',
                link: 'registro.html',
                linkLabel: 'Crear cuenta',
                suggestions: ['¿Cómo publico?', 'Ver el foro', '¿Dónde veo mis guardados?'],
            };
        }

        /* --- Cómo funciona --- */
        if (has('ayuda') && !u.category) {
            return {
                ...empty,
                text: 'DiscoveryShop es un foro de artículos de segunda mano de Arequipa. Aquí no se vende ni se paga nada por la plataforma: alguien publica lo que ya no usa, la gente reacciona y comenta, y el trato se cierra por mensaje directo entre ustedes.',
                link: 'index.html',
                linkLabel: 'Ver el foro',
                suggestions: ['Busco un celular', '¿Cómo publico?', 'Ver el mapa de vendedores'],
            };
        }

        /* --- Nada que buscar --- */
        if (!u.query && !u.category && !u.district && !u.min_price && !u.max_price) {
            return {
                ...empty,
                text: 'Cuéntame qué artículo necesitas y lo busco. Puedes decirlo con tus palabras: «un iPhone por menos de 2000», «laptop en Cerro Colorado» o «algo de gaming como nuevo».',
                suggestions: ['Busco un iPhone', 'Laptop hasta S/ 3000', '¿Qué hay en Cayma?'],
            };
        }

        /* --- Búsqueda en el catálogo --- */
        let result;
        try {
            result = await search(u);
        } catch (error) {
            return {
                ...empty,
                text: 'Tuve un problema al consultar el catálogo. ¿Lo intentamos otra vez?',
                suggestions: ['Reintentar', 'Ver todo el catálogo'],
            };
        }

        const link = feedLink(result.filters);
        const detail = describeFilters(u);
        const cat = categoryName(u.category);

        if (!result.posts.length) {
            const what = u.query || (cat ? cat.toLowerCase() : 'eso');
            return {
                ...empty,
                text: `Por ahora no hay publicaciones de ${what}${detail ? ` ${detail}` : ''}. El foro cambia a diario, así que vale la pena volver a mirar. ¿Quieres que busque algo parecido?`,
                link: 'index.html',
                linkLabel: 'Ver todo el catálogo',
                suggestions: suggestionsFor(u, false),
            };
        }

        const n = result.total;
        const plural = n === 1 ? 'publicación' : 'publicaciones';
        const what = u.query ? `«${u.query}»` : (cat ? cat.toLowerCase() : 'tu búsqueda');

        let text;
        if (result.relaxed) {
            text = `No encontré exactamente eso, pero sí ${n} ${plural} parecidas. Échales un vistazo: si alguna te sirve, haz clic para ver la información del vendedor.`;
        } else {
            text = `Sí, tenemos ${n} ${plural} que ${n === 1 ? 'coincide' : 'coinciden'} con ${what}${detail ? ` ${detail}` : ''}. Haz clic en la que te interese para ver la información del vendedor y escribirle.`;
        }

        return {
            text,
            posts: result.posts,
            total: n,
            link,
            linkLabel: n > result.posts.length ? `Ver las ${n} publicaciones` : 'Ver en el foro',
            suggestions: suggestionsFor(u, true),
        };
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
        BRANDS,
        INTENTS,
    };
})(window);
