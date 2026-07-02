# ADR-0005: Audit va event ledger

- **Holati:** Qabul qilindi
- **Sana:** 2026-04-17

## Kontekst va muammo

ERP'da uchta alohida "audit" masalasi bor:

1. **Umumiy audit trail** — "kim qachon nimani o'zgartirdi" (har entity uchun)
2. **Stock ledger** — ombor qoldiqlari (har stock-affecting hujjat operation qo'shadi)
3. **Money ledger** — pul oqimi (har payment/invoice entries qo'shadi, double-entry bookkeeping)

Yo'l tanlovi: har tranzaksiya qanday saqlanadi?

Ikki muqobil:
- **CRUD + audit jadvali** — entity joriy holatda saqlanadi, audit jadval o'zgarishlarni log qiladi
- **Event Sourcing** — har o'zgarish immutable event, joriy holat projection'lardan hisoblab chiqariladi

## Qarorning natijasi

**Hybrid model — har domen uchun mos strategiya:**

| Domen | Strategiya | Sabab |
|---|---|---|
| Product, Counterparty, Employee, Settings, ... (reference data) | **CRUD + audit log** | Oddiy, tez, joriy holat muhim |
| Stock operations (demand, supply, move, inventory, ...) | **Append-only stock ledger** | Snapshots + replay, aniq qoldiq hisobi |
| Money operations (payment, cashin, cashout, invoice) | **Append-only money ledger** (double-entry) | Audit talabi, soliq hisobot uchun majburiy |
| Document state transitions | **State history table** (append-only) | Workflow audit, SOX-like trace |

### Umumiy audit log (barcha entity uchun)

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL,        -- tenant
  entity_type TEXT NOT NULL,       -- 'product', 'purchase_order', ...
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,            -- 'create', 'update', 'delete', 'restore'
  actor_id UUID NOT NULL,          -- Employee who did it
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changes JSONB,                    -- { field: { before, after } } for updates
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,                  -- for distributed tracing

  INDEX idx_entity (entity_type, entity_id, at DESC),
  INDEX idx_account_date (account_id, at DESC)
);
```

Prisma middleware orqali har write avtomatik audit_log qo'shadi.

### Stock ledger (append-only)

```sql
CREATE TABLE stock_operations (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL,
  document_type TEXT NOT NULL,     -- 'supply', 'demand', 'move', ...
  document_id UUID NOT NULL,
  position_id UUID NOT NULL,
  store_id UUID NOT NULL,          -- warehouse
  assortment_type TEXT NOT NULL,   -- 'product' | 'variant' | 'bundle' | 'consignment'
  assortment_id UUID NOT NULL,
  consignment_id UUID,
  quantity DECIMAL(20, 6) NOT NULL,-- + for in, - for out
  cost_minor BIGINT,               -- FIFO cost per unit
  at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_balance (account_id, store_id, assortment_id, consignment_id, at),
  INDEX idx_document (document_id)
);
```

**Joriy qoldiq hisobi:**
```sql
SELECT SUM(quantity)
FROM stock_operations
WHERE account_id = $1 AND store_id = $2 AND assortment_id = $3 AND consignment_id IS NULL
  AND at <= $4;
```

Tez hisob uchun materialized view yaratiladi va har N daqiqada refresh qilinadi.

Hujjat `applicable = true` (проведено) bo'lganda operation qo'shadi. `applicable = false` → operations o'chiriladi (cascade).

### Money ledger (double-entry)

Klassik accounting ledger:

```sql
CREATE TABLE money_operations (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL,
  document_type TEXT NOT NULL,     -- 'payment_in', 'cashin', ...
  document_id UUID NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  source_type TEXT NOT NULL,       -- 'cash_register' | 'bank_account' | 'counterparty'
  source_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL,    -- + credit, - debit
  currency CHAR(3) NOT NULL,
  rate_multiplier BIGINT,          -- to organization base currency
  counterparty_id UUID,
  expense_item_id UUID,            -- category (Статья расходов)

  INDEX idx_source (account_id, source_type, source_id, at),
  INDEX idx_counterparty (account_id, counterparty_id, at)
);
```

Har `payment_in` hujjati 2 entry qo'shadi:
- `+amount` → cash_register (pul kirdi)
- `-amount` → counterparty (qarz kamaydi)

Balance invariantlari:
- Har hujjat uchun: sum(debits) == sum(credits) — double-entry
- Har cash_register/bank_account joriy qoldiq = sum(operations)

### State history

```sql
CREATE TABLE document_state_history (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  document_id UUID NOT NULL,
  from_state_id UUID,
  to_state_id UUID NOT NULL,
  transitioned_by UUID NOT NULL,    -- Employee
  at TIMESTAMPTZ NOT NULL,
  reason TEXT,

  INDEX idx_doc (document_id, at DESC)
);
```

## Sabab

### Nega event sourcing yo'q (barcha domen uchun)?
- Murakkab — har entity uchun event schema + projection + replay
- Migratsiya murakkab
- Reference data (Product, Counterparty) uchun over-engineering
- Moysklad ham CRUD + audit approach ishlatadi

### Nega append-only ledger (stock + money)?
- Soliq tekshiruvi talabi: "5 yil oldingi qoldiq" — replay kerak
- Double-entry — accounting standart
- Backdating xavfsiz — eski operatsiyalar o'zgartirilmaydi
- Moysklad ham shunday (оборот, остатки — hisoblab chiqariladi)

### Nega state history alohida?
- Har hujjat status workflow'i (Draft → Confirmed → Posted → Cancelled) audit'i talab qiladi
- FSM (finite state machine) — explicit transitions table

## Oqibatlari

### Ijobiy
- Soliq audit'iga tayyor (har tranzaksiya immutable log'da)
- Time-travel (har onda qoldiq ko'rsatish mumkin)
- Debug oson — nima sodir bo'lgani aniq
- 5 yil qonunga muvofiq (O'zbekiston)

### Salbiy / cheklovlar
- Yozuv hajmi katta (har hujjat N ta ledger entry) — **yumshatiladi:** partitioning by date, archival after 7 years
- Hisoblash materialized view'lar bilan cache'lash kerak — **yumshatiladi:** `refresh_balances_view()` cron 5 daqiqada
- Backdating mumkin, lekin cautiously — **yumshatiladi:** backdating bir marta, keyin reversal entry

### Neytral
- Append-only = DELETE yo'q, faqat "reversal" operation — user UI'da o'chira olmaydi, faqat voidni qo'shadi

## Implementatsiya tartibi

1. **Sprint 1-2:** `audit_log` table + Prisma middleware (barcha entity uchun)
2. **Sprint 3-4:** `stock_operations` table + StockLedgerService + materialized view
3. **Sprint 3-4:** `money_operations` table + MoneyLedgerService + balance endpoints
4. **Sprint 5:** `document_state_history` + workflow engine integratsiyasi

## Bog'liq hujjatlar

- [Martin Fowler — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [ADR-0003: Multi-tenancy](./0003-multi-tenancy.md)
- [packages/core/ledger/README.md](../../packages/core/ledger/README.md)
