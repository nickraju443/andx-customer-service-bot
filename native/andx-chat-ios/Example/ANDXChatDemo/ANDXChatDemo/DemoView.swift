//
//  DemoView.swift
//  ANDX Chat Demo
//
//  Minimal example showing the "green Support pill opens the chat" pattern.
//

import SwiftUI
import ANDXSupportChat

struct DemoView: View {
    @State private var supportOpen = false

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.06).ignoresSafeArea()

            VStack(spacing: 20) {
                HStack {
                    Text("ANDX Demo")
                        .font(.title2.weight(.bold))
                        .foregroundColor(.white)
                    Spacer()
                    SupportPill { supportOpen = true }
                }
                .padding(.top, 12)

                Spacer().frame(height: 40)

                Text("Tap the green Support pill above to open the ANDX support chat.")
                    .font(.body)
                    .foregroundColor(.white.opacity(0.7))
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text("This demo mounts ANDXSupportChatView inside a fullScreenCover. In your real app, wire the pill onTap handler to whatever you already have.")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.5))
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()
            }
            .padding(24)
        }
        .andxSupportChat(
            isPresented: $supportOpen,
            config: ANDXSupportChatConfig(
                userEmail: "demo@andxus.io",
                userName: "Demo User",
                pageContext: "Sample app"
            )
        )
    }
}

struct SupportPill: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(red: 0, green: 1, blue: 0.62))
                    .frame(width: 8, height: 8)
                Text("Support")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(red: 0, green: 1, blue: 0.62))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(Color(red: 0, green: 1, blue: 0.62).opacity(0.2))
            )
        }
    }
}

#Preview {
    DemoView()
}
