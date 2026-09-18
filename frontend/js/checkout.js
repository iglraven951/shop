/**
 * Checkout - Payment Processing Module
 *
 * Gestiona el flujo completo de checkout:
 * - Validación de datos de envío
 * - Selección de método de pago
 * - Procesamiento de órdenes
 * - Confirmación de compra
 */

import { Config, ApiEndpoints } from './config.js';

class CheckoutManager {
    constructor() {
        this.currentStep = 1;
        this.maxSteps = 4;
        this.shippingData = {
            address: '',
            city: '',
            state: '',
            zipCode: '',
            phone: ''
        };
        this.paymentMethod = null;
        this.cartItems = [];
        this.totalAmount = 0;
    }

    /**
     * Inicializar el checkout
     */
    async init() {
        await this.cargarCarrito();
        this.renderizarResumen();
    }

    /**
     * Cargar datos del carrito
     */
    async cargarCarrito() {
        try {
            const response = await Config.fetch(ApiEndpoints.cart.get);

            if (response.success && response.data.items) {
                this.cartItems = response.data.items;
                this.totalAmount = this.cartItems.reduce(
                    (sum, item) => sum + (item.quantity * parseFloat(item.price)),
                    0
                );
            } else {
                throw new Error('Carrito vacío');
            }
        } catch (error) {
            console.error('Error cargando carrito:', error);
            window.location.href = '/pages/carrito.html';
        }
    }

