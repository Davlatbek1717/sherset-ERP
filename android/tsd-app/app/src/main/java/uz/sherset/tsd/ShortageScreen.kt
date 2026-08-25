package uz.sherset.tsd

import android.widget.LinearLayout
import org.json.JSONObject
import java.util.UUID

/**
 * G6.1 — YETISHMOVCHILIK: «javonda shuncha topolmadim».
 *
 * 🔴 NEGA BU EKRAN BOR. Qator na tasdiqlanmasa, na yopilmasa topshiriq
 * abadiy ochiq qoladi ⇒ chek KONTROL NAVBATIGA TUSHMAYDI (G2 sharti:
 * hamma topshiriq yopiq) va kassir uni yopolmaydi. Ya'ni «belgisiz
 * yetishmovchilik» 2026-08-24 hodisasining boshqa shakli: tizim ishlayotgandek
 * ko'rinadi, kassa esa to'xtaydi.
 *
 * 🔴 CHEK TARKIBI BU YERDA O'ZGARMAYDI. Omborchi XABAR beradi, qarorni
 * KONTROL qabul qiladi (`control-edit`, faqat KAMAYTIRISH). Omborchining
 * o'zi chekni kamaytirsa mijoz to'lagan summa bilan tovar jimgina ajralardi.
 *
 * Miqdor MUTLAQ (delta emas) — oflayn navbat amalni qayta yuborsa ham
 * natija AYNI bo'lishi uchun (`planShortage` izohi).
 */
class ShortageScreen(
    private val shell: Shell,
    private val taskId: String,
    private val line: JSONObject,
) : Screen {

    override fun title(ui: Ui): String = ui.str(R.string.shortage_title)

    override fun render(body: LinearLayout) {
        val ui = shell.ui
        val requested = line.optString("quantity")

        body.addView(ui.label(line.optString("productName"), big = true))
        body.addView(
            ui.label(
                ui.str(R.string.shortage_requested, requested) + " · " +
                    line.optString("binLocation").ifEmpty { ui.str(R.string.no_cell) },
            ),
        )

        val qty = ui.input(R.string.shortage_qty_hint, numeric = true)
        // Sukut — TALAB QILINGAN miqdor: eng ko'p uchraydigan holat «umuman
        // topolmadim». Omborchi qisman topgan bo'lsa sonni kamaytiradi.
        qty.setText(requested)
        val note = ui.input(R.string.shortage_note_hint)

        body.addView(qty)
        body.addView(note)
        body.addView(
            ui.button(R.string.shortage_save) {
                send(qty.text.toString().trim(), note.text.toString().trim())
            },
        )
        // «Topdim» — belgini olib tashlash (qty = 0). Omborchi keyin tovarni
        // topib olishi normal holat, ya'ni bu yo'l ochiq bo'lishi kerak.
        body.addView(ui.button(R.string.shortage_clear) { send("0", "") })
        body.addView(ui.button(R.string.back) { shell.go(TaskDetailScreen(shell, taskId)) })
    }

    private fun send(qty: String, note: String) {
        val ui = shell.ui
        if (qty.isEmpty()) {
            ui.toast(R.string.shortage_qty_hint)
            return
        }
        val lineId = line.optString("id")
        val opId = UUID.randomUUID().toString()
        val path = "/restock-tasks/" + taskId + "/lines/" + lineId + "/shortage"
        val payload = JSONObject().put("qty", qty).put("clientOpId", opId)
        if (note.isNotEmpty()) payload.put("note", note)

        shell.io {
            try {
                shell.api.send("POST", path, payload)
                shell.main {
                    ui.toast(R.string.shortage_saved)
                    shell.go(TaskDetailScreen(shell, taskId))
                }
            } catch (e: ApiClient.ApiException) {
                if (e.retriable) {
                    shell.enqueue("POST", path, payload, ui.str(R.string.op_shortage))
                } else {
                    shell.main { ui.toast(e.message ?: "") }
                }
            }
        }
    }
}
