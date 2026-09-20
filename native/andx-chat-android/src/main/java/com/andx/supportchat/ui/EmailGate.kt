package com.andx.supportchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andx.supportchat.LocalANDXTheme
import kotlinx.coroutines.launch

@Composable
fun EmailGate(
    initialEmail: String,
    initialName: String?,
    onSubmit: suspend (email: String, name: String, firstMessage: String) -> Unit,
    onCancel: () -> Unit,
) {
    val theme = LocalANDXTheme.current
    var email by remember { mutableStateOf(initialEmail) }
    var name by remember { mutableStateOf(initialName.orEmpty()) }
    var message by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun submit() {
        error = null
        if (!isValidEmail(email)) {
            error = "Please enter a valid email so the agent can reach you."
            return
        }
        if (message.trim().isEmpty()) {
            error = "Tell the agent what you need help with."
            return
        }
        submitting = true
        scope.launch {
            try {
                onSubmit(email.trim(), name.trim(), message.trim())
            } catch (e: Throwable) {
                error = e.message ?: "Could not start chat."
            } finally {
                submitting = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(theme.accent.primary.copy(alpha = 0.04f))
            .border(1.dp, theme.border.strong, RoundedCornerShape(4.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Text("Chat with a live agent", color = theme.text.primary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Text(
            text = "We'll text you back here in the app, and also email a copy. Email is required so the agent can follow up.",
            color = theme.text.muted,
            fontSize = 12.sp,
        )

        LabeledField(label = "EMAIL") {
            TextField(
                value = email,
                onValueChange = { email = it },
                placeholder = { Text("you@example.com", color = theme.text.muted, fontSize = 13.5.sp) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
                colors = fieldColors(theme),
            )
        }
        LabeledField(label = "NAME (OPTIONAL)") {
            TextField(
                value = name,
                onValueChange = { name = it },
                placeholder = { Text("What should we call you?", color = theme.text.muted, fontSize = 13.5.sp) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = fieldColors(theme),
            )
        }
        LabeledField(label = "MESSAGE") {
            TextField(
                value = message,
                onValueChange = { message = it },
                placeholder = { Text("What do you need help with?", color = theme.text.muted, fontSize = 13.5.sp) },
                minLines = 4,
                modifier = Modifier.fillMaxWidth(),
                colors = fieldColors(theme),
            )
        }

        if (error != null) {
            Text(error!!, color = theme.accent.alert, fontFamily = theme.monoFontFamily, fontSize = 12.sp)
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(3.dp))
                .background(theme.accent.primary)
                .clickable(enabled = !submitting, onClick = ::submit)
                .padding(vertical = 13.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (submitting) {
                CircularProgressIndicator(color = theme.text.inverse, modifier = Modifier.height(20.dp))
            } else {
                Text(
                    text = "START LIVE CHAT",
                    color = theme.text.inverse,
                    fontFamily = theme.monoFontFamily,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    letterSpacing = 1.5.sp,
                )
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(3.dp))
                .clickable(onClick = onCancel)
                .border(1.dp, theme.border.strong, RoundedCornerShape(3.dp))
                .padding(vertical = 11.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "CANCEL",
                color = theme.accent.primary,
                fontFamily = theme.monoFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                letterSpacing = 1.3.sp,
            )
        }
    }
}

@Composable
private fun LabeledField(label: String, content: @Composable () -> Unit) {
    val theme = LocalANDXTheme.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            color = theme.accent.primary,
            fontFamily = theme.monoFontFamily,
            fontWeight = FontWeight.Bold,
            fontSize = 10.sp,
            letterSpacing = 1.4.sp,
        )
        content()
    }
}

@Composable
private fun fieldColors(theme: com.andx.supportchat.ANDXTheme) = TextFieldDefaults.colors(
    focusedTextColor = theme.text.primary,
    unfocusedTextColor = theme.text.primary,
    focusedContainerColor = theme.bg.deep,
    unfocusedContainerColor = theme.bg.deep,
    focusedIndicatorColor = theme.accent.primary,
    unfocusedIndicatorColor = theme.border.default,
    cursorColor = theme.accent.primary,
)

private fun isValidEmail(s: String): Boolean {
    val t = s.trim()
    val at = t.indexOf('@')
    if (at <= 0) return false
    val dot = t.indexOf('.', at)
    return dot > at + 1 && dot < t.length - 1
}
