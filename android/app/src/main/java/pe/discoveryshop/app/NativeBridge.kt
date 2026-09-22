package pe.discoveryshop.app

import android.net.Uri
import android.webkit.JavascriptInterface

/**
 * El puente entre el sitio y Android. En el navegador no existe; dentro de la
 * app el sitio lo encuentra como `window.DSNative` y `assets/js/core/native.js`
 * lo envuelve en algo más cómodo.
 *
 * Un puente JavaScript es la superficie de ataque de una app WebView: cualquier
 * página que se cargue con el puente puesto puede llamar a estos métodos. Por
 * eso [MainActivity] solo lo deja instalado mientras la página viene del
 * cargador de assets, y por eso [openExternal] valida el esquema en lugar de
 * pasar cualquier cosa a `startActivity`.
 *
 * Todos los métodos llegan desde un hilo del WebView, nunca desde el hilo
 * principal: cualquier cosa que toque la interfaz pasa por `runOnUiThread`.
 */
internal class NativeBridge(private val activity: MainActivity) {

    /** Permite al sitio distinguir la app del navegador sin mirar el user agent. */
    @JavascriptInterface
    fun isNative(): Boolean = true

    /**
     * Márgenes que la página todavía tiene que compensar, en píxeles CSS.
     *
     * Hoy son cero porque la capa nativa ya aparta el WebView de las barras del
     * sistema (ver `MainActivity.PAD_VIEWPORT_NATIVELY`). Se mantiene el método
     * porque el contrato lo usa `native.js` de forma genérica: si un día la app
     * decide dibujar de borde a borde, basta con cambiar esa constante y el
     * sitio se adapta solo.
     */
    @JavascriptInterface
    fun insets(): String = activity.residualInsetsAsJson()

    /**
     * Abre un enlace fuera del WebView: WhatsApp, el navegador, el cliente de
     * correo. Sin esto, tocar el enlace de WhatsApp del panel de administración
     * dejaría al usuario atrapado en una página web dentro de su propia app.
     */
    @JavascriptInterface
    fun openExternal(url: String?) {
        val uri = parseAllowed(url) ?: return
        activity.runOnUiThread { activity.openExternally(uri) }
    }

    /** Hoja de compartir del sistema. */
    @JavascriptInterface
    fun share(title: String?, text: String?, url: String?) {
        activity.runOnUiThread { activity.shareContent(title, text, url) }
    }

    /** Vibración corta de confirmación. Se acota para que nadie pueda abusar. */
    @JavascriptInterface
    fun vibrate(milliseconds: Int) {
        activity.vibrate(milliseconds.coerceIn(1, 120).toLong())
    }

    /**
     * Convierte la cadena en `Uri` solo si su esquema está en la lista blanca.
     * El puente no es un lanzador de intents genérico.
     */
    private fun parseAllowed(url: String?): Uri? {
        if (url.isNullOrBlank()) return null
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        return if (scheme in ALLOWED_SCHEMES) uri else null
    }

    private companion object {
        val ALLOWED_SCHEMES = setOf("http", "https", "mailto", "tel", "geo")
    }
}
