package uz.sherset.driver

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * Kirish + smena start/stop (TZ §5). Sodda dasturiy UI (skelet). Ruxsatlar
 * bosqichma-bosqich so'raladi (fine → background → notifications). Foreground
 * service faqat «Smenani boshlash»да ishga tushadi (maxfiylik: smenasiz GPS yo'q).
 */
class MainActivity : ComponentActivity() {

    // TODO: res/values/config.xml → api_base_url. Skeletда to'g'ridan-to'g'ri:
    private val baseUrl = "https://erp.sherset.uz/api/v1"
    private val io = Executors.newSingleThreadExecutor()
    private val api by lazy { ApiClient(baseUrl) }
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissions()

        val email = EditText(this).apply { hint = "email" }
        val pass = EditText(this).apply { hint = "parol"; inputType = 129 /* textPassword */ }
        val loginBtn = Button(this).apply { text = "Kirish" }
        val startBtn = Button(this).apply { text = "Smenani boshlash"; isEnabled = false }
        val stopBtn = Button(this).apply { text = "Smenani tugatish"; isEnabled = false }
        status = TextView(this).apply { text = "Kirilmagan" }

        loginBtn.setOnClickListener {
            io.execute {
                runCatching { api.login(email.text.toString().trim(), pass.text.toString()) }
                    .onSuccess {
                        runOnUiThread {
                            status.text = "Kirildi ✓"
                            startBtn.isEnabled = true
                            Toast.makeText(this, "Kirildi", Toast.LENGTH_SHORT).show()
                        }
                    }
                    .onFailure { e -> runOnUiThread { status.text = "Xato: ${e.message}" } }
            }
        }

        startBtn.setOnClickListener {
            io.execute {
                runCatching { api.startShift() }.onSuccess {
                    val svc = Intent(this, LocationForegroundService::class.java)
                        .putExtra(LocationForegroundService.EXTRA_BASE_URL, baseUrl)
                        .putExtra(LocationForegroundService.EXTRA_TOKEN, api.token)
                    ContextCompat.startForegroundService(this, svc)
                    runOnUiThread {
                        status.text = "Smena faol · uzatilmoqda"
                        startBtn.isEnabled = false; stopBtn.isEnabled = true
                    }
                }.onFailure { e -> runOnUiThread { status.text = "Xato: ${e.message}" } }
            }
        }

        stopBtn.setOnClickListener {
            io.execute {
                runCatching { api.endShift() }
                stopService(Intent(this, LocationForegroundService::class.java))
                runOnUiThread {
                    status.text = "Smena tugadi"
                    stopBtn.isEnabled = false; startBtn.isEnabled = true
                }
            }
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
            addView(status); addView(email); addView(pass)
            addView(loginBtn); addView(startBtn); addView(stopBtn)
        })
    }

    private fun requestPermissions() {
        val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
        // Background — Android 10+ да alohida bosqich (bu yerда soddalashtirilган).
        if (Build.VERSION.SDK_INT >= 29) perms.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        val need = perms.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 1)
    }
}
