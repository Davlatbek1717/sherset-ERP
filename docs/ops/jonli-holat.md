# Jonli holat reyestri — ombor / qoldiq / kassa

> **Nima uchun bu fayl bor.** Kod git'da versiyalanadi, jonli MA'LUMOT holati esa —
> qaysi ombor bor, POS prioriteti kimda, yacheykalar qaysi omborda — hech qayerda
> yozilmagan edi. Shu sabab 2026-08-23 dagi ombor-split tovarni kassa yeta olmaydigan
> omborga ko'chirganini **ertasi kuni, odam aytgani uchun** bildik (hodisa tahlili:
> `docs/plans/2026-08-24-split-kassa-hodisasi.md`, ildiz sabab IS-7).
>
> **Bu fayl — KUTILAYOTGAN holat.** Jonli haqiqat bilan solishtirish:
> `packages/db/scripts/warehouse-state.ts` (faqat o'qish; farq bo'lsa chiqish kodi 2).
>
> **Qoida 14 (F-reja 2-bo'lim):** jonli holatga qo'lda yoki skript bilan har tegilganda
> shu fayl O'SHA KUNI yangilanadi — quyidagi jadval, JSON bloki VA «O'zgarishlar
> jurnali» qatori.

---

## 1. Mashina o'qiydigan reyestr

`warehouse-state.ts` aynan shu blokni o'qiydi. Odam o'qiydigan izohlar 2-bo'limda —
ikkalasi bir faylda turishi ataylab: alohida `.json` va `.md` bir-biridan ajralib
ketardi va bu aynan IS-7 muammosini qaytarardi.

```json
{
  "split": "qaytarilgan",
  "posSessionStore": "Taqsimlanmagan",
  "allowUnreachableQty": "0",
  "stores": [
    { "name": "Taqsimlanmagan", "posPriority": 1, "brak": false, "unassignedSource": false },
    { "name": "Ombor 01", "posPriority": null, "brak": false },
    { "name": "Ombor 02", "posPriority": 2, "brak": false }
  ]
}
```

**Maydonlar:**

| Maydon | Ma'nosi |
|---|---|
| `split` | Yacheyka kodi prefiksi ↔ ombor mosligi: `bajarilgan` (hamma yacheyka o'z omborida), `qaytarilgan` (hammasi bitta omborda, prefiks mos emas), `qisman`, `yacheyka yoq` |
| `posSessionStore` | Kassir smenalari ochiladigan ombor NOMI. **U kaskadning BIRINCHI ombori bo'lishi SHART** — aks holda 06:46 hodisasi qaytadi |
| `allowUnreachableQty` | Ruxsat etilgan «POS yeta olmaydigan qoldiq». Normal qiymat `"0"` |
| `stores[].posPriority` | `Store.attributes.__posPriority`. `null` = kaskadda EMAS deb kutiladi |
| `stores[].brak` | `__brakStore` (G3). BRAK omboridagi qoldiq yetuvchanlik hisobiga KIRMAYDI |
| `stores[].unassignedSource` | `__unassignedSource` (F7 hovuz belgisi) |

---

## 2. Kutilayotgan holat — izohlar bilan

**Oxirgi o'lchov: 2026-08-24** (hodisa rejasi 5-bo'limi + o'sha kungi jonli o'zgarishlar
jurnali). ⚠️ Quyidagi raqamlar shu sanadagi o'lchov; **ular reyestrning qismi EMAS**
(skript raqamlarni tekshirmaydi — u tuzilma va yetuvchanlikni tekshiradi), lekin
o'zgarganda shu yerga yoziladi.

| Store | id (qisqa) | Roli | Yacheyka | POS prioriteti | Qoldiq (dona) |
|---|---|---|---|---|---|
| **Taqsimlanmagan** | `968f9da2` | hisob-kitob hovuzi + AYNI PAYTDA kassa ombori | **900** | **1** (kaskad boshi) | ≈52,5 mln |
| Ombor 01 | `7400bf94` | fizik ombor (hozircha bo'sh) | 0 | yo'q | 0 |
| Ombor 02 | `01662dbe` | fizik ombor (hozircha bo'sh) | 0 | 2 | 0 |

**Nega hozir shunday (vaqtinchalik holat):**

- **Split QAYTARILGAN.** 2026-08-23 da bajarilgan split kassani 46 daqiqa to'xtatgan
  va 2026-08-24 06:46 da qaytarilgan. Maqsad-arxitektura (har fizik ombor alohida
  `Store`) o'z kuchida — unga qaytish **H4** fazasida, S1 savoliga javob olingach.
- **Hamma yacheyka bitta omborda** (`Taqsimlanmagan`). Sabab: kassa faqat kaskadning
  BIRINCHI omboridan avtomatik ayiradi; boshqa omborga tushgan tovar sotilmay qoladi
  (G4 tasdiq oqimi hali qurilmagan). Yacheykalarni bo'lish — H4 ning ishi.
- **`Ombor 02` da `posPriority = 2` qolgan** — bu **R1 xavfi** (hodisa rejasi
  5-bo'lim). Hozir zararsiz (ombor bo'sh), lekin u yerga tovar tushsa POS yeta
  olmaydi. **H6/1-band uni olib tashlaydi.** Olib tashlangach yuqoridagi JSON'da
  `"posPriority": null` bo'ladi.
- **`Ombor 01` da prioritet yo'q** — **R4 xavfi**, o'sha sabab bilan (bo'sh, shuning
  uchun hozir zararsiz).
- **`__unassignedSource` hech qayerda yoqilmagan** — F7 hovuz belgisi hali
  ishlatilmayapti; `Taqsimlanmagan` amalda hovuz VAZIFASINI bajaradi, lekin belgisi
  yo'q. H4 da aniqlashtiriladi.
- **BRAK ombori hali YARATILMAGAN** (G3 deploy'i kutilmoqda). Yaratilgach reyestrga
  `{ "name": "…", "brak": true, "posPriority": null }` qatori qo'shiladi — aks holda
  birinchi brak qabulidan keyin har deploy «yetib bo'lmaydigan qoldiq» deb bloklanadi
  (G3 hisobotidagi ogohlantirish).

---

## 3. Tekshirish

```bash
# packages/db ichidan (faqat O'QISH — savdo ustida ham xavfsiz)
npx tsx scripts/warehouse-state.ts               # jadval + reyestr farqi
npx tsx scripts/warehouse-state.ts --json        # mashina uchun
npx tsx scripts/warehouse-state.ts --no-registry # faqat o'lchov
```

Chiqish kodi: `0` = mos, `2` = farq bor (`xato` darajali drift).
`ogohlantirish` darajali driftlar kodni o'zgartirmaydi.

**Qachon yugurtiriladi:**

1. ombor / qoldiq / kassaga tegadigan **har deploy'dan keyin** — natijasi faza
   hisobotiga kiritiladi (F-reja qoida 13);
2. jonli ma'lumot o'zgartiradigan skriptdan **oldin va keyin**;
3. H4 (split qayta yuritilishi) da — **oldin, keyin va ertasi ertalab**.

---

## 3.1. Kechalik tozalash tartibi (H5 — soxta «mashq» qoldig'i)

Sanash davom etayotgan davrda har kuni, **savdo tugagach**:

    cd packages/db
    npx tsx scripts/stock-baseline-cleanup.ts --since <bugungi sana>      # DRY-RUN
    npx tsx scripts/stock-baseline-cleanup.ts --since <sana> --apply --allow-remote

Chiqishdagi **qaytarish buyrug'ini saqlang** (bitta `docId`). Ertasi ertalab,
savdo boshlanishidan OLDIN: `warehouse-state.ts` + bitta sinov sotuv
(post → tekshir → cancel). Nosozlikda — `--revert <docId> --apply --allow-remote`.

🔴 **Kunduzi YUGURTIRMANG:** skript ombor jamisini kamaytiradi, ya'ni kassani
to'xtatib qo'yishi mumkin (qoida 13). Default imzo-oralig'i 9 000–11 000 — faqat
soxta sonlarni oladi, haqiqiy qoldiqqa tegmaydi. Batafsil: H5 hisoboti.

## 3.2. Kassa qarzi backfill'i (Q5) — 🔴 HALI YUGURTIRILMAGAN

> **Nega bu yerda tursa-yu, jurnalda qator yo'q.** Qoida 14 jonli holatga
> TEGILGANDA jurnalga qator yozishni talab qiladi. Q5 backfill'i jonlida
> **yugurtirilmagan** (kod tayyor, deploy 2026-08-25 da egasi tomonidan rad
> etilgan, so'ng «jonliga tegma» qarori), ya'ni jurnalga yozadigan hodisa
> hali YO'Q — soxta qator yozilmaydi. Bu bo'lim esa yugurtirish kuni
> nimani qayd etish kerakligini OLDINDAN belgilaydi, aks holda o'sha kuni
> shoshilinch ishda qayd tushib qolardi (IS-7 naqshi).

**Nima qiladi:** Q2 dan OLDIN post qilingan kassa cheklarining balans-qarzlarini
`Debt` reyestriga olib kiradi (`balanceAdopted = true`, `sourceDocType =
'retailsale'`), ya'ni ular undirish ro'yxatida ko'rinadi. **Balansga va
kassaga TEGMAYDI** — `applyDelta` umuman chaqirilmaydi.

**Oldindan shart (tartib MAJBURIY):** `20260825120000_debt_source_doc`
migratsiyasi berilgan bo'lishi kerak. Skript buni O'ZI tekshiradi
(`preflight()`) va ustunsiz bazada tushunarli xato bilan to'xtaydi.

**Skriptlar** (`apps/api`, box'da qo'lda; DRY-RUN default):

    ./node_modules/.bin/tsx src/scripts/ops-q5-backfill-sale-debts.ts              # o'lchash
    APPLY=1 ONLY_CP=<uuid> RUN=<sana>-01 ./node_modules/.bin/tsx src/scripts/ops-q5-backfill-sale-debts.ts
    RUN=<sana>-01 ./node_modules/.bin/tsx src/scripts/ops-q5-backfill-rollback.ts  # teskarisi

**Yugurtirish kuni yoziladigan iz (har bosqichdan keyin):**

| Maydon | Qayerdan |
|---|---|
| `RUN` yorlig'i | skript argumenti (`RUN=<sana>-NN`) — rollback AYNAN shu bo'yicha ishlaydi |
| qator soni / summa | skript chiqishi (`OCHILADIGAN QATOR` / `OCHILADIGAN JAMI SUMMA`) |
| kontragent soni | o'sha chiqish |
| kim yugurtirgan, qachon | qo'lda — ish soatidan TASHQARIDA (qoida 13) |
| `warehouse-state.ts` oldin/keyin | qoida 8 — ikkalasi ham faza hisobotiga |
| uchma-uch smoke | qoida 13 — sinov sotuv (post→tekshir→cancel), yacheyka sanash, ko'chirish |

**Yakuniy o'lchov:** `apps/api/src/scripts/ops-q6-live-verify.ts` (DRY default —
«jonlida qaysi faza bor» qamrov jadvali; `--live` esa besh invariantni sinov
cheki bilan isbotlaydi va izini O'ZI tozalaydi).

🔴 **Kutilgan yon ta'sir — nosozlik EMAS:** undirish ro'yxati va menejer
navbati HAJMI keskin o'sadi (lokal o'lchov: 579 → 812 qator). Bu **yangi qarz
emas, ko'rinmagan qarz endi ko'rinmoqda**. Eslatma cron'i 14 kun JIM turadi,
so'ng zinapoya bo'yicha kuniga ~50 qatordan ochiladi.

Reja va to'liq retsept: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md`
(Q5 hisoboti — «Jonli yugurish retsepti»).

---

## 4. O'zgarishlar jurnali (qoida 14)

| Sana | Nima o'zgardi | Kim / nima bilan | Reyestr yangilandimi |
|---|---|---|---|
| 2026-08-23 15:58 | Split bajarildi: 291 yacheyka + 2,95 mln dona → «Ombor 02» | F5 sessiyasi, `warehouse-split.ts` | — (reyestr hali yo'q edi) |
| 2026-08-24 06:46 | Split QAYTARILDI (kassa to'xtagani uchun) | shoshilinch, `warehouse-split-revert.ts` | — |
| 2026-08-24 (ertalab) | `Taqsimlanmagan.__posPriority = 1` | F6 sessiyasi, qo'lda UPDATE | — |
| 2026-08-24 ~21:00 | 119 ta `01-04-…` yacheyka «Ombor 01» → «Taqsimlanmagan»; 490 yangi yacheyka yaratildi (410 → 900) | parallel sessiya, `create-cells.ts` + `warehouse-split-revert.ts` | — |
| 2026-08-24 (H2) | **Shu reyestr yaratildi** — yuqoridagi holat kodga tushirildi | H2 sessiyasi | ✅ |

> Yangi qator qo'shganda: sana, nima, kim/nima bilan, va reyestr (1-bo'lim JSON +
> 2-bo'lim jadval) yangilanganini belgilang.

> 🔴 **Kutilayotgan, lekin HALI BO'LMAGAN o'zgarish:** Q5 kassa-qarzi
> backfill'i (3.2-bo'lim). Yugurtirilgan kuni shu jadvalga qator qo'shiladi:
> «`RUN=<sana>-NN` · N qator / X so'm reyestrga · `ops-q5-backfill-sale-debts.ts`
> · balans va yacheyka reyestri TEGILMAGAN». Ombor tuzilmasiga tegmagani uchun
> 1-bo'lim JSON'i va 2-bo'lim jadvali O'ZGARMAYDI — buni ham qatorda ayting.
