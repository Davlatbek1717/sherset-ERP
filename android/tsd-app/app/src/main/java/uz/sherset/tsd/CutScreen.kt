package uz.sherset.tsd

import android.widget.EditText
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * K4 — BO'LINADIGAN TOVAR KESIMI (kabel/sim/shlang).
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K4 fazasi.
 *
 * Oqim (K-reja 5-bo'lim, 3-qadam): manba bo'lakni tanlash yoki `BLK-`
 * YORLIG'INI SKANERLASH → kesilgan uzunlik → qolgan uzunlik (tizim taklif
 * qiladi, omborchi tuzatadi) → server yangi yorliqlarni qaytaradi.
 *
 * 🔴 QOLDIQQA TEGMAYDI. Kesim STOK-NEYTRAL: 250 m «180 + 70» bo'ladi, jami
 * o'sha 250. Ombordagi qoldiq faqat kassada, TO'LOV paytida kamayadi. Chiqindi
 * (1 m dan kalta) va o'lchov farqi ham faqat REYESTRDAN chiqadi — qoldiq
 * o'z holicha qoladi (egasining 2026-08-25 qarori).
 *
 * 🔴 OFLAYN NAVBATGA QO'YILMAYDI — `CountScreen` (sanash) bilan AYNI sabab,
 * lekin boshqa dalil: yorliq RAQAMINI server beradi (`BLK-000041`), ya'ni
 * aloqasiz kesimni yozib bo'lmaydi — omborchi bosadigan yorliqda raqam
 * bo'lmasdi. Kesimning butun ma'nosi esa yorliqda (reja 5-bo'lim: «har kesim
 * yorliq bosilishi bilan tugaydi»). Shuning uchun aloqa yo'q bo'lsa ekran
 * SHUNI AYTADI va kiritilgan sonlar joyida turadi — jim yo'qotish yo'q (IS-5).
 *
 * Bo'laklar ro'yxati topshiriq javobidan keladi (`lines[].pieceOptions`) —
 * `/stock-pieces` TSD'ga OCHIQ EMAS (u `piecetracking` ruxsatini talab qiladi
 * va kichik omborchida u yo'q, K-Q9). Skanerlangan yorliq ham SHU ro'yxatdan
 * topiladi: qo'shimcha so'rov ham, yangi ruxsat ham kerak emas.
 */
