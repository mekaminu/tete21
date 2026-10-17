plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Tete 21 for Android: the game in a WebView, plus one thing a web page can't do on a phone:
// pick up the sound another app is playing (YouTube Music, say) and share it with the table.
android {
    namespace = "com.tete21.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.tete21.app"
        minSdk = 29          // Android 10: the first that lets an app record other apps' playing sound
        targetSdk = 35
        val build = (System.getenv("TETE_BUILD") ?: "1").toInt()
        versionCode = build
        versionName = "1.0.$build"
        buildConfigField("String", "TETE_URL", "\"https://tete21.onrender.com/\"")
    }

    // A key of its own, kept with the app's code, so each new build installs over the last one.
    signingConfigs {
        create("release") {
            storeFile = rootProject.file("keystore/tete.jks")
            storePassword = "lnbRnAwuaSKth7V3CLdgY9_F"
            keyAlias = "tete"
            keyPassword = "lnbRnAwuaSKth7V3CLdgY9_F"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
    buildFeatures { buildConfig = true }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
