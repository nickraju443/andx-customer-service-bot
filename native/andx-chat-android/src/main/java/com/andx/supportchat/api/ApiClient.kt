package com.andx.supportchat.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * The backend API client. Uses OkHttp under the hood. Every endpoint is a
 * suspend function that runs on IO. Throws typed [ApiException] on non-2xx.
 * Single retry on 502/503, matching the web widget and RN SDK.
 */
class ApiClient(
    baseUrl: String = DEFAULT_BASE_URL,
    okHttpClient: OkHttpClient? = null,
) {
    companion object {
        const val DEFAULT_BASE_URL = "https://andx-bot-245374915379.us-central1.run.app"
    }

    @Volatile
    var baseUrl: String = baseUrl.trimEnd('/')

    private val client: OkHttpClient = okHttpClient ?: OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
        explicitNulls = false
    }

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    // ─── Endpoints ────────────────────────────────────────────────────────

    suspend fun ask(req: AskRequest): AskResponse =
        exchange("/api/ask", "POST", body = req, bodySerializer = AskRequest.serializer(), responseSerializer = AskResponse.serializer())

    suspend fun agentStatus(): AgentStatusResponse =
        exchange("/api/agent-status", "GET", responseSerializer = AgentStatusResponse.serializer())

    suspend fun startHandoff(req: HandoffRequest): HandoffResponse =
        exchange("/api/handoff", "POST", body = req, bodySerializer = HandoffRequest.serializer(), responseSerializer = HandoffResponse.serializer())

    suspend fun sendHandoffMessage(req: HandoffMessageRequest): HandoffOKResponse =
        exchange("/api/handoff-message", "POST", body = req, bodySerializer = HandoffMessageRequest.serializer(), responseSerializer = HandoffOKResponse.serializer())

    suspend fun pollAgentReplies(ticketId: String, ticketToken: String, sinceTs: Double): HandoffPollResponse =
        exchange(
            "/api/handoff-poll",
            "GET",
            query = mapOf(
                "ticket_id" to ticketId,
                "ticket_token" to ticketToken,
                "since_ts" to sinceTs.toLong().toString(),
            ),
            responseSerializer = HandoffPollResponse.serializer(),
        )

    suspend fun pollQueue(ticketId: String, ticketToken: String): HandoffQueueResponse =
        exchange(
            "/api/handoff-queue",
            "GET",
            query = mapOf(
                "ticket_id" to ticketId,
                "ticket_token" to ticketToken,
            ),
            responseSerializer = HandoffQueueResponse.serializer(),
        )

    suspend fun endHandoff(req: HandoffEndRequest): HandoffOKResponse =
        exchange("/api/handoff-end", "POST", body = req, bodySerializer = HandoffEndRequest.serializer(), responseSerializer = HandoffOKResponse.serializer())

    suspend fun sendTranscript(ticketId: String, ticketToken: String): HandoffOKResponse =
        exchange("/api/handoff-transcript", "POST", body = HandoffEndRequest(ticketId, ticketToken), bodySerializer = HandoffEndRequest.serializer(), responseSerializer = HandoffOKResponse.serializer())

    suspend fun sendReaction(req: ReactionRequest): ReactionResponse =
        exchange("/api/reaction", "POST", body = req, bodySerializer = ReactionRequest.serializer(), responseSerializer = ReactionResponse.serializer())

    suspend fun registerPushToken(req: RegisterPushTokenRequest): HandoffOKResponse =
        exchange("/api/register-push-token", "POST", body = req, bodySerializer = RegisterPushTokenRequest.serializer(), responseSerializer = HandoffOKResponse.serializer())

    // ─── Core ─────────────────────────────────────────────────────────────

    private suspend fun <B, R> exchange(
        path: String,
        method: String,
        body: B? = null,
        bodySerializer: KSerializer<B>? = null,
        responseSerializer: KSerializer<R>,
        query: Map<String, String> = emptyMap(),
    ): R = withContext(Dispatchers.IO) {
        val bodyJson: String? = if (body != null && bodySerializer != null) {
            json.encodeToString(bodySerializer, body)
        } else null

        val responseStr = try {
            rawRequest(path, method, query, bodyJson)
        } catch (e: ApiException.BadStatus) {
            if (e.status == 502 || e.status == 503) {
                // Short backoff before retrying, so we don't hammer a struggling backend.
                kotlinx.coroutines.delay(400)
                rawRequest(path, method, query, bodyJson)
            } else {
                throw e
            }
        }
        json.decodeFromString(responseSerializer, responseStr)
    }

    private fun rawRequest(
        path: String,
        method: String,
        query: Map<String, String>,
        bodyJson: String?,
    ): String {
        val urlBuilder = "$baseUrl$path".toHttpUrl().newBuilder()
        for ((k, v) in query) urlBuilder.addQueryParameter(k, v)

        val request = Request.Builder()
            .url(urlBuilder.build())
            .header("Accept", "application/json")
            .method(
                method,
                bodyJson?.toRequestBody(JSON_MEDIA_TYPE),
            )
            .build()

        val response = try {
            client.newCall(request).execute()
        } catch (e: IOException) {
            throw ApiException.Network(e)
        }

        response.use {
            val bodyStr = try {
                response.body?.string().orEmpty()
            } catch (e: IOException) {
                throw ApiException.Network(e)
            }
            if (!response.isSuccessful) {
                if (response.code == 429) throw ApiException.RateLimited
                throw ApiException.BadStatus(response.code, bodyStr)
            }
            return bodyStr
        }
    }
}

sealed class ApiException(message: String, cause: Throwable? = null) : RuntimeException(message, cause) {
    class Network(cause: Throwable) : ApiException(cause.message ?: "Network error", cause)
    class BadStatus(override val status: Int, val body: String) : ApiException("HTTP $status: $body")
    data object RateLimited : ApiException("Rate limited")

    open val status: Int
        get() = -1
}
