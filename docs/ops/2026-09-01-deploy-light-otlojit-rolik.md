# 2026-09-01 (tong, 3-deploy) — light mode · «otlojit» navbatda · brend-rolik (`2a68c3a5`)

**Nima chiqdi:** egasining jonli sinovdan keyingi uch talabi — oq fon,
«otlojit» qilingan savatlarning navbatda ko'rinishi, videosi yo'q mahsulotda
SHERSET brend-roligi. Qo'shimcha: DEMO belgisi. Migratsiya YO'Q, API tegilmadi.

## «Otlojit» nega ko'rinmasdi — ikki sabab

1. Qoralama serverga UMUMAN bormaydi (POS `parkCart` → localStorage). Yechim:
   mijoz-oyna `sherset.pos.drafts` ni to'g'ridan-to'g'ri o'qiydi (Electron
   oynasi kassir bilan bir partition — localStorage umumiy). Yangi .exe SHART
   EMAS. `storage` hodisasi + davriy o'qish.
2. Egasi televizorda `?demo=1` ochiq qolgan — u faqat soxta ma'lumot
   ko'rsatadi. Endi DEMO belgisi bor; real sinov demo'siz sahifada.

## Deploy

```
2a68c3a5 push → server ff-merge → SOVUQ build (kesh ko'chirilmadi — oldingi
saboq) → rc=0, manifestlar OK → flip (.next → .next-old-tannarx2) →
pm2 restart sherset-v2-web
```

Verify: /login /sotuv /customer-display 200 · api health 200 ·
`/brand/sherset-loop.mp4` **200** · jonli skrinshot: oq fon, hold-karta
(05:30 Ожидает), rolik o'ynayapti, DEMO belgisi.

Gidratatsiya nomuvofiqligi (DemoBadge SSR'da yo'q edi) konsolda ushlanib,
`scale !== null` sharti bilan yopildi — deploy'dan OLDIN.

## 🔴 DISK TOZALANDI (egasining ruxsati bilan)

90% → **83% (17 GB bo'sh)**. O'chirildi — FAQAT eski build kataloglari, har
biri avval `BUILD_ID` bilan Next-build ekani tasdiqlab, to'liq yo'l bilan
alohida: `.next-old` `.next-old2` `.next-old3` `.next-old31aug`
`.next-old-tolov2` `.next-old-navbat` (~10 GB). QOLDI: `.next-old-cfdfix`,
`.next-old-tannarx`, `.next-old-tannarx2` (uch qaytarish nuqtasi).
Boshqa HECH NARSAGA tegilmadi.

## Qaytarish

```bash
cd /var/www/sherset-v2/apps/web
mv .next .next-new && mv .next-old-tannarx2 .next && pm2 restart sherset-v2-web
```

## Status

Phase-1 · darvozalar yashil (typecheck 10/10 · lint 0 · guards OK · 101 unit +
7 e2e) · jonli smoke OK · **real kassir oqimida hali sinalmagan** — egasi
demo'siz sahifada «otlojit» va «omborchiga yuborish» ni tekshiradi.
