package com.andx.supportchat.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun XoreSphere(size: Dp = 64.dp, showGlow: Boolean = false) {
    Canvas(modifier = Modifier.size(size)) {
        val radius = this.size.minDimension / 2
        val center = Offset(this.size.width / 2, this.size.height / 2)
        drawCircle(
            brush = Brush.radialGradient(
                colorStops = arrayOf(
                    0f to Color(0xFF7DF7FF),
                    0.28f to Color(0xFF00E0FF),
                    0.62f to Color(0xFF0066AA),
                    0.95f to Color(0xFF001624),
                ),
                center = Offset(this.size.width * 0.35f, this.size.height * 0.30f),
                radius = radius * 1.5f,
            ),
            radius = radius,
            center = center,
        )
        // Inner shine
        drawCircle(
            brush = Brush.radialGradient(
                colorStops = arrayOf(
                    0f to Color.White.copy(alpha = 0.55f),
                    0.55f to Color.White.copy(alpha = 0.08f),
                    1f to Color.Transparent,
                ),
                center = Offset(this.size.width * 0.30f, this.size.height * 0.22f),
                radius = radius * 0.9f,
            ),
            radius = radius,
            center = center,
        )
        if (showGlow) {
            drawCircle(
                color = Color(0xFF00E0FF).copy(alpha = 0.35f),
                radius = radius,
                center = center,
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.dp.toPx()),
            )
        }
    }
}
