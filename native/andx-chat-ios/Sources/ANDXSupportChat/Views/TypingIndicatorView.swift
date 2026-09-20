//
//  TypingIndicatorView.swift
//  ANDXSupportChat
//

import SwiftUI

struct TypingIndicatorView: View {
    let theme: ANDXTheme
    @State private var scales: [CGFloat] = [0.4, 0.4, 0.4]

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(theme.accent.primary)
                    .frame(width: 6, height: 6)
                    .scaleEffect(scales[i])
                    .shadow(color: theme.accent.primary.opacity(0.55), radius: 6)
                    .animation(
                        .easeInOut(duration: 0.4).repeatForever(autoreverses: true).delay(Double(i) * 0.15),
                        value: scales[i]
                    )
            }
        }
        .padding(14)
        .onAppear {
            for i in 0..<3 { scales[i] = 1.0 }
        }
    }
}

struct ReplyPreviewView: View {
    let theme: ANDXTheme
    let replyTo: ReplyToContext
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text("↳")
                .font(theme.monoFont)
                .fontWeight(.bold)
                .foregroundColor(theme.accent.primary)
            Text(replyTo.text)
                .font(.system(size: 12))
                .italic()
                .foregroundColor(theme.text.secondary)
                .lineLimit(1)
            Spacer()
            Button(action: onClose) {
                Text("×")
                    .font(.system(size: 18))
                    .foregroundColor(theme.text.muted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(theme.accent.primary.opacity(0.06))
        .overlay(
            Rectangle().frame(width: 2).foregroundColor(theme.accent.primary),
            alignment: .leading
        )
        .padding(.horizontal, 20)
    }
}
