/**
 * DiscoveryShop - Chat JavaScript
 * Sistema de chat privado en tiempo real con WebSocket (Socket.IO)
 * Totalmente en español
 */

import { Config, ApiEndpoints } from './config.js';

class ChatApp {
    constructor() {
        this.usuario = Config.getUser();
        this.conversaciones = [];
        this.messagesActuales = [];
        this.conversacionActual = null;
        this.socketIO = null;
        this.usuariosOnline = new Set();
        this.currentFilter = 'all';

        if (!this.usuario) {
            window.location.href = '/login.html';
            return;
        }

        this.initializeSocket();
        this.initializeEventListeners();
        this.loadConversaciones();
    }

    // ===== WEBSOCKET INITIALIZATION =====
    initializeSocket() {
        const baseUrl = Config.getApiBaseUrl();
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');

        this.socketIO = io(baseUrl, {
            query: { token },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });

        // Eventos de conexión
        this.socketIO.on('connect', () => {
            console.log('✅ Conectado a WebSocket');
            this.showToast('Conectado', 'success');
        });

        this.socketIO.on('disconnect', () => {
            console.log('❌ Desconectado de WebSocket');
            this.showToast('Desconectado', 'warning');
        });

        this.socketIO.on('connected', (data) => {
            console.log('Usuario conectado:', data.user_id);
        });

        // Eventos de mensajes
        this.socketIO.on('new_message', (data) => {
            this.handleNewMessage(data);
        });

        this.socketIO.on('message_sent', (data) => {
            console.log('Mensaje enviado:', data);
        });

        // Eventos de escritura
        this.socketIO.on('typing', (data) => {
            this.handleTypingIndicator(data);
        });

        // Eventos de estado
        this.socketIO.on('user_online', (data) => {
            this.usuariosOnline.add(data.user_id);
            this.updateUserStatus(data.user_id, true);
        });

        this.socketIO.on('user_offline', (data) => {
            this.usuariosOnline.delete(data.user_id);
            this.updateUserStatus(data.user_id, false);
        });

        this.socketIO.on('read_status', (data) => {
            this.handleReadStatus(data);
        });

        // Notificaciones
        this.socketIO.on('new_notification', (data) => {
            this.showToast(data.message, 'info');
        });

        this.socketIO.on('error', (data) => {
            console.error('WebSocket error:', data);
            this.showToast(data.message || 'Error en WebSocket', 'error');
        });
    }

