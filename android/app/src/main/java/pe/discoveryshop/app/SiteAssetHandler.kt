package pe.discoveryshop.app

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader

/**
 * Sirve el sitio empaquetado en la APK como si fuera un servidor.
 *
 * Los archivos viven en `assets/www/` porque Gradle los copia ahí desde la raíz
 * del repositorio, pero las páginas enlazan entre sí con rutas relativas
 * (`index.html`, `assets/css/base.css`). Este manejador quita esa diferencia:
 * monta `www/` en la raíz del dominio, de modo que las mismas rutas que
 * funcionan en GitHub Pages funcionan dentro de la app sin tocar una línea de
 * HTML.
 *
 * El origen resultante —`https://appassets.androidplatform.net`— es un origen
 * HTTPS real, y eso importa más de lo que parece: en `file://` el
 * almacenamiento del WebView es opaco y poco fiable, y `localStorage` es toda
 * la base de datos de este proyecto.
 */
internal class SiteAssetHandler(context: Context) : WebViewAssetLoader.PathHandler {

    private val assets = WebViewAssetLoader.AssetsPathHandler(context)

    override fun handle(path: String): WebResourceResponse? {
        // El manejador recibe la ruta ya relativa al dominio. Un `..` aquí solo
        // podría moverse dentro de los propios assets, pero no hay ningún motivo
        // legítimo para que aparezca: se rechaza y punto.
        if (path.contains("..")) return null

        val target = if (path.isEmpty() || path == "/") "$SITE_DIR/index.html" else "$SITE_DIR/$path"
        return assets.handle(target)
    }

    companion object {
        /** Carpeta dentro de `assets/` donde Gradle deja el sitio. */
        const val SITE_DIR = "www"
    }
}
