# DiscoveryShop

Foro de artículos de segunda mano de **Arequipa, Perú**. Las publicaciones se leen
como en una red social: se comentan, se guardan, se dice «me interesa» y se escribe
por privado a quien publica.

> **No es una tienda.** No hay carrito, ni pagos, ni pedidos, ni envíos.
> DiscoveryShop solo conecta a las personas; el trato se cierra fuera de la
> plataforma, normalmente viéndose en el distrito acordado.

---

## Ver la página publicada

**https://iglraven951.github.io/shop/**

No hace falta instalar nada ni levantar ningún servidor: la página funciona
completa desde ese enlace, en cualquier navegador moderno.

---

## Cómo funciona sin servidor

No hay backend. Ni API, ni base de datos, ni nada que desplegar: el sitio es
100 % estático (HTML + CSS + JavaScript, sin compilación ni dependencias) y todo
ocurre dentro del navegador.

| Pieza | Qué hace |
|---|---|
| `assets/js/core/seed.js` | El contenido inicial: distritos de Arequipa con coordenadas reales, usuarios con su rol y las publicaciones de ejemplo |
| `assets/js/core/mock-api.js` | Implementa toda la lógica —sesiones, permisos, moderación, reacciones, comentarios, mapa, mensajes— y la guarda en `localStorage` |
| `assets/js/core/api.js` | El único punto por el que las páginas piden datos |

Ninguna página llama directamente a `mock-api.js`: siempre pasan por `api.js`.
Esa separación es la que permite que el sitio se comporte igual publicado en
GitHub Pages, servido en local o abierto directamente desde el disco — y es el
único archivo que habría que tocar si algún día se añade un servidor de verdad.

**Todo funciona de verdad**: registrarte, publicar, que te aprueben, comentar,
guardar y escribir por privado. Lo que cambia respecto a un sitio con servidor es
**dónde** vive eso: en tu navegador, no compartido con otras personas ni con
otros dispositivos. El pie de página lo dice explícitamente.

Si quieres volver al estado inicial, el enlace «Reiniciar datos demo» del pie
restaura el catálogo original y cierra la sesión.

---

## Roles y permisos

| Rol | Qué puede hacer |
|---|---|
| **Visitante** (sin sesión) | Ver el feed, buscar, filtrar, abrir publicaciones y consultar el mapa de vendedores |
| **Comprador** (`role: 'buyer'`) | Todo lo anterior y además: ❤️ me gusta, 🙋 me interesa, 🔖 guardar, 💬 comentar y escribir por privado |
| **Vendedor aprobado** (`seller_status: 'approved'`) | Todo lo anterior y además **publicar artículos** |
| **Administrador** (`role: 'admin'`) | Aprobar o rechazar publicaciones y solicitudes de vendedor |

Al registrarse se elige entre comprador o vendedor. Quien elige vendedor entra
como comprador con la solicitud **en revisión** (`seller_status: 'pending'`) y
**no puede publicar hasta que un administrador la apruebe**; mientras tanto usa
la cuenta con total normalidad. Toda publicación nueva nace también en revisión
y solo aparece en el foro cuando el administrador la aprueba.

---

## Cuentas de prueba

Todas usan la contraseña **`demo1234`**.

| Correo | Rol | Para probar |
|---|---|---|
| `admin@discoveryshop.pe` | Administrador | El panel de moderación: aprobar y rechazar |
| `juan@discoveryshop.pe` | Vendedor aprobado | Publicar un artículo y verlo entrar en revisión |
| `miguel@discoveryshop.pe` | Vendedor en revisión | El aviso de que aún no puede publicar |
| `patricia@discoveryshop.pe` | Comprador | Comentar, guardar y escribir a quien publica |

También puedes crear una cuenta nueva desde `registro.html`: en modo
demostración se guarda en tu navegador.

> ¿Datos de prueba desordenados? En el pie de página, **Reiniciar datos demo**
> restaura el contenido original.

---

## Desarrollo local

No hay nada que instalar ni que compilar.

### Opción A — Servidor estático (recomendada)

```bash
py -m http.server 8080
```

Luego visita **http://localhost:8080**. Es la forma más parecida a cómo se ve
publicado.

> En Windows, `python` a secas abre el instalador de la Microsoft Store y se
> queda colgado. Usa `py`.

### Opción B — Abrir el archivo directamente

Haz doble clic en `index.html`. Funciona igual, aunque el protocolo `file://`
restringe algunas cosas del navegador, así que la opción A es preferible.

