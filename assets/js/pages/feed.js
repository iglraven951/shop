/**
 * DiscoveryShop · Feed del foro
 *
 * Las publicaciones se apilan en una sola columna, como en una red social.
 * Todo el estado vive en `state`. Cada cambio de filtro hace tres cosas en
 * este orden: actualizar `state`, sincronizar la URL y volver a pedir datos.
 *
 * La URL es la fuente de verdad al arrancar, de modo que cualquier enlace
 * (`index.html?sort=popular`, el buscador global de la cabecera, el enlace al
 * autor desde una publicación) reconstruye exactamente la misma vista.
 */
(function (global) {
    'use strict';

    const { $, $$, escapeHtml, escapeAttr, format, debounce, url } = global.DS;
    const api = global.api;
    const store = global.store;
    const UI = global.UI;
    const toast = global.toast;

    const PER_PAGE = 10;
    const SKELETON_COUNT = 4;
    const STATS_SAMPLE = 48;

    const SORT_OPTIONS = ['recent', 'price_asc', 'price_desc', 'popular', 'interest', 'commented'];
    const CONDITION_OPTIONS = ['Nuevo', 'Como nuevo', 'Buen estado'];

    const state = {
        filters: defaultFilters(),
        page: 1,
        posts: [],
        categories: [],
        districts: [],
        pagination: null,
        /** Nombre del autor cuando se filtra por `author_id`; se memoriza para
         *  poder nombrarlo aunque una página posterior venga vacía. */
        authorName: '',
        failed: false,
    };

    // Descarta respuestas que llegan tarde: sin esto, teclear rápido puede
    // dejar en pantalla el resultado de una búsqueda anterior.
    let requestId = 0;
    let actionsBound = false;

    const dom = {};

    /* ======================================================================
       Estado de los filtros
       ====================================================================== */

    function defaultFilters() {
        return {
            q: '',
            category: [],
            district: [],
            condition: [],
            min_price: '',
            max_price: '',
            author_id: '',
            sort: 'recent',
        };
    }

    /** Convierte «a,b,c» en ['a','b','c'] descartando vacíos. */
    function csv(value) {
        return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    }

    /**
     * Solo acepta números finitos y no negativos; cualquier otra cosa se ignora.
     * El campo vacío se descarta antes de convertir: `Number('')` vale 0, y un
     * «máximo 0» colado en la URL dejaría el feed sin una sola publicación.
     */
    function positiveNumber(value) {
        const raw = String(value === undefined || value === null ? '' : value).trim();
        if (!raw) return '';

        const amount = Number(raw);
        return Number.isFinite(amount) && amount >= 0 ? String(amount) : '';
    }

    /** Reconstruye los filtros desde la barra de direcciones. */
    function readFiltersFromUrl() {
        const sort = url.param('sort', '');

        state.filters = {
            q: String(url.param('q', '') || '').slice(0, 120),
            category: csv(url.param('category', '')),
            district: csv(url.param('district', '')),
            condition: csv(url.param('condition', '')).filter((c) => CONDITION_OPTIONS.includes(c)),
            min_price: positiveNumber(url.param('min_price', '')),
            max_price: positiveNumber(url.param('max_price', '')),
            author_id: String(url.param('author_id', '') || '').slice(0, 64),
            sort: SORT_OPTIONS.includes(sort) ? sort : 'recent',
        };

        const page = parseInt(url.param('page', '1'), 10);
        state.page = Number.isFinite(page) && page > 0 ? page : 1;

        // El autor memorizado deja de valer si el filtro cambió de persona.
        state.authorName = '';
    }

    /**
     * Forma común de los filtros para la API y para la barra de direcciones.
     * `forUrl` omite lo que ya es el valor por omisión, para no ensuciar el enlace.
     */
    function serializeFilters(forUrl) {
        const f = state.filters;
        return {
            q: f.q,
            category: f.category,
            district: f.district,
            condition: f.condition,
            min_price: f.min_price,
            max_price: f.max_price,
            author_id: f.author_id,
            sort: forUrl && f.sort === 'recent' ? '' : f.sort,
        };
    }

    /** Deja la URL compartible: solo los valores que se apartan del defecto. */
    function syncUrl() {
        url.sync({
            ...serializeFilters(true),
            page: state.page > 1 ? state.page : '',
        });
    }

    function countActiveFilters() {
        const f = state.filters;
        let total = f.category.length + f.district.length + f.condition.length;
        if (f.q) total += 1;
        if (f.min_price || f.max_price) total += 1;
        if (f.author_id) total += 1;
        return total;
    }

    function hasActiveFilters() {
        return countActiveFilters() > 0;
    }

    /* ======================================================================
       Carga de datos
       ====================================================================== */

    async function loadPosts({ scroll = false } = {}) {
        const id = (requestId += 1);

        // La portada se oculta ANTES de desplazarse: si colapsara después,
        // el feed quedaría por encima del borde superior de la ventana.
        if (scroll) {
            dom.hero.hidden = hasActiveFilters();
            scrollToFeed();
        }

        state.failed = false;
        dom.feed.setAttribute('aria-busy', 'true');
        dom.feedState.innerHTML = '';
        dom.pagination.innerHTML = '';
        dom.feed.innerHTML = UI.postSkeleton(SKELETON_COUNT);

        try {
            const data = await api.getPosts({
                ...serializeFilters(false),
                page: state.page,
                per_page: PER_PAGE,
            });

            if (id !== requestId) return;

            state.posts = data.posts || [];
            state.pagination = data.pagination || null;

            // La API puede corregir la página cuando pedimos una que ya no existe.
            if (state.pagination && state.pagination.page !== state.page) {
                state.page = state.pagination.page;
                syncUrl();
            }

            rememberAuthorName();
            renderResults();
        } catch (error) {
            if (id !== requestId) return;
            state.failed = true;
            renderError(error);
            toast.error(error.message || 'No se pudieron cargar las publicaciones');
        } finally {
            if (id === requestId) dom.feed.setAttribute('aria-busy', 'false');
        }
    }

    async function loadCategories() {
        try {
            const data = await api.getCategories();
            state.categories = data.categories || [];
            renderCategories();
        } catch (error) {
            // Sin categorías el feed sigue siendo usable: solo se pierde el filtro.
            dom.categoryOptions.setAttribute('aria-busy', 'false');
            dom.categoryOptions.innerHTML =
                '<p class="filter-note">No se pudieron cargar las categorías.</p>';
        }
    }

    async function loadDistricts() {
        try {
            const data = await api.getDistricts();
            state.districts = data.districts || [];
            renderDistricts();
            renderDistrictStat();
        } catch (error) {
            dom.districtOptions.setAttribute('aria-busy', 'false');
            dom.districtOptions.innerHTML =
                '<p class="filter-note">No se pudieron cargar los distritos.</p>';
        }
    }

    /**
     * Cifras de la portada. Salen de datos reales: el total sin filtros que
     * devuelve la paginación y los vendedores verificados de una muestra amplia.
     * Si la muestra no abarca el foro entero, el número lleva «+» para no
     * afirmar una cifra exacta que no conocemos.
     */
    async function loadStats() {
        try {
            const data = await api.getPosts({ page: 1, per_page: STATS_SAMPLE });
            const sample = data.posts || [];
            const total = data.pagination ? data.pagination.total : sample.length;

            const sellers = new Set(
                sample
                    .filter((post) => post.author && post.author.verified)
                    .map((post) => post.author.id)
                    .filter(Boolean)
            );

            dom.statPosts.textContent = format.number(total);
            dom.statSellers.textContent =
                format.number(sellers.size) + (total > sample.length ? '+' : '');
        } catch (error) {
            /* Las cifras son decorativas: su fallo no rompe la página. */
        }
    }

    function renderDistrictStat() {
        if (!dom.statDistricts) return;
        const covered = state.districts.filter((district) => (district.count || 0) > 0).length;
        dom.statDistricts.textContent = format.number(covered || state.districts.length);
    }

    /* ======================================================================
       Pintado del feed
       ====================================================================== */

    function renderResults() {
        const total = state.pagination ? state.pagination.total : state.posts.length;

        renderHeading(total);
        renderAuthorNotice();
        renderActiveFilters();
        updateFilterSummaries();
        updateFiltersCount();
        dom.hero.hidden = hasActiveFilters();

        if (!state.posts.length) {
            dom.feed.innerHTML = '';
            dom.pagination.innerHTML = '';
            dom.feedState.innerHTML = UI.emptyState({
                icon: '🔍',
                title: 'No encontramos publicaciones',
                message: hasActiveFilters()
                    ? 'Prueba con otras palabras o quita alguno de los filtros aplicados.'
                    : 'Todavía no hay publicaciones aprobadas en el foro.',
                action: hasActiveFilters()
                    ? { label: 'Limpiar filtros', onClick: 'clear-filters' }
                    : { label: 'Publicar un artículo', href: 'publicar.html' },
            });
            return;
        }

        // El estado vacío vive fuera del feed, así que basta con vaciarlo para
        // que las publicaciones vuelvan a verse. Nunca ocultamos el feed.
        dom.feedState.innerHTML = '';

        dom.feed.innerHTML = state.posts
            .map((post, index) => UI.postCard(post, { index }))
            .join('');

        // Una sola vez: la delegación sobrevive a cada repintado del feed.
        if (!actionsBound) {
            UI.bindPostActions(dom.feed);
            actionsBound = true;
        }

        dom.pagination.innerHTML = state.pagination ? UI.pagination(state.pagination) : '';
    }

    function renderHeading(total) {
        const f = state.filters;
        let title = 'Todas las publicaciones';

        if (f.category.length === 1) {
            const category = state.categories.find((c) => c.id === f.category[0]);
            if (category) title = category.name;
        } else if (f.category.length > 1) {
            title = `${f.category.length} categorías seleccionadas`;
        }

        if (f.district.length === 1) title = `${title} en ${f.district[0]}`;

        if (f.q) title = `Resultados para «${f.q}»`;

        if (f.author_id) {
            title = state.authorName
                ? `Publicaciones de ${state.authorName}`
                : 'Publicaciones de este vendedor';
        }

        // textContent en lugar de innerHTML: el título viene de datos del usuario.
        dom.title.textContent = title;

        if (total === 0) {
            dom.count.textContent = 'Sin resultados';
            return;
        }

        const pages = state.pagination ? state.pagination.total_pages : 1;
        const suffix = pages > 1 ? ` · página ${state.page} de ${pages}` : '';
        dom.count.textContent = `${format.number(total)} `
            + `${format.plural(total, 'publicación encontrada', 'publicaciones encontradas')}${suffix}`;
    }

    /** Guarda el nombre del autor filtrado para poder nombrarlo en la cabecera. */
    function rememberAuthorName() {
        if (!state.filters.author_id) {
            state.authorName = '';
            return;
        }

        const first = state.posts.find((post) => post.author && post.author.username);
        if (first) state.authorName = first.author.username;
    }

    /** Aviso de «estás viendo solo a esta persona», con salida a un clic. */
    function renderAuthorNotice() {
        if (!state.filters.author_id) {
            dom.authorNotice.innerHTML = '';
            return;
        }

        const name = state.authorName || 'este vendedor';

        dom.authorNotice.innerHTML = `
            <div class="feed-author-note">
                <span class="feed-author-note-text">
                    <span aria-hidden="true">👤</span>
                    Viendo solo las publicaciones de
                    <strong>${escapeHtml(name)}</strong>
                </span>
                <button class="btn btn-ghost btn-sm" type="button" data-remove="author_id" data-value="">
                    Ver todo el foro
                </button>
            </div>`;
    }

    function renderError(error) {
        dom.feed.innerHTML = '';
        dom.pagination.innerHTML = '';
        dom.count.textContent = 'No se pudo cargar el foro';
        dom.feedState.innerHTML = UI.emptyState({
            icon: '📡',
            title: 'No pudimos cargar las publicaciones',
            message: (error && error.message) || 'Revisa tu conexión e inténtalo de nuevo.',
            action: { label: 'Reintentar', onClick: 'retry' },
        });
    }

    /* ======================================================================
       Pintado del panel de filtros
       ====================================================================== */

    function renderCategories() {
        const selected = state.filters.category;

        dom.categoryOptions.setAttribute('aria-busy', 'false');

        if (!state.categories.length) {
            dom.categoryOptions.innerHTML = '<p class="filter-note">No hay categorías disponibles.</p>';
            return;
        }

        dom.categoryOptions.innerHTML = state.categories.map((category) => `
            <label class="choice">
                <input type="checkbox" name="category" value="${escapeAttr(category.id)}"
                       ${selected.includes(category.id) ? 'checked' : ''}>
                <span class="choice-text">${escapeHtml(category.icon || '🏷️')} ${escapeHtml(category.name)}</span>
                <span class="choice-count">${escapeHtml(format.number(category.count || 0))}</span>
            </label>`).join('');

        updateFilterSummaries();
    }

    /**
     * Lista de distritos, acotada por el buscador propio del grupo. Los que
     * están marcados se muestran siempre, aunque no coincidan con el texto:
     * de lo contrario un filtro aplicado se volvería invisible.
     */
    function renderDistricts() {
        const selected = state.filters.district;
        const needle = normalize(dom.districtFinder ? dom.districtFinder.value : '');

        dom.districtOptions.setAttribute('aria-busy', 'false');

        const visible = state.districts.filter((district) => (
            !needle
            || normalize(district.name).includes(needle)
            || selected.includes(district.name)
        ));

        if (!visible.length) {
            dom.districtOptions.innerHTML =
                '<p class="filter-note">Ningún distrito coincide con esa búsqueda.</p>';
            return;
        }

        dom.districtOptions.innerHTML = visible.map((district) => `
            <label class="choice">
                <input type="checkbox" name="district" value="${escapeAttr(district.name)}"
                       ${selected.includes(district.name) ? 'checked' : ''}>
                <span class="choice-text">${escapeHtml(district.name)}</span>
                <span class="choice-count">${escapeHtml(format.number(district.count || 0))}</span>
            </label>`).join('');

        updateFilterSummaries();
    }

    /** Minúsculas sin tildes: «José Luis» encuentra «jose luis». */
    function normalize(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim();
    }

    /** Resumen a la derecha de cada `<summary>`: qué está aplicado, de un vistazo. */
    function updateFilterSummaries() {
        const f = state.filters;

        setSummary(dom.summarySearch, f.q ? `«${f.q}»` : 'Todo', !!f.q);

        setSummary(
            dom.summaryCategory,
            describeSelection(f.category.map(categoryName), 'Todas', 'seleccionadas'),
            f.category.length > 0
        );

        setSummary(
            dom.summaryDistrict,
            describeSelection(f.district, 'Todos', 'seleccionados'),
            f.district.length > 0
        );

        setSummary(dom.summaryPrice, describePrice(), !!(f.min_price || f.max_price));

        setSummary(
            dom.summaryCondition,
            describeSelection(f.condition, 'Cualquiera', 'seleccionados'),
            f.condition.length > 0
        );
    }

    function setSummary(node, text, active) {
        if (!node) return;
        node.textContent = text;
        node.classList.toggle('is-active', !!active);
    }

    function categoryName(id) {
        const category = state.categories.find((c) => c.id === id);
        return category ? category.name : id;
    }

    function describeSelection(values, emptyLabel, pluralLabel) {
        if (!values.length) return emptyLabel;
        if (values.length === 1) return values[0];
        return `${values.length} ${pluralLabel}`;
    }

    function describePrice() {
        const { min_price: min, max_price: max } = state.filters;

        if (min && max) return `S/ ${format.number(min)} – ${format.number(max)}`;
        if (min) return `Desde S/ ${format.number(min)}`;
        if (max) return `Hasta S/ ${format.number(max)}`;
        return 'Cualquiera';
    }

    function renderActiveFilters() {
        const f = state.filters;
        const chips = [];

        if (f.q) chips.push(filterChip('q', '', `Búsqueda: ${f.q}`));

        f.category.forEach((id) => {
            chips.push(filterChip('category', id, `Categoría: ${categoryName(id)}`));
        });

        f.district.forEach((name) => {
            chips.push(filterChip('district', name, `Distrito: ${name}`));
        });

        if (f.min_price || f.max_price) {
            chips.push(filterChip('price', '', `Precio: ${describePrice()}`));
        }

        f.condition.forEach((condition) => {
            chips.push(filterChip('condition', condition, `Estado: ${condition}`));
        });

        if (f.author_id) {
            chips.push(filterChip('author_id', '', `Vendedor: ${state.authorName || 'seleccionado'}`));
        }

        if (chips.length > 1) {
            chips.push('<button class="btn btn-ghost btn-sm" type="button"'
                + ' data-action="clear-filters">Limpiar todo</button>');
        }

        // `.active-filters:empty` se oculta sola, así que no dejamos ni un espacio.
        dom.activeFilters.innerHTML = chips.join('');
    }

    function filterChip(type, value, label) {
        return `<span class="chip">${escapeHtml(label)}<button class="chip-remove" type="button"`
            + ` data-remove="${escapeAttr(type)}" data-value="${escapeAttr(value)}"`
            + ` aria-label="Quitar el filtro ${escapeAttr(label)}"><span aria-hidden="true">✕</span></button></span>`;
    }

    /** Pastilla del panel y contador del botón flotante. */
    function updateFiltersCount() {
        const count = countActiveFilters();
        const label = `${count} ${format.plural(count, 'activo', 'activos')}`;

        dom.filtersCount.textContent = count ? String(count) : '';
        dom.filtersCount.hidden = count === 0;

        if (count) {
            dom.filtersCount.setAttribute(
                'aria-label',
                `${count} ${format.plural(count, 'filtro activo', 'filtros activos')}`
            );
        } else {
            dom.filtersCount.removeAttribute('aria-label');
        }

        dom.fabCount.textContent = count ? String(count) : '';
        dom.fabCount.hidden = count === 0;
        dom.fab.setAttribute(
            'aria-label',
            count ? `Abrir filtros, ${label}` : 'Abrir el panel de filtros'
        );
    }

    /* ======================================================================
       Interacción
       ====================================================================== */

    /** Un cambio de filtro siempre vuelve a la primera página. */
    function changed(options) {
        state.page = 1;
        syncUrl();
        updateFilterSummaries();
        updateFiltersCount();
        loadPosts(options);
    }

    function applyFiltersToControls() {
        const f = state.filters;

        dom.search.value = f.q;
        dom.minPrice.value = f.min_price;
        dom.maxPrice.value = f.max_price;
        dom.sort.value = f.sort;

        $$('input[name="condition"]', dom.panel).forEach((input) => {
            input.checked = f.condition.includes(input.value);
        });

        syncCheckboxes('category', dom.categoryOptions, f.category);
        syncCheckboxes('district', dom.districtOptions, f.district);
        updateFilterSummaries();
    }

    function syncCheckboxes(name, container, values) {
        if (!container) return;
        $$(`input[name="${name}"]`, container).forEach((input) => {
            input.checked = values.includes(input.value);
        });
    }

    function resetFilters() {
        const sort = state.filters.sort; // el orden no es un filtro: se conserva
        state.filters = defaultFilters();
        state.filters.sort = sort;
        state.authorName = '';

        if (dom.districtFinder) dom.districtFinder.value = '';

        applyFiltersToControls();
        renderDistricts();
        changed();
    }

    function removeFilter(type, value) {
        const f = state.filters;

        switch (type) {
            case 'q': f.q = ''; break;
            case 'category': f.category = f.category.filter((id) => id !== value); break;
            case 'district': f.district = f.district.filter((name) => name !== value); break;
            case 'condition': f.condition = f.condition.filter((c) => c !== value); break;
            case 'price': f.min_price = ''; f.max_price = ''; break;
            case 'author_id': f.author_id = ''; state.authorName = ''; break;
            default: return;
        }

        applyFiltersToControls();
        changed();
    }

    function applyPriceRange(minValue, maxValue) {
        let min = positiveNumber(minValue !== undefined ? minValue : dom.minPrice.value);
        let max = positiveNumber(maxValue !== undefined ? maxValue : dom.maxPrice.value);

        // Si el usuario invierte los extremos, los ordenamos en lugar de
        // devolver una lista vacía que parecería un error.
        if (min && max && Number(min) > Number(max)) {
            const swap = min;
            min = max;
            max = swap;
        }

        dom.minPrice.value = min;
        dom.maxPrice.value = max;
        state.filters.min_price = min;
        state.filters.max_price = max;
        changed();
    }

    function scrollToFeed() {
        if (!dom.section) return;
        const reduce = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        dom.section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    /** Repinta los marcadores si «guardados» cambia desde otro punto del sitio. */
    function repaintSaved(list) {
        const saved = list || [];

        $$('.post-action[data-action="save"]', dom.feed).forEach((button) => {
            const active = saved.includes(button.dataset.id);
            if (button.classList.contains('is-active') === active) return;

            button.classList.toggle('is-active', active);
            button.classList.toggle('is-save', active);
            button.setAttribute('aria-pressed', String(active));

            const icon = button.querySelector('.post-action-icon');
            if (icon) icon.innerHTML = active ? UI.icons.bookmarkFill : UI.icons.bookmark;
        });
    }

    function bindEvents() {
        const search = debounce((value) => {
            state.filters.q = value.trim().slice(0, 120);
            changed();
        }, 300);

        dom.search.addEventListener('input', (event) => search(event.target.value));

        // El evento «search» cubre Enter y la ✕ nativa del campo de búsqueda.
        dom.search.addEventListener('search', (event) => {
            search.cancel();
            state.filters.q = event.target.value.trim().slice(0, 120);
            changed();
        });

        dom.sort.addEventListener('change', (event) => {
            const value = event.target.value;
            state.filters.sort = SORT_OPTIONS.includes(value) ? value : 'recent';
            changed();
        });

        // Un único oyente para todo el panel: categorías, distritos y estado.
        dom.panel.addEventListener('change', (event) => {
            const input = event.target;

            // Las listas se releen de las casillas marcadas en lugar de añadir
            // y quitar a mano: así el estado nunca se desincroniza.
            if (input.name === 'category') {
                state.filters.category = checkedValues('category', dom.categoryOptions);
            } else if (input.name === 'district') {
                state.filters.district = checkedValues('district', dom.districtOptions);
            } else if (input.name === 'condition') {
                state.filters.condition = checkedValues('condition', dom.panel);
            } else {
                return;
            }

            changed();
        });

        [dom.minPrice, dom.maxPrice].forEach((input) => {
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyPriceRange();
                }
            });
        });

        if (dom.districtFinder) {
            const finder = debounce(() => renderDistricts(), 180);
            dom.districtFinder.addEventListener('input', finder);
            dom.districtFinder.addEventListener('search', () => {
                finder.cancel();
                renderDistricts();
            });
            // Enter dentro del buscador de distritos no debe hacer nada más.
            dom.districtFinder.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') event.preventDefault();
            });
        }

        dom.pagination.addEventListener('click', (event) => {
            const button = event.target.closest('[data-page]');
            if (!button || button.disabled) return;

            const page = parseInt(button.dataset.page, 10);
            const totalPages = state.pagination ? state.pagination.total_pages : 1;
            if (!Number.isFinite(page) || page < 1 || page > totalPages || page === state.page) return;

            state.page = page;
            syncUrl();
            loadPosts({ scroll: true });
        });

        dom.fab.addEventListener('click', () => {
            if (global.DiscoveryShell) global.DiscoveryShell.toggleFilters(true);
        });

        // Acciones sueltas repartidas por la página (portada, chips, estados).
        document.addEventListener('click', (event) => {
            const preset = event.target.closest('.price-preset');
            if (preset) {
                event.preventDefault();
                applyPriceRange(preset.dataset.min || '', preset.dataset.max || '');
                return;
            }

            const trigger = event.target.closest('[data-action]');
            if (trigger) {
                const action = trigger.dataset.action;
                if (action === 'clear-filters') { event.preventDefault(); resetFilters(); return; }
                if (action === 'apply-price') { event.preventDefault(); applyPriceRange(); return; }
                if (action === 'scroll-feed') { event.preventDefault(); scrollToFeed(); return; }
                if (action === 'retry') { event.preventDefault(); loadPosts(); return; }
                if (action === 'close-filters') {
                    event.preventDefault();
                    if (global.DiscoveryShell) global.DiscoveryShell.toggleFilters(false);
                    return;
                }
            }

            const remove = event.target.closest('[data-remove]');
            if (remove) {
                event.preventDefault();
                removeFilter(remove.dataset.remove, remove.dataset.value || '');
            }
        });

        // Atrás y adelante del navegador: la URL vuelve a mandar.
        global.addEventListener('popstate', () => {
            readFiltersFromUrl();
            applyFiltersToControls();
            renderDistricts();
            updateFiltersCount();
            loadPosts();
        });

        store.subscribe('saved', repaintSaved, false);
    }

    function checkedValues(name, container) {
        if (!container) return [];
        return $$(`input[name="${name}"]:checked`, container).map((input) => input.value);
    }

    /* ======================================================================
       Arranque
       ====================================================================== */

    function cacheDom() {
        dom.hero = $('#feed-hero');
        dom.section = $('#feed');
        dom.panel = $('#filters-panel');
        dom.search = $('#filter-search');
        dom.categoryOptions = $('#filter-categories');
        dom.districtOptions = $('#filter-districts');
        dom.districtFinder = $('#district-finder');
        dom.minPrice = $('#filter-min-price');
        dom.maxPrice = $('#filter-max-price');
        dom.filtersCount = $('#filters-count');
        dom.title = $('#results-title');
        dom.count = $('#results-count');
        dom.sort = $('#sort-select');
        dom.authorNotice = $('#author-notice');
        dom.activeFilters = $('#active-filters');
        dom.feed = $('#post-feed');
        dom.feedState = $('#feed-state');
        dom.pagination = $('#pagination-slot');
        dom.fab = $('#filters-fab');
        dom.fabCount = $('#filters-fab-count');
        dom.statPosts = $('#stat-posts');
        dom.statSellers = $('#stat-sellers');
        dom.statDistricts = $('#stat-districts');
        dom.summarySearch = $('#summary-search');
        dom.summaryCategory = $('#summary-category');
        dom.summaryDistrict = $('#summary-district');
        dom.summaryPrice = $('#summary-price');
        dom.summaryCondition = $('#summary-condition');
    }

    async function init() {
        cacheDom();
        if (!dom.feed) return;

        readFiltersFromUrl();
        applyFiltersToControls();
        updateFiltersCount();
        dom.hero.hidden = hasActiveFilters();
        bindEvents();

        dom.feed.innerHTML = UI.postSkeleton(SKELETON_COUNT);

        try {
            await api.ready();

            // Categorías, distritos y publicaciones no dependen entre sí.
            await Promise.all([loadCategories(), loadDistricts(), loadPosts()]);

            // Las categorías pueden llegar tras el primer pintado; el título y
            // las pastillas necesitan sus nombres para no mostrar identificadores.
            if (!state.failed) {
                renderHeading(state.pagination ? state.pagination.total : state.posts.length);
                renderActiveFilters();
                updateFilterSummaries();
            }

            if (!hasActiveFilters()) loadStats();
        } catch (error) {
            // Red de seguridad: sin esto un fallo inesperado dejaría los
            // esqueletos de carga en pantalla para siempre.
            state.failed = true;
            renderError(error);
            dom.feed.setAttribute('aria-busy', 'false');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
