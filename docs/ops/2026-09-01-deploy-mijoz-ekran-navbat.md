# 2026-09-01 (kecha) — mijoz-ekran: navbat + yangi dizayn (`04d5410c`)

**Nima chiqdi:** kassa orqasidagi mijoz-ekranga buyurtmalar navbati
(yig'ilyapti / tayyor) va egasining maketi bo'yicha yangi dizayn. Yo'l-yo'lakay
ikki nosozlik tuzatildi (rasm ruxsati, `apps/api` typecheck heap). Migratsiya
YO'Q — DB sxemasi umuman o'zgarmagan.

**Nega shu kecha:** egasi ekranni HDMI orqali ulab, ishlashini tasdiqladi va
deploy so'radi. Server vaqti 23:27 CEST = **02:27 UZT**, savdo yopiq
(oxirgi chek ~2 soat oldin).

---

## Deploy yo'li

```
lokal commit 04d5410c  (pre-push: typecheck 10/10 · guards OK · lint 0)
  → git push origin climart-adoption      6533f173..04d5410c
  → serverda git fetch + merge --ff-only  bb6d2edb → 04d5410c
  → kesh ko'chirildi (.next/cache → .next-new/cache, 1.4G — issiq build)
  → pnpm --filter @moysklad/money build
  → setsid nohup NEXT_DISTDIR=.next-new NODE_OPTIONS=--max-old-space-size=3072
      corepack pnpm build:web   > /root/deploy-navbat.log
  → FLIP: mv .next .next-old-navbat && mv .next-new .next
  → pm2 restart sherset-v2-web · pm2 restart sherset-v2-api --update-env
```

🔴 **117 commit GitHub'ga chiqdi** — origin 2026-08-23 dan beri `6533f173` da
qotib qolgan edi. Sabab o'lchandi: `pre-push` → `apps/api` typecheck standart
~2 GB heap'da OOM (`exit 134`), ya'ni push **texnik jihatdan mumkin emas edi**.
Shu commit'da heap 4096 MB ga ko'tarildi va darvoza ochildi.

---

## ⚠️ Sentinel buzildi — tugash belgisi BOSHQACHA olindi

30-avgust sabog'i bo'yicha build `…; echo "BUILD_TUGADI rc=$?"` sentineli bilan
yugurtirilishi kerak edi. Lekin buyruq `plink` orqali uzatilganda escaping
`$?` ni yeb qo'ydi — jurnalga **`BUILD_TUGADI rc=\0`** yozildi, ya'ni exit-kod
YO'Q.

Uning o'rniga **artefakt butunligi** tekshirildi (bu kuchliroq: 30-avgustda
sayt aynan yetishmagan manifestdan qulagan edi):

| Tekshiruv | Natija |
|---|---|
| `BUILD_ID` | ✅ `gvSJpuUSluX328IB_u0oB` |
| `prerender-manifest.json` | ✅ (30-avgustda AYNAN shu yo'q edi) |
| `routes-manifest.json` · `build-manifest.json` | ✅ |
| `app-build-manifest.json` · `required-server-files.json` | ✅ |
| Jurnalda `Error` / `Failed to compile` / `ELIFECYCLE` | **0** |
| `.next-new` ichida navbat matnlari | ✅ `chunks/1099.js`, `5153.js` |

**Keyingi safar:** sentinelni bir qatorli skriptga yozib, keyin uni ishga
tushirish kerak (`plink` escaping'iga tayanmaslik). Yoki artefakt-tekshiruvni
standart qilish — u baribir ishonchliroq.

---

## Verify (23:47 CEST / 02:47 UZT)

| Tekshiruv | Natija |
|---|---|
| `/login` `/sotuv` `/customer-display` `/omborchi` `/counterparties` | **200 (5/5)** |
| `api/v1/health` | **200** (tashqi + lokal 4001) |
| pm2 `sherset-v2-web` / `sherset-v2-api` | ikkalasi `online`, 5 daq barqaror |
| Jonli sahifada yangi markerlar | ✅ `cfd-theme`, `BUYURTMALAR NAVBATI`, `SIZNING XARIDINGIZ` |
| Ruxsat tuzatmasi jonlida | ✅ `entity: 'product', action: 'view'` × 2 |

**Restartdan keyin 502:** `api/v1/health` restartdan 14 s keyin 502 qaytardi —
API `tsx` bilan ko'tarilayotgan edi. 1 daqiqadan keyin 200. **Nosozlik emas**,
lekin smoke'ni restartdan darhol keyin yugurtirmaslik kerak.

**API jurnalidagi `Error: TIMEOUT`** — Telegram klientining `_updateLoop` i.
**Deploydan EMAS:** o'sha xato `api.err.log` da **2026-08-21 dan beri 43 937
marta** yozilgan. Alohida muammo sifatida qoladi (bu deploy uni na tuzatdi,
na yomonlashtirdi).

---

## Qaytarish nuqtasi

```bash
cd /var/www/sherset-v2/apps/web
mv .next .next-new && mv .next-old-navbat .next && pm2 restart sherset-v2-web
# kod uchun qo'shimcha:
cd /var/www/sherset-v2 && git reset --hard bb6d2edb && pm2 restart sherset-v2-api
```

Soniyalarda qaytadi, build talab qilmaydi.

---

## 🔴 QOLGAN QARZ — disk

```
disk: 89% band, 12 GB bo'sh   (deploydan oldin 87% / 14 GB)
.next-old*  →  6 katalog, 10.1 GB
```

Eski buildlar **o'chirilmadi** — ular egasining ruxsatisiz o'chirilmaydi
(reja `T2`). Har deploy ~1.7 GB qo'shadi, ya'ni yana 5–6 deploy'dan keyin disk
to'ladi. Video fazasi (E3–E5) esa yana ~3 GB talab qiladi.

**Tavsiya (egasi tasdiqlasa):** eng oxirgi ikkitasidan boshqasini o'chirish —
`.next-old-navbat` (bugungi qaytarish nuqtasi) va `.next-old-tolov2`
(31-avgustniki) QOLADI:

```bash
cd /var/www/sherset-v2/apps/web
rm -rf .next-old .next-old2 .next-old3 .next-old31aug     # ~6.9 GB bo'shaydi
```

---

## Status

**Phase-1.** Darvozalar yashil, jonli smoke 5/5 sahifa 200.
**Jonli qurilmada (televizor + kassir) HALI SINALMAGAN** — egasi ertaga
kassirning hisobi bilan tekshiradi. Ayniqsa: navbat kartalari real
`picking`/`ready` cheklarda to'g'ri chiqishi.

**Bu deployda YO'Q:** to'lov/qaytim ekrani (egasi «kerak emas» dedi), video,
optom narx — reja `docs/plans/2026-08-31-ikkinchi-ekran.md` E3–E6.
