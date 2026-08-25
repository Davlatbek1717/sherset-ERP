package uz.sherset.tsd

import android.os.Bundle
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import org.json.JSONObject
import java.util.ArrayDeque
import java.util.UUID
import java.util.concurrent.Executors

/**
 * TSD ilovasi: juftlash → PIN → ISH EKRANLARI.
 *
 * G5 skeletida bu fayl butun ilova edi; G6 da u QOBIQQA aylandi — juftlash,
 * kirish, skaner marshruti, oflayn navbat va ekranlar orasidagi navigatsiya.
 * Ish ekranlarining O'ZI alohida fayllarda (`TaskListScreen`,
 * `TaskDetailScreen`, `ShortageScreen`, `PlaceScreen`, `CountScreen`,
 * `ScanInfoScreen`) va ular `Activity` ni ko'rmaydi — faqat `Shell` ni.
 *
 * 🔴 NARX HECH QAYERDA ko'rsatilmaydi. Bu ekranlarning intizomi emas, SERVER
 * shartnomasi: ilova `/tsd/scan` dan foydalanadi va u narx qaytarmaydi,
 * `/products` esa TSD sessiyasiga umuman yopiq (`tsd-policy.ts`).
 */
class MainActivity : ComponentActivity(), Shell {

    private val ioPool = Executors.newSingleThreadExecutor()
    private lateinit var store: DeviceStore

    override lateinit var api: ApiClient
    override lateinit var queue: ActionQueue
    override lateinit var sender: QueueSender
    override lateinit var ui: Ui
    override var employeeId: String = ""

    private lateinit var status: TextView
    private lateinit var body: LinearLayout
    private lateinit var scanField: EditText
    private lateinit var scanner: ScannerBridge

