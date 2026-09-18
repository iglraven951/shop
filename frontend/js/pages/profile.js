/**
 * Gestión de Página de Perfil
 */

class ProfilePage {
  constructor() {
    this.user = null;
    this.currentTab = 'perfil';
    this.init();
  }

  async init() {
    // Verificar autenticación
    if (!AuthSystem.isAuthenticated()) {
      window.location.href = '/pages/login.html';
      return;
    }

    // Obtener usuario actual
    this.user = AuthSystem.getUser();
    if (!this.user) {
      // Intentar obtener del servidor
      this.user = await AuthSystem.getCurrentUser();
      if (!this.user) {
        window.location.href = '/pages/login.html';
        return;
      }
    }

    // Cargar UI
    this.loadUI();
    this.setupEventListeners();
    this.setupTabNavigation();
    AuthSystem.updateUI(this.user);
  }

  /**
   * Cargar interfaz con datos del usuario
   */
  loadUI() {
    // Avatar
    const initial = this.user.full_name.charAt(0).toUpperCase();
    document.getElementById('profile-avatar').textContent = initial;

    // Información en sidebar
    document.getElementById('profile-username').textContent = this.user.username;

    const roleText = this.user.is_seller ? '🎯 Vendedor' : '🛒 Comprador';
    document.getElementById('profile-role').textContent = roleText;

    // Información personal
    document.getElementById('info-full-name').textContent = this.user.full_name;
    document.getElementById('info-username').textContent = this.user.username;
    document.getElementById('info-email').textContent = this.user.email;

    const createdDate = new Date(this.user.created_at).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    document.getElementById('info-created').textContent = createdDate;

    const userType = this.user.is_seller ? '👤 Comprador + 🎯 Vendedor' : '🛒 Comprador';
    document.getElementById('info-type').textContent = userType;

    // Mostrar opciones de vendedor si no es vendedor
    if (!this.user.is_seller) {
      document.getElementById('seller-actions').style.display = 'block';
    } else {
      // Mostrar tabs de vendedor
      document.getElementById('tab-productos').style.display = 'block';
      document.getElementById('tab-vendedor').style.display = 'block';
      this.loadVendorProducts();
    }

    // Cargar compras
    this.loadPurchases();
  }

