# 2026-08-31 (kech) — to'lov oynalari deployi (`f9bd15c6`)

**Nima chiqdi:** egasining kunduzgi so'rovi — sotuv va qarz-to'lov oynalarining
birlashtirilishi. Sotuvga «Hisob raqamidan» (ACCOUNT) tenderi, POS qarz
to'loviga `card`/`account` usullari, qarz-oyna sotuv uslubidagi ikki ustunli
dizaynda. Migratsiya YO'Q (DB sxemasi o'zgarmagan — `method` matn ustuni,
`RetailSalePayment.method` ga yangi qiymat qo'shildi xolos).

**Deploy yo'li:** lokal commit `f9bd15c6` (branch `yacheyka-inventarizatsiya`,
pre-push lint darvozasi 0 xato) → push `deploy-20260831-tolov` → serverda
`git merge --ff-only` (`ec56dd1f` → `f9bd15c6`) → `NEXT_DISTDIR=.next-new`
build → katalog flip → `pm2 restart sherset-v2-web sherset-v2-api`.
API build talab qilmaydi — pm2 `src/main.ts` ni to'g'ridan-to'g'ri yuritadi.

**⚠️ Hodisa (o'lchandi, saboq):** birinchi flip ERTA qilindi —
`«✓ Compiled successfully»` va **`BUILD_ID` fayli build TUGAGANINI
BILDIRMAYDI** (prerender/export bosqichi hali yuradi; eski «BUILD_ID = tugash
belgisi» qaydi NOTO'G'RI edi). Natija: web ~4 daqiqa crash-loop
(`prerender-manifest.json` yo'q, sahifalar 502; savdo yopiq payt edi). Darhol
eski `.next` qaytarildi (sayt tiklandi), build boshidan
`…build; echo BUILD_TUGADI rc=$?` sentineli bilan yugurtirildi va flip faqat
`rc=0` dan keyin qilindi. **Bundan keyin tugash belgisi — faqat jarayonning
o'z exit-kodi.**

**Verify (21:05 UZT atrofida):** /login /sotuv /omborchi /counterparties
/money — 200; `api/v1/health` 200; pm2 ikkala jarayon barqaror; api xato-logida
restartdan keyin yangi yozuv yo'q; jonli bundle'da «Hisob raqamidan» va
`pos-tender-account` bor.

**Qaytarish nuqtasi:** `apps/web/.next-old-tolov2` (vitrina-build) — flip bilan
soniyalarda qaytadi; kod uchun `git reset --hard ec56dd1f` + o'sha flip.
Eski `.next-old*` kataloglari (5 dona) diskda turibdi — disk 86%, tozalash
egasining ruxsati bilan.
