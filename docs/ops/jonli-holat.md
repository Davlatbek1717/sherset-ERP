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
  "split": "qisman",
  "posSessionStore": "Taqsimlanmagan",
  "allowUnreachableQty": "0",
  "stores": [
    { "name": "Taqsimlanmagan", "posPriority": 1, "brak": false, "unassignedSource": false, "posFront": false },
    { "name": "Ombor 01", "posPriority": null, "brak": false, "posFront": false },
    { "name": "Ombor 02", "posPriority": 2, "brak": false, "posFront": false },
    { "name": "Ombor 99", "posPriority": null, "brak": true, "posFront": false }
  ]
}
```

**Maydonlar:**

| Maydon | Ma'nosi |
|---|---|
| `split` | Yacheyka kodi prefiksi ↔ ombor mosligi: `bajarilgan` (hamma yacheyka o'z omborida), `qaytarilgan` (hammasi bitta omborda, prefiks mos emas), `qisman`, `yacheyka yoq` |
| `posSessionStore` | Kassir smenalari ochiladigan ombor NOMI. **U POS kaskadida bo'lishi SHART** (`posPriority` bor va BRAK emas) — aks holda undagi qoldiq sotilmay qoladi |
| `allowUnreachableQty` | Ruxsat etilgan «POS yeta olmaydigan qoldiq». Normal qiymat `"0"` |

> ⚠️ **`split` nega «qisman» (2026-08-27):** BRAK ombori («Ombor 99») yaratilgach
> uning **o'z** 27 yacheykasi (`99-…`) o'z omboriga MOS bo'ldi, haqiqiy omborlarning
> 974 yacheykasi esa hamon `Taqsimlanmagan` da (mos EMAS). Skript bu ikkisini
> ajratmaydi, shuning uchun umumiy holat «qaytarilgan» dan «qisman» ga o'tdi.
> **Haqiqiy split hamon QAYTARILGAN** — kutilayotgan kesim: `mos 27` (faqat BRAK),
> `mos emas 974`. Bu raqamlardan chetlanish — HAQIQIY o'zgarish belgisi.
> 🔜 **E5 uchun vazifa:** split holati hisobidan BRAK ombori CHIQARILSIN (u
> ta'rifi bo'yicha o'z yacheykalariga ega va split'ga aloqasi yo'q).
| `stores[].posPriority` | `Store.attributes.__posPriority`. `null` = kaskadda EMAS deb kutiladi |
| `stores[].brak` | `__brakStore` (G3). BRAK omboridagi qoldiq yetuvchanlik hisobiga KIRMAYDI; prioritet qo'yilgan bo'lsa ham kaskadga kirmaydi |
| `stores[].unassignedSource` | `__unassignedSource` (F7 hovuz belgisi) |
| `stores[].posFront` | `__posFrontStore` (G4, «Kassa oldidagi ombor» = 07). **Yetuvchanlikka ta'sir qilmaydi, TAQSIMOT tartibini belgilaydi:** yolg'iz qoplasa birinchi, bo'linishda ENG OXIRGI. Bayroq jimgina yo'qolsa 07 buyurtmalarda birinchi bo'lib bo'shab qoladi |

> 🔴 **E5 — yetuvchanlik modeli 2026-08-26 da QAYTA YOZILDI (G4-2a dan keyin).**
> Ilgari kassa FAQAT kaskadning BIRINCHI omboridan avtomatik ayirardi, qolganlari
> «bosh omborchi tasdig'i kerak» (`needs_approval`) edi va aynan o'sha to'siq
> 2026-08-24 06:46 da savdoni to'xtatdi. G4-2a (`b4c27d24`) tasdiq-to'sig'ini
> olib tashladi — endi POS prioriteti bor va BRAK bo'lmagan HAMMA omborga o'zi
> yetadi. Shuning uchun:
> - `needs_approval` bosqichi **BEKOR QILINDI**;
> - «POS yeta olmaydigan qoldiq» endi FAQAT `__posPriority` yo'q omborlardagi qoldiq;
> - «POS ombori kaskad BOSHI bo'lsin» sharti «kaskadda BO'LSIN» ga aylandi.
>
> Busiz `warehouse-state.ts` deploy'dan keyin yolg'on qizil berardi va qoida 13
> qo'riqchisi «bo'ri keldi» bo'lib qolardi (deploy dossieri, D1).

---

## 2. Kutilayotgan holat — izohlar bilan

**Oxirgi o'lchov: 2026-08-24** (hodisa rejasi 5-bo'limi + o'sha kungi jonli o'zgarishlar
jurnali). ⚠️ Quyidagi raqamlar shu sanadagi o'lchov; **ular reyestrning qismi EMAS**
(skript raqamlarni tekshirmaydi — u tuzilma va yetuvchanlikni tekshiradi), lekin
o'zgarganda shu yerga yoziladi.

| Store | id (qisqa) | Roli | Yacheyka | POS prioriteti | Qoldiq (dona) |
|---|---|---|---|---|---|
| **Taqsimlanmagan** | `968f9da2` | hisob-kitob hovuzi + AYNI PAYTDA kassa ombori | **974** | **1** (kaskad boshi) | ≈52,5 mln |
| Ombor 01 | `7400bf94` | fizik ombor (hozircha bo'sh) | 0 | yo'q | 0 |
| Ombor 02 | `01662dbe` | fizik ombor (hozircha bo'sh) | 0 | 2 | 0 |
| **Ombor 99** | `d4b4ff85` | **BRAK ombori** (vozvratdagi brak tovar) | **27** | yo'q (ataylab) | 0 |

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
- **BRAK ombori YARATILDI** (2026-08-27, «Ombor 99», `d4b4ff85`): `__brakStore = true`,
  `__posPriority` **yo'q** ⇒ POS kaskadiga kirmaydi va yetuvchanlik hisobiga ta'sir
  qilmaydi. 27 yacheyka (`99-01-01-01` … `99-01-03-09`), zonasiz. `warehouse-state.ts`
  uni «BRAK (ataylab yopiq)» deb tanidi.

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

🔴 **DIQQAT — skript hozircha FAQAT LOKALDA bor.** 2026-08-26 da o'lchandi:
jonli HEAD (`62a27024`) da na `scripts/warehouse-state.ts`, na shu reyestr
fayli mavjud — H2 fazasi hali deploy qilinmagan va u serverga birinchi
deploy bilan yetib boradi. Ya'ni **birinchi deploy'dan OLDIN uni jonlida
yugurtirib bo'lmaydi**; u deploy'dan KEYINGI smoke'da birinchi marta
yuriladi (dossier B5). Undan keyingi har bir ombor-deploy'ida — ikkala
tomonda ham.

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

🔴 **T1 — K-REJA DEPLOY QILINGANDAN KEYIN BU SKRIPT TO'XTATILADI.**
`stock_pieces` jadvali bo'sh bo'lmagan kundan boshlab skript bo'linadigan
tovarga tegmasligi shart: u `Stock.qty` ni kamaytiradi, bo'lak reyestriga esa
tegmaydi ⇒ «Σ tarkib === miqdor» sharti buziladi va K5 ning kiritish oqimi
(sanash / priyomka / vozvrat) **400** bera boshlaydi. Aynan shu bilan H4
(`warehouse-split.ts`) ham bloklanadi. To'liq talab:
`docs/plans/2026-08-24-split-kassa-hodisasi.md` → H4 → «T1» bandi.

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
| 2026-08-26 20:02–20:12 | **1-kecha deploy'i** `83027bc2 → 61780120` (37 commit, 6 migratsiya): G1–G6 + Q1–Q3 + H2 + H5 kodi. Ombor TUZILMASI o'zgarmadi | deploy operatori, qo'lda ff-merge | ✅ (tuzilma o'zgarmagani qayd etildi) |
| 2026-08-27 ~01:15 | **BRAK ombori yaratildi** — «Ombor 99» (`d4b4ff85`), `__brakStore=true`, POS prioriteti YO'Q, 27 yacheyka (`99-01-*`) | deploy operatori; ombor qatori — jonli `BEGIN…ROLLBACK` DRY, so'ng `COMMIT`; yacheykalar — `create-cells.ts --store "Ombor 99" --ombor 99 --stelaj 1:3x9` (DRY → `--apply --allow-remote`) | ✅ |
| 2026-08-27 ~01:20 | **`sklad_keepers` to'ldirildi** — sklad 1, 2, 3 → «Admin User» (`885fb467`, Administrator). Omborchi vazifasi vaqtincha unga yuklandi (jonlida ombor xodimi yo'q) | deploy operatori, jonli `BEGIN…ROLLBACK` DRY, so'ng `COMMIT` (`ON CONFLICT DO NOTHING`) | ✅ (ombor tuzilmasiga tegmaydi) |
| 2026-08-27 05:32–05:37 | **Ombor 03, 04, 05, 06, 07 yaratildi** (`__cellInventory=true`, `__posPriority` YO'Q, yacheykasiz, qoldiq 0) ⇒ jonlida 9 ombor | egasi, UI orqali | ❌ **YO'Q** — reyestrda hamon 4 ombor; `warehouse-state.ts` ularni `reyestrda-yoq` (ogohlantirish) deb ko'rsatadi. Reyestrga kiritish **M1** ning ishi (M1.3) |
| **2026-08-29 05:50–06:23** | 🔴 **2-kecha deploy'i KUNDUZI bajarildi** (egasi qarori — savdo ochiq, 5 ta smena ishlab turgan holda): `61780120 → cbc14723`, 14 commit, **1 migratsiya** `20260825220000_drawer_cash_in_kind` (additiv: `retail_drawer_cash_in.kind` + 2 indeks). Chiqdi: A1/A2/A3 avans oqimi + G1 tuzatishi + yacheykadan «Chiqarish». **Ombor TUZILMASI o'zgarmadi.** | Claude, SSH orqali; zaxira `/root/sherset_v2-pre-deploy-20260829.dump` (TOC: 259 `TABLE DATA`); build **`.next-new`** ichiga (jonli `.next` tegilmagan) → katalog almashtirish → `pm2 restart`; eski build **`.next-old`** da saqlanmoqda | ✅ (tuzilma o'zgarmagani qayd etildi) |
| **2026-08-29 20:25–21:31** | 🟢 **3-kecha deploy'i KECHKI OYNADA bajarildi** (savdo YO'Q): `cbc14723 → f612d804`, 38 commit, **5 migratsiya** (`stock_piece_registry`, `company_settings_sale_debt_term`, `stock_piece_cut`, `stock_piece_intake`, `piece_tracking_decision` — hammasi additiv). Chiqdi: **K1–K6** (bo'lak reyestri) + **Q4–Q6** + **E5** + qarz xabari tuzatishi. `topup-role-permissions.ts` yuritildi ⇒ `piecetracking` 26 qator. **Ombor TUZILMASI o'zgarmadi.** | Claude, Posh-SSH orqali; zaxira `/root/sherset_v2-pre-deploy-20260830.dump` (259 `TABLE DATA`); build `.next-new` ichiga → katalog almashtirish (`.next-old2`) → `pm2 restart` | ✅ **reyestrning O'ZI shu deploy bilan serverga yetib bordi** (JSON hamon 4 ombor — Ombor 03–07 M1 ning ishi) |

> **2026-08-29 deploy'ining o'lchangan izi** (qoida 8 + 13):
> `warehouse-state.ts` deploy'dan KEYIN — `EXIT=2`, **aynan 1 ta `xato`**
> (`split-holati`: kutilgan «qaytarilgan», jonlida «qisman») + **6 ta
> `ogohlantirish`** (`reyestrda-yoq`: Ombor 03–07 va 99). Bu kesim deploy'dan
> OLDIN skript kodidan hisoblab qo'yilgan edi va **aynan mos tushdi**.
> 🟢 **«POS yeta olmaydigan qoldiq» = 0.** Jami yacheyka 1089, ombor qoldiq
> 50 506 981,03, kaskad `1:Taqsimlanmagan → 2:Ombor 02`, POS smena ombori
> «Taqsimlanmagan» — **POS SOTADI**.
> Texnik verify: 9/9 sahifa 200 · API `06:22:48` da toza ko'tarildi · flip'dan
> keyin web xatolari **0** · haqiqiy kassir so'rovi `GET /api/v1/retail-sales`
> → **200** (136 ms, Electron desktop klient).
> 🔴 **Qoida 13 smoke'i HALI TO'LIQ EMAS** — yacheyka sanash, ko'chirish va
> A1–A3 avans oqimi jonlida sinalmagan ⇒ fazalar «QISMAN» bo'lib qoladi.

| **2026-08-30 ~00:1x** | 🟢 **B1 BAJARILDI — ombor rollari yaratildi**: «Katta omborchi» (`848479f8`, shablon `warehouse_manager`) va «Omborchi» (`10ce71bf`, shablon `storekeeper`) ⇒ jonlida endi **10 rol**. Assimetriya o'lchandi va TO'G'RI: `retailcontrol` / `returnacceptance` / `warehousenumbering` / `supply` — faqat KATTA omborchida; `storecell` — ikkalasida. `maskedByOverride` 0. | Claude, `ops-b1-ombor-rollari.ts --apply` (UI bosadigan `POST /roles` + `POST /roles/:id/apply-template` marshrutlari, SQL YO'Q) | — (ombor tuzilmasiga tegmaydi) |

> 🔴 **B2 NEGA HAMON OCHIQ — sabab TEXNIK EMAS, KADR (2026-08-30 o'lchovi).**
> Jonlida **13 xodim**, va admin bo'lmaganlarning HAMMASI kassir:
> `Kassir 8 · Administrator 2 · AccountOwner 1 · B2B/B2G 1 · PointOfSale 1`.
> Rejaning qattiq qoidasi — **kassirni omborchi QILMANG** (`markReady` da
> `assigneeId === userId` bo'lsa chek `ready` ga o'tmay QOTIB QOLADI, 1-kechada
> o'lchangan) ⇒ «Omborchi» rolini biriktiradigan odam UMUMAN YO'Q.
> **Keyingi qadam:** haqiqiy ombor xodimi uchun yangi xodim kartasi ochilsin,
> so'ng rol biriktirilsin. Undan oldin B3 zanjirlari ham sinalmaydi.

> **2026-08-30 (3-kecha) deploy'ining o'lchangan izi** (qoida 8 + 13):
> `warehouse-state.ts` deploy'dan KEYIN — **`EXIT=0`**, **0 ta `xato`**,
> **5 ta `ogohlantirish`** (`reyestrda-yoq`: Ombor 03, 04, 05, 06, 07).
> 🟢 Bu kesim ham deploy'dan OLDIN skript kodidan hisoblab qo'yilgan edi va
> **aynan mos tushdi**. `split-holati` xatosi YO'QOLDI — chunki reyestr faylining
> o'zi (`split: "qisman"` + «Ombor 99») shu deploy bilan serverga yetib bordi.
> 🟢 **«POS yeta olmaydigan qoldiq» = 0.** Jami yacheyka **1270** (2-kechada 1089
> edi — oradagi kunda 181 yangi yacheyka yaratilgan), ombor qoldiq
> 50 252 495,30, kaskad `1:Taqsimlanmagan → 2:Ombor 02`, split `mos 27 / mos
> emas 1243`.
> Texnik verify: **11/11 sahifa 200** — shundan `/omborchi/bolaklar` (K2) va
> `/omborchi/hal-qilinmagan` (K6) **YANGI** · pm2 ikkalasi `online`, sikl yo'q ·
> flip'dan keyin API va web jurnalida **yangi xato YO'Q** (bor xatolar 06:20 va
> undan oldingi, ya'ni deploy'dan avvalgi) · `BUILD_ID yF8gtOuG… → LpEjL2oe3…`.
> **Q6 jonli verify (DRY) BIRINCHI MARTA YURITILDI** — 6/6 band `OK`:
> Q1/A1/Q4 migratsiyalari bazada, A2/A3 maydonlari API javobida, undirish
> reyestrida **105 ta kassa cheki qatori** (Q5 backfill'idan 0 — u hali
> yuritilmagan).
> 🔴 **Qoida 13 smoke'i HALI BAJARILMAGAN** — yacheyka sanash/ko'chirish, avans
> oqimi va K-oqimi (bayroq → rulon → kesim) egasining UI ishi ⇒ fazalar
> «QISMAN» bo'lib qoladi.

> 🔴 **2026-08-30 da o'lchangan — ESKI DA'VO YIQILDI: `restock_tasks` endi 0 EMAS.**
> Hujjatlarda (1-kecha va 2026-08-29 kecha rejasining B3 bandi) «`restock_tasks`
> jonlida 0 qator — G2 zanjiri hech qachon yurmagan» deb yozilgan edi. Bugungi
> o'lchov: **18 topshiriq / 58 qator** — `2026-08-27` da 5, `08-28` da 1,
> `08-29` da 12. Holati: **9 `done` + 9 `cancelled`**, `new`/`in_progress`
> **0 ta** ⇒ **qotib qolgan topshiriq YO'Q**.
> Hammasi bitta bajaruvchiga biriktirilgan — `885fb467…` («Admin User»), ya'ni
> `sklad_keepers` dagi vaqtinchalik yechim ishlayapti.
> ⚠️ **Lekin bu Blok B ni YOPMAYDI:** jonlida hamon **8 rol** va ularning
> ichida `warehouse_manager` ham, `storekeeper` ham YO'Q (`employee_roles`:
> Kassir 8, Administrator 2, AccountOwner 1, B2B/B2G 1, PointOfSale 1, qolgani
> 0). Ya'ni yig'ish oqimi ADMIN huquqi bilan yuryapti va «oddiy omborchida
> `/omborchi/kontrol` → 403» assimetriyasi hamon sinalmagan.

> Yangi qator qo'shganda: sana, nima, kim/nima bilan, va reyestr (1-bo'lim JSON +
> 2-bo'lim jadval) yangilanganini belgilang.

> 🔴 **Kutilayotgan, lekin HALI BO'LMAGAN o'zgarish:** Q5 kassa-qarzi
> backfill'i (3.2-bo'lim). Yugurtirilgan kuni shu jadvalga qator qo'shiladi:
> «`RUN=<sana>-NN` · N qator / X so'm reyestrga · `ops-q5-backfill-sale-debts.ts`
> · balans va yacheyka reyestri TEGILMAGAN». Ombor tuzilmasiga tegmagani uchun
> 1-bo'lim JSON'i va 2-bo'lim jadvali O'ZGARMAYDI — buni ham qatorda ayting.
