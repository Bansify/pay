plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Passed by the release workflow (-PversionCode= / -PversionName=).
val appVersionCode = (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 1
val appVersionName = (project.findProperty("versionName") as String?) ?: "1.0.0"

// Filled by the workflow from the organisation secrets; absent for a local build.
val keystorePass: String = System.getenv("KS_PASS").orEmpty()
val keyAliasName: String = System.getenv("K_ALIAS") ?: "bansify"
// Not named "keyPassword": inside signingConfigs that name is the property itself.
val keyPass: String = System.getenv("K_PASS") ?: keystorePass

android {
    namespace = "com.bansify.pay"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.bansify.pay"
        minSdk = 24
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
    }

    signingConfigs {
        if (keystorePass.isNotEmpty()) {
            create("release") {
                storeFile = file("keystore.jks")
                storePassword = keystorePass
                keyAlias = keyAliasName
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePass.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("com.github.Bansify:bansifywrap:1.1.0")
    // The library's splash theme inherits from an AppCompat theme.
    implementation("androidx.appcompat:appcompat:1.7.0")
}
