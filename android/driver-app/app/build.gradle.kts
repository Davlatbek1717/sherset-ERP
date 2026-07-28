plugins {
    id("com.android.application") version "8.5.0"
    id("org.jetbrains.kotlin.android") version "1.9.24"
}

android {
    namespace = "uz.sherset.driver"
    compileSdk = 34

    defaultConfig {
        applicationId = "uz.sherset.driver"
        minSdk = 26 // foreground-service + notification channel
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-scaffold"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity:1.9.0")
    implementation("com.google.android.material:material:1.12.0")
    // Foreground GPS
    implementation("com.google.android.gms:play-services-location:21.3.0")
    // Tarmoq
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
