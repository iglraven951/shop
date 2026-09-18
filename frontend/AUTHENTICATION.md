# Sistema de Autenticación DiscoveryShop

## 📋 Descripción General

Sistema profesional de autenticación y gestión de sesiones para DiscoveryShop Marketplace. Incluye:

- ✅ Página de Login con validación
- ✅ Página de Registro con requisitos de seguridad
- ✅ Gestión de Perfil de Usuario
- ✅ Persistencia de Sesión (cookies)
- ✅ Autenticación JWT
- ✅ Interfaz en Español 100%
- ✅ Diseño Responsivo
- ✅ Modo Oscuro

## 🏗️ Estructura de Archivos

```
frontend/
├── pages/
│   ├── login.html          # Página de login
│   ├── register.html       # Página de registro
│   └── profile.html        # Página de perfil
├── js/
│   ├── auth.js             # Sistema core de autenticación
│   └── pages/
│       ├── login.js        # Lógica de login
│       ├── register.js     # Lógica de registro
│       └── profile.js      # Lógica de perfil
└── css/
    ├── auth.css            # Estilos de autenticación
    └── profile.css         # Estilos de perfil
```

## 🔐 API Endpoints

### Autenticación

#### POST `/api/auth/register`
Registrar nuevo usuario.

**Request:**
```json
{
  "email": "usuario@example.com",
  "username": "usuario123",
  "password": "SecurePass123!",
  "full_name": "Juan Pérez García"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": "uuid-string",
    "email": "usuario@example.com",
    "username": "usuario123",
    "full_name": "Juan Pérez García",
    "is_seller": false,
    "is_buyer": true,
    "created_at": "2026-09-17T10:30:00Z"
  }
}
```

#### POST `/api/auth/login`
Iniciar sesión.

**Request:**
```json
{
  "email": "usuario@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {...}
}
```

#### POST `/api/auth/logout`
Cerrar sesión (requiere token).

#### POST `/api/auth/change-password`
Cambiar contraseña (requiere token).

**Request:**
```json
{
  "old_password": "OldPassword123!",
  "new_password": "NewPassword456!"
}
```

#### POST `/api/users/become-vendor`
Convertir usuario a vendedor (requiere token).

#### GET `/api/users/me`
Obtener datos del usuario actual (requiere token).

## 🎯 Uso del Sistema

### AuthSystem - API Principal

```javascript
// Inicializar
AuthSystem.init();

// Login
const result = await AuthSystem.login(email, password, rememberMe);
if (result.success) {
  console.log('Login exitoso:', result.user);
}

// Registro
const result = await AuthSystem.register({
  email: 'usuario@example.com',
  username: 'usuario123',
  password: 'SecurePass123!',
  fullName: 'Juan Pérez'
});

// Logout
await AuthSystem.logout();

// Obtener usuario actual
const user = AuthSystem.getUser();

// Verificar si está autenticado
if (AuthSystem.isAuthenticated()) {
  // Hacer algo
}

// Obtener token JWT
const token = AuthSystem.getToken();

// Cambiar contraseña
const result = await AuthSystem.changePassword(oldPassword, newPassword);

// Convertirse en vendedor
const result = await AuthSystem.becomeVendor();

// Obtener historial de compras
const purchases = await AuthSystem.getPurchaseHistory(limit, offset);

// Obtener productos del vendedor
const products = await AuthSystem.getVendorProducts(limit, offset);

// Mostrar notificación
AuthSystem.showNotification('Mensaje', 'success'); // success, error, info, warning
```

## 🔒 Seguridad

### Almacenamiento de Token

- **Con "Recordarme"**: Se guarda en `localStorage` con expiración de 30 días
- **Sin "Recordarme"**: Se guarda en `sessionStorage` (se limpia al cerrar navegador)

### Requisitos de Contraseña

```
✓ Mínimo 8 caracteres
✓ Incluir mayúscula (A-Z)
✓ Incluir número (0-9)
✓ Incluir carácter especial (!@#$%^&*)
```

### Validación en Cliente

- Email válido (formato RFC)
- Username alfanumérico + guiones (3-20 caracteres)
- Contraseñas coincidentes
- Términos aceptados

## 📱 Páginas

### Login (`/pages/login.html`)

Características:
- ✅ Validación en tiempo real
- ✅ Toggle de contraseña
- ✅ Recordarme
- ✅ Link a registro
- ✅ Link a recuperación de contraseña
- ✅ Info de desarrollo (modo debug)

### Registro (`/pages/register.html`)

