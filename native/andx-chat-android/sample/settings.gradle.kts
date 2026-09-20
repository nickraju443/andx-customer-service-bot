pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "ANDXChatDemo"
include(":app")
// The SDK lives one directory up
include(":andx-chat-android")
project(":andx-chat-android").projectDir = file("../")
