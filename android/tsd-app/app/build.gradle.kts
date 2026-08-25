plugins {
    id("com.android.application") version "8.5.0"
    id("org.jetbrains.kotlin.android") version "1.9.24"
}

android {
    namespace = "uz.sherset.tsd"
    compileSdk = 34

    defaultConfig {
        applicationId = "uz.sherset.tsd"
        // 26 — `driver-app` bilan bir xil chegara. Ombor terminallari (Urovo,
        // Newland, Zebra TC2x) odatda Android 9–11 da keladi, ya'ni zaxira bor.
        minSdk = 26
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
    // Tarmoq — `driver-app` bilan bir xil klient.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // 🔴 Qurilma kaliti + refresh-token DISKDA shifrlangan holda yotadi.
    // `driver-app` da bu YO'Q edi (u faqat parol bilan kirardi va tokenni
    // xotirada saqlardi); TSD esa kalitni doimiy saqlaydi — oddiy
    // SharedPreferences root'langan terminalda ochiq matn bo'lardi.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
