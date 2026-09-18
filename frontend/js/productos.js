/**
 * Módulo de Productos - Gestión de carga y visualización de productos
 * Maneja la obtención de datos de la API y la renderización en el DOM
 */

class ProductManager {
    constructor() {
        this.productos = [];
        this.productosFiltrados = [];
        this.currentPage = 1;
        this.itemsPerPage = 12;
        this.filters = {
            search: '',
            categories: [],
            minPrice: 0,
            maxPrice: Infinity,
            minRating: 0,
            inStock: false,
            sortBy: 'relevancia'
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.cargarProductos();
    }

    /**
     * Configura los escuchadores de eventos
     */
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

        // Botón de agregar al carrito (delegado)
        const productsGrid = document.getElementById('products-grid');
        if (productsGrid) {
            productsGrid.addEventListener('click', (e) => {
                if (e.target.closest('.btn-add-cart')) {
                    const productId = e.target.closest('.btn-add-cart').dataset.productId;
                    this.agregarAlCarrito(productId);
                }
            });
        }

        // Botón de limpiar filtros
        const clearBtn = document.getElementById('clear-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.limpiarFiltros());
        }
    }

    /**
     * Carga los productos desde la API
     */
    async cargarProductos() {
        try {
            const response = await fetch('http://localhost:5000/api/products');
            const data = await response.json();

            if (data.success && data.data.products) {
                this.productos = data.data.products;
                this.productosFiltrados = [...this.productos];
                this.mostrarProductos();
                this.actualizarContador();
            } else {
                console.error('Error en respuesta de API:', data);
                this.mostrarError('No se pudieron cargar los productos');
            }
        } catch (error) {
            console.error('Error al cargar productos:', error);
            this.mostrarError('Error de conexión al servidor');
        }
    }

    /**
     * Maneja la búsqueda de productos
     */
    handleSearch(searchTerm) {
        this.filters.search = searchTerm.toLowerCase();
        this.filtrar();
    }

    /**
     * Maneja el ordenamiento
     */
    handleSort(sortOption) {
        this.filters.sortBy = sortOption;
        this.aplicarOrdenamiento();
        this.mostrarProductos();
    }

    /**
     * Aplica el ordenamiento a los productos filtrados
     */
    aplicarOrdenamiento() {
        const sort = this.filters.sortBy;

        if (sort === 'precio-asc') {
            this.productosFiltrados.sort((a, b) => a.price - b.price);
        } else if (sort === 'precio-desc') {
            this.productosFiltrados.sort((a, b) => b.price - a.price);
        } else if (sort === 'nuevos') {
            this.productosFiltrados.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        } else if (sort === 'populares') {
            this.productosFiltrados.sort((a, b) => (b.sold_count || 0) - (a.sold_count || 0));
        } else if (sort === 'mejor-calificados') {
            this.productosFiltrados.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        }
    }

    /**
     * Filtra los productos según los criterios
     */
    filtrar() {
        this.productosFiltrados = this.productos.filter(producto => {
            // Búsqueda
            const searchTerm = this.filters.search;
            if (searchTerm && !producto.title.toLowerCase().includes(searchTerm) &&
                !producto.description.toLowerCase().includes(searchTerm)) {
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

            // Stock
            if (this.filters.inStock && producto.stock === 0) {
                return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.aplicarOrdenamiento();
        this.mostrarProductos();
        this.actualizarContador();
    }

    /**
     * Muestra los productos en el DOM
     */
    mostrarProductos() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        // Paginación
        const inicio = (this.currentPage - 1) * this.itemsPerPage;
        const fin = inicio + this.itemsPerPage;
        const productosPagina = this.productosFiltrados.slice(inicio, fin);

        if (productosPagina.length === 0) {
            this.mostrarVacio();
            return;
        }

        grid.innerHTML = productosPagina.map(p => `
            <div class="product-card" data-product-id="${p.id}">
                <div class="product-image">
                    <img src="${p.image || 'https://via.placeholder.com/300x300?text=Sin+imagen'}" alt="${p.title}">
                    ${p.stock === 0 ? '<div class="sold-out">AGOTADO</div>' : ''}
                </div>
                <div class="product-info">
                    <h3 class="product-title">${p.title}</h3>
                    <p class="product-description">${p.description.substring(0, 80)}...</p>
                    <div class="product-rating">
                        <span class="stars">${'⭐'.repeat(Math.floor(p.rating || 0))} ${p.rating || 0}</span>
                        <span class="reviews">(${p.reviews || 0} reseñas)</span>
                    </div>
                    <div class="product-price">
                        <span class="current-price">S/ ${p.price.toFixed(2)}</span>
                    </div>
                    <div class="product-actions">
                        <button class="btn btn-primary btn-add-cart" data-product-id="${p.id}">
                            🛒 Agregar al Carrito
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Actualizar paginación
        this.actualizarPaginacion();
    }

    /**
     * Muestra estado vacío
     */
    mostrarVacio() {
        const grid = document.getElementById('products-grid');
        const emptyState = document.getElementById('empty-state');
        if (grid) grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
    }

    /**
     * Actualiza los botones de paginación
     */
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

    /**
     * Va a la página anterior
     */
    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.mostrarProductos();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /**
     * Va a la página siguiente
     */
    nextPage() {
        const totalPages = Math.ceil(this.productosFiltrados.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.mostrarProductos();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /**
     * Limpia los filtros
     */
    limpiarFiltros() {
        this.filters = {
            search: '',
            categories: [],
            minPrice: 0,
            maxPrice: Infinity,
            minRating: 0,
            inStock: false,
            sortBy: 'relevancia'
        };

        // Limpiar inputs
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';

        this.productosFiltrados = [...this.productos];
        this.currentPage = 1;
        this.mostrarProductos();
        this.actualizarContador();
    }

    /**
     * Actualiza el contador de resultados
     */
    actualizarContador() {
        const counter = document.getElementById('result-count');
        if (counter) {
            counter.textContent = `${this.productosFiltrados.length} productos encontrados`;
        }
    }

    /**
     * Agrega un producto al carrito
     */
    agregarAlCarrito(productId) {
        const producto = this.productos.find(p => p.id == productId);
        if (!producto) return;

        // Mostrar notificación
        this.mostrarNotificacion(`✅ ${producto.title} agregado al carrito`);

        // Guardar en localStorage para después
        const carrito = JSON.parse(localStorage.getItem('carrito') || '[]');
        const itemExistente = carrito.find(item => item.id == productId);

        if (itemExistente) {
            itemExistente.quantity++;
        } else {
            carrito.push({ ...producto, quantity: 1 });
        }

        localStorage.setItem('carrito', JSON.stringify(carrito));

        // Actualizar badge del carrito
        const badge = document.querySelector('.cart-badge');
        if (badge) {
            const total = carrito.reduce((sum, item) => sum + item.quantity, 0);
            badge.textContent = total;
            badge.style.display = 'block';
        }
    }

    /**
     * Muestra notificación toast
     */
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

    /**
     * Muestra error
     */
    mostrarError(mensaje) {
        const grid = document.getElementById('products-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="error-message" style="grid-column: 1/-1; padding: 40px; text-align: center;">
                    <p style="color: #ef4444; font-size: 18px;">❌ ${mensaje}</p>
                    <button class="btn btn-primary" onclick="location.reload()">Reintentar</button>
                </div>
            `;
        }
    }
}

// Inicializar cuando el DOM está listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ProductManager();
    });
} else {
    new ProductManager();
}

// Exportar para módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductManager;
}
