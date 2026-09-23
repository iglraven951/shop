/**
 * DiscoveryShop · Catálogo semilla
 *
 * Datos iniciales del modo demo: distritos de Arequipa con coordenadas reales,
 * usuarios con rol (comprador / vendedor / administrador) y publicaciones de
 * artículos de segunda mano con su actividad social.
 *
 * Las imágenes se generan como SVG en data URI: no dependen de ninguna red ni
 * servicio externo, así que la página nunca muestra imágenes rotas.
 */
(function (global) {
    'use strict';

    /* ----------------------------------------------------------------------
       Distritos de Arequipa
       Coordenadas aproximadas del centro de cada distrito, suficientes para
       situar un marcador en el mapa.
       ---------------------------------------------------------------------- */

    const DISTRICTS = [
        { name: 'Cercado', lat: -16.3989, lng: -71.5350 },
        { name: 'Yanahuara', lat: -16.3856, lng: -71.5461 },
        { name: 'Cayma', lat: -16.3711, lng: -71.5497 },
        { name: 'Cerro Colorado', lat: -16.3722, lng: -71.5836 },
        { name: 'Alto Selva Alegre', lat: -16.3794, lng: -71.5206 },
        { name: 'Miraflores', lat: -16.3878, lng: -71.5178 },
        { name: 'Mariano Melgar', lat: -16.4022, lng: -71.5117 },
        { name: 'Paucarpata', lat: -16.4183, lng: -71.4994 },
        { name: 'José Luis Bustamante y Rivero', lat: -16.4322, lng: -71.5325 },
        { name: 'Socabaya', lat: -16.4633, lng: -71.5322 },
        { name: 'Jacobo Hunter', lat: -16.4339, lng: -71.5561 },
        { name: 'Sachaca', lat: -16.4169, lng: -71.5686 },
        { name: 'Tiabaya', lat: -16.4392, lng: -71.6008 },
        { name: 'Characato', lat: -16.4664, lng: -71.4842 },
        { name: 'Sabandía', lat: -16.4589, lng: -71.5119 },
        { name: 'Uchumayo', lat: -16.4181, lng: -71.6861 },
        { name: 'Yura', lat: -16.2511, lng: -71.6858 },
        { name: 'La Joya', lat: -16.5842, lng: -71.9139 },
    ];

    /** Centro del mapa cuando se muestran todos los distritos. */
    const AREQUIPA_CENTER = { lat: -16.4090, lng: -71.5375, zoom: 12 };

    const districtByName = (name) =>
        DISTRICTS.find((d) => d.name === name) || DISTRICTS[0];

    /* ----------------------------------------------------------------------
       Generación de imágenes
       ---------------------------------------------------------------------- */

    const PALETTES = [
        ['#6366f1', '#a855f7'],
        ['#0ea5e9', '#22d3ee'],
        ['#f59e0b', '#ef4444'],
        ['#10b981', '#14b8a6'],
        ['#8b5cf6', '#ec4899'],
        ['#3b82f6', '#6366f1'],
        ['#f43f5e', '#f97316'],
        ['#14b8a6', '#84cc16'],
    ];

    /** Hash estable: el mismo texto produce siempre la misma imagen. */
    function hashString(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i += 1) {
            hash = (hash << 5) - hash + text.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    /**
     * Construye una imagen SVG con degradado y emoji como data URI.
     * @param {string} label - Texto que determina los colores.
     * @param {string} emoji - Glifo a mostrar en el centro.
     * @returns {string} data URI listo para el atributo src.
     */
    function createImage(label, emoji, width = 900, height = 600) {
        const [from, to] = PALETTES[hashString(label) % PALETTES.length];
        const id = `g${hashString(label) % 100000}`;

        const svg = [
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
            '<defs>',
            `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`,
            `<stop offset="0%" stop-color="${from}"/>`,
            `<stop offset="100%" stop-color="${to}"/>`,
            '</linearGradient>',
            `<radialGradient id="${id}b" cx="0.3" cy="0.2" r="0.9">`,
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>',
            '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>',
            '</radialGradient>',
            '</defs>',
            `<rect width="${width}" height="${height}" fill="url(#${id})"/>`,
            `<rect width="${width}" height="${height}" fill="url(#${id}b)"/>`,
            `<text x="50%" y="50%" font-size="${Math.round(height * 0.34)}" `,
            'text-anchor="middle" dominant-baseline="central" ',
            'font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">',
            emoji,
            '</text>',
            '</svg>',
        ].join('');

        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    /* ----------------------------------------------------------------------
       Categorías
       ---------------------------------------------------------------------- */

    const CATEGORIES = [
        { id: 'cat-celulares', name: 'Celulares', slug: 'celulares', icon: '📱' },
        { id: 'cat-computo', name: 'Cómputo', slug: 'computo', icon: '💻' },
        { id: 'cat-audio', name: 'Audio', slug: 'audio', icon: '🎧' },
        { id: 'cat-gaming', name: 'Gaming', slug: 'gaming', icon: '🎮' },
        { id: 'cat-camaras', name: 'Cámaras', slug: 'camaras', icon: '📷' },
        { id: 'cat-hogar', name: 'Hogar', slug: 'hogar', icon: '🏠' },
        { id: 'cat-moda', name: 'Moda', slug: 'moda', icon: '👟' },
        { id: 'cat-deportes', name: 'Deportes', slug: 'deportes', icon: '🚴' },
        { id: 'cat-instrumentos', name: 'Instrumentos', slug: 'instrumentos', icon: '🎸' },
        { id: 'cat-libros', name: 'Libros', slug: 'libros', icon: '📚' },
        { id: 'cat-bebes', name: 'Bebés y niños', slug: 'bebes', icon: '🧸' },
        { id: 'cat-vehiculos', name: 'Vehículos', slug: 'vehiculos', icon: '🚗' },
    ];

    /* ----------------------------------------------------------------------
       Usuarios
       role:          'buyer' | 'seller' | 'admin'
       seller_status: null | 'pending' | 'approved' | 'rejected'
       ---------------------------------------------------------------------- */

    const USERS = [
        ['Juan Pérez', 'juan@discoveryshop.pe', 'seller', 'approved', 'Cayma', 4.8, 142],
        ['María García', 'maria@discoveryshop.pe', 'seller', 'approved', 'Yanahuara', 4.9, 286],
        ['Carlos Quispe', 'carlos@discoveryshop.pe', 'seller', 'approved', 'Cerro Colorado', 4.6, 74],
        ['Ana Martínez', 'ana@discoveryshop.pe', 'seller', 'approved', 'Paucarpata', 4.7, 198],
        ['Roberto Sánchez', 'roberto@discoveryshop.pe', 'seller', 'approved', 'Socabaya', 5.0, 63],
        ['Elena Gómez', 'elena@discoveryshop.pe', 'seller', 'approved', 'José Luis Bustamante y Rivero', 4.9, 231],
        ['Diego Torres', 'diego@discoveryshop.pe', 'seller', 'approved', 'Miraflores', 4.5, 47],
        ['Lucía Fernández', 'lucia@discoveryshop.pe', 'seller', 'approved', 'Alto Selva Alegre', 4.8, 155],
        ['Fernando Ruiz', 'fernando@discoveryshop.pe', 'seller', 'approved', 'Sachaca', 4.7, 89],
        ['Sofía Mendoza', 'sofia@discoveryshop.pe', 'seller', 'approved', 'Cercado', 4.9, 312],
        ['Pedro Ramírez', 'pedro@discoveryshop.pe', 'seller', 'approved', 'Mariano Melgar', 4.4, 31],
        ['Claudia Vargas', 'claudia@discoveryshop.pe', 'seller', 'approved', 'Characato', 4.6, 58],
        // Solicitudes de vendedor a la espera de revisión del administrador
        ['Miguel Castro', 'miguel@discoveryshop.pe', 'buyer', 'pending', 'Tiabaya', 0, 0],
        ['Rosa Núñez', 'rosa@discoveryshop.pe', 'buyer', 'pending', 'Sabandía', 0, 0],
        ['Andrés Chávez', 'andres@discoveryshop.pe', 'buyer', 'pending', 'Jacobo Hunter', 0, 0],
        // Compradores sin intención de vender
        ['Patricia Ríos', 'patricia@discoveryshop.pe', 'buyer', null, 'Yura', 0, 0],
        ['Javier Paredes', 'javier@discoveryshop.pe', 'buyer', null, 'Uchumayo', 0, 0],
    ];

    /* ----------------------------------------------------------------------
       Publicaciones
       [título, categoría, precio, condición, emoji, índiceAutor, descripción]
       ---------------------------------------------------------------------- */

    const RAW_POSTS = [
        ['iPhone 13 Pro 128 GB', 'cat-celulares', 2350, 'Como nuevo', '📱', 0, 'Lo uso desde hace año y medio y está impecable, batería al 89 %. Incluyo caja, cable y una funda de regalo. Se puede revisar sin compromiso en Cayma.'],
        ['Samsung Galaxy A54', 'cat-celulares', 980, 'Buen estado', '📱', 1, 'Funciona perfecto, solo tiene un micro rayón en la esquina que no se nota con funda. Liberado para cualquier operador. Acepto que lo pruebes antes.'],
        ['Xiaomi Redmi Note 12', 'cat-celulares', 620, 'Como nuevo', '📱', 2, 'Me lo regalaron y ya tenía uno, así que prácticamente no lo usé. Caja sellada con todos sus accesorios originales.'],
        ['MacBook Air M1 2020', 'cat-computo', 3200, 'Buen estado', '💻', 1, 'Lo usé para la universidad, 210 ciclos de carga. Anda rapidísimo, la pantalla sin un solo pixel muerto. Incluye cargador original.'],
        ['PC de escritorio i5 + GTX 1660', 'cat-computo', 2800, 'Buen estado', '🖥️', 3, 'Armada hace dos años, 16 GB de RAM y SSD de 500 GB. Mueve todo en alto sin problemas. La vendo porque me mudo y no me la llevo.'],
        ['Monitor LG 24" 75 Hz', 'cat-computo', 380, 'Como nuevo', '🖥️', 4, 'Comprado en enero, con garantía todavía vigente. Base regulable, entrada HDMI y DisplayPort. Sin marcas de uso.'],
        ['Teclado mecánico Redragon', 'cat-computo', 145, 'Buen estado', '⌨️', 5, 'Switches azules, retroiluminación RGB. Un par de teclas tienen el brillo algo gastado, nada más. Muy cómodo para escribir.'],
        ['iPad 9.ª generación 64 GB', 'cat-computo', 1150, 'Como nuevo', '📲', 6, 'Lo compré para dibujar y al final no le di uso. Incluye funda con soporte. Sin rayones, pantalla como recién salida de caja.'],
        ['Audífonos Sony WH-CH720N', 'cat-audio', 420, 'Como nuevo', '🎧', 7, 'Cancelación de ruido muy decente, batería dura todo el día. Los uso poco porque prefiero los in-ear. Con estuche y cable.'],
        ['Parlante JBL Flip 5', 'cat-audio', 290, 'Buen estado', '🔊', 8, 'Suena fuerte y resiste el agua. Lo llevé a la playa un par de veces, por eso tiene un poco de arena en la rejilla, pero funciona perfecto.'],
        ['AirPods 2.ª generación', 'cat-audio', 260, 'Buen estado', '🎧', 9, 'Originales, con su estuche de carga. La batería aguanta unas 3 horas por carga. Incluyo almohadillas nuevas.'],
        ['Interfaz de audio Behringer UM2', 'cat-audio', 180, 'Buen estado', '🎚️', 10, 'Ideal para empezar a grabar en casa. La usé para podcast durante un año. Funciona sin fallas, incluye cable USB.'],
        ['PlayStation 4 Slim 1 TB', 'cat-gaming', 980, 'Buen estado', '🎮', 3, 'Con dos mandos (uno original y uno genérico) y cuatro juegos físicos. Nunca abierta ni reparada. Se entrega en persona en Paucarpata.'],
        ['Nintendo Switch Lite', 'cat-gaming', 820, 'Como nuevo', '🕹️', 5, 'Color turquesa, con mica de vidrio puesta desde el día uno. Incluye funda rígida y una microSD de 128 GB con juegos.'],
        ['Xbox Series S', 'cat-gaming', 1320, 'Como nuevo', '🎮', 11, 'Comprada hace ocho meses, la uso muy poco. Con su mando, cable HDMI y caja original. Todavía tiene garantía.'],
        ['Silla gamer con soporte lumbar', 'cat-gaming', 450, 'Buen estado', '🪑', 0, 'Cómoda para jornadas largas. Tiene una marca de uso en el apoyabrazos izquierdo, el resto está entero. Entrego desarmada.'],
        ['Canon EOS Rebel T6 + lente 18-55', 'cat-camaras', 1400, 'Buen estado', '📷', 2, 'Mi primera cámara, me sirvió para aprender. Unos 12 mil disparos. Incluye dos baterías, correa y bolso acolchado.'],
        ['GoPro HERO 9 Black', 'cat-camaras', 890, 'Buen estado', '📹', 6, 'La llevé a un par de viajes, graba en 5K sin problema. Incluye tres soportes, batería extra y carcasa sumergible.'],
        ['Trípode Manfrotto compacto', 'cat-camaras', 210, 'Como nuevo', '📸', 8, 'Ligero y estable, perfecto para viajar. Lo usé dos veces. Con su bolso de transporte original.'],
        ['Cafetera espresso Oster', 'cat-hogar', 320, 'Buen estado', '☕', 4, 'Prepara buen café, tiene vaporizador para leche. La descalcifiqué el mes pasado. La vendo porque me regalaron una automática.'],
        ['Aspiradora robot Xiaomi', 'cat-hogar', 680, 'Como nuevo', '🤖', 9, 'Mapea la casa sola y vuelve a su base. Le puse cepillos nuevos. Incluye base de carga y control remoto.'],
        ['Air Fryer 5 L', 'cat-hogar', 240, 'Buen estado', '🍳', 7, 'La uso poco desde que cambié de dieta. Funciona perfecto, canastilla antiadherente en buen estado. Con recetario.'],
        ['Televisor Samsung 43" Full HD', 'cat-hogar', 750, 'Buen estado', '📺', 10, 'Imagen impecable, smart TV con Netflix y YouTube. Tiene el control original. La cambio por una más grande.'],
        ['Zapatillas Nike Air Force talla 42', 'cat-moda', 190, 'Buen estado', '👟', 11, 'Usadas unas diez veces, les hice limpieza profunda. Sin roturas ni despegues. Vienen con su caja original.'],
        ['Casaca de cuero talla M', 'cat-moda', 280, 'Como nuevo', '🧥', 1, 'Cuero genuino, color marrón oscuro. Me quedó chica al poco de comprarla. Forro interior intacto.'],
        ['Reloj Casio G-Shock', 'cat-moda', 240, 'Buen estado', '⌚', 0, 'Resistente a golpes y agua. Correa original con marcas mínimas de uso. Pila cambiada este año.'],
        ['Mochila Jansport 34 L', 'cat-moda', 95, 'Buen estado', '🎒', 3, 'La usé un semestre en la universidad. Todos los cierres funcionan. Tiene compartimento acolchado para laptop.'],
        ['Bicicleta montañera aro 29', 'cat-deportes', 850, 'Buen estado', '🚲', 5, 'Grupo Shimano de 21 velocidades, frenos de disco. Le cambié las llantas hace dos meses. Ideal para la ciclovía y trocha.'],
        ['Set de mancuernas 20 kg', 'cat-deportes', 180, 'Buen estado', '🏋️', 8, 'Barras y discos ajustables. Los usé durante la pandemia y ahora voy al gimnasio. Sin óxido.'],
        ['Patineta eléctrica', 'cat-deportes', 620, 'Buen estado', '🛹', 2, 'Autonomía de unos 20 km. Batería en buen estado, la cargo una vez por semana. Incluye cargador original.'],
        ['Guitarra acústica Yamaha F310', 'cat-instrumentos', 480, 'Buen estado', '🎸', 6, 'Muy buen sonido para su precio. Cuerdas nuevas puestas la semana pasada. Incluye funda acolchada y púas.'],
        ['Teclado Casio CTK-3500', 'cat-instrumentos', 390, 'Como nuevo', '🎹', 9, '61 teclas sensibles al tacto. Mi hija dejó las clases y quedó guardado. Con atril, pedal y adaptador de corriente.'],
        ['Cajón peruano de cedro', 'cat-instrumentos', 220, 'Buen estado', '🥁', 4, 'Hecho a mano en Lima, sonido grave y cálido. Tiene un pequeño rayón lateral. Ideal para tocar en casa o peñas.'],
        ['Colección Harry Potter tapa dura', 'cat-libros', 280, 'Como nuevo', '📚', 7, 'Los siete libros, sin subrayados ni hojas dobladas. Los leí una sola vez. Se entregan en una caja.'],
        ['Libros de ingeniería civil', 'cat-libros', 150, 'Buen estado', '📖', 10, 'Lote de seis títulos de estructuras y concreto armado. Algunos tienen anotaciones a lápiz. Perfectos para estudiantes.'],
        ['Coche para bebé reclinable', 'cat-bebes', 340, 'Buen estado', '🧸', 11, 'Mi hijo ya creció. Lo lavé completo, las ruedas giran suaves. Se pliega fácil para el maletero.'],
        ['Corral de juegos plegable', 'cat-bebes', 180, 'Como nuevo', '🧸', 1, 'Usado apenas tres meses. Malla lateral sin roturas, colchoneta incluida. Se guarda en su bolso original.'],
        ['Casco para moto talla L', 'cat-vehiculos', 160, 'Buen estado', '🪖', 0, 'Certificado DOT, visor sin rayones profundos. Lo usé un año. Interior lavable y en buen estado.'],
        ['Llantas aro 15 (juego de 4)', 'cat-vehiculos', 520, 'Buen estado', '🚗', 3, 'Les queda alrededor del 60 % de vida útil. Sin parches ni deformaciones. Las cambié por unas de mayor medida.'],
        ['Scooter 125 cc modelo 2021', 'cat-vehiculos', 4200, 'Buen estado', '🛵', 5, 'Con 11 mil kilómetros, mantenimientos al día en taller autorizado. Papeles en regla y SOAT vigente hasta diciembre.'],
    ];

    /** Comentarios verosímiles para poblar las conversaciones del foro. */
    /* Estado de venta repartido por el catálogo. Once posiciones para que
       `seed % 11` reparta: la mayoría disponibles, dos reservadas y una
       vendida, que es más o menos lo que se ve en un tablón real. */
    const AVAILABILITY = [
        'available', 'available', 'available', 'reserved', 'available',
        'available', 'sold', 'available', 'available', 'reserved', 'available',
    ];

    const COMMENT_TEMPLATES = [
        '¿Sigue disponible? Me interesa mucho.',
        '¿Aceptas una oferta un poco más baja?',
        '¿En qué zona exacta se puede ver?',
        'Te escribí por mensaje, quedo atento.',
        '¿Tiene boleta o algún comprobante?',
        '¿Podrías subir más fotos del estado real?',
        'Justo andaba buscando uno así.',
        '¿Haces envío a otro distrito?',
        'Muy buen precio por lo que ofreces.',
        '¿Se puede pagar en partes?',
        'Lo vi en persona, el vendedor es muy amable.',
        '¿Cuánto tiempo lo has usado?',
    ];

    /**
     * Construye el estado inicial completo.
     * @returns {{users, posts, categories, districts}}
     */
    /* ----------------------------------------------------------------------
       Fotografías

       Fotos reales de Unsplash, una por publicación y en el mismo orden que
       RAW_POSTS. Su licencia permite uso comercial sin atribución. Se guardan
       solo los identificadores: el tamaño y la calidad se piden por parámetro,
       así la misma lista sirve para la miniatura del feed y para la ficha.

       Cada URL se comprobó con una petición HEAD: las 40 responden 200 con
       un tipo de contenido de imagen. Aun así, la interfaz nunca depende de
       la red: si una foto no carga, el atributo `onerror` la sustituye por el
       SVG generado, que no necesita conexión y siempre está disponible.
       ---------------------------------------------------------------------- */
    const PHOTOS = [
        'photo-1511707171634-5f897ff02aa9', 'photo-1592890288564-76628a30a657',
        'photo-1598327105666-5b89351aff97', 'photo-1499678329028-101435549a4e',
        'photo-1773332598414-44a45e364d85', 'photo-1527443224154-c4a3942d3acf',
        'photo-1587829741301-dc798b83add3', 'photo-1648737966636-2fc3a5fffc8a',
        'photo-1505740420928-5e560c06d30e', 'photo-1627931539006-d5c4677e05ea',
        'photo-1572569511254-d8f925fe2cbb', 'photo-1618609377864-68609b857e90',
        'photo-1493711662062-fa541adb3fc8', 'photo-1612036781124-847f8939b154',
        'photo-1509198397868-475647b2a1e5', 'photo-1612372606404-0ab33e7187ee',
        'photo-1779896412176-45c509bbee35', 'photo-1484506399805-c273b8e91dce',
        'photo-1576299090369-9067e4adca28', 'photo-1447933601403-0c6688de566e',
        'photo-1527515637462-cff94eecc1ac', 'photo-1484154218962-a197022b5858',
        'photo-1509281373149-e957c6296406', 'photo-1595950653106-6c9ebd614d3a',
        'photo-1521223890158-f9f7c3d5d504', 'photo-1523170335258-f5ed11844a49',
        'photo-1622560480654-d96214fdc887', 'photo-1485965120184-e220f721d03e',
        'photo-1638536532686-d610adfc8e5c', 'photo-1565300480288-deb407e6ae15',
        'photo-1564186763535-ebb21ef5277f', 'photo-1520523839897-bd0b52f945a0',
        'photo-1708961465136-e24550f3acd5', 'photo-1610116306796-6fea9f4fae38',
        'photo-1694730750153-8b66cf3dd014', 'photo-1714392512700-4cab9e51710b',
        'photo-1607322851003-f5a88dc5b960', 'photo-1611004061856-ccc3cbe944b2',
        'photo-1571335746824-742511d49bce', 'photo-1609630875171-b1321377ee65',
    ];

    /**
     * URL de una foto del catálogo al tamaño pedido.
     * @param {number} index - Posición de la publicación.
     * @param {number} [w] - Ancho en píxeles; el alto mantiene 4:3.
     */
    function photoUrl(index, w = 640) {
        const id = PHOTOS[index % PHOTOS.length];
        const h = Math.round(w * 0.75);
        return `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&q=75&fm=jpg`;
    }

    function build() {
        const now = Date.now();
        const hour = 3600000;

        const users = USERS.map(([username, email, role, sellerStatus, district, rating, sales], index) => {
            const d = districtByName(district);
            // Dispersión determinista dentro del distrito: evita que todos los
            // marcadores del mismo distrito caigan exactamente en el mismo punto.
            const jitter = (hashString(username) % 100) / 12000;
            const jitter2 = (hashString(email) % 100) / 12000;

            return {
                id: `u-${String(index + 1).padStart(3, '0')}`,
                username,
                email,
                password_hash: null, // lo rellena mock-api con su propio hash
                avatar_url: null,
                role,
                seller_status: sellerStatus,
                district,
                location: { lat: d.lat + jitter, lng: d.lng - jitter2, district, city: 'Arequipa', country: 'Perú' },
                phone: `+51 9${String(10000000 + (hashString(email) % 89999999)).slice(0, 8)}`,
                bio: role === 'seller'
                    ? 'Vendo artículos de segunda mano en buen estado. Respondo rápido.'
                    : '',
                rating,
                total_posts: 0,
                total_sales: sales,
                verified: sellerStatus === 'approved',
                created_at: new Date(now - (index * 9 + 40) * 24 * hour).toISOString(),
            };
        });

        const approvedSellers = users.filter((u) => u.seller_status === 'approved');

        const posts = RAW_POSTS.map((raw, index) => {
            const [title, categoryId, price, condition, emoji, authorIndex, description] = raw;
            const author = approvedSellers[authorIndex % approvedSellers.length];
            const category = CATEGORIES.find((c) => c.id === categoryId);
            const seed = hashString(title);

            // La mayoría del catálogo está aprobado; unas pocas quedan pendientes
            // para que el panel de administración tenga trabajo desde el inicio.
            let status = 'approved';
            if (index % 13 === 7) status = 'pending';
            if (index % 19 === 11) status = 'rejected';

            const commentCount = seed % 5;
            const comments = Array.from({ length: commentCount }, (_, i) => {
                const commenter = users[(seed + i * 7) % users.length];
                return {
                    id: `cm-${index}-${i}`,
                    post_id: `post-${String(index + 1).padStart(3, '0')}`,
                    author: {
                        id: commenter.id,
                        username: commenter.username,
                        avatar_url: null,
                        role: commenter.role,
                    },
                    text: COMMENT_TEMPLATES[(seed + i * 5) % COMMENT_TEMPLATES.length],
                    created_at: new Date(now - (i * 5 + 1) * hour).toISOString(),
                };
            });

            return {
                id: `post-${String(index + 1).padStart(3, '0')}`,
                title,
                description,
                price,
                condition,
                emoji,
                image_url: photoUrl(index, 640),
                // Respaldo sin red: la interfaz cambia a esto si la foto falla
                fallback_url: createImage(title, emoji),
                images: [
                    { id: `img-${index}`, url: photoUrl(index, 1200), order: 0, is_primary: true },
                ],
                category: { id: category.id, name: category.name, icon: category.icon },
                author: {
                    id: author.id,
                    username: author.username,
                    avatar_url: null,
                    district: author.district,
                    rating: author.rating,
                    verified: author.verified,
                },
                district: author.district,
                location: { ...author.location },
                status,
                rejection_reason: status === 'rejected'
                    ? 'Las fotos no muestran el estado real del artículo.'
                    : null,
                /* Estado de venta, distinto de `status`: aquello es moderación
                   y esto es si el artículo sigue disponible. Una publicación
                   aprobada puede estar reservada, y una reservada puede volver
                   a estar libre si el trato se cae. Unas pocas del catálogo
                   nacen reservadas o vendidas para que el foro se vea vivo. */
                availability: AVAILABILITY[seed % 11] || 'available',
                availability_at: null,
                // Interacciones sociales del foro
                likes: [],
                likes_count: seed % 37,
                interested: [],
                interested_count: seed % 11,
                saves: [],
                saves_count: seed % 8,
                // Cuándo guardó cada persona esta publicación, por su id
                saved_at: {},
                comments,
                comment_count: comments.length,
                views: 20 + (seed % 400),
                // Antigüedad escalonada para que el orden «reciente» tenga sentido
                created_at: new Date(now - (index * 7 + (seed % 5)) * hour).toISOString(),
                updated_at: new Date(now - index * hour).toISOString(),
            };
        });

        // Recuento real de publicaciones aprobadas por autor
        users.forEach((user) => {
            user.total_posts = posts.filter(
                (p) => p.author.id === user.id && p.status === 'approved'
            ).length;
        });

        const categories = CATEGORIES.map((cat) => ({
            ...cat,
            count: posts.filter((p) => p.category.id === cat.id && p.status === 'approved').length,
        }));

        return { users, posts, categories, districts: DISTRICTS };
    }

    global.DiscoverySeed = {
        build,
        createImage,
        hashString,
        CATEGORIES,
        DISTRICTS,
        AREQUIPA_CENTER,
        districtByName,
    };
})(window);
