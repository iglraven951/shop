# =============================================================================
#  Reglas de R8 para DiscoveryShop (release: minify + shrinkResources)
#
#  Cada regla lleva escrito POR QUÉ existe. Si alguna deja de hacer falta, se
#  borra con su comentario; una regla sin motivo acaba tapando un fallo real.
# =============================================================================


# -----------------------------------------------------------------------------
#  1. EL PUENTE JAVASCRIPT  — la regla imprescindible
# -----------------------------------------------------------------------------
#  Este es el error clásico de las apps WebView: en debug el puente funciona, se
#  publica el release y el puente muere en silencio, sin excepción ni log.
#
#  Pasan dos cosas distintas y hay que arreglar las dos:
#
#   a) Desde Android 4.2 (API 17) el WebView solo llama a los métodos anotados
#      con @JavascriptInterface, y los busca EN TIEMPO DE EJECUCIÓN por
#      reflexión. Si R8 tira el atributo RuntimeVisibleAnnotations, la anotación
#      desaparece del .class, el WebView no encuentra ningún método invocable y
#      window.<puente>.loQueSea() queda como `undefined` en JS.
#   b) JS llama a los métodos POR SU NOMBRE, así que R8 no puede renombrarlos.
#
#  Nota: el nombre del objeto en JS es el String que se le pasa a
#  addJavascriptInterface(), no el de la clase, así que la clase sí puede
#  ofuscarse. Solo se protegen los métodos anotados.

# (a) Conserva las anotaciones en el bytecode para que el WebView las vea.
-keepattributes RuntimeVisibleAnnotations
-keepattributes RuntimeVisibleParameterAnnotations
-keepattributes AnnotationDefault

# (b) Conserva, sin renombrar, todo método @JavascriptInterface de la app,
#     esté en la clase puente o en cualquier clase anidada suya.
#     -keepclasseswithmembers (y no -keepclassmembers) para que la clase que los
#     contiene tampoco se elimine si R8 la cree inalcanzable.
-keepclasseswithmembers class pe.discoveryshop.app.** {
    @android.webkit.JavascriptInterface <methods>;
}

# Red de seguridad frente a R8 en modo completo (por defecto desde AGP 8), que
# es más agresivo suponiendo que nada se usa por reflexión.
-keepclassmembers class pe.discoveryshop.app.** {
    @android.webkit.JavascriptInterface <methods>;
}


# -----------------------------------------------------------------------------
#  2. androidx.webkit
# -----------------------------------------------------------------------------
#  androidx.webkit habla con la implementación del WebView del sistema (que vive
#  en otro APK, Android System WebView) a través de una capa de interfaces
#  «boundary» que se resuelve por reflexión en ambos sentidos. Si R8 renombra o
#  poda esos tipos, la negociación falla al arrancar.
#
#  El AAR ya trae estas reglas como consumer-rules; se repiten aquí a propósito,
#  para que queden documentadas y para que sigan valiendo si algún día se fija
#  la versión de la librería o se cambia de artefacto.
-keep class org.chromium.support_lib_boundary.** { *; }
-keep class androidx.webkit.internal.** { *; }

#  WebViewAssetLoader no usa reflexión: sirve el sitio empaquetado desde
#  https://appassets.androidplatform.net/ leyendo assets/ directamente. No
#  necesita ninguna regla.
#
#  Y un recordatorio para quien venga después: shrinkResources solo toca res/,
#  nunca assets/. El sitio web empaquetado NO corre peligro de que lo poden.


# -----------------------------------------------------------------------------
#  3. Trazas de fallo legibles
# -----------------------------------------------------------------------------
#  Sin esto, un informe de fallo de Play llega como un montón de a.b.c sin
#  número de línea. Se conservan los números y se renombra el nombre de fichero
#  a un valor fijo, que es lo que permite desofuscar con el mapping.txt sin
#  filtrar la estructura de paquetes original.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile


# -----------------------------------------------------------------------------
#  4. Metadatos de Kotlin y genéricos
# -----------------------------------------------------------------------------
#  Signature e InnerClasses hacen falta para que los tipos genéricos y las
#  clases anidadas sobrevivan; sin ellos la reflexión de Kotlin y la del propio
#  puente pueden fallar al resolver firmas.
-keepattributes Signature
-keepattributes InnerClasses,EnclosingMethod


# -----------------------------------------------------------------------------
#  5. Lo que NO se pone aquí, y por qué
# -----------------------------------------------------------------------------
#  · La MainActivity y todo lo declarado en el manifiesto: AGP ya genera sus
#    propias reglas -keep para los componentes del manifiesto. Repetirlo solo
#    añadiría ruido.
#  · Modelos de datos: no hay serialización por reflexión (ni Gson ni Moshi);
#    todo el estado vive en el localStorage del WebView, del lado de JavaScript.
#  · -dontobfuscate / -dontoptimize: no se usan. Si algo se rompe en release,
#    se arregla con una regla concreta y comentada, nunca apagando R8 entero.
