//
//  MessageBubbleView.swift
//  ANDXSupportChat
//

import SwiftUI

struct MessageBubbleView: View {
    let theme: ANDXTheme
    let message: Message
    let reactions: [Reaction]
    let onReply: (Message) -> Void
    let onReact: (Reaction) -> Void
    let onRetry: (() -> Void)?

    @State private var showPalette = false

    var body: some View {
        Group {
            if message.role == .user {
                userBubble
            } else {
                aiOrAgentBubble
            }
        }
    }

    private var userBubble: some View {
        HStack {
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                if let replyTo = message.replyTo {
                    Text("↳ \(replyTo.text)")
                        .font(.system(size: 11))
                        .italic()
                        .foregroundColor(theme.text.muted)
                        .lineLimit(1)
                        .padding(.leading, 8)
                        .padding(.vertical, 4)
                        .overlay(
                            Rectangle().frame(width: 2).foregroundColor(theme.accent.primary),
                            alignment: .leading
                        )
                }
                Text(message.text)
                    .font(.system(size: 14))
                    .foregroundColor(Color(red: 0.91, green: 0.97, blue: 1.0))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(theme.accent.primary.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .strokeBorder(theme.border.strong, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                Text(formatTime(message.ts))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(theme.text.muted)
            }
            .frame(maxWidth: 280, alignment: .trailing)
        }
    }

    private var aiOrAgentBubble: some View {
        HStack(alignment: .top, spacing: 8) {
            avatar
                .padding(.top, 18)
            VStack(alignment: .leading, spacing: 4) {
                Text(senderLabel)
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(leftRuleColor)

                Text(Self.stripHTML(message.text))
                    .font(.system(size: 14))
                    .foregroundColor(theme.text.primary)
                    .lineSpacing(3)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(bubbleBg)
                    .overlay(
                        // Left rule + border. Draw the accent rule as a separate
                        // leading-aligned rectangle, and stroke the whole shape
                        // for the outline.
                        ZStack(alignment: .leading) {
                            Rectangle()
                                .fill(theme.border.default)
                                .frame(height: 1)
                                .frame(maxHeight: .infinity, alignment: .top)
                            Rectangle()
                                .fill(theme.border.default)
                                .frame(height: 1)
                                .frame(maxHeight: .infinity, alignment: .bottom)
                            Rectangle()
                                .fill(theme.border.default)
                                .frame(width: 1)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                            Rectangle()
                                .fill(leftRuleColor)
                                .frame(width: 2)
                        }
                    )
                    .contextMenu {
                        Button("Reply") { onReply(message) }
                        ForEach(Reaction.allCases, id: \.self) { reaction in
                            Button(reaction.rawValue) { onReact(reaction) }
                        }
                    }

                if !reactions.isEmpty {
                    Text(Set(reactions).map(\.rawValue).joined())
                        .font(.system(size: 12))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(theme.bg.elevated)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(theme.border.strong, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                if message.isError, let onRetry {
                    Button(action: onRetry) {
                        Text("↻ RETRY")
                            .font(.system(size: 10.5, weight: .bold, design: .monospaced))
                            .foregroundColor(theme.accent.primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .overlay(
                                RoundedRectangle(cornerRadius: 3)
                                    .strokeBorder(theme.border.strong, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }

                Text(formatTime(message.ts))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(theme.text.muted)
            }
            Spacer(minLength: 0)
        }
    }

    private var senderLabel: String {
        if message.role == .agent {
            return (message.agentName ?? "LIVE AGENT").uppercased()
        }
        return "ANDX AI"
    }

    private var leftRuleColor: Color {
        message.role == .agent ? theme.accent.alert : theme.accent.primary
    }

    private var bubbleBg: Color {
        message.role == .agent ? theme.accent.alert.opacity(0.04) : theme.accent.primary.opacity(0.025)
    }

    @ViewBuilder
    private var avatar: some View {
        let label: String = {
            if message.role == .agent {
                let words = (message.agentName ?? "LA").split(separator: " ")
                let initials = words.prefix(2).compactMap { $0.first }.map(String.init).joined()
                return initials.isEmpty ? "LA" : initials.uppercased()
            }
            return "AI"
        }()

        Text(label)
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .foregroundColor(message.role == .agent ? theme.text.inverse : theme.accent.primary)
            .frame(width: 26, height: 26)
            .background(message.role == .agent ? theme.accent.primary : theme.bg.elevated)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(message.role == .agent ? Color.clear : theme.border.strong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private func formatTime(_ ts: TimeInterval) -> String {
        Self.timeFormatter.string(from: Date(timeIntervalSince1970: ts))
    }

    private static let timeFormatter: DateFormatter = {
        let df = DateFormatter()
        df.dateFormat = "h:mm a"
        return df
    }()

    /// Strip HTML tags from AI responses. Backend sometimes returns `<strong>`,
    /// `<br>`, `<em>` etc. and SwiftUI Text renders them literally.
    static func stripHTML(_ input: String) -> String {
        var s = input
        // <br> → newline
        s = s.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: [.regularExpression, .caseInsensitive])
        // </p><p> or </div><div> → double newline
        s = s.replacingOccurrences(of: "</(p|div)>\\s*<(p|div)[^>]*>", with: "\n\n", options: [.regularExpression, .caseInsensitive])
        // Strip remaining tags
        s = s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        // Decode common entities
        let entities: [(String, String)] = [
            ("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
            ("&quot;", "\""), ("&#39;", "'"), ("&mdash;", "\u{2014}"), ("&ndash;", "\u{2013}"),
        ]
        for (from, to) in entities {
            s = s.replacingOccurrences(of: from, with: to, options: .caseInsensitive)
        }
        // Collapse 3+ newlines to 2
        s = s.replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
