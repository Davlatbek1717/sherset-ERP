package uz.sherset.tsd

import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject

/**
 * G6.1 — «Mening topshiriqlarim».
 *
 * Ro'yxatda ikki tur birga: `picking` (yig'ish — kassa cheki uchun) va
 * `restock` (joylashtirish — vozvrat tovari). Ular ATAYLAB ajratilmagan:
 * omborchi uchun bu bitta navbat va u qaysi ish oldin kelganiga qarab
 * yuradi; ikki tab qilish uni har safar ikki joyga qaratardi.
 *
 * Kartada `openCount` — hali TEGILMAGAN qatorlar soni (yetishmovchilik
 * belgilangan qator ham YOPIQ, `restock-task-progress.ts` izohi).
 */
class TaskListScreen(private val shell: Shell) : Screen {

    override fun title(ui: Ui): String = ui.str(R.string.tasks_title)

    override fun render(body: LinearLayout) {
        val ui = shell.ui
        body.addView(ui.button(R.string.tasks_refresh) { shell.go(TaskListScreen(shell)) })
        body.addView(ui.button(R.string.place_title) { shell.go(PlaceScreen(shell)) })
        body.addView(ui.button(R.string.count_title) { shell.go(CountScreen(shell)) })
        body.addView(ui.button(R.string.logout) { shell.logout() })

        val pending = shell.queue.size()
        if (pending > 0) {
            body.addView(ui.label(ui.str(R.string.queue_pending, pending)))
            body.addView(ui.button(R.string.queue_send) { flush() })
        }
        val rejected = shell.queue.rejected()
        if (rejected.isNotEmpty()) {
            // 🔴 Rad etilgan amallar EKRANDA turadi — jim yo'qotish IS-5 klassi.
            body.addView(ui.label(ui.str(R.string.queue_rejected_title, rejected.size), big = true))
            for (r in rejected) body.addView(ui.label("• " + r.label + " — " + r.reason))
            body.addView(ui.button(R.string.queue_rejected_clear) {
                shell.queue.clearRejected()
                shell.go(TaskListScreen(shell))
            })
        }

        shell.setStatus(ui.str(R.string.loading))
        shell.io {
            val items = shell.api.myTasks(shell.employeeId)
            shell.main { renderTasks(body, items) }
        }
    }

    private fun flush() {
        val ui = shell.ui
        shell.io {
            val r = shell.sender.flush()
            shell.main {
                ui.toast(
                    if (r.offline) ui.str(R.string.queue_offline, r.left)
                    else ui.str(R.string.queue_sent, r.sent, r.rejected),
                )
                shell.go(TaskListScreen(shell))
            }
        }
    }

    private fun renderTasks(body: LinearLayout, items: JSONArray) {
        val ui = shell.ui
        shell.setStatus(ui.str(R.string.tasks_title))
        if (items.length() == 0) {
            body.addView(ui.label(ui.str(R.string.tasks_empty)))
            return
        }
        for (i in 0 until items.length()) {
            val t = items.optJSONObject(i) ?: continue
            body.addView(ui.button(cardLabel(ui, t)) { shell.go(TaskDetailScreen(shell, t.optString("id"))) })
        }
    }

    /** Karta matni: tur · manba · qolgan/jami (+ yetishmovchilik belgisi). */
    private fun cardLabel(ui: Ui, t: JSONObject): String {
        val kind = if (t.optString("type") == "picking") {
            ui.str(R.string.task_kind_picking)
        } else {
            ui.str(R.string.task_kind_restock)
        }
        val source = t.optString("sourceName").ifEmpty { t.optString("id") }
        val open = t.optInt("openCount", 0)
        val total = t.optInt("lineCount", 0)
        val shortage = t.optInt("shortageCount", 0)
        val suffix = if (shortage > 0) "  ⚠" + shortage else ""
        return kind + " · " + source + "\n" + open + " / " + total + suffix
    }
}
