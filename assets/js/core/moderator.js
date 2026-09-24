/**
 * DiscoveryShop · Revisor de publicaciones
 *
 * IA propia de la plataforma que decide si un pedido pertenece al tablón.
 * No consulta ningún servicio externo: razona sobre el vocabulario de las
 * propias categorías, que es exactamente el dominio que debe vigilar.
 *
 * Decide entre tres salidas, no dos:
 *   · aprobada  — encaja claramente con lo que se publica aquí
 *   · rechazada — es claramente de otra cosa, con el motivo concreto
 *   · pendiente — no está claro, y entonces decide una persona
 *
 * Esa tercera salida es deliberada. Un revisor automático que siempre elige
 * se equivoca con seguridad; uno que sabe dudar deja el caso difícil a quien
 * puede juzgarlo. Vale más una cola corta de dudas que un rechazo injusto.
 */
(function (global) {
    'use strict';

    /* ----------------------------------------------------------------------
       Vocabulario
       ---------------------------------------------------------------------- */

    const normalize = (text) => String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    /** Lo que sí se pide aquí, agrupado por categoría. */
    const ALLOWED = {
        'cat-celulares': ['celular', 'telefono', 'movil', 'smartphone', 'iphone', 'samsung',
            'xiaomi', 'redmi', 'huawei', 'motorola', 'oppo', 'realme', 'galaxy', 'pixel',
            'android', 'ios', 'liberado', 'chip', 'dual sim'],
        'cat-computo': ['laptop', 'portatil', 'notebook', 'computadora', 'pc', 'macbook',
            'monitor', 'pantalla', 'teclado', 'mouse', 'tablet', 'ipad', 'impresora',
            'procesador', 'ram', 'ssd', 'disco', 'grafica', 'gpu', 'placa'],
        'cat-audio': ['audifonos', 'auriculares', 'cascos', 'airpods', 'parlante', 'altavoz',
            'bocina', 'microfono', 'interfaz', 'amplificador', 'ecualizador', 'bluetooth',
            'cancelacion de ruido', 'sonido'],
        'cat-gaming': ['playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'switch', 'consola',
            'videojuego', 'juego', 'mando', 'control', 'joystick', 'gamer', 'gaming',
            'silla gamer'],
        'cat-camaras': ['camara', 'canon', 'nikon', 'sony', 'gopro', 'dji', 'dron', 'lente',
            'objetivo', 'tripode', 'reflex', 'dslr', 'mirrorless', 'fotografia', 'megapixeles'],
        'cat-hogar': ['cafetera', 'aspiradora', 'licuadora', 'microondas', 'refrigeradora',
            'televisor', 'freidora', 'airfryer', 'horno', 'lavadora', 'ventilador',
            'plancha', 'olla', 'mueble', 'escritorio', 'lampara', 'colchon',
            /* Vajilla y menaje: se piden tanto como los electrodomésticos y no
               estaban. Un juego de copas se quedaba sin ninguna señal a favor
               y acababa rechazado por decir «para vino» en la descripción. */
            'vajilla', 'copa', 'copas', 'vaso', 'vasos', 'plato', 'platos',
            'cubiertos', 'taza', 'tazas', 'jarra', 'sarten', 'sartenes',
            'cristaleria', 'bandeja', 'silla', 'sillas', 'mesa', 'comedor',
            'estante', 'repisa', 'cortina', 'alfombra', 'espejo', 'juego de'],
        'cat-moda': ['zapatillas', 'zapatos', 'casaca', 'chaqueta', 'polo', 'camisa',
            'pantalon', 'jean', 'reloj', 'mochila', 'cartera', 'lentes', 'gorra', 'talla',
            'cuero', 'nike', 'adidas', 'puma'],
        'cat-deportes': ['bicicleta', 'bici', 'mancuerna', 'pesas', 'patineta', 'skate',
            'tabla', 'surf', 'pelota', 'raqueta', 'casco', 'gimnasio', 'trotadora',
            'shimano', 'aro'],
        'cat-instrumentos': ['guitarra', 'piano', 'teclado musical', 'bateria', 'cajon',
            'bajo', 'violin', 'ukelele', 'amplificador', 'cuerdas', 'afinador'],
        'cat-libros': ['libro', 'libros', 'novela', 'coleccion', 'manga', 'comic',
            'enciclopedia', 'texto', 'universitario', 'editorial', 'paginas', 'tapa dura'],
        'cat-bebes': ['coche de bebe', 'cochecito', 'corral', 'cuna', 'pañalera', 'biberon',
            'juguete', 'andador', 'silla de auto', 'bebe'],
        'cat-vehiculos': ['moto', 'motocicleta', 'scooter', 'casco', 'llanta', 'neumatico',
            'repuesto', 'auto', 'carro', 'bateria de auto', 'soat', 'kilometraje', 'cc'],
    };

    /**
     * Lo que no pertenece al tablón, con el motivo que se dará.
     * El orden importa: se comprueba de lo más grave a lo más leve.
     */
    const REJECTED = [
        {
            id: 'ilegal',
            reason: 'El contenido parece corresponder a artículos prohibidos.',
            weight: 10,
            terms: ['arma', 'armas', 'pistola', 'revolver', 'municion', 'droga', 'drogas',
                'marihuana', 'cocaina', 'documento falso', 'dni falso', 'titulo falso',
                'tarjeta clonada', 'cuenta hackeada', 'robado', 'bamba'],
        },
        {
            id: 'animales',
            /* Cubre también los accesorios: una jaula es un objeto, pero el
               tablón no tiene categoría para mascotas, así que tampoco encaja.
               El motivo lo dice para que el rechazo no parezca un error. */
            reason: 'No se permite la publicación de animales, mascotas ni artículos para mascotas.',
            weight: 8,
            terms: ['perro', 'perros', 'perrito', 'cachorro', 'gato', 'gatos', 'gatito',
                'mascota', 'mascotas', 'loro', 'periquito', 'conejo', 'hamster', 'pez',
                'peces', 'gallina', 'gallo', 'pollo vivo', 'cuy', 'cuyes', 'caballo',
                'vaca', 'cerdo', 'chancho', 'oveja', 'pajaro', 'tortuga', 'raza',
                'vacunado', 'desparasitado', 'camada'],
        },
        {
            id: 'comida',
            reason: 'No se permiten alimentos, bebidas ni productos perecibles.',
            weight: 8,
            terms: ['comida', 'almuerzo', 'cena', 'desayuno', 'menu', 'fruta', 'frutas',
                'verdura', 'verduras', 'manzana', 'platano', 'naranja', 'fresa', 'uva',
                'sandia', 'papaya', 'palta', 'mango', 'pan', 'torta', 'pastel', 'postre',
                'ceviche', 'pollo a la brasa', 'anticucho', 'empanada', 'gaseosa',
                'cerveza', 'vino', 'jugo', 'queso', 'carne', 'pescado fresco', 'verduritas',
                'delivery de comida', 'kilo de'],
        },
        {
            id: 'adulto',
            reason: 'El contenido no es apropiado para el tablón.',
            weight: 10,
            terms: ['porno', 'xxx', 'escort', 'sexual', 'erotico', 'desnudo', 'nudes'],
        },
        {
            id: 'servicios',
            reason: 'El tablón es para pedir objetos, no para ofrecer ni contratar servicios.',
            weight: 6,
            terms: ['ofrezco mis servicios', 'doy clases', 'clases particulares', 'busco trabajo',
                'ofrezco trabajo', 'contrato personal', 'servicio de limpieza', 'taxi',
                'flete', 'mudanza', 'prestamo', 'presto dinero', 'inversion', 'criptomoneda',
                'trading', 'gana dinero', 'trabaja desde casa', 'multinivel', 'masajes'],
        },
        {
            id: 'inmuebles',
            reason: 'El tablón no admite inmuebles ni alquileres.',
            weight: 6,
            terms: ['alquilo', 'alquiler', 'departamento', 'habitacion', 'casa en venta',
                'terreno', 'lote', 'local comercial', 'cochera en alquiler'],
        },
        {
            id: 'spam',
            reason: 'El pedido no describe algo concreto que se esté buscando.',
            weight: 5,
            terms: ['visita mi pagina', 'link en bio', 'promocion unica',
                'oferta limitada', 'click aqui', 'suscribete', 'sigueme',
                'gana dinero', 'trabaja desde casa'],
        },
    ];

    /* Señales de que un PEDIDO está bien escrito.
       Esta lista venía del modelo anterior y premiaba el estilo de un aviso de
       venta —«vendo por», «ya no uso», «incluye factura»—, que es justo lo que
       nadie escribe aquí: quien publica describe lo que busca, no lo que
       ofrece. El mismo objeto redactado como pedido sacaba ocho puntos menos
       de confianza que redactado como anuncio de venta. */
    const GOOD_SIGNALS = [
        // En qué estado lo acepta y qué tiene que cumplir
        'estado', 'usado', 'nuevo', 'como nuevo', 'poco uso', 'funciona', 'conservado',
        'original', 'garantia', 'incluye', 'caja', 'accesorios', 'cargador',
        // Qué exactamente
        'marca', 'modelo', 'color', 'capacidad', 'gb', 'pulgadas', 'talla', 'medida',
        // Para qué y para cuándo: lo que hace útil un pedido
        'necesito', 'busco', 'para', 'uso diario', 'trabajo', 'estudiar', 'regalo',
        'esta semana', 'urgente', 'sin prisa', 'lo antes posible',
        // Dónde y cómo se cierra
        'distrito', 'recojo', 'entrego', 'presupuesto', 'pago',
    ];

    /* ----------------------------------------------------------------------
       Análisis
       ---------------------------------------------------------------------- */

    /**
     * Reduce una palabra a su raíz aproximada quitando el plural castellano.
     * Sin esto «cachorros» no casaría con «cachorro» ni «naranjas» con
     * «naranja», que es justo como escribe la gente al publicar.
     */
    function stem(word) {
        if (word.length <= 4) return word;
        if (word.endsWith('ces')) return `${word.slice(0, -3)}z`;   // lápices → lápiz
        if (word.endsWith('es') && word.length > 5) return word.slice(0, -2);
        if (word.endsWith('s')) return word.slice(0, -1);
        return word;
    }

    /** Cuenta qué términos de una lista aparecen en el texto. */
    function matches(text, terms) {
        // Las palabras del texto, ya reducidas a su raíz
        const stems = new Set(text.split(' ').filter(Boolean).map(stem));

        /* Una misma palabra del texto no puede contarse dos veces porque la
           lista traiga su singular y su plural. La regla de animales incluye
           «gato» y «gatos»; con «tengo dos gatos» en la descripción, ambos
           daban en el blanco y el peso se duplicaba hasta cruzar el umbral de
           rechazo automático. Así, «busco una aspiradora robot… tengo dos
           gatos, necesito que aguante pelo» se rechazaba con un 98 % de
           confianza por «publicación de animales». */
        const counted = new Set();

        return terms.filter((term) => {
            // Un término de varias palabras se busca tal cual
            if (term.includes(' ')) {
                if (!text.includes(term) || counted.has(term)) return false;
                counted.add(term);
                return true;
            }

            // Uno suelto: primero exacto, después por raíz. Comparar raíces
            // evita que «gato» case con «regatear», cosa que sí pasaría con
            // una simple búsqueda de subcadena.
            const root = stem(term);
            if (counted.has(root)) return false;

            const hit = new RegExp(`\\b${term}\\b`).test(text) || stems.has(root);
            if (hit) counted.add(root);
            return hit;
        });
    }

    /* ======================================================================
       La forma del texto

       Lo de arriba mira QUÉ dice un pedido. Esto mira CÓMO lo dice, que es
       donde se delata casi todo el spam: un número de teléfono, un enlace,
       una frase gritada en mayúsculas, la misma palabra ocho veces.

       Se calcula sobre el texto ORIGINAL, no sobre el normalizado. Normalizar
       quita justo lo que aquí importa: los signos, las cifras juntas y la
       diferencia entre «celular» y «CELULAR».
       ====================================================================== */

    /* Nueve dígitos seguidos, o agrupados como se escribe un móvil peruano.
       Aquí se conversa por el chat que se abre al aceptar una oferta: poner
       el número en el tablón público expone a quien pide y se salta el único
       sitio donde queda constancia de lo que se acordó. */
    const PHONE = /(?:\+?51[\s-]?)?(?:9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|\d{9})\b/;

    const LINK = /(?:https?:\/\/|www\.|\b\w+\.(?:com|pe|net|org|io|me|ly)\b)/i;

    const SOCIAL = /\b(whatsapp|wasap|wsp|telegram|instagram|facebook|messenger|tiktok|arroba)\b/i;

    /** Dirección con número de puerta: la ubicación aquí es de distrito. */
    const ADDRESS = /\b(?:calle|avenida|av\.|jr\.|jiron|urb\.|urbanizacion|mz\.?|manzana|lote)\s+[\w\s.º°]{2,30}\s*(?:n[°º.]?\s*)?\d+/i;

    /**
     * Qué tiene de raro la forma del texto.
     * @returns {{contact: boolean, link: boolean, address: boolean,
     *            shouting: boolean, repetition: string|null, tooShort: boolean}}
     */
    function formSignals(post) {
        const title = String(post.title || '');
        const body = String(post.description || '');
        const full = `${title} ${body}`;

        /* Gritar: más de doce letras y al menos el 60 % en mayúsculas. El
           umbral de longitud evita señalar siglas legítimas —«DNI», «USB»,
           «RAM»— que en un pedido de tecnología son constantes. */
        const letters = full.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
        const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
        const shouting = letters.length > 12 && upper.length / letters.length > 0.6;

        /* La misma palabra larga repetida cinco veces o más: el relleno con
           el que se intenta salir en más búsquedas. */
        const words = normalize(full).split(' ').filter((w) => w.length > 3);
        const tally = new Map();
        words.forEach((w) => tally.set(w, (tally.get(w) || 0) + 1));

        let repetition = null;
        tally.forEach((count, word) => {
            if (count >= 5 && !repetition) repetition = word;
        });

        return {
            contact: PHONE.test(full) || SOCIAL.test(full),
            link: LINK.test(full),
            address: ADDRESS.test(full),
            shouting,
            repetition,
            tooShort: body.trim().split(/\s+/).filter(Boolean).length < 8,
        };
    }

    /* ======================================================================
       Edad

       Independiente de todo lo anterior, como pide el encargo: un pedido
       puede ser perfectamente legítimo y aun así no ser para cualquiera.
       Un cuchillo de cocina, una ballesta de pesca o una botella de pisco de
       colección no son motivo de rechazo; son motivo de aviso.

       Lo que sí está prohibido lo sigue resolviendo `REJECTED`, que se mira
       antes. Esto no lo sustituye: lo complementa.
       ====================================================================== */

    const ADULT_TERMS = ['cuchillo', 'machete', 'navaja', 'ballesta', 'aire comprimido',
        'perdigon', 'airsoft', 'cigarro', 'cigarrillo', 'tabaco', 'vape', 'vaper',
        'pisco', 'whisky', 'vino', 'cerveza', 'ron', 'licor', 'destilado',
        'cachimba', 'shisha', 'narguile', 'encendedor de butano'];

    /**
     * Revisa una publicación y devuelve la decisión razonada.
     *
     * @param {{title: string, description: string, category?: {id: string, name: string},
     *          price?: number, condition?: string}} post
     * @returns {{decision: 'approved'|'rejected'|'pending', reason: string,
     *            confidence: number, signals: object}}
     */
    function review(post) {
        const title = normalize(post.title);
        const body = normalize(post.description);
        // El título pesa el doble: es donde se declara qué se busca.
        const text = `${title} ${title} ${body}`;

        /* --- 1. ¿Hay algo prohibido? --- */
        let worst = null;

        for (const rule of REJECTED) {
            const hits = matches(text, rule.terms);
            if (!hits.length) continue;

            // Un término prohibido en el título es mucho más concluyente
            const inTitle = matches(title, rule.terms).length > 0;
            const score = rule.weight * hits.length * (inTitle ? 2 : 1);

            if (!worst || score > worst.score) {
                worst = { rule, hits, score, inTitle };
            }
        }

        /* --- 2. ¿Encaja con alguna categoría del foro? --- */
        let bestCategory = null;
        let bestHits = [];

        Object.entries(ALLOWED).forEach(([id, terms]) => {
            const hits = matches(text, terms);
            if (hits.length > bestHits.length) {
                bestHits = hits;
                bestCategory = id;
            }
        });

        const goodHits = matches(text, GOOD_SIGNALS);
        const form = formSignals(post);
        /* La edad se juzga SOLO por el título, y no por el texto entero.

           Quien busca una botella de pisco lo pone en el título; quien busca
           copas de cristal escribe «para vino tinto» en la descripción y sigue
           buscando copas. Mirando el cuerpo, un juego de copas salía marcado
           +18 por la bebida que va dentro —y lo mismo una vitrina «para
           licores» o una nevera «para cerveza»—.

           Es el mismo criterio que ya usa la clasificación: lo que se nombra
           primero es lo que se busca, lo que viene después es el porqué. */
        const adultHits = matches(title, ADULT_TERMS);

        const signals = {
            allowed: bestHits,
            allowedCategory: bestCategory,
            quality: goodHits,
            flagged: worst ? worst.hits : [],
            flagCategory: worst ? worst.rule.id : null,
            form,
            adult: adultHits.length > 0,
            adultTerms: adultHits,
        };

        /* --- 3. Decidir --- */

        const allowedInTitle = bestCategory
            ? matches(title, ALLOWED[bestCategory]).length > 0
            : false;

        if (worst) {
            /* Ambigüedad real: el título nombra a la vez algo prohibido y algo
               del foro. «Funda para laptop con estampado de gatos» es una funda,
               no un gato. Rechazarla sería un error, y aprobarla a ciegas
               también: la decide una persona. */
            if (worst.inTitle && allowedInTitle) {
                return {
                    decision: 'pending',
                    reason: `El título menciona «${worst.hits[0]}» junto a algo que sí se pide aquí. Conviene comprobar de qué se trata.`,
                    confidence: 0.35,
                    signals,
                };
            }

            // Prohibido y evidente: se rechaza
            if (worst.inTitle || worst.score >= 16) {
                return {
                    decision: 'rejected',
                    reason: worst.rule.reason,
                    confidence: Math.min(0.98, 0.6 + worst.score / 40),
                    signals,
                };
            }

            /* Mencionado de refilón, pero el pedido encaja con el tablón.
               Basta una señal, no dos: «busco una aspiradora robot… tengo dos
               gatos, necesito que aguante pelo» es un pedido de aspiradora y
               se estaba rechazando por hablar de animales. Cuando lo prohibido
               aparece solo en la descripción y el título pide algo que sí
               pertenece aquí, decide una persona. */
            if (bestHits.length >= 1) {
                return {
                    decision: 'pending',
                    reason: `Se detectó «${worst.hits[0]}», que no suele pertenecer al tablón, pero el resto del pedido sí encaja. Conviene revisarla a mano.`,
                    confidence: 0.4,
                    signals,
                };
            }

            /* Prohibido, sin nada que lo respalde, pero SOLO en la descripción.

               Rechazar por una palabra que aparece lejos del título es
               demasiado: «copas de cristal para vino tinto» es un pedido de
               vajilla, y «vino» va ahí como contexto de para qué sirven. Lo
               mismo con una vitrina «para licores» o una nevera «para
               cerveza». Decide una persona, que es lo que ADR-006 prefiere:
               vale más una cola corta de dudas que un rechazo injusto. */
            if (!worst.inTitle) {
                return {
                    decision: 'pending',
                    reason: `La descripción menciona «${worst.hits[0]}», que no suele pertenecer al tablón, pero el título no lo pide. Conviene mirarla.`,
                    confidence: 0.4,
                    signals,
                };
            }

            // Prohibido en el título y sin nada que lo respalde
            return {
                decision: 'rejected',
                reason: worst.rule.reason,
                confidence: Math.min(0.9, 0.5 + worst.score / 40),
                signals,
            };
        }

        /* --- 2 bis. ¿Cómo está escrito? ---

           Nada de esto se rechaza: todo tiene arreglo reescribiendo dos
           líneas. Por eso va a revisión y con el motivo concreto, que es lo
           que la persona necesita para corregirlo. */
        if (form.contact) {
            return {
                decision: 'pending',
                reason: 'El pedido incluye un teléfono o una red social. Aquí se conversa por el chat que se abre al aceptar una oferta, y publicar un contacto en el tablón expone a quien pide.',
                confidence: 0.55,
                signals,
            };
        }

        if (form.link) {
            return {
                decision: 'pending',
                reason: 'El pedido incluye un enlace externo. Conviene comprobar a dónde lleva antes de publicarlo.',
                confidence: 0.5,
                signals,
            };
        }

        if (form.address) {
            return {
                decision: 'pending',
                reason: 'El pedido parece incluir una dirección exacta. Aquí la ubicación es siempre de distrito, nunca de puerta.',
                confidence: 0.5,
                signals,
            };
        }

        if (form.repetition) {
            return {
                decision: 'pending',
                reason: `La palabra «${form.repetition}» se repite muchas veces, que es la forma habitual de forzar apariciones en la búsqueda.`,
                confidence: 0.45,
                signals,
            };
        }

        // Descripción demasiado pobre para juzgarla
        if (body.split(' ').length < 8) {
            return {
                decision: 'pending',
                reason: 'La descripción es demasiado breve para saber qué se está buscando.',
                confidence: 0.3,
                signals,
            };
        }

        // Encaja con el foro
        if (bestHits.length >= 2 || (bestHits.length === 1 && goodHits.length >= 2)) {
            const name = (global.DiscoverySeed && global.DiscoverySeed.CATEGORIES || [])
                .find((c) => c.id === bestCategory);

            return {
                decision: 'approved',
                reason: name
                    ? `Pedido de ${name.name.toLowerCase()} correctamente descrito.`
                    : 'El pedido corresponde a las categorías permitidas.',
                confidence: Math.min(0.96, 0.55 + bestHits.length * 0.09 + goodHits.length * 0.04),
                signals,
            };
        }

        // Una sola señal débil: mejor que lo vea una persona
        if (bestHits.length === 1) {
            return {
                decision: 'pending',
                reason: 'El pedido parece encajar, pero la descripción no da señales suficientes para aprobarlo automáticamente.',
                confidence: 0.45,
                signals,
            };
        }

        // Nada reconocible
        return {
            decision: 'pending',
            reason: 'No se reconoció qué se está pidiendo. Requiere revisión manual.',
            confidence: 0.25,
            signals,
        };
    }

    /* ======================================================================
       Lo mismo, pero para quien lo está escribiendo

       `review` decide. `inspect` aconseja: recorre las mismas señales y las
       devuelve como una lista de avisos que se le pueden enseñar a la persona
       ANTES de publicar, cuando todavía puede corregirlos.

       Es la diferencia entre «tu pedido fue rechazado» tres horas después y
       «quita el teléfono y sale ya», y esa diferencia es el encargo entero.
       ====================================================================== */

    /**
     * @param {object} post
     * @returns {{verdict: object, notes: Array<{level: string, title: string, hint: string}>,
     *            ready: boolean, adult: boolean}}
     */
    function inspect(post) {
        const verdict = review(post);
        const form = verdict.signals.form || {};
        const notes = [];

        const add = (level, title, hint) => notes.push({ level, title, hint });

        if (verdict.decision === 'rejected') {
            add('block', 'Esto no se puede publicar', verdict.reason);
        }

        if (form.contact) {
            add('fix', 'Quita el teléfono o la red social',
                'Cuando aceptes una oferta se abre un chat privado con esa persona. Ahí compartes lo que quieras; en el tablón queda a la vista de cualquiera.');
        }

        if (form.link) {
            add('fix', 'Quita el enlace',
                'Los pedidos con enlaces externos pasan por revisión manual y tardan más en salir.');
        }

        if (form.address) {
            add('fix', 'No pongas tu dirección',
                'Basta con el distrito. Quedar en un punto concreto se acuerda después, por el chat.');
        }

        if (form.shouting) {
            add('tip', 'Baja las mayúsculas',
                'Escrito en mayúsculas se lee peor y parece publicidad. Con minúsculas recibirás más ofertas.');
        }

        if (form.repetition) {
            add('tip', `Repites «${form.repetition}» muchas veces`,
                'No hace falta: la búsqueda encuentra igual un pedido bien escrito.');
        }

        if (form.tooShort) {
            add('tip', 'Cuenta un poco más',
                'Con ocho o diez palabras más —marca, medida, para qué lo quieres— quien vende sabe si puede ayudarte, y te responde antes.');
        }

        if (verdict.signals.adult) {
            add('age', 'Puede requerir mayoría de edad',
                'Por lo que describes, este pedido se marcará como +18. No es un problema: solo se avisa a quien responda.');
        }

        if (verdict.decision === 'pending' && !notes.length) {
            add('tip', 'Lo revisará una persona',
                verdict.reason);
        }

        return {
            verdict,
            notes,
            ready: verdict.decision !== 'rejected',
            adult: Boolean(verdict.signals.adult),
        };
    }

    /**
     * Mensaje para el administrador, con el formato de una conversación.
     * @param {object} post
     * @param {{decision: string, reason: string}} verdict
     */
    function notificationText(post, verdict) {
        const head = '🤖 IA de DiscoveryShop';

        /* Quien publica aquí es quien BUSCA, y el campo se llama `buyer`.
           Esto leía `post.author`, que no existe en un pedido: el aviso que
           le llegaba al admin por WhatsApp decía siempre «Vendedor: —». */
        const asks = post.buyer ? post.buyer.username : '—';

        if (verdict.decision === 'approved') {
            return [
                head,
                '',
                'Nuevo pedido revisado.',
                `Busca: ${post.title}`,
                `Lo pide: ${asks}`,
                'Estado: ✅ Aprobado',
            ].join('\n');
        }

        if (verdict.decision === 'rejected') {
            return [
                head,
                '',
                'Pedido rechazado.',
                `Busca: ${post.title}`,
                `Lo pide: ${asks}`,
                `Motivo: ${verdict.reason}`,
            ].join('\n');
        }

        return [
            head,
            '',
            'Pedido en duda: necesita tu revisión.',
            `Busca: ${post.title}`,
            `Lo pide: ${asks}`,
            `Motivo: ${verdict.reason}`,
        ].join('\n');
    }

    global.DiscoveryModerator = {
        review,
        inspect,
        notificationText,
        normalize,
        formSignals,
        ALLOWED,
        REJECTED,
        ADULT_TERMS,
    };
})(window);
