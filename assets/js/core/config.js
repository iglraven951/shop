/**
 * DiscoveryShop · Configuración de despliegue
 *
 * Único archivo que hay que tocar para conectar el sitio a un servidor. Está
 * vacío a propósito: sin `apiBaseUrl` el sitio funciona entero contra MockAPI
 * en el propio navegador, que es lo que permite abrirlo desde el disco, en
 * GitHub Pages o dentro de la app Android sin depender de nada.
 *
 * Cuando exista el proyecto de Supabase, basta rellenar las dos primeras
 * claves y volver a publicar; ninguna otra parte del sitio cambia.
 *
 *     apiBaseUrl: 'https://<ref>.functions.supabase.co'
 *     anonKey:    'eyJhbGciOi…'
 *
 * Sin barra final y sin `/api`: las rutas ya empiezan por ahí, y la función
 * Edge se llama precisamente `api`, así que `/api/posts` cae donde debe.
 *
 * Sobre la clave: la `anon` de Supabase es pública por diseño — viaja en cada
 * petición del navegador y quien abra el sitio la verá. Lo que protege los
 * datos son las políticas RLS del servidor, no el secreto de esta cadena. La
 * clave `service_role`, en cambio, NUNCA va aquí: esa vive solo en el servidor.
 */
(function (global) {
    'use strict';

    global.DS_CONFIG = Object.freeze({
        /** Raíz de la API. Vacío ⇒ modo demo, sin red. */
        apiBaseUrl: '',

        /** Clave pública de Supabase. Vacío si `apiBaseUrl` lo está. */
        anonKey: '',

        /**
         * Si el servidor no responde, ¿seguir en modo demo contra MockAPI?
         *
         * Con `true`, un servidor caído degrada el sitio a la demo local y lo
         * avisa una vez, en lugar de dejar pantallas rotas. Con `false`, el
         * error se muestra tal cual. Un 4xx nunca activa el respaldo: eso es
         * el servidor respondiendo, y su mensaje debe llegar íntegro.
         */
        fallback: true,

        /** Milisegundos antes de dar por perdida una petición. */
        timeoutMs: 8000,
    });
})(window);
