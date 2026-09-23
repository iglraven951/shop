/**
 * DiscoveryShop · Publicar artículo
 *
 * La página tiene una sola regla dura: únicamente un vendedor aprobado (o el
 * administrador) ve el formulario. Para los demás se pinta la pantalla que
 * explica en qué punto está su cuenta y qué puede hacer ahora mismo.
 *
 * El formulario no se oculta: no se clona. Vive en un <template> del HTML y
 * solo entra en el documento cuando el servidor confirma el permiso.
 */
(function (global) {
    'use strict';

    const { escapeHtml, escapeAttr, format, debounce } = global.DS;
    const api = global.api;
    const store = global.store;
    const toast = global.toast;
    const modal = global.modal;
    const UI = global.UI;

    const DRAFT_KEY = 'discoveryshop:draft';

    // Los mismos límites que valida el servidor en `createRequest`.
    const LIMITS = { titleMin: 4, titleMax: 90, descMin: 20, descMax: 1000 };

    /** Iconos disponibles para la portada de la publicación. */
    const EMOJIS = [
        { char: '📱', label: 'Celular' },      { char: '💻', label: 'Laptop' },
        { char: '🎧', label: 'Audífonos' },    { char: '🎮', label: 'Consola' },
        { char: '📷', label: 'Cámara' },       { char: '🏠', label: 'Hogar' },
        { char: '👟', label: 'Zapatillas' },   { char: '🚴', label: 'Deportes' },
        { char: '🎸', label: 'Guitarra' },     { char: '📚', label: 'Libros' },
        { char: '🧸', label: 'Bebés y niños' }, { char: '🚗', label: 'Vehículo' },
        { char: '⌚', label: 'Reloj' },        { char: '🎒', label: 'Mochila' },
        { char: '🚲', label: 'Bicicleta' },    { char: '🪑', label: 'Mueble' },
        { char: '📺', label: 'Televisor' },    { char: '☕', label: 'Cafetera' },
        { char: '🔊', label: 'Parlante' },     { char: '🛵', label: 'Scooter' },
    ];

    /** id del campo en el DOM para cada clave del formulario. */
    const FIELD_IDS = {
        title: 'publish-title',
        description: 'publish-description',
        budget_min: 'publish-budget-min',
        budget_max: 'publish-budget-max',
        category_id: 'publish-category',
        district: 'publish-district',
    };

    /**
     * Reglas de validación. Los mensajes repiten los del servidor cuando existe
     * el equivalente, para que el usuario no lea dos redacciones distintas.
     */
    const RULES = {
        title(value) {
            if (!value) return 'Escribe en pocas palabras qué buscas.';
            if (value.length < LIMITS.titleMin) return 'El título debe tener al menos 4 caracteres.';
            if (value.length > LIMITS.titleMax) return 'El título no puede superar los 90 caracteres.';
            return '';
        },
        description(value) {
            if (!value) return 'Describe lo que buscas para que puedan reconocerlo.';
            if (value.length < LIMITS.descMin) return 'Descríbelo con al menos 20 caracteres.';
            if (value.length > LIMITS.descMax) return 'La descripción no puede superar los 1000 caracteres.';
            return '';
        },
        /* El presupuesto es opcional: hay cosas que uno busca sin saber
           todavía lo que cuestan, y exigir una cifra solo produce cifras
           inventadas. Lo que sí se comprueba es que tenga sentido. */
        budget_min(value, values) {
            if (!value) return '';
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount < 0) return 'El presupuesto no puede ser negativo.';
            if (amount > 999999) return 'Esa cifra parece un error: revísala.';

            const max = Number(values && values.budget_max);
            if (Number.isFinite(max) && max > 0 && amount > max) {
                return 'El mínimo no puede ser mayor que el máximo.';
            }
            return '';
        },
        budget_max(value) {
            if (!value) return '';
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount < 0) return 'El presupuesto no puede ser negativo.';
            if (amount > 999999) return 'Esa cifra parece un error: revísala.';
            return '';
        },
        category_id(value) {
            return value ? '' : 'Elige una categoría para tu pedido.';
        },
        district(value) {
            return value ? '' : 'Elige el distrito donde te viene bien recogerlo.';
        },
    };

    const state = {
        user: null,
        accessKey: null,
        categories: [],
        emoji: '',
        emojiTouched: false,
        touched: new Set(),
        dirty: false,
        submitting: false,
        guarded: false,
    };

    let stage = null;
    const q = (selector) => (stage ? stage.querySelector(selector) : null);

    /* ======================================================================
       Permisos: qué pantalla toca
       ====================================================================== */

    /** Resume lo único que decide la pantalla: quién eres y qué puedes hacer. */
    function accessKey(user) {
        if (!user) return 'guest';
        return `${user.id}:${user.role}:${user.seller_status || 'none'}`;
    }

    /**
     * Cualquiera con cuenta publica un pedido.
     *
     * Aquí estaba la puerta que exigía ser vendedor aprobado, y con el modelo
     * invertido esa puerta sobra: lo que se publica es una necesidad, no
     * mercancía. Pedir no requiere permiso — ofrecer sí, y esa comprobación
     * vive ahora donde se responde a un pedido.
     */
    function canPublish(user) {
        return !!user;
    }

    function applyUser(user) {
        state.user = user;
        state.accessKey = accessKey(user);
        renderStage();
    }

    /** Otra parte del sitio (la cabecera) puede cerrar sesión mientras escribes. */
    function onUserChange(user) {
        if (accessKey(user) === state.accessKey) return;
        applyUser(user);
    }

    function renderStage() {
        const user = state.user;

        if (canPublish(user)) {
            mountForm();
            return;
        }

        // Ninguna de las pantallas de bloqueo tiene formulario que proteger.
        disableUnloadGuard();

        if (!user) {
            stage.innerHTML = UI.loginGate({
                title: 'Inicia sesión para pedir',
                message: 'Publicar un pedido requiere una cuenta. Entra con la tuya '
                    + 'o crea una: solo te toma un minuto.',
                icon: '🔐',
            });
            return;
        }

        if (user.seller_status === 'pending') { renderPendingGate(user); return; }
        if (user.seller_status === 'rejected') { renderRejectedGate(user); return; }
        renderBuyerGate();
    }

    /* ======================================================================
       Pantallas de bloqueo
       ====================================================================== */

    function gateScreen({ icon, tone, title, message, extra = '', actions = '' }) {
        return `
        <section class="publish-gate publish-gate-${tone}">
            <span class="publish-gate-icon" aria-hidden="true">${icon}</span>
            <h2 class="publish-gate-title">${escapeHtml(title)}</h2>
            <p class="publish-gate-message">${escapeHtml(message)}</p>
            ${extra}
            ${actions ? `<div class="publish-gate-actions">${actions}</div>` : ''}
        </section>`;
    }

    /** Comprador que nunca pidió publicar. */
    function renderBuyerGate() {
        const steps = `
            <ol class="publish-steps">
                <li class="publish-step">
                    <span class="publish-step-num" aria-hidden="true">1</span>
                    <span class="publish-step-text">
                        <strong>Solicitas.</strong> Nos cuentas en dos líneas qué piensas vender.
                    </span>
                </li>
                <li class="publish-step">
                    <span class="publish-step-num" aria-hidden="true">2</span>
                    <span class="publish-step-text">
                        <strong>Revisamos.</strong> El equipo mira la solicitud a mano.
                    </span>
                </li>
                <li class="publish-step">
                    <span class="publish-step-num" aria-hidden="true">3</span>
                    <span class="publish-step-text">
                        <strong>Publicas.</strong> Esta misma página se convierte en tu formulario.
                    </span>
                </li>
            </ol>`;

        stage.innerHTML = gateScreen({
            icon: '🪪',
            tone: 'info',
            title: 'Publicar requiere una cuenta de vendedor',
            message: 'Con tu cuenta ya puedes participar en el foro: reaccionar, guardar, '
                + 'comentar y escribir a quien vende. Para publicar tus propios artículos '
                + 'necesitamos aprobarte antes como vendedor.',
            extra: steps,
            actions: `
                <button class="btn btn-primary" type="button" id="publish-apply">
                    Solicitar cuenta de vendedor
                </button>
                <a class="btn btn-secondary" href="index.html">Volver al foro</a>`,
        });

        q('#publish-apply').addEventListener('click', openSellerApplication);
    }

    /** Solicitud enviada, a la espera del administrador. */
    function renderPendingGate(user) {
        const since = user.applied_at || user.created_at;

        stage.innerHTML = gateScreen({
            icon: '⏳',
            tone: 'warning',
            title: 'Tu solicitud está en revisión',
            message: 'Estamos revisando tu cuenta de vendedor. En cuanto la aprobemos, esta '
                + 'página se convertirá en tu formulario de publicación.',
            extra: `
                <p class="publish-gate-meta">
                    Solicitud enviada ${escapeHtml(format.relative(since))}
                    <span aria-hidden="true">·</span>
                    <time datetime="${escapeAttr(since)}">${escapeHtml(format.date(since))}</time>
                </p>
                <div class="alert alert-info publish-gate-note">
                    <span class="alert-icon" aria-hidden="true">💬</span>
                    <div class="alert-content">
                        <p class="alert-title">Mientras tanto, el foro es todo tuyo</p>
                        <p class="alert-body">
                            Puedes reaccionar, guardar publicaciones, comentar y escribirle a
                            cualquier vendedor con total normalidad.
                        </p>
                    </div>
                </div>`,
            actions: `
                <a class="btn btn-primary" href="index.html">Ir al foro</a>
                <a class="btn btn-secondary" href="perfil.html">Ver mi perfil</a>`,
        });
    }

    /** Solicitud rechazada: se muestra el motivo tal cual lo dio el equipo. */
    function renderRejectedGate(user) {
        const reason = user.rejection_reason
            || 'El equipo no dejó un motivo por escrito. Cuéntanos con más detalle qué quieres vender y lo revisamos de nuevo.';

        stage.innerHTML = gateScreen({
            icon: '⚠️',
            tone: 'danger',
            title: 'Tu solicitud de vendedor fue rechazada',
            message: 'Revisamos tu solicitud y no pudimos aprobarla. Puedes corregir lo que '
                + 'te indicamos y volver a enviarla cuando quieras.',
            extra: `
                <div class="alert alert-danger publish-gate-note">
                    <span class="alert-icon" aria-hidden="true">📝</span>
                    <div class="alert-content">
                        <p class="alert-title">Motivo del rechazo</p>
                        <p class="alert-body">${escapeHtml(reason)}</p>
                    </div>
                </div>`,
            actions: `
                <button class="btn btn-primary" type="button" id="publish-apply">
                    Volver a solicitar
                </button>
                <a class="btn btn-secondary" href="index.html">Ir al foro</a>`,
        });

        q('#publish-apply').addEventListener('click', openSellerApplication);
    }

    function renderErrorGate(message) {
        stage.innerHTML = gateScreen({
            icon: '📡',
            tone: 'danger',
            title: 'No pudimos preparar el formulario',
            message,
            actions: `
                <button class="btn btn-primary" type="button" id="publish-retry">Reintentar</button>
                <a class="btn btn-secondary" href="index.html">Ir al foro</a>`,
        });

        q('#publish-retry').addEventListener('click', () => { global.location.reload(); });
    }

    /* ======================================================================
       Solicitud de cuenta de vendedor
       ====================================================================== */

    function openSellerApplication() {
        const content = document.createElement('div');
        content.className = 'publish-apply';
        content.innerHTML = `
            <p class="publish-apply-lead">
                Cuéntanos qué piensas vender. Las solicitudes se revisan a mano, así que
                unas líneas sinceras ayudan más que un texto largo.
            </p>
            <div class="field">
                <div class="publish-label-row">
                    <label class="label" for="seller-motivation">
                        Tu motivación
                        <span class="required" aria-hidden="true">*</span>
                        <span class="sr-only">(obligatorio)</span>
                    </label>
                    <span class="publish-counter" id="seller-motivation-counter" aria-hidden="true">0 / 400</span>
                </div>
                <textarea class="textarea" id="seller-motivation" rows="5" maxlength="400"
                          placeholder="Quiero vender cosas que ya no uso en casa: consolas, libros y algo de ropa. Entrego en persona en mi distrito."
                          aria-describedby="seller-motivation-error"></textarea>
                <p class="field-error" id="seller-motivation-error" aria-live="polite"></p>
            </div>`;

        const input = content.querySelector('#seller-motivation');
        const counter = content.querySelector('#seller-motivation-counter');

        input.addEventListener('input', () => {
            counter.textContent = `${input.value.trim().length} / 400`;
        });

        modal.open({
            title: 'Solicitar cuenta de vendedor',
            size: 'md',
            content,
            actions: [
                { label: 'Ahora no', variant: 'ghost' },
                {
                    label: 'Enviar solicitud',
                    variant: 'primary',
                    action: () => submitApplication(content),
                },
            ],
        });

        input.focus();
    }

    async function submitApplication(root) {
        const input = root.querySelector('#seller-motivation');
        const error = root.querySelector('#seller-motivation-error');
        const motivation = input.value.trim();

        if (motivation.length < 20) {
            error.textContent = 'Cuéntanos al menos 20 caracteres sobre lo que quieres vender.';
            input.classList.add('is-invalid');
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return false;
        }

        try {
            const result = await api.applyAsSeller(motivation);
            // El store repinta la pantalla: pasa sola al estado «en revisión».
            store.set({ user: result.user });
            toast.success('Solicitud enviada. El equipo la revisará pronto.');
            return true;
        } catch (requestError) {
            toast.error(requestError.message || 'No pudimos enviar tu solicitud.');
            return false;
        }
    }

    /* ======================================================================
       Formulario
       ====================================================================== */

    function mountForm() {
        const template = document.getElementById('publish-form-template');
        if (!template) return;

        stage.replaceChildren(template.content.cloneNode(true));

        fillCategories();
        fillDistricts();
        buildEmojiGrid();

        const form = q('#publish-form');
        form.addEventListener('input', handleFormInput);
        form.addEventListener('change', handleFormInput);
        form.addEventListener('focusout', handleFormBlur);
        form.addEventListener('submit', handleSubmit);
        q('#publish-cancel').addEventListener('click', handleCancel);

        restoreDraft();
        syncEmojiFromCategory();
        refreshAll();
        enableUnloadGuard();
    }

    function fillCategories() {
        const select = q('#publish-category');

        select.innerHTML = `<option value="">Elige una categoría</option>${
            state.categories.map((category) => `
                <option value="${escapeAttr(category.id)}">
                    ${escapeHtml(category.icon)} ${escapeHtml(category.name)}
                </option>`).join('')}`;
    }

    function fillDistricts() {
        const select = q('#publish-district');
        const preferred = (state.user && state.user.district) || '';

        // `selected` como atributo (y no por propiedad) para que form.reset()
        // vuelva al distrito del perfil y no a la primera opción.
        select.innerHTML = `<option value="">Elige tu distrito</option>${
            global.DiscoverySeed.DISTRICTS.map((district) => `
                <option value="${escapeAttr(district.name)}"${district.name === preferred ? ' selected' : ''}>
                    ${escapeHtml(district.name)}
                </option>`).join('')}`;
    }

    function buildEmojiGrid() {
        const grid = q('#publish-emoji-grid');

        grid.innerHTML = EMOJIS.map((item) => `
            <button class="publish-emoji" type="button" role="radio" aria-checked="false"
                    tabindex="-1" data-emoji="${escapeAttr(item.char)}"
                    aria-label="${escapeAttr(item.label)}">
                <span aria-hidden="true">${escapeHtml(item.char)}</span>
            </button>`).join('');

        grid.addEventListener('click', (event) => {
            const button = event.target.closest('.publish-emoji');
            if (button) chooseEmoji(button.dataset.emoji);
        });

        grid.addEventListener('keydown', handleEmojiKeydown);
    }

    /** Elegir icono a mano corta la herencia de la categoría. */
    function chooseEmoji(emoji) {
        state.emojiTouched = true;
        state.dirty = true;
        selectEmoji(emoji);
        refreshAll();
        scheduleDraftSave();
    }

    /** Flechas, Inicio y Fin recorren la rejilla como un grupo de radios. */
    function handleEmojiKeydown(event) {
        const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(event.key)) return;

        const buttons = Array.from(event.currentTarget.querySelectorAll('.publish-emoji'));
        const current = buttons.indexOf(document.activeElement);
        const step = (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1;

        let next;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else next = (Math.max(current, 0) + step + buttons.length) % buttons.length;

        event.preventDefault();
        chooseEmoji(buttons[next].dataset.emoji);
        buttons[next].focus();
    }

    function selectEmoji(emoji) {
        state.emoji = emoji || '';
        const label = (EMOJIS.find((item) => item.char === state.emoji) || {}).label || '';
        const current = q('#publish-emoji-current');
        if (current) current.textContent = state.emoji ? `${state.emoji} ${label}` : '';

        const grid = q('#publish-emoji-grid');
        if (!grid) return;

        Array.from(grid.children).forEach((button) => {
            const active = button.dataset.emoji === state.emoji;
            button.classList.toggle('is-selected', active);
            button.setAttribute('aria-checked', String(active));
            button.tabIndex = active ? 0 : -1;
        });

        // Sin selección, el primer icono es la puerta de entrada con el tabulador.
        if (!state.emoji && grid.firstElementChild) {
            grid.firstElementChild.tabIndex = 0;
        }
    }

    /** Mientras el usuario no elija icono, se hereda el de la categoría. */
    function syncEmojiFromCategory() {
        if (state.emojiTouched) return;
        const category = findCategory(readValues().category_id);
        selectEmoji(category ? category.icon : '');
    }

    function findCategory(id) {
        return state.categories.find((category) => category.id === id) || null;
    }

    /* ======================================================================
       Lectura, validación y contadores
       ====================================================================== */

    function readValues() {
        const form = q('#publish-form');
        if (!form) return { title: '', description: '', budget_min: '', budget_max: '', category_id: '', condition: '', district: '' };

        const data = new FormData(form);
        const text = (key) => String(data.get(key) || '').trim();

        return {
            title: text('title'),
            description: text('description'),
            budget_min: text('budget_min'),
            budget_max: text('budget_max'),
            category_id: text('category_id'),
            condition: text('condition'),
            district: text('district'),
        };
    }

    function validateField(name, values) {
        const message = RULES[name] ? RULES[name](values[name]) : '';
        const input = q(`#${FIELD_IDS[name]}`);
        const box = q(`#${FIELD_IDS[name]}-error`);

        if (input) {
            input.classList.toggle('is-invalid', !!message);
            input.setAttribute('aria-invalid', String(!!message));
        }
        if (box) box.textContent = message;

        return !message;
    }

    function clearErrors() {
        state.touched.clear();
        Object.keys(FIELD_IDS).forEach((name) => {
            const input = q(`#${FIELD_IDS[name]}`);
            const box = q(`#${FIELD_IDS[name]}-error`);
            if (input) {
                input.classList.remove('is-invalid');
                input.removeAttribute('aria-invalid');
            }
            if (box) box.textContent = '';
        });
    }

    function updateCounters(values) {
        setCounter('#publish-title-counter', values.title.length, LIMITS.titleMax, LIMITS.titleMin);
        setCounter('#publish-description-counter', values.description.length, LIMITS.descMax, LIMITS.descMin);
    }

    /**
     * El contador avisa dos veces: cuando aún falta para el mínimo y cuando se
     * acerca (o pasa) el máximo que aceptará el servidor.
     */
    function setCounter(selector, length, max, min) {
        const node = q(selector);
        if (!node) return;

        const missing = min - length;
        const short = length > 0 && missing > 0;
        const near = length > max - Math.max(8, Math.round(max * 0.1)) && length <= max;
        const over = length > max;

        node.textContent = short
            ? `Faltan ${missing} ${format.plural(missing, 'carácter', 'caracteres')}`
            : `${length} / ${max}`;

        node.classList.toggle('is-warning', !over && (short || near));
        node.classList.toggle('is-error', over);
    }

    /* ======================================================================
       Vista previa
       ====================================================================== */

    function buildPreviewPost(values) {
        const user = state.user || {};
        const category = findCategory(values.category_id);
        const emoji = state.emoji || (category ? category.icon : '🛍️');
        const title = values.title || 'Lo que buscas';
        const district = values.district || user.district || 'Arequipa';
        const budgetMin = Number(values.budget_min);
        const budgetMax = Number(values.budget_max);

        return {
            id: 'preview',
            title,
            description: values.description
                || 'Aquí aparecerá tu descripción: qué buscas exactamente, para qué lo quieres y qué detalles importan.',
            budget_min: Number.isFinite(budgetMin) && budgetMin > 0 ? budgetMin : 0,
            budget_max: Number.isFinite(budgetMax) && budgetMax > 0 ? budgetMax : 0,
            condition: values.condition || 'Cualquiera que funcione',
            emoji,
            image_url: global.DiscoverySeed.createImage(title, emoji),
            category: category
                ? { id: category.id, name: category.name, icon: category.icon }
                : { id: null, name: 'Sin categoría', icon: '📦' },
            author: {
                id: user.id || null,
                username: user.username || 'Tú',
                avatar_url: user.avatar_url || null,
                district,
                rating: user.rating || 0,
                verified: !!user.verified,
            },
            district,
            status: 'pending',
            rejection_reason: null,
            likes_count: 0,
            interested_count: 0,
            saves_count: 0,
            comment_count: 0,
            views: 0,
            created_at: new Date().toISOString(),
        };
    }

    function renderPreview() {
        const container = q('#publish-preview');
        if (!container) return;

        container.innerHTML = UI.postCard(buildPreviewPost(readValues()), { showActions: false });
        makeInert(container);
    }

    /**
     * La tarjeta de ejemplo es decorativa: no debe robar el tabulador al
     * formulario ni llevarse a nadie a una publicación que todavía no existe.
     */
    function makeInert(container) {
        container.setAttribute('inert', '');
        container.setAttribute('tabindex', '-1');

        container.querySelectorAll('a[href]').forEach((link) => {
            link.removeAttribute('href');
            link.setAttribute('tabindex', '-1');
        });

        container.querySelectorAll('button').forEach((button) => {
            button.disabled = true;
            button.tabIndex = -1;
        });
    }

    /* ======================================================================
       Borrador
       ====================================================================== */

    function hasContent(values) {
        return !!(values.title || values.description || values.budget_min || values.budget_max);
    }

    function saveDraft(values) {
        try {
            if (!hasContent(values)) {
                localStorage.removeItem(DRAFT_KEY);
                return;
            }
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                ...values,
                emoji: state.emoji,
                emoji_touched: state.emojiTouched,
                saved_at: new Date().toISOString(),
            }));
        } catch (error) {
            /* navegador sin almacenamiento: se sigue sin borrador */
        }
    }

    function readDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            const draft = raw ? JSON.parse(raw) : null;
            return draft && typeof draft === 'object' ? draft : null;
        } catch (error) {
            return null;
        }
    }

    function clearDraft() {
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (error) {
            /* nada que borrar */
        }
    }

    /** Recuperar un borrador no cuenta como cambio sin guardar. */
    function restoreDraft() {
        const draft = readDraft();
        if (!draft || !hasContent(draft)) return;

        setValue('#publish-title', draft.title);
        setValue('#publish-description', draft.description);
        setValue('#publish-budget-min', draft.budget_min);
        setValue('#publish-budget-max', draft.budget_max);
        setValue('#publish-category', draft.category_id);
        setValue('#publish-district', draft.district);

        if (draft.condition) {
            stage.querySelectorAll('#publish-form input[name="condition"]').forEach((radio) => {
                radio.checked = radio.value === draft.condition;
            });
        }

        state.emojiTouched = !!draft.emoji_touched;
        if (state.emojiTouched && draft.emoji) selectEmoji(draft.emoji);

        renderDraftNotice(draft);
    }

    function setValue(selector, value) {
        const node = q(selector);
        if (node && value) node.value = value;
    }

    function renderDraftNotice(draft) {
        const slot = q('#publish-draft-slot');
        if (!slot) return;

        slot.innerHTML = `
            <div class="alert alert-info publish-draft" role="status">
                <span class="alert-icon" aria-hidden="true">💾</span>
                <div class="alert-content">
                    <p class="alert-title">Recuperamos tu borrador</p>
                    <p class="alert-body">
                        Lo guardamos ${escapeHtml(format.relative(draft.saved_at))} en este navegador.
                        Sigue donde lo dejaste o empieza de cero.
                    </p>
                </div>
                <button class="btn btn-ghost btn-sm publish-draft-discard" type="button" id="publish-discard-draft">
                    Descartar
                </button>
            </div>`;

        q('#publish-discard-draft').addEventListener('click', () => {
            clearDraft();
            resetForm();
            toast.info('Borrador descartado. Empiezas de cero.');
        });
    }

    /* ======================================================================
       Protección contra pérdida de cambios
       ====================================================================== */

    function warnOnUnload(event) {
        if (!state.dirty || state.submitting) return;
        event.preventDefault();
        event.returnValue = '';
    }

    function enableUnloadGuard() {
        if (state.guarded) return;
        global.addEventListener('beforeunload', warnOnUnload);
        state.guarded = true;
    }

    function disableUnloadGuard() {
        if (!state.guarded) return;
        global.removeEventListener('beforeunload', warnOnUnload);
        state.guarded = false;
    }

    async function handleCancel(event) {
        if (!state.dirty) return;

        event.preventDefault();
        const leave = await modal.confirm({
            title: '¿Descartar lo escrito?',
            message: 'Tienes cambios sin publicar. Guardamos un borrador en este navegador, '
                + 'así que podrás retomarlo cuando vuelvas.',
            confirmLabel: 'Salir de todos modos',
            cancelLabel: 'Seguir editando',
            danger: true,
        });

        if (leave) {
            state.dirty = false;
            disableUnloadGuard();
            global.location.href = 'index.html';
        }
    }

    /* ======================================================================
       Eventos del formulario
       ====================================================================== */

    const schedulePreview = debounce(renderPreview, 200);
    const scheduleDraftSave = debounce(() => saveDraft(readValues()), 600);

    function fieldNameOf(target) {
        return target && Object.prototype.hasOwnProperty.call(RULES, target.name) ? target.name : null;
    }

    function handleFormInput(event) {
        state.dirty = true;

        if (event.target && event.target.name === 'category_id') syncEmojiFromCategory();

        const values = readValues();
        updateCounters(values);

        // Solo se corrige lo que el usuario ya dio por terminado: regañar
        // mientras se escribe la primera letra sobra.
        const name = fieldNameOf(event.target);
        if (name && state.touched.has(name)) validateField(name, values);

        schedulePreview();
        scheduleDraftSave();
    }

    function handleFormBlur(event) {
        const name = fieldNameOf(event.target);
        if (!name) return;
        state.touched.add(name);
        validateField(name, readValues());
    }

    /** Repinta todo lo que depende de los valores actuales. */
    function refreshAll() {
        updateCounters(readValues());
        renderPreview();
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (state.submitting) return;

        const values = readValues();
        Object.keys(RULES).forEach((name) => state.touched.add(name));
        const invalid = Object.keys(RULES).filter((name) => !validateField(name, values));

        if (invalid.length) {
            const first = q(`#${FIELD_IDS[invalid[0]]}`);
            if (first) first.focus();
            toast.error('Revisa los campos marcados antes de publicar.');
            return;
        }

        await sendPost(values);
    }

    async function sendPost(values) {
        const button = q('#publish-submit');
        const category = findCategory(values.category_id);

        state.submitting = true;
        button.classList.add('is-loading');
        button.disabled = true;

        try {
            const result = await api.createRequest({
                title: values.title,
                description: values.description,
                budget_min: values.budget_min,
                budget_max: values.budget_max,
                category_id: values.category_id,
                condition: values.condition || 'Cualquiera que funcione',
                district: values.district,
                emoji: state.emoji || (category ? category.icon : ''),
            });

            clearDraft();
            state.dirty = false;
            disableUnloadGuard();
            showSuccess(result.request);
        } catch (error) {
            // El servidor explica por qué bloquea (403 de vendedor no aprobado,
            // 401 de sesión caducada). Se muestra su mensaje tal cual.
            toast.error(error.message || 'No pudimos publicar tu artículo. Inténtalo de nuevo.');
            if (error.status === 401 || error.status === 403) await refreshAccess();
        } finally {
            state.submitting = false;
            button.classList.remove('is-loading');
            button.disabled = false;
        }
    }

    async function refreshAccess() {
        const session = await api.getCurrentUser();
        store.set({ user: session ? session.user || session : null });
    }

    /* ======================================================================
       Confirmación
       ====================================================================== */

    function showSuccess(post) {
        const content = document.createElement('div');
        content.className = 'publish-success';
        content.innerHTML = `
            <p class="publish-success-lead">
                Ya la tenemos. El equipo la revisará y aparecerá en el foro en cuanto quede aprobada;
                mientras tanto la verás en tu perfil con la insignia «En revisión».
            </p>`;

        const card = document.createElement('div');
        card.className = 'publish-success-card';
        card.innerHTML = UI.postCard(post, { showStatus: true, showActions: false });
        makeInert(card);
        content.appendChild(card);

        modal.open({
            title: 'Publicación enviada a revisión',
            size: 'lg',
            content,
            actions: [
                {
                    label: 'Ir al foro',
                    variant: 'ghost',
                    action: () => { global.location.href = 'index.html'; return false; },
                },
                {
                    label: 'Publicar otro',
                    variant: 'secondary',
                    action: () => { resetForm(); },
                },
                {
                    label: 'Ver mis publicaciones',
                    variant: 'primary',
                    action: () => { global.location.href = 'perfil.html#publicaciones'; return false; },
                },
            ],
        });
    }

    function resetForm() {
        const form = q('#publish-form');
        if (!form) return;

        form.reset();
        const slot = q('#publish-draft-slot');
        if (slot) slot.innerHTML = '';

        state.emojiTouched = false;
        state.dirty = false;
        clearErrors();
        syncEmojiFromCategory();
        refreshAll();
        enableUnloadGuard();

        global.scrollTo({ top: 0, behavior: 'smooth' });

        // El modal devuelve el foco al cerrarse, así que el nuestro va después.
        setTimeout(() => {
            const title = q('#publish-title');
            if (title) title.focus();
        }, 0);
    }

    /* ======================================================================
       Arranque
       ====================================================================== */

    async function init() {
        stage = document.getElementById('publish-stage');
        if (!stage) return;

        await api.ready();

        try {
            const [user, catalog] = await Promise.all([resolveUser(), api.getCategories()]);
            state.categories = (catalog && catalog.categories) || [];
            applyUser(user);
        } catch (error) {
            renderErrorGate(error.message || 'Vuelve a intentarlo en un momento.');
            return;
        }

        // `shell.js` resuelve la sesión en paralelo: si cambia (o se cierra),
        // la pantalla se recalcula sola. `false` evita la llamada inmediata.
        store.subscribe('user', onUserChange, false);
    }

    /** El store puede ir por detrás de la cabecera: se pregunta a la API. */
    async function resolveUser() {
        const cached = store.get('user');
        if (cached) return cached;

        const session = await api.getCurrentUser();
        return session ? session.user || session : null;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
