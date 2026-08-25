package uz.sherset.tsd

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Backend klienti (G-reja G5). `driver-app/ApiClient.kt` naqshi: sinxron,
 * IO thread'da chaqiriladi, xatolar `ApiException` bilan yuqoriga chiqadi.
 *
 * 🔴 Ilova FAQAT TSD allowlist'idagi yo'llarga boradi (`tsd-policy.ts`).
 * Ro'yxatdan tashqarisi serverda 403 bo'ladi — ya'ni bu yerga «tezkorlik
 * uchun» `/products` qo'shib qo'yish ISHLAMAYDI va shunday bo'lishi kerak:
 * narx ombor xodimiga ko'rinmaydi.
 */
class ApiClient(private val baseUrl: String) {

    private val http = OkHttpClient.Builder()
        // Ombor Wi-Fi'si zaif — uzun timeout qayta urinishdan yaxshiroq
        // (qayta urinish ikki marta tasdiqlashga olib kelishi mumkin).
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val json = "application/json; charset=utf-8".toMediaType()

    @Volatile
    var accessToken: String? = null

    class ApiException(val code: Int, message: String) : Exception(message)

    /**
     * Terminal kirishi — qurilma kaliti + PIN (`POST /auth/tsd-login`).
     *
     * Javobda `refreshToken` TANADA keladi (kassa qobig'idan farq): Android
     * klienti brauzer emas, cookie idorasi yo'q.
     */
    fun login(deviceId: String, deviceSecret: String, pin: String, appVersion: String): JSONObject {
        val body = JSONObject()
            .put("deviceId", deviceId)
            .put("deviceSecret", deviceSecret)
            .put("pin", pin)
            .put("appVersion", appVersion)
        val resp = post("/auth/tsd-login", body, auth = false)
        val t = resp.optString("accessToken")
        if (t.isEmpty()) throw ApiException(0, "Login javobida accessToken yo'q")
        accessToken = t
        return resp
    }

    /** Sessiyani uzaytirish. Terminal bekor qilingan bo'lsa 401 → qayta PIN. */
    fun refresh(refreshToken: String): JSONObject {
        val body = JSONObject().put("refreshToken", refreshToken)
        val resp = post("/auth/refresh", body, auth = false)
        val t = resp.optString("accessToken")
        if (t.isNotEmpty()) accessToken = t
        return resp
    }

    /** «Mening topshiriqlarim» — server `assigneeId` bo'yicha filtrlaydi (G2). */
    fun myTasks(employeeId: String): JSONArray {
        val resp = get("/restock-tasks?assigneeId=" + enc(employeeId) + "&assigneeOpen=1")
        return resp.optJSONArray("items") ?: JSONArray()
    }

    fun confirmLine(taskId: String, lineId: String, qty: String): JSONObject =
        post("/restock-tasks/" + taskId + "/lines/" + lineId + "/confirm", JSONObject().put("qty", qty))

    fun confirmScan(taskId: String, code: String): JSONObject =
        post("/restock-tasks/" + taskId + "/confirm-scan", JSONObject().put("code", code))

    /** NARXSIZ skan-qidiruv (`tsd-scan.ts`). */
    fun scan(code: String): JSONObject = get("/tsd/scan?code=" + enc(code))

    /** Yacheyka yorlig'i bo'yicha qidirish. */
    fun cellByBarcode(code: String): JSONObject =
        get("/admin/stores/cells/by-barcode?code=" + enc(code))

    fun cellMove(productId: String, body: JSONObject): JSONObject =
        post("/products/" + productId + "/cell-move", body)

    fun cellPlace(productId: String, body: JSONObject): JSONObject =
        post("/products/" + productId + "/cell-place", body)

    fun cellStock(storeId: String, cellId: String): JSONObject =
        get("/admin/stores/" + storeId + "/cells/" + cellId + "/stock")

    fun setCellStock(storeId: String, cellId: String, body: JSONObject): JSONObject =
        put("/admin/stores/" + storeId + "/cells/" + cellId + "/stock", body)

    /**
     * Yangi topshiriq signali — POLLING (SSE emas).
     *
     * Reja «SSE yoki polling» degan edi; skelet POLLING'ni tanlaydi: SSE
     * ulanishi ekran o'chganda va Wi-Fi almashganda uziladi, uni Android'da
     * tirik ushlash uchun foreground-service kerak bo'lardi — ya'ni
     * `driver-app` ning butun murakkabligi. Ombor ilovasiga u kerak emas
     * (terminal qo'lda, ekran ochiq). Narxi: kechikish <= interval.
     */
    fun notifications(): JSONObject = get("/notifications?limit=20")

    // -- ichki ---------------------------------------------------------------

    private fun enc(s: String): String = java.net.URLEncoder.encode(s, "UTF-8")

    private fun get(path: String): JSONObject =
        send(Request.Builder().url(baseUrl.trimEnd('/') + path).get(), auth = true)

    private fun post(path: String, body: JSONObject, auth: Boolean = true): JSONObject =
        send(
            Request.Builder().url(baseUrl.trimEnd('/') + path)
                .post(body.toString().toRequestBody(json)),
            auth,
        )

    private fun put(path: String, body: JSONObject): JSONObject =
        send(
            Request.Builder().url(baseUrl.trimEnd('/') + path)
                .put(body.toString().toRequestBody(json)),
            auth = true,
        )

    private fun send(builder: Request.Builder, auth: Boolean): JSONObject {
        if (auth) accessToken?.let { builder.header("Authorization", "Bearer " + it) }
        http.newCall(builder.build()).execute().use { r ->
            val text = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw ApiException(r.code, "HTTP " + r.code + ": " + text)
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }
}
