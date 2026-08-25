package uz.sherset.tsd

import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject

/**
 * G6.4 — SKAN-MA'LUMOT EKRANI: tovar nomi, qoldiq, yacheykalar. **NARXSIZ.**
 *
 * 🔴 Narxning yo'qligi bu ekranning intizomi EMAS, SERVER SHARTNOMASI:
 * ekran `GET /tsd/scan` dan foydalanadi va u narx qaytarmaydi (ustunlar OQ
 * RO'YXAT bilan tanlangan — `tsd-scan.ts`), `/products` esa TSD sessiyasiga
 * umuman yopiq (`tsd-policy.ts`). Ya'ni terminalni qo'lga kiritgan odam
 * `curl` bilan ham kirim narxini ololmaydi.
 *
 * Bu ekran hech nimani O'ZGARTIRMAYDI — u «bu nima va qayerda» savoliga
 * javob. Ko'chirish uchun alohida ekran bor (`PlaceScreen`).
 */
class ScanInfoScreen(
    private val shell: Shell,
    private val hit: JSONObject,
) : Screen {

    override fun title(ui: Ui): String = ui.str(R.string.scan_info_title)

    override fun render(body: LinearLayout) {
        val ui = shell.ui
        val products = hit.optJSONArray("products") ?: JSONArray()

        when (hit.optString("kind")) {
            // K-reja 7.3 — bo'lak kodi tovar tanlovini OCHMAYDI (kesim oqimi
            // K1 da quriladi; hozir kod TANILADI va shu bilan to'xtaydi).
            "piece" -> body.addView(ui.label(ui.str(R.string.scan_piece), big = true))
            "none" -> body.addView(ui.label(ui.str(R.string.scan_none), big = true))
            else -> {
                if (products.length() > 1) {
                    body.addView(ui.label(ui.str(R.string.scan_multi), big = true))
                }
                for (i in 0 until products.length()) {
                    val p = products.optJSONObject(i) ?: continue
                    renderProduct(body, p)
                }
            }
        }
        body.addView(ui.button(R.string.back) { shell.back() })
    }

    private fun renderProduct(body: LinearLayout, p: JSONObject) {
        val ui = shell.ui
        body.addView(ui.label(p.optString("name"), big = true))
        body.addView(ui.label(ui.str(R.string.scan_total, p.optString("totalQty"))))

        val cells = p.optJSONArray("cells") ?: JSONArray()
        if (cells.length() == 0) {
            // Yacheykasiz qoldiq — jonlida bu ODATIY hol (qoldiqning
            // aksariyati hali yacheykaga biriktirilmagan). Uy-yacheyka bo'lsa
            // u TAVSIYA sifatida ko'rsatiladi, «shu yerda turibdi» deb emas.
            val home = p.optString("homeCell")
            body.addView(
                ui.label(
                    if (home.isEmpty()) ui.str(R.string.scan_no_cells)
                    else ui.str(R.string.scan_home_cell, home),
                ),
            )
            return
        }
        for (i in 0 until cells.length()) {
            val c = cells.optJSONObject(i) ?: continue
            body.addView(
                ui.label(
                    "• " + c.optString("cellName") + " · " + c.optString("qty") +
                        "  (" + c.optString("storeName") + ")",
                ),
            )
        }
    }
}
