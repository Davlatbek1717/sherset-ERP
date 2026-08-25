package uz.sherset.tsd

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.view.KeyEvent
import android.widget.EditText

/**
 * Apparat skaner ko'prigi (G5, 3-vazifa).
 *
 * TSD modeli HALI TANLANMAGAN, shuning uchun ikki rejim birga yashaydi:
 *
 *  1. **Klaviatura-wedge (SUKUT, hamma terminalda ishlaydi).** Skaner kodni
 *     klaviatura sifatida «yozadi» va oxirida Enter yuboradi. Bu rejim
 *     hech qanday sozlashsiz ishlaydi — reja aynan shuni talab qiladi
 *     («modelgacha — klaviatura-wedge rejimi ishlasin»).
 *  2. **Broadcast (DataWedge / Urovo / Newland).** Model aniqlangach
 *     `res/values/config.xml` dagi `scanner_broadcast_action` to'ldiriladi va
 *     KOD O'ZGARMAYDI. Aksiya bo'sh bo'lsa qabul qiluvchi umuman ro'yxatga
 *     olinmaydi.
 *
 * 🔴 Nega ikkalasi birga: wedge rejimi maydonga fokus talab qiladi va
 * omborchi tasodifan fokusni yo'qotsa skan «yo'qoladi». Broadcast esa
 * fokusdan mustaqil. Terminal kelgach ikkinchisi yoqiladi, birinchisi
 * zaxira bo'lib qoladi — bittasini olib tashlash uchun sabab yo'q.
 */
class ScannerBridge(
    private val activity: Activity,
    private val onCode: (String) -> Unit,
) {

    private var receiver: BroadcastReceiver? = null

    /** Broadcast rejimini yoqadi (aksiya sozlangan bo'lsa). */
    fun start() {
        val action = activity.getString(R.string.scanner_broadcast_action)
        if (action.isBlank()) return
        val extra = activity.getString(R.string.scanner_broadcast_extra)
        val r = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val code = intent?.getStringExtra(extra)?.trim().orEmpty()
                if (code.isNotEmpty()) onCode(code)
            }
        }
        receiver = r
        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ eksport bayrog'ini MAJBURIY talab qiladi; skaner
            // servisi boshqa ilova ⇒ EXPORTED.
            activity.registerReceiver(r, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            activity.registerReceiver(r, filter)
        }
    }

    fun stop() {
        receiver?.let { runCatching { activity.unregisterReceiver(it) } }
        receiver = null
    }

    /**
     * Klaviatura-wedge: maydonga Enter tushganda kodni beradi va maydonni
     * TOZALAYDI (keyingi skan ustiga yozilmasin).
     */
    fun bindKeyboardWedge(input: EditText) {
        input.setOnKeyListener { _, keyCode, event ->
            val enter = keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER
            if (enter && event.action == KeyEvent.ACTION_UP) {
                val code = input.text.toString().trim()
                input.setText("")
                if (code.isNotEmpty()) onCode(code)
                true
            } else {
                false
            }
        }
    }
}
