/**
 * Filters Module - Product filtering and search
 * Manages category, price, location, and sorting filters
 */

class FilterManager {
    /**
     * Initialize filter manager
     */
    constructor() {
        this.filters = {
            search: '',
            category: null,
            minPrice: 0,
            maxPrice: null,
            location: null,
            sellerId: null,
            rating: null,
            sortBy: 'recent',
            page: 1,
            limit: 20
        };

        this.listeners = new Set();
        this.availableCategories = [];
        this.availableLocations = [];
    }

    /**
     * Set search query
     * @param {string} query - Search query
     */
    setSearch(query) {
        this.filters.search = query.trim();
        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Get current search query
     * @returns {string}
     */
    getSearch() {
        return this.filters.search;
    }

    /**
     * Set category filter
     * @param {string|null} category - Category ID or null to clear
     */
    setCategory(category) {
        this.filters.category = category;
        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Get current category
     * @returns {string|null}
     */
    getCategory() {
        return this.filters.category;
    }

    /**
     * Set price range filter
     * @param {number} min - Minimum price
     * @param {number} max - Maximum price
     */
    setPriceRange(min, max) {
        this.filters.minPrice = Math.max(0, min);
        this.filters.maxPrice = max > 0 ? max : null;
        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Get price range
     * @returns {Object} { min, max }
     */
    getPriceRange() {
        return {
            min: this.filters.minPrice,
            max: this.filters.maxPrice
        };
    }

    /**
     * Set location filter
     * @param {string|null} location - Location or null to clear
     */
    setLocation(location) {
        this.filters.location = location;
        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Get current location
     * @returns {string|null}
     */
    getLocation() {
        return this.filters.location;
    }

    /**
     * Set seller filter
     * @param {number|null} sellerId - Seller ID or null to clear
     */
    setSeller(sellerId) {
        this.filters.sellerId = sellerId;
        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Get current seller filter
     * @returns {number|null}
     */
    getSeller() {
        return this.filters.sellerId;
    }

    /**
     * Set minimum rating filter
     * @param {number|null} rating - Minimum rating (1-5) or null
     */
    setMinRating(rating) {
        if (rating && (rating < 1 || rating > 5)) {
            console.warn('Rating must be between 1 and 5');
            return;
        }
        this.filters.rating = rating;
        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Get minimum rating filter
     * @returns {number|null}
     */
    getMinRating() {
        return this.filters.rating;
    }

    /**
     * Set sort order
     * @param {string} sortBy - Sort field ('recent', 'price-asc', 'price-desc', 'rating', 'popular')
     */
    setSortBy(sortBy) {
        const validSorts = ['recent', 'price-asc', 'price-desc', 'rating', 'popular'];
        if (!validSorts.includes(sortBy)) {
            console.warn(`Invalid sort: ${sortBy}. Valid options: ${validSorts.join(', ')}`);
            return;
        }
        this.filters.sortBy = sortBy;
        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Get current sort
     * @returns {string}
     */
    getSortBy() {
        return this.filters.sortBy;
    }

    /**
     * Set pagination page
     * @param {number} page - Page number (1-indexed)
     */
    setPage(page) {
        this.filters.page = Math.max(1, page);
        this.notifyListeners();
    }

    /**
     * Get current page
     * @returns {number}
     */
    getPage() {
        return this.filters.page;
    }

    /**
     * Set items per page
     * @param {number} limit - Number of items per page
     */
    setLimit(limit) {
        this.filters.limit = Math.min(100, Math.max(1, limit));
        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Get current limit
     * @returns {number}
     */
    getLimit() {
        return this.filters.limit;
    }

    /**
     * Get all active filters as query object
     * @returns {Object} Query parameters
     */
    getActiveFilters() {
        const active = {};

        if (this.filters.search) {
            active.search = this.filters.search;
        }
        if (this.filters.category) {
            active.category = this.filters.category;
        }
        if (this.filters.minPrice > 0) {
            active.min_price = this.filters.minPrice;
        }
        if (this.filters.maxPrice) {
            active.max_price = this.filters.maxPrice;
        }
        if (this.filters.location) {
            active.location = this.filters.location;
        }
        if (this.filters.sellerId) {
            active.seller_id = this.filters.sellerId;
        }
        if (this.filters.rating) {
            active.min_rating = this.filters.rating;
        }

        // Always include pagination
        active.page = this.filters.page;
        active.limit = this.filters.limit;

        // Always include sort
        active.sort = this.filters.sortBy;

        return active;
    }

    /**
     * Get number of active filters (excluding pagination/sort)
     * @returns {number}
     */
    getActiveFilterCount() {
        const filters = this.getActiveFilters();
        return Object.keys(filters).length - 2; // Exclude page and limit
    }

    /**
     * Check if any filter is active
     * @returns {boolean}
     */
    hasActiveFilters() {
        return this.getActiveFilterCount() > 0;
    }

    /**
     * Clear all filters and reset to defaults
     */
    clearAll() {
        this.filters = {
            search: '',
            category: null,
            minPrice: 0,
            maxPrice: null,
            location: null,
            sellerId: null,
            rating: null,
            sortBy: 'recent',
            page: 1,
            limit: 20
        };
        this.notifyListeners();
    }

    /**
     * Clear specific filter by name
     * @param {string} filterName - Filter name to clear
     */
    clearFilter(filterName) {
        const validFilters = ['search', 'category', 'minPrice', 'maxPrice', 'location', 'sellerId', 'rating'];

        if (!validFilters.includes(filterName)) {
            console.warn(`Unknown filter: ${filterName}`);
            return;
        }

        if (filterName === 'minPrice') {
            this.filters.minPrice = 0;
        } else if (filterName === 'maxPrice') {
            this.filters.maxPrice = null;
        } else {
            this.filters[filterName] = null;
        }

        this.filters.page = 1;
        this.notifyListeners();
    }

    /**
     * Set multiple filters at once
     * @param {Object} filterObject - Filters to set
     */
    setMultiple(filterObject) {
        Object.entries(filterObject).forEach(([key, value]) => {
            const methodName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;

            if (typeof this[methodName] === 'function') {
                this[methodName](value);
            } else {
                console.warn(`No setter for filter: ${key}`);
            }
        });
    }

    /**
     * Get all filters as object
     * @returns {Object}
     */
    getAllFilters() {
        return { ...this.filters };
    }

    /**
     * Set available categories
     * @param {Array} categories - List of available categories
     */
    setAvailableCategories(categories) {
        this.availableCategories = categories;
    }

    /**
     * Get available categories
     * @returns {Array}
     */
    getAvailableCategories() {
        return this.availableCategories;
    }

    /**
     * Set available locations
     * @param {Array} locations - List of available locations
     */
    setAvailableLocations(locations) {
        this.availableLocations = locations;
    }

    /**
     * Get available locations
     * @returns {Array}
     */
    getAvailableLocations() {
        return this.availableLocations;
    }

    /**
     * Subscribe to filter changes
     * @param {Function} callback - Function to call on filter change
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);

        return () => {
            this.listeners.delete(callback);
        };
    }

    /**
     * Notify all listeners of filter change
     * @private
     */
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback({
                    filters: this.getAllFilters(),
                    activeFilters: this.getActiveFilters(),
                    activeCount: this.getActiveFilterCount()
                });
            } catch (error) {
                console.error('Error in filter listener:', error);
            }
        });
    }

    /**
     * Export filters as URL query string
     * @returns {string} Query string
     */
    toQueryString() {
        const params = new URLSearchParams(this.getActiveFilters());
        return params.toString();
    }

    /**
     * Load filters from URL query string
     * @param {string} queryString - URL query string
     */
    fromQueryString(queryString) {
        const params = new URLSearchParams(queryString);

        if (params.has('search')) {
            this.setSearch(params.get('search'));
        }
        if (params.has('category')) {
            this.setCategory(params.get('category'));
        }
        if (params.has('min_price') || params.has('max_price')) {
            this.setPriceRange(
                parseInt(params.get('min_price') || 0),
                parseInt(params.get('max_price') || 0)
            );
        }
        if (params.has('location')) {
            this.setLocation(params.get('location'));
        }
        if (params.has('seller_id')) {
            this.setSeller(parseInt(params.get('seller_id')));
        }
        if (params.has('min_rating')) {
            this.setMinRating(parseInt(params.get('min_rating')));
        }
        if (params.has('sort')) {
            this.setSortBy(params.get('sort'));
        }
        if (params.has('page')) {
            this.setPage(parseInt(params.get('page')));
        }
        if (params.has('limit')) {
            this.setLimit(parseInt(params.get('limit')));
        }
    }
}

// Create singleton instance and export
const filterManager = new FilterManager();
export default filterManager;