  /**
   * Cargar historial de compras
   */
  async loadPurchases() {
    const container = document.getElementById('purchases-container');
    container.innerHTML = '<div class="loading">⏳ Cargando compras...</div>';

    try {
      const purchases = await AuthSystem.getPurchaseHistory();

      if (purchases.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <p>📭 No hay compras aún</p>
            <a href="/" class="btn btn-primary">Ir a comprar</a>
          </div>
        `;
        return;
      }

      container.innerHTML = purchases.map(order => `
        <div class="purchase-card">
          <div class="purchase-header">
            <h3>Pedido #${order.id.substring(0, 8)}</h3>
            <span class="badge badge-${this.getStatusColor(order.status)}">${order.status}</span>
          </div>
          <div class="purchase-details">
            <p><strong>Fecha:</strong> ${new Date(order.created_at).toLocaleDateString('es-ES')}</p>
            <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
            <p><strong>Items:</strong> ${order.items ? order.items.length : 0}</p>
          </div>
        </div>
      `).join('');
    } catch (error) {
      container.innerHTML = `<div class="error">Error al cargar compras: ${error.message}</div>`;
    }
  }

  /**
   * Cargar productos del vendedor
   */
  async loadVendorProducts() {
    const container = document.getElementById('vendor-products-container');
    container.innerHTML = '<div class="loading">⏳ Cargando productos...</div>';

    try {
      const products = await AuthSystem.getVendorProducts();

      if (products.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <p>📦 No hay productos aún</p>
            <a href="/#" class="btn btn-primary">Agregar primer producto</a>
          </div>
        `;
        return;
      }

      container.innerHTML = products.map(product => `
        <div class="product-card">
          <div class="product-image">
            ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}">` : '📦'}
          </div>
          <div class="product-info">
            <h3>${product.name}</h3>
            <p class="price" data-price="${product.price}">S/ ${product.price.toFixed(2)}</p>
            <p class="status">${product.status}</p>
          </div>
          <div class="product-actions">
            <button class="btn btn-small btn-secondary">Editar</button>
            <button class="btn btn-small btn-danger">Eliminar</button>
          </div>
        </div>
      `).join('');
    } catch (error) {
      container.innerHTML = `<div class="error">Error al cargar productos: ${error.message}</div>`;
    }
  }

  /**
   * Configurar navegación de tabs
   */
  setupTabNavigation() {
    const navButtons = document.querySelectorAll('.profile-nav .nav-item');
    const tabs = document.querySelectorAll('.profile-tab');

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;

        // Manejar tab especial de productos (tab-productos vs tab-productos-content)
        let targetTabId = `tab-${tabName}`;
        if (tabName === 'productos') {
          targetTabId = 'tab-productos-content';
        } else if (tabName === 'vendedor') {
          targetTabId = 'tab-vendedor-content';
        }

        // Remover clase activa de todos
        navButtons.forEach(b => b.classList.remove('active'));
        tabs.forEach(t => t.classList.remove('active'));

        // Añadir clase activa al seleccionado
        btn.classList.add('active');
        const targetTab = document.getElementById(targetTabId);
        if (targetTab) {
          targetTab.classList.add('active');
        }

        this.currentTab = tabName;
      });
    });
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Editar perfil
    document.getElementById('edit-profile-btn').addEventListener('click', () => {
      this.showEditProfileModal();
    });

    // Convertirse en vendedor
    const becomeVendorBtn = document.getElementById('become-vendor-btn');
    if (becomeVendorBtn) {
      becomeVendorBtn.addEventListener('click', () => this.becomeVendor());
    }

    // Cambiar contraseña
    document.getElementById('change-password-btn').addEventListener('click', () => {
      this.showChangePasswordModal();
    });

    // Modales
    document.getElementById('close-modal-btn').addEventListener('click', () => {
      document.getElementById('edit-profile-modal').style.display = 'none';
    });

    document.getElementById('cancel-btn').addEventListener('click', () => {
      document.getElementById('edit-profile-modal').style.display = 'none';
    });

    document.getElementById('close-password-modal').addEventListener('click', () => {
      document.getElementById('change-password-modal').style.display = 'none';
    });

    document.getElementById('cancel-password-btn').addEventListener('click', () => {
      document.getElementById('change-password-modal').style.display = 'none';
    });

    // Formulario de edición
    document.getElementById('edit-profile-form').addEventListener('submit', (e) => {
      this.handleEditProfile(e);
    });

    // Formulario de cambio de contraseña
    document.getElementById('change-password-form').addEventListener('submit', (e) => {
      this.handleChangePassword(e);
    });

    // Otros botones
    document.getElementById('download-data-btn').addEventListener('click', () => {
      this.downloadData();
    });

    document.getElementById('delete-account-btn').addEventListener('click', () => {
      this.deleteAccount();
    });
  }

  /**
   * Mostrar modal de edición de perfil
   */
  showEditProfileModal() {
    const modal = document.getElementById('edit-profile-modal');
    document.getElementById('edit-full-name').value = this.user.full_name;
    document.getElementById('edit-email').value = this.user.email;
    modal.style.display = 'block';
  }

  /**
   * Manejar edición de perfil
   */
  async handleEditProfile(e) {
    e.preventDefault();

    const fullName = document.getElementById('edit-full-name').value.trim();
    const email = document.getElementById('edit-email').value.trim();

    if (!fullName || !email) {
      AuthSystem.showNotification('Todos los campos son requeridos', 'error');
      return;
    }

    // TODO: Implementar endpoint en backend
    AuthSystem.showNotification('Función en desarrollo', 'info');
  }

  /**
   * Mostrar modal de cambio de contraseña
   */
  showChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    modal.style.display = 'block';
    document.getElementById('change-password-form').reset();
  }

  /**
   * Manejar cambio de contraseña
   */
  async handleChangePassword(e) {
    e.preventDefault();

    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const newPasswordConfirm = document.getElementById('new-password-confirm').value;

    if (!oldPassword || !newPassword || !newPasswordConfirm) {
      AuthSystem.showNotification('Todos los campos son requeridos', 'error');
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      document.getElementById('new-password-confirm-error').textContent = 'Las contraseñas no coinciden';
      return;
    }

    const result = await AuthSystem.changePassword(oldPassword, newPassword);

    if (result.success) {
      AuthSystem.showNotification('Contraseña actualizada exitosamente', 'success');
      document.getElementById('change-password-modal').style.display = 'none';
      document.getElementById('change-password-form').reset();
    } else {
      AuthSystem.showNotification(result.error || 'Error al cambiar contraseña', 'error');
    }
  }

  /**
   * Convertirse en vendedor
   */
  async becomeVendor() {
    if (!confirm('¿Estás seguro de que quieres convertirte en vendedor?')) {
      return;
    }

    const result = await AuthSystem.becomeVendor();

    if (result.success) {
      this.user = AuthSystem.getUser();
      AuthSystem.showNotification('¡Ahora eres vendedor!', 'success');
      location.reload();
    } else {
      AuthSystem.showNotification(result.error || 'Error al convertirse en vendedor', 'error');
    }
  }

  /**
   * Descargar datos personales
   */
  downloadData() {
    const dataStr = JSON.stringify(this.user, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mi_datos_${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    AuthSystem.showNotification('Datos descargados', 'success');
  }

  /**
   * Eliminar cuenta (con confirmación)
   */
  deleteAccount() {
    if (!confirm('⚠️ ¿Estás completamente seguro? Esta acción es irreversible.')) {
      return;
    }

    if (!confirm('Esta acción eliminará permanentemente tu cuenta y todos tus datos.')) {
      return;
    }

    // TODO: Implementar endpoint en backend
    AuthSystem.showNotification('Función en desarrollo', 'info');
  }

  /**
   * Obtener color de estado de compra
   */
  getStatusColor(status) {
    const colors = {
      'pending': 'warning',
      'confirmed': 'info',
      'shipped': 'primary',
      'delivered': 'success',
      'cancelled': 'danger'
    };
    return colors[status] || 'secondary';
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new ProfilePage();
  AuthSystem.init();
});
