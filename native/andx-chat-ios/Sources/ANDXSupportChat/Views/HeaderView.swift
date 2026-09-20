//
//  HeaderView.swift
//  ANDXSupportChat
//

import SwiftUI

struct HeaderView: View {
    let theme: ANDXTheme
    let liveAgentActive: Bool
    let agentName: String?
    let onClose: () -> Void
    let onClear: () -> Void
    let onEndLive: (() -> Void)?

    var body: some View {
        HStack(spacing: 11) {
            VStack(alignment: .leading, spacing: 2) {
                (Text("ANDX ") + Text("Intelligence").foregroundColor(theme.accent.primary))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(theme.text.primary)
                HStack(spacing: 6) {
                    Circle()
                        .fill(liveAgentActive ? theme.accent.alert : theme.accent.online)
                        .frame(width: 6, height: 6)
                    Text(liveAgentActive ? "LIVE · \((agentName ?? "AGENT").uppercased())" : "ONLINE")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(theme.text.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()

            HStack(spacing: 12) {
                if liveAgentActive, let onEndLive {
                    Button(action: onEndLive) {
                        Text("End")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(theme.accent.alert)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(theme.accent.alert, lineWidth: 1)
                            )
                    }
                }
                // Clear button: text label, outlined in accent color.
                Button(action: onClear) {
                    Text("Clear")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.accent.primary)
                        .frame(minWidth: 68, minHeight: 36)
                        .padding(.horizontal, 14)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .strokeBorder(theme.accent.primary, lineWidth: 1)
                        )
                }
                // Close button: icon-only circle, subtle fill. Visually distinct.
                Button(action: onClose) {
                    Text("✕")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.text.secondary)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color.white.opacity(0.06)))
                }
                .accessibilityLabel("Close chat")
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 14)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(theme.border.subtle),
            alignment: .bottom
        )
        .background(theme.accent.primary.opacity(0.02))
    }
}
