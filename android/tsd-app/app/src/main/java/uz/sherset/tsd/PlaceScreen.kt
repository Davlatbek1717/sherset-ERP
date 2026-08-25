package uz.sherset.tsd

import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * G6.2 — JOYLASHTIRISH / KO'CHIRISH.
 *
 * Oqim uch skandan iborat va u ATAYLAB shunday: omborchi qo'lida terminal,
 * u yozmaydi — skanerlaydi.
 *   1) TOVAR shtrixi   → tovar (multi-hit bo'lsa tanlov);
 *   2) MANBA           → tovarning mavjud yacheykalaridan biri, yoki
 *                        «yacheykasiz qoldiq» (hovuz/Taqsimlanmagan);
 *   3) MAQSAD yacheyka → yorlig'ini skanerlash;
 *   4) miqdor          → yuborish.
 *
 * 🔴 ESKI `__yacheyka` SATRIGA YOZILMAYDI (reja G6.2 ning aniq bandi). Ekran
 * FAQAT yangi qatlam endpointlariga boradi:
 *   · manba yacheyka bo'lsa  → `POST /products/:id/cell-move`;
 *   · yacheykasiz qoldiq bo'lsa → `POST /products/:id/cell-place`
 *     (u o'z ombori → hovuz → uy tartibida oladi — F7 `pool-placement.ts`).
 * `cell-rebind` (uy-yacheykasini o'zgartirish) TSD allowlist'ida UMUMAN yo'q:
 * u tovar KARTASINI tahrirlaydi, terminal ishi emas.
 *
 * 🔴 RUXSAT: bu ikki marshrut G6 da `storecell.update` ga tushirildi, ya'ni
 * kichik omborchi ularni bajara oladi. OMBORLARARO ko'chirish (hovuzdan
 * tashqari) esa hamon `store.update` talab qiladi — server 403 beradi va
 * ekran shu xabarni ko'rsatadi (`product-cell-move-scope.ts`).
 */
class PlaceScreen(private val shell: Shell) : Screen {

    private var product: JSONObject? = null

    /** Manba: `null` = yacheykasiz qoldiq (`cell-place`). */
    private var fromCell: JSONObject? = null
    private var toCell: JSONObject? = null

    /** Manba TANLANDIMI — `fromCell = null` ikki xil ma'noni bildirardi. */
    private var sourceChosen = false

    override fun title(ui: Ui): String = ui.str(R.string.place_title)

    override fun render(body: LinearLayout) {
        val ui = shell.ui
        val p = product

        if (p == null) {
            body.addView(ui.label(ui.str(R.string.place_step_product), big = true))
            body.addView(ui.button(R.string.back) { shell.go(TaskListScreen(shell)) })
            return
        }

        body.addView(ui.label(p.optString("name"), big = true))
        body.addView(ui.label(ui.str(R.string.place_total, p.optString("totalQty"))))

        if (fromCell == null && !sourceChosen) {
            body.addView(ui.label(ui.str(R.string.place_step_source), big = true))
            val cells = p.optJSONArray("cells") ?: JSONArray()
            for (i in 0 until cells.length()) {
                val c = cells.optJSONObject(i) ?: continue
                body.addView(
                    ui.button(c.optString("cellName") + " · " + c.optString("qty")) {
                        fromCell = c
                        sourceChosen = true
                        shell.go(this)
                    },
                )
            }
            // Yacheykasiz qoldiq — F7 ning kundalik oqimi («Taqsimlanmagan»dan
            // haqiqiy omborga joylashtirish). Yacheyka kesimi bo'sh bo'lsa ham
            // bu yo'l ochiq bo'lishi SHART: jonlida qoldiqning aksariyati
            // yacheykasiz (jonli-holat reyestri, E1).
            body.addView(
                ui.button(R.string.place_source_unassigned) {
                    fromCell = null
                    sourceChosen = true
                    shell.go(this)
                },
            )
            body.addView(ui.button(R.string.back) { shell.go(TaskListScreen(shell)) })
            return
        }

        body.addView(
            ui.label(
                ui.str(R.string.place_source) + ": " +
                    (fromCell?.optString("cellName") ?: ui.str(R.string.place_source_unassigned)),
            ),
        )

        val target = toCell
        if (target == null) {
            body.addView(ui.label(ui.str(R.string.place_step_target), big = true))
            body.addView(ui.button(R.string.restart) { reset() })
            return
        }

        body.addView(ui.label(ui.str(R.string.place_target) + ": " + target.optString("name")))
        val qty = ui.input(R.string.place_qty_hint, numeric = true)
        body.addView(qty)
        body.addView(ui.button(R.string.place_save) { submit(qty.text.toString().trim()) })
        body.addView(ui.button(R.string.restart) { reset() })
    }

    private fun reset() {
        product = null
        fromCell = null
        toCell = null
        sourceChosen = false
        shell.go(PlaceScreen(shell))
    }

    /**
     * Skan bosqichga qarab talqin qilinadi. Tovar kutilayotganda YACHEYKA
     * kodi kelsa (yoki aksincha) ilova buni AYTADI va jimgina noto'g'ri
     * bosqichga o'tmaydi.
     */
    override fun onScan(code: String): Boolean {
        val ui = shell.ui
        shell.io {
            val hit = shell.api.scan(code)
            val kind = hit.optString("kind")
            when {
                product == null && kind == "product" -> {
                    val products = hit.optJSONArray("products") ?: JSONArray()
                    shell.main {
                        if (products.length() == 1) {
                            product = products.getJSONObject(0)
                            shell.go(this)
                        } else {
                            shell.go(PickProductScreen(shell, products) { p ->
                                product = p
                                shell.go(this)
                            })
                        }
                    }
                }
                product == null && kind == "piece" -> shell.main { ui.toast(R.string.scan_piece) }
                product == null -> shell.main { ui.toast(R.string.place_need_product) }
                kind == "cell" -> {
                    val resp = shell.api.cellByBarcode(code)
                    val cells = resp.optJSONArray("cells") ?: JSONArray()
                    shell.main {
                        when (cells.length()) {
                            0 -> ui.toast(R.string.cell_not_found)
                            // Bir yorliq ikki javonda bo'lsa ilova TANLAMAYDI —
                            // yacheyka aralashishi qoldiqni noto'g'ri joyga
                            // yozardi va uni keyin topib bo'lmasdi.
                            1 -> {
                                toCell = cells.getJSONObject(0)
                                shell.go(this)
                            }
                            else -> ui.toast(R.string.cell_ambiguous)
                        }
                    }
                }
                else -> shell.main { ui.toast(R.string.place_need_cell) }
            }
        }
        return true
    }

    private fun submit(qty: String) {
        val ui = shell.ui
        val p = product ?: return
        val target = toCell ?: return
        if (qty.isEmpty()) {
            ui.toast(R.string.place_qty_hint)
            return
        }
        val productId = p.optString("id")
        val opId = UUID.randomUUID().toString()
        val src = fromCell

        val path: String
        val payload: JSONObject
        val label: String
        if (src != null) {
            path = "/products/" + productId + "/cell-move"
            payload = JSONObject()
                .put("storeId", src.optString("storeId"))
                .put("fromCellId", src.optString("cellId"))
                .put("toCellId", target.optString("id"))
                .put("qty", qty)
                .put("clientOpId", opId)
            label = ui.str(R.string.op_cell_move) + " · " + target.optString("name") + " · " + qty
        } else {
            path = "/products/" + productId + "/cell-place"
            payload = JSONObject()
                .put("toCellId", target.optString("id"))
                .put("qty", qty)
                .put("clientOpId", opId)
            label = ui.str(R.string.op_cell_place) + " · " + target.optString("name") + " · " + qty
        }

        shell.io {
            try {
                shell.api.send("POST", path, payload)
                shell.main {
                    ui.toast(R.string.place_saved)
                    reset()
                }
            } catch (e: ApiClient.ApiException) {
                if (e.retriable) {
                    shell.enqueue("POST", path, payload, label)
                    shell.main { reset() }
                } else {
                    shell.main { ui.toast(e.message ?: "") }
                }
            }
        }
    }
}
