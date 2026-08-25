package uz.sherset.tsd

import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * G6.1 — TOPSHIRIQ EKRANI: qatorlar, tasdiqlash, yetishmovchilik.
 *
 * Qatorlar YACHEYKA MARSHRUTI tartibida keladi — saralashni SERVER qiladi
 * (`restock-task-progress.ts#sortLinesByRoute`), klient uni qayta
 * saralamaydi. Sabab: tartib biznes qoidasi, ikki joyda ikki xil bo'lsa
 * omborchi web va terminalda boshqa-boshqa marshrut ko'rardi.
 *
 * 🔴 «TAYYOR» TUGMASI YO'Q — G2 hisobotining G6 ga eslatmasi: TSD'da chekni
 * `mark-ready` bilan flip qilish YO'Q. Hamma qator yopilgach topshiriq
 * o'z-o'zidan `done` bo'ladi va chek KONTROL navbatiga tushadi (katta
 * omborchi ko'z bilan tekshiradi). Shuning uchun ekran «kontrolga ketdi»
 * deb aytadi, «tayyor» demaydi.
 */
class TaskDetailScreen(
    private val shell: Shell,
    private val taskId: String,
) : Screen {

    private var task: JSONObject? = null

    override fun title(ui: Ui): String = ui.str(R.string.task_title)

    override fun render(body: LinearLayout) {
        val ui = shell.ui
        body.addView(ui.button(R.string.back) { shell.go(TaskListScreen(shell)) })
        shell.setStatus(ui.str(R.string.loading))
        shell.io {
            val t = shell.api.task(taskId)
            shell.main {
                task = t
                renderTask(body, t)
            }
        }
    }

    /**
     * Skan qatorni tasdiqlaydi (`confirm-scan`) — omborchi tovarni javondan
     * olib skanerlaydi. Multi-hit MAJBURIY: shtrix bir nechta tovarga tegishli
     * bo'lsa ilova O'ZI birortasini tanlamaydi.
     */
    override fun onScan(code: String): Boolean {
        val ui = shell.ui
        shell.io {
            val hit = shell.api.scan(code)
            shell.main { onScanResult(hit) }
        }
        ui.toast(R.string.scan_working)
        return true
    }

    private fun onScanResult(hit: JSONObject) {
        val ui = shell.ui
        val products = hit.optJSONArray("products") ?: JSONArray()
        when {
            hit.optString("kind") == "piece" -> ui.toast(R.string.scan_piece)
            products.length() == 0 -> ui.toast(R.string.scan_none)
            products.length() == 1 -> confirmByProduct(products.getJSONObject(0).optString("id"))
            else -> {
                // Multi-hit: TANLOVNI ODAM qiladi (G-reja majburiy qoidasi).
                shell.go(PickProductScreen(shell, products) { p -> confirmByProduct(p.optString("id")) })
            }
        }
    }

    private fun confirmByProduct(productId: String) {
        val ui = shell.ui
        val opId = UUID.randomUUID().toString()
        shell.io {
            try {
                shell.api.confirmScan(taskId, productId, opId)
                shell.main {
                    ui.toast(R.string.line_confirmed)
                    shell.go(TaskDetailScreen(shell, taskId))
                }
            } catch (e: ApiClient.ApiException) {
                if (e.retriable) {
                    shell.enqueue(
                        "POST",
                        "/restock-tasks/" + taskId + "/confirm-scan",
                        JSONObject().put("productId", productId).put("clientOpId", opId),
                        ui.str(R.string.op_confirm_scan),
                    )
                } else {
                    shell.main { ui.toast(e.message ?: "") }
                }
            }
        }
    }

    private fun renderTask(body: LinearLayout, t: JSONObject) {
        val ui = shell.ui
        shell.setStatus(t.optString("sourceName").ifEmpty { ui.str(R.string.task_title) })

        val lines = t.optJSONArray("lines") ?: JSONArray()
        var open = 0
        for (i in 0 until lines.length()) {
            val l = lines.optJSONObject(i) ?: continue
            if (isClosed(l)) continue
            open++
        }

        if (open == 0) {
            // Hamma qator yopilgan — chek endi KONTROLDA (G2 zanjiri).
            body.addView(ui.label(ui.str(R.string.task_done_control), big = true))
        }

        for (i in 0 until lines.length()) {
            val l = lines.optJSONObject(i) ?: continue
            body.addView(ui.label(lineLabel(ui, l), big = true))
            if (isClosed(l)) continue
            val lineId = l.optString("id")
            body.addView(ui.button(R.string.line_confirm) { confirmLine(lineId) })
            body.addView(ui.button(R.string.line_shortage) {
                shell.go(ShortageScreen(shell, taskId, l))
            })
        }
    }

    private fun confirmLine(lineId: String) {
        val ui = shell.ui
        val opId = UUID.randomUUID().toString()
        val path = "/restock-tasks/" + taskId + "/lines/" + lineId + "/confirm"
        val payload = JSONObject().put("clientOpId", opId)
        shell.io {
            try {
                shell.api.send("POST", path, payload)
                shell.main {
                    ui.toast(R.string.line_confirmed)
                    shell.go(TaskDetailScreen(shell, taskId))
                }
            } catch (e: ApiClient.ApiException) {
                if (e.retriable) {
                    shell.enqueue("POST", path, payload, ui.str(R.string.op_confirm_line))
                } else {
                    shell.main { ui.toast(e.message ?: "") }
                }
            }
        }
    }

    private fun isClosed(l: JSONObject): Boolean =
        !l.isNull("confirmedAt") || !l.isNull("shortageQty")

    /** «01-02-03-05 · Kabel 2×2.5 · 10 dona» (+ holat belgisi). NARX YO'Q. */
    private fun lineLabel(ui: Ui, l: JSONObject): String {
        val bin = l.optString("binLocation").ifEmpty { ui.str(R.string.no_cell) }
        val mark = when {
            !l.isNull("confirmedAt") -> "✔ "
            !l.isNull("shortageQty") -> "⚠ " + l.optString("shortageQty") + " "
            else -> ""
        }
        return mark + bin + " · " + l.optString("productName") + " · " + l.optString("quantity")
    }
}
