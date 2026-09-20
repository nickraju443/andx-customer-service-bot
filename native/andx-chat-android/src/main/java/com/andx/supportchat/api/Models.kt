package com.andx.supportchat.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ─── Domain ────────────────────────────────────────────────────────────────

@Serializable
enum class Role {
    @SerialName("user") USER,
    @SerialName("ai") AI,
    @SerialName("agent") AGENT,
}

@Serializable
enum class ChatMode {
    @SerialName("beginner") BEGINNER,
    @SerialName("pro") PRO,
}

enum class Reaction(val emoji: String) {
    THUMBS_UP("👍"),
    HEART("❤️"),
    LAUGH("😂"),
    WOW("😮"),
    CRY("😢"),
    THUMBS_DOWN("👎");

    companion object {
        fun fromEmoji(e: String): Reaction? = entries.firstOrNull { it.emoji == e }
    }
}

@Serializable
data class ReplyToContext(
    val id: String,
    val role: Role,
    val text: String,
)

@Serializable
data class Message(
    val id: String,
    val role: Role,
    val text: String,
    val ts: Double,
    val agentName: String? = null,
    val replyTo: ReplyToContext? = null,
    val isError: Boolean = false,
    val isPending: Boolean = false,
)

@Serializable
data class LiveAgentState(
    val active: Boolean = false,
    val ticketId: String = "",
    val ticketToken: String = "",
    val email: String = "",
    val agentName: String? = null,
    val queueState: QueueState? = null,
    val queuePosition: Int = 0,
    val queueTotal: Int = 0,
    val estimatedWaitMin: Int = 0,
    val isNext: Boolean = false,
    val lastSeenTs: Double = 0.0,
) {
    @Serializable
    enum class QueueState {
        @SerialName("queued") QUEUED,
        @SerialName("active") ACTIVE,
        @SerialName("ended") ENDED,
    }
}

// ─── /api/ask ──────────────────────────────────────────────────────────────

@Serializable
data class ChatHistoryItem(val q: String, val a: String)

@Serializable
data class AskRequest(
    val question: String,
    val mode: String? = null,
    val history: List<ChatHistoryItem>? = null,
    @SerialName("reply_to") val replyTo: ReplyToPreview? = null,
) {
    @Serializable
    data class ReplyToPreview(@SerialName("content_preview") val contentPreview: String)
}

@Serializable
data class AskResponse(
    val answer: String,
    @SerialName("follow_ups") val followUps: List<String>? = null,
    @SerialName("handoff_offer") val handoffOffer: Boolean? = null,
)

// ─── /api/agent-status ─────────────────────────────────────────────────────

@Serializable
data class AgentStatusResponse(val available: Boolean, val configured: Boolean)

// ─── /api/handoff ──────────────────────────────────────────────────────────

@Serializable
data class HandoffRequest(
    val email: String,
    @SerialName("initial_message") val initialMessage: String? = null,
    @SerialName("last_message") val lastMessage: String? = null,
    val history: List<ChatHistoryItem>? = null,
    val name: String? = null,
    @SerialName("page_url") val pageUrl: String? = null,
    @SerialName("session_id") val sessionId: String? = null,
)

@Serializable
data class HandoffResponse(
    val ok: Boolean,
    val message: String? = null,
    @SerialName("agents_available") val agentsAvailable: Boolean? = null,
    @SerialName("ticket_id") val ticketId: String,
    @SerialName("ticket_token") val ticketToken: String,
    @SerialName("start_ts") val startTs: Double,
)

// ─── /api/handoff-message ──────────────────────────────────────────────────

@Serializable
data class HandoffMessageRequest(
    @SerialName("ticket_id") val ticketId: String,
    @SerialName("ticket_token") val ticketToken: String,
    val message: String,
    @SerialName("reply_to") val replyTo: AskRequest.ReplyToPreview? = null,
)

@Serializable
data class HandoffOKResponse(val ok: Boolean, val message: String? = null)

// ─── /api/reaction ─────────────────────────────────────────────────────────

@Serializable
data class ReactionRequest(
    @SerialName("message_id") val messageId: String,
    @SerialName("message_role") val messageRole: String,
    val reaction: String,
    @SerialName("message_preview") val messagePreview: String? = null,
    @SerialName("ticket_id") val ticketId: String? = null,
    @SerialName("ticket_token") val ticketToken: String? = null,
    val history: List<ChatHistoryItem>? = null,
    val mode: String? = null,
)

@Serializable
data class ReactionResponse(val ok: Boolean, @SerialName("follow_up") val followUp: String? = null)

// ─── /api/handoff-queue ────────────────────────────────────────────────────

@Serializable
data class HandoffQueueResponse(
    val ok: Boolean,
    val state: String,
    val position: Int = 0,
    val total: Int = 0,
    @SerialName("is_next") val isNext: Boolean? = null,
    @SerialName("estimated_wait_min") val estimatedWaitMin: Int? = null,
    @SerialName("agent_name") val agentName: String? = null,
)

// ─── /api/handoff-end ──────────────────────────────────────────────────────

@Serializable
data class HandoffEndRequest(
    @SerialName("ticket_id") val ticketId: String,
    @SerialName("ticket_token") val ticketToken: String,
)

// ─── /api/handoff-poll ─────────────────────────────────────────────────────

@Serializable
data class HandoffReply(
    val id: String,
    val content: String,
    @SerialName("agent_name") val agentName: String,
    val ts: Double,
)

@Serializable
data class HandoffPollResponse(
    val ok: Boolean,
    val replies: List<HandoffReply>,
    @SerialName("now_ts") val nowTs: Double,
)

// ─── /api/register-push-token ──────────────────────────────────────────────

@Serializable
data class RegisterPushTokenRequest(
    @SerialName("session_id") val sessionId: String,
    @SerialName("ticket_id") val ticketId: String? = null,
    @SerialName("ticket_token") val ticketToken: String? = null,
    val platform: String,
    @SerialName("push_token") val pushToken: String,
    @SerialName("device_id") val deviceId: String? = null,
)
