# Qabul tasdiqlash — magic-link (parolsiz) dizayn (Faza E)

**Sana:** 2026-07-30
**Holat:** Dizayn (egasi 2026-07-30 tasdiqladi). Qurish — alohida fokus-sessiya (xavfsizlik-sezgir).
**Egasi so'rovi (aynan):** «taminotchiga, omborchiga link boradi, o'sha linkka kirib belgilashadi (tasdiqlash yoki rad
etish); omborchi va admin mahsulot/narx CRUD amallarini bajara oladi; taminotchiga borgan link bilan u saytga login-parolsiz
kiradi, lekin qaysi taminotchi ekani bilinib turadi. Chuqur o'ylab professional qilib.»

## Nega magic-link (bot emas)
Egasi qarori: xabarlar adminning SHAXSIY Telegram akkauntidan (MTProto/userbot) boradi — **bot yo'q**. Telegram qoidasi:
inline-tugma FAQAT botда bo'ladi, shaxsiy akkaunt xabariga tugma qo'yib bo'lmaydi. Demak tasdiq **HAVOLA** orqali: xabarда
link → bosadi → veb-sahifada «Tasdiqlash/Rad» qiladi. Taminotchi (tashqi) uchun — **parolsiz magic-link**; omborchi/admin
(ichki) uchun — oddiy ERP kirishi (to'liq CRUD).

## Rollar va oqim

| Rol | Havola qayerga | Kirish | Amal |
|---|---|---|---|
| **Taminotchi** (tashqi) | `/p/qabul/<token>` (public, auth-siz) | **parolsiz** — token o'zi identifikatsiya (qaysi qabul + qaysi taminotchi) | qabulни ko'radi (tovar ro'yxati, jami) → «Tasdiqlash» / «Rad etish» (sabab) |
| **Omborchi** (ichki) | ERP `/supplies/<id>` (yoki `/p/qabul/<token>` → ERP login) | oddiy login (to'liq huquq) | sonini tekshiradi/tuzatadi (CRUD) → «Qabul qilindi — tasdiqlash» / «Rad» |
| **Admin** (ichki) | ERP `/supplies/<id>` | oddiy login | «Yakuniy tasdiq → omborga» (stock) |

**Zanjir:** admin qabulни yaratadi → «yuborish» → taminotchi **lichkasiga** havolali xabar (userbot) → taminotchi linkда
tasdiqlaydi → omborchi **lichkasiga** havolali xabar → omborchi ERP'да tasdiqlaydi → admin ERP'да yakuniy tasdiq → stock.

## Arxitektura (grounded — mavjud infra)

### 1. Capability-token (magic-link) — mavjud pattern
`counterparty-statement.service.ts:299` — `randomBytes(24).toString('hex')` token + DB-qatorda saqlash + public link
(`${STATEMENT_BASE_URL}/akt/<token>`). SHU pattern qayta ishlatiladi, LEKIN veb-sahifa uchun (fayl emas).

### 2. Data model — yangi token jadval (migration)
```prisma
model SupplyApprovalLink {
  id         String    @id @default(uuid()) @db.Uuid
  accountId  String    @map("account_id") @db.Uuid
  supplyId   String    @map("supply_id") @db.Uuid
  token      String    @unique @db.VarChar(64)   // randomBytes(24).hex — taxmin qilib bo'lmaydi
  role       String    @db.VarChar(20)           // 'supplier' (hozir faqat tashqi taminotchi uchun)
  agentId    String?   @map("agent_id") @db.Uuid // qaysi taminotchi (identifikatsiya)
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz()  // masalan 14 kun
  usedAt     DateTime? @map("used_at") @db.Timestamptz()     // tasdiq/rad qilingach — audit; qayta-kirishni bloklamaydi
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  supply Supply @relation(fields: [supplyId], references: [id], onDelete: Cascade)
  @@index([accountId, supplyId])
  @@map("supply_approval_links")
}
```
Token — supply + role + agent ga bog'langan, MUDDATLI. Bir supplyга bir supplier-token (qayta-yuborishда yangilanadi).

### 3. Public API (token-auth, login-siz)
`@Controller()` public (mavjud counterparty-statement.controller kabi guardsiz). Yangi endpointlar:
- `GET /p/qabul/:token` — token→link→supply topadi (muddat/tenant tekshirib) → qabul ko'rinishini qaytaradi (tovar ro'yxati,
  jami, taminotchi nomi, bosqich). Muddati o'tган/yaroqsiz → 410/404.
- `POST /p/qabul/:token/confirm` — `applySupplierDecision(accountId, supplyId, true)` (mavjud).
- `POST /p/qabul/:token/reject` — `reject(...,'supplier')` + sabab (mavjud).
Token ichida accountId+supplyId+agentId bor ⇒ login shart emas; server token'дан hammasini biladi.

### 4. Public veb-sahifa (auth-siz)
`apps/web/src/app/p/qabul/[token]/page.tsx` — mavjud `app/p/[token]` public-page patterni. Qabulни ko'rsatadi + «Tasdiqlash»
/«Rad etish» (sabab) tugmalari (bu veb-sahifa, tugma MUMKIN — Telegram emas). Amal → public endpointлар. Til: taminotchi
ko'radigan sodda sahifa (uz/ru).

### 5. Havolani yetkazish (MTProto userbot)
`hrTelegramOutbox` (2c5f285'да omborchi uchun ishlatildi) `messageText` ичiga havolani qo'yadi:
- Taminotchi: supply-goods «deliver» xabari YOKI `supply-approval.send()` — matnга `${APP_URL}/p/qabul/<token>` qo'shiladi.
- Omborchi: `dispatchToOmborchi` matnга `${APP_URL}/supplies/<id>` (ERP — u login qiladi) qo'shiladi.

## Xavfsizlik (professional — MAJBURIY)
1. **Token taxmin-qilib-bo'lmas:** `randomBytes(24)` (192-bit) hex — brute-force imkonsiz.
2. **Scope:** token FAQAT bitta supply + role + agentга. Boshqa qabул/amalga ishlamaydi. accountId token-qatordан olinadi
   (URL'дан emas) — cross-tenant yo'q.
3. **Muddat:** `expiresAt` (masalan 14 kun) — o'tган token 410. Bosqich o'zgargach (allaqachon tasdiq/rad) — takror amal
   FSM `claim` bilan bloklanadi (idempotent).
4. **Faqat o'z amali:** public endpoint FAQAT `applySupplierDecision`/`reject` chaqiradi — CRUD/boshqa hech narsa YO'Q.
   Taminotchi mahsulot/narx ko'ra oladi (o'z qabulида), lekin O'ZGARTIRA olmaydi (CRUD faqat ichki omborchi/admin — ular
   login qiladi). *(Egasi «omborchi va admin CRUD» dedi — ular ICHKI, oddiy ERP-huquq bilan; taminotchi faqat tasdiq/rad.)*
5. **HTTPS-only** + token URL-path'да (query emas) — referrer-leak kam.
6. **Rate/audit:** har amal `supplyApprovalEvent`ga yoziladi (kim=supplier via token, IP ixtiyoriy).
7. **`usedAt`:** tasdiq/rad qilingач belgilanadi (audit) — lekin qayta-ochish sahifани ko'rsatishга ruxsat (holatни ko'rsin),
   qayta-AMAL esa FSM bloklaydi.

## Qayta ishlatiladigan mavjud qismlar
- `supply-approval.service`: `applySupplierDecision`, `reject`, `getApproval`, FSM `claim` (idempotent) — HAMMASI BOR.
- Token pattern (`randomBytes` + DB + public link) — `counterparty-statement` да BOR.
- Public page pattern — `app/p/[token]` BOR.
- MTProto outbox (havola yetkazish) — `hrTelegramOutbox` BOR (2c5f285).
- Bot-kod (D1-D3) — OLIB TASHLANADI (magic-link uni almashtiradi).

## Bosqichlar (fokus-sessiya)
1. **E1 — token poydevori:** `SupplyApprovalLink` migration + token-yaratish service (`issueSupplierLink(supplyId)` →
   token+link) + public GET/POST/POST endpointlar (token-auth). Unit: token-scope/muddat/idempotent. Gate + deploy.
2. **E2 — public veb-sahifa:** `app/p/qabul/[token]` — qabul ko'rinishi + Tasdiqlash/Rad (sabab). i18n uz+ru. Gate + web build.
3. **E3 — havola yetkazish:** supplier-send (deliver/`send()`) + `dispatchToOmborchi` matnга havola. Bot-kod (D1-D3) olib
   tashlash. Gate + deploy.
4. **E4 — jonli QA:** real qabul → taminotchi lichkasiga havola → linkда tasdiq → omborchi → admin → stock. Xavfsizlik-sinov
   (yaroqsiz/muddati-o'tган/boshqa-supply token bloklanishi).

## Ochiq qarorlar (E1 oldidan egasidан)
- **Token muddati:** 14 kun okmi? Qabул odatda tez tasdiqlanadi.
- **Taminotchi sahifasi:** faqat ko'rish+tasdiq/rad (CRUD YO'Q) — tasdiqlansinmi? (Egasi «omborchi/admin CRUD» dedi = ichki;
  taminotchi tashqi ⇒ CRUD bermaslik xavfsiz. Tasdiqlash kerak.)
- **Omborchi havolasi:** ERP `/supplies/<id>` (login) yetadimi, yoki omborchiga ham parolsiz magic-link kerakmi? (Omborchi
  ichki xodim — login bor; ERP havolasi yetarli deb taxmin.)
- **Rad sababi:** taminotchi rad etganда sabab majburiymi (`RejectSchema.reason.min(1)` — ha).
