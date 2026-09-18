/**
 * DiscoveryShop Frontend Configuration
 *
 * Detecta automáticamente la URL correcta (local o ngrok)
 * para conectarse al backend
 */

class Config {
  /**
   * Obtiene la URL base de la API según el entorno
   * @returns {string} URL base de la API
   */
  static getApiBaseUrl() {
    // En navegador, usar window.location para determinar el host
    const hostname = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;

    // Si estamos en localhost, usar localhost:5000
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }

    // Si es ngrok, seguir usando localhost:5000 via ngrok
    // porque ngrok actúa como proxy a localhost:5000
    if (hostname && hostname.includes('ngrok')) {
      // ngrok redirige transparentemente a localhost:5000
      return 'http://localhost:5000';
    }

    // Para otros hosts, usar el mismo protocolo y host
    if (hostname && hostname !== '') {
      return `${protocol}//${hostname}${port ? ':' + port : ''}`;
    }

    // Fallback a localhost
    return 'http://localhost:5000';
  }

  /**
   * Obtiene la URL completa de un endpoint
   * @param {string} endpoint - Ruta del endpoint (ej: /api/products)
   * @returns {string} URL completa
   */
  static getEndpointUrl(endpoint) {
    const baseUrl = this.getApiBaseUrl();
    return `${baseUrl}${endpoint}`;
  }

  /**
   * SECURITY: Makes an authenticated request with httpOnly cookies
   * @param {string} endpoint - Ruta del endpoint
   * @param {object} options - Opciones de fetch (method, body, headers, etc.)
   * @returns {Promise<any>} Respuesta del servidor
   */
  static async fetch(endpoint, options = {}) {
    const url = this.getEndpointUrl(endpoint);

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      // SECURITY: Include httpOnly cookies in every request
      credentials: 'include',
    });

    // Manejo de errores
    if (!response.ok) {
      if (response.status === 401) {
        // Token expirado o inválido - clear session and redirect
        this.clearAuthToken();
        // Remove user session data
        if (typeof SecureStorage !== 'undefined') {
          SecureStorage.clearUserSession();
        }
        window.location.href = '/login';
      }
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    // Intentar parsear como JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return response;
  }

  /**
   * SECURITY: Auth tokens are now handled via httpOnly cookies
   * This method is deprecated and returns null
   * Tokens are automatically sent with credentials: 'include'
   * @deprecated Use httpOnly cookies instead
   * @returns {null}
   */
  static getAuthToken() {
    // Auth tokens should ONLY be in httpOnly cookies, never in localStorage
    console.warn('⚠️  getAuthToken() is deprecated. Tokens use httpOnly cookies.');
    return null;
  }

  /**
   * SECURITY: Auth tokens are now handled via httpOnly cookies
   * This method is a no-op for backward compatibility
   * @deprecated Use httpOnly cookies instead
   * @param {string} token - Token JWT (ignored)
   */
  static setAuthToken(token) {
    console.warn('⚠️  setAuthToken() is deprecated. Use httpOnly cookies instead.');
    // Do not store tokens in any client-side storage
  }

  /**
   * SECURITY: Clears user session data
   * httpOnly cookies are cleared server-side on logout
   */
  static clearAuthToken() {
    // Clear user session data from sessionStorage
    if (typeof SecureStorage !== 'undefined') {
      SecureStorage.clearUserSession();
    }
  }

  /**
   * SECURITY: User data is now stored in sessionStorage (cleared on page close)
   * Use this for non-sensitive user information only (name, role, id)
   * @returns {object|null} Datos del usuario o null
   */
  static getUser() {
    // First try sessionStorage (preferred)
    if (typeof SecureStorage !== 'undefined') {
      const user = SecureStorage.getCurrentUser();
      if (user) return user;
    }

    // Fallback for backward compatibility
    try {
      const user = sessionStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch (e) {
      console.error('Failed to parse user from sessionStorage:', e);
      return null;
    }
  }

  /**
   * SECURITY: Guarda los datos del usuario en sessionStorage
   * Only stores non-sensitive data (name, role, id)
   * NEVER store passwords, tokens, or sensitive data
   * @param {object} user - Datos del usuario (sin tokens ni contraseñas)
   */
  static setUser(user) {
    if (user) {
      // Validate that no sensitive data is being stored
      if (user.password || user.token || user.access_token || user.api_key) {
        throw new Error('Cannot store sensitive auth data with user object');
      }

      if (typeof SecureStorage !== 'undefined') {
        SecureStorage.setCurrentUser(user);
      } else {
        // Fallback for backward compatibility
        sessionStorage.setItem('user', JSON.stringify(user));
      }
    }
  }

  /**
   * Verifica si el usuario está autenticado
   * @returns {boolean}
   */
  static isAuthenticated() {
    return !!this.getAuthToken();
  }

  /**
   * Obtiene información sobre el entorno
   * @returns {object} Información del entorno
   */
  static getEnvironmentInfo() {
    return {
      apiBaseUrl: this.getApiBaseUrl(),
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      isLocalhost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
      isNgrok: window.location.hostname.includes('ngrok'),
      isAuthenticated: this.isAuthenticated(),
      user: this.getUser(),
    };
  }

  /**
   * Muestra información de debug en consola
   */
  static logEnvironmentInfo() {
    const info = this.getEnvironmentInfo();
    console.log('🚀 DiscoveryShop Configuration:', info);
  }
}

