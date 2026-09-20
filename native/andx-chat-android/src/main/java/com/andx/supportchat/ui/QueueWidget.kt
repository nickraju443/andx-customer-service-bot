package com.andx.supportchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andx.supportchat.LocalANDXTheme
import com.andx.supportchat.api.LiveAgentState

@Composable
fun QueueWidget(liveAgent: LiveAgentState) {
    val theme = LocalANDXTheme.current

    val (title, subtitle, dotColor) = when (liveAgent.queueState) {
        LiveAgentState.QueueState.QUEUED ->
            if (liveAgent.isNext) Triple("You're next", "${liveAgent.queueTotal} IN QUEUE", theme.accent.primary)
            else Triple(
                "Position ${liveAgent.queuePosition} of ${liveAgent.queueTotal}",
                "EST. WAIT ~${liveAgent.estimatedWaitMin} MIN",
                theme.accent.primary,
            )
        LiveAgentState.QueueState.ACTIVE ->
            Triple(
                "${liveAgent.agentName ?: "Live agent"} connected",
                "SEND A MESSAGE, AGENT WILL REPLY",
                theme.accent.online,
            )
        LiveAgentState.QueueState.ENDED ->
            Triple("Chat ended", "TAP 'CHAT WITH A LIVE AGENT' TO RESTART", theme.accent.alert)
        null ->
            Triple("Connecting...", "REACHING SUPPORT", theme.accent.primary)
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(top = 10.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(theme.accent.primary.copy(alpha = 0.03f))
            .border(1.dp, theme.border.strong, RoundedCornerShape(4.dp))
            .padding(13.dp),
    ) {
        Spacer(Modifier.size(9.dp).clip(CircleShape).background(dotColor))
        Spacer(Modifier.width(11.dp))
        Column {
            Text(title, color = theme.text.primary, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
            Text(
                text = subtitle,
                color = theme.text.muted,
                fontFamily = theme.monoFontFamily,
                fontSize = 10.sp,
                letterSpacing = 0.5.sp,
            )
        }
    }
}
