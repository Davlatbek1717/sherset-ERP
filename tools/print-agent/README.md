# Sherset Print Agent

Kassir kompyuterida ishlaydigan kichik lokal xizmat. Bitta kompyuterga bir nechta
printer ulanganda, har omborning yig'ish-chekini **aynan o'z printeriga** yo'naltirish
uchun kerak (brauzer buni o'zi qila olmaydi).

Hech narsa o'rnatish shart emas — faqat Windows va PowerShell (allaqachon bor).

## O'rnatish / ishga tushirish

1. Ushbu `print-agent` papkasini kassir kompyuteriga ko'chiring (masalan `C:\sherset-agent\`).
2. **`start-agent.bat`** faylini ikki marta bosing.
3. Ochilgan oynada quyidagini ko'rasiz:
   ```
   Sherset Print Agent ishga tushdi
   Manzil : http://127.0.0.1:17777
   Printerlar:
     - XP-80C
     - XP-80C (Copy 1)
   ```
   Bu oynani **ochiq qoldiring** (yopsangiz agent to'xtaydi).

> Windowsni har yoqishда avtomat ishga tushishi uchun `start-agent.bat` yorlig'ini
> `shell:startup` papkasiga qo'ying.

### Agar "Listener ochilmadi" xatosi chiqsa
Bir marta **administrator** PowerShell'da quyidagini bajaring, keyin qayta uriниб ko'ring:
```
netsh http add urlacl url=http://127.0.0.1:17777/ user=Everyone
```

## Tekshirish (brauzerdan)

Agent ishlayotganini bilish uchun brauzerда oching:
- <http://127.0.0.1:17777/health> → `{"ok":true,...}`
- <http://127.0.0.1:17777/printers> → o'rnatilgan printerlar ro'yxati

Sinov chop etish (PowerShell'da):
```powershell
$body = '{"printer":"XP-80C","text":"SHERSET SINOV\nOmbor 1\nSalom dunyo"}'
Invoke-RestMethod -Uri http://127.0.0.1:17777/print -Method Post -Body $body -ContentType 'application/json'
```
`"XP-80C"` o'rniga o'z printeringiz nomini yozing (ro'yxatдан). Printerdан chek chiqsa — tayyor.

## Endpointlar (ilova ishlatadi)

| Metod | Yo'l | Vazifa |
|-------|------|--------|
| GET  | `/health`   | Agent tirikligini tekshirish |
| GET  | `/printers` | O'rnatilgan printerlar ro'yxati |
| POST | `/print`    | `{"printer":"NAME","dataBase64":"<ESC/POS>"}` yoki `{"printer":"NAME","text":"..."}` |

Localhost (127.0.0.1) HTTPS-sahifadan chaqirilishi Chrome tomonidan ruxsat etiladi. CORS ochiq.
