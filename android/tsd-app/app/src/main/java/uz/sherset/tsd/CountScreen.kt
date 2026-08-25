package uz.sherset.tsd

import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject

/**
 * G6.3 — INVENTARIZATSIYA SANASH.
 *
 * Oqim: YACHEYKA yorlig'ini skanerlash → yacheyka tarkibi → har tovarga
 * sanalgan son. Boshqacha aytganda «FAQAT YACHEYKA» qoidasi (F-reja):
 * sanash ombor darajasida emas, yacheyka darajasida bo'ladi.
 *
 * 🔴 MUTLAQ SON (`mode: 'set'`), delta EMAS — sabab `ApiClient.setCellStock`
 * izohida: sanash natijasi ta'rifiga ko'ra mutlaq, va oflayn navbat amalni
 * qayta yuborsa delta qoldiqni ikkinchi marta oshirardi.
 *
 * 🔴 SANASH NAVBATGA QO'YILMAYDI. Boshqa amallardan farqi shu va u ataylab:
 * server bu yo'lda avto Оприходование/Списание hujjatlarini YOZADI (ular
 * yagona tranzaksiyada emas), ya'ni idempotentlik kaliti u yerda ishlamaydi.
 * Aloqa yo'q bo'lsa ekran «aloqa yo'q, qayta urinib ko'ring» deydi va son
 * maydonda TURADI — jim yo'qotish yo'q (IS-5).
 */
class CountScreen(private val shell: Shell) : Screen {

    private var cell: JSONObject? = null
    private var items: JSONArray = JSONArray()

    override fun title(ui: Ui): String = ui.str(R.string.count_title)

    override fun render(body: LinearLayout) {
        val ui = shell.ui
        val c = cell
        if (c == null) {
            body.addView(ui.label(ui.str(R.string.count_step_cell), big = true))
            body.addView(ui.button(R.string.back) { shell.go(TaskListScreen(shell)) })
            return
        }

        body.addView(
            ui.label(
                c.optString("name") + " · " + c.optString("storeName"),
                big = true,
            ),
        )
        if (items.length() == 0) {
            body.addView(ui.label(ui.str(R.string.count_empty)))
        }
        for (i in 0 until items.length()) {
            val it = items.optJSONObject(i) ?: continue
            // NARX YO'Q: bu javob narx maydonini umuman qaytarmaydi.
            body.addView(ui.label(it.optString("name"), big = true))
            val qty = ui.input(R.string.count_qty_hint, numeric = true)
            qty.setText(it.optString("qty"))
            body.addView(qty)
            body.addView(
                ui.button(R.string.count_save) {
                    save(c, it.optString("assortmentId"), qty.text.toString().trim())
                },
            )
        }
        body.addView(ui.button(R.string.restart) { reset() })
    }

    private fun reset() {
        cell = null
        items = JSONArray()
        shell.go(CountScreen(shell))
    }

    override fun onScan(code: String): Boolean {
        val ui = shell.ui
        shell.io {
            val resp = shell.api.cellByBarcode(code)
            val cells = resp.optJSONArray("cells") ?: JSONArray()
            shell.main {
                when (cells.length()) {
                    0 -> ui.toast(R.string.cell_not_found)
                    1 -> {
                        cell = cells.getJSONObject(0)
                        items = resp.optJSONArray("stock") ?: JSONArray()
                        shell.go(this)
                    }
                    // Ikki javonda bir xil yorliq — ilova TANLAMAYDI, aks holda
                    // sanoq noto'g'ri yacheykaga yozilardi.
                    else -> ui.toast(R.string.cell_ambiguous)
                }
            }
        }
        return true
    }

    private fun save(c: JSONObject, assortmentId: String, qty: String) {
        val ui = shell.ui
        if (qty.isEmpty()) {
            ui.toast(R.string.count_qty_hint)
            return
        }
        shell.io {
            try {
                shell.api.setCellStock(c.optString("storeId"), c.optString("id"), assortmentId, qty)
                shell.main { ui.toast(R.string.count_saved) }
            } catch (e: ApiClient.ApiException) {
                shell.main {
                    ui.toast(
                        if (e.retriable) ui.str(R.string.count_offline) else (e.message ?: ""),
                    )
                }
            }
        }
    }
}
