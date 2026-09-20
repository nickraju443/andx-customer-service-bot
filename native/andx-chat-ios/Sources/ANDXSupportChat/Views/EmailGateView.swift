//
//  EmailGateView.swift
//  ANDXSupportChat
//

import SwiftUI

struct EmailGateView: View {
    let theme: ANDXTheme
    let initialEmail: String
    let initialName: String?
    let onSubmit: (_ email: String, _ name: String, _ firstMessage: String) async throws -> Void
    let onCancel: () -> Void

    @State private var email: String
    @State private var name: String
    @State private var message: String = ""
    @State private var submitting = false
    @State private var error: String? = nil

    init(theme: ANDXTheme, initialEmail: String, initialName: String?, onSubmit: @escaping (_: String, _: String, _: String) async throws -> Void, onCancel: @escaping () -> Void) {
        self.theme = theme
        self.initialEmail = initialEmail
        self.initialName = initialName
        self.onSubmit = onSubmit
        self.onCancel = onCancel
        _email = State(initialValue: initialEmail)
        _name = State(initialValue: initialName ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 9) {
                Text("Chat with a live agent")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(theme.text.primary)

                Text("We'll text you back here in the app, and also email a copy. Email is required so the agent can follow up.")
                    .font(.system(size: 12))
                    .foregroundColor(theme.text.muted)

                labeled("EMAIL") {
                    TextField("you@example.com", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .modifier(FieldStyle(theme: theme))
                }
                labeled("NAME (OPTIONAL)") {
                    TextField("What should we call you?", text: $name)
                        .modifier(FieldStyle(theme: theme))
                }
                labeled("MESSAGE") {
                    TextField("What do you need help with?", text: $message, axis: .vertical)
                        .lineLimit(4, reservesSpace: true)
                        .modifier(FieldStyle(theme: theme))
                }

                if let error {
                    Text(error)
                        .foregroundColor(theme.accent.alert)
                        .font(.system(size: 12, design: .monospaced))
                }

                Button(action: submit) {
                    HStack {
                        if submitting { ProgressView().tint(theme.text.inverse) }
                        Text("START LIVE CHAT")
                            .font(theme.monoFont)
                            .fontWeight(.bold)
                            .tracking(1.5)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(theme.accent.primary)
                    .foregroundColor(theme.text.inverse)
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                }
                .buttonStyle(.plain)
                .disabled(submitting)

                Button(action: onCancel) {
                    Text("CANCEL")
                        .font(theme.monoFont)
                        .fontWeight(.bold)
                        .tracking(1.3)
                        .foregroundColor(theme.accent.primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .overlay(
                            RoundedRectangle(cornerRadius: 3)
                                .strokeBorder(theme.border.strong, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(16)
            .background(theme.accent.primary.opacity(0.04))
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(theme.border.strong, lineWidth: 1)
            )
            .padding(20)
        }
    }

    private func labeled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(theme.monoFont)
                .fontWeight(.bold)
                .foregroundColor(theme.accent.primary)
                .tracking(1.4)
            content()
        }
    }

    private func submit() {
        error = nil
        guard isValidEmail(email) else {
            error = "Please enter a valid email so the agent can reach you."
            return
        }
        let msg = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !msg.isEmpty else {
            error = "Tell the agent what you need help with."
            return
        }
        submitting = true
        Task {
            defer { submitting = false }
            do {
                try await onSubmit(email.trimmingCharacters(in: .whitespaces), name.trimmingCharacters(in: .whitespaces), msg)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func isValidEmail(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespaces)
        guard let at = t.firstIndex(of: "@") else { return false }
        let after = t.index(after: at)
        return after < t.endIndex && t[after..<t.endIndex].contains(".")
    }
}

private struct FieldStyle: ViewModifier {
    let theme: ANDXTheme
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .background(theme.bg.deep)
            .foregroundColor(theme.text.primary)
            .tint(theme.accent.primary)
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(theme.border.default, lineWidth: 1)
            )
            .font(theme.monoFont)
    }
}
