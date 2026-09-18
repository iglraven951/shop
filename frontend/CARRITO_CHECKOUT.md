# Sistema de Carrito y Checkout - DiscoveryShop

## Descripción General

Sistema completo de carrito de compras y checkout para la plataforma DiscoveryShop. Incluye:

- 📦 Carrito de compras con persistencia local
- 💳 Proceso de checkout multi-paso
- 📋 Historial de órdenes (comprador y vendedor)
- 🏪 Panel de vendedor para gestión de productos

## Archivos Creados

### Páginas HTML

#### 1. **frontend/pages/carrito.html**
Página del carrito de compras con:
- Visualización de productos en el carrito
- Modificación de cantidades
- Eliminación de items
- Cálculo automático de totales
- Opción de aplicar cupones
- Botón para proceder al pago

**Funcionalidades:**
- Carga desde API backend
- Sincronización bidireccional
- Persistencia en localStorage
- Interfaz responsive

---

#### 2. **frontend/pages/checkout.html**
Sistema de checkout con 4 pasos:

**Paso 1: Revisar Pedido**
- Resumen de productos
- Totales y costos
- Verificación de cantidades

**Paso 2: Datos de Envío**
- Dirección completa
- Ciudad, Estado, Código Postal
- Teléfono de contacto
- Validaciones en tiempo real

**Paso 3: Método de Pago**
Tres opciones:
- 💳 Tarjeta de Crédito (datos simulados)
- 🏦 Transferencia Bancaria
- 💵 Contra Entrega

**Paso 4: Confirmación**
- Confirmación exitosa
- Número de orden
- Enlace a mis órdenes

**Características:**
- Navegación entre pasos
- Validación de datos
- Integración con API
- Confirmación visual

---

#### 3. **frontend/pages/ordenes.html**
Gestión completa de órdenes:

**Como Comprador:**
- Visualizar todas mis órdenes
- Filtrar por estado
- Ver detalles de órdenes
- Cancelar órdenes pendientes
- Calificar productos entregados

**Como Vendedor:**
- Visualizar órdenes recibidas
- Filtrar por estado
- Marcar como enviada
- Agregar número de rastreo

**Estados de Orden:**
- ⏳ Pendiente
- ✅ Confirmada
- 📦 Enviada
- 🚚 Entregada
- ❌ Cancelada

---

#### 4. **frontend/pages/mis-productos.html**
Panel de administración para vendedores:

**Funcionalidades:**
- Crear nuevo producto
- Editar productos existentes
- Eliminar productos
- Ver estado de aprobación
- Gestionar imágenes
- Control de stock y precios

**Campos de Producto:**
- Título (255 caracteres)
- Descripción detallada (2000 caracteres)
- Categoría
- Precio y precio original
- Stock disponible
- Ubicación/Ciudad
- Imágenes múltiples

---

### Módulos JavaScript

#### 1. **frontend/js/carrito.js**
Clase `CarritoManager` para gestionar el carrito:

```javascript
import CarritoManager from './carrito.js';

// Uso
const carrito = new CarritoManager();

// Agregar producto
await carrito.agregarProducto(productId, titulo, precio, imagen);

// Obtener información
const info = carrito.obtenerInfo();
// { items, cantidadTotal, subtotal, envio, descuento, total }

// Eventos
window.addEventListener('carrito-actualizado', (event) => {
    console.log(event.detail); // Información actualizada
});
```

**Métodos principales:**
- `agregarProducto(id, titulo, precio, imagen)` - Agregar al carrito
- `eliminarProducto(id)` - Eliminar producto
- `actualizarCantidad(id, cantidad)` - Cambiar cantidad
- `limpiarCarrito()` - Vaciar carrito
- `obtenerInfo()` - Obtener información completa
- `obtenerTotal()` - Calcular total
- `aplicarDescuento(monto)` - Aplicar descuento
- `establecerEnvio(monto)` - Establecer costo de envío

**Sincronización:**
- Con backend si usuario autenticado
- Con localStorage siempre
- Eventos CustomEvent para cambios

---

#### 2. **frontend/js/checkout.js**
Clase `CheckoutManager` para el flujo de pago:

```javascript
import CheckoutManager from './checkout.js';

// Uso
const checkout = new CheckoutManager();
await checkout.init();

// Navegar
checkout.irAlSiguiente();
checkout.irAlAnterior();

// Procesar orden
await checkout.procesarOrden();
```

**Métodos principales:**
- `init()` - Inicializar y cargar carrito
- `irAlSiguiente()` - Avanzar paso
- `irAlAnterior()` - Retroceder paso
- `validarPasoActual()` - Validar datos
- `validarEnvio()` - Validar dirección
- `seleccionarMetodoPago(metodo)` - Elegir pago
- `procesarOrden()` - Procesar compra
- `mostrarError(msg)` - Mostrar errores

---

## Integración con API Backend

### Endpoints Utilizados

```javascript
// Carrito
GET    /api/cart
POST   /api/cart/items                    // Agregar
PUT    /api/cart/items/{id}               // Actualizar cantidad
DELETE /api/cart/items/{id}               // Eliminar
POST   /api/cart/clear                    // Limpiar

// Órdenes
POST   /api/orders/checkout               // Crear orden
GET    /api/orders?role=buyer|seller      // Listar órdenes
GET    /api/orders/{id}                   // Detalle
PUT    /api/orders/{id}/status            // Actualizar estado
POST   /api/orders/{id}/cancel            // Cancelar
POST   /api/orders/{id}/review            // Calificar

// Productos
GET    /api/products
GET    /api/products/{id}
POST   /api/products                      // Crear
PUT    /api/products/{id}                 // Editar
DELETE /api/products/{id}                 // Eliminar
GET    /api/products?role=seller          // Mis productos
```

