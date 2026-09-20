package com.andx.supportchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andx.supportchat.LocalANDXTheme

@Composable
fun Welcome(
    chips: List<String>,
    onChipPress: (String) -> Unit,
) {
    val theme = LocalANDXTheme.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(Modifier.height(8.dp))
        XoreSphere(size = 80.dp, showGlow = true)
        Spacer(Modifier.height(18.dp))

        Text(
            text = buildAnnotatedString {
                append("Talk to ")
                withStyle(SpanStyle(color = theme.accent.primary)) { append("XORE") }
            },
            color = theme.text.primary,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(10.dp))

        Text(
            text = "Ask anything. Platform, features, security, getting started. Available 24/7.",
            color = theme.text.secondary,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 300.dp),
        )
        Spacer(Modifier.height(20.dp))

        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.widthIn(max = 320.dp).fillMaxWidth(),
        ) {
            chips.forEach { chip ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(3.dp))
                        .clickable { onChipPress(chip) }
                        .background(theme.accent.primary.copy(alpha = 0.04f))
                        .border(1.dp, theme.border.default, RoundedCornerShape(3.dp))
                        .padding(vertical = 12.dp, horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = ">",
                        color = theme.accent.primary,
                        fontFamily = theme.monoFontFamily,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = chip,
                        color = theme.text.primary,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}
