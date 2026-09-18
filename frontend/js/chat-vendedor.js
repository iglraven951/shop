/**
 * Chat con Vendedor
 * Gestiona la vista de chat con el vendedor incluyendo mapa
 */

class ChatVendedor {
    constructor() {
        this.productId = new URLSearchParams(window.location.search).get('product');
        this.product = null;
        this.map = null;
        this.messages = [];

        this.init();
    }

    async init() {
        console.log('🚀 Inicializando ChatVendedor...');

        if (!this.productId) {
            console.error('❌ No hay ID de producto');
            window.location.href = '/';
            return;
        }

        console.log(`📦 Cargando producto ${this.productId}...`);
        await this.cargarProducto();

        console.log('⚙️ Configurando event listeners...');
        this.setupEventListeners();

        console.log('🗺️ Inicializando mapa...');
        this.inicializarMapa();

        console.log('💬 Mostrando mensaje de bienvenida...');
        this.mostrarMensajeBienvenida();

        console.log('✅ ChatVendedor inicializado correctamente');
    }

    async cargarProducto() {
        try {
            const response = await fetch(`http://localhost:5000/api/products/${this.productId}`);
            const data = await response.json();

            console.log('📦 Respuesta del servidor:', data);

            if (data.success && data.data) {
                this.product = data.data;
                console.log('✓ Producto cargado:', this.product);
                this.mostrarProducto();
            } else {
                console.error('❌ Error: Respuesta no válida:', data);
            }
        } catch (e) {
            console.error('❌ Error al cargar producto:', e);
            // Mostrar mensaje de error en lugar de redirigir
            const container = document.getElementById('messages-container');
            if (container) {
                container.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #ef4444;">
                        <p>⚠️ Error al cargar el producto</p>
                        <p style="font-size: 12px;">ID: ${this.productId}</p>
                        <button onclick="window.history.back()" style="margin-top: 10px; padding: 8px 16px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Volver
                        </button>
                    </div>
                `;
            }
        }
    }

    mostrarProducto() {
        if (!this.product) return;

        try {
            // Header
            if (this.product.seller && this.product.seller.name) {
                document.getElementById('seller-name').textContent = this.product.seller.name;
            }
            if (this.product.location && this.product.location.city) {
                document.getElementById('seller-location').textContent = `📍 ${this.product.location.city}`;
            }
            if (this.product.seller && this.product.seller.rating) {
                document.getElementById('seller-rating').textContent = `⭐ ${this.product.seller.rating.toFixed(1)}`;
            }
            if (this.product.seller && this.product.seller.total_sales) {
                document.getElementById('seller-sales').textContent = `${this.product.seller.total_sales} ventas`;
            }

            // Product Card
            if (this.product.image) {
                document.getElementById('product-image').src = this.product.image;
            }
            if (this.product.title) {
                document.getElementById('product-image').alt = this.product.title;
                document.getElementById('product-title').textContent = this.product.title;
            }
            if (this.product.price !== undefined) {
                document.getElementById('product-price').textContent = formatCurrency(this.product.price);
            }
            if (this.product.description) {
                document.getElementById('product-description').textContent = this.product.description;
            }
            if (this.product.category) {
                document.getElementById('product-category').textContent = this.product.category;
            }
            if (this.product.stock !== undefined) {
                document.getElementById('product-stock').textContent = `Stock: ${this.product.stock}`;
            }

            // Vendor Info
            if (this.product.seller && this.product.seller.name) {
                document.getElementById('vendor-name').textContent = this.product.seller.name;
                if (this.product.seller.rating) {
                    document.getElementById('vendor-rating-detail').textContent =
                        `⭐ ${this.product.seller.rating.toFixed(1)} (${this.product.seller.total_sales || 0} ventas)`;
                }
            }
            if (this.product.location && this.product.location.city && this.product.location.country) {
                document.getElementById('vendor-location-detail').textContent =
                    `📍 ${this.product.location.city}, ${this.product.location.country}`;
            }
            if (this.product.seller && this.product.seller.username) {
                document.getElementById('vendor-username').textContent = `@${this.product.seller.username}`;
            }
        } catch (e) {
            console.error('❌ Error al mostrar producto:', e);
        }
    }

    setupEventListeners() {
        // Botón volver - con fallback
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔙 Botón volver clicked');

                // Intentar history.back(), sino ir a la página principal
                if (window.history.length > 1) {
                    console.log('🔙 Usando history.back()');
                    window.history.back();
                } else {
                    console.log('🏠 Sin historial, ir a página principal');
                    window.location.href = '/index.html';
                }
            });

            // También permitir hacer click en el texto
            backBtn.style.cursor = 'pointer';
        } else {
            console.warn('⚠️ Elemento back-btn no encontrado');
        }

        // Input de chat
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.enviarMensaje();
                }
            });
        }

        // Botón enviar
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.enviarMensaje();
            });
        }
    }

    mostrarMensajeBienvenida() {
        const container = document.getElementById('messages-container');

        // Mensaje de bienvenida del vendedor
        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = 'message vendor';
        welcomeMsg.innerHTML = `
            <div class="message-bubble">
                ¡Hola! Soy ${this.product.seller.name}. ¿En qué puedo ayudarte con ${this.product.title}?
            </div>
            <span class="message-time">Ahora</span>
        `;
        container.appendChild(welcomeMsg);
    }

    enviarMensaje() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message) return;

        const container = document.getElementById('messages-container');

        // Mensaje del usuario
        const userMsg = document.createElement('div');
        userMsg.className = 'message user';
        userMsg.innerHTML = `
            <span class="message-time">Ahora</span>
            <div class="message-bubble">${message}</div>
        `;
        container.appendChild(userMsg);

        input.value = '';
        container.scrollTop = container.scrollHeight;

        // Respuesta del vendedor
        setTimeout(() => {
            const responses = [
                '¡Claro! Tengo toda la información que necesitas.',
                '¿Te interesa? Puedo ofrecerte un buen precio.',
                'El producto está en excelentes condiciones.',
                '¿Cuándo te vendría bien coordinar la entrega?',
                'Tengo disponibilidad para mostrártelo cuando quieras.',
                'Puedo hacer entrega en tu zona sin problema.',
                '¿Tienes alguna pregunta adicional?'
            ];

            const randomResponse = responses[Math.floor(Math.random() * responses.length)];

            const vendorMsg = document.createElement('div');
            vendorMsg.className = 'message vendor';
            vendorMsg.innerHTML = `
                <div class="message-bubble">${randomResponse}</div>
                <span class="message-time">Ahora</span>
            `;
            container.appendChild(vendorMsg);
            container.scrollTop = container.scrollHeight;
        }, 600);
    }

    inicializarMapa() {
        if (!this.product) {
            console.warn('⚠️ Producto no cargado aún');
            return;
        }

        // Verificar que el elemento #map existe
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('❌ Elemento #map no encontrado en el DOM');
            return;
        }

        // Verificar que Leaflet está disponible
        if (typeof L === 'undefined') {
            console.error('❌ Leaflet no está disponible aún, esperando...');
            const maxRetries = 50;
            for (let i = 0; i < maxRetries; i++) {
                setTimeout(() => {
                    if (typeof L !== 'undefined' && i === maxRetries - 1) {
                        this.inicializarMapa();
                    }
                }, i * 100);
            }
            return;
        }

        if (!this.product.location || !this.product.location.lat || !this.product.location.lng) {
            console.warn('⚠️ Ubicación no disponible:', this.product.location);
            // Usar coordenadas por defecto de Arequipa
            this.product.location = this.product.location || {};
            this.product.location.lat = this.product.location.lat || -16.3972;
            this.product.location.lng = this.product.location.lng || -71.5350;
            this.product.location.city = this.product.location.city || 'Arequipa Centro';
            this.product.location.country = this.product.location.country || 'Perú';
        }

        try {
            console.log('🗺️ Inicializando Leaflet Map con coordenadas:', this.product.location);

            // Remover mapa anterior si existe
            if (this.map) {
                this.map.remove();
                this.map = null;
            }

            const coords = [this.product.location.lat, this.product.location.lng];

            // Crear nuevo mapa con opciones mejoradas
            this.map = L.map('map', {
                center: coords,
                zoom: 14,
                zoomControl: true,
                scrollWheelZoom: false,
                doubleClickZoom: true,
                attributionControl: true,
                preferCanvas: true
            });

            console.log('🗺️ Leaflet Map creado, agregando tile layer...');

            // Agregar capa de mapa (OpenStreetMap)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
                minZoom: 1,
                crossOrigin: true
            }).addTo(this.map);

            console.log('🗺️ Tile layer agregado, creando marcador...');

            // Información del marcador
            const locationText = this.product.location.city && this.product.location.country
                ? `${this.product.location.city}, ${this.product.location.country}`
                : 'Arequipa, Perú';

            const sellerName = this.product.seller && this.product.seller.name ? this.product.seller.name : 'Vendedor';
            const productTitle = this.product.title || 'Producto';

            // Crear marcador rojo personalizado
            const redIcon = L.icon({
                iconUrl: 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41"><path d="M12.5 0C7.3 0 3 4.3 3 9.5c0 7.6 9.5 31 9.5 31s9.5-23.4 9.5-31C22 4.3 17.7 0 12.5 0z" fill="%23ef4444"/></svg>',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });

            const marker = L.marker(coords, {
                icon: redIcon,
                title: sellerName
            }).addTo(this.map);

            // Crear popup
            const popupContent = `
                <div style="min-width: 200px; font-family: Inter, sans-serif;">
                    <div style="font-weight: bold; color: #1a1a1a; margin-bottom: 6px; font-size: 14px;">${sellerName}</div>
                    <div style="font-size: 13px; color: #555; margin-bottom: 4px;">📍 ${locationText}</div>
                    <div style="font-size: 12px; color: #888; border-top: 1px solid #ddd; padding-top: 6px; margin-top: 6px;">${productTitle}</div>
                </div>
            `;

            marker.bindPopup(popupContent, {
                closeButton: true,
                maxWidth: 300,
                autoClose: false,
                className: 'leaflet-popup-custom'
            }).openPopup();

            // Forzar recalcular tamaño del mapa después de renderizar
            setTimeout(() => {
                console.log('🗺️ Invalidando tamaño del mapa...');
                if (this.map) {
                    this.map.invalidateSize(true);
                    console.log('🗺️ Mapa redimensionado');
                }
            }, 200);

            console.log('✅ Mapa inicializado correctamente');
        } catch (e) {
            console.error('❌ Error al inicializar mapa:', e);
            if (mapElement) {
                mapElement.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444; font-size: 12px;">⚠️ Error cargando mapa: ${e.message}</div>`;
            }
        }
    }
}

// Inicializar cuando el DOM esté listo
function initChat() {
    console.log('🔄 Iniciando ChatVendedor...');

    // Verificar que Leaflet está disponible
    if (typeof L === 'undefined') {
        console.warn('⚠️ Leaflet aún no está cargado, esperando...');
        // Reintentar en 100ms
        setTimeout(initChat, 100);
        return;
    }

    // Verificar que formatCurrency está disponible
    if (typeof window.formatCurrency === 'undefined') {
        console.warn('⚠️ formatCurrency no está disponible, pero continuando...');
    }

    try {
        console.log('✓ Iniciando ChatVendedor con Leaflet disponible');
        new ChatVendedor();
    } catch (e) {
        console.error('❌ Error al inicializar ChatVendedor:', e);
        const container = document.getElementById('messages-container');
        if (container) {
            container.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initChat, 100);
    });
} else {
    setTimeout(initChat, 100);
}
