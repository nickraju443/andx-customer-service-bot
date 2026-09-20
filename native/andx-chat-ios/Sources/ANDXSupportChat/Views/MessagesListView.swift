//
//  MessagesListView.swift
//  ANDXSupportChat
//

import SwiftUI

struct MessagesListView: View {
    let theme: ANDXTheme
    let messages: [Message]
    let reactions: [String: [Reaction]]
    let isStreaming: Bool
    let onReply: (Message) -> Void
    let onReact: (Reaction, Message) -> Void
    let onRetry: () -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    ForEach(messages) { msg in
                        MessageBubbleView(
                            theme: theme,
                            message: msg,
                            reactions: reactions[msg.id] ?? [],
                            onReply: onReply,
                            onReact: { onReact($0, msg) },
                            onRetry: msg.isError ? onRetry : nil
                        )
                        .id(msg.id)
                    }
                    if isStreaming {
                        TypingIndicatorView(theme: theme)
                            .id("typing")
                    }
                }
                .padding(20)
            }
            .onChange(of: messages.count) { _ in scrollToBottom(proxy: proxy) }
            .onChange(of: isStreaming) { _ in scrollToBottom(proxy: proxy) }
            .onAppear { scrollToBottom(proxy: proxy, animated: false) }
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy, animated: Bool = true) {
        DispatchQueue.main.async {
            let target: String? = isStreaming ? "typing" : messages.last?.id
            guard let target else { return }
            if animated {
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(target, anchor: .bottom) }
            } else {
                proxy.scrollTo(target, anchor: .bottom)
            }
        }
    }
}
