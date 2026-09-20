//
//  ANDXSupportChat.swift
//  ANDXSupportChat
//
//  Public API. Import the module, drop `.sheet(...)` binding into your app,
//  or embed `ANDXSupportChatView` directly.
//

import SwiftUI

// MARK: - Config

public struct ANDXSupportChatConfig: Sendable {
    /// Pre-fill the email gate. Skip if you don't have the user's email yet.
    public var userEmail: String?
    /// Pre-fill the name field in the email gate.
    public var userName: String?
    /// Shown to live agents in Zoho so they know which screen the user is on.
    public var pageContext: String?
    /// Tone of AI answers.
    public var initialMode: ChatMode?
    /// Override colors + fonts. Defaults to the cyberpunk cyan theme.
    public var theme: ANDXTheme

    public init(
        userEmail: String? = nil,
        userName: String? = nil,
        pageContext: String? = nil,
        initialMode: ChatMode? = nil,
        theme: ANDXTheme = .default
    ) {
        self.userEmail = userEmail
        self.userName = userName
        self.pageContext = pageContext
        self.initialMode = initialMode
        self.theme = theme
    }
}

// MARK: - View (embeddable)

/// A SwiftUI view containing the full support chat panel. Drop this inside a
/// sheet, full-screen cover, or navigation destination.
///
/// If you want the standard "tap the Support button, show chat" pattern, use
/// the `.andxSupportChat(isPresented:config:)` view modifier instead.
public struct ANDXSupportChatView: View {
    @StateObject private var store: ChatStore
    private let onDismiss: () -> Void

    public init(config: ANDXSupportChatConfig, onDismiss: @escaping () -> Void = {}) {
        _store = StateObject(wrappedValue: ChatStore(config: config))
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ChatPanelView(store: store, theme: store.config.theme, onClose: onDismiss)
    }
}

// MARK: - Sheet modifier (the easy one-line integration)

extension View {
    /// Present the ANDX support chat as a sheet when `isPresented` becomes true.
    /// This is the pattern the ANDX app should use: bind it to the state that
    /// gets flipped when the user taps the green Support pill.
    public func andxSupportChat(
        isPresented: Binding<Bool>,
        config: ANDXSupportChatConfig
    ) -> some View {
        modifier(ANDXSupportChatSheetModifier(isPresented: isPresented, config: config))
    }
}

private struct ANDXSupportChatSheetModifier: ViewModifier {
    @Binding var isPresented: Bool
    let config: ANDXSupportChatConfig

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $isPresented) {
                ANDXSupportChatView(config: config) { isPresented = false }
                    .preferredColorScheme(.dark)
            }
    }
}
