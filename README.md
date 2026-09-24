# DiscoveryShop

**Comercio inverso** en **Arequipa, Perú**. Funciona al revés que un
marketplace: el comprador publica **lo que busca** —con su presupuesto y el
distrito— y los vendedores de la ciudad le responden con **ofertas**. El comprador
acepta una, se abre el chat privado y quedan para verse.

> **No es un comercio al uso.** No hay carrito, ni pagos, ni envíos, ni comisiones.
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
| `assets/js/core/seed.js` | El contenido inicial: distritos de Arequipa con coordenadas reales, usuarios con su rol y los pedidos de ejemplo |
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
| **Visitante** (sin sesión) | Ver el tablón, buscar, filtrar, abrir un pedido y consultar el mapa de vendedores |
| **Cualquier cuenta** | Todo lo anterior y además **publicar pedidos**, 🙋 «también lo busco», 🔖 guardar, 💬 comentar y 🚩 denunciar |
| **Tienda aprobada** (`seller_status: 'approved'`) | Todo lo anterior y además **responder pedidos con una oferta** (precio, mensaje y fotos) y conversar con quien la acepte |
| **Administrador** (`role: 'admin'`) | Aprobar o rechazar pedidos y solicitudes de vendedor, y resolver denuncias |

Al registrarse se dice si además se quiere vender. Quien lo hace entra con
la solicitud **en revisión** (`seller_status: 'pending'`) y **no puede responder
pedidos hasta que un administrador la apruebe**; mientras tanto su cuenta pide
con total normalidad. **Pedir no requiere permiso; responder sí** (ADR-019).
Todo pedido nuevo nace también en revisión y solo aparece en el tablón cuando
el administrador lo aprueba.

Cada cuenta tiene además una **campana de avisos** en la cabecera: ahí llegan
las ofertas que recibe un pedido tuyo, la aceptación de una oferta tuya, los
comentarios y las decisiones de moderación.

Dos reglas mantienen el tablón vivo y legible:

- **Cinco pedidos abiertos por persona.** Al cerrar o eliminar uno se recupera
  el sitio. Lo que se limita es el ruido presente, no el historial.
- **Quince días hábiles de vida.** Pasado el plazo el pedido se retira solo,
  para que nadie responda a algo que ya no se busca. Un pedido con oferta
  aceptada no caduca: sostiene un trato y la reputación de quien respondió.

Un pedido pasa por `open → matched → fulfilled` según avanza, sin salir del
tablón, porque saber que algo ya se resolvió también es información. Y al
confirmarse la compra, quien pidió puede **retirar el pedido**: el trato, su
precio y la calificación viven aparte y se conservan.

---

## Cuentas de prueba

Todas usan la contraseña **`demo1234`**.

| Correo | Rol | Para probar |
|---|---|---|
| `admin@discoveryshop.pe` | Administrador | El panel de moderación: aprobar y rechazar |
| `juan@discoveryshop.pe` | Tienda aprobada | Responder un pedido con una oferta |
| `miguel@discoveryshop.pe` | Tienda en revisión | Pide con normalidad; aún no puede responder |
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

## Aplicación para Android

DiscoveryShop también se instala como aplicación. **Es exactamente el mismo
sitio**: no existe una segunda versión hecha a mano, sino una carcasa nativa que
abre estos mismos archivos dentro de un WebView. Lo que se arregla en la página
queda arreglado en la aplicación.

| Dato | Valor |
|---|---|
| Identificador | `pe.discoveryshop.app` |
| Versión | 1.0.0 |
| Android mínimo | 7.0 (API 24) |

El sitio viaja **dentro del APK**, así que la aplicación abre sin conexión. Lo
único que necesita internet son los mapas, porque las teselas vienen de
OpenStreetMap; sin conexión el mapa se sustituye por la lista de distritos, igual
que en la web. Leaflet ya no se descarga de un CDN: vive en
`assets/vendor/leaflet/`, dentro del repositorio, para que el código del mapa
exista aunque no haya red.

Los enlaces que salen de DiscoveryShop salen de verdad: un enlace de WhatsApp
abre WhatsApp, y OpenStreetMap o Unsplash abren el navegador. La aplicación no te
deja atrapado en una ventana sin salida.

Lo que la aplicación añade sobre abrir la página en el navegador:

| | |
|---|---|
| **Accesos directos** | Mantén pulsado el icono: Publicar, Mapa y Mensajes. Son los mismos tres que la web ya ofrecía al instalarse desde el navegador |
| **Compartir** | Cada publicación tiene su botón. Abre la hoja de compartir de Android con un enlace **público**, así que quien lo reciba puede abrirlo aunque no tenga la aplicación |
| **Enlaces que abren la app** | `discoveryshop://publicacion.html?id=…` lleva directo a esa publicación, con su ancla y sus filtros |
| **Tirar para recargar** | Solo cuando la página está arriba del todo, para que no estorbe al leer |
| **Salir con aviso** | Atrás en la portada avisa una vez antes de cerrar: en el foro se escriben mensajes largos y cerrar al primer toque los tira |
| **Tema del sistema** | Claro y oscuro cambian en vivo, incluida la franja de la barra de estado |

