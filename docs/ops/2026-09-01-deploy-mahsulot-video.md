# 2026-09-01 (tong, 4-deploy) — mahsulot videolari jonlida (`8d9602bd`)

**Nima chiqdi:** mijoz-ekran mahsulotning O'Z videosini o'ynaydi
(`/media/videos/<productId>.mp4` konvensiyasi, DB'siz). nginx'ga `/media/`
location qo'shildi (zaxira: `/root/nginx-erp-backup-*.conf`, `nginx -t` +
reload, sayt uzilmadi). Egasining 39 videosidan **6 tasi aniq moslik bilan
ulandi** (STC-1000→01100 · XMK-010→03657 · TC seriyasi→02405 · XMTD-400→02070 ·
termoregulyator→04868 · Model:95→02165), md5 tasdiqlangan, Range=206.
Qolgan 33 tasi egasiga rasmli jadval bilan yuborildi.

## 🔴 HODISA — flip'ni rsh retry IKKI MARTA ishlatdi

`mv .next .next-old-serif && mv .next-new .next && pm2 restart` zanjiri birinchi
urinishda BAJARILDI, lekin ulanish keyinroq uzilib, `rsh.sh` ning retry sikli
butun zanjirni QAYTA ishlatdi: ikkinchi `mv .next .next-old-serif` mavjud
katalog ICHIGA ko'chirdi (`.next-old-serif/.next`) va `.next` yo'qoldi. Sayt
ochiq fayl-tutqichlar hisobiga tirik qoldi (200), lekin restart'da yiqilardi.

**Tiklash:** idempotent skript (`/root/fix-next.sh` — bor-yo'qlikni tekshirib
keyin ko'chiradi) bir urinishda tuzatdi; haqiqiy restart'dan keyin 3/3 sahifa
200, BUILD_ID `jviKbwqKmgThWuFMUz_Fh` (video-build).

**QOIDA bundan keyin:** serverdagi HAR QANDAY mutatsion amal (mv/rm/flip)
FAQAT idempotent skript-fayl orqali — `rsh.sh` retry'i takror ishlatsa ham
natija o'zgarmasin. To'g'ridan-to'g'ri zanjirli buyruq TAQIQ.

## Qaytarish

```bash
cd /var/www/sherset-v2/apps/web
mv .next .next-new && mv .next-old-serif .next && pm2 restart sherset-v2-web
```
