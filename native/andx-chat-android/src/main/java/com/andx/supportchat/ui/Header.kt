package com.andx.supportchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andx.supportchat.LocalANDXTheme

@Composable
fun Header(
    liveAgentActive: Boolean,
    agentName: String?,
    onClose: () -> Unit,
    onClear: () -> Unit,
    onEndLive: (() -> Unit)?,
) {
    val theme = LocalANDXTheme.current
    Column(Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(theme.accent.primary.copy(alpha = 0.02f))
                .padding(horizontal = 20.dp)
                .padding(top = 18.dp, bottom = 14.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = buildAnnotatedString {
                        append("ANDX ")
                        withStyle(SpanStyle(color = theme.accent.primary)) { append("Intelligence") }
                    },
                    color = theme.text.primary,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Spacer(
                        Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(if (liveAgentActive) theme.accent.alert else theme.accent.online)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = if (liveAgentActive) "LIVE · ${(agentName ?: "AGENT").uppercase()}" else "ONLINE",
                        color = theme.text.secondary,
                        fontFamily = theme.monoFontFamily,
                        fontSize = 10.sp,
                        letterSpacing = 1.2.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                    )
                }
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (liveAgentActive && onEndLive != null) {
                    OutlinedTextButton(
                        label = "End",
                        color = theme.accent.alert,
                        onClick = onEndLive,
                    )
                }
                // Clear: outlined text button in accent color, wider.
                OutlinedTextButton(
                    label = "Clear",
                    color = theme.accent.primary,
                    onClick = onClear,
                )
                // Close: icon-only, subtle round background. Visually distinct.
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.06f))
                        .clickable(onClick = onClose),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "✕",
                        color = theme.text.secondary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        Spacer(
            Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(theme.border.subtle)
        )
    }
}

@Composable
private fun OutlinedTextButton(
    label: String,
    color: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .widthIn(min = 68.dp)
            .height(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .border(1.dp, color, RoundedCornerShape(8.dp))
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = color,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
        )
    }
}
