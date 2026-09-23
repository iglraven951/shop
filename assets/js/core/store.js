/**
 * DiscoveryShop · Estado compartido y utilidades
 *
 * Un store mínimo con suscripciones, más los formateadores y ayudas que usan
 * todas las páginas. Se mantiene sin dependencias externas a propósito: el
 * sitio debe funcionar abierto directamente desde el disco.
 */
(function (global) {
    'use strict';

    /* ----------------------------------------------------------------------
       Store reactivo
       ---------------------------------------------------------------------- */

    class Store {
        constructor(initial = {}) {
            this.state = { ...initial };
            this.subscribers = new Map();
        }

        get(key) {
            return key === undefined ? this.state : this.state[key];
        }

        /** Actualiza claves y notifica solo a quien escucha las que cambiaron. */
        set(patch) {
            const changed = [];

            Object.entries(patch).forEach(([key, value]) => {
                if (this.state[key] !== value) {
                    this.state[key] = value;
                    changed.push(key);
                }
            });

            changed.forEach((key) => this.notify(key));
            return this.state;
        }

        notify(key) {
            const listeners = this.subscribers.get(key);
            if (!listeners) return;
            listeners.forEach((fn) => {
                try {
                    fn(this.state[key], this.state);
                } catch (error) {
                    console.error(`[Store] Error en suscriptor de "${key}":`, error);
                }
            });
        }

        /**
         * @param {string} key
         * @param {(value: any, state: object) => void} callback
         * @param {boolean} [immediate=true] - Invocar ya con el valor actual.
         * @returns {() => void} Función para cancelar la suscripción.
         */
        subscribe(key, callback, immediate = true) {
            if (!this.subscribers.has(key)) {
                this.subscribers.set(key, new Set());
            }
            this.subscribers.get(key).add(callback);

            if (immediate) callback(this.state[key], this.state);

            return () => this.subscribers.get(key).delete(callback);
        }
    }

    /* ----------------------------------------------------------------------
       Formateadores
       ---------------------------------------------------------------------- */

    const moneyFormatter = new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    const numberFormatter = new Intl.NumberFormat('es-PE');

    const dateFormatter = new Intl.DateTimeFormat('es-PE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const timeFormatter = new Intl.DateTimeFormat('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
    });

    const format = {
        /** S/ 1,299.00 */
        money(value) {
            const amount = Number(value);
            if (!Number.isFinite(amount)) return moneyFormatter.format(0);
            return moneyFormatter.format(amount);
        },

        number(value) {
            const amount = Number(value);
            return Number.isFinite(amount) ? numberFormatter.format(amount) : '0';
        },

        date(value) {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
        },

        time(value) {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date);
        },

        /** «hace 3 horas», «ayer», «hace 2 semanas» */
        relative(value) {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '—';

            const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

            if (seconds < 60) return 'hace un momento';
            if (seconds < 3600) {
                const minutes = Math.floor(seconds / 60);
                return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
            }
            if (seconds < 86400) {
                const hours = Math.floor(seconds / 3600);
                return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
            }
            if (seconds < 172800) return 'ayer';
            if (seconds < 604800) {
                return `hace ${Math.floor(seconds / 86400)} días`;
            }
            if (seconds < 2592000) {
                const weeks = Math.floor(seconds / 604800);
                return `hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
            }
            if (seconds < 31536000) {
                const months = Math.floor(seconds / 2592000);
                return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
            }

            const years = Math.floor(seconds / 31536000);
            return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
        },

        /** Iniciales para el avatar: «María García» → «MG» */
        initials(name) {
            return String(name || '?')
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word.charAt(0).toUpperCase())
                .join('') || '?';
        },

        /** Pluraliza respetando el género de la palabra en español. */
        plural(count, singular, plural) {
            return count === 1 ? singular : plural;
        },
    };

    /* ----------------------------------------------------------------------
       Seguridad y DOM
       ---------------------------------------------------------------------- */

    const ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };

    /**
     * Escapa texto antes de insertarlo en HTML. Obligatorio para cualquier dato
     * que provenga del usuario o de la API: títulos, descripciones, mensajes.
     */
    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
    }

    /** Escapa para uso dentro de un atributo HTML. */
    function escapeAttr(value) {
        return escapeHtml(value);
    }

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    /**
     * Crea un elemento con atributos y contenido en una sola llamada.
     * @param {string} tag
     * @param {object} [attrs] - `class`, `text`, `html`, `dataset`, eventos `onClick`…
     * @param {Array<Node|string>} [children]
     */
    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);

        Object.entries(attrs).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;

            if (key === 'class') {
                node.className = value;
            } else if (key === 'text') {
                node.textContent = value;
            } else if (key === 'html') {
                node.innerHTML = value;
            } else if (key === 'dataset') {
                Object.assign(node.dataset, value);
            } else if (key.startsWith('on') && typeof value === 'function') {
                node.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (value === true) {
                node.setAttribute(key, '');
            } else {
                node.setAttribute(key, value);
            }
        });

        (Array.isArray(children) ? children : [children]).forEach((child) => {
            if (child === null || child === undefined) return;
            node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        });

        return node;
    }

    /* ----------------------------------------------------------------------
       Control de flujo
       ---------------------------------------------------------------------- */

    /** Retrasa la ejecución hasta que pasen `wait` ms sin nuevas llamadas. */
    function debounce(fn, wait = 260) {
        let timer;
        const debounced = (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
        debounced.cancel = () => clearTimeout(timer);
        return debounced;
    }

    /** Limita la ejecución a una vez cada `limit` ms. */
    function throttle(fn, limit = 160) {
        let waiting = false;
        let lastArgs = null;

        return (...args) => {
            if (waiting) {
                lastArgs = args;
                return;
            }

            fn(...args);
            waiting = true;

            setTimeout(() => {
                waiting = false;
                if (lastArgs) {
                    fn(...lastArgs);
                    lastArgs = null;
                }
            }, limit);
        };
    }

    /* ----------------------------------------------------------------------
       URL
       ---------------------------------------------------------------------- */

    /**
     * Dónde vive el foro de cara al público.
     *
     * Solo se usa para construir enlaces que salen del dispositivo. La app
     * Android sirve estas mismas páginas desde dentro de la APK, así que un
     * enlace a esta dirección y la pantalla que se está viendo son la misma
     * cosa para quien lo recibe.
     */
    const PUBLIC_SITE = 'https://iglraven951.github.io/shop/';

    const url = {
        param(name, fallback = null) {
            return new URLSearchParams(global.location.search).get(name) ?? fallback;
        },

        /** Actualiza la barra de direcciones sin recargar ni ensuciar el historial. */
        sync(params, { replace = true } = {}) {
            const search = new URLSearchParams();

            Object.entries(params).forEach(([key, value]) => {
                if (value === undefined || value === null || value === '') return;
                if (Array.isArray(value)) {
                    if (value.length) search.set(key, value.join(','));
                } else {
                    search.set(key, String(value));
                }
            });

            const query = search.toString();
            const next = `${global.location.pathname}${query ? `?${query}` : ''}`;

            if (replace) {
                history.replaceState(null, '', next);
            } else {
                history.pushState(null, '', next);
            }
        },

        build(page, params = {}) {
            const search = new URLSearchParams(params).toString();
            return `${page}${search ? `?${search}` : ''}`;
        },

        /**
         * Dirección que se puede enviar a otra persona.
         *
         * En la web es la página donde se está, sin más. Dentro de la app
         * Android no: allí el origen es `appassets.androidplatform.net`, un
         * dominio que solo existe dentro de esa APK. Compartir ese enlace
         * mandaría a quien lo reciba a un error, así que se reescribe contra
         * el sitio publicado, que sirve exactamente las mismas páginas con
         * las mismas rutas.
         *
         * @param {string} [page] - Ruta relativa (`publicacion.html?id=…`).
         *   Sin ella se comparte la página actual, con su consulta y su ancla.
         * @returns {string} URL absoluta y pública.
         */
        publicHref(page) {
            const relative = page || [
                global.location.pathname.split('/').pop() || 'index.html',
                global.location.search,
                global.location.hash,
            ].join('');

            const insideApp = !!(global.DSApp && global.DSApp.isNative);
            const base = insideApp ? PUBLIC_SITE : global.location.href;

            try {
                return new URL(relative, base).href;
            } catch (error) {
                return PUBLIC_SITE + relative;
            }
        },
    };

    /* ----------------------------------------------------------------------
       Tema
       ---------------------------------------------------------------------- */

    const THEME_KEY = 'discoveryshop:theme';

    const theme = {
        get() {
            try {
                const stored = localStorage.getItem(THEME_KEY);
                if (stored === 'light' || stored === 'dark') return stored;
            } catch (error) {
                /* sin almacenamiento: se usa la preferencia del sistema */
            }

            return global.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        },

        set(value) {
            document.documentElement.dataset.theme = value;
            try {
                localStorage.setItem(THEME_KEY, value);
            } catch (error) {
                /* no persistente, pero aplicado en esta sesión */
            }
            store.set({ theme: value });
        },

        toggle() {
            this.set(this.get() === 'dark' ? 'light' : 'dark');
        },

        apply() {
            document.documentElement.dataset.theme = this.get();
        },

        /**
         * Sigue el tema del sistema mientras el usuario no haya elegido uno.
         *
         * `get()` ya consulta la preferencia del sistema, pero solo al cargar
         * la página. En un navegador eso basta: cambiar el tema del sistema es
         * poco frecuente y la siguiente recarga lo recoge. Dentro de la app
         * Android no basta, porque ahí la pantalla no se recarga nunca —el
         * usuario cambiaba el tema del teléfono y el foro se quedaba como
         * estaba, con el marco de la app ya cambiado alrededor.
         *
         * En cuanto alguien toca el interruptor de tema, `set()` guarda su
         * elección y esto deja de mandar: una preferencia explícita siempre
         * gana a la del sistema.
         */
        follow() {
            if (typeof global.matchMedia !== 'function') return;

            const query = global.matchMedia('(prefers-color-scheme: light)');

            const onChange = () => {
                try {
                    // Elección explícita del usuario: no se toca.
                    if (localStorage.getItem(THEME_KEY)) return;
                } catch (error) {
                    /* sin almacenamiento: se sigue al sistema */
                }

                const next = query.matches ? 'light' : 'dark';
                document.documentElement.dataset.theme = next;
                store.set({ theme: next });
            };

            if (typeof query.addEventListener === 'function') {
                query.addEventListener('change', onChange);
            } else if (typeof query.addListener === 'function') {
                query.addListener(onChange);
            }
        },
    };

    /* ----------------------------------------------------------------------
       Exportación
       ---------------------------------------------------------------------- */

    const store = new Store({
        user: null,
        cartCount: 0,
        favorites: [],
        unreadMessages: 0,
        theme: 'dark',
        mode: null,
    });

    global.store = store;
    global.DS = { Store, store, format, escapeHtml, escapeAttr, $, $$, el, debounce, throttle, url, theme };
})(window);
