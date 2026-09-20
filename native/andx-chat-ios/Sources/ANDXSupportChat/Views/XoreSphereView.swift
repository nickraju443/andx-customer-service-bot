//
//  XoreSphereView.swift
//  ANDXSupportChat
//
//  The XORE cyan sphere. Radial gradient + subtle inner shine. Used in the
//  header, welcome screen, and (optionally) as a FAB.
//

import SwiftUI

public struct XoreSphereView: View {
    let size: CGFloat
    let showGlow: Bool

    public init(size: CGFloat = 64, showGlow: Bool = false) {
        self.size = size
        self.showGlow = showGlow
    }

    public var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(
                    colors: [
                        Color(red: 0.49, green: 0.97, blue: 1.0),
                        Color(red: 0.0, green: 0.88, blue: 1.0),
                        Color(red: 0.0, green: 0.4, blue: 0.67),
                        Color(red: 0.0, green: 0.086, blue: 0.14),
                    ],
                    center: UnitPoint(x: 0.35, y: 0.30),
                    startRadius: 0,
                    endRadius: size * 0.75
                ))

            Circle()
                .fill(RadialGradient(
                    colors: [
                        .white.opacity(0.55),
                        .white.opacity(0.08),
                        .clear,
                    ],
                    center: UnitPoint(x: 0.30, y: 0.22),
                    startRadius: 0,
                    endRadius: size * 0.5
                ))

            if showGlow {
                Circle()
                    .strokeBorder(Color(red: 0.0, green: 0.88, blue: 1.0).opacity(0.35), lineWidth: 1)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}
