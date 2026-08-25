package uz.sherset.tsd

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Terminal sirlari — SHIFRLANGAN diskda.
 *
 * 🔴 Nega `driver-app` dagi oddiy `SharedPreferences` EMAS: haydovchi ilovasi
 * har safar parol bilan kirardi va tokenni faqat xotirada saqlardi. TSD esa
 * qurilma KALITINI doimiy saqlaydi (u ikkinchi omil) va refresh-tokenni ham.
 * Oddiy prefs fayli root'langan yoki yo'qolgan terminalda ochiq matn bo'lardi
 * — ya'ni kalitning butun ma'nosi yo'qolardi.
 *
 * PIN HECH QACHON saqlanmaydi: u odamning bilimi, qurilmaniki emas. Ikki omil
 * bitta joyda yotsa bir omilga aylanadi.
 */
class DeviceStore(context: Context) {

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "tsd_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(v) = prefs.edit().putString(KEY_DEVICE_ID, v).apply()

    var deviceSecret: String?
        get() = prefs.getString(KEY_DEVICE_SECRET, null)
        set(v) = prefs.edit().putString(KEY_DEVICE_SECRET, v).apply()

    /** Server bergan refresh-token (`/auth/tsd-login` javob tanasida). */
    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        set(v) = prefs.edit().putString(KEY_REFRESH, v).apply()

    val isPaired: Boolean get() = !deviceId.isNullOrEmpty() && !deviceSecret.isNullOrEmpty()

    /** Chiqish — SESSIYA o'chadi, juftlik QOLADI (terminal qayta ulanmasin). */
    fun clearSession() {
        prefs.edit().remove(KEY_REFRESH).apply()
    }

    /** Terminalni uzish (admin ishi) — hamma sir o'chadi. */
    fun unpair() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_DEVICE_SECRET = "device_secret"
        const val KEY_REFRESH = "refresh_token"
    }
}