    // ===== EVENT LISTENERS =====
    initializeEventListeners() {
        // Navegación
        document.getElementById('back-btn').addEventListener('click', () => {
            window.history.back();
        });

        document.getElementById('user-btn').addEventListener('click', () => {
            this.handleUserButton();
        });

        // Chat
        document.getElementById('btn-nueva-conversacion').addEventListener('click', () => {
            this.showModalNuevaConversacion();
        });

        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.enviarMensaje();
            }
        });

        document.getElementById('message-input').addEventListener('input', (e) => {
            // Actualizar contador
            const count = e.target.value.length;
            document.getElementById('message-char-count').textContent = count;

            // Indicador de escritura
            if (this.conversacionActual) {
                this.socketIO.emit('typing', {
                    receiver_id: this.conversacionActual.otro_usuario_id
                });
            }

            // Limpiar debounce anterior
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                if (this.conversacionActual) {
                    this.socketIO.emit('stop_typing', {
                        receiver_id: this.conversacionActual.otro_usuario_id
                    });
                }
            }, 1000);
        });

        document.getElementById('btn-send-message').addEventListener('click', () => {
            this.enviarMensaje();
        });

        document.getElementById('btn-start-chat').addEventListener('click', () => {
            this.showModalNuevaConversacion();
        });

        // Filtros
        document.querySelectorAll('.conv-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.conv-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.filterConversaciones();
            });
        });

        // Búsqueda
        document.getElementById('search-conversations').addEventListener('input', (e) => {
            this.searchConversaciones(e.target.value);
        });

        // Modal nueva conversación
        document.getElementById('form-nueva-conversacion').addEventListener('submit', (e) => {
            e.preventDefault();
            this.iniciarConversacion();
        });

        document.getElementById('modal-close-nueva-conv').addEventListener('click', () => {
            this.closeModal('modal-nueva-conversacion');
        });

        document.getElementById('form-cancel').addEventListener('click', () => {
            this.closeModal('modal-nueva-conversacion');
        });

        document.getElementById('search-usuario').addEventListener('input', (e) => {
            this.searchUsuarios(e.target.value);
        });

        document.getElementById('btn-remove-selected-user').addEventListener('click', () => {
            this.removeSelectedUser();
        });

        // Chat actions
        document.getElementById('btn-info-chat').addEventListener('click', () => {
            this.showModalInfoConversacion();
        });

        document.getElementById('btn-cerrar-chat').addEventListener('click', () => {
            this.closeChat();
        });

        document.getElementById('btn-archivar-conv').addEventListener('click', () => {
            this.archivarConversacion();
        });

        document.getElementById('btn-eliminar-conv').addEventListener('click', () => {
            this.eliminarConversacion();
        });

        document.getElementById('modal-close-info').addEventListener('click', () => {
            this.closeModal('modal-info-conversacion');
        });

        // File attach
        document.getElementById('btn-attach-file').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            this.handleFileAttach(e);
        });
    }

    // ===== CONVERSACIONES =====
    async loadConversaciones() {
        try {
            document.getElementById('loading-conversations').style.display = 'flex';

            const response = await Config.fetch(ApiEndpoints.chat.conversations);
            this.conversaciones = response.data || [];

            this.renderConversaciones();
        } catch (error) {
            console.error('Error cargando conversaciones:', error);
            this.showToast('Error al cargar conversaciones', 'error');
        } finally {
            document.getElementById('loading-conversations').style.display = 'none';
        }
    }

    renderConversaciones() {
        const list = document.getElementById('conversaciones-list');
        list.innerHTML = '';

        if (this.conversaciones.length === 0) {
            document.getElementById('empty-conversations').style.display = 'flex';
            return;
        }

        document.getElementById('empty-conversations').style.display = 'none';

        this.conversaciones.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conversacion-item';
            if (this.conversacionActual?.id === conv.id) {
                item.classList.add('active');
            }

            const isOnline = this.usuariosOnline.has(conv.otro_usuario_id);
            const lastMessagePreview = conv.ultimo_mensaje ?
                conv.ultimo_mensaje.substring(0, 50) + (conv.ultimo_mensaje.length > 50 ? '...' : '')
                : 'Sin mensajes';

            item.innerHTML = `
                <div class="conversacion-avatar">
                    ${this.getAvatarLetter(conv.otro_usuario_nombre)}
                    <div class="status-dot ${isOnline ? '' : 'offline'}"></div>
                </div>
                <div class="conversacion-info">
                    <div class="conversacion-nombre">${this.escaparHTML(conv.otro_usuario_nombre)}</div>
                    <div class="conversacion-preview ${conv.no_leidos ? 'unread' : ''}">
                        ${this.escaparHTML(lastMessagePreview)}
                    </div>
                </div>
                <div class="conversacion-meta">
                    <div class="conversacion-fecha">${this.formatearFecha(conv.ultima_actividad)}</div>
                    ${conv.no_leidos ? `<div class="conversacion-badge">${conv.no_leidos}</div>` : ''}
                </div>
            `;

            item.addEventListener('click', () => this.selectConversacion(conv.id));
            list.appendChild(item);
        });
    }

    selectConversacion(conversacionId) {
        const conv = this.conversaciones.find(c => c.id === conversacionId);
        if (!conv) return;

        this.conversacionActual = conv;

        // Actualizar UI
        document.querySelectorAll('.conversacion-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget?.classList.add('active');

        // Mostrar chat
        document.getElementById('chat-empty').style.display = 'none';
        document.getElementById('chat-main').style.display = 'flex';

        // Actualizar header
        document.getElementById('chat-user-nombre').textContent = conv.otro_usuario_nombre;
        document.getElementById('chat-user-avatar').textContent = this.getAvatarLetter(conv.otro_usuario_nombre);

        const isOnline = this.usuariosOnline.has(conv.otro_usuario_id);
        document.getElementById('status-indicator').className = `status-indicator ${isOnline ? '' : 'offline'}`;
        document.getElementById('status-text').textContent = isOnline ? 'En línea' : 'Offline';

        this.loadMensajes(conversacionId);

        // Marcar como leído
        this.markAsRead(conv.otro_usuario_id);
    }

    // ===== MENSAJES =====
    async loadMensajes(conversacionId) {
        try {
            document.getElementById('loading-messages').style.display = 'flex';
            document.getElementById('messages-container').innerHTML = '';

            const response = await Config.fetch(ApiEndpoints.chat.messages(conversacionId));
            this.messagesActuales = response.data || [];

            this.renderMensajes();
        } catch (error) {
            console.error('Error cargando mensajes:', error);
            this.showToast('Error al cargar mensajes', 'error');
        } finally {
            document.getElementById('loading-messages').style.display = 'none';
        }
    }

    renderMensajes() {
        const container = document.getElementById('messages-container');
        container.innerHTML = '';

        this.messagesActuales.forEach((msg, index) => {
            const isSent = msg.sender_id === this.usuario.id;
            const isNewGroup = index === 0 ||
                this.messagesActuales[index - 1].sender_id !== msg.sender_id;

            if (isNewGroup && !isSent) {
                const group = document.createElement('div');
                group.className = 'message-group';
                container.appendChild(group);
            }

            const message = document.createElement('div');
            message.className = `message ${isSent ? 'sent' : 'received'}`;

            if (!isSent) {
                const avatar = document.createElement('div');
                avatar.className = 'message-avatar';
                avatar.textContent = this.getAvatarLetter(msg.sender_name);
                message.appendChild(avatar);
            }

            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.textContent = msg.message;
            message.appendChild(bubble);

            // Meta (hora y estado de lectura)
            const meta = document.createElement('div');
            meta.className = 'message-meta';
            const tiempo = new Date(msg.created_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            meta.innerHTML = `<span>${tiempo}</span>`;
            if (isSent && msg.is_read) {
                meta.innerHTML += '<span class="read-indicator">✓✓</span>';
            }
            message.appendChild(meta);

            container.appendChild(message);
        });

        // Scroll al último mensaje
        container.scrollTop = container.scrollHeight;
    }

    async enviarMensaje() {
        const input = document.getElementById('message-input');
        const mensaje = input.value.trim();

        if (!mensaje) return;
        if (!this.conversacionActual) {
            this.showToast('Selecciona una conversación', 'error');
            return;
        }

        try {
            // Enviar por WebSocket
            this.socketIO.emit('send_message', {
                receiver_id: this.conversacionActual.otro_usuario_id,
                message: mensaje
            });

            // Guardar en BD
            await Config.fetch(ApiEndpoints.chat.send(this.conversacionActual.id), {
                method: 'POST',
                body: JSON.stringify({ message: mensaje })
            });

            input.value = '';
            document.getElementById('message-char-count').textContent = '0';

            // Recargar mensajes
            this.loadMensajes(this.conversacionActual.id);
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            this.showToast('Error al enviar mensaje', 'error');
        }
    }

    handleNewMessage(data) {
        // Si es para la conversación actual
        if (this.conversacionActual &&
            data.sender_id === this.conversacionActual.otro_usuario_id) {
            // Agregar al contenedor
            const container = document.getElementById('messages-container');
            const message = document.createElement('div');
            message.className = 'message received';

            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.textContent = this.getAvatarLetter(data.sender_name);
            message.appendChild(avatar);

            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.textContent = data.message;
            message.appendChild(bubble);

            const meta = document.createElement('div');
            meta.className = 'message-meta';
            const tiempo = new Date(data.created_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            meta.innerHTML = `<span>${tiempo}</span>`;
            message.appendChild(meta);

            container.appendChild(message);
            container.scrollTop = container.scrollHeight;

            // Marcar como leído
            this.socketIO.emit('mark_read', {
                sender_id: data.sender_id
            });
        }
    }

    markAsRead(userId) {
        this.socketIO.emit('mark_read', {
            sender_id: userId
        });
    }

    handleReadStatus(data) {
        // Actualizar estatus de mensajes leídos
        const messages = document.querySelectorAll('.message.sent .read-indicator');
        messages.forEach(msg => {
            msg.textContent = '✓✓';
        });
    }

    // ===== TYPING INDICATOR =====
    handleTypingIndicator(data) {
        if (!data.is_typing) {
            document.getElementById('typing-indicator').style.display = 'none';
            return;
        }

        if (this.conversacionActual &&
            data.user_id === this.conversacionActual.otro_usuario_id) {
            document.getElementById('typing-user-name').textContent = data.user_name || 'Usuario';
            document.getElementById('typing-indicator').style.display = 'flex';
        }
    }

    // ===== NUEVA CONVERSACIÓN =====
    showModalNuevaConversacion() {
        document.getElementById('modal-nueva-conversacion').style.display = 'flex';
        document.getElementById('search-usuario').focus();
    }

    async searchUsuarios(query) {
        if (!query) {
            document.getElementById('usuarios-dropdown').style.display = 'none';
            return;
        }

        try {
            const response = await Config.fetch(
                `/api/usuarios/search?query=${encodeURIComponent(query)}`
            );
            const usuarios = response.data || [];

            const dropdown = document.getElementById('usuarios-dropdown');
            dropdown.innerHTML = '';

            usuarios.forEach(usuario => {
                const option = document.createElement('div');
                option.className = 'usuario-option';
                option.innerHTML = `
                    <span class="avatar-small">${this.getAvatarLetter(usuario.nombre)}</span>
                    <div>
                        <div style="font-weight: 600;">${this.escaparHTML(usuario.nombre)}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">${this.escaparHTML(usuario.email)}</div>
                    </div>
                `;
                option.addEventListener('click', () => {
                    this.selectUsuario(usuario);
                });
                dropdown.appendChild(option);
            });

            dropdown.style.display = usuarios.length > 0 ? 'block' : 'none';
        } catch (error) {
            console.error('Error buscando usuarios:', error);
        }
    }

    selectUsuario(usuario) {
        document.getElementById('selected-usuario-id').value = usuario.id;
        document.getElementById('selected-usuario-nombre').textContent = usuario.nombre;
        document.getElementById('selected-usuario-avatar').textContent = this.getAvatarLetter(usuario.nombre);
        document.getElementById('selected-usuario-display').style.display = 'block';
        document.getElementById('usuarios-dropdown').style.display = 'none';
        document.getElementById('search-usuario').value = '';
    }

    removeSelectedUser() {
        document.getElementById('selected-usuario-id').value = '';
        document.getElementById('selected-usuario-display').style.display = 'none';
        document.getElementById('search-usuario').focus();
    }

    async iniciarConversacion() {
        const usuarioId = document.getElementById('selected-usuario-id').value;
        if (!usuarioId) {
            this.showToast('Selecciona un usuario', 'error');
            return;
        }

        try {
            const response = await Config.fetch(
                ApiEndpoints.chat.conversations,
                {
                    method: 'POST',
                    body: JSON.stringify({ otro_usuario_id: usuarioId })
                }
            );

            const nueva = response.data;
            this.conversaciones.unshift(nueva);
            this.renderConversaciones();
            this.selectConversacion(nueva.id);
            this.closeModal('modal-nueva-conversacion');
        } catch (error) {
            console.error('Error iniciando conversación:', error);
            this.showToast('Error al iniciar conversación', 'error');
        }
    }

    // ===== CHAT ACTIONS =====
    closeChat() {
        document.getElementById('chat-main').style.display = 'none';
        document.getElementById('chat-empty').style.display = 'flex';
        this.conversacionActual = null;
    }

    showModalInfoConversacion() {
        if (!this.conversacionActual) return;

        document.getElementById('info-fecha-inicio').textContent =
            new Date(this.conversacionActual.created_at).toLocaleString('es-ES');
        document.getElementById('info-total-mensajes').textContent =
            this.messagesActuales.length;
        document.getElementById('info-ultimo-mensaje').textContent =
            new Date(this.conversacionActual.ultima_actividad).toLocaleString('es-ES');

        document.getElementById('modal-info-conversacion').style.display = 'flex';
    }

    async archivarConversacion() {
        if (!this.conversacionActual) return;

        try {
            await Config.fetch(
                `/api/chat/conversations/${this.conversacionActual.id}/archive`,
                { method: 'POST' }
            );

            this.showToast('Conversación archivada', 'success');
            this.closeModal('modal-info-conversacion');
            this.closeChat();
            this.loadConversaciones();
        } catch (error) {
            console.error('Error archivando:', error);
            this.showToast('Error al archivar', 'error');
        }
    }

    async eliminarConversacion() {
        if (!this.conversacionActual) return;

        if (!confirm('¿Estás seguro de que quieres eliminar esta conversación?')) {
            return;
        }

        try {
            await Config.fetch(
                `/api/chat/conversations/${this.conversacionActual.id}`,
                { method: 'DELETE' }
            );

            this.showToast('Conversación eliminada', 'success');
            this.closeModal('modal-info-conversacion');
            this.closeChat();
            this.loadConversaciones();
        } catch (error) {
            console.error('Error eliminando:', error);
            this.showToast('Error al eliminar', 'error');
        }
    }

    handleFileAttach(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Por ahora solo mostrar info
        const info = `Archivo: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
        document.getElementById('attachment-info').textContent = info;
        document.getElementById('attachment-info').style.display = 'block';

        // Aquí se podría implementar upload
        console.log('Archivo seleccionado:', file);
    }

    // ===== FILTROS Y BÚSQUEDA =====
    filterConversaciones() {
        // Implementar filtrado
        this.loadConversaciones();
    }

    searchConversaciones(query) {
        if (!query) {
            this.renderConversaciones();
            return;
        }

        const filtered = this.conversaciones.filter(conv =>
            conv.otro_usuario_nombre.toLowerCase().includes(query.toLowerCase())
        );

        const list = document.getElementById('conversaciones-list');
        list.innerHTML = '';

        filtered.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conversacion-item';
            const isOnline = this.usuariosOnline.has(conv.otro_usuario_id);

            item.innerHTML = `
                <div class="conversacion-avatar">
                    ${this.getAvatarLetter(conv.otro_usuario_nombre)}
                    <div class="status-dot ${isOnline ? '' : 'offline'}"></div>
                </div>
                <div class="conversacion-info">
                    <div class="conversacion-nombre">${this.escaparHTML(conv.otro_usuario_nombre)}</div>
                    <div class="conversacion-preview">${this.escaparHTML(conv.ultimo_mensaje || 'Sin mensajes')}</div>
                </div>
            `;

            item.addEventListener('click', () => this.selectConversacion(conv.id));
            list.appendChild(item);
        });
    }

    updateUserStatus(userId, isOnline) {
        // Actualizar status en conversaciones
        const items = document.querySelectorAll('.conversacion-item');
        items.forEach(item => {
            const conv = this.conversaciones.find(c => c.otro_usuario_id === userId);
            if (conv) {
                const dot = item.querySelector('.status-dot');
                if (dot) {
                    dot.className = `status-dot ${isOnline ? '' : 'offline'}`;
                }
            }
        });

        // Si es la conversación actual
        if (this.conversacionActual?.otro_usuario_id === userId) {
            document.getElementById('status-indicator').className = `status-indicator ${isOnline ? '' : 'offline'}`;
            document.getElementById('status-text').textContent = isOnline ? 'En línea' : 'Offline';
        }
    }

    // ===== UTILITIES =====
    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    getAvatarLetter(name) {
        return name ? name.charAt(0).toUpperCase() : '👤';
    }

    escaparHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatearFecha(fecha) {
        const ahora = new Date();
        const hace = new Date(fecha);
        const diff = Math.floor((ahora - hace) / 1000);

        if (diff < 60) return 'Ahora';
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
        return `Hace ${Math.floor(diff / 86400)}d`;
    }

    handleUserButton() {
        if (this.usuario) {
            Config.clearAuthToken();
            window.location.href = '/';
        } else {
            window.location.href = '/login.html';
        }
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
    new ChatApp();
});