    private var current: Screen? = null
    private val history = ArrayDeque<Screen>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = DeviceStore(this)
        queue = ActionQueue(this)
        api = ApiClient(getString(R.string.api_base_url))
        sender = QueueSender(api, queue)
        ui = Ui(this)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(ui.dp(16), ui.dp(16), ui.dp(16), ui.dp(16))
        }
        status = TextView(this).apply { textSize = 18f }
        // Skan maydoni HAR DOIM ekranning tepasida va fokusda turadi:
        // klaviatura-wedge rejimida skaner kodni AYNAN fokusdagi maydonga
        // «yozadi», ya'ni maydon ekranlar bilan birga almashsa har o'tishda
        // birinchi skan yo'qolardi.
        scanField = ui.input(R.string.scan_hint)
        body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        root.addView(status)
        root.addView(scanField)
        root.addView(
            ScrollView(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f,
                )
                addView(body)
            },
        )
        setContentView(root)

        scanner = ScannerBridge(this) { code -> routeScan(code) }
        scanner.bindKeyboardWedge(scanField)

        if (store.isPaired) showLogin() else showPairing()
    }

    override fun onStart() {
        super.onStart()
        scanner.start()
        // Ekran yoqilganda navbat o'z-o'zidan bo'shashga urinadi: omborchi
        // oflayn ishlab, keyin Wi-Fi zonasiga qaytadi va u yerda hech nima
        // bosmasligi mumkin. G5 da bu YO'Q edi (navbat faqat yozilardi).
        if (employeeId.isNotEmpty()) flushQueue(silent = true)
    }

    override fun onStop() {
        scanner.stop()
        super.onStop()
    }

    // ── Shell ───────────────────────────────────────────────────────────────

    override fun setStatus(text: String) {
        status.text = text
    }

    override fun go(screen: Screen) {
        val prev = current
        if (prev != null && prev !== screen) history.push(prev)
        current = screen
        body.removeAllViews()
        status.text = screen.title(ui)
        screen.render(body)
        // Fokus skan maydonida qoladi — wedge skaner shu maydonga yozadi.
        scanField.requestFocus()
    }

    override fun back() {
        val prev = history.poll()
        if (prev == null) {
            go(TaskListScreen(this))
            return
        }
        current = prev
        body.removeAllViews()
        status.text = prev.title(ui)
        prev.render(body)
        scanField.requestFocus()
    }

    override fun io(work: () -> Unit) {
        ioPool.execute {
            try {
                work()
            } catch (e: ApiClient.ApiException) {
                runOnUiThread { setStatus(e.message ?: "") }
            } catch (e: Exception) {
                runOnUiThread { setStatus(e.message ?: e.javaClass.simpleName) }
            }
        }
    }

    override fun main(work: () -> Unit) = runOnUiThread(work)

    override fun enqueue(method: String, path: String, body: JSONObject, label: String) {
        try {
            queue.enqueue(
                ActionQueue.Action(
                    opId = body.optString("clientOpId").ifEmpty { UUID.randomUUID().toString() },
                    method = method,
                    path = path,
                    body = body,
                    label = label,
                ),
            )
            main { ui.toast(ui.str(R.string.offline_queued, queue.size())) }
        } catch (e: ActionQueue.QueueFullException) {
            // Navbat to'lgan — YANGISI rad etiladi va bu BALAND aytiladi.
            // Eng eskisini tashlash jim yo'qotish bo'lardi (IS-5 klassi).
            main { ui.toast(e.message ?: "") }
        }
    }

    private fun flushQueue(silent: Boolean) {
        if (queue.size() == 0) return
        io {
            val r = sender.flush()
            main {
                if (!silent || r.sent > 0 || r.rejected > 0) {
                    ui.toast(
                        if (r.offline) ui.str(R.string.queue_offline, r.left)
                        else ui.str(R.string.queue_sent, r.sent, r.rejected),
                    )
                }
                if (r.sent > 0 || r.rejected > 0) go(TaskListScreen(this))
            }
        }
    }

    // ── Skaner marshruti ────────────────────────────────────────────────────

    /**
     * Skan AVVAL joriy ekranga beriladi (u bosqichga qarab talqin qiladi);
     * ekran uni yemasa — umumiy NARXSIZ skan-ma'lumot ochiladi.
     *
     * Bu tartib muhim: joylashtirish ekranida yacheyka kodi «bu yacheyka»
     * degani, ma'lumot ekranida esa «bu yacheykada nima bor» degani.
     */
    private fun routeScan(code: String) {
        val screen = current
        if (screen != null && screen.onScan(code)) return
        io {
            val hit = api.scan(code)
            main { go(ScanInfoScreen(this, hit)) }
        }
    }

    // ── 1) Juftlash ─────────────────────────────────────────────────────────

    /**
     * Juftlash — admin `POST /auth/tsd-device/pair` javobidan olgan ID va
     * kalitni terminalga KO'CHIRADI.
     *
     * Ataylab QO'LDA: kalit bir marta ko'rinadi va uni QR bilan uzatish
     * (ekrandan o'qish) uni yana bir joyda ko'rsatishni talab qilardi.
     * Bir marta bajariladigan amal uchun bu almashuv noto'g'ri.
     */
    private fun showPairing() {
        body.removeAllViews()
        status.text = getString(R.string.pair_missing)
        val id = ui.input(R.string.pair_hint)
        val secret = ui.input(R.string.pair_secret_hint)
        body.addView(ui.label(getString(R.string.pair_title), big = true))
        body.addView(id)
        body.addView(secret)
        body.addView(
            ui.button(R.string.pair_save) {
                val d = id.text.toString().trim()
                val s = secret.text.toString().trim()
                if (d.isEmpty() || s.isEmpty()) return@button
                store.deviceId = d
                store.deviceSecret = s
                ui.toast(R.string.pair_done)
                showLogin()
            },
        )
    }

    // ── 2) PIN kirish ───────────────────────────────────────────────────────

    private fun showLogin() {
        body.removeAllViews()
        history.clear()
        current = null
        status.text = getString(R.string.login_title)
        val pin = ui.input(R.string.login_pin_hint).apply { inputType = 18 /* numberPassword */ }
        body.addView(pin)
        body.addView(
            ui.button(R.string.login_button) {
                val code = pin.text.toString().trim()
                pin.setText("")
                io {
                    val resp = api.login(
                        store.deviceId.orEmpty(),
                        store.deviceSecret.orEmpty(),
                        code,
                        appVersion(),
                    )
                    // Refresh-token TANADAN olinadi (cookie yo'q) va
                    // shifrlangan holda saqlanadi. PIN HECH QACHON saqlanmaydi.
                    store.refreshToken = resp.optString("refreshToken").takeIf { it.isNotEmpty() }
                    employeeId = resp.optJSONObject("user")?.optString("id").orEmpty()
                    main {
                        go(TaskListScreen(this))
                        flushQueue(silent = true)
                    }
                }
            },
        )
    }

    /** Chiqish — sessiya o'chadi, juftlik QOLADI (terminal qayta ulanmasin). */
    override fun logout() {
        store.clearSession()
        api.accessToken = null
        employeeId = ""
        showLogin()
    }

    private fun appVersion(): String =
        runCatching { packageManager.getPackageInfo(packageName, 0).versionName }
            .getOrNull().orEmpty()
}
