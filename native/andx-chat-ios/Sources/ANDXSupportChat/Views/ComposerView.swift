//
//  ComposerView.swift
//  ANDXSupportChat
//

import SwiftUI

struct ComposerView: View {
    let theme: ANDXTheme
    let placeholder: String
    let disabled: Bool
    let onSend: (String) -> Void

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Text(">")
                .font(theme.monoFont)
                .fontWeight(.bold)
                .foregroundColor(theme.accent.primary)

            TextField(text: $text, prompt: Text(placeholder).foregroundColor(theme.text.muted), axis: .vertical) {
                Text(placeholder)
            }
            .foregroundColor(theme.text.primary)
            .tint(theme.accent.primary)
            .font(.system(size: 14))
            .lineLimit(4, reservesSpace: false)
            .focused($focused)
            .disabled(disabled)
            .onSubmit(send)

            Button(action: send) {
                Text("▶")
                    .font(theme.monoFont)
                    .fontWeight(.bold)
                    .foregroundColor(canSend ? theme.text.inverse : theme.accent.primary)
                    .frame(width: 34, height: 34)
                    .background(canSend ? theme.accent.primary : .clear)
                    .overlay(
                        RoundedRectangle(cornerRadius: 3)
                            .strokeBorder(theme.border.strong, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 3))
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(Color.black.opacity(0.5))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(theme.border.subtle),
            alignment: .top
        )
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !disabled
    }

    private func send() {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onSend(trimmed)
        text = ""
    }
}
