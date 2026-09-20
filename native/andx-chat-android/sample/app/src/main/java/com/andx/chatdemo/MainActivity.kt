package com.andx.chatdemo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.andx.supportchat.ANDXSupportChat
import com.andx.supportchat.ANDXSupportChatConfig

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            DemoScreen()
        }
    }
}

@Composable
fun DemoScreen() {
    var supportOpen by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize().background(Color(0xFF0A0A0F))) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Fake "app header" with the Support pill on the right
            Row(
                Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "ANDX Demo",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                )
                SupportPill(onClick = { supportOpen = true })
            }

            Spacer(Modifier.height(60.dp))

            Text(
                text = "Tap the green Support pill above to open the ANDX support chat.",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 14.sp,
            )

            Spacer(Modifier.height(20.dp))

            Text(
                text = "This demo mounts <ANDXSupportChat /> inside a Dialog. In your real app, wire the pill onClick handler to whatever you already have.",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 12.sp,
            )
        }
    }

    if (supportOpen) {
        Dialog(
            onDismissRequest = { supportOpen = false },
            properties = DialogProperties(
                usePlatformDefaultWidth = false,
                dismissOnBackPress = true,
                dismissOnClickOutside = false,
            ),
        ) {
            ANDXSupportChat(
                config = ANDXSupportChatConfig(
                    userEmail = "demo@andxus.io",
                    userName = "Demo User",
                    pageContext = "Sample app",
                ),
                onDismiss = { supportOpen = false },
            )
        }
    }
}

@Composable
private fun SupportPill(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(Color(0xFF00FF9E).copy(alpha = 0.2f))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(Color(0xFF00FF9E))
        )
        Spacer(Modifier.size(6.dp))
        Button(
            onClick = onClick,
            colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFF00FF9E)),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
            modifier = Modifier.height(20.dp),
        ) {
            Text("Support", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
