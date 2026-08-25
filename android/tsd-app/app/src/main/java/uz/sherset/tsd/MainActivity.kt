package uz.sherset.tsd

import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/**
 * TSD skeleti (G-reja G5, 2-vazifa): juftlash → PIN → topshiriqlar → skan.
 *
 * `driver-app/MainActivity.kt` naqshi: dasturiy UI (layout XML yo'q), IO
 * bitta thread'da, natija `runOnUiThread` bilan. Ish EKRANLARI (yig'ish
 * qatorlari, joylashtirish, sanash) — G6 fazasi; bu yerda ularning ULANISH
 * NUQTASI bor va u ishlaydi.
 *
 * 🔴 NARX HECH QAYERDA ko'rsatilmaydi. Bu ekranning intizomi emas, SERVER
 * shartnomasi: ilova `/tsd/scan` dan foydalanadi va u narx qaytarmaydi,
 * `/products` esa TSD sessiyasiga umuman yopiq (`tsd-policy.ts`).
 */
class MainActivity : ComponentActivity() {

    private val io = Executors.newSingleThreadExecutor()
    private lateinit var store: DeviceStore
    private lateinit var queue: ActionQueue
    private lateinit var api: ApiClient
    private lateinit var scanner: ScannerBridge

    private lateinit var status: TextView
    private lateinit var body: LinearLayout
    private var employeeId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = DeviceStore(this)
        queue = ActionQueue(this)
        api = ApiClient(getString(R.string.api_base_url))

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        status = TextView(this).apply {
            textSize = 18f
            text = if (store.isPaired) getString(R.string.login_title) else getString(R.string.pair_missing)
        }
        body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(status)
        root.addView(ScrollView(this).apply { addView(body) })
        setContentView(root)

        scanner = ScannerBridge(this) { code -> onScan(code) }

