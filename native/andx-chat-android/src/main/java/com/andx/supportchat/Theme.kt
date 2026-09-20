package com.andx.supportchat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

/**
 * Cyberpunk cyan on near-black. Matches the web widget + iOS SDK exactly.
 * Override any token via [ANDXSupportChatConfig.theme].
 */
@Immutable
data class ANDXTheme(
    val bg: Backgrounds,
    val accent: Accents,
    val text: TextColors,
    val border: Borders,
    val radius: Radius = Radius(),
    val fontFamily: FontFamily = FontFamily.Default,
    val monoFontFamily: FontFamily = FontFamily.Monospace,
) {
    @Immutable
    data class Backgrounds(val panel: Color, val elevated: Color, val deep: Color)

    @Immutable
    data class Accents(val primary: Color, val alert: Color, val online: Color)

    @Immutable
    data class TextColors(val primary: Color, val secondary: Color, val muted: Color, val inverse: Color)

    @Immutable
    data class Borders(val default: Color, val strong: Color, val subtle: Color)

    @Immutable
    data class Radius(val sm: Int = 3, val md: Int = 4, val lg: Int = 6)

    companion object {
        val Default = ANDXTheme(
            bg = Backgrounds(
                panel = Color(0xFF050508),
                elevated = Color(0xFF08080D),
                deep = Color(0xFF000000),
            ),
            accent = Accents(
                primary = Color(0xFF00E0FF),
                alert = Color(0xFFFF2EC8),
                online = Color(0xFF00FF9E),
            ),
            text = TextColors(
                primary = Color(0xFFD8E0EC),
                secondary = Color(0xFFD8E0EC).copy(alpha = 0.55f),
                muted = Color(0xFFD8E0EC).copy(alpha = 0.35f),
                inverse = Color(0xFF000000),
            ),
            border = Borders(
                default = Color(0xFF00E0FF).copy(alpha = 0.18f),
                strong = Color(0xFF00E0FF).copy(alpha = 0.4f),
                subtle = Color(0xFF00E0FF).copy(alpha = 0.08f),
            ),
        )
    }
}

val LocalANDXTheme = compositionLocalOf { ANDXTheme.Default }

@Composable
internal fun ProvideTheme(theme: ANDXTheme, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalANDXTheme provides theme, content = content)
}
