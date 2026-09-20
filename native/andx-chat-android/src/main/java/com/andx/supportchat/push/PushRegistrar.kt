package com.andx.supportchat.push

import android.content.Context
import android.os.Build
import android.provider.Settings
import com.andx.supportchat.api.ApiClient
import com.andx.supportchat.api.RegisterPushTokenRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Registers a device's FCM token with the ANDX backend so agent replies push
 * through when the app is closed.
 *
 * Backend endpoint: POST /api/register-push-token (live in production).
 * Firebase Messaging is a SOFT dependency — the SDK doesn't require it at
 * build time. The host app installs Firebase, fetches a token, and passes it
 * here.
 *
 * Typical wiring in your Application.onCreate:
 *
 *   FirebaseMessaging.getInstance().token.addOnCompleteListener { t ->
 *       if (t.isSuccessful) {
 *           GlobalScope.launch {
 *               ANDXPushRegistrar.register(context, sessionId, t.result)
 *           }
 *       }
 *   }
 */
object ANDXPushRegistrar {
    // Lazy so the host app can swap the base URL via `configure(client = ...)`
    // before the first register call. Backing field starts null.
    private var _client: ApiClient? = null
    val client: ApiClient
        get() = _client ?: ApiClient().also { _client = it }

    /**
     * Optionally override the ApiClient (e.g. to point at staging). Call this
     * before your first `register()` invocation.
     */
    fun configure(client: ApiClient) {
        _client = client
    }

    @Volatile private var lastRegistrationKey: String? = null

    /**
     * Register the FCM token. Idempotent — safe to call on every app open.
     *
     * @param context Any Context (used only to read the Android ID for debugging).
     * @param sessionId Stable per-install identifier.
     * @param fcmToken The token from Firebase Messaging.
     * @param ticketId Optional active live-agent ticket.
     * @param ticketToken Optional HMAC pair for [ticketId].
     * @return true on success, false on failure. Never throws.
     */
    suspend fun register(
        context: Context,
        sessionId: String,
        fcmToken: String,
        ticketId: String? = null,
        ticketToken: String? = null,
    ): Boolean = withContext(Dispatchers.IO) {
        // Include the ticketId in the dedupe key so re-binding the same token
        // to a new active ticket still hits the backend.
        val key = "$fcmToken|${ticketId.orEmpty()}"
        if (lastRegistrationKey == key) return@withContext true

        val deviceId = runCatching {
            @Suppress("HardwareIds")
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        }.getOrNull()

        val req = RegisterPushTokenRequest(
            sessionId = sessionId,
            ticketId = ticketId,
            ticketToken = ticketToken,
            platform = "android",
            pushToken = fcmToken,
            deviceId = deviceId,
        )
        try {
            client.registerPushToken(req)
            // Only mark as deduped AFTER success. A failed call should retry
            // next time the caller asks.
            lastRegistrationKey = key
            true
        } catch (e: CancellationException) {
            // Never swallow cancellations — that breaks structured concurrency.
            throw e
        } catch (_: Throwable) {
            false
        }
    }
}

/**
 * Parse an incoming push payload from FCM. Returns null if it isn't an ANDX
 * agent_reply push — hand it back to your normal push handler in that case.
 *
 * Call from your FirebaseMessagingService.onMessageReceived(remoteMessage):
 *
 *   val agentPush = ANDXPushPayload.parse(remoteMessage.data)
 *   if (agentPush != null) {
 *       // show notification, deep-link into Support screen, etc.
 *   }
 */
data class ANDXAgentReplyPush(
    val ticketId: String,
    val agentName: String,
    val title: String,
    val body: String,
) {
    companion object {
        fun parse(data: Map<String, String>): ANDXAgentReplyPush? {
            if (data["type"] != "agent_reply") return null
            return ANDXAgentReplyPush(
                ticketId = data["ticket_id"].orEmpty(),
                agentName = data["agent_name"] ?: "Live agent",
                title = data["title"] ?: "${data["agent_name"] ?: "Live agent"} replied",
                body = data["body"] ?: "",
            )
        }
    }
}
