package pe.discoveryshop.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.util.TypedValue
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.Toast
import androidx.activity.addCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.Insets
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature

/**
 * La app entera: el sitio de DiscoveryShop dentro de un WebView.
 *
 * No hay una segunda implementación del foro. Lo que se ve aquí son los mismos
 * archivos que se publican en GitHub Pages, empaquetados en la APK y servidos
 * por [SiteAssetHandler] desde un origen HTTPS propio. Lo único que esta clase
 * añade es lo que un navegador no puede dar: icono en el lanzador, pantalla de
 * inicio, botón atrás del sistema, y enlaces que salen a WhatsApp de verdad.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var errorView: View
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var assetLoader: WebViewAssetLoader

    /** Selector de archivos del sistema, para cualquier `<input type="file">`. */
    private lateinit var fileChooser: ActivityResultLauncher<Intent>

    /** El WebView espera esta respuesta; dejarla sin contestar bloquea el input. */
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null

    /** Momento del último «atrás» sin historial, para el doble toque de salida. */
    private var lastBackPressAt = 0L

    /** Insets del sistema en píxeles CSS, por si algún día el sitio los necesita. */
    private var systemInsets = CssInsets()

    /** El puente se instala y se quita según el origen de la página. */
    private var bridgeAttached = false

    /** La pantalla de inicio se mantiene hasta que el sitio pinta su primer fotograma. */
    @Volatile
    private var contentReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        splash.setKeepOnScreenCondition { !contentReady }

        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web_view)
        errorView = findViewById(R.id.error_view)
        swipeRefresh = findViewById(R.id.swipe_refresh)
        findViewById<Button>(R.id.error_retry).setOnClickListener { reload() }

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(SITE_HOST)
            .addPathHandler("/", SiteAssetHandler(this))
            .build()

        registerFileChooser()
        applyWindowInsets()
        configureWebView()
        configureRefresh()
        applyThemeSurfaces()
        handleSystemBack()

        // Si algo se atasca, la pantalla de inicio no se queda para siempre.
        webView.postDelayed({ contentReady = true }, SPLASH_TIMEOUT_MS)

        if (savedInstanceState == null) {
            // Un atajo del lanzador o un enlace compartido traen su destino en
            // el Intent; sin ellos se abre el foro por la portada.
            webView.loadUrl(urlFor(intent))
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    /**
     * La app está declarada `singleTop`, así que un segundo enlace mientras ya
     * está abierta no crea otra actividad: llega aquí. Sin esto, tocar un
     * acceso directo con la app en segundo plano la traería al frente en la
     * página donde se quedó, ignorando el atajo.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)

        val target = intent.data?.let(::sitePathFor) ?: return
        webView.loadUrl("https://$SITE_HOST/$target")
    }

    /* ======================================================================
       Ventana y barras del sistema
       ====================================================================== */

    /**
     * Android 15 dibuja siempre de borde a borde, así que el contenido pasaría
     * por debajo de la barra de estado y de la de navegación. En lugar de
     * pedirle al sitio que lo compense, lo compensa la app: el WebView se
     * aparta de las barras y el fondo del contenedor —el mismo `--bg-base` del
     * sitio— rellena el hueco. El resultado es idéntico a una barra de estado
     * teñida, y el sitio no se entera de nada.
     */
    private fun applyWindowInsets() {
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, dispatched ->
            // AppCompat intercala un FitWindowsLinearLayout con
            // `fitsSystemWindows` entre la decoración y esta vista, y ese
            // contenedor puede consumir los insets antes de que lleguen aquí.
            // Cuando eso pasa, lo que recibimos es cero y el sitio se dibujaría
            // debajo del reloj. `getRootWindowInsets` los lee de la ventana sin
            // pasar por esa cadena, así que sirve de red de seguridad.
            val windowInsets = if (dispatched.isBlank()) {
                ViewCompat.getRootWindowInsets(view) ?: dispatched
            } else {
                dispatched
            }

            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())

            if (BuildConfig.DEBUG) {
                Log.d(TAG, "insets: barras=$bars teclado=$ime (recibidos=${!dispatched.isBlank()})")
            }

            if (PAD_VIEWPORT_NATIVELY) {
                // El relleno va en el contenedor, no en el WebView: un WebView
                // pinta el fondo de la página sobre su propio relleno, así que
                // el hueco se vería del color de la web y el contenido seguiría
                // pegado al reloj. Rellenando el FrameLayout se encoge de
                // verdad el área del WebView y el hueco lo pinta el fondo de la
                // ventana, que es lo que queremos.
                view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            }

            val density = resources.displayMetrics.density
            systemInsets = CssInsets(
                top = (bars.top / density).toInt(),
                bottom = (maxOf(bars.bottom, ime.bottom) / density).toInt(),
                left = (bars.left / density).toInt(),
                right = (bars.right / density).toInt(),
            )
            windowInsets
        }

        // Sin esto, si la vista ya estaba adjunta cuando se puso el oyente, la
        // primera repartición de insets se habría perdido.
        ViewCompat.requestApplyInsets(root)
    }

    /** `true` cuando no traen ningún margen: alguien los consumió por el camino. */
    private fun WindowInsetsCompat.isBlank(): Boolean =
        getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()) == Insets.NONE

    /* ======================================================================
       Enlaces de entrada

       Tres puertas llevan a una página concreta del foro: los accesos directos
       del lanzador (`discoveryshop://mapa.html`), un enlace compartido a
       GitHub Pages, y cualquier `discoveryshop://` que venga de fuera. Las
       tres acaban aquí y se traducen a una ruta del sitio empaquetado.
       ====================================================================== */

    /** Dónde tiene que abrirse la app para este Intent. */
    private fun urlFor(intent: Intent?): String {
        val path = intent?.data?.let(::sitePathFor) ?: return START_URL
        return "https://$SITE_HOST/$path"
    }

    /**
     * Traduce un enlace externo a una ruta del sitio, o `null` si no apunta a
     * ninguna página conocida.
     *
     * La lista blanca no es una formalidad: sin ella, cualquier app del
     * teléfono podría pedirle a esta que cargara una ruta arbitraria de sus
     * propios assets. Con ella, lo peor que puede pedir es una de las once
     * páginas que el sitio ya publica.
     *
     * La cadena de consulta y el fragmento sí se conservan tal cual, porque
     * son justo lo que distingue «una publicación» de «la publicación 42»
     * (`publicacion.html?id=post-001#comentarios`).
     */
    private fun sitePathFor(uri: Uri): String? {
        val raw = when (uri.scheme?.lowercase()) {
            // discoveryshop://mapa.html → el host ES la página.
            APP_SCHEME -> listOfNotNull(uri.host, uri.path?.trimStart('/'))
                .filter { it.isNotEmpty() }
                .joinToString("/")

            "https" -> {
                if (uri.host != WEB_HOST) return null
                uri.path.orEmpty().removePrefix(WEB_PATH_PREFIX).trimStart('/')
            }

            else -> return null
        }

        val page = raw.substringBefore('?').ifEmpty { "index.html" }
        if (page !in SITE_PAGES) return null

        return buildString {
            append(page)
            uri.encodedQuery?.takeIf { it.isNotBlank() }?.let { append('?').append(it) }
            uri.encodedFragment?.takeIf { it.isNotBlank() }?.let { append('#').append(it) }
        }
    }

    /* ======================================================================
       Tirar para recargar
       ====================================================================== */

    /**
     * El gesto que un navegador siempre ofrece y una WebView no hereda.
     *
     * Solo se arma cuando la página está arriba del todo. Es la diferencia
     * entre un gesto útil y uno que secuestra cada desplazamiento hacia abajo
     * a media lectura: `setOnChildScrollUpCallback` le pregunta al WebView si
     * todavía le queda recorrido hacia arriba y, mientras le quede, el
     * refresco ni se plantea.
     */
    private fun configureRefresh() {
        swipeRefresh.setOnChildScrollUpCallback { _, _ -> webView.scrollY > 0 }
        swipeRefresh.setColorSchemeColors(getColor(R.color.brand_strong))
        swipeRefresh.setProgressBackgroundColorSchemeColor(resolveWindowBackground())
        swipeRefresh.setOnRefreshListener { reload() }
    }

    /* ======================================================================
       Selector de archivos

       El sitio no tiene hoy ningún `<input type="file">`: las fotos de las
       publicaciones se generan. Pero una WebView sin esto no falla, que sería
       recuperable —simplemente no pasa nada al tocar el campo—, y ese es el
       tipo de avería que nadie diagnostica. Con el selector puesto, el día que
       el foro acepte fotos de verdad, ya funciona.
       ====================================================================== */

    private fun registerFileChooser() {
        fileChooser = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            val callback = pendingFileCallback ?: return@registerForActivityResult
            pendingFileCallback = null
            callback.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
        }
    }

    /* ======================================================================
       WebView
       ====================================================================== */

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        with(webView.settings) {
            javaScriptEnabled = true

            // `localStorage` no es un detalle: es toda la base de datos del
            // proyecto. Sin esto la app arranca vacía en cada apertura.
            domStorageEnabled = true

            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            setSupportMultipleWindows(false)

            // Todo el contenido entra por el cargador de assets; el WebView no
            // necesita leer del sistema de archivos ni de proveedores.
            allowFileAccess = false
            allowContentAccess = false

            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString $APP_USER_AGENT_TAG"
        }

        // El sitio ya declara `prefers-color-scheme`, así que el WebView solo
        // tiene que dejar pasar el tema del sistema en vez de oscurecer por su
        // cuenta una página que ya sabe hacerlo.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.settings, true)
        }

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.webViewClient = SiteWebViewClient()
        webView.webChromeClient = SiteWebChromeClient()

        attachBridge()
    }

    /**
     * Pinta el marco nativo con el color del tema vigente.
     *
     * La actividad declara `uiMode` en `configChanges` para que pasar de claro
     * a oscuro no recargue la página y pierda lo que el usuario estuviera
     * escribiendo. El precio es que nadie vuelve a resolver el tema por
     * nosotros: sin esto, el sitio se ponía oscuro y la banda de la barra de
     * estado se quedaba clara. Se llama al crear y en cada cambio de
     * configuración.
     */
    private fun applyThemeSurfaces() {
        val background = resolveWindowBackground()
        findViewById<View>(R.id.root).setBackgroundColor(background)
        webView.setBackgroundColor(background)

        // Los iconos del sistema se dibujan sobre ese mismo fondo, así que su
        // contraste tiene que cambiar con él.
        val night = resources.configuration.uiMode and
            Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyThemeSurfaces()
    }

    private fun resolveWindowBackground(): Int {
        val value = TypedValue()
        theme.resolveAttribute(android.R.attr.windowBackground, value, true)
        val isColor = value.type >= TypedValue.TYPE_FIRST_COLOR_INT &&
            value.type <= TypedValue.TYPE_LAST_COLOR_INT
        return if (isColor) value.data else getColor(R.color.bg_base)
    }

    private fun attachBridge() {
        if (bridgeAttached) return
        webView.addJavascriptInterface(NativeBridge(this), BRIDGE_NAME)
        bridgeAttached = true
    }

    private fun detachBridge() {
        if (!bridgeAttached) return
        webView.removeJavascriptInterface(BRIDGE_NAME)
        bridgeAttached = false
    }

    private inner class SiteWebViewClient : WebViewClient() {

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

        /**
         * Dentro del sitio se navega normalmente. Cualquier otra cosa —el
         * enlace de WhatsApp, la atribución de OpenStreetMap— sale a la app que
         * le corresponda en lugar de abrirse dentro del foro.
         */
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == SITE_HOST) return false
            openExternally(url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            // El puente solo debe existir mientras la página venga de nosotros.
            if (url != null && Uri.parse(url).host == SITE_HOST) attachBridge() else detachBridge()
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            contentReady = true
            hideError()
        }

        override fun onPageFinished(view: WebView, url: String?) {
            // El indicador de recarga se apaga cuando la página terminó, no
            // cuando empezó: si se apagara antes, el gesto parecería no haber
            // hecho nada.
            swipeRefresh.isRefreshing = false
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            if (request.isForMainFrame) {
                contentReady = true
                swipeRefresh.isRefreshing = false
                showError()
            }
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail?): Boolean {
            // Si el proceso del renderizador muere, el sistema mata la app salvo
            // que se gestione aquí. Se reconstruye la pantalla en vez de cerrar.
            Log.w(TAG, "El proceso del WebView terminó; se reinicia la actividad.")
            recreate()
            return true
        }
    }

    private inner class SiteWebChromeClient : WebChromeClient() {
        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "[web] ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
            }
            return true
        }

        /**
         * Sin esta implementación, tocar un campo de archivo no hace nada en
         * absoluto: ni diálogo, ni error, ni traza. Devolver `true` es el
         * compromiso de contestar siempre a [filePathCallback] —también al
         * cancelar—, porque un input que nunca recibe respuesta se queda
         * bloqueado para el resto de la sesión.
         */
        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            // Si había otro diálogo a medias, se cierra contestándole que no.
            pendingFileCallback?.onReceiveValue(null)
            pendingFileCallback = filePathCallback

            return try {
                fileChooser.launch(
                    Intent.createChooser(
                        fileChooserParams.createIntent(),
                        getString(R.string.chooser_pick_file),
                    ),
                )
                true
            } catch (e: ActivityNotFoundException) {
                Log.w(TAG, "No hay ninguna app con la que elegir un archivo", e)
                pendingFileCallback = null
                filePathCallback.onReceiveValue(null)
                Toast.makeText(this@MainActivity, R.string.toast_no_browser, Toast.LENGTH_SHORT).show()
                false
            }
        }
    }

    /* ======================================================================
       Servicios que el puente expone al sitio
       ====================================================================== */

    internal fun residualInsetsAsJson(): String {
        val i = if (PAD_VIEWPORT_NATIVELY) CssInsets() else systemInsets
        return """{"top":${i.top},"bottom":${i.bottom},"left":${i.left},"right":${i.right}}"""
    }

    internal fun openExternally(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "No hay ninguna app capaz de abrir $uri", e)
            Toast.makeText(this, R.string.toast_no_browser, Toast.LENGTH_SHORT).show()
        }
    }

    internal fun shareContent(title: String?, text: String?, url: String?) {
        val body = listOfNotNull(
            text?.takeIf { it.isNotBlank() },
            url?.takeIf { it.isNotBlank() },
        ).joinToString("\n")

        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title ?: getString(R.string.app_name))
            putExtra(Intent.EXTRA_TEXT, body)
        }

        try {
            startActivity(Intent.createChooser(send, getString(R.string.chooser_share)))
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "No hay ninguna app con la que compartir", e)
        }
    }

    internal fun vibrate(milliseconds: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        } ?: return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(milliseconds)
        }
    }

    /* ======================================================================
       Estado de la pantalla
       ====================================================================== */

    private fun showError() {
        errorView.visibility = View.VISIBLE
        webView.visibility = View.INVISIBLE
    }

    private fun hideError() {
        errorView.visibility = View.GONE
        webView.visibility = View.VISIBLE
    }

    private fun reload() {
        hideError()
        if (webView.url == null) webView.loadUrl(START_URL) else webView.reload()
    }

    /**
     * El botón atrás del sistema recorre el historial del sitio. Cuando ya no
     * hay a dónde volver, avisa una vez antes de cerrar.
     *
     * El aviso no es una cortesía: en el foro se escriben publicaciones largas
     * y mensajes, y todo eso vive en un formulario de una página. Cerrar la app
     * al primer toque —estando en la portada, que es donde acaba el historial—
     * tira ese texto sin preguntar. El segundo toque, dentro de la ventana de
     * confirmación, sí cierra.
     */
    private fun handleSystemBack() {
        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
                return@addCallback
            }

            val now = SystemClock.elapsedRealtime()
            if (now - lastBackPressAt in 0..EXIT_CONFIRM_WINDOW_MS) {
                finish()
                return@addCallback
            }

            lastBackPressAt = now
            Toast.makeText(this@MainActivity, R.string.exit_confirm, Toast.LENGTH_SHORT).show()
        }
    }

    /* ======================================================================
       Ciclo de vida
       ====================================================================== */

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        // Un diálogo de archivo a medias deja al WebView esperando una
        // respuesta que ya no va a llegar de nadie.
        pendingFileCallback?.onReceiveValue(null)
        pendingFileCallback = null

        // Un WebView que sobrevive a su actividad es una fuga de memoria clásica.
        webView.stopLoading()
        webView.webChromeClient = null
        detachBridge()
        (webView.parent as? android.view.ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    /** Márgenes en píxeles CSS, que es lo que entiende la página. */
    internal data class CssInsets(
        val top: Int = 0,
        val bottom: Int = 0,
        val left: Int = 0,
        val right: Int = 0,
    )

    private companion object {
        const val TAG = "DiscoveryShop"

        /** Dominio virtual del cargador de assets. No sale a la red. */
        const val SITE_HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$SITE_HOST/index.html"

        /** Esquema propio de los accesos directos y de los enlaces de fuera. */
        const val APP_SCHEME = "discoveryshop"

        /** Dónde vive el mismo sitio en la web, para los enlaces compartidos. */
        const val WEB_HOST = "iglraven951.github.io"
        const val WEB_PATH_PREFIX = "/shop"

        /**
         * Las páginas que un enlace externo puede abrir. Es la misma lista de
         * archivos HTML que hay en la raíz del repositorio; cualquier otra cosa
         * no es una página del foro y no se carga.
         */
        val SITE_PAGES = setOf(
            "index.html",
            "login.html",
            "registro.html",
            "perfil.html",
            "publicar.html",
            "publicacion.html",
            "guardados.html",
            "mensajes.html",
            "mapa.html",
            "admin.html",
            "404.html",
        )

        /** Margen para el segundo «atrás» que confirma la salida. */
        const val EXIT_CONFIRM_WINDOW_MS = 2_500L

        /** Lo que `native.js` busca para saber que está dentro de la app. */
        const val APP_USER_AGENT_TAG = "DiscoveryShopApp/1.0"

        const val BRIDGE_NAME = "DSNative"

        /**
         * Quién aparta el contenido de las barras del sistema.
         *
         * `true`  → lo hace la app rellenando el WebView (elección actual: no
         *           puede romper la maquetación del sitio).
         * `false` → lo hace el sitio con las variables CSS que publica
         *           `native.js`, y el contenido sangra hasta el borde.
         */
        const val PAD_VIEWPORT_NATIVELY = true

        const val SPLASH_TIMEOUT_MS = 4_000L
    }
}