> **Los datos siguen viviendo en el dispositivo.** Igual que en la web, todo se
> guarda en el navegador —aquí, el de la aplicación—, así que la cuenta que crees
> en el móvil no existe en la página publicada, ni al revés. Mientras no haya un
> servidor de verdad, cada instalación es un mundo aparte.

### Instalarla en un móvil

1. Copia `app-debug.apk` al teléfono (por cable, por Drive, como prefieras).
2. Ábrelo desde el gestor de archivos.
3. Android pedirá permiso para **instalar aplicaciones de orígenes
   desconocidos**: concédeselo a la aplicación desde la que estás abriendo el
   APK. Es normal, porque el paquete no viene de Google Play.
4. Acepta la instalación.

### Compilarla

El proyecto vive en `android/`. Hacen falta el JDK 21 y el SDK de Android, y un
archivo `android/local.properties` con `sdk.dir` apuntando a tu SDK.

```bash
cd android
.\gradlew assembleDebug
```

El APK aparece en `android/app/build/outputs/apk/debug/app-debug.apk`.

En ningún momento hay que copiar la web a mano: una tarea de Gradle vuelca la
raíz del repositorio en `android/app/src/main/assets/www/` antes de cada
compilación, y esa carpeta queda fuera del repositorio precisamente para que
nadie pueda dejarla desactualizada. La prueba `tests/android.test.mjs` compara
byte a byte lo que hay dentro del APK con lo que hay en el repositorio: así,
«la aplicación es el sitio» es algo que se comprueba, no algo que se promete.

---

## Pruebas

Solo necesitan Node 20 o superior; no hay dependencias que instalar.

```bash
node tests/core.test.mjs
node tests/integrity.test.mjs
node tests/contract.test.mjs
node tests/responsive.test.mjs
node tests/contrast.test.mjs
node tests/ai.test.mjs
node tests/chat.test.mjs
node tests/tokens.test.mjs
node tests/transport.test.mjs
node tests/android.test.mjs
```

| Archivo | Qué comprueba |
|---|---|
| `tests/core.test.mjs` | El contrato de datos: pedidos, ofertas, tratos, filtros, sesión, permisos y moderación de `MockAPI` |
| `tests/integrity.test.mjs` | La integridad del sitio: enlaces que resuelven, orden de los scripts, colores desde los tokens, ortografía española y ausencia de restos de depuración |
| `tests/contract.test.mjs` | Que los métodos que invocan las páginas existan de verdad en el núcleo, cargándolo en un DOM simulado |
| `tests/responsive.test.mjs` | Los patrones que provocan desbordes horizontales o elementos inalcanzables a 360, 768 y 1440 px |
| `tests/contrast.test.mjs` | Que cada combinación de texto sobre fondo de la paleta cumpla WCAG 2.1 AA, en ambos temas |
| `tests/ai.test.mjs` | El comportamiento del asistente y del revisor automático de pedidos: qué entiende, qué presupuesto lee de una frase, y qué señala de cómo está escrita |
| `tests/chat.test.mjs` | El vendedor que contesta en el chat: que su regateo tenga suelo, que ceda cada vez menos, que recuerde tras recargar la página, y que un mensaje pueda ser solo fotos |
| `tests/tokens.test.mjs` | Que toda `var(--x)` del CSS esté definida. Una que no resuelve hace que el navegador descarte la declaración entera, en silencio: la regla no falla, simplemente no se dibuja |
| `tests/transport.test.mjs` | El transporte de la capa de datos: cuándo habla con el servidor, cuándo cae a la demo, y que un 4xx del servidor llegue intacto en vez de disfrazarse de éxito |
| `tests/android.test.mjs` | La app Android: proyecto completo, iconos en todas las densidades, nada de HTTP en claro y que la copia del sitio dentro del APK sea idéntica a la real |

Las diez se ejecutan también en cada despliegue: si alguna falla, el sitio no
se publica.

---

## Mapa de páginas

Todas las páginas viven en la raíz, sin carpetas anidadas.

| Archivo | Propósito |
|---|---|
| `index.html` | El tablón de pedidos, con búsqueda, filtros, orden y paginación |
| `publicacion.html?id=req-001` | El pedido, sus ofertas, los comentarios y el mapa del distrito |
| `mapa.html` | Los vendedores que responden pedidos, por distrito |
| `admin.html` | Panel de moderación: pedidos, vendedores, denuncias y bandeja de la IA |
| `login.html` | Iniciar sesión (admite `?next=` para volver a donde estabas) |
| `registro.html` | Crear una cuenta, indicando si además se quiere vender |
| `perfil.html` | Perfil, reputación, pedidos propios y estado de la solicitud de vendedor |
| `publicar.html` | Formulario para publicar un pedido (cualquier cuenta con sesión) |
| `guardados.html` | Pedidos guardados con el marcador 🔖 |
| `mensajes.html?c=conv-id` | Chat privado, que solo existe tras aceptar una oferta |
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

Cada `push` a la rama `comercio-inverso` —la única del repositorio— publica el
sitio automáticamente mediante GitHub Actions. El flujo está en
[`.github/workflows/pages.yml`](.github/workflows/pages.yml):

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
