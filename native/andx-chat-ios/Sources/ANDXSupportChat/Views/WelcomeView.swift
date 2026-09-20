//
//  WelcomeView.swift
//  ANDXSupportChat
//

import SwiftUI

struct WelcomeView: View {
    let theme: ANDXTheme
    let chips: [String]
    let onChipPress: (String) -> Void

    var body: some View {
        VStack(spacing: 10) {
            Spacer(minLength: 8)
            XoreSphereView(size: 80, showGlow: true)
                .padding(.bottom, 14)

            (Text("Talk to ") + Text("XORE").foregroundColor(theme.accent.primary))
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(theme.text.primary)
                .multilineTextAlignment(.center)

            Text("Ask anything. Platform, features, security, getting started. Available 24/7.")
                .font(.system(size: 13))
                .foregroundColor(theme.text.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 300)
                .lineSpacing(4)

            VStack(spacing: 8) {
                ForEach(chips, id: \.self) { chip in
                    Button(action: { onChipPress(chip) }) {
                        HStack(spacing: 10) {
                            Text(">")
                                .font(theme.monoFont)
                                .fontWeight(.bold)
                                .foregroundColor(theme.accent.primary)
                            Text(chip)
                                .font(.system(size: 13.5, weight: .medium))
                                .foregroundColor(theme.text.primary)
                            Spacer()
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(theme.accent.primary.opacity(0.04))
                        .overlay(
                            RoundedRectangle(cornerRadius: 3)
                                .strokeBorder(theme.border.default, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: 320)
            .padding(.top, 12)

            Spacer(minLength: 8)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