---

## Pruebas

Solo necesitan Node 20 o superior; no hay dependencias que instalar.

```bash
node tests/core.test.mjs
node tests/integrity.test.mjs
```

| Archivo | Qué comprueba |
|---|---|
| `tests/core.test.mjs` | El contrato de datos: publicaciones, filtros, sesión, permisos y moderación de `MockAPI` |
| `tests/integrity.test.mjs` | La integridad del sitio: enlaces que resuelven, orden de los scripts, colores desde los tokens, ortografía española y ausencia de restos de depuración |

Las dos se ejecutan también en cada despliegue: si alguna falla, el sitio no se
publica.

---

## Mapa de páginas

Todas las páginas viven en la raíz, sin carpetas anidadas.

| Archivo | Propósito |
|---|---|
| `index.html` | Feed del foro con búsqueda, filtros, orden y paginación |
| `publicacion.html?id=post-001` | Detalle del artículo, comentarios y mapa del distrito |
| `mapa.html` | Mapa de todos los vendedores por distrito |
| `admin.html` | Panel de moderación: publicaciones y solicitudes de vendedor |
| `login.html` | Iniciar sesión (admite `?next=` para volver a donde estabas) |
| `registro.html` | Crear una cuenta eligiendo comprador o vendedor |
| `perfil.html` | Perfil, publicaciones propias y estado de la solicitud de vendedor |
| `publicar.html` | Formulario para publicar un artículo (solo vendedores aprobados) |
| `guardados.html` | Publicaciones guardadas con el marcador 🔖 |
| `mensajes.html?c=conv-id` | Mensajería privada con quien publica |
| `404.html` | Página no encontrada (la sirve GitHub Pages automáticamente) |

---

## Estructura de `assets/`

| Ruta | Contenido |
|---|---|
| `assets/css/tokens.css` | Variables de diseño: color, tipografía, espaciado, sombras y tema claro |
| `assets/css/base.css` | Reset, utilidades (`.truncate`, `.clamp-2`…) y animaciones compartidas |
| `assets/css/components.css` | Botones, campos, tarjetas, insignias, modales, avisos y estados vacíos |
| `assets/css/layout.css` | Cabecera, pie, publicaciones del foro, comentarios, filtros y paginación |
| `assets/css/pages/*.css` | Estilos propios de cada página, con clases prefijadas |
| `assets/js/core/seed.js` | Contenido inicial de demostración: usuarios, distritos y publicaciones |
| `assets/js/core/mock-api.js` | API simulada sobre `localStorage` |
| `assets/js/core/store.js` | Estado compartido, formateadores y utilidades (`window.DS`) |
| `assets/js/core/api.js` | Capa de datos: el único punto por el que las páginas piden o modifican información |
| `assets/js/ui/toast.js` | Notificaciones emergentes |
| `assets/js/ui/modal.js` | Diálogos, confirmaciones y visor de imágenes |
| `assets/js/ui/components.js` | Publicaciones, comentarios, estados vacíos y paginación |
| `assets/js/ui/shell.js` | Inyecta la cabecera y el pie en todas las páginas |
| `assets/js/pages/*.js` | Un archivo por página, cargado al final del HTML |

Todos los scripts son IIFE clásicos (sin `import`/`export`) y se cargan en un
orden fijo: núcleo → interfaz → shell → script de la página. La única librería
externa es **Leaflet**, y solo en las páginas con mapa, que siguen funcionando
si no llega a cargarse.

---

## Publicación

Cada `push` a la rama `main` publica el sitio automáticamente mediante GitHub
Actions. El flujo está en [`.github/workflows/pages.yml`](.github/workflows/pages.yml):

1. Descarga el repositorio.
2. Comprueba que existan los archivos esenciales (`index.html`,
   `assets/css/tokens.css`, `assets/js/core/api.js`, `assets/js/ui/shell.js`).
   Si falta alguno, el despliegue se detiene antes de publicar nada.
3. Ejecuta las dos pruebas de Node.
4. Reúne solo los archivos del sitio (HTML y `assets/`) y los sube como
   artefacto de Pages.
5. Despliega en GitHub Pages.

También puedes lanzarlo a mano desde la pestaña **Actions** → *Publicar en
GitHub Pages* → *Run workflow*.

Notas:

- El archivo `.nojekyll` de la raíz evita que GitHub procese el sitio con Jekyll.
- No hay service worker a propósito: así cada `push` se ve al instante, sin
  caché agresiva que obligue a vaciar el navegador.
