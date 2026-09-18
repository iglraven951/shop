/**
 * Sistema de Autenticación DiscoveryShop
 * Simple y funcional
 */

const AuthSystem = {
  config: {
    tokenKey: 'authToken',
    userKey: 'user',
    apiUrl: 'http://localhost:5000/api'
  },

  init() {
    console.log('🔐 Inicializando AuthSystem...');
    this.setupFormListeners();
    this.setupUserButton();
    this.checkSession();
  },

  setupFormListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
      console.log('✓ Login form vinculado');
    }

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => this.handleRegister(e));
      console.log('✓ Register form vinculado');
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    console.log('🔓 Procesando login...');

    const email = document.getElementById('email')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();

    if (!email || !password) {
      this.showError('Por favor completa todos los campos');
      return;
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Error parseando JSON:', e);
        throw new Error('Respuesta inválida del servidor');
      }
      console.log('Respuesta login:', data);

      if (!response.ok) {
        const errorMsg = data.error || data.message || data.detail || 'Error al iniciar sesión';
        throw new Error(errorMsg);
      }

      if (data.data?.access_token) {
        localStorage.setItem(this.config.tokenKey, data.data.access_token);
        if (data.data?.user) {
          localStorage.setItem(this.config.userKey, JSON.stringify(data.data.user));
        }
        this.showSuccess('✅ ¡Sesión iniciada!');
        setTimeout(() => { window.location.href = '/index.html'; }, 1000);
      }
    } catch (error) {
      console.error('❌ Error login:', error);
      this.showError(error.message || 'Error al iniciar sesión');
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    console.log('📝 Procesando registro...');

    const firstName = document.getElementById('firstname')?.value?.trim();
    const lastName = document.getElementById('lastname')?.value?.trim();
    const email = document.getElementById('email')?.value?.trim();
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();
    const confirmPassword = document.getElementById('confirm-password')?.value?.trim();

    if (!firstName || !lastName || !email || !username || !password) {
      this.showError('Por favor completa todos los campos requeridos');
      return;
    }

    if (password !== confirmPassword) {
      this.showError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 8) {
      this.showError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    // Validar requisitos de contraseña
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);

    if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      this.showError('Contraseña debe tener: mayúscula, minúscula, número y carácter especial (!@#$)');
      return;
    }

    const fullName = `${firstName} ${lastName}`;

    try {
      console.log('Enviando:', { email, username, full_name: fullName, password });

      const response = await fetch(`${this.config.apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          username,
          full_name: fullName,
          password
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Error parseando JSON:', e);
        throw new Error('Respuesta inválida del servidor');
      }
      console.log('Respuesta registro:', data);

      if (!response.ok) {
        const errorMsg = data.error || data.message || data.detail || 'Error al registrarse';
        throw new Error(errorMsg);
      }

      if (data.data?.access_token) {
        localStorage.setItem(this.config.tokenKey, data.data.access_token);
        if (data.data?.user) {
          localStorage.setItem(this.config.userKey, JSON.stringify(data.data.user));
        }
        this.showSuccess('✅ ¡Cuenta creada!');
        setTimeout(() => { window.location.href = '/index.html'; }, 1000);
      }
    } catch (error) {
      console.error('❌ Error registro:', error);
      this.showError(error.message || 'Error al registrarse');
    }
  },

  setupUserButton() {
    const userBtn = document.getElementById('user-btn');
    if (userBtn) {
      userBtn.addEventListener('click', () => {
        if (!this.getToken()) {
          window.location.href = '/login.html';
        }
      });
    }
  },

  checkSession() {
    const token = this.getToken();
    const user = this.getUser();
    if (token && user) {
      console.log('✓ Sesión activa:', user.username);
    }
  },

  getToken() {
    return localStorage.getItem(this.config.tokenKey);
  },

  getUser() {
    const userStr = localStorage.getItem(this.config.userKey);
    return userStr ? JSON.parse(userStr) : null;
  },

  logout() {
    localStorage.removeItem(this.config.tokenKey);
    localStorage.removeItem(this.config.userKey);
    window.location.href = '/login.html';
  },

  showError(message) {
    this.showNotification(message, 'error');
  },

  showSuccess(message) {
    this.showNotification(message, 'success');
  },

  showNotification(message, type) {
    const notification = document.createElement('div');
    const colors = {
      error: { bg: '#1f2937', border: '#ef4444', text: '#fecaca' },
      success: { bg: '#1f2937', border: '#10b981', text: '#d1fae5' }
    };
    const color = colors[type] || colors.error;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      background: ${color.bg};
      border: 2px solid ${color.border};
      color: ${color.text};
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 9999;
      animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `<div>${message}</div>`;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 4000);
  }
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { AuthSystem.init(); });
} else {
  AuthSystem.init();
}
