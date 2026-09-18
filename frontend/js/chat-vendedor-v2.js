/**
 * Chat con Vendedor v2
 * Chat limpio sin mapas, con respuestas tipo IA
 */

class ChatVendedor {
    constructor() {
        this.productId = new URLSearchParams(window.location.search).get('product');
        this.product = null;
        this.messages = [];
        this.isLoading = false;

        this.init();
    }

    async init() {
        console.log('🚀 Inicializando ChatVendedor v2...');

        if (!this.productId) {
            console.error('❌ No hay ID de producto');
            window.location.href = '/';
            return;
        }

        // Cargar producto
        console.log(`📦 Cargando producto ${this.productId}...`);
        await this.cargarProducto();

        // Setup eventos
        console.log('⚙️ Configurando event listeners...');
        this.setupEventListeners();

        // Mostrar producto
        this.mostrarProducto();

        // Mensaje de bienvenida
        console.log('💬 Mostrando mensaje de bienvenida...');
        this.mostrarMensajeBienvenida();

        console.log('✅ ChatVendedor inicializado correctamente');
    }

    async cargarProducto() {
        try {
            const response = await fetch(`/api/products/${this.productId}`);
            const data = await response.json();

            if (data.success && data.data) {
                this.product = data.data;
                console.log('✓ Producto cargado:', this.product);
            } else {
                throw new Error('Producto no encontrado');
            }
        } catch (e) {
            console.error('❌ Error al cargar producto:', e);
            const container = document.getElementById('messages-container');
            if (container) {
                container.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444;">❌ Error: ${e.message}</div>`;
            }
        }
    }