class CutScreen(
    private val shell: Shell,
    private val taskId: String,
    private val line: JSONObject,
) : Screen {

    /** Tanlangan manba (skan yoki ro'yxatdan bosish). */
    private var source: JSONObject? = null
    private var cutInput: EditText? = null
    private var remainingInput: EditText? = null

    override fun title(ui: Ui): String = ui.str(R.string.cut_title)

    override fun render(body: LinearLayout) {
        val ui = shell.ui
        val options = line.optJSONArray("pieceOptions") ?: JSONArray()

        body.addView(ui.label(line.optString("productName"), big = true))
        body.addView(ui.label(ui.str(R.string.cut_need, needText())))

        // Kassirning mijoz bilan kelishuvi («150 + 30») — omborchi nimani
        // kesishini SHU qatordan biladi (K3 da u faqat savatda qolardi).
        val agreed = line.optJSONArray("agreedLengths") ?: JSONArray()
        if (agreed.length() > 1) {
            val parts = (0 until agreed.length()).joinToString(" + ") { agreed.optString(it) }
            body.addView(ui.label(ui.str(R.string.cut_agreed, parts)))
        }

        val src = source
        if (src == null) {
            body.addView(ui.label(ui.str(R.string.cut_pick_source), big = true))
            for (i in 0 until options.length()) {
                val p = options.optJSONObject(i) ?: continue
                body.addView(ui.button(pieceLabel(ui, p)) { pick(p) })
            }
            if (options.length() == 0) body.addView(ui.label(ui.str(R.string.cut_no_pieces)))
            body.addView(ui.button(R.string.back) { shell.go(TaskDetailScreen(shell, taskId)) })
            return
        }

        body.addView(ui.label(pieceLabel(ui, src), big = true))

        val cut = ui.input(R.string.cut_length_hint, numeric = true)
        // Sukut — hali QOPLANMAGAN miqdor: eng ko'p uchraydigan holat «mijoz
        // so'raganini bitta bo'lakdan kesish».
        cut.setText(needText())
        body.addView(cut)
        cutInput = cut

        val remaining = ui.input(R.string.cut_remaining_hint, numeric = true)
        body.addView(remaining)
        remainingInput = remaining

        body.addView(ui.label(ui.str(R.string.cut_remaining_note)))
        body.addView(
            ui.button(R.string.cut_submit) {
                send(cut.text.toString().trim(), remaining.text.toString().trim())
            },
        )
        body.addView(ui.button(R.string.cut_change_source) { source = null; shell.go(this) })
        body.addView(ui.button(R.string.back) { shell.go(TaskDetailScreen(shell, taskId)) })
    }

    /**
     * Skan — manba tanlash. Yorliq SHU qatorning bo'laklari orasidan
     * qidiriladi: boshqa tovarning yorlig'i skanerlansa ekran ANIQ xato
     * beradi va jimgina noto'g'ri bo'lakni tanlamaydi (K-reja 7.3).
     */
    override fun onScan(code: String): Boolean {
        val ui = shell.ui
        val options = line.optJSONArray("pieceOptions") ?: JSONArray()
        val wanted = code.trim().uppercase()
        for (i in 0 until options.length()) {
            val p = options.optJSONObject(i) ?: continue
            if (p.optString("label").uppercase() == wanted) {
                pick(p)
                return true
            }
        }
        ui.toast(R.string.cut_piece_not_in_line)
        return true
    }

    private fun pick(p: JSONObject) {
        source = p
        shell.go(this)
    }

    /** Hali qoplanmagan miqdor: qator miqdori − kesilgan bo'laklar. */
    private fun needText(): String {
        val quantity = line.optString("quantity").toDoubleOrNull() ?: 0.0
        val cutPieces = line.optJSONArray("cutPieces") ?: JSONArray()
        var done = 0.0
        for (i in 0 until cutPieces.length()) {
            done += cutPieces.optJSONObject(i)?.optString("length")?.toDoubleOrNull() ?: 0.0
        }
        val need = quantity - done
        return if (need <= 0) "0" else trim(need)
    }

    /** «BLK-000041 · 250 · 02-01-03-04» (butun rulonda yorliq YO'Q — K-Q3). */
    private fun pieceLabel(ui: Ui, p: JSONObject): String {
        val label = p.optString("label").ifEmpty { ui.str(R.string.cut_whole_roll) }
        val cell = p.optString("cellName").ifEmpty { ui.str(R.string.no_cell) }
        return label + " · " + p.optString("length") + " · " + cell
    }

    private fun trim(v: Double): String =
        if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()

    private fun send(cut: String, remaining: String) {
        val ui = shell.ui
        val src = source ?: return
        if (cut.isEmpty()) {
            ui.toast(R.string.cut_length_hint)
            return
        }
        val opId = UUID.randomUUID().toString()
        shell.io {
            try {
                val resp = shell.api.cut(
                    taskId,
                    line.optString("id"),
                    src.optString("id"),
                    null,
                    cut,
                    remaining.ifEmpty { null },
                    opId,
                )
                val labels = resp.optJSONArray("labels") ?: JSONArray()
                shell.main {
                    // Yorliq TERMINALDA bosilmaydi (unga printer ulanmagan) —
                    // ekran raqamlarni ko'rsatadi va omborchi ularni katta
                    // omborchi ekranidan (K2/web) bosadi. Reja 5-bo'limining
                    // «yorliq bilan tugaydi» sharti shu bilan bajariladi:
                    // raqam BERILGAN va u bo'lakda yozilgan.
                    val text = (0 until labels.length()).joinToString(", ") { labels.optString(it) }
                    ui.toast(
                        if (text.isEmpty()) ui.str(R.string.cut_saved)
                        else ui.str(R.string.cut_saved_labels, text),
                    )
                    shell.go(TaskDetailScreen(shell, taskId))
                }
            } catch (e: ApiClient.ApiException) {
                // Oflayn navbat YO'Q (sinf izohi): yorliq raqamini server
                // beradi, ya'ni aloqasiz kesim yozib bo'lmaydi.
                shell.main {
                    ui.toast(if (e.retriable) ui.str(R.string.cut_offline) else (e.message ?: ""))
                }
            }
        }
    }
}
