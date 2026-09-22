import org.gradle.api.file.ConfigurableFileCollection
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.FileSystemOperations
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.io.FileInputStream
import java.util.Properties
import javax.inject.Inject

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

/* ==========================================================================
   El sitio como asset generado

   DiscoveryShop ya existe: es el sitio estático que se publica en GitHub
   Pages, y vive un nivel por encima de `android/`. La app no es una copia
   suya, es una envoltura: empaqueta exactamente esos mismos archivos.

   Copiarlos a mano condenaría la app a quedarse atrás en cuanto alguien
   tocara una página, así que los copia Gradle en cada build. El destino
   está en `build/`, nunca en `src/`: así `clean` limpia de verdad y no
   acaban archivos generados en el repositorio.
   ========================================================================== */
val siteRoot: File = rootProject.projectDir.parentFile

/**
 * Copia el sitio dentro de los assets generados de la APK.
 *
 * Es una tarea propia y no un `Sync` corriente por un motivo concreto: declara
 * su salida como `DirectoryProperty`, que es lo único que permite engancharla
 * con `addGeneratedSourceDirectory`. Con un `Sync` y `assets.srcDir(...)` la
 * ruta quedaba registrada pero la dependencia de tarea no, y Gradle ejecutaba
 * `assembleDebug` sin sincronizar: build correcto, cero avisos y una APK con
 * la copia del sitio de hace tres commits.
 */
abstract class SyncWebAssets : DefaultTask() {

    /** Los archivos del sitio, ya filtrados. Solo estos disparan una recopia. */
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val site: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    @get:Inject
    abstract val fileOperations: FileSystemOperations

    @TaskAction
    fun copyWebsite() {
        // `sync` y no `copy`: un archivo borrado del sitio tiene que
        // desaparecer también de la app.
        fileOperations.sync {
            from(site)
            into(outputDirectory.dir(SITE_DIR))
        }
    }

    companion object {
        /** Debe coincidir con `SiteAssetHandler.SITE_DIR` en el código Kotlin. */
        const val SITE_DIR = "www"
    }
}

val syncWebAssets = tasks.register<SyncWebAssets>("syncWebAssets") {
    description = "Copia el sitio estático dentro de los assets de la APK."
    group = "build"

    site.from(
        fileTree(siteRoot) {
            include("*.html")
            include("site.webmanifest")
            include("assets/**")
        }
    )
    outputDirectory.set(layout.buildDirectory.dir("generated/web-assets"))
}

/* --------------------------------------------------------------------------
   Firma de la versión de publicación

   Las credenciales no están en el repositorio. Si existe `keystore.properties`
   se firma con él; si no, `assembleRelease` genera una APK sin firmar en lugar
   de romper el build de quien solo quiere compilar.
   -------------------------------------------------------------------------- */
val keystorePropertiesFile: File = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        FileInputStream(keystorePropertiesFile).use { load(it) }
    }
}

android {
    namespace = "pe.discoveryshop.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "pe.discoveryshop.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        // `BuildConfig.DEBUG` decide si el WebView es inspeccionable.
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

/* --------------------------------------------------------------------------
   Empaquetar implica sincronizar.

   `addGeneratedSourceDirectory` registra el directorio como fuente de assets
   Y declara la dependencia de tarea, para todas las variantes y para todos los
   consumidores —el empaquetado, pero también lint, que lee el mismo
   directorio—. Es lo que hace que no haga falta acordarse de nada: compilar la
   app es, por construcción, empaquetar el sitio tal y como está ahora mismo.
   -------------------------------------------------------------------------- */
androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(
            syncWebAssets,
            SyncWebAssets::outputDirectory,
        )
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.swiperefreshlayout)
}
