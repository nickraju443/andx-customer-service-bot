package com.andx.supportchat.state

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.andx.supportchat.api.ChatMode
import com.andx.supportchat.api.LiveAgentState
import com.andx.supportchat.api.Message
import com.andx.supportchat.api.Reaction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.util.UUID

private val Context.andxDataStore: DataStore<Preferences> by preferencesDataStore(name = "xore_chat")

private object Keys {
    val chatHistory = stringPreferencesKey("xore.chatHistory")
    val liveAgent = stringPreferencesKey("xore.liveAgent")
    val lastEmail = stringPreferencesKey("xore.lastEmail")
    val sessionId = stringPreferencesKey("xore.sessionId")
    val mode = stringPreferencesKey("xore.mode")
    val reactions = stringPreferencesKey("xore.reactions")
}

/**
 * Persistence-backed store. All operations suspend so they don't block the UI
 * thread. Mirrors keys used by web, iOS, and RN SDKs.
 */
class Persistence(
    context: Context,
    /**
     * Scope used for fire-and-forget writes. Defaults to a Persistence-owned
     * scope; pass `viewModelScope` (or your own) to have writes cancel with
     * the ViewModel's lifecycle. NOTE: the default scope never cancels and is
     * fine for the application's lifetime, but is not tied to any component.
     */
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
) {
    private val store = context.applicationContext.andxDataStore
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
        explicitNulls = false
    }

    suspend fun sessionId(): String {
        val current = store.data.first()[Keys.sessionId]
        if (!current.isNullOrEmpty()) return current
        val newId = "android-${UUID.randomUUID()}"
        store.edit { it[Keys.sessionId] = newId }
        return newId
    }

    suspend fun loadMessages(): List<Message> {
        val raw = store.data.first()[Keys.chatHistory] ?: return emptyList()
        return try {
            json.decodeFromString(ListSerializer(Message.serializer()), raw).takeLast(50)
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun saveMessagesAsync(messages: List<Message>) {
        scope.launch {
            val trimmed = messages.takeLast(50)
            val encoded = json.encodeToString(ListSerializer(Message.serializer()), trimmed)
            store.edit { it[Keys.chatHistory] = encoded }
        }
    }

    suspend fun loadLiveAgent(): LiveAgentState? {
        val raw = store.data.first()[Keys.liveAgent] ?: return null
        return try {
            json.decodeFromString(LiveAgentState.serializer(), raw)
        } catch (_: Exception) {
            null
        }
    }

    fun saveLiveAgentAsync(state: LiveAgentState) {
        scope.launch {
            val encoded = json.encodeToString(LiveAgentState.serializer(), state)
            store.edit { it[Keys.liveAgent] = encoded }
        }
    }

    fun clearLiveAgentAsync() {
        scope.launch {
            store.edit { it.remove(Keys.liveAgent) }
        }
    }

    suspend fun loadEmail(): String? = store.data.first()[Keys.lastEmail]

    fun saveEmailAsync(email: String) {
        scope.launch { store.edit { it[Keys.lastEmail] = email } }
    }

    suspend fun loadMode(): ChatMode {
        val raw = store.data.first()[Keys.mode] ?: return ChatMode.BEGINNER
        return if (raw.equals("pro", ignoreCase = true)) ChatMode.PRO else ChatMode.BEGINNER
    }

    fun saveModeAsync(mode: ChatMode) {
        scope.launch { store.edit { it[Keys.mode] = mode.name.lowercase() } }
    }

    suspend fun loadReactions(): Map<String, List<Reaction>> {
        val raw = store.data.first()[Keys.reactions] ?: return emptyMap()
        return try {
            val stringMap = json.decodeFromString(MapSerializer(String.serializer(), ListSerializer(String.serializer())), raw)
            stringMap.mapValues { (_, emojis) -> emojis.mapNotNull { Reaction.fromEmoji(it) } }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun saveReactionsAsync(reactions: Map<String, List<Reaction>>) {
        scope.launch {
            val asStrings = reactions.mapValues { (_, list) -> list.map { it.emoji } }
            val encoded = json.encodeToString(MapSerializer(String.serializer(), ListSerializer(String.serializer())), asStrings)
            store.edit { it[Keys.reactions] = encoded }
        }
    }
}
