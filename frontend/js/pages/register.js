/**
 * Gestión de Página de Registro
 */

class RegisterPage {
  constructor() {
    this.form = document.getElementById('register-form');
    this.fullNameInput = document.getElementById('full-name');
    this.emailInput = document.getElementById('email');
    this.usernameInput = document.getElementById('username');
    this.passwordInput = document.getElementById('password');
    this.passwordConfirmInput = document.getElementById('password-confirm');
    this.termsInput = document.getElementById('terms');
    this.togglePassBtns = document.querySelectorAll('.toggle-password-btn');
    this.submitBtn = document.getElementById('submit-btn');
    this.formError = document.getElementById('form-error');
    this.strengthBar = document.getElementById('strength-bar');

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
    this.togglePassBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.togglePassword(e));
    });

    // Validación en tiempo real
    this.fullNameInput.addEventListener('blur', () => this.validateFullName());
    this.emailInput.addEventListener('blur', () => this.validateEmail());
    this.usernameInput.addEventListener('blur', () => this.validateUsername());
    this.passwordInput.addEventListener('input', () => this.updatePasswordStrength());
    this.passwordInput.addEventListener('blur', () => this.validatePassword());
    this.passwordConfirmInput.addEventListener('blur', () => this.validatePasswordConfirm());
    this.termsInput.addEventListener('change', () => this.validateTerms());
  }

  /**
   * Validar nombre completo
   */
  validateFullName() {
    const fullName = this.fullNameInput.value.trim();
    const errorEl = document.getElementById('full-name-error');

    if (!fullName) {
      errorEl.textContent = 'El nombre completo es requerido';
      return false;
    }

    if (fullName.length < 3) {
      errorEl.textContent = 'El nombre debe tener al menos 3 caracteres';
      return false;
    }

    if (!this.isValidName(fullName)) {
      errorEl.textContent = 'El nombre contiene caracteres inválidos';
      return false;
    }

    errorEl.textContent = '';
    return true;
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
   * Validar username
   */
  validateUsername() {
    const username = this.usernameInput.value.trim();
    const errorEl = document.getElementById('username-error');

    if (!username) {
      errorEl.textContent = 'El nombre de usuario es requerido';
      return false;
    }

    if (username.length < 3 || username.length > 20) {
      errorEl.textContent = 'El nombre debe tener entre 3 y 20 caracteres';
      return false;
    }

    if (!this.isValidUsername(username)) {
      errorEl.textContent = 'Solo letras, números y guiones permitidos';
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

    const requirements = this.checkPasswordRequirements(password);
    if (!requirements.isValid) {
      const missingReqs = [];
      if (!requirements.hasLength) missingReqs.push('mínimo 8 caracteres');
      if (!requirements.hasUppercase) missingReqs.push('una mayúscula');
      if (!requirements.hasNumber) missingReqs.push('un número');
      if (!requirements.hasSpecial) missingReqs.push('un carácter especial');

      errorEl.textContent = `Falta: ${missingReqs.join(', ')}`;
      return false;
    }

    errorEl.textContent = '';
    return true;
  }

  /**
   * Validar confirmación de contraseña
   */
  validatePasswordConfirm() {
    const password = this.passwordInput.value;
    const passwordConfirm = this.passwordConfirmInput.value;
    const errorEl = document.getElementById('password-confirm-error');

    if (!passwordConfirm) {
      errorEl.textContent = 'Debes confirmar la contraseña';
      return false;
    }

    if (password !== passwordConfirm) {
      errorEl.textContent = 'Las contraseñas no coinciden';
      return false;
    }

    errorEl.textContent = '';
    return true;
  }

  /**
   * Validar términos y condiciones
   */
  validateTerms() {
    const errorEl = document.getElementById('terms-error');

    if (!this.termsInput.checked) {
      errorEl.textContent = 'Debes aceptar los términos y condiciones';
      return false;
    }

    errorEl.textContent = '';
    return true;
  }

  /**
   * Actualizar fuerza de contraseña
   */
  updatePasswordStrength() {
    const password = this.passwordInput.value;
    const requirements = this.checkPasswordRequirements(password);

    let strength = 0;
    if (requirements.hasLength) strength++;
    if (requirements.hasUppercase) strength++;
    if (requirements.hasNumber) strength++;
    if (requirements.hasSpecial) strength++;

    const strengthLabel = ['Muy débil', 'Débil', 'Media', 'Fuerte', 'Muy fuerte'][strength];
    const strengthPercent = (strength / 4) * 100;
    const strengthColor = ['#ff4444', '#ff8844', '#ffcc44', '#88dd44', '#44dd44'][strength];

    this.strengthBar.style.width = strengthPercent + '%';
    this.strengthBar.style.backgroundColor = strengthColor;
    this.strengthBar.textContent = strengthLabel;
  }

  /**
   * Manejar submit del formulario
   */
  async handleSubmit(e) {
    e.preventDefault();

    // Validar todos los campos
    const isFullNameValid = this.validateFullName();
    const isEmailValid = this.validateEmail();
    const isUsernameValid = this.validateUsername();
    const isPasswordValid = this.validatePassword();
    const isPasswordConfirmValid = this.validatePasswordConfirm();
    const isTermsValid = this.validateTerms();

    if (!isFullNameValid || !isEmailValid || !isUsernameValid ||
        !isPasswordValid || !isPasswordConfirmValid || !isTermsValid) {
      return;
    }

    // Deshabilitar botón
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = '⏳ Creando cuenta...';
    this.formError.textContent = '';

    // Realizar registro
    const data = {
      fullName: this.fullNameInput.value.trim(),
      email: this.emailInput.value.trim(),
      username: this.usernameInput.value.trim(),
      password: this.passwordInput.value
    };

    const result = await AuthSystem.register(data);

    if (result.success) {
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
      this.formError.textContent = result.error || 'Error al crear cuenta';
      AuthSystem.showNotification(result.error || 'Error al crear cuenta', 'error');

      // Re-habilitar botón
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = 'Crear Cuenta';
    }
  }

  /**
   * Toggle de visibilidad de contraseña
   */
  togglePassword(e) {
    e.preventDefault();
    const btn = e.target;
    const passwordInput = btn.previousElementSibling;

    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      btn.textContent = '👁️‍🗨️';
    } else {
      passwordInput.type = 'password';
      btn.textContent = '👁️';
    }
  }

  /**
   * Verificar requisitos de contraseña
   */
  checkPasswordRequirements(password) {
    return {
      hasLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      isValid: password.length >= 8 &&
               /[A-Z]/.test(password) &&
               /[0-9]/.test(password) &&
               /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
  }

  /**
   * Validar formato de email
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validar nombre
   */
  isValidName(name) {
    const nameRegex = /^[a-záéíóúüñ\s'-]+$/i;
    return nameRegex.test(name);
  }

  /**
   * Validar username
   */
  isValidUsername(username) {
    const usernameRegex = /^[a-z0-9_-]+$/i;
    return usernameRegex.test(username);
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new RegisterPage();
  AuthSystem.init();
});
