# Kontragentlar ro'yxatiga multi-select guruh-filtri — dizayn

**Sana:** 2026-07-21
**Holat:** Dizayn tasdiqlangan (foydalanuvchi), implementatsiya kutmoqda
**Ko'lam:** `/counterparties` ro'yxatiga guruh (`CounterpartyGroup`) bo'yicha multi-select filtr qo'shish.

---

## Muammo / talab

Kontragentlar (`/counterparties`) sahifasida **guruhlar allaqachon bor** — `CounterpartyGroup`
(many-to-many «Группы», tekis ro'yxat, `index` bo'yicha tartib), ro'yxatда «Группы» kolonka, va
guruh-boshqaruv modali (`group-manager-modal.tsx`). Filtr paneli (`InlineFilterPanel`) ham bor
(companyType, priceType, tags, balance, sana va h.k.), **LEKIN guruh-filtri yo'q**. Foydalanuvchi
ro'yxatni **guruh bo'yicha filtrlashni** so'radi.

**Foydalanuvchi qarori (AskUserQuestion):** **multi-select** — bir nechta guruh belgilanadi,
shu guruhlarning **birortasида** bo'lgan kontragentlar birga ko'rinadi.

## Mavjud struktura (grounding)

- `CounterpartyGroup` (schema.prisma ~1880): `id, accountId, name, index`; `@@unique([accountId, name])`;
  `counterparties Counterparty[] @relation("CounterpartyGroups")` (many-to-many).
- `GET /counterparty-groups` → `{ items: Group[] }` (mavjud, `group-manager-modal.tsx` ishlatadi).
- `CounterpartyFilterSchema` (counterparty.schema.ts ~149): mavjud filtrlar (archived, companyType,
  tags, shared, priceTypeId, balanceFrom/To, createdFrom/To, sortBy, page…). Guruh-filtri YO'Q.
- `counterparty.service.ts` `list()` (~57): `CounterpartyFilterSchema.parse` → AND-clause `where`
  quradi (nested OR/some filtrlar uchun `andClauses` naqshi bor).

## Dizayn

### 1. Backend — filter schema + list query

- **`CounterpartyFilterSchema`ga `groupIds` qo'shiladi** — ixtiyoriy UUID-massiv. Query-param mavjud
  massiv-filtr (`tags`) uslubида parse qilinadi (vergul-ajratilgan string yoki takror param →
  `string[]`; har biri `z.string().uuid()`). Bo'sh/yo'q → filtrsiz.
- **`list()` query:** `groupIds?.length` bo'lsa AND-clause'ga qo'shiladi:
  ```ts
  counterpartyGroups: { some: { id: { in: filter.groupIds } } }
  ```
  Ya'ni kontragent tanlangan guruhlarning **birortасида** bo'lsa mos keladi (OR-semantika,
  multi-select talabiga mos). `accountId` scope o'zgarmaydi (guruhlar ham account-scoped).

### 2. Frontend — filtr paneliga multi-select guruh-filtri

- `GET /counterparty-groups` bilan guruhlar yuklanadi (React Query, `['counterparty-groups']` —
  group-manager-modal bilan bir kalit, kesh ulashiladi).
- Filtr paneliga (`InlineFilterPanel` yoki uning yonida) **multi-select guruh-boshqaruvi** qo'shiladi
  (mavjud filtr-boshqaruvlar uslubида: checkbox-ro'yxat yoki multi-picker; «Группы»/«Guruhlar» label).
- Tanlangan guruh-id'lar ro'yxat so'roviga `groupIds` sifatida uzatiladi (mavjud filtrlarning
  holat/URL-param boshqaruvi aks ettiriladi — bir xil naqsh).
- **i18n:** filtr label + placeholder ru+uz (`filters` yoki counterparties namespace; no-hardcoded gate).

### 3. Xatoliklar / edge-case

- Noto'g'ri/yo'q UUID → Zod rad etadi (400). Bo'sh tanlov → filtr qo'llanmaydi (barcha kontragent).
- Guruh o'chirilsa (many-to-many uziladi) → filtr shunchaki kamroq natija beradi (xato emas).
- Boshqa faol filtrlar bilan AND (guruh-filtr + companyType → ikkovi ham qo'llanadi).

### 4. Testlash (Phase-1, «runtime-unverified»)

- **Backend:** `CounterpartyFilterSchema` `groupIds` qabul qiladi (massiv uuid; noto'g'ri rad);
  `list()` `groupIds` berilганда `counterpartyGroups: { some: { id: { in } } }` where qo'shishini
  Prisma-mock bilan tekshiradi (mavjud service-test naqshi).
- **Frontend:** filtr yuklangan guruhlarni render qiladi + tanlash `groupIds`ni so'rovga uzatadi
  (mavjud filtr-test naqshi bo'lsa aks ettiriladi).
- **Gate:** tc0 · biome0 · i18n key-existence ru+uz + no-hardcoded · web+api Vitest regress yo'q.
- **Browser-smoke = alohida** (deploy yoki lokal dev-stack'да): guruh tanlab ro'yxat filtrlanishi.

### 5. Ko'lam chegarasi (YAGNI)

Faqat multi-select guruh-filtri. YO'Q: guruh-daraxti (CounterpartyGroup tekis), «guruhsizlar»
opsiyasi (so'ralmadi), guruh-boyicha bulk-amallar. ⚠️ **Parallel-sessiya:** counterparties
sahifasi/filtr-panel fayllariga boshqa sessiya tegayotgan bo'lishi mumkin — commitdan oldin
`git status` bilan tekshiriladi, faqat o'z fayllar stage qilinadi (CLAUDE.md §6).

### 6. Asosiy fayl-touchpointlar

- `apps/api/src/modules/counterparty/counterparty.schema.ts` (`groupIds`)
- `apps/api/src/modules/counterparty/counterparty.service.ts` (`list()` where)
- `apps/api/src/modules/counterparty/counterparty.schema.test.ts` + service test (guruh-filtr)
- `apps/web/src/app/(app)/counterparties/page.tsx` (filtr-boshqaruv + so'rov wiring)
- (ehtimol) `apps/web/src/components/filters/*` yoki `data-table/inline-filter-panel` (multi-select boshqaruv)
- `apps/web/src/messages/{ru,uz}.json` (filtr label)

## Muvaffaqiyat mezoni

1. Foydalanuvchi filtr panelidan bir nechta guruh tanlaydi → ro'yxat shu guruhlarning birortасидаgi
   kontragentlar bilan yangilanadi.
2. Boshqa filtrlar bilan birga ishlaydi (AND). Gate yashil. Natija halol «Phase-1, runtime-unverified».
