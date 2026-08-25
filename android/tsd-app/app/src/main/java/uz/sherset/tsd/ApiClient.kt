package uz.sherset.tsd

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Backend klienti (G-reja G5 skeleti, G6 da ish ekranlari bilan to'ldirildi).
 * `driver-app/ApiClient.kt` naqshi: sinxron, IO thread'da chaqiriladi, xatolar
 * `ApiException` bilan yuqoriga chiqadi.
 *
 * 🔴 Ilova FAQAT TSD allowlist'idagi yo'llarga boradi (`tsd-policy.ts`).
 * Ro'yxatdan tashqarisi serverda 403 bo'ladi — ya'ni bu yerga «tezkorlik
 * uchun» `/products` qo'shib qo'yish ISHLAMAYDI va shunday bo'lishi kerak:
 * narx ombor xodimiga ko'rinmaydi.
 *
 * 🔴 G6 — IDEMPOTENTLIK KALITI. Qoldiqni siljitadigan har amal `clientOpId`
 * bilan boradi (`shared/client-op.ts`): aloqa uzilib qayta yuborilgan amal
 * ikkinchi marta BAJARILMAYDI. Kalit AMAL YARATILGANDA beriladi va qayta
 * yuborishda O'ZGARMAYDI — aks holda butun mexanizm ma'nosini yo'qotadi.
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

    class ApiException(val code: Int, message: String) : Exception(message) {
        /**
         * Xato QAYTA URINISHGA arziydimi. 4xx — arzimaydi (so'rovning o'zi
         * noto'g'ri; navbatda abadiy aylanardi), 5xx va tarmoq — arziydi.
         * Aynan shu farq oflayn navbatning tiqilib qolmasligini ta'minlaydi.
         */
        val retriable: Boolean get() = code == 0 || code >= 500
    }

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

    // ── Topshiriqlar ────────────────────────────────────────────────────────

    /**
     * «Mening topshiriqlarim» — server `assigneeId` bo'yicha filtrlaydi (G2).
     *
     * `status` YUBORILMAYDI: omborchiga bugungi hamma topshirig'i kerak,
     * jumladan yopilganlari (u nimani yig'ib bo'lganini ko'rishi kerak).
     * Ro'yxatdagi `openCount` qaysilari qolganini aytadi (G6).
     */
    fun myTasks(employeeId: String): JSONArray {
        val resp = get("/restock-tasks?assigneeId=" + enc(employeeId) + "&limit=50")
        return resp.optJSONArray("items") ?: JSONArray()
    }

    /** Topshiriq detali — qatorlar YACHEYKA MARSHRUTI tartibida (server saralaydi). */
    fun task(taskId: String): JSONObject = get("/restock-tasks/" + taskId)

    fun confirmLine(taskId: String, lineId: String, clientOpId: String): JSONObject =
        post(
            "/restock-tasks/" + taskId + "/lines/" + lineId + "/confirm",
            JSONObject().put("clientOpId", clientOpId),
        )

    fun confirmScan(taskId: String, productId: String, clientOpId: String): JSONObject =
        post(
            "/restock-tasks/" + taskId + "/confirm-scan",
            JSONObject().put("productId", productId).put("clientOpId", clientOpId),
        )

    /**
     * G6 — «javonda shuncha topolmadim». `qty` MUTLAQ son (delta emas):
     * qayta yuborilgan amal AYNI natijani beradi.
     */
    fun shortage(
        taskId: String,
        lineId: String,
        qty: String,
        note: String?,
        clientOpId: String,
    ): JSONObject {
        val body = JSONObject().put("qty", qty).put("clientOpId", clientOpId)
        if (!note.isNullOrBlank()) body.put("note", note)
        return post("/restock-tasks/" + taskId + "/lines/" + lineId + "/shortage", body)
    }

    // ── Skan ────────────────────────────────────────────────────────────────

    /** NARXSIZ skan-qidiruv (`tsd-scan.ts`). */
    fun scan(code: String): JSONObject = get("/tsd/scan?code=" + enc(code))

    /** Yacheyka yorlig'i bo'yicha qidirish. */
    fun cellByBarcode(code: String): JSONObject =
        get("/admin/stores/cells/by-barcode?code=" + enc(code))

    // ── Joylashtirish / ko'chirish ──────────────────────────────────────────

    /** Yacheykadan yacheykaga ko'chirish. */
    fun cellMove(
        productId: String,
        storeId: String,
        fromCellId: String,
        toCellId: String,
        qty: String,
        clientOpId: String,
    ): JSONObject = send(
        "POST",
        "/products/" + productId + "/cell-move",
        JSONObject()
            .put("storeId", storeId)
            .put("fromCellId", fromCellId)
            .put("toCellId", toCellId)
            .put("qty", qty)
            .put("clientOpId", clientOpId),
    )

    /** Yacheykasiz qoldiqni (jumladan «Taqsimlanmagan» hovuzdan) yacheykaga joylash. */
    fun cellPlace(
        productId: String,
        toCellId: String,
        qty: String,
        clientOpId: String,
    ): JSONObject = send(
        "POST",
        "/products/" + productId + "/cell-place",
        JSONObject().put("toCellId", toCellId).put("qty", qty).put("clientOpId", clientOpId),
    )

    // ── Sanash ──────────────────────────────────────────────────────────────

    fun cellStock(storeId: String, cellId: String): JSONObject =
        get("/admin/stores/" + storeId + "/cells/" + cellId + "/stock")

    /**
     * Sanash — MUTLAQ son (`mode: 'set'`).
     *
     * 🔴 `add` ATAYLAB ISHLATILMAYDI. Sanash — javondagi tovarni sanash, ya'ni
     * natija MUTLAQ. `add` esa delta bo'lardi va aloqa uzilib qayta
     * yuborilganda qoldiqni ikkinchi marta oshirardi. Server bu yo'lda
     * idempotentlik kalitini o'qimaydi (u yerda yagona tranzaksiya yo'q —
     * avto Оприходование/Списание hujjatlari alohida yoziladi), shuning uchun
     * himoya SEMANTIKADA: mutlaq son qayta yuborilganda AYNI natijani beradi.
     */
    fun setCellStock(
        storeId: String,
        cellId: String,
        assortmentId: String,
        qty: String,
    ): JSONObject = send(
        "PUT",
        "/admin/stores/" + storeId + "/cells/" + cellId + "/stock",
        JSONObject().put("assortmentId", assortmentId).put("qty", qty).put("mode", "set"),
    )

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

    // ── Navbatdagi amalni yuborish (G6 — `QueueSender`) ─────────────────────

    /**
     * Amalni AYNAN saqlangan ko'rinishda yuboradi. Oflayn navbat SHU
     * metoddan foydalanadi, ya'ni onlayn yo'l bilan bitta kod: navbatdan
     * chiqqan amal onlayn yuborilganidan farq qilmaydi.
     */
    fun send(method: String, path: String, body: JSONObject): JSONObject = when (method) {
        "POST" -> post(path, body)
        "PUT" -> put(path, body)
        else -> throw ApiException(400, "Noma'lum metod: " + method)
    }

    // -- ichki ---------------------------------------------------------------

    private fun enc(s: String): String = java.net.URLEncoder.encode(s, "UTF-8")

    private fun get(path: String): JSONObject =
        exec(Request.Builder().url(baseUrl.trimEnd('/') + path).get(), auth = true)

    private fun post(path: String, body: JSONObject, auth: Boolean = true): JSONObject =
        exec(
            Request.Builder().url(baseUrl.trimEnd('/') + path)
                .post(body.toString().toRequestBody(json)),
            auth,
        )

    private fun put(path: String, body: JSONObject): JSONObject =
        exec(
            Request.Builder().url(baseUrl.trimEnd('/') + path)
                .put(body.toString().toRequestBody(json)),
            auth = true,
        )

    private fun exec(builder: Request.Builder, auth: Boolean): JSONObject {
        if (auth) accessToken?.let { builder.header("Authorization", "Bearer " + it) }
        try {
            http.newCall(builder.build()).execute().use { r ->
                val text = r.body?.string().orEmpty()
                if (!r.isSuccessful) throw ApiException(r.code, "HTTP " + r.code + ": " + text)
                return if (text.isBlank()) JSONObject() else JSONObject(text)
            }
        } catch (e: ApiException) {
            throw e
        } catch (e: java.io.IOException) {
            // Tarmoq uzilishi — `code = 0`, ya'ni QAYTA URINISHGA arziydi.
            // Bu farq bo'lmasa navbat 4xx da ham abadiy aylanardi.
            throw ApiException(0, e.message ?: "Aloqa yo'q")
        }
    }
}
