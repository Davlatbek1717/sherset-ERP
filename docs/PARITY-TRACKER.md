# Parity Tracker — moysklad 1:1 (Protocol v2.2)

> Manba: `MOYSKLAD-PARITY-AUDIT-PROTOCOL.md` + `superpowers/specs/2026-05-29-full-parity-professional-design.md`.
> Belgilar: ✅ tugadi (DoD §2 to'liq) · 🚧 ishlanyapti · ⏳ boshlanmagan · N/A UI yo'q.
> Faza ustunlari: **P0** reference · **P1** structural · **P2** interactive · **P3** stateful · **P4** ref-diff.
> **Qoida:** sahifa ✅ faqat 5 faza + gates + `audit-<module>.md` + commit bo'lganda.

**Baseline 2026-05-29 (o'lchangan, taxmin emas):** reference library = 0, `audit-<module>.md` = 0, DoD-yopilgan = 0/56. Capture harness Sub-loyiha 0 da ishga tushirildi.

## Phase A — Sales
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| A1 | customer-orders | ✅ | ✅ | 🚧 | 🚧 | ⏳ | ⏳ | P0 `0d08dfaf`; **P2 LIST+DETAIL+NEW keng audit — 8 real fix**: LIST 6 (`53f29c5e`,`de65799f`,`eea26e3f`,`4fe27460`,`4cbd82f9`,`66bfb4a2`), DETAIL externalCode (`c6b364ed`), NEW i18n (`b5fc1728`). P3 qisman (pagination/selection/saved-filter jonli ko'rildi). Qoldi: P3 full state-capture · P4 side-by-side (live moysklad capture + web server restart kerak — :3100 hung) |
| A2 | demands | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| A3 | invoices-out | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| A4 | sales-returns | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase B — Money
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| B1 | payments-in | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B2 | payments-out | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B3 | cash-in | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B4 | cash-out | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B5 | bank-import | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B6 | counterparty-adjustments | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B7 | prepayments | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase C — Purchase
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| C1 | purchase-orders | ⏳ | 🚧 | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C2 | supplies | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C3 | invoices-in | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C4 | purchase-returns | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C5 | factures-in | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C6 | factures-out | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase D — Master data
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| D1 | counterparties | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D2 | products | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D3 | product-folders | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D4 | services | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D5 | bundles | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D6 | variants | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase E — Warehouse
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| E1 | moves | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E2 | losses | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E3 | enters | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E4 | inventory | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E5 | internal-orders | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E6 | price-lists | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase F — CRM (UI bor)
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| F1 | pipelines | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F2 | opportunities | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F3 | calls | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F4 | tasks | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F5 | contact-persons | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F6 | contracts | N/A | N/A | N/A | N/A | N/A | N/A | UI yo'q (backend bor) |
| F7 | projects | N/A | N/A | N/A | N/A | N/A | N/A | UI yo'q (backend bor) |

## Phase G — Retail (UI yo'q)
| # | Sahifa | DoD | Izoh |
|---|--------|-----|------|
| G1 | retail-sales | N/A | UI yo'q (backend bor) |
| G2 | cashier-sessions | N/A | UI yo'q (backend bor) |
| G3 | online-orders | N/A | UI yo'q (backend bor) |

## Phase H — Production
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| H1 | bom | N/A | N/A | N/A | N/A | N/A | N/A | UI tekshirilsin (memory: yo'q) |
| H2 | work-orders | N/A | N/A | N/A | N/A | N/A | N/A | UI tekshirilsin (memory: yo'q) |
| H3 | processing-orders | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| H4 | processings | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase I — Settings (~19)
| # | Sahifa | DoD | Commit |
|---|--------|-----|--------|
| I1 | settings/organizations | ⏳ | — |
| I2 | settings/stores | ⏳ | — |
| I3 | settings/cash-desks | ⏳ | — |
| I4 | settings/bank-accounts | ⏳ | — |
| I5 | settings/users | ⏳ | — |
| I6 | settings/audit-log | ⏳ | — |
| I7 | settings/price-types | ⏳ | — |
| I8 | settings/exchange-rates | ⏳ | — |
| I9 | settings/currencies | ⏳ | — |
| I10 | settings/mxik | ⏳ | — |
| I11 | settings/attributes | ⏳ | — |
| I12 | settings/print-templates | ⏳ | — |
| I13 | settings/uoms | ⏳ | — |
| I14 | settings/tax-rates | ⏳ | — |
| I15 | settings/expense-items | ⏳ | — |
| I16 | settings/custom-entities | ⏳ | — |
| I17 | settings/regions | ⏳ | — |
| I18 | settings/email | ⏳ | — |
| I19 | settings/webhooks | ⏳ | — |
| I20 | settings/task-types | 🚧 | TaskType audit qisman; DoD qayta tekshirilsin |

## Phase J — Reports (UI bor ~12)
| # | Sahifa | DoD | Commit |
|---|--------|-----|--------|
| J2 | reports/profitability | ⏳ | — |
| J4 | reports/cash-flow | ⏳ | — |
| J5 | reports/abc-analysis | ⏳ | — |
| J6 | reports/sales-by-channel | ⏳ | — |
| J7 | reports/sales-by-hour | ⏳ | — |
| J8 | reports/average-basket | ⏳ | — |
| J9 | reports/aging | ⏳ | — |
| J10 | reports/inventory-variance | ⏳ | — |
| J11 | reports/slow-movers | ⏳ | — |
| J12 | reports/returns-ratio | ⏳ | — |
| J13 | reports/counterparty-balance | ⏳ | — |
| J14 | reports/purchase-management | ⏳ | — |
| J1 | reports/dashboard | N/A | UI yo'q (tekshirilsin) |
| J3 | reports/turnover | N/A | UI yo'q |

## Phase K — Other (UI bor)
| # | Sahifa | DoD | Commit |
|---|--------|-----|--------|
| K | tracking-codes | ⏳ | — |
| K | discounts | ⏳ | — |
| K | payrolls | ⏳ | — |
| K | loyalty | N/A | UI yo'q |
| K | publications | N/A | UI yo'q |
| K | notifications | N/A | UI yo'q |
| K | help | N/A | UI yo'q |
| K | api-integrations | N/A | UI yo'q |

## Scope chetida (alohida ish)
- **HR moduli**, **Analitika moduli** — moysklad 56 sahifasiga kirmaydi (custom spec, reference yo'q). Umumiy sifat darvozalaridan o'tgan.
- **UI'siz sahifalar** (G, F6/F7, H1/H2, J1/J3, K-no-ui) — kerak bo'lsa alohida "UI qurish" sub-loyihasi.

## Yig'indi (o'lchangan)
- Scope ichida (DoD qo'llaniladigan): **~52 sahifa** (UI bor).
- ✅ DoD-yopilgan: **0** (hali bironta sahifa to'liq 4-faza yopilmagan).
- Reference (P0) tayyor: **1** (customer-orders, `0d08dfaf`). Capture harness ishlaydi (`pnpm capture-moysklad <module>`, avtomatik login).
- 🚧: purchase-orders P1, task-types. ⏳: qolgani.
- Har sahifa tugagach shu jadval + commit hash yangilanadi.
