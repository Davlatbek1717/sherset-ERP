# 2026-09-01 — tannarx «***» deployi (`d029d952`)

**Nima chiqdi:** kassaning qator tahrir oynasida optom yozuvi oldida
«Tannarx: ***» — raqam sukutda yopiq, yulduzcha bosilganda ochiladi (mijoz
ko'zi himoyasi saqlanadi). Dollarda kelgan tovarda «$… ≈ …сум» — joriy kurs
bilan (`toBaseMinor`, sotuv narxlari bilan bir xil formula); kursi noma'lum
bo'lsa «—». Migratsiya YO'Q (DB sxemasi o'zgarmagan — `buy_price_currency`
ustuni azaldan bor, faqat kontrakt/select/UI ochildi).

**Deploy yo'li:** lokal commit `9a70312a` → serverda parallel dev commiti
`04d5410c` (mijoz-ekran navbati, rossotv0626-spec) topildi → fetch + rebase
(`d029d952`, konflikt faqat `docs/progress.json` — hook fayli) → push
`deploy-20260901-tannarx` (pre-push darvozalari yashil) → `git merge
--ff-only` (`04d5410c` → `d029d952`) → `NEXT_DISTDIR=.next-new` build
detached, **flip faqat `BUILD_TUGADI rc=0` dan keyin** (08-31 sabog'i) →
`pm2 restart sherset-v2-web sherset-v2-api`.

**Verify:** erp.sherset.uz orqali /login /sotuv /omborchi /counterparties
/money /api/v1/health — barchasi 200; «Tannarx» jonli bundle chunk'ida
(`5052-*.js`); api xato-logida restartdan keyin yangi yozuv yo'q (faqat eski
telegram TIMEOUT shovqini). ⚠️ localhost smoke ALDAYDI: 3100 da faqat /login
200, qolganlari 404 — to'g'ri tekshiruv domen orqali.

**Qaytarish nuqtasi:** `apps/web/.next-old-tannarx` (04d5410c-navbat build) —
flip bilan soniyalarda; kod uchun `git reset --hard 04d5410c` + o'sha flip.
Disk 89% (12G bo'sh), 6 ta `.next-old*` katalog — tozalash egasining ruxsati
bilan.

**Chegara (kelajak ishi):** chek `post()` da muzlatiladigan `costMinor` hamon
xom `buyPrice` (server tomonda kurs qo'llanmaydi) — dollar-tovar hisobot
foydasi uchun multi-currency freeze alohida ish.
