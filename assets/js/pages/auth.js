/**
 * DiscoveryShop · Acceso y alta con rol
 *
 * Un único script para `login.html` y `registro.html`: detecta qué página está
 * activa por el formulario presente en el DOM.
 *
 * El registro es una máquina de dos pasos sin recargas: primero se elige el
 * tipo de cuenta (comprador o vendedor) y después se piden los datos. Quien
 * pide vender entra igualmente como comprador hasta que el equipo apruebe su
 * solicitud, así que el aviso de revisión aparece antes y después de enviar.
 */
(function (global) {
    'use strict';

    const { $, escapeHtml, format, url } = global.DS;
    const api = global.api;
    const store = global.store;
    const toast = global.toast;
    const modal = global.modal;

    /* ----------------------------------------------------------------------
       Constantes
       ---------------------------------------------------------------------- */

    // Mismo criterio que valida el servidor, para no dar falsas esperanzas.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    // Móvil peruano: nueve dígitos que empiezan por 9, con prefijo +51 opcional.
    const PHONE_RE = /^(?:\+?51)?[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{3}$/;
    const MIN_PASSWORD = 8;
    const MIN_NAME = 3;
    const REDIRECT_DELAY = 700;
    const REMEMBER_KEY = 'discoveryshop:remember';

    // Todas las cuentas de demostración comparten contraseña.
    const DEMO_PASSWORD = 'demo1234';

    /**
     * Respaldo por si `seed.js` no llegara a cargar: el desplegable de distritos
     * nunca debe quedarse vacío. La fuente real es `DiscoverySeed.DISTRICTS`.
     */
    const FALLBACK_DISTRICTS = [
        'Cercado', 'Yanahuara', 'Cayma', 'Cerro Colorado', 'Alto Selva Alegre',
        'Miraflores', 'Mariano Melgar', 'Paucarpata', 'José Luis Bustamante y Rivero',
        'Socabaya', 'Jacobo Hunter', 'Sachaca', 'Tiabaya', 'Characato',
        'Sabandía', 'Uchumayo', 'Yura', 'La Joya',
    ];

    const ROLES = {
        buyer: { icon: '🛍️', label: 'comprador' },
        seller: { icon: '🏷️', label: 'vendedor' },
    };

    const ICON = {
        eye: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 9S4.5 3.8 9 3.8 16.5 9 16.5 9 13.5 14.2 9 14.2 1.5 9 1.5 9Z"/><circle cx="9" cy="9" r="2.3"/></svg>',
        eyeOff: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7.3 4.1A6.9 6.9 0 0 1 9 3.9c4.5 0 7.5 5.1 7.5 5.1a13 13 0 0 1-2.4 3M4.4 5.6A13 13 0 0 0 1.5 9s3 5.1 7.5 5.1c1 0 1.9-.2 2.7-.6"/><path d="m2.5 2.5 13 13"/></svg>',
        warning: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2.3 16.6 15H1.4L9 2.3Z"/><path d="M9 7v3.4M9 12.8h.01"/></svg>',
        info: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="7"/><path d="M9 8.2v4.3M9 5.6h.01"/></svg>',
    };

    // Índice = número de segmentos coloreados del medidor.
    const STRENGTH = [
        { level: '', hint: 'Usa al menos 8 caracteres.' },
        { level: 'Débil', hint: 'Añade mayúsculas, números o símbolos.' },
        { level: 'Aceptable', hint: 'Mejora mezclando símbolos y mayúsculas.' },
        { level: 'Buena', hint: 'Alárgala un poco más para reforzarla.' },
        { level: 'Excelente', hint: 'Contraseña sólida. Guárdala en lugar seguro.' },
    ];

    // Texto legal del modal de registro: breve, honesto y sin enlaces rotos.
    const LEGAL_SECTIONS = [
        ['Resumen honesto.', 'DiscoveryShop es un proyecto de demostración. En esta versión publicada no hay servidor: tu cuenta, tus publicaciones y tus mensajes se guardan únicamente en el almacenamiento local de tu navegador y nunca viajan a Internet.'],
        ['Uso del tablón.', 'Te comprometes a publicar pedidos reales y lícitos, a describirlos con veracidad y a tratar con respeto a las demás personas.'],
        ['Cuentas de vendedor.', 'Publicar requiere la aprobación del equipo. Hasta entonces tu cuenta funciona con normalidad: puedes reaccionar, guardar, comentar y escribir mensajes.'],
        ['Tus datos.', 'Guardamos tu nombre, tu correo, tu distrito y, si lo indicas, tu teléfono, con el único fin de mostrar tu perfil y tus publicaciones. Puedes borrarlo todo cuando quieras desde «Reiniciar datos de demostración», en el pie de página.'],
        ['Sin garantías.', 'Al tratarse de una demostración, el contenido puede reiniciarse sin aviso. No introduzcas información sensible ni contraseñas que uses en otros sitios.'],
    ];

    /* ----------------------------------------------------------------------
       Ayudas de formulario
       ---------------------------------------------------------------------- */

    function errorNode(input) {
        return document.getElementById(`${input.id}-error`);
    }

    function setError(input, message) {
        const node = errorNode(input);
        if (node) node.textContent = message;
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
    }

    function clearError(input) {
        const node = errorNode(input);
        if (node) node.textContent = '';
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
    }

    function showBanner(message, variant) {
        const banner = $('#auth-banner');
        if (!banner) return;

        const isDanger = variant !== 'info';
        banner.innerHTML = `
            <div class="alert alert-${isDanger ? 'danger' : 'info'}">
                <span class="alert-icon" aria-hidden="true">${isDanger ? ICON.warning : ICON.info}</span>
                <div class="alert-content">${escapeHtml(message)}</div>
            </div>`;
        banner.hidden = false;
    }

    function hideBanner() {
        const banner = $('#auth-banner');
        if (!banner) return;
        banner.hidden = true;
        banner.innerHTML = '';
    }

    /** Bloquea o libera todos los controles mientras se habla con la API. */
    function lockForm(form, submit, locked) {
        form.setAttribute('aria-busy', String(locked));
        submit.classList.toggle('is-loading', locked);
        submit.disabled = locked;

        Array.from(form.elements).forEach((element) => {
            if (element === submit) return;

            if (locked) {
                // Se recuerda lo ya deshabilitado para no «activarlo» al terminar.
                if (element.disabled) element.dataset.keepDisabled = 'true';
                else element.disabled = true;
            } else if (element.dataset.keepDisabled) {
                delete element.dataset.keepDisabled;
            } else {
                element.disabled = false;
            }
        });
    }

    /**
     * Devuelve el destino de `?next=` solo si es una ruta relativa de este sitio.
     * Rechaza esquemas (`javascript:`, `https:`), protocolo relativo (`//host`) y
     * rutas absolutas: así `next` nunca sirve para una redirección abierta.
     */
    function safeNext() {
        const raw = url.param('next');
        if (!raw) return null;

        const value = String(raw).trim();
        if (value.includes('//') || value.includes(':') || value.includes('\\')) return null;
        if (!/^[a-zA-Z0-9_-]+\.html(?:\?[^\s#/\\]*)?(?:#[^\s#/\\]*)?$/.test(value)) return null;

        return value;
    }

    function goHome() {
        global.location.href = safeNext() || 'index.html';
    }

    /** Conserva `next` al saltar entre iniciar sesión y crear cuenta. */
    function keepNextOnLinks() {
        const next = safeNext();
        if (!next) return;

        ['#auth-switch-link', '#demo-login-link'].forEach((selector) => {
            const link = $(selector);
            if (link) link.href = url.build(link.getAttribute('href'), { next });
        });
    }

    /** Cómo se llama el permiso de esta cuenta, en lenguaje llano. */
    function roleLabel(user) {
        if (!user) return 'invitado';
        if (user.role === 'admin') return 'administrador';

        switch (user.seller_status) {
            case 'approved': return 'vendedor verificado';
            case 'pending': return 'vendedor en revisión';
            case 'rejected': return 'comprador (solicitud de vendedor rechazado)';
            default: return 'comprador';
        }
    }

    /* ----------------------------------------------------------------------
       Validadores
       ---------------------------------------------------------------------- */

    const rules = {
        email(value) {
            const email = value.trim();
            if (!email) return 'Escribe tu correo electrónico';
            if (!EMAIL_RE.test(email)) return 'El correo electrónico no es válido';
            return '';
        },

        password(value) {
            if (!value) return 'Escribe tu contraseña';
            if (value.length < MIN_PASSWORD) {
                return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
            }
            return '';
        },

        name(value) {
            const name = value.trim();
            if (!name) return 'Escribe tu nombre completo';
            if (name.length < MIN_NAME) return `El nombre debe tener al menos ${MIN_NAME} caracteres`;
            return '';
        },

        district(value) {
            return value ? '' : 'Elige el distrito donde vives';
        },

        phone(value) {
            const phone = value.trim();
            if (!phone) return ''; // opcional
            if (!PHONE_RE.test(phone)) return 'Usa un número peruano, por ejemplo 987 654 321';
            return '';
        },

        terms(value, input) {
            return input.checked ? '' : 'Debes aceptar los términos para continuar';
        },
    };

    /**
     * Valida al salir del campo y, una vez mostrado un error, también al escribir.
     * @returns {{input: HTMLElement, validate: () => boolean}}
     */
    function bindField(input, validate, options = {}) {
        const field = {
            input,
            validate() {
                const message = validate(input.value, input) || '';
                if (message) setError(input, message);
                else clearError(input);
                return !message;
            },
        };

        input.addEventListener(options.event || 'blur', () => field.validate());

        input.addEventListener('input', () => {
            if (input.getAttribute('aria-invalid') === 'true') field.validate();
            if (options.onInput) options.onInput(input.value);
        });

        return field;
    }

    /* ----------------------------------------------------------------------
       Mostrar / ocultar contraseña
       ---------------------------------------------------------------------- */

    function bindPasswordToggles(root) {
        root.querySelectorAll('[data-toggle-password]').forEach((button) => {
            button.addEventListener('click', () => {
                const input = document.getElementById(button.dataset.togglePassword);
                if (!input) return;

                const willShow = input.type === 'password';
                input.type = willShow ? 'text' : 'password';
                button.innerHTML = willShow ? ICON.eyeOff : ICON.eye;
                button.setAttribute('aria-pressed', String(willShow));
                button.setAttribute('aria-label', willShow ? 'Ocultar contraseña' : 'Mostrar contraseña');
                input.focus();
            });
        });
    }

    /* ----------------------------------------------------------------------
       Medidor de fortaleza
       ---------------------------------------------------------------------- */

    /** @returns {number} 0 (vacía) a 4 (excelente). */
    function scorePassword(value) {
        if (!value) return 0;

        let points = 0;
        if (value.length >= MIN_PASSWORD) points += 1;
        if (value.length >= 12) points += 1;
        if (/[a-z]/.test(value)) points += 1;
        if (/[A-ZÁÉÍÓÚÑÜ]/.test(value)) points += 1;
        if (/\d/.test(value)) points += 1;
        if (/[^A-Za-z0-9]/.test(value)) points += 1;

        // Por debajo del mínimo siempre es débil, por variada que sea.
        if (value.length < MIN_PASSWORD) return 1;
        if (points <= 2) return 1;
        if (points <= 3) return 2;
        if (points <= 4) return 3;
        return 4;
    }

    function updateMeter(value) {
        const meter = $('#password-meter');
        const label = $('#password-meter-label');
        const hint = $('#password-meter-hint');
        const level = $('#password-meter-level');
        if (!meter || !label) return;

        const score = scorePassword(value);
        const copy = STRENGTH[score];

        meter.dataset.score = String(score);
        label.dataset.score = String(score);

        // Solo se escribe si cambia: evita que el lector de pantalla repita.
        if (hint && hint.textContent !== copy.hint) hint.textContent = copy.hint;
        if (level && level.textContent !== copy.level) level.textContent = copy.level;
    }

    /* ----------------------------------------------------------------------
       Sesión ya iniciada
       ---------------------------------------------------------------------- */

    function renderExistingSession(user) {
        const panel = $('#auth-session');
        const formArea = $('#auth-form-area');
        if (!panel || !formArea) return;

        formArea.hidden = true;
        hideBanner();

        // El indicador de pasos solo tiene sentido junto al formulario.
        const steps = $('#auth-steps');
        if (steps) steps.hidden = true;

        const username = user.username || 'tu cuenta';

        panel.innerHTML = `
            <p class="auth-session-avatar" aria-hidden="true">${escapeHtml(format.initials(username))}</p>
            <h2 class="auth-session-title">Ya has iniciado sesión como ${escapeHtml(username)}</h2>
            <p class="auth-session-role">
                Tu cuenta es de <strong>${escapeHtml(roleLabel(user))}</strong>.
            </p>
            <p class="auth-session-text">
                Si quieres entrar con otra cuenta, cierra la sesión actual primero.
            </p>
            <div class="auth-session-actions">
                <button class="btn btn-primary btn-block" type="button" id="session-home">Ir al foro</button>
                <button class="btn btn-ghost btn-block" type="button" id="session-logout">Cerrar sesión</button>
            </div>`;
        panel.hidden = false;

        $('#session-home').addEventListener('click', goHome);

        $('#session-logout').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.classList.add('is-loading');
            button.disabled = true;

            try {
                await api.logout();
            } catch (error) {
                /* aunque el servidor falle, la sesión local debe quedar limpia */
            }

            store.set({ user: null, saved: [], unreadMessages: 0, pendingModeration: 0 });
            toast.info('Sesión cerrada');
            // Se recarga para volver al formulario limpio conservando `?next=`.
            setTimeout(() => global.location.reload(), REDIRECT_DELAY);
        });
    }

    /* ----------------------------------------------------------------------
       Envío compartido
       ---------------------------------------------------------------------- */

    async function submitForm({ form, submit, fields, request, onSuccess, focusTarget }) {
        hideBanner();

        let firstInvalid = null;
        fields.forEach((field) => {
            if (!field.validate() && !firstInvalid) firstInvalid = field;
        });

        if (firstInvalid) {
            firstInvalid.input.focus();
            toast.warning('Revisa los campos marcados');
            return;
        }

        lockForm(form, submit, true);

        try {
            const data = await request();
            const user = (data && data.user) || null;

            store.set({ user });
            onSuccess(data || {}, user);
        } catch (error) {
            lockForm(form, submit, false);

            const message = (error && error.message) || 'No se pudo completar la operación';
            showBanner(message);
            toast.error(message);

            const target = focusTarget(message);
            if (target) {
                target.focus();
                if (typeof target.select === 'function') target.select();
            }
        }
    }

    /* ----------------------------------------------------------------------
       Página: iniciar sesión
       ---------------------------------------------------------------------- */

    function initLogin(form) {
        const email = $('#login-email');
        const password = $('#login-password');
        const remember = $('#login-remember');
        const submit = $('#login-submit');

        const fields = [
            bindField(email, rules.email),
            bindField(password, rules.password),
        ];

        // La preferencia de «mantener sesión» se recuerda entre visitas.
        try {
            remember.checked = localStorage.getItem(REMEMBER_KEY) !== 'false';
            remember.addEventListener('change', () => {
                localStorage.setItem(REMEMBER_KEY, String(remember.checked));
            });
        } catch (error) {
            /* sin almacenamiento: la casilla sigue funcionando, solo no se recuerda */
        }

        /** Rellena el formulario con una de las cuentas de demostración. */
        function fillDemo(demoEmail) {
            if (submit.disabled) return; // hay un envío en curso

            email.value = demoEmail;
            password.value = DEMO_PASSWORD;
            clearError(email);
            clearError(password);
            hideBanner();
            toast.info('Datos rellenados. Pulsa «Iniciar sesión» para entrar.');
            submit.focus();
        }

        // Delegación: cada fila de la tabla de demostración trae su propio correo.
        const demoList = $('#auth-demo-list');
        if (demoList) {
            demoList.addEventListener('click', (event) => {
                const button = event.target.closest('[data-demo-email]');
                if (button) fillDemo(button.dataset.demoEmail);
            });
        }

        $('#forgot-link').addEventListener('click', () => {
            modal.open({
                title: '¿Olvidaste tu contraseña?',
                size: 'sm',
                content: `<div class="auth-legal">
                    <p>Esta demostración no envía correos: las cuentas viven solo en tu
                    navegador, así que no hay nada que recuperar por correo electrónico.</p>
                    <p>Puedes entrar con cualquiera de las cuentas de ejemplo que aparecen
                    bajo el formulario (todas usan la contraseña
                    <strong>${DEMO_PASSWORD}</strong>) o crear una cuenta nueva en unos segundos.</p>
                </div>`,
                actions: [
                    { label: 'Entendido', variant: 'secondary', close: true },
                    {
                        label: 'Usar cuenta de comprador',
                        variant: 'primary',
                        close: true,
                        action: () => fillDemo('patricia@discoveryshop.pe'),
                    },
                ],
            });
        });

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            submitForm({
                form,
                submit,
                fields,
                request: () => api.login(email.value.trim(), password.value),
                onSuccess: (data, user) => {
                    toast.success(user ? `¡Hola de nuevo, ${user.username}!` : 'Sesión iniciada');
                    // Pequeña pausa para que el aviso sea visible antes de navegar.
                    setTimeout(goHome, REDIRECT_DELAY);
                },
                // El 401 devuelve un mensaje genérico: lo más útil es reintentar la contraseña.
                focusTarget: (message) => (/correo/i.test(message) && !/contraseña/i.test(message) ? email : password),
            });
        });
    }

    /* ----------------------------------------------------------------------
       Página: crear cuenta (dos pasos)
       ---------------------------------------------------------------------- */

    /** Nombres de distrito reales; `seed.js` manda, la lista fija es el respaldo. */
    function districtNames() {
        const seed = global.DiscoverySeed;
        const names = seed && Array.isArray(seed.DISTRICTS)
            ? seed.DISTRICTS.map((district) => district.name).filter(Boolean)
            : [];

        return names.length ? names : FALLBACK_DISTRICTS;
    }

    function fillDistricts(select) {
        const fragment = document.createDocumentFragment();

        districtNames().forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            // textContent nunca interpreta HTML: el nombre entra tal cual.
            option.textContent = name;
            fragment.appendChild(option);
        });

        select.textContent = '';
        select.appendChild(fragment);

        // Arequipa Cercado es el punto de partida más neutro.
        select.value = 'Cercado';
        if (!select.value) select.selectedIndex = 0;
    }

    function initRegister(form) {
        const roleInputs = Array.from(form.querySelectorAll('input[name="role"]'));
        const roleError = $('#register-role-error');

        const name = $('#register-name');
        const email = $('#register-email');
        const district = $('#register-district');
        const phone = $('#register-phone');
        const password = $('#register-password');
        const confirm = $('#register-confirm');
        const terms = $('#register-terms');
        const submit = $('#register-submit');

        const panels = {
            1: form.querySelector('[data-step="1"]'),
            2: form.querySelector('[data-step="2"]'),
        };

        // Estado interno de la máquina de pasos: nunca se recarga la página.
        let step = 1;

        fillDistricts(district);

        /* ---- Paso 1: elección de rol ---- */

        function selectedRole() {
            const checked = roleInputs.find((input) => input.checked);
            return checked ? checked.value : '';
        }

        function clearRoleError() {
            if (roleError) roleError.textContent = '';
            roleInputs.forEach((input) => input.removeAttribute('aria-invalid'));
        }

        function validateRole() {
            if (selectedRole()) {
                clearRoleError();
                return true;
            }

            if (roleError) roleError.textContent = 'Elige un tipo de cuenta para continuar';
            roleInputs.forEach((input) => input.setAttribute('aria-invalid', 'true'));
            return false;
        }

        roleInputs.forEach((input) => {
            input.addEventListener('change', clearRoleError);
        });

        /* ---- Cambio de paso ---- */

        function paintStepIndicator() {
            form.ownerDocument.querySelectorAll('[data-step-item]').forEach((item) => {
                const index = Number(item.dataset.stepItem);
                item.classList.toggle('is-active', index === step);
                item.classList.toggle('is-done', index < step);
            });
        }

        /**
         * Anuncia el cambio de paso a los lectores de pantalla. Se llama solo al
         * navegar: una región viva rellenada durante la carga no se anuncia.
         */
        function announceStep() {
            const status = $('#auth-step-status');
            if (!status) return;

            status.textContent = step === 1
                ? 'Paso 1 de 2: elige el tipo de cuenta.'
                : 'Paso 2 de 2: completa tus datos.';
        }

        function paintRoleReminder() {
            const role = selectedRole() || 'buyer';
            const copy = ROLES[role] || ROLES.buyer;

            const icon = $('#register-role-pill-icon');
            const label = $('#register-role-pill-label');
            if (icon) icon.textContent = copy.icon;
            if (label) label.textContent = copy.label;

            const reminder = $('#register-seller-reminder');
            if (reminder) reminder.hidden = role !== 'seller';
        }

        function setStep(next) {
            step = next;
            panels[1].hidden = next !== 1;
            panels[2].hidden = next !== 2;
            hideBanner();
            paintStepIndicator();
            announceStep();

            if (next === 2) {
                paintRoleReminder();
                name.focus();
            } else {
                const checked = roleInputs.find((input) => input.checked) || roleInputs[0];
                if (checked) checked.focus();
            }
        }

        $('#register-back').addEventListener('click', () => setStep(1));
        $('#register-role-change').addEventListener('click', () => setStep(1));

        /* ---- Paso 2: campos ---- */

        const matches = (value) => (value === password.value ? '' : 'Las contraseñas no coinciden');
        const confirmRule = (value) => (value ? matches(value) : 'Repite tu contraseña');

        const confirmField = bindField(confirm, confirmRule);

        const fields = [
            bindField(name, rules.name),
            bindField(email, rules.email),
            bindField(district, rules.district, { event: 'change' }),
            bindField(phone, rules.phone),
            bindField(password, rules.password, {
                onInput: (value) => {
                    updateMeter(value);
                    // Si la confirmación ya mostraba error, se reevalúa al vuelo.
                    if (confirm.getAttribute('aria-invalid') === 'true') confirmField.validate();
                },
            }),
            confirmField,
            bindField(terms, rules.terms, { event: 'change' }),
        ];

        updateMeter(password.value);
        paintStepIndicator();

        $('#terms-link').addEventListener('click', () => {
            const body = LEGAL_SECTIONS
                .map(([heading, text]) => `<p><strong>${heading}</strong> ${text}</p>`)
                .join('');

            modal.open({
                title: 'Términos y política de privacidad',
                size: 'md',
                content: `<div class="auth-legal">${body}</div>`,
                actions: [{ label: 'Cerrar', variant: 'secondary', close: true }],
            });
        });

        /* ---- Éxito ---- */

        /**
         * Quien pidió vender no se va de inmediato: primero se le explica qué
         * puede y qué no puede hacer mientras dure la revisión.
         */
        function showSellerWelcome(user) {
            const username = user ? escapeHtml(user.username) : 'tu cuenta';

            modal.open({
                title: 'Solicitud de vendedor registrada',
                size: 'md',
                dismissible: false,
                content: `<div class="auth-legal">
                    <p>Tu cuenta ya está creada, ${username}. Tu solicitud de vendedor quedó
                    registrada y el equipo la revisará en breve.</p>
                    <p><strong>Desde ya puedes</strong> publicar tus propios pedidos, marcar
                    «También lo busco», guardar, comentar y conversar cuando aceptes una
                    oferta.</p>
                    <p><strong>Todavía no puedes</strong> responder pedidos ajenos con tus
                    ofertas. En cuanto tu cuenta de vendedor sea aprobada recibirás el aviso y el botón
                    «Lo tengo» aparecerá en cada pedido.</p>
                </div>`,
                actions: [
                    {
                        label: 'Ver mi perfil',
                        variant: 'secondary',
                        close: true,
                        action: () => { global.location.href = 'perfil.html'; },
                    },
                    {
                        label: 'Ir al foro',
                        variant: 'primary',
                        close: true,
                        action: goHome,
                    },
                ],
            });
        }

        /* ---- Envío ---- */

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            // El paso 1 no envía nada: solo abre el paso 2 si ya hay rol elegido.
            if (step === 1) {
                if (!validateRole()) {
                    toast.warning('Elige primero el tipo de cuenta');
                    const first = roleInputs[0];
                    if (first) first.focus();
                    return;
                }
                setStep(2);
                return;
            }

            const role = selectedRole();
            // Defensa por si alguien llegara al paso 2 sin rol (DOM manipulado).
            if (!role) {
                setStep(1);
                validateRole();
                return;
            }

            submitForm({
                form,
                submit,
                fields,
                request: () => api.register({
                    username: name.value.trim(),
                    email: email.value.trim(),
                    password: password.value,
                    role,
                    district: district.value,
                    phone: phone.value.trim(),
                }),
                onSuccess: (data, user) => {
                    if (data.seller_requested) {
                        showSellerWelcome(user);
                        return;
                    }

                    toast.success('¡Cuenta creada! Ya puedes explorar el foro.');
                    setTimeout(goHome, REDIRECT_DELAY);
                },
                focusTarget: (message) => {
                    if (/correo/i.test(message)) return email;
                    if (/contraseña/i.test(message)) return password;
                    return name;
                },
            });
        });
    }

    /* ----------------------------------------------------------------------
       Arranque
       ---------------------------------------------------------------------- */

    async function init() {
        const form = $('#login-form') || $('#register-form');
        if (!form) return;

        const isLogin = form.id === 'login-form';

        bindPasswordToggles(document);
        keepNextOnLinks();

        if (isLogin) initLogin(form);
        else initRegister(form);

        // Quien llega desde una página protegida merece saber por qué está aquí.
        if (safeNext()) {
            showBanner(isLogin
                ? 'Inicia sesión para continuar donde lo dejaste.'
                : 'Crea tu cuenta para continuar donde lo dejaste.', 'info');
        }

        await api.ready();

        const current = await api.getCurrentUser().catch(() => null);
        const user = current && (current.user || current);
        if (user && user.id) renderExistingSession(user);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
