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

    /* Vendedores aprobados: son quienes RESPONDEN a los pedidos. Cada uno
       tiene un local con nombre, porque en el chat lo primero que dice es
       quién es y dónde está («Hola, soy del local Vintage AQP»). */
    const USERS = [
        ['Juan Pérez', 'juan@discoveryshop.pe', 'seller', 'approved', 'Cayma', 4.8, 142, 'Tecno Cayma'],
        ['María García', 'maria@discoveryshop.pe', 'seller', 'approved', 'Yanahuara', 4.9, 286, 'Tienda Vintage AQP'],
        ['Carlos Quispe', 'carlos@discoveryshop.pe', 'seller', 'approved', 'Cerro Colorado', 4.6, 74, 'Importaciones Quispe'],
        ['Ana Martínez', 'ana@discoveryshop.pe', 'seller', 'approved', 'Paucarpata', 4.7, 198, 'Bazar Martínez'],
        ['Roberto Sánchez', 'roberto@discoveryshop.pe', 'seller', 'approved', 'Socabaya', 5.0, 63, 'El Rincón de Roberto'],
        ['Elena Gómez', 'elena@discoveryshop.pe', 'seller', 'approved', 'José Luis Bustamante y Rivero', 4.9, 231, 'Casa Gómez'],
        ['Diego Torres', 'diego@discoveryshop.pe', 'seller', 'approved', 'Miraflores', 4.5, 47, 'Torres Store'],
        ['Lucía Fernández', 'lucia@discoveryshop.pe', 'seller', 'approved', 'Alto Selva Alegre', 4.8, 155, 'Segunda Vida AQP'],
        ['Fernando Ruiz', 'fernando@discoveryshop.pe', 'seller', 'approved', 'Sachaca', 4.7, 89, 'Ruiz Electrónica'],
        ['Sofía Mendoza', 'sofia@discoveryshop.pe', 'seller', 'approved', 'Cercado', 4.9, 312, 'Mendoza & Co.'],
        ['Pedro Ramírez', 'pedro@discoveryshop.pe', 'seller', 'approved', 'Mariano Melgar', 4.4, 31, 'Todo Usado Melgar'],
        ['Claudia Vargas', 'claudia@discoveryshop.pe', 'seller', 'approved', 'Characato', 4.6, 58, 'Vargas Hogar'],
        // Solicitudes de vendedor a la espera de revisión del administrador
        ['Miguel Castro', 'miguel@discoveryshop.pe', 'buyer', 'pending', 'Tiabaya', 0, 0, 'Castro Repuestos'],
        ['Rosa Núñez', 'rosa@discoveryshop.pe', 'buyer', 'pending', 'Sabandía', 0, 0, 'Deco Rosa'],
        ['Andrés Chávez', 'andres@discoveryshop.pe', 'buyer', 'pending', 'Jacobo Hunter', 0, 0, 'Chávez Import'],
        /* Compradores: en el comercio inverso son la parte activa — son ellos
           quienes publican lo que buscan, así que hacen falta varios para que
           el tablón de pedidos se vea vivo. */
        ['Patricia Ríos', 'patricia@discoveryshop.pe', 'buyer', null, 'Yura', 0, 0, null],
        ['Javier Paredes', 'javier@discoveryshop.pe', 'buyer', null, 'Uchumayo', 0, 0, null],
        ['Gabriela Flores', 'gabriela@discoveryshop.pe', 'buyer', null, 'Cayma', 0, 0, null],
        ['Martín Salazar', 'martin@discoveryshop.pe', 'buyer', null, 'Cercado', 0, 0, null],
        ['Valeria Huamán', 'valeria@discoveryshop.pe', 'buyer', null, 'Yanahuara', 0, 0, null],
        ['Óscar Benavides', 'oscar@discoveryshop.pe', 'buyer', null, 'Paucarpata', 0, 0, null],
        ['Daniela Cáceres', 'daniela@discoveryshop.pe', 'buyer', null, 'Miraflores', 0, 0, null],
        ['Renzo Aguilar', 'renzo@discoveryshop.pe', 'buyer', null, 'Cerro Colorado', 0, 0, null],
        ['Camila Ortiz', 'camila@discoveryshop.pe', 'buyer', null, 'Socabaya', 0, 0, null],
        ['Bruno Delgado', 'bruno@discoveryshop.pe', 'buyer', null, 'Alto Selva Alegre', 0, 0, null],
    ];

    /* ----------------------------------------------------------------------
       Pedidos — lo que la gente BUSCA

       Esto es el comercio inverso: aquí no hay un catálogo de lo que alguien
       vende, sino la lista de lo que alguien necesita. Los vendedores leen
       esto y responden con lo que tienen.

       [título, categoría, presupuestoMín, presupuestoMáx, emoji, índiceComprador, descripción]
       ---------------------------------------------------------------------- */

    const RAW_REQUESTS = [
        ['Lámpara vintage de mesa', 'cat-hogar', 80, 150, '💡', 3, 'Busco una lámpara vintage de mesa, color dorado, estilo antiguo. La quiero para el escritorio del estudio. He recorrido tiendas del centro y online, pero todo lo que encuentro es muy moderno o no se parece a lo que tengo en mente.'],
        ['iPhone 13 Pro 128 GB', 'cat-celulares', 2000, 2500, '📱', 4, 'Busco un iPhone 13 Pro de 128 GB en buen estado, con batería por encima del 85 %. Prefiero que tenga caja y que se pueda revisar antes de cerrar el trato.'],
        ['Samsung Galaxy A54', 'cat-celulares', 800, 1000, '📱', 5, 'Necesito un Galaxy A54 liberado para cualquier operador. No me molesta que tenga marcas de uso mientras la pantalla esté sin rayones y funcione todo.'],
        ['Celular básico para mi mamá', 'cat-celulares', 200, 400, '📱', 6, 'Busco un celular sencillo, con letras grandes y batería que aguante el día. Es para mi mamá, que no usa nada más que llamadas y WhatsApp.'],
        ['MacBook Air M1', 'cat-computo', 2800, 3400, '💻', 7, 'Busco una MacBook Air M1 para diseño. Me interesa saber los ciclos de carga y ver el estado de la pantalla. Puedo recoger en cualquier distrito del centro.'],
        ['PC de escritorio para juegos', 'cat-computo', 2200, 3000, '🖥️', 8, 'Armo mi primer setup y busco una PC que mueva juegos en alto. Mínimo 16 GB de RAM y SSD. Si tiene monitor incluido, mejor.'],
        ['Monitor de 24 pulgadas', 'cat-computo', 300, 450, '🖥️', 9, 'Busco un monitor de 24" que tenga al menos 75 Hz y entrada HDMI. Lo necesito para trabajar desde casa, así que la base regulable sería ideal.'],
        ['Teclado mecánico', 'cat-computo', 100, 200, '⌨️', 10, 'Busco un teclado mecánico, de preferencia con switches azules. Escribo muchas horas al día y el de membrana ya me cansó.'],
        ['iPad para dibujar', 'cat-computo', 900, 1300, '📲', 11, 'Busco un iPad que sirva para ilustración digital. No necesito el último modelo, pero sí que soporte lápiz. Si viene con funda, perfecto.'],
        ['Audífonos con cancelación de ruido', 'cat-audio', 300, 500, '🎧', 12, 'Busco audífonos de diadema con cancelación de ruido, para estudiar en casa con tranquilidad. Que la batería dure al menos ocho horas.'],
        ['Parlante bluetooth resistente al agua', 'cat-audio', 200, 350, '🔊', 0, 'Busco un parlante portátil que suene fuerte y aguante el agua, para llevarlo de viaje. No importa que tenga marcas de uso.'],
        ['AirPods originales', 'cat-audio', 200, 300, '🎧', 1, 'Busco AirPods originales, con su estuche de carga. Que la batería aguante al menos dos horas por carga. Quiero poder probarlos antes.'],
        ['Interfaz de audio para grabar', 'cat-audio', 150, 250, '🎚️', 2, 'Estoy empezando a grabar podcast en casa y busco una interfaz de audio sencilla, de dos canales. Con su cable USB.'],
        ['PlayStation 4 con juegos', 'cat-gaming', 800, 1100, '🎮', 3, 'Busco una PS4 con al menos dos mandos y algunos juegos físicos. Que no haya sido abierta ni reparada. Puedo ir a verla donde me digan.'],
        ['Nintendo Switch', 'cat-gaming', 700, 950, '🕹️', 4, 'Busco una Nintendo Switch, me da igual el modelo, para jugar en viajes. Si tiene mica de vidrio y funda, mucho mejor.'],
        ['Xbox Series S', 'cat-gaming', 1100, 1500, '🎮', 5, 'Busco una Xbox Series S en buen estado, con su mando y cable HDMI. Si todavía tiene garantía sería lo ideal.'],
        ['Silla para escritorio cómoda', 'cat-gaming', 350, 550, '🪑', 6, 'Paso muchas horas sentado y la espalda ya me está pasando factura. Busco una silla con soporte lumbar, no me importa que tenga marcas de uso.'],
        ['Cámara réflex para aprender', 'cat-camaras', 1200, 1600, '📷', 7, 'Quiero aprender fotografía y busco una réflex de entrada con su lente 18-55. Me interesa saber cuántos disparos tiene.'],
        ['GoPro o cámara de acción', 'cat-camaras', 700, 1000, '📹', 8, 'Busco una cámara de acción para grabar en bicicleta. Que grabe al menos en 4K y que venga con algún soporte.'],
        ['Trípode ligero para viajar', 'cat-camaras', 150, 250, '📸', 9, 'Busco un trípode compacto y estable, de los que caben en una mochila. Con su bolso de transporte si es posible.'],
        ['Cafetera espresso', 'cat-hogar', 250, 400, '☕', 10, 'Busco una cafetera espresso con vaporizador para leche. No necesito que sea automática, pero sí que esté bien cuidada.'],
        ['Aspiradora robot', 'cat-hogar', 500, 750, '🤖', 11, 'Busco una aspiradora robot que mapee y vuelva sola a su base. Tengo dos gatos, así que necesito que aguante pelo.'],
        ['Air Fryer grande', 'cat-hogar', 180, 300, '🍳', 12, 'Busco una freidora de aire de al menos 5 litros, somos cuatro en casa. Que la canastilla esté en buen estado.'],
        ['Televisor de 43 pulgadas', 'cat-hogar', 600, 850, '📺', 0, 'Busco un smart TV de 43" que tenga Netflix y YouTube. Que venga con su control original y sin pixeles muertos.'],
        ['Zapatillas talla 42', 'cat-moda', 150, 250, '👟', 1, 'Busco zapatillas talla 42, de preferencia blancas y sin roturas. Las quiero para el día a día, no para deporte.'],
        ['Casaca de cuero talla M', 'cat-moda', 220, 350, '🧥', 2, 'Busco una casaca de cuero genuino talla M, color oscuro. Que el forro interior esté entero.'],
        ['Reloj resistente para trabajo de campo', 'cat-moda', 180, 300, '⌚', 3, 'Trabajo en obra y necesito un reloj que aguante golpes y agua. No busco marca en particular, sí que sea resistente de verdad.'],
        ['Mochila para laptop', 'cat-moda', 70, 130, '🎒', 4, 'Busco una mochila con compartimento acolchado para laptop de 15". Que los cierres funcionen bien, es para uso diario.'],
        ['Bicicleta montañera aro 29', 'cat-deportes', 700, 950, '🚲', 5, 'Busco una montañera aro 29 con frenos de disco. La quiero para la ciclovía y salidas de fin de semana. Prefiero que las llantas estén bien.'],
        ['Mancuernas o pesas para casa', 'cat-deportes', 120, 250, '🏋️', 6, 'Busco un set de mancuernas ajustables, unos 20 kg en total. Que no tengan óxido. Puedo recogerlas yo.'],
        ['Patineta eléctrica', 'cat-deportes', 500, 750, '🛹', 7, 'Busco una patineta eléctrica con al menos 15 km de autonomía, para moverme al trabajo. Que la batería esté sana.'],
        ['Guitarra acústica para principiante', 'cat-instrumentos', 350, 550, '🎸', 8, 'Empiezo clases el próximo mes y busco una guitarra acústica de estudio. Con funda si se puede. Prefiero que tenga cuerdas nuevas.'],
        ['Teclado o piano digital', 'cat-instrumentos', 300, 500, '🎹', 9, 'Busco un teclado de 61 teclas para que mi hija empiece a aprender. Con atril y adaptador de corriente.'],
        ['Cajón peruano', 'cat-instrumentos', 180, 280, '🥁', 10, 'Busco un cajón de cedro con buen sonido grave. Es para tocar en casa y en reuniones, no necesito que esté impecable.'],
        ['Colección Harry Potter', 'cat-libros', 220, 320, '📚', 11, 'Busco la colección completa de Harry Potter, de preferencia tapa dura y sin subrayados. Es un regalo.'],
        ['Libros de ingeniería civil', 'cat-libros', 100, 200, '📖', 12, 'Busco libros de estructuras y concreto armado para la universidad. No me molesta que tengan anotaciones a lápiz.'],
        ['Coche para bebé', 'cat-bebes', 250, 400, '🧸', 0, 'Busco un coche reclinable que se pliegue fácil para el maletero. Que las ruedas estén en buen estado.'],
        ['Corral de juegos', 'cat-bebes', 130, 220, '🧸', 1, 'Busco un corral plegable con malla sin roturas. Lo necesito solo por unos meses, así que no busco nada de estreno.'],
        ['Casco para moto talla L', 'cat-vehiculos', 120, 200, '🪖', 2, 'Busco un casco talla L certificado, con el visor sin rayones profundos. El interior tiene que estar limpio.'],
        ['Llantas aro 15', 'cat-vehiculos', 400, 600, '🚗', 3, 'Busco un juego de cuatro llantas aro 15 con al menos la mitad de vida útil. Sin parches ni deformaciones.'],
    ];

    /* Cómo responde un vendedor al abrir la conversación. El primer mensaje
       dice quién es, dónde está y cuánto cuesta — igual que en el storyboard. */
    const OFFER_TEMPLATES = [
        'Hola, soy de {tienda}. Lo que buscas está disponible. Estamos en {distrito} y el precio es de S/ {precio}. Te adjunto fotos.',
        'Buenas, te escribo de {tienda}. Tengo justo lo que pides, en {distrito}. Lo dejo en S/ {precio} y puedes venir a verlo cuando quieras.',
        'Hola, en {tienda} tenemos uno en buen estado. Precio S/ {precio}. Estamos en {distrito}, puedes pasar a revisarlo sin compromiso.',
        'Qué tal, soy de {tienda}. Me llegó tu pedido y sí lo tengo. S/ {precio}, y si lo recoges esta semana lo conversamos.',
    ];

    /** Comentarios verosímiles para poblar las conversaciones del foro. */
    /* Estado de venta repartido por el catálogo. Once posiciones para que
       `seed % 11` reparta: la mayoría disponibles, dos reservadas y una
       vendida, que es más o menos lo que se ve en un tablón real. */
    /* Hasta dónde cede quien pide: lo primero que un vendedor mira para
       decidir si le merece la pena contestar. */
    const ACCEPTS = ['Solo nuevo', 'Como nuevo o mejor', 'Cualquiera que funcione'];

    const AVAILABILITY = [
        'available', 'available', 'available', 'reserved', 'available',
        'available', 'sold', 'available', 'available', 'reserved', 'available',
    ];

    /* Comentarios públicos sobre un pedido. No negocian precio: eso va por
       privado con quien ya ofreció. Aquí se afina qué es exactamente lo que
       hace falta, que es lo que permite ofrecer algo que sirva. */
    const COMMENT_TEMPLATES = [
        '¿Te sirve de otro color o tiene que ser ese?',
        'Yo vi uno parecido en el centro la semana pasada.',
        '¿Lo necesitas con garantía o te da igual de segunda mano?',
        '¿Hasta cuánto podrías estirar el presupuesto?',
        'Justo ando buscando lo mismo, aviso si encuentro.',
        '¿Para cuándo lo necesitas?',
        '¿Aceptarías uno con detalles estéticos si funciona bien?',
        '¿Puedes recogerlo tú o necesitas que te lo lleven?',
        '¿Alguna marca en concreto o cualquiera vale?',
        'Ojo que ese modelo ya no se consigue nuevo.',
        '¿Te interesa que te avise si aparece uno usado?',
        '¿En qué distrito te queda cómodo recogerlo?',
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

        const users = USERS.map(([username, email, role, sellerStatus, district, rating, sales, shopName], index) => {
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
                // El nombre del local: es lo primero que dice un vendedor al
                // responder un pedido, y lo que el comprador ve en el chat.
                shop_name: shopName || null,
                district,
                location: { lat: d.lat + jitter, lng: d.lng - jitter2, district, city: 'Arequipa', country: 'Perú' },
                phone: `+51 9${String(10000000 + (hashString(email) % 89999999)).slice(0, 8)}`,
                bio: sellerStatus === 'approved'
                    ? `Atendemos pedidos desde ${shopName}. Respondemos el mismo día.`
                    : '',
                rating,
                rating_count: 0,
                // Pedidos publicados como comprador y ofertas enviadas como vendedor
                total_requests: 0,
                total_offers: 0,
                total_sales: sales,
                verified: sellerStatus === 'approved',
                created_at: new Date(now - (index * 9 + 40) * 24 * hour).toISOString(),
            };
        });

        const approvedSellers = users.filter((u) => u.seller_status === 'approved');
        // Cualquiera que no sea vendedor aprobado publica pedidos: los tres con
        // solicitud en revisión siguen siendo compradores mientras tanto.
        const buyers = users.filter((u) => u.role === 'buyer');

        /* ------------------------------------------------------------------
           Pedidos
           ------------------------------------------------------------------ */

        /**
         * Comentarios públicos de un pedido. Aquí no se negocia el precio —
         * eso va por privado con quien ya hizo una oferta. Aquí se pregunta
         * lo que falta por saber para poder ofrecer algo que sirva.
         */
        function buildComments(requestId, seed, everyone) {
            const howMany = seed % 4;

            return Array.from({ length: howMany }, (_, i) => {
                const person = everyone[(seed + i * 7) % everyone.length];
                return {
                    id: `cm-${requestId}-${i}`,
                    request_id: requestId,
                    author: {
                        id: person.id,
                        username: person.username,
                        avatar_url: null,
                        role: person.role,
                    },
                    text: COMMENT_TEMPLATES[(seed + i * 5) % COMMENT_TEMPLATES.length],
                    created_at: new Date(now - (i * 5 + 1) * hour).toISOString(),
                };
            });
        }

        const requests = RAW_REQUESTS.map((raw, index) => {
            const [title, categoryId, budgetMin, budgetMax, emoji, buyerIndex, description] = raw;
            const buyer = buyers[buyerIndex % buyers.length];
            const category = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
            const seed = hashString(title);

            // Casi todos aprobados; unos pocos en revisión y alguno rechazado,
            // para que el panel de administración tenga trabajo desde el inicio.
            let status = 'approved';
            if (index % 13 === 5) status = 'pending';
            else if (index % 19 === 7) status = 'rejected';

            return {
                id: `req-${String(index + 1).padStart(3, '0')}`,
                title,
                description,
                emoji,
                condition: ACCEPTS[seed % ACCEPTS.length],
                /* Una foto de referencia: no es el objeto de nadie, es un ejemplo
                   de lo que se busca — que es justo lo que ayuda a un vendedor
                   a reconocerlo. El SVG generado queda de respaldo por si la
                   foto no carga, para que nunca haya un hueco roto. */
                image_url: photoUrl(index, 640),
                fallback_url: createImage(title, emoji),
                budget_min: budgetMin,
                budget_max: budgetMax,
                category: { id: category.id, name: category.name, icon: category.icon },
                buyer: {
                    id: buyer.id,
                    username: buyer.username,
                    avatar_url: null,
                    district: buyer.district,
                    rating: buyer.rating,
                    verified: buyer.verified,
                },
                district: buyer.district,
                location: { ...buyer.location },
                // Moderación, igual que antes
                status,
                rejection_reason: status === 'rejected'
                    ? 'El pedido no describe con claridad qué se está buscando.'
                    : null,
                /* Ciclo de vida del pedido, independiente de la moderación:
                   abierto → emparejado (hay una oferta aceptada) → cumplido. */
                state: 'open',
                accepted_offer_id: null,
                offers_count: 0,
                /* «También lo busco»: en el comercio inverso esto no es un
                   aplauso, es demanda acumulada — y es lo que hace que a un
                   vendedor le merezca la pena contestar. */
                me_too: [],
                me_too_count: seed % 7,
                saves: [],
                saves_count: seed % 5,
                saved_at: {},
                comments: buildComments(`req-${String(index + 1).padStart(3, '0')}`, seed, users),
                comment_count: 0,
                views: 12 + (seed % 260),
                created_at: new Date(now - (index * 6 + (seed % 5)) * hour).toISOString(),
                updated_at: new Date(now - index * hour).toISOString(),
            };
        });

        requests.forEach((request) => { request.comment_count = request.comments.length; });

        /* ------------------------------------------------------------------
           Ofertas de los vendedores
           ------------------------------------------------------------------ */

        const offers = [];

        /** Precio verosímil dentro del presupuesto que pidió el comprador. */
        function priceFor(request, salt) {
            const span = Math.max(0, request.budget_max - request.budget_min);
            const offset = span ? (hashString(request.id + salt) % (span + 1)) : 0;
            return request.budget_min + offset;
        }

        function makeOffer(request, seller, index, ageHours) {
            const price = priceFor(request, seller.id);
            const template = OFFER_TEMPLATES[hashString(seller.id + request.id) % OFFER_TEMPLATES.length];

            return {
                id: `off-${String(offers.length + 1).padStart(3, '0')}`,
                request_id: request.id,
                request_title: request.title,
                seller: {
                    id: seller.id,
                    username: seller.username,
                    avatar_url: null,
                    shop_name: seller.shop_name,
                    district: seller.district,
                    rating: seller.rating,
                    verified: seller.verified,
                },
                message: template
                    .replace('{tienda}', seller.shop_name)
                    .replace('{distrito}', seller.district)
                    .replace('{precio}', price.toFixed(2)),
                price,
                // Las fotos sí son reales: el vendedor tiene el artículo delante
                photos: [
                    { id: `ph-${index}-0`, url: photoUrl(index, 900) },
                    { id: `ph-${index}-1`, url: photoUrl(index + 7, 900) },
                ],
                shop_name: seller.shop_name,
                district: seller.district,
                location: { ...seller.location },
                status: 'pending',
                created_at: new Date(now - ageHours * hour).toISOString(),
            };
        }

        requests
            .filter((request) => request.status === 'approved')
            .forEach((request, i) => {
                // Cuántos vendedores contestan: la mayoría de pedidos recibe una
                // o dos respuestas, algunos ninguna y unos pocos varias.
                const howMany = [1, 2, 0, 1, 3, 1, 0, 2][i % 8];

                for (let k = 0; k < howMany; k += 1) {
                    const seller = approvedSellers[
                        (hashString(request.id) + k * 5) % approvedSellers.length
                    ];
                    if (offers.some((o) => o.request_id === request.id && o.seller.id === seller.id)) continue;

                    offers.push(makeOffer(request, seller, i + k, (i % 20) + k + 1));
                }
            });

        /* El pedido del storyboard: la lámpara de Patricia, con la oferta de la
           Tienda Vintage AQP a S/ 120 esperando respuesta. Así, al entrar con su
           cuenta, el recorrido completo — aviso, aceptar, chat, compra,
           calificación — se puede caminar de principio a fin. */
        const lamp = requests[0];
        const vintage = users.find((u) => u.shop_name === 'Tienda Vintage AQP');

        if (lamp && vintage && lamp.status === 'approved') {
            const existing = offers.findIndex((o) => o.request_id === lamp.id);
            const storyOffer = {
                ...makeOffer(lamp, vintage, 0, 2),
                id: 'off-story',
                price: 120,
                message: 'Hola, soy del local Vintage AQP. Tu lámpara está disponible. '
                    + 'Estamos en el centro de Arequipa, por la calle San Francisco 123. '
                    + 'El precio es de S/ 120.00. Te adjunto fotos.',
                shop_address_hint: 'Calle San Francisco 123, Cercado',
            };

            if (existing === -1) offers.unshift(storyOffer);
            else offers.splice(existing, 1, storyOffer);
        }

        /* ------------------------------------------------------------------
           Tratos ya cerrados, con su calificación

           Sin esto la reputación de los vendedores sería otra vez un número
           inventado. Con esto las estrellas del perfil salen de compras reales.
           ------------------------------------------------------------------ */

        const deals = [];
        const RATING_COMMENTS = [
            '¡Todo excelente! El vendedor fue muy amable y el producto es tal como lo esperaba.',
            'Muy buena atención, respondió rápido y el artículo estaba en perfecto estado.',
            'Cumplió con lo acordado y nos encontramos sin problema. Lo recomiendo.',
            'El producto llegó tal cual las fotos. Trato rápido y honesto.',
            'Buena experiencia, aunque tardó un poco en contestar el primer mensaje.',
            'Me avisó apenas lo tuvo listo y coincidimos en el centro. Impecable.',
        ];

        /** Cierra un pedido con una oferta y deja la compra calificada. */
        function closeDeal(request, offer, stars, ageDays) {
            offer.status = 'accepted';
            request.state = 'fulfilled';
            request.accepted_offer_id = offer.id;
            request.updated_at = new Date(now - ageDays * 24 * hour).toISOString();

            deals.push({
                id: `deal-${String(deals.length + 1).padStart(3, '0')}`,
                request_id: request.id,
                request_title: request.title,
                offer_id: offer.id,
                buyer_id: request.buyer.id,
                buyer_name: request.buyer.username,
                seller_id: offer.seller.id,
                seller_name: offer.seller.username,
                shop_name: offer.seller.shop_name,
                price: offer.price,
                confirmed_at: new Date(now - ageDays * 24 * hour).toISOString(),
                rating: {
                    stars,
                    comment: RATING_COMMENTS[(stars + ageDays) % RATING_COMMENTS.length],
                    created_at: new Date(now - (ageDays - 1) * 24 * hour).toISOString(),
                },
            });
        }

        /* Historial de cada local: pedidos antiguos ya cerrados.
           No son relleno. Son las compras de las que sale la reputación, y sin
           ellas las estrellas del perfil volverían a ser un número inventado
           — que es justamente lo que este modelo vino a arreglar. */
        const HISTORY_PER_SELLER = 3;
        const HISTORY_STARS = [5, 5, 4, 5, 4, 5, 5, 3, 5, 4, 5, 5];

        approvedSellers.forEach((seller, sIndex) => {
            for (let k = 0; k < HISTORY_PER_SELLER; k += 1) {
                const raw = RAW_REQUESTS[(sIndex * 5 + k * 7) % RAW_REQUESTS.length];
                const [title, categoryId, budgetMin, budgetMax, emoji, , description] = raw;
                const category = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
                const buyer = buyers[(sIndex * 3 + k) % buyers.length];
                const ageDays = 8 + sIndex * 2 + k * 5;

                const request = {
                    id: `req-h${String(sIndex + 1).padStart(2, '0')}${k}`,
                    title,
                    description,
                    emoji,
                    condition: ACCEPTS[(sIndex + k) % ACCEPTS.length],
                    image_url: photoUrl(sIndex * 3 + k, 640),
                    fallback_url: createImage(title, emoji),
                    budget_min: budgetMin,
                    budget_max: budgetMax,
                    category: { id: category.id, name: category.name, icon: category.icon },
                    buyer: {
                        id: buyer.id,
                        username: buyer.username,
                        avatar_url: null,
                        district: buyer.district,
                        rating: buyer.rating,
                        verified: buyer.verified,
                    },
                    district: buyer.district,
                    location: { ...buyer.location },
                    status: 'approved',
                    rejection_reason: null,
                    state: 'open',
                    accepted_offer_id: null,
                    offers_count: 0,
                    me_too: [],
                    me_too_count: (sIndex + k) % 5,
                    saves: [],
                    saves_count: (sIndex + k) % 3,
                    saved_at: {},
                    comments: [],
                    comment_count: 0,
                    views: 30 + ((sIndex * 7 + k) % 200),
                    created_at: new Date(now - (ageDays + 3) * 24 * hour).toISOString(),
                    updated_at: new Date(now - ageDays * 24 * hour).toISOString(),
                };

                requests.push(request);

                const offer = makeOffer(request, seller, sIndex * 3 + k, (ageDays + 1) * 24);
                offers.push(offer);

                closeDeal(request, offer, HISTORY_STARS[(sIndex + k) % HISTORY_STARS.length], ageDays);
            }
        });

        /* Y unos pocos de los pedidos recientes que también acabaron en compra,
           para que el tablón no parezca que solo se cerraban cosas hace un mes. */
        offers.slice(4, 24).forEach((offer, i) => {
            if (i % 5 !== 0) return;

            const request = requests.find((r) => r.id === offer.request_id);
            if (!request || request.state !== 'open') return;

            closeDeal(request, offer, [5, 4, 5, 5][i % 4], (i % 6) + 2);
        });

        /* ------------------------------------------------------------------
           Recuentos derivados
           ------------------------------------------------------------------ */

        requests.forEach((request) => {
            request.offers_count = offers.filter((o) => o.request_id === request.id).length;
        });

        users.forEach((user) => {
            user.total_requests = requests.filter(
                (r) => r.buyer.id === user.id && r.status === 'approved'
            ).length;

            user.total_offers = offers.filter((o) => o.seller.id === user.id).length;

            // La reputación sale de las compras calificadas, no de un número puesto a mano
            const mine = deals.filter((d) => d.seller_id === user.id && d.rating);
            if (mine.length) {
                const sum = mine.reduce((total, d) => total + d.rating.stars, 0);
                user.rating = Math.round((sum / mine.length) * 10) / 10;
                user.rating_count = mine.length;
                user.total_sales = mine.length;
            } else if (user.seller_status === 'approved') {
                // Todavía sin calificaciones: se dice, en vez de inventar estrellas
                user.rating = 0;
                user.rating_count = 0;
                user.total_sales = 0;
            }
        });

        // La reputación que viaja dentro de cada oferta tiene que ser la misma
        offers.forEach((offer) => {
            const seller = users.find((u) => u.id === offer.seller.id);
            if (seller) {
                offer.seller.rating = seller.rating;
                offer.seller.rating_count = seller.rating_count;
            }
        });

        const categories = CATEGORIES.map((cat) => ({
            ...cat,
            count: requests.filter((r) => r.category.id === cat.id && r.status === 'approved').length,
        }));

        return { users, requests, offers, deals, categories, districts: DISTRICTS };
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
