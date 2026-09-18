/**
 * Gestión de Página de Login
 */

class LoginPage {
  constructor() {
    this.form = document.getElementById('login-form');
    this.emailInput = document.getElementById('email');
    this.passwordInput = document.getElementById('password');
    this.rememberInput = document.getElementById('remember-me');
    this.toggleBtn = document.getElementById('toggle-password');
    this.submitBtn = document.getElementById('submit-btn');
    this.formError = document.getElementById('form-error');
    this.devInfo = document.getElementById('dev-info');

    this.init();
  }

  init() {
    // Verificar si ya está autenticado
    if (AuthSystem.isAuthenticated()) {
      window.location.href = '/pages/profile.html';
      return;
    }

    // Event listeners
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.toggleBtn.addEventListener('click', () => this.togglePassword());

    // Ocultar info de desarrollo en producción
    if (!window.config.debug) {
      this.devInfo.style.display = 'none';
    }

    // Cargar email recordado
    this.loadRememberedEmail();

    // Validación en tiempo real
    this.emailInput.addEventListener('blur', () => this.validateEmail());
    this.passwordInput.addEventListener('blur', () => this.validatePassword());
  }

  /**
   * Cargar email recordado si existe
   */
  loadRememberedEmail() {
    const rememberedEmail = localStorage.getItem('remembered_email');
    if (rememberedEmail) {
      this.emailInput.value = rememberedEmail;
      this.rememberInput.checked = true;
    }
  }

  /**
   * Validar email
   */
  validateEmail() {
    const email = this.emailInput.value.trim();
    const errorEl = document.getElementById('email-error');

    if (!email) {
      errorEl.textContent = 'El email es requerido';
      return false;
    }

    if (!this.isValidEmail(email)) {
      errorEl.textContent = 'Email inválido';
      return false;
    }

    errorEl.textContent = '';
    return true;
  }

  /**
   * Validar contraseña
   */
  validatePassword() {
    const password = this.passwordInput.value;
    const errorEl = document.getElementById('password-error');

    if (!password) {
      errorEl.textContent = 'La contraseña es requerida';
      return false;
    }

    if (password.length < 6) {
      errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
      return false;
    }

    errorEl.textContent = '';
    return true;
  }

  /**
   * Manejar submit del formulario
   */
  async handleSubmit(e) {
    e.preventDefault();

    // Validar
    if (!this.validateEmail() || !this.validatePassword()) {
      return;
    }

    // Deshabilitar botón
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = '⏳ Iniciando sesión...';
    this.formError.textContent = '';

    // Realizar login
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    const rememberMe = this.rememberInput.checked;

    const result = await AuthSystem.login(email, password, rememberMe);

    if (result.success) {
      // Guardar email si "Recordarme" está activado
      if (rememberMe) {
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('remembered_email');
      }

      // Mostrar notificación
      AuthSystem.showNotification(
        `¡Bienvenido, ${result.user.username}!`,
        'success'
      );

      // Redirigir
      setTimeout(() => {
        window.location.href = '/pages/profile.html';
      }, 1500);
    } else {
      // Mostrar error
      this.formError.textContent = result.error || 'Error al iniciar sesión';
      AuthSystem.showNotification(result.error || 'Error al iniciar sesión', 'error');

      // Re-habilitar botón
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = 'Iniciar Sesión';
    }
  }

  /**
   * Toggle de visibilidad de contraseña
   */
  togglePassword() {
    const type = this.passwordInput.type === 'password' ? 'text' : 'password';
    this.passwordInput.type = type;
    this.toggleBtn.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
  }

  /**
   * Validar formato de email
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new LoginPage();
  AuthSystem.init();
});
