package uz.sherset.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.location.Location
import android.os.IBinder
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Foreground GPS-service (TZ 2026-07-28 §5). Smena OCHIQ bo'lganда ishga
 * tushiriladi; har lokatsiyada ping quradi, avval oflayn-buferni bo'shatadi,
 * keyin joriy ping'ni yuboradi — xato bo'lsa buferga yozadi. Doimiy
 * bildirishnoma (Android talabi + maxfiylik shaffofligi).
 *
 * Bu SKELET (build-verified emas): Google Play Services location + OkHttp
 * bog'liqliklari `build.gradle.kts`да; runtime ruxsatlar MainActivity'да so'raladi.
 */
class LocationForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "driver_tracking"
        const val NOTIF_ID = 42
        const val EXTRA_BASE_URL = "base_url"
        const val EXTRA_TOKEN = "token"
        // Faol yetkazma tez-tez; hozir sodda — 15s. To'liq ilovaда yetkazma
        // holatiga qarab moslashadi (README).
        const val INTERVAL_MS = 15_000L
        const val FASTEST_MS = 10_000L
        const val MIN_DISPLACEMENT_M = 25f
    }

    private val io = Executors.newSingleThreadExecutor()
    private lateinit var buffer: PingBuffer
    private lateinit var api: ApiClient
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            io.execute { handleLocation(loc) }
        }
    }

    override fun onCreate() {
        super.onCreate()
        buffer = PingBuffer(this)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val baseUrl = intent?.getStringExtra(EXTRA_BASE_URL).orEmpty()
        val token = intent?.getStringExtra(EXTRA_TOKEN)
        api = ApiClient(baseUrl).also { it.token = token }
        startForeground(NOTIF_ID, buildNotification())
        requestUpdates()
        return START_STICKY // OS o'ldirsa qayta boshlansin
    }

    private fun requestUpdates() {
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
            .setMinUpdateIntervalMillis(FASTEST_MS)
            .setMinUpdateDistanceMeters(MIN_DISPLACEMENT_M)
            .build()
        runCatching {
            fused.requestLocationUpdates(req, callback, Looper.getMainLooper())
        }
    }

    /** Ping quradi: avval buferni bo'shatadi, keyin joriy ping'ni yuboradi. */
    private fun handleLocation(loc: Location) {
        val ping = JSONObject().apply {
            put("lat", loc.latitude)
            put("lng", loc.longitude)
            put("accuracy", loc.accuracy.toDouble())
            if (loc.hasSpeed()) put("speed", loc.speed.toDouble())
            if (loc.hasBearing()) put("heading", loc.bearing.toDouble())
            put("ts", java.time.Instant.ofEpochMilli(loc.time).toString())
        }
        flushBuffer()
        runCatching { api.sendPing(ping) }
            .onFailure { buffer.enqueue(ping) } // tarmoq yo'q → buferga
    }

    /** Buferdagi ping'larni FIFO yuboradi; birinchi xatoда to'xtaydi (tartib saqlanadi). */
    private fun flushBuffer() {
        val pending = buffer.peekAll()
        if (pending.isEmpty()) return
        var sent = 0
        for (p in pending) {
            val ok = runCatching { api.sendPing(p) }.isSuccess
            if (!ok) break
            sent++
        }
        if (sent > 0) buffer.dropFirst(sent)
    }

    private fun createChannel() {
        val ch = NotificationChannel(
            CHANNEL_ID, "Lokatsiya kuzatuvi", NotificationManager.IMPORTANCE_LOW,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    private fun buildNotification(): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Sherset Driver")
            .setContentText("Lokatsiya uzatilmoqda · Smena faol")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()

    override fun onDestroy() {
        runCatching { fused.removeLocationUpdates(callback) }
        io.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
