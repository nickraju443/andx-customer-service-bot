package com.andx.supportchat

import android.app.Application
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.andx.supportchat.api.ChatMode
import com.andx.supportchat.state.ChatViewModel
import com.andx.supportchat.ui.ChatPanel

/**
 * Public configuration for the ANDX support chat.
 *
 * @property userEmail Pre-fill the email gate. Skip if you don't have it yet.
 * @property userName Pre-fill the name field.
 * @property pageContext Shown to live agents in Zoho so they know which screen the user is on.
 * @property initialMode Tone of AI answers.
 * @property theme Override colors + fonts. Defaults to cyberpunk cyan.
 */
data class ANDXSupportChatConfig(
    val userEmail: String? = null,
    val userName: String? = null,
    val pageContext: String? = null,
    val initialMode: ChatMode? = null,
    val theme: ANDXTheme = ANDXTheme.Default,
)

/**
 * The full support chat panel as a Composable. Drop it into a [ModalBottomSheet],
 * a [Dialog], a full-screen route, or anywhere else you'd render a screen.
 *
 * If you want the "tap the Support pill → show chat" pattern, hoist a
 * `mutableStateOf(false)` in your host screen, flip it on tap, and only render
 * this composable when it's true. When [onDismiss] fires, flip it back to false.
 */
@Composable
fun ANDXSupportChat(
    config: ANDXSupportChatConfig,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val application = context.applicationContext as Application

    val viewModel: ChatViewModel = viewModel(
        factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                ChatViewModel(application, config) as T
        }
    )

    ProvideTheme(config.theme) {
        ChatPanel(viewModel = viewModel, onClose = onDismiss)
    }
}