---

## Configuración y Personalización

### Colores y Estilos

Todas las páginas usan variables CSS personalizables:

```css
/* Variables disponibles */
--primary-color      /* Color principal */
--primary-hover      /* Color hover */
--danger-color       /* Color de peligro */
--success-color      /* Color de éxito */
--bg-primary         /* Fondo primario */
--bg-secondary       /* Fondo secundario */
--bg-tertiary        /* Fondo terciario */
--border-color       /* Color de bordes */
--text-primary       /* Texto principal */
--text-secondary     /* Texto secundario */
```

### Personalización de Métodos de Pago

En `checkout.html`, modificar la sección "payment-methods":

```html
<div class="payment-method" onclick="selectPaymentMethod('tuMetodo')">
    <div class="payment-icon">🎯</div>
    <label class="payment-label">Tu Método</label>
</div>
```

### Personalización de Categorías

En `mis-productos.html`, actualizar select de categorías:

```html
<select id="categoria" name="categoria" required>
    <option value="tu-categoria">Tu Categoría</option>
</select>
```

---

## Flujo de Uso

### Para Compradores

1. **Explorar productos** en página de inicio
2. **Agregar al carrito** desde detalle de producto
3. **Ir al carrito** (/pages/carrito.html)
4. **Revisar y editar** cantidades
5. **Proceder al pago** → Checkout
6. **Completar envío** en paso 2
7. **Seleccionar pago** en paso 3
8. **Confirmar orden** en paso 4
9. **Ver órdenes** en /pages/ordenes.html

### Para Vendedores

1. **Acceder a mis productos** (/pages/mis-productos.html)
2. **Crear nuevo producto** con formulario modal
3. **Cargar imágenes** drag-and-drop
4. **Definir precio y stock**
5. **Esperar aprobación** del admin
6. **Ver órdenes** en modo "vendedor" (/pages/ordenes.html)
7. **Marcar como enviada** cuando se envía
8. **Agregar rastreo** (opcional)

---

## Validaciones

### Carrito
- ✅ Producto debe existir
- ✅ Stock suficiente
- ✅ Cantidad mínima 1
- ✅ Cantidad máxima 999

### Envío
- ✅ Dirección mínimo 5 caracteres
- ✅ Ciudad mínimo 2 caracteres
- ✅ Estado mínimo 2 caracteres
- ✅ Código postal mínimo 3 caracteres
- ✅ Teléfono mínimo 7 caracteres

### Productos
- ✅ Título 5-255 caracteres
- ✅ Descripción 20-2000 caracteres
- ✅ Precio > 0
- ✅ Stock >= 0
- ✅ Categoría requerida

---

## Características Avanzadas

### Persistencia

**LocalStorage:**
- Carrito se guarda localmente siempre
- Sincronización con backend si hay sesión

**Backend:**
- Un carrito por usuario
- Sincronización automática
- Persistencia indefinida

### Validación en Tiempo Real

Todas las formas validan mientras escribes:
- Avisos de campo requerido
- Errores de formato
- Sugerencias de corrección

### Responsivos

Todas las páginas adaptan a:
- 📱 Móvil (< 480px)
- 📱 Tablet (480px - 768px)
- 💻 Desktop (> 768px)

### Internacionalización

Todos los textos están en ESPAÑOL:
- Etiquetas de formulario
- Mensajes de estado
- Errores y confirmaciones
- Nombres de botones

---

## Troubleshooting

### El carrito se vacía al recargar
**Solución:** Verificar que el usuario esté autenticado y el backend responda correctamente a `/api/cart`

### Las órdenes no se guardan
**Solución:** Verificar token JWT en cookies httpOnly y endpoint `/api/orders/checkout`

### Las imágenes no carga
**Solución:** Verificar rutas URL en respuesta de API y que los servidores de imágenes sean accesibles

### Modal no se cierra
**Solución:** Verificar JavaScript en consola (F12) para errores de sintaxis

---

## Ejemplos de Uso

### Agregar botón "Agregar al Carrito" en producto

```html
<button onclick="agregarAlCarrito('${product.id}', '${product.title}', ${product.price})">
    Agregar al Carrito
</button>

<script type="module">
import CarritoManager from '/js/carrito.js';
const carrito = new CarritoManager();

window.agregarAlCarrito = async (id, titulo, precio) => {
    const imagen = document.querySelector('[data-product-image]').src;
    await carrito.agregarProducto(id, titulo, precio, imagen);
    alert('Agregado al carrito!');
};
</script>
```

### Mostrar badge de carrito

```html
<span class="cart-badge" id="cart-badge">0</span>

<script type="module">
import CarritoManager from '/js/carrito.js';
const carrito = new CarritoManager();

window.addEventListener('carrito-actualizado', (event) => {
    document.getElementById('cart-badge').textContent = event.detail.cantidadTotal;
});
</script>
```

---

## Soporte y Contribuciones

Para reportar bugs o sugerir mejoras, contactar al equipo de desarrollo.

**Última actualización:** 2026-09-18
**Versión:** 1.0.0
**Estado:** Producción
