//
//  ChatPanelView.swift
//  ANDXSupportChat
//
//  Top-level view for the chat panel. Composes header + welcome/chat/email-gate
//  + composer. Handles all the routing between subviews.
//

import SwiftUI

public struct ChatPanelView: View {
    @ObservedObject var store: ChatStore
    let theme: ANDXTheme
    let onClose: () -> Void

    public var body: some View {
        VStack(spacing: 0) {
            HeaderView(
                theme: theme,
                liveAgentActive: store.liveAgent.active,
                agentName: store.liveAgent.agentName,
                onClose: onClose,
                onClear: { store.clearChat() },
                onEndLive: store.liveAgent.active ? { Task { await store.endLiveAgent() } } : nil
            )

            switch store.currentView {
            case .welcome:
                WelcomeView(theme: theme, chips: welcomeChips) { chip in
                    if chip.lowercased().contains("live agent") {
                        store.startLiveAgentFlow()
                    } else {
                        store.askAI(chip)
                    }
                }

            case .emailGate:
                EmailGateView(
                    theme: theme,
                    initialEmail: store.email,
                    initialName: nil,
                    onSubmit: { email, name, firstMessage in
                        try await store.startLiveAgent(email: email, name: name.isEmpty ? nil : name, firstMessage: firstMessage)
                    },
                    onCancel: { store.cancelEmailGate() }
                )

            case .chat:
                VStack(spacing: 0) {
                    if store.liveAgent.active {
                        QueueWidgetView(theme: theme, liveAgent: store.liveAgent)
                    }
                    MessagesListView(
                        theme: theme,
                        messages: store.messages,
                        reactions: store.reactions,
                        isStreaming: store.isStreaming,
                        onReply: { msg in
                            store.setPendingReplyTo(ReplyToContext(id: msg.id, role: msg.role, text: String(msg.text.prefix(280))))
                        },
                        onReact: { reaction, msg in
                            store.toggleReaction(reaction, on: msg)
                        },
                        onRetry: { store.retryLast() }
                    )
                    if let replyTo = store.pendingReplyTo {
                        ReplyPreviewView(theme: theme, replyTo: replyTo, onClose: { store.setPendingReplyTo(nil) })
                            .padding(.bottom, 4)
                    }
                    ComposerView(
                        theme: theme,
                        placeholder: store.liveAgent.active ? "Message the live agent…" : "Ask XORE anything…",
                        disabled: false,
                        onSend: { text in
                            if store.liveAgent.active {
                                store.sendLiveMessage(text)
                            } else {
                                store.askAI(text)
                            }
                        }
                    )
                }
            }
        }
        .background(theme.bg.panel.ignoresSafeArea())
        .foregroundColor(theme.text.primary)
        .onAppear { store.onPanelOpened() }
        // NOTE: We intentionally don't stop polling on `.onDisappear`.
        // `.onDisappear` fires when the panel gets a child sheet (keyboard,
        // picker, alert), which we don't want to interpret as "user closed
        // the chat." The store's polling tasks are cancelled naturally when
        // `@StateObject` deallocates on real dismissal.
    }

    private var welcomeChips: [String] {
        if store.agentsAvailable == true {
            return ["What is ANDX?", "How do I sign up?", "Is ANDX free to use?", "Chat with a live agent"]
        }
        return ["What is ANDX?", "How do I sign up?", "Is ANDX free to use?", "How do I deposit?"]
    }
}
