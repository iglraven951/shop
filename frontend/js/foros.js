/**
 * DiscoveryShop - Foros JavaScript
 * Sistema de foros con votación, temas y respuestas
 * Totalmente en español
 */

import { Config, ApiEndpoints } from './config.js';

class ForosApp {
    constructor() {
        this.selectedProductId = null;
        this.selectedTemaId = null;
        this.currentFilter = 'recientes';
        this.productos = [];
        this.temas = [];
        this.respuestas = [];
        this.usuario = Config.getUser();

        this.initializeEventListeners();
        this.loadProductos();
    }

    // ===== INICIALIZACIÓN =====
    initializeEventListeners() {
        // Botones principales
        document.getElementById('back-btn').addEventListener('click', () => {
            window.history.back();
        });

        document.getElementById('user-btn').addEventListener('click', () => {
            this.handleUserButton();
        });

        // Filtros
        document.querySelectorAll('.filter-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.loadTemas();
            });
        });

        // Búsqueda
        document.getElementById('search-input').addEventListener('debounce', () => {
            this.searchTemas();
        });

        // Crear tema
        document.getElementById('crear-tema-btn').addEventListener('click', () => {
            this.showModalCrearTema();
        });

        // Modal crear tema
        document.getElementById('form-crear-tema').addEventListener('submit', (e) => {
            e.preventDefault();
            this.crearTema();
        });

        document.getElementById('modal-close-crear').addEventListener('click', () => {
            this.closeModal('modal-crear-tema');
        });

        document.getElementById('form-cancel').addEventListener('click', () => {
            this.closeModal('modal-crear-tema');
        });

        // Contadores de caracteres
        document.getElementById('tema-titulo-input').addEventListener('input', (e) => {
            document.getElementById('contador-titulo').textContent = `${e.target.value.length}/200`;
        });

        document.getElementById('tema-contenido-input').addEventListener('input', (e) => {
            document.getElementById('contador-contenido').textContent = `${e.target.value.length}/2000`;
        });

        // Close panel
        document.getElementById('panel-close-btn').addEventListener('click', () => {
            this.closeTemaDetail();
        });

        // Acciones del tema
        document.getElementById('btn-util').addEventListener('click', () => {
            this.votarTema('util');
        });

        document.getElementById('btn-no-util').addEventListener('click', () => {
            this.votarTema('no-util');
        });

        document.getElementById('btn-responder').addEventListener('click', () => {
            this.toggleRespuestaForm();
        });

        // Form respuesta
        document.getElementById('btn-enviar-respuesta').addEventListener('click', () => {
            this.enviarRespuesta();
        });

        document.getElementById('btn-cancelar-respuesta').addEventListener('click', () => {
            this.closeRespuestaForm();
        });
    }

    // ===== CARGAR PRODUCTOS =====
    async loadProductos() {
        try {
            const response = await Config.fetch('/api/productos');
            this.productos = response.data || [];
            this.renderProductos();

            if (this.productos.length > 0) {
                this.selectProducto(this.productos[0].id);
            }
        } catch (error) {
            console.error('Error cargando productos:', error);
            this.showToast('Error al cargar productos', 'error');
        }
    }

    renderProductos() {
        const list = document.getElementById('productos-list');
        list.innerHTML = '';

        this.productos.forEach(producto => {
            const item = document.createElement('div');
            item.className = 'producto-item';
            item.innerHTML = `
                <div class="producto-item-name">${producto.nombre}</div>
                <div class="producto-item-stats">
                    <span>💬 ${producto.temas_count || 0}</span>
                    <span>💭 ${producto.respuestas_count || 0}</span>
                </div>
            `;
            item.addEventListener('click', () => this.selectProducto(producto.id));
            list.appendChild(item);
        });
    }

    selectProducto(productId) {
        this.selectedProductId = productId;
        this.selectedTemaId = null;

        // Actualizar UI
        document.querySelectorAll('.producto-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget?.classList.add('active');

        const producto = this.productos.find(p => p.id === productId);
        if (producto) {
            document.getElementById('badge-nombre').textContent = producto.nombre;
            document.getElementById('foro-titulo').textContent = `Foro: ${producto.nombre}`;
            document.getElementById('foro-descripcion').textContent = `Discute sobre ${producto.nombre} con otros usuarios de DiscoveryShop`;
            document.getElementById('crear-tema-btn').style.display = 'inline-block';
        }

        this.loadTemas();
        this.closeTemaDetail();
    }

    // ===== CARGAR TEMAS =====
    async loadTemas() {
        if (!this.selectedProductId) return;

        try {
            document.getElementById('loading-spinner').style.display = 'flex';
            document.getElementById('temas-container').innerHTML = '';

            const params = new URLSearchParams({
                product_id: this.selectedProductId,
                filter: this.currentFilter
            });

            const response = await Config.fetch(`/api/foros/temas?${params}`);
            this.temas = response.data || [];

            if (this.temas.length === 0) {
                document.getElementById('empty-state').style.display = 'flex';
                document.getElementById('temas-container').style.display = 'none';
            } else {
                document.getElementById('empty-state').style.display = 'none';
                document.getElementById('temas-container').style.display = 'flex';
                this.renderTemas();
            }
        } catch (error) {
            console.error('Error cargando temas:', error);
            this.showToast('Error al cargar temas', 'error');
        } finally {
            document.getElementById('loading-spinner').style.display = 'none';
        }
    }

    renderTemas() {
        const container = document.getElementById('temas-container');
        container.innerHTML = '';

        this.temas.forEach(tema => {
            const item = document.createElement('div');
            item.className = 'tema-item';
            if (tema.id === this.selectedTemaId) item.classList.add('active');

            const categoriaClass = tema.categoria?.toLowerCase().replace(/\s/g, '-') || 'pregunta';
            const fechaHace = this.tiempoHace(tema.created_at);

            item.innerHTML = `
                <div style="display: flex; gap: 1rem;">
                    <div style="flex: 1;">
                        <div class="tema-categoria ${categoriaClass}">
                            ${tema.categoria_icon} ${tema.categoria}
                        </div>
                        <h3 class="tema-titulo">${this.escaparHTML(tema.titulo)}</h3>
                        <p class="tema-preview">${this.escaparHTML(tema.contenido.substring(0, 150))}...</p>
                        <div class="tema-meta">
                            <div class="tema-autor">
                                <span class="autor-avatar">${this.getAvatarLetter(tema.autor_nombre)}</span>
                                <span>${this.escaparHTML(tema.autor_nombre)}</span>
                            </div>
                            <span style="color: var(--text-muted); font-size: 0.85rem;">Hace ${fechaHace}</span>
                        </div>
                    </div>
                    <div class="tema-stats">
                        <div class="tema-stat">
                            <span>💬</span>
                            <span>${tema.respuestas_count || 0}</span>
                        </div>
                        <div class="tema-stat">
                            <span>👍</span>
                            <span>${tema.votos_util || 0}</span>
                        </div>
                        <div class="tema-stat">
                            <span>👁️</span>
                            <span>${tema.vistas || 0}</span>
                        </div>
                    </div>
                </div>
            `;

            item.addEventListener('click', () => this.selectTema(tema.id));
            container.appendChild(item);
        });
    }

    selectTema(temaId) {
        this.selectedTemaId = temaId;
        const tema = this.temas.find(t => t.id === temaId);

        // Actualizar UI
        document.querySelectorAll('.tema-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget?.classList.add('active');

        this.showTemaDetail(tema);
    }

    // ===== DETALLE DEL TEMA =====
    async showTemaDetail(tema) {
        document.getElementById('tema-detail-panel').style.display = 'flex';

        // Actualizar vistas
        await Config.fetch(`/api/foros/temas/${tema.id}/vistas`, { method: 'POST' });

        // Cargar datos completos
        try {
            const response = await Config.fetch(`/api/foros/temas/${tema.id}`);
            const temaCompleto = response.data;

            // Header
            document.getElementById('tema-titulo-detail').textContent = temaCompleto.titulo;
            document.getElementById('autor-nombre').textContent = temaCompleto.autor_nombre;
            document.getElementById('autor-avatar').textContent = this.getAvatarLetter(temaCompleto.autor_nombre);
            document.getElementById('fecha-creation').textContent = new Date(temaCompleto.created_at).toLocaleString('es-ES');

            // Contenido
            document.getElementById('tema-contenido-detail').textContent = temaCompleto.contenido;

            // Stats
            document.getElementById('votos-util').textContent = temaCompleto.votos_util || 0;
            document.getElementById('respuestas-count').textContent = temaCompleto.respuestas_count || 0;
            document.getElementById('vistas-count').textContent = temaCompleto.vistas || 0;

            // Cargar respuestas
            await this.loadRespuestas(tema.id);

            // Reset form
            this.closeRespuestaForm();
        } catch (error) {
            console.error('Error cargando detalle del tema:', error);
            this.showToast('Error al cargar el tema', 'error');
        }
    }

    closeTemaDetail() {
        document.getElementById('tema-detail-panel').style.display = 'none';
        this.selectedTemaId = null;
    }

    // ===== RESPUESTAS =====
    async loadRespuestas(temaId) {
        try {
            const response = await Config.fetch(`/api/foros/temas/${temaId}/respuestas`);
            this.respuestas = response.data || [];

            document.getElementById('respuestas-num').textContent = this.respuestas.length;
            this.renderRespuestas();
        } catch (error) {
            console.error('Error cargando respuestas:', error);
        }
    }

    renderRespuestas() {
        const container = document.getElementById('respuestas-list');
        container.innerHTML = '';

        this.respuestas.forEach(respuesta => {
            const item = document.createElement('div');
            item.className = 'respuesta-item';

            const fechaHace = this.tiempoHace(respuesta.created_at);
            const esAutor = this.usuario?.id === respuesta.autor_id;

            item.innerHTML = `
                <div class="respuesta-header">
                    <div class="respuesta-autor">
                        <span class="autor-avatar" style="width: 24px; height: 24px; font-size: 0.7rem;">
                            ${this.getAvatarLetter(respuesta.autor_nombre)}
                        </span>
                        <span>${this.escaparHTML(respuesta.autor_nombre)}</span>
                        ${esAutor ? '<span style="font-size: 0.75rem; background: var(--primary); padding: 0.2rem 0.5rem; border-radius: 4px; color: white;">Autor</span>' : ''}
                    </div>
                    <span class="respuesta-fecha">Hace ${fechaHace}</span>
                </div>
                <div class="respuesta-contenido">${this.escaparHTML(respuesta.contenido)}</div>
                <div class="respuesta-acciones">
                    <button class="respuesta-accion" data-respuesta-id="${respuesta.id}" data-voto="util">
                        👍 ${respuesta.votos_util || 0}
                    </button>
                    <button class="respuesta-accion" data-respuesta-id="${respuesta.id}" data-voto="no-util">
                        👎 ${respuesta.votos_no_util || 0}
                    </button>
                </div>
            `;

            // Eventos de votación
            item.querySelectorAll('.respuesta-accion').forEach(btn => {
                btn.addEventListener('click', () => {
                    const respuestaId = btn.dataset.respuestaId;
                    const tipo = btn.dataset.voto;
                    this.votarRespuesta(respuestaId, tipo, btn);
                });
            });

            container.appendChild(item);
        });
    }

    toggleRespuestaForm() {
        const form = document.getElementById('respuesta-form-container');
        if (form.style.display === 'none') {
            form.style.display = 'block';
            document.getElementById('respuesta-textarea').focus();
        } else {
            this.closeRespuestaForm();
        }
    }

    closeRespuestaForm() {
        document.getElementById('respuesta-form-container').style.display = 'none';
        document.getElementById('respuesta-textarea').value = '';
    }

    async enviarRespuesta() {
        if (!this.usuario) {
            this.showToast('Debes iniciar sesión para responder', 'error');
            return;
        }

        const contenido = document.getElementById('respuesta-textarea').value.trim();
        if (!contenido) {
            this.showToast('Escribe una respuesta', 'error');
            return;
        }

        if (contenido.length > 5000) {
            this.showToast('La respuesta es demasiado larga', 'error');
            return;
        }

        try {
            const response = await Config.fetch(
                `/api/foros/temas/${this.selectedTemaId}/respuestas`,
                {
                    method: 'POST',
                    body: JSON.stringify({ contenido })
                }
            );

            this.showToast('Respuesta enviada correctamente', 'success');
            this.loadRespuestas(this.selectedTemaId);
            this.closeRespuestaForm();
        } catch (error) {
            console.error('Error enviando respuesta:', error);
            this.showToast('Error al enviar la respuesta', 'error');
        }
    }

    // ===== VOTACIÓN =====
    async votarTema(tipo) {
        if (!this.usuario) {
            this.showToast('Debes iniciar sesión para votar', 'error');
            return;
        }

        try {
            await Config.fetch(
                `/api/foros/temas/${this.selectedTemaId}/votos`,
                {
                    method: 'POST',
                    body: JSON.stringify({ tipo })
                }
            );

            // Actualizar UI
            const btn = document.getElementById(`btn-${tipo}`);
            btn.classList.toggle('active');

            // Recargar datos
            const tema = this.temas.find(t => t.id === this.selectedTemaId);
            if (tema) this.showTemaDetail(tema);
        } catch (error) {
            console.error('Error votando tema:', error);
            this.showToast('Error al votar', 'error');
        }
    }

    async votarRespuesta(respuestaId, tipo, btn) {
        if (!this.usuario) {
            this.showToast('Debes iniciar sesión para votar', 'error');
            return;
        }

        try {
            await Config.fetch(
                `/api/foros/respuestas/${respuestaId}/votos`,
                {
                    method: 'POST',
                    body: JSON.stringify({ tipo })
                }
            );

            btn.classList.toggle('active');
        } catch (error) {
            console.error('Error votando respuesta:', error);
            this.showToast('Error al votar', 'error');
        }
    }

    // ===== CREAR TEMA =====
    showModalCrearTema() {
        if (!this.usuario) {
            this.showToast('Debes iniciar sesión para crear un tema', 'error');
            return;
        }

        document.getElementById('modal-crear-tema').style.display = 'flex';
        document.getElementById('tema-titulo-input').focus();
    }

    async crearTema() {
        const titulo = document.getElementById('tema-titulo-input').value.trim();
        const contenido = document.getElementById('tema-contenido-input').value.trim();
        const categoria = document.getElementById('tema-categoria-select').value;

        if (!titulo || !contenido || !categoria) {
            this.showToast('Completa todos los campos', 'error');
            return;
        }

        try {
            const response = await Config.fetch(
                '/api/foros/temas',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        product_id: this.selectedProductId,
                        titulo,
                        contenido,
                        categoria
                    })
                }
            );

            this.showToast('Tema creado correctamente', 'success');
            this.closeModal('modal-crear-tema');
            this.resetFormCrearTema();
            this.loadTemas();
        } catch (error) {
            console.error('Error creando tema:', error);
            this.showToast('Error al crear el tema', 'error');
        }
    }

    resetFormCrearTema() {
        document.getElementById('form-crear-tema').reset();
        document.getElementById('contador-titulo').textContent = '0/200';
        document.getElementById('contador-contenido').textContent = '0/2000';
    }

    // ===== MODAL UTILITIES =====
    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    // ===== BÚSQUEDA =====
    async searchTemas() {
        const query = document.getElementById('search-input').value.trim();
        if (!query) {
            this.loadTemas();
            return;
        }

        try {
            const params = new URLSearchParams({
                product_id: this.selectedProductId,
                search: query
            });

            const response = await Config.fetch(`/api/foros/temas/search?${params}`);
            this.temas = response.data || [];
            this.renderTemas();
        } catch (error) {
            console.error('Error en búsqueda:', error);
        }
    }

    // ===== USER BUTTON =====
    handleUserButton() {
        if (this.usuario) {
            // Logout
            Config.clearAuthToken();
            window.location.href = '/';
        } else {
            // Login
            window.location.href = '/login.html';
        }
    }

    // ===== UTILITIES =====
    getAvatarLetter(name) {
        return name ? name.charAt(0).toUpperCase() : '👤';
    }

    escaparHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    tiempoHace(fecha) {
        const ahora = new Date();
        const hace = new Date(fecha);
        const diff = Math.floor((ahora - hace) / 1000);

        if (diff < 60) return 'hace un momento';
        if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
        if (diff < 604800) return `hace ${Math.floor(diff / 86400)}d`;
        if (diff < 2592000) return `hace ${Math.floor(diff / 604800)}sem`;
        return `hace ${Math.floor(diff / 2592000)}mes`;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new ForosApp();
});
