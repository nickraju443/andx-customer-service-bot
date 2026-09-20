package com.andx.supportchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andx.supportchat.LocalANDXTheme
import com.andx.supportchat.api.Message
import com.andx.supportchat.api.Reaction
import kotlinx.coroutines.delay

@Composable
fun MessagesList(
    messages: List<Message>,
    reactions: Map<String, List<Reaction>>,
    isStreaming: Boolean,
    onReply: (Message) -> Unit,
    onReact: (Reaction, Message) -> Unit,
    onRetry: () -> Unit,
) {
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size, isStreaming) {
        if (messages.isEmpty() && !isStreaming) return@LaunchedEffect
        // Small delay lets the last item lay out before we animate to it.
        delay(50)
        val target = if (isStreaming) messages.size else messages.size - 1
        listState.animateScrollToItem(target.coerceAtLeast(0))
    }

    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(messages, key = { it.id }) { msg ->
            MessageBubble(
                message = msg,
                reactions = reactions[msg.id].orEmpty(),
                onReply = onReply,
                onReact = { onReact(it, msg) },
                onRetry = if (msg.isError) onRetry else null,
            )
        }
        if (isStreaming) {
            item(key = "typing") { TypingIndicator() }
        }
    }
}

@Composable
fun TypingIndicator() {
    val theme = LocalANDXTheme.current
    var pulseFrame by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(200)
            pulseFrame = (pulseFrame + 1) % 3
        }
    }
    Row(
        modifier = Modifier.padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (i in 0..2) {
            val alpha = if (i == pulseFrame) 1f else 0.4f
            Spacer(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(theme.accent.primary.copy(alpha = alpha))
            )
        }
    }
}

@Composable
fun ReplyPreview(
    replyText: String,
    onClose: () -> Unit,
) {
    val theme = LocalANDXTheme.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .padding(horizontal = 20.dp)
            .background(theme.accent.primary.copy(alpha = 0.06f))
            .padding(horizontal = 14.dp, vertical = 9.dp),
    ) {
        Spacer(Modifier.size(width = 2.dp, height = 16.dp).background(theme.accent.primary))
        Spacer(Modifier.size(8.dp))
        androidx.compose.material3.Text(
            text = replyText,
            color = theme.text.secondary,
            fontSize = 12.sp,
            fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        androidx.compose.material3.Text(
            text = "×",
            color = theme.text.muted,
            fontSize = 18.sp,
            modifier = Modifier
                .padding(start = 8.dp)
                .clickable(onClick = onClose)
        )
    }
}

