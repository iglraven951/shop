/**
 * DiscoveryShop · El vendedor al otro lado
 *
 * En modo demostración no hay nadie escribiendo de verdad. Lo que había antes
 * eran siete frases fijas: preguntabas dos veces el precio y contestaba lo
 * mismo, pedías rebaja y respondía lo mismo que a «¿cuánto cuesta?». Se notaba
 * al segundo mensaje.
 *
 * Esto es otra cosa. El vendedor **recuerda** la conversación y **negocia de
 * verdad**: tiene un precio de partida, un suelo por debajo del cual no baja,
 * y va cediendo cada vez menos. Si ofreces por encima del suelo, acepta; si
 * ofreces por debajo, contraoferta; si insistes cuando ya llegó al suelo, te
 * lo dice y deja de moverse. También sabe hasta cuándo te lo guarda, dónde
 * quedan, si hay boleta, si acepta Yape, si tiene más de uno.
 *
 * La memoria vive en `conversation.haggle`, así que sobrevive a recargar la
 * página igual que los mensajes: reabres el chat al día siguiente y el
 * vendedor sigue en el precio al que había bajado, no vuelve al de salida.
 *
 * Nada de esto consulta un servicio externo. Es un árbol de intenciones sobre
 * el texto normalizado, con un estado de regateo al lado.
 */
