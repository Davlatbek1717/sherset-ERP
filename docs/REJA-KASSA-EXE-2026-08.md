# REJA-KASSA-EXE 2026-08 — yakuniy hisobot (F1–F8)

Reja: `docs/superpowers/plans/2026-08-13-kassa-exe-barqarorlik.md` (1.4.0 → 1.5.0).
Faza hisobotlari (asl manba, o'zgartirilmagan): `docs/audits/kassa-F1..F7-hisobot.md`.
Bu fayl — F8 yig'ma hisoboti. Yozilgan sana: 2026-08-13.

**Maqsad edi:** qobiqni «yozilgan, lekin qurilmaga yetmaydigan» holatdan «qurilmada o'zi
yangilanadigan, o'zi ko'tariladigan, ko'rinadigan» holatga o'tkazish.

**Holat (halol):** kod F1–F7 to'liq (Phase-1) · reliz 1.5.0 **kanalga chiqarilgan** ·
migratsiya + web **prodda** · **qurilmadagi qadamlar (8.5–8.7) BAJARILMAGAN** — operator
«keyingisiga o'taver» dedi, shuning uchun o'lchov varaqasining 17 qatori ham, K04 ham
**ochiq qarz** bo'lib qoladi. Hech bir ID «Phase-2 verified» OLMADI.

---

## Fazalar va commitlar

| Faza | Nom | ID'lar | Commit | Holat |
|---|---|---|---|---|
| F1 | Yangilanish yetkazish kanali (boot-o'rnatish, per-user) | K01 K02 K03 | `efae4c5f` | Phase-1 |
| F2 | Ko'rinuvchanlik: fayl-log + versiya belgisi | K05 K06 | `7feea9d2` | Phase-1 |
| F3 | Qurilma reyestri: `PosDevice.shellVersion` | K07 | `2b56504f` | Phase-1 (migratsiya **prodda**, 8.2) |
| F4 | Kiosk qattiqligi + watchdog | K08–K12 | `74500427` | Phase-1 |
| F5 | Klaviatura: Enter/o'qlar/joylashuv (kbd-probe O'LCHANGAN) | K13–K15 | `e2bede04` | Phase-1 (probe jonli Electron'da o'tgan) |
| F6 | Chop ishonchliligi: shrift kutish, yagona popup | K16 K17 (K18→F2) | `ef60b533` | Phase-1 |
| F7 | Mijoz-ekran: holat eslab qolinadi, retry | K19 K20 | `bc493869` | Phase-1 |
| F8 | Reliz + kanal + prod (8.1–8.4) | K04 (**yopilmadi**) | `13d74361` + deploy | quyida |

## F8 da O'LCHANGAN (2026-08-13, hammasi jonli tekshirilgan)

- **8.1 Yig'ish:** `Sherset-Kassa-Setup-1.5.0.exe` (81 961 337 B) + `.blockmap` + `latest.yml`.
  Asar MAZMUNI tekshirildi: `installOnBoot` ×4 · `⏎` ×2 · `waitForPending` ×3 ·
  `document.fonts.ready` ×1 · `setCustomerDisplayOpen` ×4. sha512 lokal qayta hisoblab
  `latest.yml` bilan mos.
- **🐛 8.1 TOPILMASI (tuzatildi, `13d74361`):** watchdog `.ps1` fayllari artefaktga UMUMAN
  kirmasdi — `build.files` faqat `*.js/*.html` olardi; asarga solish ham yechim emas
  (PowerShell/Task Scheduler asar arxividan o'qiy olmaydi). Yechim: `build.extraResources` →
  `resources\tools\watchdog\*.ps1` o'rnatmada haqiqiy fayl. Qo'riqchi test RED→GREEN,
  to'liq gate yashil. Qayta yig'ilgan installer'da ikkala `.ps1` `win-unpacked/resources/
  tools/watchdog/` da tasdiqlandi.
- **8.2 Migratsiya prodga:** backup `pre-shell-version-20260813-061409.sql.gz` (732M,
  `gzip -t` o'tdi, 255 CREATE TABLE) → `deploy-smart.sh` ichida
  `Applying migration 20260813120000_pos_device_shell_version` → ustun mavjudligi SELECT
  bilan tasdiqlandi. Drift-o'lchov (oldindan): prod 226 yozuv, repo bilan farq faqat
  prod-only `20260802180000_manager_daily_kpi` (zararsiz, eski) — deploy AYNAN 1 migratsiya qo'lladi.
- **8.3 Web deploy:** push `9ba939d8..13d74361` → `deploy-smart.sh` (DS_TARGET=v2) →
  `Deploy done: 9ba939d8 → 13d74361` · api health `{"status":"ok"}` · web :3011 = 200 ·
  `https://erp.sherset.uz` = 200. Yangi majburiy env YO'Q (`.env.example` diff bo'sh).
- **8.4 Kanal:** tartib to'g'ri bajarildi — avval `.exe`+`.blockmap`, **sha512 remote'da
  qayta hisoblanib manifest bilan solishtirildi (MOS)**, `latest.yml` ENG OXIRIDA
  (eskisi `latest.yml.bak-1.4.0`). 1.2.0/1.3.0/1.4.0 fayllari O'CHIRILMAGAN (rollback).
  Tashqaridan: `latest.yml` = 1.5.0, exe HEAD 200.
- **Kanal jonli iste'molchisi bor:** nginx log 2026-08-13 03:46 — real qurilma IP'sidan
  `GET /downloads/desktop/latest.yml`, UA `electron-builder` (hali 1.4.0 davri so'rovi).
- **Reyestr holati:** `pos_devices` (revoked emas) — 3 qator (Monoblok 1 ×2, Monoblok 2),
  `shell_version` hammasida NULL. Yangi web-kod endi deploy bo'ldi — keyingi kassir
  kirishida 1.4.0 qiymati tushishi kutiladi (bu ham hali O'LCHANMAGAN).

## 🔴 O'lchov varaqasi (8.6) — qurilmada BAJARILMADI

Operator qarori bilan qurilma bosqichi o'tkazib yuborildi; birorta qator ko'rilmagani
uchun hammasi halol «sinalmadi». Bu varaqa keyingi qurilma-sessiyada to'ldiriladi.

| # | Nima o'lchanadi | Natija |
|---|---|---|
| 1 | Chek qog'ozda chiqadi | ☐ sinalmadi |
| 2 | Chek oxiri KESILMAYDI (K16) | ☐ sinalmadi |
| 3 | Sukut printer nomi belgida (K18) | ☐ sinalmadi |
| 4 | Ikkinchi chop YANGI oyna ochmaydi (K17) | ☐ sinalmadi |
| 5 | Versiya belgisi ko'rinadi (K06) | ☐ sinalmadi |
| 6 | `kassa.log` yozilmoqda (K05) | ☐ sinalmadi |
| 7 | Numpad + kirill (qurilmada) | ☐ sinalmadi (kbd-probe'da Electron darajasida O'LCHANGAN — F5) |
| 8 | Enter formani tasdiqlaydi (K13) | ☐ sinalmadi (probe: keydown yetadi, implicit-submit YO'Q) |
| 9 | O'q tugmalari kursorni siljitadi (K14) | ☐ sinalmadi (probe: ijobiy) |
| 10 | Maydon klaviatura ostida qolmaydi (K15) | ☐ sinalmadi |
| 11 | Reboot'da kassa O'ZI ochiladi (K08) | ☐ sinalmadi |
| 12 | Ekran uxlamaydi (K09) | ☐ sinalmadi |
| 13 | Pinch-zoom buzmaydi (K10) | ☐ sinalmadi |
| 14 | Watchdog ko'taradi (K12) | ☐ sinalmadi (skript endi artefaktda — 8.1 fix) |
| 15 | Mijoz-ekran reboot'dan keyin o'zi (K19) | ☐ sinalmadi |
| 16 | 🔴 Avtoyangilanish (K04) | ☐ sinalmadi — **butun rejaning maqsadi, hamon qarz** |
| 17 | Serverda `shell_version` to'ldi (K07) | ☐ sinalmadi (ustun bor, qiymatlar hali NULL) |

## Qolgan qarzlar (keyingi qurilma-sessiya rejasi)

1. **8.5 — qo'lda o'tish (har qurilmada, admin):** 1.4.0 ni «Удалить» →
   `https://erp.sherset.uz/downloads/desktop/Sherset-Kassa-Setup-1.5.0.exe` → UAC
   so'ralmasligi → burchakda v1.5.0. Shu payt **haqiqiy o'rnatma papkasini o'lchash**
   (`%LOCALAPPDATA%\Programs\…` — `sherset-kassa`mi yoki `Sherset Kassa`mi):
   F4 watchdog skriptidagi yo'l TAXMIN, farq qilsa `kassa-watchdog.ps1` tuzatiladi.
2. **8.6 — varaqaning 17 qatori** (yuqorida).
3. **8.7 — K04 jonli sinovi:** 1.5.1 yig'ish (versiya + README nomi + ko'rinadigan mayda
   o'zgarish) → kanalga 8.4 tartibida → qurilmani qayta ochish → «Yangilanish
   o'rnatilmoqda» → o'zi qaytadi → belgida 1.5.1 → UAC so'ralmadi (K03 isboti).
   Ishlamasa: `kassa.log` + `%LOCALAPPDATA%\sherset-kassa-updater\` mazmuni hisobotga.
4. `install-watchdog.ps1` + autostart + powerSaveBlocker — birinchi marta qurilmada.
5. Watchdog jarayon nomi (`Sherset Kassa`) `Get-Process` bilan tekshirilsin.

## Muhim arxitektura eslatmalari (F1–F7 hisobotlaridan, F8 uchun)

- 1.4.0 → 1.5.0 o'tish **avtomatik EMAS** (per-machine → per-user, NSIS almasha olmaydi);
  1.4.0 qobiq K01 tufayli baribir hech qachon o'zi o'rnatmasdi. Shu sabab 8.5 qo'lda.
- 1.5.0 dan boshlab: boot'da 25 s kutish → faqat kirish ekranida bo'lsa o'rnatadi →
  o'zi qaytadi (`isForceRunAfter=true`). «Chiqish» yo'lida qaytmaydi (ataylab).
- `shell_version` NULL = «o'lchanmagan» (brauzer kirishi ustidan YOZMAYDI — alohida test qo'riqlaydi).
- Chek balandligi endi `document.fonts.ready` dan keyin (3 s chegara); popup yagona.
- Mijoz-ekran holati `kassa-config.json` da; yangilanish yo'li ham `remember=false` bilan yopadi
  (F7 rejadagi «uch chaqiruvchi» aslida TO'RTTA edi — to'rtinchisi boot-yangilanish yo'li).
