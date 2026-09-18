/**
 * Carrito - Shopping Cart Management Module
 *
 * Gestiona todas las operaciones del carrito de compras:
 * - Agregar/eliminar productos
 * - Actualizar cantidades
 * - Sincronizar con backend
 * - Persistencia local
 */

import { Config, ApiEndpoints } from './config.js';

class CarritoManager {
    constructor() {
        this.items = [];
        this.descuento = 0;
        this.envio = 0;
        this.storageKey = 'discoveryshop_carrito';
        this.init();
    }

    /**
     * Inicializar el carrito
     */
    async init() {
        const user = Config.getUser();

        if (user) {
            // Usuario autenticado - cargar del backend
            await this.cargarDelBackend();
        } else {
            // Usuario anónimo - cargar del localStorage
            this.cargarLocal();
        }
    }

    /**
     * Cargar carrito desde el backend
     */
    async cargarDelBackend() {
        try {
            const response = await Config.fetch(ApiEndpoints.cart.get);

            if (response.success && response.data && response.data.items) {
                this.items = response.data.items.map(item => ({
                    productId: item.product_id,
                    titulo: item.product_title,
                    precio: parseFloat(item.price),
                    cantidad: item.quantity,
                    imagen: item.image_url
                }));

                // Guardar también en localStorage para sincronización
                this.guardarLocal();
            }
        } catch (error) {
            console.error('Error cargando carrito del backend:', error);
            this.cargarLocal();
        }
    }

    /**
     * Cargar carrito desde localStorage
     */
    cargarLocal() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                this.items = JSON.parse(data);
            } else {
                this.items = [];
            }
        } catch (error) {
            console.error('Error cargando carrito local:', error);
            this.items = [];
        }
    }

    /**
     * Guardar carrito en localStorage
     */
    guardarLocal() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.items));
        } catch (error) {
            console.error('Error guardando carrito local:', error);
        }
    }

    /**
     * Agregar producto al carrito
     */
    async agregarProducto(productId, titulo, precio, imagen = null) {
        const user = Config.getUser();

        try {
            if (user) {
                // Agregar al backend
                const response = await Config.fetch(ApiEndpoints.cart.add, {
                    method: 'POST',
                    body: JSON.stringify({
                        product_id: productId,
                        quantity: 1
                    })
                });

                if (response.success && response.data && response.data.items) {
                    this.items = response.data.items.map(item => ({
                        productId: item.product_id,
                        titulo: item.product_title,
                        precio: parseFloat(item.price),
                        cantidad: item.quantity,
                        imagen: item.image_url
                    }));

                    this.guardarLocal();
                    this.emitirCambio();
                    return true;
                }
            } else {
                // Agregar localmente
                const itemExistente = this.items.find(i => i.productId === productId);

                if (itemExistente) {
                    itemExistente.cantidad++;
                } else {
                    this.items.push({
                        productId,
                        titulo,
                        precio,
                        cantidad: 1,
                        imagen
                    });
                }

                this.guardarLocal();
                this.emitirCambio();
                return true;
            }
        } catch (error) {
            console.error('Error agregando producto:', error);
            return false;
        }
    }

    /**
     * Eliminar producto del carrito
     */
    async eliminarProducto(productId) {
        const user = Config.getUser();

        try {
            if (user) {
                // Eliminar del backend
                const response = await Config.fetch(
                    ApiEndpoints.cart.remove(productId),
                    { method: 'DELETE' }
                );

                if (response.success) {
                    this.items = this.items.filter(i => i.productId !== productId);
                    this.guardarLocal();
                    this.emitirCambio();
                    return true;
                }
            } else {
                // Eliminar localmente
                this.items = this.items.filter(i => i.productId !== productId);
                this.guardarLocal();
                this.emitirCambio();
                return true;
            }
        } catch (error) {
            console.error('Error eliminando producto:', error);
            return false;
        }
    }

    /**
     * Actualizar cantidad de un producto
     */
    async actualizarCantidad(productId, cantidad) {
        if (cantidad < 1) return false;

        const user = Config.getUser();

        try {
            if (user) {
                // Actualizar en backend
                const response = await Config.fetch(
                    ApiEndpoints.cart.remove(productId).replace('/items/', '').replace(productId, `items/${productId}`),
                    {
                        method: 'PUT',
                        body: JSON.stringify({ quantity: cantidad })
                    }
                );

                if (response.success) {
                    const item = this.items.find(i => i.productId === productId);
                    if (item) item.cantidad = cantidad;
                    this.guardarLocal();
                    this.emitirCambio();
                    return true;
                }
            } else {
                // Actualizar localmente
                const item = this.items.find(i => i.productId === productId);
                if (item) {
                    item.cantidad = cantidad;
                    this.guardarLocal();
                    this.emitirCambio();
                    return true;
                }
            }
        } catch (error) {
            console.error('Error actualizando cantidad:', error);
            return false;
        }
    }

    /**
     * Limpiar el carrito
     */
    async limpiarCarrito() {
        const user = Config.getUser();

        try {
            if (user) {
                // Limpiar en backend
                const response = await Config.fetch(
                    ApiEndpoints.cart.clear,
                    { method: 'POST' }
                );

                if (response.success) {
                    this.items = [];
                    this.guardarLocal();
                    this.emitirCambio();
                    return true;
                }
            } else {
                // Limpiar localmente
                this.items = [];
                this.guardarLocal();
                this.emitirCambio();
                return true;
            }
        } catch (error) {
            console.error('Error limpiando carrito:', error);
            return false;
        }
    }

    /**
     * Obtener cantidad total de items
     */
    obtenerCantidadTotal() {
        return this.items.reduce((sum, item) => sum + item.cantidad, 0);
    }

    /**
     * Obtener subtotal
     */
    obtenerSubtotal() {
        return this.items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    }

    /**
     * Obtener total con envío y descuentos
     */
    obtenerTotal() {
        const subtotal = this.obtenerSubtotal();
        return Math.max(0, subtotal - this.descuento + this.envio);
    }

    /**
     * Aplicar descuento
     */
    aplicarDescuento(monto) {
        this.descuento = Math.max(0, monto);
        this.emitirCambio();
    }

    /**
     * Establecer costo de envío
     */
    establecerEnvio(monto) {
        this.envio = Math.max(0, monto);
        this.emitirCambio();
    }

    /**
     * Emitir evento de cambio
     */
    emitirCambio() {
        const evento = new CustomEvent('carrito-actualizado', {
            detail: {
                items: this.items,
                cantidadTotal: this.obtenerCantidadTotal(),
                subtotal: this.obtenerSubtotal(),
                envio: this.envio,
                descuento: this.descuento,
                total: this.obtenerTotal()
            }
        });

        window.dispatchEvent(evento);
        this.actualizarBadge();
    }

    /**
     * Actualizar badge del carrito en el header
     */
    actualizarBadge() {
        const badge = document.querySelector('.cart-badge');
        const cantidad = this.obtenerCantidadTotal();

        if (badge) {
            if (cantidad > 0) {
                badge.textContent = cantidad;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    /**
     * Obtener los items del carrito
     */
    obtenerItems() {
        return this.items;
    }

    /**
     * Obtener información completa del carrito
     */
    obtenerInfo() {
        return {
            items: this.items,
            cantidadTotal: this.obtenerCantidadTotal(),
            subtotal: this.obtenerSubtotal(),
            envio: this.envio,
            descuento: this.descuento,
            total: this.obtenerTotal()
        };
    }
}

// Exportar como módulo
export default CarritoManager;

// También disponible globalmente
if (typeof window !== 'undefined') {
    window.CarritoManager = CarritoManager;
}