        if (store.isPaired) showLogin() else showPairing()
    }

    override fun onStart() {
        super.onStart()
        scanner.start()
    }

    override fun onStop() {
        scanner.stop()
        super.onStop()
    }

    // -- 1) Juftlash ---------------------------------------------------------

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
        val id = input(R.string.pair_hint)
        val secret = input(R.string.pair_secret_hint)
        val save = bigButton(R.string.pair_save) {
            val d = id.text.toString().trim()
            val s = secret.text.toString().trim()
            if (d.isEmpty() || s.isEmpty()) return@bigButton
            store.deviceId = d
            store.deviceSecret = s
            toast(R.string.pair_done)
            showLogin()
        }
        body.addView(TextView(this).apply { text = getString(R.string.pair_title); textSize = 20f })
        body.addView(id)
        body.addView(secret)
        body.addView(save)
    }

    // -- 2) PIN kirish -------------------------------------------------------

    private fun showLogin() {
        body.removeAllViews()
        status.text = getString(R.string.login_title)
        val pin = input(R.string.login_pin_hint).apply { inputType = 18 /* numberPassword */ }
        val btn = bigButton(R.string.login_button) {
            val code = pin.text.toString().trim()
            pin.setText("")
            io.execute {
                runCatching {
                    api.login(
                        store.deviceId.orEmpty(),
                        store.deviceSecret.orEmpty(),
                        code,
                        appVersion(),
                    )
                }.onSuccess { resp ->
                    // Refresh-token TANADAN olinadi (cookie yo'q) va
                    // shifrlangan holda saqlanadi.
                    store.refreshToken = resp.optString("refreshToken").takeIf { it.isNotEmpty() }
                    employeeId = resp.optJSONObject("user")?.optString("id")
                    runOnUiThread { showTasks() }
                }.onFailure { e ->
                    runOnUiThread { status.text = e.message ?: getString(R.string.login_failed) }
                }
            }
        }
        body.addView(pin)
        body.addView(btn)
    }

    // -- 3) Topshiriqlar -----------------------------------------------------

    private fun showTasks() {
        body.removeAllViews()
        status.text = getString(R.string.tasks_title)

        val scanField = input(R.string.scan_hint)
        scanner.bindKeyboardWedge(scanField)
        body.addView(scanField)
        body.addView(bigButton(R.string.tasks_refresh) { loadTasks() })
        body.addView(bigButton(R.string.logout) {
            store.clearSession()
            api.accessToken = null
            showLogin()
        })
        if (queue.size() > 0) {
            body.addView(TextView(this).apply {
                text = getString(R.string.queue_pending, queue.size())
            })
        }
        loadTasks()
    }

    private fun loadTasks() {
        val me = employeeId ?: return
        io.execute {
            runCatching { api.myTasks(me) }
                .onSuccess { items -> runOnUiThread { renderTasks(items) } }
                .onFailure { e -> runOnUiThread { status.text = e.message.orEmpty() } }
        }
    }

    private fun renderTasks(items: JSONArray) {
        if (items.length() == 0) {
            body.addView(TextView(this).apply { text = getString(R.string.tasks_empty) })
            return
        }
        for (i in 0 until items.length()) {
            val t = items.optJSONObject(i) ?: continue
            body.addView(bigButton(t.optString("name", t.optString("id"))) {
                // G6: topshiriq detali va qator tasdiqlash ekrani.
                toast(t.optString("id"))
            })
        }
    }

    // -- 4) Skan -------------------------------------------------------------

    /**
     * Skan natijasi. **Multi-hit MAJBURIY** (G-reja): shtrixlar ataylab unikal
     * emas, shuning uchun bir nechta tovar chiqsa ilova O'ZI birortasini
     * tanlamaydi — ro'yxat ko'rsatadi va odam tanlaydi. Jimgina birinchisini
     * olish noto'g'ri tovarni ko'chirishga olib kelardi.
     */
    private fun onScan(code: String) {
        io.execute {
            runCatching { api.scan(code) }
                .onSuccess { resp -> runOnUiThread { renderScan(resp) } }
                .onFailure { e -> runOnUiThread { status.text = e.message.orEmpty() } }
        }
    }

    private fun renderScan(resp: JSONObject) {
        body.removeAllViews()
        when (resp.optString("kind")) {
            // K-reja 7.3 — bo'lak kodi tovar tanlovini OCHMAYDI.
            "piece" -> body.addView(TextView(this).apply { text = getString(R.string.scan_piece) })
            "none" -> body.addView(TextView(this).apply { text = getString(R.string.scan_none) })
            "cell" -> io.execute {
                runCatching { api.cellByBarcode(resp.optString("code")) }
                    .onSuccess { r -> runOnUiThread { renderCell(r) } }
            }
            else -> {
                val products = resp.optJSONArray("products") ?: JSONArray()
                if (products.length() > 1) {
                    body.addView(TextView(this).apply { text = getString(R.string.scan_multi) })
                }
                for (i in 0 until products.length()) {
                    val p = products.optJSONObject(i) ?: continue
                    body.addView(bigButton(productLabel(p)) { toast(p.optString("id")) })
                }
            }
        }
        body.addView(bigButton(R.string.tasks_refresh) { showTasks() })
    }

    /** Tovar qatori — nom, qoldiq, yacheyka. NARX YO'Q (server ham bermaydi). */
    private fun productLabel(p: JSONObject): String {
        val cells = p.optJSONArray("cells") ?: JSONArray()
        val where = if (cells.length() > 0) {
            cells.optJSONObject(0)?.optString("cellName").orEmpty()
        } else {
            p.optString("homeCell")
        }
        return p.optString("name") + "  ·  " + p.optString("totalQty") + "  ·  " + where
    }

    private fun renderCell(r: JSONObject) {
        body.removeAllViews()
        val stock = r.optJSONArray("stock") ?: JSONArray()
        for (i in 0 until stock.length()) {
            val s = stock.optJSONObject(i) ?: continue
            body.addView(TextView(this).apply {
                textSize = 18f
                text = s.optString("name") + "  ·  " + s.optString("qty")
            })
        }
        body.addView(bigButton(R.string.tasks_refresh) { showTasks() })
    }

    // -- UI yordamchilari ----------------------------------------------------

    /**
     * Tegish nishonlari `dimens.xml` dan (56dp/64dp). Web'dagi `min-h-11`
     * tuzog'i (rem bazasi 12px ⇒ 33px) bu yerda yo'q: `dp` mutlaq o'lchov.
     */
    private fun bigButton(textRes: Int, onClick: () -> Unit): Button =
        bigButton(getString(textRes), onClick)

    private fun bigButton(label: String, onClick: () -> Unit): Button = Button(this).apply {
        text = label
        textSize = 18f
        gravity = Gravity.CENTER_VERTICAL or Gravity.START
        minHeight = resources.getDimensionPixelSize(R.dimen.touch_target_primary)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8) }
        setOnClickListener { onClick() }
    }

    private fun input(hintRes: Int): EditText = EditText(this).apply {
        hint = getString(hintRes)
        textSize = 20f
        minHeight = resources.getDimensionPixelSize(R.dimen.touch_target_min)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8) }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun toast(res: Int) = Toast.makeText(this, res, Toast.LENGTH_SHORT).show()
    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    private fun appVersion(): String =
        runCatching { packageManager.getPackageInfo(packageName, 0).versionName }
            .getOrNull().orEmpty()

    /** G6 uchun ulanish nuqtasi — oflayn amalni navbatga qo'yish. */
    @Suppress("unused")
    private fun enqueue(method: String, path: String, payload: JSONObject) {
        runCatching {
            queue.enqueue(
                ActionQueue.Action(UUID.randomUUID().toString(), method, path, payload),
            )
            toast(R.string.offline)
        }.onFailure { toast(it.message.orEmpty()) }
    }
}