/**
 * API Endpoints configuration
 */
const ApiEndpoints = {
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    logout: '/api/auth/logout',
    refresh: '/api/auth/refresh',
    verify: '/api/auth/verify'
  },
  products: {
    list: '/api/products',
    search: '/api/products/search',
    recommendations: '/api/products/recommendations',
    detail: (id) => `/api/products/${id}`,
    create: '/api/products',
    update: (id) => `/api/products/${id}`,
    delete: (id) => `/api/products/${id}`
  },
  cart: {
    get: '/api/cart',
    add: '/api/cart/items',
    remove: (id) => `/api/cart/items/${id}`,
    clear: '/api/cart/clear'
  },
  orders: {
    checkout: '/api/orders/checkout',
    list: '/api/orders',
    detail: (id) => `/api/orders/${id}`,
    updateStatus: (id) => `/api/orders/${id}/status`,
    cancel: (id) => `/api/orders/${id}/cancel`,
    review: (id) => `/api/orders/${id}/review`
  },
  chat: {
    conversations: '/api/chat/conversations',
    messages: (conversationId) => `/api/chat/conversations/${conversationId}/messages`,
    send: (conversationId) => `/api/chat/conversations/${conversationId}/messages`
  },
  users: {
    profile: '/api/users/me',
    update: '/api/users/me',
    sellers: '/api/users/sellers',
    seller: (id) => `/api/users/sellers/${id}`
  },
  chatbot: {
    send: '/api/chatbot/send',
    conversation: (id) => `/api/chatbot/conversations/${id}`
  }
};

/**
 * UI Configuration
 */
const UiConfig = {
  toast: {
    duration: 3000,
    position: 'bottom-right'
  },
  modal: {
    animationDuration: 300,
    backdropDismiss: true
  },
  debounce: {
    delay: 300
  },
  pagination: {
    defaultPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100]
  }
};

/**
 * Validation rules
 */
const ValidationRules = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  username: /^[a-zA-Z0-9_-]{3,20}$/,
  password: {
    minLength: 8,
    requiresUppercase: true,
    requiresLowercase: true,
    requiresNumbers: true
  },
  phone: /^[+\d\s\-()]{10,}$/
};

/**
 * Error messages
 */
const ErrorMessages = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  UNAUTHORIZED: 'You are not authorized.',
  NOT_FOUND: 'Resource not found.',
  VALIDATION_ERROR: 'Please check your input.',
  TIMEOUT: 'Request timeout.'
};

/**
 * Success messages
 */
const SuccessMessages = {
  LOGIN: 'Logged in successfully!',
  LOGOUT: 'Logged out successfully!',
  REGISTER: 'Account created successfully!',
  PRODUCT_CREATED: 'Product created successfully!',
  PRODUCT_UPDATED: 'Product updated successfully!',
  ORDER_CREATED: 'Order created successfully!'
};

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Config;
}

// Exportar como ES modules
export { Config, ApiEndpoints, UiConfig, ValidationRules, ErrorMessages, SuccessMessages };
