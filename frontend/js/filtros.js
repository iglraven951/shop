/**
 * Módulo de Filtros - Gestión del panel de filtros y su interacción
 * Maneja todos los filtros: categorías, precio, calificación, stock
 */

class FilterManager {
    constructor() {
        this.filters = {
            categories: [],
            minPrice: 0,
            maxPrice: Infinity,
            minRating: 0,
            inStock: false
        };

        this.init();
    }

    /**
     * Inicializa el gestor de filtros
     */
    init() {
        this.waitForProductManager();
        this.setupEventListeners();
    }

    /**
     * Espera a que ProductManager esté disponible
     */
    waitForProductManager() {
        if (!window.productManager) {
            setTimeout(() => this.waitForProductManager(), 100);
            return;
        }
        // ProductManager ya está disponible
    }

    /**
     * Configura los event listeners
     */
    setupEventListeners() {
        // Filtros de Categoría
        document.querySelectorAll('.filter-options input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.id !== 'in-stock') {
                checkbox.addEventListener('change', (e) => this.handleCategoryFilter(e.target));
            }
        });

        // Filtro "Todas las Categorías"
        const allCategoriesCheckbox = document.getElementById('cat-todas');
        if (allCategoriesCheckbox) {
            allCategoriesCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.desactivarTodosFiltros();
                }
            });
        }

        // Filtros de Precio
        document.getElementById('price-min').addEventListener('change', () => this.handlePriceFilter());
        document.getElementById('price-max').addEventListener('change', () => this.handlePriceFilter());

        // Filtros de Calificación
        document.querySelectorAll('input[name="rating"]').forEach(radio => {
            radio.addEventListener('change', () => this.handleRatingFilter());
        });

        // Filtro de Stock
        document.getElementById('in-stock').addEventListener('change', () => this.handleStockFilter());

        // Botón de Limpiar Filtros
        document.getElementById('clear-filters-btn').addEventListener('click', () => this.limpiarFiltros());
    }

    /**
     * Maneja los cambios en los filtros de categoría
     */
    handleCategoryFilter(checkbox) {
        // Si se selecciona "Todas las Categorías"
        if (checkbox.id === 'cat-todas') {
            if (checkbox.checked) {
                // Desactivar todas las otras categorías
                document.querySelectorAll('.filter-options input[type="checkbox"]').forEach(cb => {
                    if (cb.id !== 'cat-todas') {
                        cb.checked = false;
                    }
                });
                this.filters.categories = [];
            }
        } else {
            // Si se selecciona cualquier otra categoría
            const allCategoriesCheckbox = document.getElementById('cat-todas');
            if (allCategoriesCheckbox) {
                allCategoriesCheckbox.checked = false;
            }

            // Recopilar categorías seleccionadas
            this.filters.categories = Array.from(
                document.querySelectorAll('.filter-options input[type="checkbox"]:checked')
            )
            .filter(cb => cb.id !== 'cat-todas')
            .map(cb => cb.value);
        }

        this.aplicarFiltros();
    }

    /**
     * Desactiva todos los filtros excepto el seleccionado
     */
    desactivarTodosFiltros() {
        document.querySelectorAll('.filter-options input[type="checkbox"]').forEach(cb => {
            if (cb.id !== 'cat-todas') {
                cb.checked = false;
            }
        });
        this.filters.categories = [];
        this.aplicarFiltros();
    }

    /**
     * Maneja los cambios en el filtro de precio
     */
    handlePriceFilter() {
        const minInput = document.getElementById('price-min');
        const maxInput = document.getElementById('price-max');

        let minPrice = parseFloat(minInput.value) || 0;
        let maxPrice = parseFloat(maxInput.value) || Infinity;

        // Validación: min no puede ser mayor que max
        if (minPrice > maxPrice && maxPrice !== Infinity) {
            minInput.value = maxPrice;
            minPrice = maxPrice;
        }

        this.filters.minPrice = minPrice;
        this.filters.maxPrice = maxPrice;

        this.aplicarFiltros();
    }

    /**
     * Maneja los cambios en el filtro de calificación
     */
    handleRatingFilter() {
        const selectedRating = document.querySelector('input[name="rating"]:checked');
        this.filters.minRating = selectedRating ? parseFloat(selectedRating.value) : 0;
        this.aplicarFiltros();
    }

    /**
     * Maneja el filtro de stock
     */
    handleStockFilter() {
        const inStockCheckbox = document.getElementById('in-stock');
        this.filters.inStock = inStockCheckbox ? inStockCheckbox.checked : false;
        this.aplicarFiltros();
    }

    /**
     * Aplica los filtros actuales al ProductManager
     */
    aplicarFiltros() {
        if (!window.productManager) {
            console.warn('ProductManager no está disponible aún');
            return;
        }

        window.productManager.actualizarFiltros({
            categories: this.filters.categories,
            minPrice: this.filters.minPrice,
            maxPrice: this.filters.maxPrice,
            minRating: this.filters.minRating,
            inStock: this.filters.inStock
        });
    }

    /**
     * Limpia todos los filtros
     */
    limpiarFiltros() {
        // Resetear estado interno
        this.filters = {
            categories: [],
            minPrice: 0,
            maxPrice: Infinity,
            minRating: 0,
            inStock: false
        };

        // Resetear inputs
        document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        document.getElementById('cat-todas').checked = false;

        document.querySelectorAll('input[name="rating"]').forEach(radio => {
            radio.checked = false;
        });

        document.getElementById('price-min').value = '';
        document.getElementById('price-max').value = '';
        document.getElementById('in-stock').checked = false;

        // Notificar al ProductManager
        if (window.productManager) {
            window.productManager.resetFilters();
        }

        this.mostrarNotificacion('Filtros limpiados', 'info');
    }

    /**
     * Obtiene el estado actual de los filtros
     */
    obtenerEstadoFiltros() {
        return { ...this.filters };
    }

    /**
     * Muestra notificación
     */
    mostrarNotificacion(mensaje, tipo = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.innerHTML = `
            <span style="flex: 1;">${mensaje}</span>
            <button style="background: none; border: none; color: inherit; cursor: pointer; font-size: 1.2rem;">✕</button>
        `;

        container.appendChild(toast);

        const timer = setTimeout(() => {
            toast.remove();
        }, 3000);

        toast.querySelector('button').addEventListener('click', () => {
            clearTimeout(timer);
            toast.remove();
        });
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.filterManager = new FilterManager();
    });
} else {
    window.filterManager = new FilterManager();
}

export { FilterManager };
