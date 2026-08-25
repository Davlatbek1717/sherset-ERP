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

    /** Bitta amal: `path` + `method` + `body` + idempotentlik kaliti. */
    data class Action(
        val opId: String,
        val method: String,
        val path: String,
        val body: JSONObject,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("opId", opId)
            .put("method", method)
            .put("path", path)
            .put("body", body)

        companion object {
            fun fromJson(o: JSONObject): Action = Action(
                opId = o.getString("opId"),
                method = o.getString("method"),
                path = o.getString("path"),
                body = o.optJSONObject("body") ?: JSONObject(),
            )
        }
    }

    @Synchronized
    fun enqueue(action: Action) {
        val arr = load()
        if (arr.length() >= CAP) throw QueueFullException()
        arr.put(action.toJson().put("clientOpId", action.opId))
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

    private fun load(): JSONArray =
        runCatching { JSONArray(prefs.getString("q", "[]")) }.getOrDefault(JSONArray())

    private fun save(arr: JSONArray) = prefs.edit().putString("q", arr.toString()).apply()

    private companion object {
        /**
         * Bitta smenada bitta omborchi ~200–300 qator tasdiqlaydi. 1000 —
         * kunlik zaxira bilan; undan oshsa muammo aloqada emas, jarayonda.
         */
        const val CAP = 1000
    }
}
