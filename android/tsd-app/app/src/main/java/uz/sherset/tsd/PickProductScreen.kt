package uz.sherset.tsd

import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject

/**
 * MULTI-HIT TANLOVI — G-rejaning majburiy qoidasi.
 *
 * Sherset shtrixlari ATAYLAB unikal emas (ikkala rejaning 1-bo'limi): bir
 * shtrix bir necha tovarga tegishli bo'lishi mumkin. Shuning uchun ilova
 * HECH QACHON o'zi birortasini tanlamaydi — jimgina birinchisini olish
 * noto'g'ri tovarni ko'chirishga yoki noto'g'ri qatorni yopishga olib
 * kelardi va buni omborchi keyin topolmasdi.
 *
 * Ekran NARX ko'rsatmaydi — server ham bermaydi (`tsd-scan.ts` oq ro'yxati).
 */
class PickProductScreen(
    private val shell: Shell,
    private val products: JSONArray,
    private val onPicked: (JSONObject) -> Unit,
) : Screen {

    override fun title(ui: Ui): String = ui.str(R.string.scan_multi)

    override fun render(body: LinearLayout) {
        val ui = shell.ui
        body.addView(ui.label(ui.str(R.string.scan_multi), big = true))
        for (i in 0 until products.length()) {
            val p = products.optJSONObject(i) ?: continue
            body.addView(ui.button(label(ui, p)) { onPicked(p) })
        }
        body.addView(ui.button(R.string.back) { shell.back() })
    }

    /** «Nom · jami qoldiq · birinchi yacheyka» — NARX YO'Q. */
    private fun label(ui: Ui, p: JSONObject): String {
        val cells = p.optJSONArray("cells") ?: JSONArray()
        val where = if (cells.length() > 0) {
            cells.optJSONObject(0)?.optString("cellName").orEmpty()
        } else {
            p.optString("homeCell").ifEmpty { ui.str(R.string.no_cell) }
        }
        return p.optString("name") + "\n" + p.optString("totalQty") + " · " + where
    }
}