    mostrarProducto() {
        if (!this.product) return;

        try {
            // Header
            if (this.product.seller?.name) {
                document.getElementById('seller-name').textContent = this.product.seller.name;
            }
            if (this.product.location?.city) {
                document.getElementById('seller-location').textContent = `📍 ${this.product.location.city}`;
            }
            if (this.product.seller?.rating) {
                document.getElementById('seller-rating').textContent = `⭐ ${this.product.seller.rating.toFixed(1)}`;
            }
            if (this.product.seller?.total_sales) {
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
            if (this.product.seller?.name) {
                document.getElementById('vendor-name').textContent = this.product.seller.name;
                if (this.product.seller.rating) {
                    document.getElementById('vendor-rating-detail').textContent =
                        `⭐ ${this.product.seller.rating.toFixed(1)} (${this.product.seller.total_sales || 0} ventas)`;
                }
            }
            if (this.product.location?.city && this.product.location?.country) {
                document.getElementById('vendor-location-detail').textContent =
                    `📍 ${this.product.location.city}, ${this.product.location.country}`;
            }
            if (this.product.seller?.username) {
                document.getElementById('vendor-username').textContent = `@${this.product.seller.username}`;
            }
        } catch (e) {
            console.error('❌ Error al mostrar producto:', e);
        }
    }

    setupEventListeners() {
        // Botón volver
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.style.cursor = 'pointer';
        }

        // Chat input
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !this.isLoading) {
                    e.preventDefault();
                    this.enviarMensaje();
                }
            });
        }

        // Send button
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                if (!this.isLoading) {
                    this.enviarMensaje();
                }
            });
        }
    }

    mostrarMensajeBienvenida() {
        const container = document.getElementById('messages-container');

        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = 'message vendor';
        welcomeMsg.innerHTML = `
            <div class="message-bubble">
                ¡Hola! 👋 Soy ${this.product.seller.name}. Estoy aquí para ayudarte con cualquier pregunta sobre <strong>${this.product.title}</strong>. ¿Qué te gustaría saber?
            </div>
            <span class="message-time">Ahora</span>
        `;
        container.appendChild(welcomeMsg);
    }

    enviarMensaje() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message || this.isLoading) return;

        const container = document.getElementById('messages-container');

        // Mensaje del usuario
        const userMsg = document.createElement('div');
        userMsg.className = 'message user';
        userMsg.innerHTML = `
            <span class="message-time">Ahora</span>
            <div class="message-bubble">${this.escaparHTML(message)}</div>
        `;
        container.appendChild(userMsg);

        input.value = '';
        container.scrollTop = container.scrollHeight;

        // Mostrar indicador de escritura
        this.isLoading = true;
        const typingMsg = document.createElement('div');
        typingMsg.className = 'message vendor typing';
        typingMsg.id = 'typing-indicator';
        typingMsg.innerHTML = `
            <div class="message-bubble">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
        `;
        container.appendChild(typingMsg);
        container.scrollTop = container.scrollHeight;

        // Simular respuesta después de 1-2 segundos
        setTimeout(() => {
            const typingEl = document.getElementById('typing-indicator');
            if (typingEl) typingEl.remove();

            const responses = this.generarRespuesta(message);

            const vendorMsg = document.createElement('div');
            vendorMsg.className = 'message vendor';
            vendorMsg.innerHTML = `
                <div class="message-bubble">${responses}</div>
                <span class="message-time">Ahora</span>
            `;
            container.appendChild(vendorMsg);
            container.scrollTop = container.scrollHeight;

            this.isLoading = false;
        }, 800 + Math.random() * 1200);
    }

    generarRespuesta(mensaje) {
        const mensajeLower = mensaje.toLowerCase();

        // Respuestas basadas en palabras clave
        if (mensajeLower.includes('precio') || mensajeLower.includes('costo')) {
            return `El precio es ${formatCurrency(this.product.price)}. Es un precio muy competitivo para la calidad que ofrece este producto. ¿Te interesa?`;
        }

        if (mensajeLower.includes('estado') || mensajeLower.includes('condición')) {
            return `El producto está en ${this.product.description.substring(0, 30)}... Está en excelentes condiciones, casi como nuevo. ¿Tienes más preguntas?`;
        }

        if (mensajeLower.includes('entreg') || mensajeLower.includes('envío')) {
            return `Puedo hacer entrega en la zona de ${this.product.location?.city || 'Arequipa'} sin problema. ¿Cuándo te vendría bien recibirlo?`;
        }

        if (mensajeLower.includes('stock') || mensajeLower.includes('disponib')) {
            return `Tengo ${this.product.stock} unidades disponibles en este momento. ¿Te gustaría reservar una?`;
        }

        if (mensajeLower.includes('hola') || mensajeLower.includes('hi')) {
            return `¡Hola! 👋 Estoy aquí para ayudarte. Puedo responder preguntas sobre el precio, estado, entrega y más. ¿Qué necesitas saber?`;
        }

        if (mensajeLower.includes('gracias') || mensajeLower.includes('thanks')) {
            return `¡De nada! 😊 Si tienes más preguntas, no dudes en escribir. Estoy disponible para ayudarte.`;
        }

        // Respuestas generales
        const respuestasGenerales = [
            `Excelente pregunta. El producto tiene ${this.product.stock} unidades disponibles y está en perfectas condiciones. ¿Algo más que quieras saber?`,
            `Claro, puedo ayudarte con eso. Tenemos disponibilidad y puedo coordinar la entrega en ${this.product.location?.city || 'tu zona'}. ¿Cuándo te vendría bien?`,
            `Sí, totalmente. Este producto tiene muy buenas características. ¿Te interesa conocer más detalles específicos?`,
            `Buena observación. Este artículo ha tenido muy buena recepción. ¿Te gustaría que continúe con tu pregunta anterior?`,
            `Entiendo tu punto. Puedo resolver eso directamente contigo. ¿Necesitas algo más?`,
            `Perfecto, puedo ayudarte con eso. Soy bastante flexible con las condiciones. ¿Qué necesitas específicamente?`
        ];

        return respuestasGenerales[Math.floor(Math.random() * respuestasGenerales.length)];
    }

    escaparHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Esperar a que formatCurrency esté disponible
        const checkFormatCurrency = setInterval(() => {
            if (typeof formatCurrency === 'function') {
                clearInterval(checkFormatCurrency);
                window.chatVendedor = new ChatVendedor();
            }
        }, 50);
    });
} else {
    // Si ya está listo
    if (typeof formatCurrency === 'function') {
        window.chatVendedor = new ChatVendedor();
    } else {
        const checkFormatCurrency = setInterval(() => {
            if (typeof formatCurrency === 'function') {
                clearInterval(checkFormatCurrency);
                window.chatVendedor = new ChatVendedor();
            }
        }, 50);
    }
}
