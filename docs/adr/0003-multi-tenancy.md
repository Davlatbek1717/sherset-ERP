# ADR-0003: Multi-tenancy modeli

- **Holati:** Qabul qilindi
- **Sana:** 2026-04-17

## Kontekst va muammo

SaaS ERP — bitta codebase'da minglab mijoz kompaniyalari ishlaydi. Ma'lumot izolyatsiyasi, scaling, backup, billing — hammasi tenant'ga bog'liq. Noto'g'ri tanlov — leak (katastrofik) yoki over-engineering (sekin + qimmat).

Moysklad'da tenant = `Account` (email bilan ro'yxatdan o'tganda yaratilgan auto-account). Har foydalanuvchi aynan bir `accountId`'ga tegishli. API docs'dan: `accountId` — har entity'da majburiy maydon.

## Qarorning natijasi

**Bridge model** — pool-first, silo-migrable:

- **Default (99% mijozlar):** Pool model — bitta PostgreSQL DB, har jadvalda `account_id UUID NOT NULL`, Row-Level Security (RLS) policy har querryda avtomat filtrlaydi
- **Enterprise mijozlar (katta yuklama yoki maxsus izolyatsiya talabi):** Silo model — alohida DB instance per tenant, infrastruktura avtomatlash bilan

Kun 1'dan **migration path tayyor** — pool'dan silo'ga o'tish 30 daqiqa ichida mumkin.

## Sabab

### Pool nega default?
1. **Arzon** — bitta PostgreSQL instance minglab tenantni ko'taradi (Moysklad'ning o'zi shunday ishlaydi)
2. **Backup oson** — bitta DB dump
3. **Cross-tenant reports mumkin** (admin analytics uchun)
4. **Prisma migratsiya bitta joyda qo'llaniladi**

### Silo nega kerak bo'lishi mumkin?
1. **Qattiq izolyatsiya** — qonuniy talablar (maxsus mijoz)
2. **Katta yuklama** — alohida CPU/RAM
3. **Custom schema** — mijoz-specific o'zgartirishlar

### Nega silo'ni default qilmadik?
- Bitta tenant uchun ham PostgreSQL instance — 200+ MB RAM
- 1000 tenant = 200 GB RAM faqat DB'lar uchun
- Migratsiya har tenantda alohida = murakkab deploy
- CI testing — har feature uchun alohida DB

## Ko'rib chiqilgan variantlar

### Pool-only (RLS) — rad etildi
**Afzalligi:** eng sodda
**Kamchiligi:** katta mijoz kelsa qayta yozish kerak, noisy neighbor

### Silo-only — rad etildi
**Afzalligi:** to'liq izolyatsiya
**Kamchiligi:** 1000 tenantda mumkin emas (resource), migratsiya og'riqli

### Bridge (tanlangan) — qabul qilindi
**Afzalligi:** 99% uchun arzon, 1% uchun joy bor
**Kamchiligi:** kod 2 rejimda ishlashi kerak — **yumshatiladi:** abstract connection provider

## Implementatsiya

### Schema (Prisma)

Har tenant-scoped entity:
```prisma
model Product {
  id          String   @id @default(uuid())
  accountId   String   // <-- tenant key
  name        String
  // ...

  @@index([accountId])
  @@map("products")
}

model Account {
  id          String   @id @default(uuid())
  name        String
  createdAt   DateTime @default(now())
  // ...

  @@map("accounts")
}
```

### Row-Level Security (RLS)

Migration SQL:
```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON products
  USING (account_id = current_setting('app.current_account_id')::uuid);

-- Har query boshida:
SET LOCAL app.current_account_id = '<uuid>';
```

NestJS middleware har request'da `accountId`'ni `SET LOCAL`'ga yozadi (JWT'dan olinadi).

### Connection provider (Bridge logic)

```typescript
// packages/db/src/connection.ts
export async function getPrismaForAccount(accountId: string): Promise<PrismaClient> {
  const account = await mainPool.account.findUnique({ where: { id: accountId } });
  if (account.tenantMode === 'silo') {
    return getSiloClient(account.siloDbUrl);
  }
  return poolClient; // with RLS session variable set
}
```

### Migratsiya pool → silo

```bash
pnpm tenant:migrate-to-silo --account-id=<uuid> --target-db=<url>
```
Script:
1. Yangi DB'ga schema push
2. `pg_dump | pg_restore` faqat shu accountId'ning ma'lumotlari
3. `Account.tenantMode = 'silo'` va `Account.siloDbUrl = <url>` yangilash
4. Eski DB'dan tenant ma'lumotlari tozalash (background job)

## Oqibatlari

### Ijobiy
- Arzon boshlash (1 DB 1000 tenant)
- Enterprise mijoz uchun yo'l bor
- RLS PostgreSQL darajasida — security-in-depth (hatto app bug'ida ham leak yo'q)

### Salbiy / cheklovlar
- Har query'da `SET LOCAL` chaqirilishi kerak — **yumshatiladi:** Prisma middleware har so'rov'dan oldin qo'yadi
- Cross-tenant report'lar maxsus role bilan (ADMIN_PLATFORM) qilinadi — RLS bypass

### Neytral
- Silo migration script yozilishi kerak — lekin bir marta, keyin qayta ishlatiladi

## Test strategiyasi

- **Unit:** Prisma middleware accountId'ni to'g'ri set qiladi
- **Integration:** 2 tenant yaratib, bir-birini ma'lumotini ko'ra olmasligini tekshirish
- **E2E:** Playwright — 2 foydalanuvchi parallel login, har biri o'z ma'lumotini ko'radi

## Bog'liq hujjatlar

- [Prisma + RLS best practices](https://www.prisma.io/docs/orm/overview/databases/postgresql)
- [packages/db/README.md](../../packages/db/README.md)
