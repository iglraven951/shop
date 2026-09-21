/**
 * DiscoveryShop · Mapa de vendedores
 *
 * Sección propia que responde a una pregunta muy concreta: ¿dónde están las
 * personas que publican en DiscoveryShop? Solo aparecen vendedores aprobados
 * (verificados) con al menos una publicación activa, que es exactamente lo que
 * devuelve `api.getMapSellers()`.
 *
 * El mapa es un extra, nunca un requisito: si Leaflet no llega a cargarse, la
 * página se transforma en un listado agrupado por distrito igual de útil.
 */
(function (global) {
    'use strict';

    const { $, escapeHtml, escapeAttr, format, debounce, url, theme } = global.DS;
    const api = global.api;
    const store = global.store;
    const UI = global.UI;
    const toast = global.toast;

    /** Centro de Arequipa; el backend también lo devuelve, esto es el respaldo. */
    const FALLBACK_CENTER = (global.DiscoverySeed && global.DiscoverySeed.AREQUIPA_CENTER)
        || { lat: -16.4090, lng: -71.5375, zoom: 12 };

    // Por debajo de este zoom los marcadores individuales se sustituyen por uno
    // por distrito: con 18 distritos juntos el mapa se vuelve ilegible.
    const CLUSTER_ZOOM = 13;
    const LEAFLET_TIMEOUT = 6000;
    const SKELETON_COUNT = 6;
    const PREVIEW_LIMIT = 3;
    const SEARCH_DELAY = 220;

    const state = {
        filters: { q: '', district: '', category: '' },
        sellers: [],      // respuesta actual del servidor
        visible: [],      // tras aplicar la búsqueda por nombre en el cliente
        census: [],       // conjunto sin filtro de distrito, para los contadores
        districts: [],
        categories: [],
        center: { ...FALLBACK_CENTER },
        activeId: null,
        mapReady: false,
        loading: true,
        tileMode: 'auto', // 'auto' sigue el tema del sitio; 'light'/'dark' lo fijan
    };

    /** Instancias de marcador por id de vendedor, para enfocarlas desde la lista. */
    const markers = new Map();

    let map = null;
    let sellerLayer = null;
    let districtLayer = null;
    let requestId = 0;

    const dom = {};

    /* ======================================================================
       Utilidades
       ====================================================================== */

    /** Compara ignorando mayúsculas y tildes: «jose» encuentra «José». */
    function normalize(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    }

    function districtCoords(name) {
        const found = state.districts.find((d) => d.name === name);
        if (found && Number.isFinite(found.lat) && Number.isFinite(found.lng)) return found;
        if (global.DiscoverySeed) return global.DiscoverySeed.districtByName(name);
        return null;
    }

    /** Coordenadas de un vendedor, con el centro del distrito como respaldo. */
    function sellerCoords(seller) {
        const point = seller.location;
        if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
            return { lat: point.lat, lng: point.lng };
        }
        const district = districtCoords(seller.district);
        return district ? { lat: district.lat, lng: district.lng } : null;
    }

    function ratingLabel(rating) {
        const value = Number(rating);
        return Number.isFinite(value) && value > 0 ? value.toFixed(1) : '—';
    }

    /** Agrupa vendedores por distrito y ordena por cantidad descendente. */
    function groupByDistrict(sellers) {
        const groups = new Map();

        sellers.forEach((seller) => {
            const name = seller.district || 'Arequipa';
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(seller);
        });

        return Array.from(groups.entries())
            .map(([name, list]) => ({ name, sellers: list }))
            .sort((a, b) => b.sellers.length - a.sellers.length || a.name.localeCompare(b.name, 'es'));
    }

    /* ======================================================================
       Filtros y URL
       ====================================================================== */

    function readFiltersFromUrl() {
        state.filters.district = url.param('district', '') || '';
        state.filters.category = url.param('category', '') || '';
        state.filters.q = url.param('q', '') || '';
    }

    function syncUrl() {
        url.sync({
            district: state.filters.district,
            category: state.filters.category,
            q: state.filters.q,
        });
    }

    function hasActiveFilters() {
        return Boolean(state.filters.district || state.filters.category || state.filters.q);
    }

    /* ======================================================================
       Carga de datos
       ====================================================================== */

    async function loadReferenceData() {
        // Los dos catálogos son independientes: si uno falla, el otro sigue.
        const [districts, categories] = await Promise.all([
            api.getDistricts().catch(() => null),
            api.getCategories().catch(() => null),
        ]);

        if (districts) {
            state.districts = districts.districts || [];
            if (districts.center) state.center = districts.center;
        }
        if (categories) {
            state.categories = categories.categories || [];
        }
    }

    async function loadSellers() {
        const ticket = (requestId += 1);
        state.loading = true;
        renderList();

        const filters = {};
        if (state.filters.district) filters.district = state.filters.district;
        if (state.filters.category) filters.category = state.filters.category;

        try {
            const data = await api.getMapSellers(filters);

            // Una respuesta que llega tarde no debe pisar a una más reciente.
            if (ticket !== requestId) return;

            state.sellers = data.sellers || [];
            if (data.center) state.center = data.center;
            if (data.districts && data.districts.length) state.districts = data.districts;

            // Los contadores del selector deben reflejar todos los distritos,
            // así que con un distrito activo hace falta pedir el conjunto completo.
            if (state.filters.district) {
                const censusFilters = state.filters.category
                    ? { category: state.filters.category }
                    : {};
                const census = await api.getMapSellers(censusFilters).catch(() => null);
                if (ticket !== requestId) return;
                state.census = census ? (census.sellers || []) : state.sellers;
            } else {
                state.census = state.sellers;
            }

            state.loading = false;
            applySearch();
            renderDistrictOptions();
            renderAll();
        } catch (error) {
            if (ticket !== requestId) return;
            state.loading = false;
            state.sellers = [];
            state.census = [];
            state.visible = [];
            renderAll();
            toast.error(error.message || 'No se pudieron cargar los vendedores.');
        }
    }

    /** Búsqueda por nombre: se resuelve en el cliente para responder al instante. */
    function applySearch() {
        const needle = normalize(state.filters.q).trim();
        state.visible = needle
            ? state.sellers.filter((seller) => normalize(seller.username).includes(needle))
            : state.sellers.slice();
    }

    /* ======================================================================
       Pintado · cabecera y filtros
       ====================================================================== */

    function renderSummary() {
        if (state.loading) {
            dom.summary.textContent = 'Cargando el mapa de vendedores…';
            return;
        }

        const total = state.visible.length;

        if (!total) {
            dom.summary.textContent = hasActiveFilters()
                ? 'Ningún vendedor coincide con los filtros elegidos'
                : 'Todavía no hay vendedores con publicaciones activas';
            return;
        }

        const districts = new Set(state.visible.map((seller) => seller.district)).size;
        const sellerWord = format.plural(total, 'vendedor verificado', 'vendedores verificados');
        const districtWord = format.plural(districts, 'distrito', 'distritos');

        dom.summary.textContent =
            `${format.number(total)} ${sellerWord} en ${format.number(districts)} ${districtWord}`;
    }

    function renderDistrictOptions() {
        // Un contador por distrito calculado sobre el censo (sin filtro de distrito),
        // para que el selector diga la verdad aunque ya haya un distrito elegido.
        const counts = new Map();
        state.census.forEach((seller) => {
            counts.set(seller.district, (counts.get(seller.district) || 0) + 1);
        });

        const options = ['<option value="">Todos los distritos</option>'];

        state.districts.forEach((district) => {
            const count = counts.get(district.name) || 0;
            const selected = district.name === state.filters.district ? ' selected' : '';
            options.push(
                `<option value="${escapeAttr(district.name)}"${selected}>`
                + `${escapeHtml(district.name)} (${count})</option>`
            );
        });

        dom.districtFilter.innerHTML = options.join('');
    }

    function renderCategoryOptions() {
        const options = ['<option value="">Todas las categorías</option>'];

        state.categories.forEach((category) => {
            const selected = category.id === state.filters.category ? ' selected' : '';
            options.push(
                `<option value="${escapeAttr(category.id)}"${selected}>`
                + `${escapeHtml(category.icon || '')} ${escapeHtml(category.name)}</option>`
            );
        });

        dom.categoryFilter.innerHTML = options.join('');
    }

    /* ======================================================================
       Pintado · lista lateral
       ====================================================================== */

    function listSkeleton() {
        const row = `
        <div class="map-seller is-skeleton" aria-hidden="true">
            <span class="skeleton map-seller-avatar"></span>
            <span class="map-seller-body">
                <span class="skeleton skeleton-text w-70"></span>
                <span class="skeleton skeleton-text w-50"></span>
            </span>
        </div>`;
        return row.repeat(SKELETON_COUNT);
    }

    function sellerItem(seller) {
        const active = seller.id === state.activeId;
        const count = Number(seller.post_count) || 0;
        const postWord = format.plural(count, 'publicación', 'publicaciones');

        return `
        <button class="map-seller${active ? ' is-active' : ''}"
                type="button"
                data-seller-id="${escapeAttr(seller.id)}"
                aria-pressed="${active ? 'true' : 'false'}">
            <span class="avatar map-seller-avatar" aria-hidden="true">${escapeHtml(format.initials(seller.username))}</span>
            <span class="map-seller-body">
                <span class="map-seller-name">
                    <span class="truncate">${escapeHtml(seller.username)}</span>
                    ${UI.verifiedBadge(seller)}
                </span>
                <span class="map-seller-meta">
                    <span class="map-seller-district truncate">
                        ${UI.icons.pin} ${escapeHtml(seller.district || 'Arequipa')}
                    </span>
                    <span class="map-seller-rating">★ ${escapeHtml(ratingLabel(seller.rating))}</span>
                </span>
            </span>
            <span class="map-seller-count" aria-label="${count} ${postWord}">${count}</span>
        </button>`;
    }

    function renderList() {
        if (state.loading) {
            dom.list.innerHTML = listSkeleton();
            renderSummary();
            return;
        }

        if (!state.visible.length) {
            dom.list.innerHTML = UI.emptyState({
                icon: '🗺️',
                title: 'Sin vendedores aquí',
                message: hasActiveFilters()
                    ? 'Prueba con otro distrito o quita algún filtro para ver más vendedores.'
                    : 'Todavía no hay vendedores con publicaciones activas en Arequipa.',
            });
            renderSummary();
            return;
        }

        dom.list.innerHTML = state.visible.map(sellerItem).join('');
        renderSummary();
    }

    function highlightList() {
        const items = dom.list.querySelectorAll('[data-seller-id]');
        items.forEach((item) => {
            const active = item.dataset.sellerId === state.activeId;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    /** Acerca en la lista al vendedor elegido desde el mapa. */
    function revealInList(id) {
        // Se busca recorriendo, no con un selector: el id viene de datos y
        // construir el selector a mano obligaría a escaparlo.
        const items = dom.list.querySelectorAll('[data-seller-id]');
        for (let i = 0; i < items.length; i += 1) {
            if (items[i].dataset.sellerId === id) {
                if (typeof items[i].scrollIntoView === 'function') {
                    items[i].scrollIntoView({ block: 'nearest' });
                }
                return;
            }
        }
    }

    /* ======================================================================
       Pintado · globo del vendedor
       ====================================================================== */

    function previewItem(preview) {
        const href = `publicacion.html?id=${encodeURIComponent(preview.id)}`;

        return `
        <li class="map-preview">
            <a class="map-preview-link" href="${escapeAttr(href)}">
                <img class="map-preview-thumb"
                     src="${escapeAttr(preview.image_url || '')}"
                     alt=""
                     loading="lazy"
                     width="44" height="44">
                <span class="map-preview-body">
                    <span class="map-preview-title truncate">${escapeHtml(preview.title)}</span>
                    <span class="map-preview-price">${escapeHtml(format.money(preview.price))}</span>
                </span>
            </a>
        </li>`;
    }

    function popupHtml(seller) {
        const count = Number(seller.post_count) || 0;
        const postWord = format.plural(count, 'publicación', 'publicaciones');
        const previews = (seller.preview || []).slice(0, PREVIEW_LIMIT);
        const signedIn = Boolean(store.get('user'));
        const firstPost = previews.length ? previews[0].id : '';

        const messageLabel = signedIn ? 'Enviar mensaje' : 'Inicia sesión para escribir';
        const authorHref = `index.html?author_id=${encodeURIComponent(seller.id)}`;

        return `
        <div class="map-popup">
            <div class="map-popup-head">
                <span class="avatar avatar-sm" aria-hidden="true">${escapeHtml(format.initials(seller.username))}</span>
                <div class="map-popup-ident">
                    <p class="map-popup-name">
                        <span class="truncate">${escapeHtml(seller.username)}</span>
                        ${UI.verifiedBadge(seller)}
                    </p>
                    <p class="map-popup-meta">
                        ${escapeHtml(seller.district || 'Arequipa')}
                        · ★ ${escapeHtml(ratingLabel(seller.rating))}
                        · ${count} ${escapeHtml(postWord)}
                    </p>
                </div>
            </div>

            ${previews.length ? `<ul class="map-popup-previews">${previews.map(previewItem).join('')}</ul>` : ''}

            <div class="map-popup-actions">
                <a class="btn btn-primary btn-sm" href="${escapeAttr(authorHref)}">Ver todas sus publicaciones</a>
                <button class="btn btn-secondary btn-sm"
                        type="button"
                        data-map-action="message"
                        data-post-id="${escapeAttr(firstPost)}"
                        data-seller-name="${escapeAttr(seller.username)}">
                    ${escapeHtml(messageLabel)}
                </button>
            </div>
        </div>`;
    }

    /* ======================================================================
       Pintado · listado de respaldo (sin Leaflet)
       ====================================================================== */

    function fallbackSeller(seller) {
        const count = Number(seller.post_count) || 0;
        const postWord = format.plural(count, 'publicación', 'publicaciones');
        const href = `index.html?author_id=${encodeURIComponent(seller.id)}`;

        return `
        <li class="map-fallback-seller">
            <a class="map-fallback-link" href="${escapeAttr(href)}">
                <span class="avatar map-seller-avatar" aria-hidden="true">${escapeHtml(format.initials(seller.username))}</span>
                <span class="map-seller-body">
                    <span class="map-seller-name">
                        <span class="truncate">${escapeHtml(seller.username)}</span>
                        ${UI.verifiedBadge(seller)}
                    </span>
                    <span class="map-seller-meta">
                        <span class="map-seller-rating">★ ${escapeHtml(ratingLabel(seller.rating))}</span>
                        <span>${count} ${escapeHtml(postWord)}</span>
                    </span>
                </span>
            </a>
        </li>`;
    }

    function renderFallback() {
        if (state.mapReady) return;

        if (state.loading) {
            dom.fallback.innerHTML = `<div class="map-fallback-loading">${listSkeleton()}</div>`;
            return;
        }

        if (!state.visible.length) {
            dom.fallback.innerHTML = UI.emptyState({
                icon: '🗺️',
                title: 'Sin vendedores aquí',
                message: 'Cambia de distrito o de categoría para ver más vendedores.',
            });
            return;
        }

        const groups = groupByDistrict(state.visible);

        dom.fallback.innerHTML = groups.map((group) => `
            <section class="map-fallback-group">
                <h2 class="map-fallback-district">
                    ${UI.icons.pin} ${escapeHtml(group.name)}
                    <span class="map-fallback-count">${group.sellers.length}</span>
                </h2>
                <ul class="map-fallback-list">
                    ${group.sellers.map(fallbackSeller).join('')}
                </ul>
            </section>`).join('');
    }

    /* ======================================================================
       Mapa
       ====================================================================== */

    /** Espera a que el script diferido de Leaflet aparezca; nunca bloquea para siempre. */
    function waitForLeaflet() {
        return new Promise((resolve) => {
            if (typeof global.L !== 'undefined') {
                resolve(true);
                return;
            }

            const started = Date.now();
            const timer = setInterval(() => {
                if (typeof global.L !== 'undefined') {
                    clearInterval(timer);
                    resolve(true);
                } else if (Date.now() - started > LEAFLET_TIMEOUT) {
                    clearInterval(timer);
                    resolve(false);
                }
            }, 150);
        });
    }

    function sellerIcon(seller) {
        const count = Number(seller.post_count) || 0;
        const verified = seller.verified ? 'true' : 'false';

        return global.L.divIcon({
            className: 'map-marker-icon',
            html: `<span class="map-marker" data-verified="${verified}">${count}</span>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
            popupAnchor: [0, -18],
        });
    }

    function districtIcon(name, count) {
        return global.L.divIcon({
            className: 'map-marker-icon',
            html: `
                <span class="map-marker-cluster">
                    <span class="map-marker-cluster-count">${count}</span>
                    <span class="map-marker-cluster-name">${escapeHtml(name)}</span>
                </span>`,
            iconSize: [54, 54],
            iconAnchor: [27, 27],
        });
    }

    function buildMap() {
        const L = global.L;

        map = L.map(dom.canvas, {
            center: [state.center.lat, state.center.lng],
            zoom: state.center.zoom || FALLBACK_CENTER.zoom,
            zoomControl: true,
            scrollWheelZoom: true,
            attributionControl: true,
        });

        // Atribución obligatoria por la licencia de OpenStreetMap.
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            minZoom: 9,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        sellerLayer = L.layerGroup().addTo(map);
        districtLayer = L.layerGroup();

        map.on('zoomend', applyZoomLayer);

        map.on('popupopen', (event) => {
            bindPopupActions(event.popup);

            const id = event.popup && event.popup.options && event.popup.options.sellerId;
            if (!id) return;
            state.activeId = id;
            highlightList();
            highlightMarkers();
            revealInList(id);
        });

        map.on('popupclose', () => {
            state.activeId = null;
            highlightList();
            highlightMarkers();
        });

        state.mapReady = true;
        dom.page.classList.remove('is-fallback');
        dom.fallback.hidden = true;
        applyTiles();
    }

    function renderMarkers() {
        if (!state.mapReady) return;

        sellerLayer.clearLayers();
        districtLayer.clearLayers();
        markers.clear();

        const L = global.L;
        const points = [];

        state.visible.forEach((seller) => {
            const coords = sellerCoords(seller);
            if (!coords) return;

            const marker = L.marker([coords.lat, coords.lng], {
                icon: sellerIcon(seller),
                title: seller.username,
                alt: `Vendedor ${seller.username}`,
                riseOnHover: true,
                keyboard: true,
            });

            marker.bindPopup(() => popupHtml(seller), {
                className: 'map-popup-shell',
                minWidth: 250,
                maxWidth: 300,
                autoPanPadding: [24, 24],
                sellerId: seller.id,
            });

            markers.set(seller.id, marker);
            sellerLayer.addLayer(marker);
            points.push([coords.lat, coords.lng]);
        });

        // Un marcador por distrito para los zooms lejanos.
        groupByDistrict(state.visible).forEach((group) => {
            const center = districtCoords(group.name);
            if (!center) return;

            const marker = L.marker([center.lat, center.lng], {
                icon: districtIcon(group.name, group.sellers.length),
                title: `${group.name}: ${group.sellers.length} ${format.plural(group.sellers.length, 'vendedor', 'vendedores')}`,
                alt: `${group.sellers.length} vendedores en ${group.name}`,
                keyboard: true,
            });

            // Al pulsar el grupo se entra al detalle del distrito.
            marker.on('click', () => {
                map.flyTo([center.lat, center.lng], CLUSTER_ZOOM + 1, { duration: 0.6 });
            });

            districtLayer.addLayer(marker);
        });

        applyZoomLayer();
        fitToResults(points);
        highlightMarkers();
    }

    /** Alterna entre marcadores individuales y agrupados según el zoom. */
    function applyZoomLayer() {
        if (!state.mapReady) return;

        const clustered = map.getZoom() < CLUSTER_ZOOM;

        if (clustered) {
            if (map.hasLayer(sellerLayer)) map.removeLayer(sellerLayer);
            if (!map.hasLayer(districtLayer)) map.addLayer(districtLayer);
        } else {
            if (map.hasLayer(districtLayer)) map.removeLayer(districtLayer);
            if (!map.hasLayer(sellerLayer)) map.addLayer(sellerLayer);
        }

        dom.stage.classList.toggle('is-clustered', clustered);
        highlightMarkers();
    }

    function fitToResults(points) {
        if (!state.mapReady || !points.length) return;

        const bounds = global.L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [56, 56], maxZoom: 14, animate: false });
    }

    function highlightMarkers() {
        markers.forEach((marker, id) => {
            const element = marker.getElement();
            if (!element) return;
            const dot = element.querySelector('.map-marker');
            if (dot) dot.classList.toggle('is-active', id === state.activeId);
        });
    }

    function focusSeller(id) {
        state.activeId = id;
        highlightList();

        const marker = markers.get(id);
        if (!state.mapReady || !marker) return;

        const latlng = marker.getLatLng();
        const targetZoom = Math.max(map.getZoom(), CLUSTER_ZOOM + 1);

        // El globo se abre al terminar el vuelo: si no, Leaflet lo coloca a medio camino.
        map.once('moveend', () => {
            if (markers.get(id) === marker) marker.openPopup();
        });

        map.flyTo(latlng, targetZoom, { duration: 0.7 });
    }

    function centerOnArequipa() {
        if (!state.mapReady) return;
        map.closePopup();
        map.flyTo([state.center.lat, state.center.lng], state.center.zoom || FALLBACK_CENTER.zoom, {
            duration: 0.7,
        });
    }

    /* ======================================================================
       Tono de las teselas
       ====================================================================== */

    function resolveTiles() {
        if (state.tileMode === 'auto') return theme.get() === 'light' ? 'light' : 'dark';
        return state.tileMode;
    }

    /**
     * OpenStreetMap solo sirve teselas claras, así que el modo oscuro se
     * consigue invirtiendo la capa de teselas con un filtro CSS.
     */
    function applyTiles() {
        const dark = resolveTiles() === 'dark';

        dom.stage.classList.toggle('is-dark-tiles', dark);
        dom.tilesBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
        dom.tilesBtn.setAttribute(
            'aria-label',
            dark ? 'Cambiar el mapa a tonos claros' : 'Cambiar el mapa a tonos oscuros'
        );
    }

    /* ======================================================================
       Mensajería
       ====================================================================== */

    /**
     * Los globos se crean y destruyen constantemente, y Leaflet detiene algunos
     * eventos dentro de ellos: es más fiable enganchar el botón al abrirse que
     * confiar en la delegación desde la página.
     */
    function bindPopupActions(popup) {
        const node = popup && typeof popup.getElement === 'function' ? popup.getElement() : null;
        if (!node) return;

        const button = node.querySelector('[data-map-action="message"]');
        if (!button || button.dataset.bound === 'true') return;

        button.dataset.bound = 'true';
        button.addEventListener('click', () => messageSeller(button));
    }

    /** La sesión la resuelve `shell.js` en paralelo; si aún no llegó, se pregunta. */
    async function currentUser() {
        const cached = store.get('user');
        if (cached) return cached;

        const data = await api.getCurrentUser().catch(() => null);
        return data ? (data.user || data) : null;
    }

    async function messageSeller(button) {
        const postId = button.dataset.postId;
        const sellerName = button.dataset.sellerName || 'el vendedor';

        if (!(await currentUser())) {
            UI.requireLogin(`Inicia sesión para escribir a ${sellerName}.`);
            return;
        }

        if (!postId) {
            toast.info('Este vendedor todavía no tiene publicaciones sobre las que escribir.');
            return;
        }

        button.disabled = true;
        button.classList.add('is-loading');

        try {
            const data = await api.openConversation(postId);
            global.location.href = `mensajes.html?c=${encodeURIComponent(data.conversation.id)}`;
        } catch (error) {
            toast.error(error.message || 'No se pudo abrir la conversación.');
            button.disabled = false;
            button.classList.remove('is-loading');
        }
    }

    /* ======================================================================
       Panel deslizante (móvil)
       ====================================================================== */

    function setSheet(open) {
        dom.panel.classList.toggle('is-open', open);
        dom.sheetToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        dom.sheetHandle.setAttribute('aria-expanded', open ? 'true' : 'false');
        dom.sheetToggle.textContent = open ? 'Ver mapa' : 'Ver lista';
        dom.sheetLabel.textContent = open ? 'Ocultar la lista' : 'Ver lista de vendedores';

        // Sin esto el mapa queda cortado tras cambiar el espacio disponible.
        invalidateMapSize();
    }

    function toggleSheet() {
        setSheet(!dom.panel.classList.contains('is-open'));
    }

    function invalidateMapSize() {
        if (!state.mapReady) return;
        global.requestAnimationFrame(() => {
            global.setTimeout(() => map.invalidateSize(), 240);
        });
    }

    /* ======================================================================
       Pintado global
       ====================================================================== */

    function renderAll() {
        renderList();
        renderMarkers();
        renderFallback();
        dom.reset.hidden = !hasActiveFilters();
    }

    /* ======================================================================
       Eventos
       ====================================================================== */

    function onFilterChange() {
        state.activeId = null;
        syncUrl();
        loadSellers();
    }

    function bindEvents() {
        const search = debounce(() => {
            state.filters.q = dom.search.value.trim();
            state.activeId = null;
            syncUrl();
            applySearch();
            renderAll();
        }, SEARCH_DELAY);

        dom.search.addEventListener('input', search);

        dom.districtFilter.addEventListener('change', () => {
            state.filters.district = dom.districtFilter.value;
            onFilterChange();
        });

        dom.categoryFilter.addEventListener('change', () => {
            state.filters.category = dom.categoryFilter.value;
            onFilterChange();
        });

        dom.reset.addEventListener('click', () => {
            state.filters = { q: '', district: '', category: '' };
            dom.search.value = '';
            dom.categoryFilter.value = '';
            dom.districtFilter.value = '';
            onFilterChange();
        });

        // Delegación en la lista: su contenido se repinta con cada filtro.
        dom.list.addEventListener('click', (event) => {
            const item = event.target.closest('[data-seller-id]');
            if (!item) return;

            focusSeller(item.dataset.sellerId);

            // En móvil el panel tapa el mapa: se cierra para ver el marcador.
            if (global.matchMedia('(max-width: 900px)').matches) setSheet(false);
        });

        dom.centerBtn.addEventListener('click', centerOnArequipa);

        dom.tilesBtn.addEventListener('click', () => {
            // Al tocarlo, el usuario manda sobre el tema del sitio.
            state.tileMode = resolveTiles() === 'dark' ? 'light' : 'dark';
            applyTiles();
        });

        dom.sheetToggle.addEventListener('click', toggleSheet);
        dom.sheetHandle.addEventListener('click', toggleSheet);

        // El mapa solo sigue al tema mientras nadie haya forzado un tono.
        store.subscribe('theme', () => {
            if (state.tileMode === 'auto') applyTiles();
        }, false);

        global.addEventListener('resize', debounce(invalidateMapSize, 200));
    }

    /* ======================================================================
       Arranque
       ====================================================================== */

    function collectDom() {
        dom.page = $('#map-page');
        dom.summary = $('#map-summary');
        dom.notice = $('#map-notice');
        dom.panel = $('#map-panel');
        dom.list = $('#seller-list');
        dom.search = $('#seller-search');
        dom.districtFilter = $('#district-filter');
        dom.categoryFilter = $('#category-filter');
        dom.reset = $('#reset-filters');
        dom.stage = $('#map-stage');
        dom.canvas = $('#sellers-map');
        dom.fallback = $('#map-fallback');
        dom.centerBtn = $('#center-btn');
        dom.tilesBtn = $('#tiles-btn');
        dom.sheetToggle = $('#sheet-toggle');
        dom.sheetHandle = $('#sheet-handle');
        dom.sheetLabel = $('#sheet-handle-label');
    }

    /** Deja la página en modo listado cuando no hay mapa interactivo. */
    function enterFallbackMode() {
        state.mapReady = false;
        dom.page.classList.add('is-fallback');
        dom.notice.hidden = false;
        dom.fallback.hidden = false;
        dom.canvas.hidden = true;
        renderFallback();
    }

    async function init() {
        collectDom();
        if (!dom.page) return;

        readFiltersFromUrl();
        dom.search.value = state.filters.q;
        dom.list.innerHTML = listSkeleton();
        bindEvents();

        await api.ready();
        await loadReferenceData();

        renderDistrictOptions();
        renderCategoryOptions();

        // El mapa se monta antes de pedir vendedores para que los marcadores
        // aparezcan en el primer pintado y no en un segundo salto.
        const hasLeaflet = await waitForLeaflet();

        if (hasLeaflet) {
            try {
                buildMap();
            } catch (error) {
                enterFallbackMode();
            }
        } else {
            enterFallbackMode();
        }

        await loadSellers();
        invalidateMapSize();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
