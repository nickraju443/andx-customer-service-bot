//
//  Theme.swift
//  ANDXSupportChat
//
//  Cyberpunk cyan on near-black. Matches the web widget + Android SDK exactly.
//  Override any token via ANDXSupportChatConfig.theme in your host app.
//

import SwiftUI

public struct ANDXTheme: @unchecked Sendable {
    public struct Backgrounds: Sendable {
        public var panel: Color
        public var elevated: Color
        public var deep: Color

        public init(panel: Color, elevated: Color, deep: Color) {
            self.panel = panel; self.elevated = elevated; self.deep = deep
        }
    }
    public struct Accents: Sendable {
        public var primary: Color
        public var alert: Color
        public var online: Color

        public init(primary: Color, alert: Color, online: Color) {
            self.primary = primary; self.alert = alert; self.online = online
        }
    }
    public struct TextColors: Sendable {
        public var primary: Color
        public var secondary: Color
        public var muted: Color
        public var inverse: Color

        public init(primary: Color, secondary: Color, muted: Color, inverse: Color) {
            self.primary = primary; self.secondary = secondary; self.muted = muted; self.inverse = inverse
        }
    }
    public struct Borders: Sendable {
        public var `default`: Color
        public var strong: Color
        public var subtle: Color

        public init(default: Color, strong: Color, subtle: Color) {
            self.default = `default`; self.strong = strong; self.subtle = subtle
        }
    }

    public var bg: Backgrounds
    public var accent: Accents
    public var text: TextColors
    public var border: Borders
    public var radius: CGFloat
    public var monoFont: Font

    public init(bg: Backgrounds, accent: Accents, text: TextColors, border: Borders, radius: CGFloat = 6, monoFont: Font = .system(.body, design: .monospaced)) {
        self.bg = bg
        self.accent = accent
        self.text = text
        self.border = border
        self.radius = radius
        self.monoFont = monoFont
    }

    public static let `default` = ANDXTheme(
        bg: Backgrounds(
            panel: Color(red: 0.02, green: 0.02, blue: 0.03),
            elevated: Color(red: 0.03, green: 0.03, blue: 0.05),
            deep: .black
        ),
        accent: Accents(
            primary: Color(red: 0.0, green: 0.88, blue: 1.0),
            alert: Color(red: 1.0, green: 0.18, blue: 0.78),
            online: Color(red: 0.0, green: 1.0, blue: 0.62)
        ),
        text: TextColors(
            primary: Color(red: 0.85, green: 0.88, blue: 0.92),
            secondary: Color(red: 0.85, green: 0.88, blue: 0.92).opacity(0.55),
            muted: Color(red: 0.85, green: 0.88, blue: 0.92).opacity(0.35),
            inverse: .black
        ),
        border: Borders(
            default: Color(red: 0.0, green: 0.88, blue: 1.0).opacity(0.18),
            strong: Color(red: 0.0, green: 0.88, blue: 1.0).opacity(0.4),
            subtle: Color(red: 0.0, green: 0.88, blue: 1.0).opacity(0.08)
        )
    )
}
