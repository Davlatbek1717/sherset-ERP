package uz.sherset.driver

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Backend API klienti (TZ 2026-07-28 §5). Barcha so'rovlar Bearer-token bilan.
 * Sinxron (IO thread'да chaqiriladi — foreground-service ichida). Xatolar
 * `ApiException` bilan yuqoriga uzatiladi (oflayn-bufer qaror qabul qiladi).
 */
class ApiClient(private val baseUrl: String) {
    private val http = OkHttpClient()
    private val json = "application/json; charset=utf-8".toMediaType()
    @Volatile var token: String? = null

    class ApiException(message: String) : Exception(message)

    /** /auth/login → accessToken. */
    fun login(email: String, password: String): String {
        val body = JSONObject().put("email", email).put("password", password)
        val resp = post("/auth/login", body, auth = false)
        val t = resp.optString("accessToken", "")
        if (t.isEmpty()) throw ApiException("Login javobida accessToken yo'q")
        token = t
        return t
    }

    fun startShift() = post("/driver-tracking/shifts/start", JSONObject())
    fun endShift() = post("/driver-tracking/shifts/end", JSONObject())

    /** Bitta ping. `ping` = {lat,lng,accuracy,speed?,heading?,ts?}. */
    fun sendPing(ping: JSONObject): JSONObject = post("/driver-tracking/ping", ping)

    private fun post(path: String, body: JSONObject, auth: Boolean = true): JSONObject {
        val req = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .post(body.toString().toRequestBody(json))
            .apply { if (auth) token?.let { header("Authorization", "Bearer $it") } }
            .build()
        http.newCall(req).execute().use { r ->
            val text = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw ApiException("HTTP ${r.code}: $text")
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }
}