Características:
- ✅ Validación de nombre
- ✅ Validación de email
- ✅ Validación de username
- ✅ Validación de contraseña con barra de fortaleza
- ✅ Confirmación de contraseña
- ✅ Aceptación de términos
- ✅ Opción de newsletter
- ✅ Link a login

### Perfil (`/pages/profile.html`)

Tabs disponibles:

#### 👤 Información Personal
- Ver/editar nombre completo
- Ver/editar email
- Ver estado de cuenta
- Fecha de registro
- Convertirse a vendedor (botón)

#### 🛒 Mis Compras
- Historial de compras del usuario
- Estado de cada orden
- Detalles de compra
- Total de compra

#### 📦 Mis Productos (Solo Vendedores)
- Lista de productos publicados
- Editar/eliminar productos
- Agregar nuevo producto

#### 🎯 Configuración de Vendedor (Solo Vendedores)
- Estado de verificación
- Información de comisión
- Detalles de la tienda

#### ⚙️ Configuración
- 🔒 Seguridad: Cambiar contraseña, 2FA
- 🔐 Privacidad: Perfil público, mostrar compras
- 🔔 Notificaciones: Actualizaciones, ofertas
- ⚠️ Zona de Peligro: Descargar datos, eliminar cuenta

## 🎨 Diseño y Estilo

### Colores (Light/Dark)

```css
--primary: #3b82f6 (Azul)
--success: #10b981 (Verde)
--danger: #ef4444 (Rojo)
--warning: #f59e0b (Ámbar)
--secondary: #6b7280 (Gris)
```

### Tipografía

- **Sistema**: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto
- **Títulos**: 700 (Bold)
- **Texto**: 400 (Regular)
- **Pequeño**: 13-14px

### Espaciado (8px Grid)

- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

## 📊 Estados del Formulario

### Login

```
Vacío → Validación en Blur → Submitiendo → Éxito/Error
```

### Registro

```
Vacío → Validación Real-time → Barra de Fortaleza → Submitiendo → Éxito/Error
```

## 🔄 Flujo de Autenticación

```
Usuario entra a /pages/login.html
  ↓
1. Verificar si ya está autenticado
   - Si SÍ → Redirigir a /pages/profile.html
   - Si NO → Mostrar formulario
  ↓
2. Usuario ingresa email y contraseña
  ↓
3. Validar campos en cliente
  ↓
4. Enviar POST a /api/auth/login
  ↓
5. Si éxito → Guardar token y usuario en localStorage
  ↓
6. Mostrar notificación de éxito
  ↓
7. Redirigir a /pages/profile.html
```

## 🧪 Testing

### URLs de Prueba (Modo Desarrollo)

```
Email: test@example.com
Contraseña: password123
Username: testuser
```

### Casos de Prueba

1. **Login Exitoso**
   - Email y contraseña válidos
   - Verificar redirección a perfil
   - Verificar token guardado

2. **Login Fallido**
   - Email inválido
   - Contraseña incorrecta
   - Verificar mensajes de error

3. **Registro Exitoso**
   - Todos los campos válidos
   - Verificar redirección a perfil
   - Verificar usuario creado

4. **Registro Fallido**
   - Email duplicado
   - Username duplicado
   - Contraseña débil
   - Campos vacíos

5. **Persistencia de Sesión**
   - Login sin "Recordarme" → Logout al cerrar navegador
   - Login con "Recordarme" → Mantener sesión

## 🐛 Debugging

Activar modo debug:

```javascript
// En cualquier página
localStorage.setItem('debug_auth', 'true');
```

Esto mostrará:
- Información de sesión en consola
- Info de desarrollo en login.html

## 📝 Notas Importantes

1. **CORS**: Asegúrate de que el backend permite solicitudes desde `http://localhost:5000`
2. **JWT**: El token se envía en header `Authorization: Bearer <token>`
3. **HttpOnly**: Considera mover tokens a cookies HttpOnly en producción
4. **HTTPS**: Usar HTTPS en producción
5. **CSRF**: Implementar protección CSRF si es necesario

## 🔄 Próximas Funcionalidades

- [ ] Recuperación de contraseña
- [ ] Autenticación de dos factores (2FA)
- [ ] Login con Google/GitHub
- [ ] Verificación de email
- [ ] Cambio de email
- [ ] Gestión de dispositivos
- [ ] Historial de acceso

## 📞 Soporte

Para problemas:

1. Verificar consola del navegador (F12)
2. Revisar logs del servidor
3. Verificar configuración de CORS
4. Validar endpoints de API

---

**Última actualización:** 17 de Septiembre de 2026
**Agente:** AGENTE FRONTEND 2 - Sistema de Autenticación
