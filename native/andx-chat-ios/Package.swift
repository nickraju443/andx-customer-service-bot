// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ANDXSupportChat",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v16),
    ],
    products: [
        .library(
            name: "ANDXSupportChat",
            targets: ["ANDXSupportChat"]
        ),
    ],
    dependencies: [
        // No hard dependencies. Firebase Messaging is an optional runtime
        // dependency (see PushRegistrar.swift). The host app installs it if
        // they want push notifications.
    ],
    targets: [
        .target(
            name: "ANDXSupportChat",
            path: "Sources/ANDXSupportChat"
        ),
    ]
)
