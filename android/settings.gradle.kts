pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        // bansifywrap is published there by its own tag builds.
        maven("https://jitpack.io")
    }
}

rootProject.name = "bansify-pay"
include(":app")
