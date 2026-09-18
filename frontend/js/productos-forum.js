/**
 * DiscoveryShop - Foro de Productos
 * Sistema simple y funcional de foro de productos
 */

class ForumProductManager {
    constructor() {
        this.productos = [];
        this.productosFiltrados = [];
        this.currentPage = 1;
        this.itemsPerPage = 5;
        this.selectedProduct = null;
        this.filters = {
            search: '',
            categories: [],
            minPrice: 0,
            maxPrice: Infinity,
            minRating: 0,
            sortBy: 'reciente'
        };

        this.init();
    }

    async init() {
        console.log('🚀 Inicializando ForumProductManager...');
        this.setupEventListeners();
        await this.cargarProductos();
        await this.cargarCategorias();
        console.log('✅ ForumProductManager inicializado');
    }

    setupEventListeners() {
        // Búsqueda
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }

        // Ordenamiento
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => this.handleSort(e.target.value));
        }

        // Paginación
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.addEventListener('click', () => this.previousPage());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextPage());

        // Limpiar filtros
        const clearBtn = document.getElementById('clear-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.limpiarFiltros());
        }

        // Cerrar panel detalle
        const closeBtn = document.getElementById('close-detail-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.cerrarPanel();
            });
        }

        // Radio buttons de rating
        document.querySelectorAll('input[name="rating"]').forEach(radio => {
            radio.addEventListener('change', () => this.filtrar());
        });

        // Price filters
        const priceMin = document.getElementById('price-min');
        const priceMax = document.getElementById('price-max');
        if (priceMin) {
            priceMin.addEventListener('input', () => this.filtrar());
        }
        if (priceMax) {
            priceMax.addEventListener('input', () => this.filtrar());
        }
    }

    async cargarProductos() {
        try {
            console.log('📦 Cargando productos...');
            const response = await fetch('http://localhost:5000/api/products');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('📦 Respuesta de API:', data);

            if (data.data && data.data.products && Array.isArray(data.data.products)) {
                this.productos = data.data.products;
                console.log(`✅ ${this.productos.length} productos cargados`);
                this.productosFiltrados = [...this.productos];
                this.currentPage = 1;
                this.mostrarProductos();
                this.actualizarContador();
            } else {
                console.error('❌ Formato de respuesta inválido:', data);
                this.mostrarError('Formato de datos inválido');
            }
        } catch (error) {
            console.error('❌ Error cargando productos:', error);
            this.mostrarError(`Error: ${error.message}`);
        }
    }

    async cargarCategorias() {
        try {
            console.log('📂 Cargando categorías...');
            const response = await fetch('http://localhost:5000/api/categories');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('📂 Categorías:', data);

            if (data.data && data.data.categories && Array.isArray(data.data.categories)) {
                const categoriesList = document.getElementById('categories-list');
                if (categoriesList) {
                    categoriesList.innerHTML = data.data.categories.map(cat => `
                        <label class="filter-option">
                            <input type="checkbox" value="${cat.name}" class="category-checkbox">
                            <span>${cat.icon} ${cat.name}</span>
                        </label>
                    `).join('');

                    // Agregar listeners
                    document.querySelectorAll('.category-checkbox').forEach(checkbox => {
                        checkbox.addEventListener('change', () => this.filtrar());
                    });
                    console.log(`✅ ${data.data.categories.length} categorías cargadas`);
                }
            }
        } catch (error) {
            console.error('❌ Error cargando categorías:', error);
        }
    }

    handleSearch(searchTerm) {
        this.filters.search = searchTerm.toLowerCase();
        this.filtrar();
    }

    handleSort(sortOption) {
        this.filters.sortBy = sortOption;
        this.aplicarOrdenamiento();
        this.mostrarProductos();
    }

    aplicarOrdenamiento() {
        const sort = this.filters.sortBy;

        if (sort === 'precio-asc') {
            this.productosFiltrados.sort((a, b) => a.price - b.price);
        } else if (sort === 'precio-desc') {
            this.productosFiltrados.sort((a, b) => b.price - a.price);
        } else if (sort === 'rating') {
            this.productosFiltrados.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        } else {
            this.productosFiltrados.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        }
    }

    filtrar() {
        // Obtener categorías seleccionadas
        const selectedCategories = Array.from(document.querySelectorAll('.category-checkbox:checked'))
            .map(cb => cb.value);

        // Obtener rating mínimo
        const minRating = document.querySelector('input[name="rating"]:checked')?.value || '0';

        this.filters.categories = selectedCategories;
        this.filters.minRating = parseFloat(minRating);
        this.filters.minPrice = parseFloat(document.getElementById('price-min')?.value || 0);
        this.filters.maxPrice = parseFloat(document.getElementById('price-max')?.value || Infinity);

        this.productosFiltrados = this.productos.filter(producto => {
            // Búsqueda
            if (this.filters.search &&
                !producto.title.toLowerCase().includes(this.filters.search) &&
                !producto.description.toLowerCase().includes(this.filters.search)) {
                return false;
            }

            // Categoría
            if (this.filters.categories.length > 0 &&
                !this.filters.categories.includes(producto.category)) {
                return false;
            }

            // Precio
            if (producto.price < this.filters.minPrice || producto.price > this.filters.maxPrice) {
                return false;
            }

            // Rating
            if (producto.rating < this.filters.minRating) {
                return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.aplicarOrdenamiento();
        this.mostrarProductos();
        this.actualizarContador();
    }

    mostrarProductos() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        const inicio = (this.currentPage - 1) * this.itemsPerPage;
        const fin = inicio + this.itemsPerPage;
        const productosPagina = this.productosFiltrados.slice(inicio, fin);

        if (productosPagina.length === 0) {
            this.mostrarVacio();
            return;
        }

        grid.innerHTML = productosPagina.map(p => `
            <div class="forum-post" data-product-id="${p.id}" role="listitem">
                <div class="post-header">
                    <img src="${p.image}" alt="${p.title}" class="post-image">
                    <div class="post-title-section">
                        <h3 class="post-title">${p.title}</h3>
                        <p class="post-price">S/ ${p.price.toFixed(2)}</p>
                    </div>
                    <div class="post-seller">
                        <strong>${p.seller.name}</strong>
                        <span class="rating">⭐ ${p.rating.toFixed(1)} (${p.reviews} reseñas)</span>
                    </div>
                </div>
                <div class="post-content">
                    <p>${p.description}</p>
                </div>
                <div class="post-footer">
                    <span class="category-tag">${p.category}</span>
                    <span class="messages-count">💬 ${p.messages}</span>
                    <span class="location">📍 ${p.location.city}</span>
                </div>
            </div>
        `).join('');

        // Agregar listeners a todos los posts
        document.querySelectorAll('.forum-post').forEach(post => {
            post.addEventListener('click', () => {
                const productId = parseInt(post.dataset.productId);
                this.mostrarDetalle(productId);
            });
        });

        this.actualizarPaginacion();
    }

    mostrarVacio() {
        const grid = document.getElementById('products-grid');
        const emptyState = document.getElementById('empty-state');
        if (grid) grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    }

    mostrarDetalle(productId) {
        const product = this.productos.find(p => p.id === productId);
        if (!product) return;

        this.selectedProduct = product;
        const panel = document.getElementById('product-detail-panel');
        const content = document.getElementById('panel-content');

        content.innerHTML = `
            <div class="detail-content">
                <img src="${product.image}" alt="${product.title}">

                <h2>${product.title}</h2>
                <p class="detail-price">S/ ${product.price.toFixed(2)}</p>

                <h4>Descripción</h4>
                <p>${product.description}</p>

                <h4>Stock</h4>
                <p>${product.stock} unidades disponibles</p>

                <h4>Información del Vendedor</h4>
                <div style="background: rgba(59, 130, 246, 0.08); padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(59, 130, 246, 0.15);">
                    <p style="font-weight: 600; margin-bottom: 8px;">${product.seller.name}</p>
                    <p style="font-size: 13px; margin: 6px 0;">⭐ ${product.seller.rating.toFixed(1)} • ${product.seller.total_sales} ventas</p>
                    <p style="font-size: 13px; margin: 6px 0; color: #a0a0a0;">📍 ${product.location.city}, ${product.location.country}</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn btn-primary" id="open-chat-btn" style="cursor: pointer;">
                        💬 Abrir Chat
                    </button>
                </div>
            </div>
        `;

        panel.style.display = 'block';

        // Agregar listener al botón Abrir Chat
        const chatBtn = document.getElementById('open-chat-btn');
        if (chatBtn) {
            chatBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`💬 Abriendo chat para producto ${product.id}`);
                window.location.href = `chat-vendedor.html?product=${product.id}`;
            });
        }
    }

    cerrarPanel() {
        const panel = document.getElementById('product-detail-panel');
        if (panel) panel.style.display = 'none';
    }

    actualizarPaginacion() {
        const totalPages = Math.ceil(this.productosFiltrados.length / this.itemsPerPage);
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const pageInfo = document.getElementById('page-info');
        const pagination = document.getElementById('pagination');

        if (pagination) {
            pagination.style.display = totalPages > 1 ? 'flex' : 'none';
        }

        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage === totalPages;
        if (pageInfo) pageInfo.textContent = `Página ${this.currentPage} de ${totalPages}`;
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.mostrarProductos();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.productosFiltrados.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.mostrarProductos();
        }
    }

    limpiarFiltros() {
        this.filters = {
            search: '',
            categories: [],
            minPrice: 0,
            maxPrice: Infinity,
            minRating: 0,
            sortBy: 'reciente'
        };

        document.getElementById('search-input').value = '';
        document.getElementById('price-min').value = '';
        document.getElementById('price-max').value = '';
        document.querySelectorAll('.category-checkbox').forEach(cb => cb.checked = false);
        document.querySelector('input[name="rating"][value="0"]').checked = true;

        this.productosFiltrados = [...this.productos];
        this.currentPage = 1;
        this.mostrarProductos();
        this.actualizarContador();
    }

    actualizarContador() {
        const counter = document.getElementById('result-count');
        if (counter) {
            counter.textContent = `${this.productosFiltrados.length} productos encontrados`;
        }
    }

    mostrarNotificacion(mensaje) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = mensaje;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    mostrarError(mensaje) {
        const grid = document.getElementById('products-grid');
        if (grid) {
            grid.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #ef4444;">
                    <p>❌ ${mensaje}</p>
                </div>
            `;
        }
    }
}

// Inicializar cuando DOM está listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🎯 DOM listo, creando ForumProductManager...');
        new ForumProductManager();
    });
} else {
    console.log('🎯 DOM ya cargado, creando ForumProductManager...');
    new ForumProductManager();
}
