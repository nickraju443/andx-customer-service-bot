package com.andx.supportchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andx.supportchat.LocalANDXTheme

@Composable
fun Composer(
    placeholder: String,
    disabled: Boolean,
    onSend: (String) -> Unit,
) {
    val theme = LocalANDXTheme.current
    var text by remember { mutableStateOf("") }
    val canSend = text.trim().isNotEmpty() && !disabled

    fun send() {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || disabled) return
        onSend(trimmed)
        text = ""
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.5f))
            .padding(horizontal = 18.dp, vertical = 12.dp),
    ) {
        Text(
            text = ">",
            color = theme.accent.primary,
            fontFamily = theme.monoFontFamily,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.width(10.dp))

        Box(modifier = Modifier.weight(1f)) {
            // Placeholder renders BEHIND the TextField, so the cursor sits on
            // top when the user starts typing and the placeholder disappears
            // cleanly.
            if (text.isEmpty()) {
                Text(
                    text = placeholder,
                    color = theme.text.muted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }
            BasicTextField(
                value = text,
                onValueChange = { text = it },
                singleLine = false,
                maxLines = 4,
                enabled = !disabled,
                textStyle = TextStyle(color = theme.text.primary, fontSize = 14.sp),
                cursorBrush = SolidColor(theme.accent.primary),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            )
        }

        Spacer(Modifier.width(10.dp))

        Box(
            modifier = Modifier
                .size(width = 34.dp, height = 34.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(if (canSend) theme.accent.primary else Color.Transparent)
                .border(1.dp, theme.border.strong, RoundedCornerShape(3.dp))
                .clickable(enabled = canSend, onClick = ::send),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "▶",
                color = if (canSend) theme.text.inverse else theme.accent.primary,
                fontFamily = theme.monoFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
            )
        }
    }
}
