plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.andx.supportchat"
    compileSdk = 34

    defaultConfig {
        minSdk = 26
        consumerProguardFiles("consumer-rules.pro")
    }

    buildFeatures {
        compose = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Compose BOM ensures consistent versions across the Compose libraries.
    val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
    implementation(composeBom)
    api(composeBom)

    // Core Compose UI
    api("androidx.compose.ui:ui")
    api("androidx.compose.foundation:foundation")
    api("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")

    // Lifecycle + ViewModel for the ChatStore
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")

    // DataStore for persistence
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Kotlinx serialization + coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // OkHttp for the API client (Android devs already have it in their app)
    api("com.squareup.okhttp3:okhttp:4.12.0")

    // Firebase Messaging is a SOFT dependency — the host app adds it if they
    // want push notifications, and the SDK's push module uses reflection.
    compileOnly("com.google.firebase:firebase-messaging:24.0.0")
}
