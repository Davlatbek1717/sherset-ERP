package uz.sherset.tsd

import android.app.Activity
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/**
 * G6 — TSD ekranlarining umumiy qobig'i va vidjet yordamchilari.
 *
 * Layout XML YO'Q (G5 skeletidagi qaror saqlanadi): ekranlar dasturiy
 * quriladi. Sabab — ilova bir nechta oddiy ro'yxatdan iborat va XML+ViewBinding
 * qatlami bu yerda faqat qo'shimcha qism bo'lardi; Compose esa APK ni
 * eski terminallar uchun sezilarli og'irlashtiradi.
 *
 * 🔴 TEGISH NISHONLARI `dimens.xml` dan (56dp/64dp). Web'dagi `min-h-11`
 * tuzog'i (dizayn-tizim rem bazasi 12px ⇒ 33px) bu yerda YO'Q: `dp` mutlaq
 * o'lchov. Qiymat Material minimumidan (48dp) ataylab yirikroq — omborchi
 * qo'lqopda, harakatda va sovuq omborda ishlaydi.
 */
class Ui(private val activity: Activity) {

    fun dp(v: Int): Int = (v * activity.resources.displayMetrics.density).toInt()

    fun title(text: String): TextView = TextView(activity).apply {
        this.text = text
        textSize = 20f
        setPadding(0, dp(4), 0, dp(4))
    }

    fun label(text: String, big: Boolean = false): TextView = TextView(activity).apply {
        this.text = text
        textSize = if (big) 22f else 17f
        setPadding(0, dp(2), 0, dp(2))
    }

    fun button(label: String, onClick: () -> Unit): Button = Button(activity).apply {
        text = label
        textSize = 18f
        gravity = Gravity.CENTER_VERTICAL or Gravity.START
        minHeight = activity.resources.getDimensionPixelSize(R.dimen.touch_target_primary)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8) }
        setOnClickListener { onClick() }
    }

    fun button(labelRes: Int, onClick: () -> Unit): Button =
        button(activity.getString(labelRes), onClick)

    fun input(hint: String, numeric: Boolean = false): EditText = EditText(activity).apply {
        this.hint = hint
        textSize = 20f
        if (numeric) inputType = 8194 /* numberDecimal */
        minHeight = activity.resources.getDimensionPixelSize(R.dimen.touch_target_min)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8) }
    }

    fun input(hintRes: Int, numeric: Boolean = false): EditText =
        input(activity.getString(hintRes), numeric)

    fun row(): LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(8), 0, dp(8))
    }

    fun toast(text: String) = Toast.makeText(activity, text, Toast.LENGTH_SHORT).show()
    fun toast(res: Int) = Toast.makeText(activity, res, Toast.LENGTH_SHORT).show()

    fun str(res: Int): String = activity.getString(res)
    fun str(res: Int, vararg args: Any): String = activity.getString(res, *args)
}

/**
 * Ekranning ilovadan so'raydigan HAMMASI. Ekran `Activity` ni ko'rmaydi —
 * shuning uchun ekranlarni qayta tartiblash yoki qo'shish `MainActivity` ga
 * tegmaydi.
 */
interface Shell {
    val api: ApiClient
    val queue: ActionQueue
    val sender: QueueSender
    val ui: Ui

    /** Kirgan xodim (topshiriqlar shu bo'yicha filtrlanadi). */
    val employeeId: String

    fun setStatus(text: String)
    fun go(screen: Screen)
    fun back()

    /** Ish IO thread'da; xato bo'lsa `onError` UI thread'da chaqiriladi. */
    fun io(work: () -> Unit)

    /** UI thread'da bajarish. */
    fun main(work: () -> Unit)

    /**
     * Amalni oflayn navbatga qo'yadi (aloqa yo'qligi aniqlanganda).
     * `label` — omborchiga ko'rinadigan tavsif.
     */
    fun enqueue(method: String, path: String, body: org.json.JSONObject, label: String)

    /** Sessiyani yopadi; qurilma juftligi QOLADI. */
    fun logout()
}

/** Bitta ish ekrani. */
interface Screen {
    /** Yuqoridagi holat qatoriga chiqadigan sarlavha. */
    fun title(ui: Ui): String

    fun render(body: LinearLayout)

    /**
     * Skaner kodi keldi. Sukut — e'tiborsiz (har ekran skanerni kutmaydi).
     * `true` qaytarsa kod SHU ekran tomonidan yeyildi va umumiy skan-qidiruv
     * ochilmaydi.
     */
    fun onScan(code: String): Boolean = false
}
