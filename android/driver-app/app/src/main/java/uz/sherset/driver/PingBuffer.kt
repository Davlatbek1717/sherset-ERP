package uz.sherset.driver

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Oflayn ping buferi (TZ §5). Internet yo'q bo'lganда ping'lar SharedPreferences
 * JSON navbatiga yoziladi; ulanganda FIFO tartibда qayta yuboriladi (`ts` klient
 * vaqti server tomonда ping vaqti sifatida olinadi). Kichik hajmli, sodda —
 * to'liq ilovada Room bilan almashtiriladi (README).
 */
class PingBuffer(context: Context) {
    private val prefs = context.getSharedPreferences("ping_buffer", Context.MODE_PRIVATE)
    private val cap = 2000 // eski ping'lar tashlanadi (cheksiz o'smasin)

    @Synchronized
    fun enqueue(ping: JSONObject) {
        val arr = load()
        arr.put(ping)
        while (arr.length() > cap) arr.remove(0)
        save(arr)
    }

    @Synchronized
    fun peekAll(): List<JSONObject> {
        val arr = load()
        return (0 until arr.length()).map { arr.getJSONObject(it) }
    }

    /** Muvaffaqiyatli yuborilgan N ta ping'ni boshidan olib tashlaydi. */
    @Synchronized
    fun dropFirst(n: Int) {
        val arr = load()
        val kept = JSONArray()
        for (i in n until arr.length()) kept.put(arr.getJSONObject(i))
        save(kept)
    }

    @Synchronized
    fun size(): Int = load().length()

    private fun load(): JSONArray =
        runCatching { JSONArray(prefs.getString("q", "[]")) }.getOrDefault(JSONArray())

    private fun save(arr: JSONArray) = prefs.edit().putString("q", arr.toString()).apply()
}