(function (global) {
    'use strict';

    /* ======================================================================
       Utilidades
       ====================================================================== */

    const normalize = (text) => String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    /* Nadie regatea con céntimos: «S/ 320» es como se habla, «S/ 320.00» es
       como se factura. Los decimales solo aparecen si de verdad los hay. */
    const soles = (amount) => {
        const value = Number(amount || 0);
        return `S/ ${Number.isInteger(value) ? value : value.toFixed(2)}`;
    };

    /** Redondeo a cinco soles: nadie regatea hasta los céntimos. */
    const round5 = (amount) => Math.max(5, Math.round(amount / 5) * 5);

    const pick = (list, seed) => list[Math.abs(seed) % list.length];

    /** Une dos frases sin duplicar la puntuación: «¡Hola!. Sí, tengo…» no. */
    const join = (head, tail) => `${head}${/[.!?]$/.test(head) ? '' : '.'} ${tail}`;

    /** Número estable a partir de un texto, para que cada vendedor sea igual
        a sí mismo entre sesiones en vez de cambiar de carácter al recargar. */
    function seedOf(text) {
        let hash = 0;
        const value = String(text || '');
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
        }
        return hash;
    }

    /* ======================================================================
       Carácter

       Tres maneras de hablar. No cambian lo que el vendedor concede —eso lo
       decide el regateo— sino cómo lo dice, que es lo que evita que cuatro
       conversaciones abiertas a la vez suenen a la misma persona.
       ====================================================================== */

    const VOICES = [
        {
            hello: ['¡Hola! Claro que sí', '¡Buenas!', 'Hola, qué tal'],
            yes: ['Claro que sí', 'Por supuesto', 'Sí, sin problema'],
            close: ['Cualquier cosa me escribes.', 'Quedo atento.', 'Avísame nomás.'],
        },
        {
            hello: ['Buenas, gracias por escribir', 'Hola, buenas', 'Qué tal, buenas'],
            yes: ['Así es', 'Correcto', 'Efectivamente'],
            close: ['Quedo pendiente de tu respuesta.', 'Me confirmas y coordinamos.',
                'Cualquier duda, con confianza.'],
        },
        {
            hello: ['¡Hola!', '¡Qué tal!', 'Hola'],
            yes: ['Sí pues', 'Claro', 'Sí, tranquilo'],
            close: ['Ahí me dices.', 'Cualquier cosa avísame.', 'Me avisas y lo vemos.'],
        },
    ];

    /* ======================================================================
       Intenciones

       Cada una con sus palabras. El orden importa: se evalúan de la más
       específica a la más general, porque «hasta cuándo me lo dejas» lleva
       «dejas», que también aparece en «en cuánto me lo dejas» (precio).
       ====================================================================== */

    const has = (text, words) => words.some((w) => text.includes(w));

    /** Cuánto ofrece el comprador, si es que ofrece una cifra. */
    function offeredAmount(text, raw) {
        /* «te doy 100», «100 soles», «S/ 90», «lo dejas en 80».
           Se descartan los números que son otra cosa: años, cantidades
           («llevo 2»), horas («a las 5»). */
        if (/\b(a las|año|anio|modelo)\b/.test(text)) return null;

        const match = String(raw).match(/(?:s\/\s*)?(\d{2,5})(?:\s*(?:soles|lucas))?/i);
        if (!match) return null;

        const amount = Number(match[1]);
        return Number.isFinite(amount) && amount >= 10 ? amount : null;
    }

    /* ======================================================================
       El estado del regateo

       `floor` es el suelo: por debajo no baja, y es el 82 % del precio de la
       oferta —bastante para que ceder se note, poco para que el regateo no
       sea gratis—. `step` es lo que cede la próxima vez, y se reduce a la
       mitad en cada ronda: la primera rebaja es generosa, la cuarta es
       simbólica. Así se comporta quien de verdad tiene un margen.
       ====================================================================== */

    function haggleState(conversation) {
        if (!conversation.haggle) {
            const price = Number(conversation.price) || 0;
            conversation.haggle = {
                start: price,
                current: price,
                floor: round5(price * 0.82),
                step: Math.max(5, round5(price * 0.07)),
                rounds: 0,
                firm: false,
                topics: [],
                held_until: null,
                deal: false,
            };
        }
        return conversation.haggle;
    }

    const seen = (state, topic) => state.topics.includes(topic);

    function mark(state, topic) {
        if (!state.topics.includes(topic)) state.topics.push(topic);
    }

    /** Cede un escalón, nunca por debajo del suelo. */
    function concede(state) {
        if (state.current <= state.floor) {
            state.firm = true;
            return state.current;
        }

        const next = Math.max(state.floor, round5(state.current - state.step));
        state.current = next;
        state.rounds += 1;
        state.step = Math.max(5, round5(state.step / 2));

        if (next <= state.floor) state.firm = true;
        return next;
    }

    /* ======================================================================
       Disponibilidad

       «¿Hasta cuándo me lo dejas?» era la pregunta que el vendedor viejo no
       sabía responder. Ahora reserva de verdad: fija una fecha, la recuerda,
       y si vuelves a preguntar te dice los días que quedan en vez de repetir
       la frase.
       ====================================================================== */

    const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves',
        'viernes', 'sábado'];

    function holdUntil(state, days) {
        const until = new Date();
        until.setDate(until.getDate() + days);
        state.held_until = until.toISOString();
        return until;
    }

    function describeDate(iso) {
        const date = new Date(iso);
        const today = new Date();
        const diff = Math.round((date - today) / 86400000);

        if (diff <= 0) return 'hoy mismo';
        if (diff === 1) return 'mañana';
        return `el ${DAY_NAMES[date.getDay()]} ${date.getDate()}`;
    }

    /* ======================================================================
       Las respuestas
       ====================================================================== */

    /**
     * Qué contesta el vendedor.
     *
     * @param {object} conversation  la conversación completa, que se muta:
     *                               aquí vive la memoria del regateo
     * @param {string} raw           lo que acaba de escribir el comprador
     * @returns {{text: string, photos?: string[]}}
     */
    function reply(conversation, raw) {
        const text = normalize(raw);
        const state = haggleState(conversation);
        const seed = seedOf(conversation.seller && conversation.seller.id);
        const voice = VOICES[Math.abs(seed) % VOICES.length];
        const say = (list) => pick(list, seed + state.topics.length);

        const district = (conversation.seller && conversation.seller.district) || 'el centro';
        const item = conversation.request_title || 'lo que buscas';
        const photos = conversation.photos_of_offer || [];

        /* ---- Trato cerrado ------------------------------------------- */
        if (has(text, ['lo llevo', 'me lo llevo', 'lo compro', 'trato hecho', 'cerramos',
            'de acuerdo', 'acepto', 'quedamos asi', 'ya esta', 'hecho'])) {
            state.deal = true;
            const until = state.held_until || holdUntil(state, 3).toISOString();
            return {
                text: `¡Excelente! Entonces queda en ${soles(state.current)}. Te lo aparto hasta ${describeDate(until)} y coordinamos dónde nos vemos en ${district}. ${say(voice.close)}`,
            };
        }

        /* ---- Una cifra concreta sobre la mesa -------------------------- */
        const offer = has(text, ['te doy', 'te ofrezco', 'me lo dejas en', 'lo dejas en',
            'seria en', 'pago', 'puedo pagar', 'mi presupuesto', 'tengo'])
            ? offeredAmount(text, raw)
            : null;

        if (offer !== null) {
            mark(state, 'precio');

            if (offer >= state.current) {
                state.current = offer;
                state.deal = true;
                return {
                    text: `${say(voice.yes)}, por ${soles(offer)} cerramos. Te lo aparto y me dices cuándo puedes pasar por ${district}.`,
                };
            }

            if (offer >= state.floor) {
                state.current = offer;
                state.firm = true;
                return {
                    text: `Ya pues, ${soles(offer)} está bien. Es mi último precio, ya no puedo bajar más de ahí. ¿Lo cerramos?`,
                };
            }

            const counter = concede(state);
            const gap = state.floor - offer;
            const soft = gap <= state.floor * 0.12;

            return {
                text: soft
                    ? `Estamos cerca. ${soles(offer)} ya no me da, pero te lo dejo en ${soles(counter)} y cerramos hoy mismo.`
                    : `${soles(offer)} está muy por debajo, no me alcanza. Lo mejor que puedo hacer es ${soles(counter)}. ¿Te sirve?`,
            };
        }

        /* ---- Comparación con otra oferta -------------------------------

           Va antes que la rebaja a propósito: «lo vi más barato en otro lado»
           lleva dentro «más barato», y si se mirara primero la rebaja, este
           caso no llegaría nunca a su rama. */
        if (has(text, ['mas barato en', 'otro me lo deja', 'otra oferta', 'me ofrecieron',
            'vi uno', 'en otro lado', 'mercado libre', 'marketplace', 'facebook',
            'olx', 'otro vendedor'])) {
            mark(state, 'competencia');
            const next = state.firm ? state.current : concede(state);
            return {
                text: state.firm
                    ? `Puede ser, hay de todo. Lo que yo te ofrezco es que lo veas y lo pruebes antes de pagar, y que quede boleta de por medio. En precio ya estoy en ${soles(next)}, que es mi tope.`
                    : `Puede ser, hay de todo. Lo que te ofrezco es que lo veas antes de pagar y que quede boleta de por medio. Si te sirve, te lo dejo en ${soles(next)} y lo cerramos ahora.`,
            };
        }

        /* ---- Rebaja, sin cifra ----------------------------------------- */
        /* «¿En cuánto quedamos?» es recapitular, no regatear: quien lo
           pregunta quiere el número acordado, no otro más bajo. */
        if (has(text, ['en cuanto quedamos', 'cuanto quedamos', 'cual era el precio',
            'cuanto era', 'en cuanto habiamos', 'quedamos en'])) {
            return {
                text: `Quedamos en ${soles(state.current)}${state.firm ? ', que es mi último precio' : ''}. ${state.held_until ? `Y te lo tengo apartado hasta ${describeDate(state.held_until)}.` : '¿Lo cerramos?'}`,
            };
        }

        if (has(text, ['rebaja', 'descuento', 'mas barato', 'menos', 'bajar', 'baja',
            'oferta', 'promocion', 'ultimo precio', 'precio final', 'negociable',
            'caro', 'se puede menos'])) {
            mark(state, 'precio');

            if (state.firm || state.current <= state.floor) {
                /* Insistir tiene respuesta, pero no la misma tres veces: quien
                   ya dijo que no puede bajar más cambia de argumento, no repite
                   el mismo párrafo hasta que te canses. */
                state.pushes = (state.pushes || 0) + 1;

                const excusas = [
                    `Te entiendo, pero ${soles(state.current)} ya es lo más bajo que puedo. Por debajo de ahí ya no me conviene. Eso sí, si lo recoges tú en ${district} te ahorras el envío.`,
                    `De verdad que no me da para más, ${soles(state.current)} es el tope. Lo que sí puedo hacer es acercártelo yo sin cobrarte el viaje.`,
                    `Ya bajé todo lo que podía. Si el precio no te cuadra lo entiendo perfectamente, y si más adelante te animas aquí estoy.`,
                ];

                /* Las tres primeras van en escalada; a partir de ahí rotan.
                   Quedarse clavado en la última convierte la insistencia en un
                   eco, que es exactamente lo que se quería quitar. */
                return { text: excusas[(state.pushes - 1) % excusas.length] };
            }

            const next = concede(state);
            const first = state.rounds === 1;

            return {
                text: first
                    ? `${say(voice.yes)}, algo se puede. De ${soles(state.start)} te lo dejo en ${soles(next)} si lo ves esta semana.`
                    : `Mmm, apretando un poco más: ${soles(next)}. Ya con eso me quedo casi sin margen.`,
            };
        }

        /* ---- Hasta cuándo lo guarda ------------------------------------ */
        if (has(text, ['hasta cuando', 'cuanto tiempo', 'me lo guardas', 'me lo apartas',
            'apartar', 'reservar', 'reserva', 'lo tienes hasta', 'me esperas',
            'separar', 'guardarmelo'])) {
            if (state.held_until) {
                return {
                    text: `Como quedamos, te lo tengo apartado hasta ${describeDate(state.held_until)}. Si necesitas un par de días más, avísame y lo vemos.`,
                };
            }

            const until = holdUntil(state, 3);
            mark(state, 'reserva');
            return {
                text: `Te lo puedo guardar hasta ${describeDate(until.toISOString())}, sin compromiso. Después de esa fecha sí tendría que ofrecerlo a los demás, porque hay gente preguntando. ${say(voice.close)}`,
            };
        }

        /* ---- Dónde ----------------------------------------------------- */
        if (has(text, ['donde', 'zona', 'distrito', 'direccion', 'ubicacion', 'lugar',
            'por donde', 'como llego', 'punto de encuentro', 'nos vemos'])) {
            mark(state, 'lugar');
            return {
                text: `Estoy en ${district}. Podemos vernos en un sitio céntrico y con gente —una plaza o un centro comercial— para que estés tranquilo. Tú dime qué te queda mejor.`,
            };
        }

        /* ---- Cuándo ---------------------------------------------------- */
        if (has(text, ['cuando', 'a que hora', 'que hora', 'hoy', 'mañana', 'manana',
            'sabado', 'domingo', 'tarde', 'mañana temprano', 'horario', 'disponible hoy'])) {
            mark(state, 'hora');
            return {
                text: `Yo puedo casi todo el día; entre las 10 de la mañana y las 7 de la noche me acomodo sin problema. Dime la hora que te venga bien y ahí estoy.`,
            };
        }

        /* ---- Estado y uso ---------------------------------------------- */
        if (has(text, ['estado', 'condicion', 'usado', 'nuevo', 'funciona', 'falla',
            'detalle', 'golpe', 'rayado', 'rayon', 'conservado', 'cuanto uso',
            'tiempo de uso', 'esta bien'])) {
            mark(state, 'estado');
            return {
                text: `Está tal cual lo puse en la oferta: funciona perfecto y no tiene fallas. Tiene el uso normal de haberlo tenido, nada que afecte. Cuando lo veas en persona lo pruebas con calma antes de decidir.`,
            };
        }

        /* ---- Garantía -------------------------------------------------- */
        if (has(text, ['garantia', 'devolucion', 'devolver', 'cambio si', 'respaldo'])) {
            mark(state, 'garantia');
            return {
                text: `Te doy garantía de una semana por cualquier falla de funcionamiento. Lo importante es que lo pruebes delante de mí cuando nos veamos: así los dos quedamos tranquilos.`,
            };
        }

        /* ---- Boleta y factura ------------------------------------------ */
        if (has(text, ['boleta', 'factura', 'comprobante', 'recibo', 'ruc'])) {
            mark(state, 'boleta');
            return {
                text: `Sí, te puedo dar boleta sin problema. Si necesitas factura con RUC, avísame antes para tenerla lista el día que nos veamos.`,
            };
        }

        /* ---- Pago ------------------------------------------------------ */
        if (has(text, ['yape', 'plin', 'transferencia', 'efectivo', 'tarjeta', 'pago',
            'pagar', 'deposito', 'cuotas', 'adelanto'])) {
            mark(state, 'pago');
            return {
                text: `Acepto efectivo, Yape o Plin, lo que te sea más cómodo. Si prefieres, pagas todo al momento de verlo; no hace falta adelanto.`,
            };
        }

        /* ---- Envío ----------------------------------------------------- */
        if (has(text, ['envio', 'delivery', 'despacho', 'mandar', 'enviar', 'olva',
            'shalom', 'provincia', 'a domicilio'])) {
            mark(state, 'envio');
            return {
                text: `Dentro de Arequipa te lo puedo llevar y el costo lo vemos según el distrito. A provincia lo mando por agencia, pero el envío lo asumirías tú. Si lo recoges en ${district} te sale gratis.`,
            };
        }

        /* ---- Fotos: aquí sí manda fotos, no promete mandarlas ---------- */
        if (has(text, ['foto', 'fotos', 'imagen', 'imagenes', 'video', 'ver mas',
            'enseñame', 'muestrame', 'mandame'])) {
            mark(state, 'fotos');

            if (photos.length) {
                return {
                    text: `Claro, aquí te van. Si quieres ver algún detalle en particular, dime cuál y te lo tomo.`,
                    photos: photos.slice(0, 4),
                };
            }

            return {
                text: `Ahorita ando fuera; apenas llegue te tomo fotos con buena luz y te las mando por aquí. ¿Hay algún detalle que te interese ver de cerca?`,
            };
        }

        /* ---- Marca, modelo, características ---------------------------- */
        if (has(text, ['marca', 'modelo', 'caracteristica', 'especificacion', 'medida',
            'tamaño', 'tamano', 'color', 'capacidad', 'año', 'anio', 'material'])) {
            mark(state, 'detalles');
            return {
                text: `Te paso los datos exactos: todo lo que aparece en la oferta es lo que tiene. Si quieres te tomo una foto de la etiqueta con el modelo para que lo verifiques tú mismo.`,
            };
        }

        /* ---- Accesorios ------------------------------------------------ */
        if (has(text, ['caja', 'accesorio', 'cargador', 'cable', 'manual', 'completo',
            'incluye', 'viene con'])) {
            mark(state, 'accesorios');
            return {
                text: `Va completo con lo que se ve en las fotos. Si falta algún accesorio te lo digo de frente antes de que vengas, para que no pierdas el viaje.`,
            };
        }

        /* ---- Cantidad -------------------------------------------------- */
        if (has(text, ['cuantos', 'cuantas', 'stock', 'mas de uno', 'varios', 'docena',
            'al por mayor', 'mayoreo', 'cantidad'])) {
            mark(state, 'cantidad');
            return {
                text: `De este tengo uno solo, que es el que te ofrecí. Si necesitas más cantidad dime cuántos y te averiguo, que a veces consigo.`,
            };
        }

        /* ---- Permuta --------------------------------------------------- */
        if (has(text, ['cambio', 'permuta', 'canje', 'trueque', 'parte de pago'])) {
            mark(state, 'permuta');
            return {
                text: `Cambio no hago, prefiero la venta directa. Pero si el precio es lo que te frena, dime hasta cuánto puedes y vemos si llegamos a un punto.`,
            };
        }

        /* ---- Precio, sin ánimo de regatear ----------------------------- */
        if (has(text, ['precio', 'cuesta', 'cuanto', 'vale', 'costo'])) {
            if (seen(state, 'precio')) {
                return {
                    text: `Como te decía, quedó en ${soles(state.current)}${state.firm ? ', y ese ya es mi último precio' : ''}. ¿Te animas?`,
                };
            }
            mark(state, 'precio');
            return {
                text: `Está en ${soles(state.current)}. Es un precio conversable si lo recoges pronto; dime qué tienes pensado y lo vemos.`,
            };
        }

        /* ---- Saludo ---------------------------------------------------- */
        if (has(text, ['hola', 'buenas', 'buenos dias', 'buen dia', 'buenas tardes',
            'buenas noches', 'saludos', 'que tal', 'alo'])) {
            if (seen(state, 'saludo')) {
                return { text: `¡Hola de nuevo! Dime nomás, ¿en qué quedamos con ${item}?` };
            }
            mark(state, 'saludo');
            return {
                text: join(say(voice.hello), `Sí, tengo ${item} disponible, tal como te ofrecí. ¿Qué te gustaría saber?`),
            };
        }

        /* ---- Agradecimiento y despedida -------------------------------- */
        if (has(text, ['gracias', 'muchas gracias', 'agradezco'])) {
            return { text: `¡Con gusto! ${say(voice.close)}` };
        }

        if (has(text, ['chau', 'adios', 'nos vemos', 'hasta luego', 'bye',
            'lo pensare', 'lo pienso', 'te aviso'])) {
            return {
                text: `Perfecto, tómate tu tiempo. ${state.held_until
                    ? `Te lo tengo apartado hasta ${describeDate(state.held_until)}.`
                    : 'Aquí estaré si te decides.'} ${say(voice.close)}`,
            };
        }

        if (has(text, ['si', 'ok', 'listo', 'dale', 'perfecto', 'bueno', 'ya'])
            && text.length <= 12) {
            return {
                text: state.deal
                    ? `Genial. Entonces nos escribimos para cerrar la hora. ${say(voice.close)}`
                    : `${say(voice.yes)}. ¿Quieres que te lo aparte mientras lo decides?`,
            };
        }

        /* ---- Lo que no encaja en nada ---------------------------------- */
        const pendings = [
            !seen(state, 'precio') && `sigue en ${soles(state.current)}`,
            !seen(state, 'lugar') && `estoy en ${district}`,
            !seen(state, 'estado') && 'está en muy buen estado',
        ].filter(Boolean);

        return {
            text: pendings.length
                ? `Déjame ver bien eso y te confirmo. Por si te sirve: ${pendings[0]}. ¿Qué más necesitas saber?`
                : `Déjame revisarlo y te confirmo enseguida. ¿Hay algo puntual que quieras que te aclare?`,
        };
    }

    global.SellerBot = { reply, normalize };
})(window);
