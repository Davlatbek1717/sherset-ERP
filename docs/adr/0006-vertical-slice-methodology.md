# ADR-0006: Vertikal kesim metodologiyasi

- **Holati:** Qabul qilindi
- **Sana:** 2026-04-17

## Kontekst va muammo

53 entity + 36 hujjat + 127 integratsiya + 12 modul — katta scope. Klassik "layered" yondashuv (avval barcha DB, keyin barcha API, keyin barcha UI) — oylar davomida ishlaydigan narsa yo'q. Team morale, stakeholder feedback, arxitektura validatsiyasi — hammasi azoblanadi.

## Qarorning natijasi

**Vertikal kesim metodologiyasi** — Mike Cohn / Jeff Patton yondashuvi:

Har sprint (1-2 hafta) — **bitta ishlaydigan funksiya** (DB + API + UI + test to'liq). Kengligi kichik, lekin chuqurligi to'liq.

### Tartib

```
Sprint 1: Product entity — to'liq vertikal kesim
  ├─ Prisma schema: Product + ProductFolder + Unit + PriceType
  ├─ API: /products/* CRUD + list + filter + search
  ├─ UI: Tovarlar list + edit form + create (using ListView + EditForm patterns)
  ├─ i18n: UZ/RU/EN barcha text
  ├─ Auth: login kerak (basic JWT)
  ├─ Multi-tenancy: accountId RLS ishlaydi
  ├─ Tests: Vitest unit + Playwright E2E + visual regression
  └─ Deploy: staging'da ishlaydi

Sprint 2: Counterparty — ikkinchi vertikal kesim
  └─ Pattern'lar reuse, qo'shimcha nozikliklar (quick-create modal, tabs)

Sprint 3: PurchaseOrder — uchinchi (eng murakkab)
  ├─ Document toolbar (Save/Close/Print/Send)
  ├─ Positions editor (add-line, barcode scan)
  ├─ Stock ledger impact
  └─ Workflow (Draft → Posted)

Sprint 4+: horizontal expansion
  ├─ Qolgan 50 entity (parallel agentlar)
  ├─ Qolgan 33 hujjat turi (pattern asosida)
  └─ 127 integratsiya (har biri alohida paket)
```

### Har kesim "ready" mezonlari

- [ ] DB schema Prisma'da
- [ ] Migration applied
- [ ] Seed data mavjud
- [ ] API endpoints (CRUD + list + filter + search)
- [ ] API documented (OpenAPI)
- [ ] Zod validation
- [ ] UI sahifalar (list + edit + detail)
- [ ] i18n har text
- [ ] Visual regression test (Moysklad screenshot'iga taqqoslash)
- [ ] E2E test (create → edit → delete)
- [ ] Unit test core logic
- [ ] ADR / docs yangilanadi
- [ ] Staging deploy muvaffaqiyatli

## Sabab

1. **Har sprint demo ko'rsatiladi** — stakeholder feedback haqiqiy mahsulot ustida
2. **Arxitektura haqiqatan tekshiriladi** — birinchi kesim (Product) pattern'lar, auth, tenancy, money, ledger — hammasini majbur qiladi
3. **Morale yaxshi** — har 2 haftada ishlaydigan narsa
4. **Risk kamayadi** — muammolar erta chiqadi, kechgi integration hell yo'q
5. **Parallel agent ishlashga asos** — birinchi kesim pattern'lari aniqlansa, qolganini parallel qilish mumkin

## Nega layered emas?

Klassik "avval DB, keyin API, keyin UI" yondashuvi:
- 3 oy davomida hech narsa ishlamaydi
- Integration bug'lar oxirida to'planadi
- Demo ko'rsatish imkonsiz — "loading..."
- Team morale pasayadi
- Stakeholder "nima qilmoqdasiz?" deydi

## Oqibatlari

### Ijobiy
- Har 2 haftada deploy-ready feature
- Pattern validation erta
- Agent parallelism osongina (birinchi kesim namuna)
- Stakeholder trust

### Salbiy / cheklovlar
- Birinchi kesim sekinroq (chunki hamma pattern'lar yaratiladi) — **yumshatiladi:** bu narx one-time, qolgan kesimlar 2-3x tez
- Pattern refactoring birinchi kesimlarda bo'ladi — **yumshatiladi:** storybook + visual-reg tests bu'ni kuchaytiradi

### Neytral
- Kanban / agile sozlash kerak — TODO lists / planning poker qisqa

## Implementatsiya

Har vertikal kesim uchun `docs/specs/sprint-NNN.md` yoziladi:

```
# Sprint NNN — [Feature name]

## Goal
Bitta jumla.

## User story
As a ..., I want to ... so that ...

## Acceptance criteria
- [ ] ...
- [ ] ...

## Patterns used
- ListView
- EditForm

## New patterns needed
- (agar bor bo'lsa)

## Data model changes
- ...

## API endpoints
- ...

## UI routes
- ...

## Test plan
- ...

## Out of scope (next sprint)
- ...
```

## Bog'liq hujjatlar

- [Jeff Patton — User Story Mapping](https://www.jpattonassociates.com/user-story-mapping/)
- [docs/PROJECT-PLAN.md — Sprint roadmap](../PROJECT-PLAN.md)
