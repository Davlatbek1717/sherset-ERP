# ADR-0001: Backend tilini tanlash

- **Holati:** Qabul qilindi
- **Sana:** 2026-04-17
- **Qaror qabul qiluvchilar:** Product Owner + Chief Architect

## Kontekst va muammo

Moysklad ERP clone'i 53 entity, 36 hujjat turi, 127 integratsiya, moliyaviy hisoblash, multi-tenancy, realtime yangilanish kabi talablarga ega. Backend tili 5-10 yil'ga mos kelishi kerak.

Muhokama qilingan 5 ta haqiqiy tanlov:

1. **TypeScript + NestJS** — JS ekosistema, FE↔BE bitta til
2. **Kotlin + Spring Boot** — Moysklad o'zi shunday, JVM enterprise
3. **Go + Echo/Fiber** — tez, oddiy, concurrency kuchli
4. **C# + .NET 9** — Microsoft, enterprise-grade
5. **Python + FastAPI** — tez dev, AI integratsiyalari uchun qulay

## Qarorning natijasi

**Tanlangan: TypeScript + NestJS 10**

### Sabab

1. **End-to-end type safety.** Frontend (Next.js + React + Zod) va backend (NestJS + Prisma + Zod) bitta tilda ishlaydi. Schema'lar `packages/types` orqali baham ko'riladi. Bu 53 entity × 36 hujjat matritsasini xatosiz boshqarishning eng kuchli yo'li.

2. **Moysklad xatti-harakatini ko'chirish tilga bog'liq emas.** Pul semantikasi (integer tiyinda), transaction (PostgreSQL tomonidan), time zone (IANA tzdata har tilda), JPA lazy loading emas (Prisma explicit). "Kotlin kerak, chunki Moysklad shunday" — mantiqiy xato (biz bytecode emas, **xatti-harakat**ni klon qilamiz).

3. **Ekosistema kengligi.** NestJS + Prisma + BullMQ + Passport + Socket.IO — hammasi aktiv rivojlanib turadi, katta jamoa, ko'p misol. Har kerakli ERP funksiyasi uchun paket mavjud.

4. **Dev tezligi.** Hot reload 200ms (JVM'da 5-10s), npm run vs Gradle task, dev DX eng yaxshi.

5. **Jamoa topish.** O'zbekistonda TypeScript dev'lar Java/Kotlin dev'laridan 10-50 barobar ko'p. Loyiha kelajakdagi o'sishiga moslashuvchan.

6. **NestJS modul tuzilishi** Moysklad'ning 12 moduli bilan tabiiy ravishda mos keladi — har modul alohida `@Module()`, `@Controller()`, `@Service()`.

## Ko'rib chiqilgan va rad etilgan variantlar

### Kotlin + Spring Boot (rad etildi)
**Afzalligi:** BigDecimal tilda birinchi darajada, JPA mustahkam, Moysklad'ning o'zi shu stek'da.
**Kamchiligi:** JVM startup 5-10s (dev DX), pul faqat integer sifatida saqlanganda BigDecimal kerakmas, FE↔BE type share yo'q (har turda ikki marta yoziladi), jamoa kam. Pul/decimal argumenti zaif — chunki biz pulni **integer tiyinda** saqlaymiz.

### Go + Echo (rad etildi)
**Afzalligi:** Juda tez runtime, sodda til.
**Kamchiligi:** ORM zaifroq, validation/DI qo'lda yozish ko'p, 53×36 schema uchun boilerplate katta, FE bilan type share imkoniyati yo'q.

### C# + .NET 9 (rad etildi)
**Afzalligi:** Enterprise uchun kuchli, EF Core yaxshi, decimal asosiy tur.
**Kamchiligi:** Microsoft ecosystem'iga bog'liq, O'zbekistonda kam, Linux hosting eastern Europe'dan tashqarida nokamroq.

### Python + FastAPI (rad etildi)
**Afzalligi:** Yozish tez, AI integratsiyasi oddiy.
**Kamchiligi:** Type safety yumshoqroq, async eval o'zining nozikligi bilan, ERP yuklamada Node.js'dan sekin.

## Oqibatlari

### Ijobiy
- Bitta til = bitta jamoa = tez iteratsiya
- Zod schema'lar FE↔BE baham ko'riladi (apps/web import @moysklad/types)
- Prisma schema → TypeScript → Zod → OpenAPI — yagona zanjir
- Dev DX eng yaxshi (hot reload, type inference, tooling)
- pnpm + Turborepo monorepo ideal

### Salbiy / cheklovlar
- Node.js floating-point — **yumshatildi**: pul integer tiyinda saqlanadi, `packages/money` o'ramasi har joyda
- Enterprise Java stereotipi — "real ERP Java'da" deyilishi mumkin; aslida Shopify, Stripe, Vercel — barchasi TypeScript yoki JS'da milliardlik operatsiyalarni bajaradi
- JVM'ga xos bo'lgan tools (masalan, JProfiler) o'rniga Clinic.js / Node Inspector ishlatiladi — kamlik emas

### Neytral
- NestJS fully RxJS-based; Observable'larni bilish kerak (lekin ixtiyoriy — Promise'lar ham ishlaydi)
- Prisma schema DSL'ni o'rganish kerak (~1 kun)

## Bog'liq hujjatlar

- [ADR-0004: Pul va decimal'larni boshqarish](./0004-money-handling.md)
- [docs/ARCHITECTURE-ANALYSIS.md](../ARCHITECTURE-ANALYSIS.md)
- [docs/PROJECT-PLAN.md](../PROJECT-PLAN.md)
