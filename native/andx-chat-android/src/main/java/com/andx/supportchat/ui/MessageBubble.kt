package com.andx.supportchat.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andx.supportchat.LocalANDXTheme
import com.andx.supportchat.api.Message
import com.andx.supportchat.api.Reaction
import com.andx.supportchat.api.Role
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageBubble(
    message: Message,
    reactions: List<Reaction>,
    onReply: (Message) -> Unit,
    onReact: (Reaction) -> Unit,
    onRetry: (() -> Unit)?,
) {
    val theme = LocalANDXTheme.current
    val isUser = message.role == Role.USER
    val isAgent = message.role == Role.AGENT
    var paletteOpen by remember { mutableStateOf(false) }

    if (isUser) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            Column(
                horizontalAlignment = Alignment.End,
                modifier = Modifier.widthIn(max = 280.dp),
            ) {
                message.replyTo?.let { reply ->
                    Row(
                        modifier = Modifier.padding(bottom = 4.dp).padding(start = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Spacer(Modifier.width(2.dp).height(16.dp).background(theme.accent.primary))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "↳ ${reply.text}",
                            color = theme.text.muted,
                            fontSize = 11.sp,
                            fontStyle = FontStyle.Italic,
                            maxLines = 1,
                        )
                    }
                }
                Text(
                    text = message.text,
                    color = Color(0xFFE8F8FF),
                    fontSize = 14.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp, bottomEnd = 2.dp, bottomStart = 10.dp))
                        .background(theme.accent.primary.copy(alpha = 0.12f))
                        .border(
                            1.dp,
                            theme.border.strong,
                            RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp, bottomEnd = 2.dp, bottomStart = 10.dp),
                        )
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    text = formatTime(message.ts),
                    color = theme.text.muted,
                    fontFamily = theme.monoFontFamily,
                    fontSize = 9.sp,
                    textAlign = TextAlign.End,
                )
            }
        }
        return
    }

    // AI or agent
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        Avatar(
            label = avatarLabel(message),
            isAgent = isAgent,
            modifier = Modifier.padding(top = 18.dp),
        )
        Spacer(Modifier.width(8.dp))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = senderLabel(message),
                color = if (isAgent) theme.accent.alert else theme.accent.primary,
                fontFamily = theme.monoFontFamily,
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.6.sp,
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(if (isAgent) theme.accent.alert.copy(alpha = 0.04f) else theme.accent.primary.copy(alpha = 0.025f))
                    .combinedClickable(
                        onClick = {},
                        onLongClick = { paletteOpen = true },
                    )
            ) {
                // Accent rule as a left-anchored overlay — matches the bubble's
                // full height without needing IntrinsicSize.Min + weight, which
                // can crash under specific measurement paths.
                Spacer(
                    Modifier
                        .align(Alignment.CenterStart)
                        .width(2.dp)
                        .fillMaxHeight()
                        .background(if (isAgent) theme.accent.alert else theme.accent.primary)
                )
                Text(
                    text = stripHtml(message.text),
                    color = theme.text.primary,
                    fontSize = 14.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 11.dp, horizontal = 14.dp)
                        .padding(start = 2.dp),
                )
                DropdownMenu(
                    expanded = paletteOpen,
                    onDismissRequest = { paletteOpen = false },
                ) {
                    Reaction.entries.forEach { reaction ->
                        DropdownMenuItem(
                            text = { Text("${reaction.emoji}  React") },
                            onClick = {
                                onReact(reaction)
                                paletteOpen = false
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("↩  Reply") },
                        onClick = {
                            onReply(message)
                            paletteOpen = false
                        },
                    )
                }
            }
            if (reactions.isNotEmpty()) {
                Text(
                    text = reactions.toSet().joinToString("") { it.emoji },
                    color = theme.text.primary,
                    fontSize = 12.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(theme.bg.elevated)
                        .border(1.dp, theme.border.strong, RoundedCornerShape(10.dp))
                        .padding(horizontal = 7.dp, vertical = 2.dp),
                )
            }
            if (message.isError && onRetry != null) {
                Text(
                    text = "↻ RETRY",
                    color = theme.accent.primary,
                    fontFamily = theme.monoFontFamily,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .clickable(onClick = onRetry)
                        .border(1.dp, theme.border.strong, RoundedCornerShape(3.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
            Text(
                text = formatTime(message.ts),
                color = theme.text.muted,
                fontFamily = theme.monoFontFamily,
                fontSize = 9.sp,
            )
        }
    }
}

@Composable
private fun Avatar(label: String, isAgent: Boolean, modifier: Modifier = Modifier) {
    val theme = LocalANDXTheme.current
    Box(
        modifier = modifier
            .size(26.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(if (isAgent) theme.accent.primary else theme.bg.elevated)
            .border(1.dp, if (isAgent) Color.Transparent else theme.border.strong, RoundedCornerShape(4.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (isAgent) theme.text.inverse else theme.accent.primary,
            fontFamily = theme.monoFontFamily,
            fontWeight = FontWeight.Bold,
            fontSize = 10.sp,
        )
    }
}

private fun avatarLabel(message: Message): String {
    if (message.role != Role.AGENT) return "AI"
    val name = message.agentName ?: "LA"
    return name.split(' ').take(2).mapNotNull { it.firstOrNull() }.joinToString("").uppercase().ifEmpty { "LA" }
}

private fun senderLabel(message: Message): String {
    if (message.role != Role.AGENT) return "ANDX AI"
    return (message.agentName ?: "LIVE AGENT").uppercase()
}

private val TIME_FORMAT = SimpleDateFormat("h:mm a", Locale.getDefault())

private fun formatTime(ts: Double): String =
    TIME_FORMAT.format(Date((ts * 1000).toLong()))

// Strip HTML tags from AI responses. Backend sometimes returns <strong>,
// <br>, <em> etc. and Compose Text renders them literally.
private val BR_RE = Regex("<br\\s*/?>", RegexOption.IGNORE_CASE)
private val BLOCK_BREAK_RE = Regex("</(p|div)>\\s*<(p|div)[^>]*>", RegexOption.IGNORE_CASE)
private val TAG_RE = Regex("<[^>]+>")
private val MULTI_NL_RE = Regex("\n{3,}")

private fun stripHtml(input: String): String {
    if (input.isEmpty()) return input
    var s = input
    s = BR_RE.replace(s, "\n")
    s = BLOCK_BREAK_RE.replace(s, "\n\n")
    s = TAG_RE.replace(s, "")
    s = s
        .replace("&nbsp;", " ", ignoreCase = true)
        .replace("&amp;", "&", ignoreCase = true)
        .replace("&lt;", "<", ignoreCase = true)
        .replace("&gt;", ">", ignoreCase = true)
        .replace("&quot;", "\"", ignoreCase = true)
        .replace("&#39;", "'", ignoreCase = true)
        .replace("&mdash;", "—", ignoreCase = true)
        .replace("&ndash;", "–", ignoreCase = true)
    s = MULTI_NL_RE.replace(s, "\n\n")
    return s.trim()
}
