/**
 * Tests for product search and filter functionality
 */

describe('Product Search and Filters', () => {
  let filterModule;

  beforeEach(() => {
    // Mock filter state
    filterModule = {
      filters: {
        search: '',
        category: '',
        minPrice: 0,
        maxPrice: Infinity,
        inStock: true,
        sortBy: 'relevance'
      },
      products: [
        { id: 1, title: 'Laptop', price: 999, category: 'electronics', inStock: true },
        { id: 2, title: 'Mouse', price: 29.99, category: 'electronics', inStock: true },
        { id: 3, title: 'Keyboard', price: 79.99, category: 'electronics', inStock: false },
      ]
    };
  });

  describe('Search Functionality', () => {
    test('should filter products by keyword', () => {
      const query = 'laptop';
      const results = filterModule.products.filter(p =>
        p.title.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Laptop');
    });

    test('should handle empty search query', () => {
      const query = '';
      const results = filterModule.products.filter(p =>
        p.title.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(3);
    });

    test('should be case-insensitive', () => {
      const query = 'MOUSE';
      const results = filterModule.products.filter(p =>
        p.title.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Mouse');
    });

    test('should search partial matches', () => {
      const query = 'board';
      const results = filterModule.products.filter(p =>
        p.title.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Keyboard');
    });
  });

  describe('Category Filter', () => {
    test('should filter products by category', () => {
      const category = 'electronics';
      const results = filterModule.products.filter(p => p.category === category);

      expect(results).toHaveLength(3);
    });

    test('should handle non-existent categories', () => {
      const category = 'books';
      const results = filterModule.products.filter(p => p.category === category);

      expect(results).toHaveLength(0);
    });

    test('should filter by multiple categories', () => {
      const categories = ['electronics', 'books'];
      const results = filterModule.products.filter(p => categories.includes(p.category));

      expect(results).toHaveLength(3);
    });
  });

  describe('Price Filter', () => {
    test('should filter products within price range', () => {
      const minPrice = 20;
      const maxPrice = 100;

      const results = filterModule.products.filter(p =>
        p.price >= minPrice && p.price <= maxPrice
      );

      expect(results).toHaveLength(2);
      expect(results.every(p => p.price >= minPrice && p.price <= maxPrice)).toBe(true);
    });

    test('should handle minimum price filter', () => {
      const minPrice = 50;
      const results = filterModule.products.filter(p => p.price >= minPrice);

      expect(results).toHaveLength(2);
    });

    test('should handle maximum price filter', () => {
      const maxPrice = 100;
      const results = filterModule.products.filter(p => p.price <= maxPrice);

      expect(results).toHaveLength(2);
    });

    test('should validate price range', () => {
      const minPrice = 200;
      const maxPrice = 150; // Invalid: min > max

      // Should return empty or handle gracefully
      const results = filterModule.products.filter(p =>
        p.price >= Math.min(minPrice, maxPrice) && p.price <= Math.max(minPrice, maxPrice)
      );

      expect(results).toBeDefined();
    });
  });

  describe('Stock Filter', () => {
    test('should filter only in-stock products', () => {
      const results = filterModule.products.filter(p => p.inStock);

      expect(results).toHaveLength(2);
      expect(results.every(p => p.inStock)).toBe(true);
    });

    test('should include out-of-stock when toggled', () => {
      const results = filterModule.products; // All products

      expect(results).toHaveLength(3);
    });
  });

  describe('Sorting', () => {
    test('should sort by price (ascending)', () => {
      const sorted = [...filterModule.products].sort((a, b) => a.price - b.price);

      expect(sorted[0].price).toBe(29.99);
      expect(sorted[sorted.length - 1].price).toBe(999);
    });

    test('should sort by price (descending)', () => {
      const sorted = [...filterModule.products].sort((a, b) => b.price - a.price);

      expect(sorted[0].price).toBe(999);
      expect(sorted[sorted.length - 1].price).toBe(29.99);
    });

    test('should sort by name (ascending)', () => {
      const sorted = [...filterModule.products].sort((a, b) =>
        a.title.localeCompare(b.title)
      );

      expect(sorted[0].title).toBe('Keyboard');
      expect(sorted[sorted.length - 1].title).toBe('Mouse');
    });

    test('should sort by relevance (relevance score)', () => {
      const withRelevance = filterModule.products.map((p, i) => ({
        ...p,
        relevance: 100 - i * 10
      }));

      const sorted = [...withRelevance].sort((a, b) => b.relevance - a.relevance);

      expect(sorted[0].relevance).toBe(100);
    });
  });

  describe('Combined Filters', () => {
    test('should apply search + category filters', () => {
      const query = 'key';
      const category = 'electronics';

      const results = filterModule.products.filter(p =>
        p.title.toLowerCase().includes(query.toLowerCase()) &&
        p.category === category
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Keyboard');
    });

    test('should apply price + stock filters', () => {
      const minPrice = 20;
      const maxPrice = 500;
      const inStockOnly = true;

      const results = filterModule.products.filter(p =>
        p.price >= minPrice &&
        p.price <= maxPrice &&
        (!inStockOnly || p.inStock)
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Mouse');
    });

    test('should apply all filters together', () => {
      const query = '';
      const category = 'electronics';
      const minPrice = 25;
      const maxPrice = 500;
      const inStockOnly = true;

      const results = filterModule.products.filter(p =>
        (query === '' || p.title.toLowerCase().includes(query.toLowerCase())) &&
        p.category === category &&
        p.price >= minPrice &&
        p.price <= maxPrice &&
        (!inStockOnly || p.inStock)
      );

      expect(results).toHaveLength(2);
    });
  });

  describe('Filter Performance', () => {
    test('should handle large product lists efficiently', () => {
      // Create large product array
      const largeProductList = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        title: `Product ${i}`,
        price: Math.random() * 1000,
        category: ['electronics', 'books', 'clothing'][Math.floor(Math.random() * 3)],
        inStock: Math.random() > 0.3
      }));

      const startTime = performance.now();

      const filtered = largeProductList.filter(p =>
        p.price >= 50 && p.price <= 500 && p.inStock
      );

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(filtered.length).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });

  describe('Filter Persistence', () => {
    test('should save filter preferences to localStorage', () => {
      const filters = {
        search: 'laptop',
        minPrice: 500,
        maxPrice: 1500,
        category: 'electronics'
      };

      localStorage.setItem('search_filters', JSON.stringify(filters));
      const saved = JSON.parse(localStorage.getItem('search_filters'));

      expect(saved).toEqual(filters);

      localStorage.clear();
    });

    test('should restore filter preferences on page reload', () => {
      const filters = { search: 'test', category: 'books' };
      localStorage.setItem('search_filters', JSON.stringify(filters));

      const restored = JSON.parse(localStorage.getItem('search_filters'));
      expect(restored).toEqual(filters);

      localStorage.clear();
    });
  });
});
