/**
 * DiscoveryShop · Revisor de publicaciones
 *
 * IA propia de la plataforma que decide si una publicación pertenece al foro.
 * No consulta ningún servicio externo: razona sobre el vocabulario del propio
 * catálogo, que es exactamente el dominio que debe vigilar.
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

    /** Lo que sí se publica aquí, agrupado por categoría del catálogo. */
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
            'plancha', 'olla', 'mueble', 'escritorio', 'lampara', 'colchon'],
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
     * Lo que no pertenece al foro, con el motivo que se dará.
     * El orden importa: se comprueba de lo más grave a lo más leve.
     */
    const REJECTED = [
        {
            id: 'ilegal',
            reason: 'El contenido parece corresponder a artículos de venta prohibida.',
            weight: 10,
            terms: ['arma', 'armas', 'pistola', 'revolver', 'municion', 'droga', 'drogas',
                'marihuana', 'cocaina', 'documento falso', 'dni falso', 'titulo falso',
                'tarjeta clonada', 'cuenta hackeada', 'robado', 'bamba'],
        },
        {
            id: 'animales',
            reason: 'No se permite la publicación de animales ni de mascotas.',
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
            reason: 'El contenido no es apropiado para el foro.',
            weight: 10,
            terms: ['porno', 'xxx', 'escort', 'sexual', 'erotico', 'desnudo', 'nudes'],
        },
        {
            id: 'servicios',
            reason: 'El foro es para artículos de segunda mano, no para ofrecer servicios.',
            weight: 6,
            terms: ['ofrezco mis servicios', 'doy clases', 'clases particulares', 'busco trabajo',
                'ofrezco trabajo', 'contrato personal', 'servicio de limpieza', 'taxi',
                'flete', 'mudanza', 'prestamo', 'presto dinero', 'inversion', 'criptomoneda',
                'trading', 'gana dinero', 'trabaja desde casa', 'multinivel', 'masajes'],
        },
        {
            id: 'inmuebles',
            reason: 'El foro no admite inmuebles ni alquileres.',
            weight: 6,
            terms: ['alquilo', 'alquiler', 'departamento', 'habitacion', 'casa en venta',
                'terreno', 'lote', 'local comercial', 'cochera en alquiler'],
        },
        {
            id: 'spam',
            reason: 'La publicación no describe un artículo concreto.',
            weight: 5,
            terms: ['whatsapp', 'escribeme al', 'llamar al', 'visita mi pagina', 'link en bio',
                'promocion unica', 'oferta limitada', 'click aqui', 'suscribete', 'sigueme'],
        },
    ];

    /** Señales de que sí se describe un artículo de segunda mano. */
    const GOOD_SIGNALS = [
        'estado', 'usado', 'nuevo', 'poco uso', 'funciona', 'incluye', 'caja', 'original',
        'garantia', 'accesorios', 'cargador', 'factura', 'boleta', 'detalle', 'marca',
        'modelo', 'color', 'capacidad', 'gb', 'pulgadas', 'talla', 'vendo por', 'ya no uso',
        'como nuevo', 'conservado', 'entrego',
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

        return terms.filter((term) => {
            // Un término de varias palabras se busca tal cual
            if (term.includes(' ')) return text.includes(term);

            // Uno suelto: primero exacto, después por raíz. Comparar raíces
            // evita que «gato» case con «regatear», cosa que sí pasaría con
            // una simple búsqueda de subcadena.
            if (new RegExp(`\\b${term}\\b`).test(text)) return true;
            return stems.has(stem(term));
        });
    }

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
        // El título pesa el doble: es donde se declara qué se vende.
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

        const signals = {
            allowed: bestHits,
            allowedCategory: bestCategory,
            quality: goodHits,
            flagged: worst ? worst.hits : [],
            flagCategory: worst ? worst.rule.id : null,
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
                    reason: `El título menciona «${worst.hits[0]}» junto a un artículo del foro. Conviene comprobar de qué se trata.`,
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

            // Mencionado de refilón, pero el resto encaja bien con el foro
            if (bestHits.length >= 2) {
                return {
                    decision: 'pending',
                    reason: `Se detectó «${worst.hits[0]}», que no suele pertenecer al foro, pero el resto de la publicación sí encaja. Conviene revisarla a mano.`,
                    confidence: 0.4,
                    signals,
                };
            }

            // Prohibido y sin nada que lo respalde
            return {
                decision: 'rejected',
                reason: worst.rule.reason,
                confidence: Math.min(0.9, 0.5 + worst.score / 40),
                signals,
            };
        }

        // Descripción demasiado pobre para juzgarla
        if (body.split(' ').length < 8) {
            return {
                decision: 'pending',
                reason: 'La descripción es demasiado breve para determinar de qué artículo se trata.',
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
                    ? `Artículo de ${name.name.toLowerCase()} correctamente descrito.`
                    : 'El artículo corresponde a las categorías permitidas.',
                confidence: Math.min(0.96, 0.55 + bestHits.length * 0.09 + goodHits.length * 0.04),
                signals,
            };
        }

        // Una sola señal débil: mejor que lo vea una persona
        if (bestHits.length === 1) {
            return {
                decision: 'pending',
                reason: 'El artículo parece encajar, pero la descripción no da señales suficientes para aprobarlo automáticamente.',
                confidence: 0.45,
                signals,
            };
        }

        // Nada reconocible
        return {
            decision: 'pending',
            reason: 'No se reconoció el tipo de artículo. Requiere revisión manual.',
            confidence: 0.25,
            signals,
        };
    }

    /**
     * Mensaje para el administrador, con el formato de una conversación.
     * @param {object} post
     * @param {{decision: string, reason: string}} verdict
     */
    function notificationText(post, verdict) {
        const head = '🤖 IA de DiscoveryShop';

        if (verdict.decision === 'approved') {
            return [
                head,
                '',
                'Nueva publicación revisada.',
                `Producto: ${post.title}`,
                `Vendedor: ${post.author ? post.author.username : '—'}`,
                'Estado: ✅ Aprobada',
            ].join('\n');
        }

        if (verdict.decision === 'rejected') {
            return [
                head,
                '',
                'Publicación rechazada.',
                `Producto: ${post.title}`,
                `Vendedor: ${post.author ? post.author.username : '—'}`,
                `Motivo: ${verdict.reason}`,
            ].join('\n');
        }

        return [
            head,
            '',
            'Publicación en duda: necesita tu revisión.',
            `Producto: ${post.title}`,
            `Vendedor: ${post.author ? post.author.username : '—'}`,
            `Motivo: ${verdict.reason}`,
        ].join('\n');
    }

    global.DiscoveryModerator = {
        review,
        notificationText,
        normalize,
        ALLOWED,
        REJECTED,
    };
})(window);