    /**
     * Renderizar resumen del carrito
     */
    renderizarResumen() {
        const container = document.getElementById('ordenes-resumen');
        if (!container || this.cartItems.length === 0) return;

        const itemsHtml = this.cartItems.map(item => `
            <div class="ordenes-item">
                <div class="ordenes-item-imagen">
                    <img src="${item.image_url || '/placeholder.jpg'}" alt="${item.product_title}" onerror="this.src='/placeholder.jpg'">
                </div>
                <div class="ordenes-item-info">
                    <div class="ordenes-item-titulo">${item.product_title}</div>
                    <div class="ordenes-item-precio">
                        ${item.quantity} x S/ ${parseFloat(item.price).toFixed(2)} = S/ ${(item.quantity * parseFloat(item.price)).toFixed(2)}
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = itemsHtml + `
            <div class="ordenes-totales">
                <div class="totales-fila">
                    <span>Subtotal</span>
                    <span>S/ ${this.totalAmount.toFixed(2)}</span>
                </div>
                <div class="totales-fila">
                    <span>Envío</span>
                    <span>S/ 0.00</span>
                </div>
                <div class="totales-fila total">
                    <span>Total</span>
                    <span>S/ ${this.totalAmount.toFixed(2)}</span>
                </div>
            </div>
        `;
    }

    /**
     * Avanzar al siguiente paso
     */
    irAlSiguiente() {
        // Validar paso actual
        if (!this.validarPasoActual()) {
            return false;
        }

        if (this.currentStep < this.maxSteps) {
            this.currentStep++;
            this.actualizarUI();
            return true;
        } else if (this.currentStep === this.maxSteps) {
            // En el último paso, procesar la orden
            this.procesarOrden();
            return true;
        }

        return false;
    }

    /**
     * Retroceder al paso anterior
     */
    irAlAnterior() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.actualizarUI();
            return true;
        }
        return false;
    }

    /**
     * Validar datos del paso actual
     */
    validarPasoActual() {
        switch (this.currentStep) {
            case 1:
                // Paso 1: Validar carrito (siempre válido si llegamos aquí)
                return this.cartItems.length > 0;

            case 2:
                // Paso 2: Validar datos de envío
                return this.validarEnvio();

            case 3:
                // Paso 3: Validar método de pago
                return this.paymentMethod !== null;

            default:
                return false;
        }
    }

    /**
     * Validar datos de envío
     */
    validarEnvio() {
        const form = document.getElementById('shipping-form');
        if (!form) return false;

        const address = document.getElementById('address')?.value?.trim();
        const city = document.getElementById('city')?.value?.trim();
        const state = document.getElementById('state')?.value?.trim();
        const zip = document.getElementById('zip')?.value?.trim();
        const phone = document.getElementById('phone')?.value?.trim();

        // Validaciones
        if (!address || address.length < 5) {
            this.mostrarError('Dirección válida requerida (mínimo 5 caracteres)');
            return false;
        }

        if (!city || city.length < 2) {
            this.mostrarError('Ciudad requerida');
            return false;
        }

        if (!state || state.length < 2) {
            this.mostrarError('Estado/Región requerido');
            return false;
        }

        if (!zip || zip.length < 3) {
            this.mostrarError('Código postal válido requerido');
            return false;
        }

        if (!phone || phone.length < 7) {
            this.mostrarError('Teléfono válido requerido');
            return false;
        }

        // Guardar datos
        this.shippingData = {
            address,
            city,
            state,
            zipCode: zip,
            phone
        };

        this.limpiarError();
        return true;
    }

    /**
     * Seleccionar método de pago
     */
    seleccionarMetodoPago(metodo) {
        this.paymentMethod = metodo;

        // Actualizar UI
        document.querySelectorAll('.payment-method').forEach(el => {
            el.classList.remove('selected');
        });

        event.currentTarget.classList.add('selected');

        // Mostrar detalles de pago
        this.mostrarDetallesPago(metodo);
    }

    /**
     * Mostrar detalles según el método de pago
     */
    mostrarDetallesPago(metodo) {
        const container = document.getElementById('payment-details');
        if (!container) return;

        switch (metodo) {
            case 'card':
                container.innerHTML = `
                    <div class="form-group">
                        <label for="card-number">Número de Tarjeta</label>
                        <input type="text" id="card-number" placeholder="1234 5678 9012 3456" maxlength="19">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="card-exp">Vencimiento</label>
                            <input type="text" id="card-exp" placeholder="MM/YY" maxlength="5">
                        </div>
                        <div class="form-group">
                            <label for="card-cvv">CVV</label>
                            <input type="text" id="card-cvv" placeholder="123" maxlength="4">
                        </div>
                    </div>
                `;
                break;

            case 'transfer':
                container.innerHTML = `
                    <div style="background: var(--bg-primary); padding: 16px; border-radius: 4px; margin-top: 16px;">
                        <p><strong>Instrucciones de Transferencia:</strong></p>
                        <p>Banco: Banco Nacional</p>
                        <p>Cuenta: 1234567890</p>
                        <p>Titular: DiscoveryShop Inc.</p>
                        <p style="margin-top: 16px; color: var(--text-secondary); font-size: 12px;">
                            Tu pedido será confirmado una vez recibamos la transferencia
                        </p>
                    </div>
                `;
                break;

            case 'cash':
                container.innerHTML = `
                    <div style="background: var(--bg-primary); padding: 16px; border-radius: 4px; margin-top: 16px;">
                        <p><strong>Pago contra entrega</strong></p>
                        <p>Pagarás al recibir tu pedido en 3-5 días hábiles.</p>
                    </div>
                `;
                break;

            default:
                container.innerHTML = '';
        }
    }

    /**
     * Procesar la orden
     */
    async procesarOrden() {
        try {
            this.limpiarError();

            // Construir payload de la orden
            const payload = {
                shipping_address: this.shippingData.address,
                city: this.shippingData.city,
                state: this.shippingData.state,
                zip_code: this.shippingData.zipCode,
                phone: this.shippingData.phone,
                payment_method: this.paymentMethod
            };

            // Enviar al backend
            const response = await Config.fetch('/api/orders/checkout', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok && !response.success) {
                const data = await response.json ? response.json() : response;
                throw new Error(data.message || 'Error procesando la orden');
            }

            const data = response.success ? response : await response.json();

            if (data.success || data.data?.order_id) {
                // Mostrar confirmación
                this.mostrarConfirmacion(data.data?.order_id);

                // Limpiar carrito
                await this.limpiarCarritoBackend();

                // Avanzar al paso de confirmación
                this.currentStep = this.maxSteps;
                this.actualizarUI();

                return true;
            } else {
                throw new Error(data.message || 'Error procesando la orden');
            }
        } catch (error) {
            console.error('Error procesando orden:', error);
            this.mostrarError(error.message || 'Error procesando la orden');
            return false;
        }
    }

    /**
     * Limpiar carrito en el backend
     */
    async limpiarCarritoBackend() {
        try {
            await Config.fetch(ApiEndpoints.cart.clear, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Error limpiando carrito:', error);
        }
    }

    /**
     * Mostrar confirmación de orden
     */
    mostrarConfirmacion(ordenId) {
        const container = document.getElementById('confirmation-message');
        if (!container) return;

        container.innerHTML = `
            <div class="confirmation-icon">✅</div>
            <h3>¡Pedido Confirmado!</h3>
            <p>Tu pedido ha sido recibido y está siendo procesado.</p>
            <div class="confirmation-number">${ordenId}</div>
            <p>Se te ha enviado un correo de confirmación con los detalles de tu pedido.</p>
            <p style="margin-top: 24px;">
                <button onclick="window.location.href = '/pages/ordenes.html'" style="background: var(--primary-color); color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer;">
                    Ver Mis Órdenes
                </button>
            </p>
        `;
    }

    /**
     * Actualizar UI de pasos
     */
    actualizarUI() {
        // Actualizar indicadores de paso
        document.querySelectorAll('.step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');

            if (stepNum < this.currentStep) {
                step.classList.add('completed');
            } else if (stepNum === this.currentStep) {
                step.classList.add('active');
            }
        });

        // Actualizar contenido
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
            if (parseInt(content.dataset.step) === this.currentStep) {
                content.classList.add('active');
            }
        });

        // Actualizar botones
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        if (this.currentStep === 1) {
            btnPrev.style.display = 'none';
            btnNext.textContent = 'Siguiente';
        } else if (this.currentStep === this.maxSteps) {
            btnPrev.style.display = 'block';
            btnNext.style.display = 'none';
        } else {
            btnPrev.style.display = 'block';
            btnNext.textContent = 'Siguiente';
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /**
     * Mostrar mensaje de error
     */
    mostrarError(mensaje) {
        const container = document.getElementById('error-container');
        if (!container) return;

        container.innerHTML = `<div class="error-message">${mensaje}</div>`;
    }

    /**
     * Limpiar mensaje de error
     */
    limpiarError() {
        const container = document.getElementById('error-container');
        if (container) {
            container.innerHTML = '';
        }
    }
}

// Exportar como módulo
export default CheckoutManager;

// También disponible globalmente
if (typeof window !== 'undefined') {
    window.CheckoutManager = CheckoutManager;
}
