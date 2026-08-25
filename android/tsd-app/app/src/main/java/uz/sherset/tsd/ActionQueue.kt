package uz.sherset.tsd

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Oflayn AMAL navbati (`driver-app/PingBuffer.kt` naqshi).
 *
 * 🔴 PING'DAN TUBDAN FARQI — va shuning uchun bu fayl nusxa emas:
 * yo'qolgan GPS-ping zararsiz (keyingisi keladi), yo'qolgan «qator
 * tasdiqlandi» esa omborchining ishini yo'qotadi. Ikkinchi tomondan,
 * IKKI MARTA yuborilgan tasdiq qoldiqni ikki marta siljitardi.
 *
 * Shuning uchun:
 *  - navbat FIFO va qat'iy ketma-ket yuboriladi (tartib = omborchi qilgan
 *    tartib; `cell-move` dan keyin `confirm` kelishi shart);
 *  - har amalning `clientOpId` si bor — server tomon idempotentlik kaliti.
 *    ⚠️ SERVER buni HALI QO'LLAMAYDI (G6 ishi): endpointlar hozircha
 *    `clientOpId` ni e'tiborsiz qoldiradi. Kalit ATAYLAB HOZIRDAN yoziladi —
 *    APK jonliga chiqqach uni qo'shish klient yangilanishini talab qilardi;
 *  - navbat TO'LSA eng eskisi tashlanMAYDI, YANGISI RAD ETILADI: ish
 *    yo'qolgani omborchiga darhol ko'rinsin (jim yo'qotish — IS-5 klassi).
 */
class ActionQueue(context: Context) {

    private val prefs = context.getSharedPreferences("tsd_action_queue", Context.MODE_PRIVATE)

    class QueueFullException : Exception("Navbat to'lgan — aloqani tiklang")

    /**
     * Bitta amal: `path` + `method` + `body` + inson o'qiydigan `label`.
     *
     * ⚠️ Idempotentlik kaliti (`clientOpId`) `body` NING ICHIDA yotadi va
     * amal YARATILGANDA qo'yiladi — bu yerda qayta hosil qilinmaydi. Agar
     * navbat yuborishda yangi kalit qo'ysa, qayta yuborilgan amal server
     * uchun YANGI amal bo'lardi va butun mexanizm ma'nosini yo'qotardi.
     */
    data class Action(
        val opId: String,
        val method: String,
        val path: String,
        val body: JSONObject,
        /** Ekranda ko'rinadigan qisqa tavsif («Ko'chirish · 01-02-03-04 · 10»). */
        val label: String = "",
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("opId", opId)
            .put("method", method)
            .put("path", path)
            .put("body", body)
            .put("label", label)

        companion object {
            fun fromJson(o: JSONObject): Action = Action(
                opId = o.getString("opId"),
                method = o.getString("method"),
                path = o.getString("path"),
                body = o.optJSONObject("body") ?: JSONObject(),
                label = o.optString("label"),
            )
        }
    }

    /** Server RAD ETGAN amal (4xx) — yo'qolmaydi, omborchiga ko'rinadi. */
    data class Rejected(val label: String, val reason: String)

    @Synchronized
    fun enqueue(action: Action) {
        val arr = load()
        if (arr.length() >= CAP) throw QueueFullException()
        // `clientOpId` amal tanasida bo'lishi SHART — bu yerda tekshiriladi,
        // chunki kalitsiz amal navbatdan chiqqanda jimgina takrorlanardi.
        if (action.body.optString("clientOpId").isEmpty()) {
            action.body.put("clientOpId", action.opId)
        }
        arr.put(action.toJson())
        save(arr)
    }

    @Synchronized
    fun peek(): Action? {
        val arr = load()
        return if (arr.length() == 0) null else Action.fromJson(arr.getJSONObject(0))
    }

    /** Boshidagi amal MUVAFFAQIYATLI yuborilgach chaqiriladi. */
    @Synchronized
    fun dropFirst() {
        val arr = load()
        val kept = JSONArray()
        for (i in 1 until arr.length()) kept.put(arr.getJSONObject(i))
        save(kept)
    }

    @Synchronized
    fun size(): Int = load().length()

    /**
     * Server amalni RAD ETDI (4xx — so'rovning o'zi noto'g'ri, masalan
     * yacheykada tovar qolmagan). Navbatdan chiqariladi, lekin YO'QOLMAYDI:
     * omborchi nima bajarilmaganini ko'rishi SHART. Jim yo'qotish — IS-5
     * klassi (2026-08-24 hodisasi tahlili).
     */
    @Synchronized
    fun reject(action: Action, reason: String) {
        val arr = loadRejected()
        arr.put(JSONObject().put("label", action.label.ifEmpty { action.path }).put("reason", reason))
        // Rad etilganlar ro'yxati ham cheksiz o'smaydi; eng YANGILARI qoladi
        // (bu yerda eskisi tashlanadi — u allaqachon ko'rilgan bo'ladi).
        val trimmed = JSONArray()
        val from = maxOf(0, arr.length() - REJECTED_CAP)
        for (i in from until arr.length()) trimmed.put(arr.getJSONObject(i))
        prefs.edit().putString("rejected", trimmed.toString()).apply()
    }

    @Synchronized
    fun rejected(): List<Rejected> {
        val arr = loadRejected()
        val out = ArrayList<Rejected>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(Rejected(o.optString("label"), o.optString("reason")))
        }
        return out
    }

    @Synchronized
    fun clearRejected() = prefs.edit().remove("rejected").apply()

    private fun loadRejected(): JSONArray =
        runCatching { JSONArray(prefs.getString("rejected", "[]")) }.getOrDefault(JSONArray())

    private fun load(): JSONArray =
        runCatching { JSONArray(prefs.getString("q", "[]")) }.getOrDefault(JSONArray())

    private fun save(arr: JSONArray) = prefs.edit().putString("q", arr.toString()).apply()

    private companion object {
        /**
         * Bitta smenada bitta omborchi ~200–300 qator tasdiqlaydi. 1000 —
         * kunlik zaxira bilan; undan oshsa muammo aloqada emas, jarayonda.
         */
        const val CAP = 1000

        /** Rad etilganlar ro'yxati — ekranga sig'adigan oxirgi qatorlar. */
        const val REJECTED_CAP = 50
    }
}
