# /invoices-out parity spec

**Manba**: `screenshots/00-clean-default.png` (yangi prod auth, 2026-04-30)
**Holat**: 🚧 Round 1 — list view spec

> RULE 0 — har string PNG'dan keladi.

## 1. List view

### Title row
- **H1**: `Счета покупателям` _(source: PNG)_
- Refresh icon: ✅
- Help icon: ✅

### Sub-tabs (10 ta — Sales modulning bir qismi)
Customer-orders bilan bir xil sales sub-nav (ро'yxat shu spec'da):
Заказы покупателей / Счета покупателям (active) / Отгрузки / Отчеты комиссионера / Возвраты покупателей / Счета-фактуры выданные / Прибыльность / Товары на реализации / Воронка продаж / **Юнит-экономика**

### Toolbar (chap-o'ng)
| # | Element | Matn (ru) |
|---|---|---|
| 1 | Primary CTA | `+ Счет` |
| 2 | Filter button | `Фильтр` |
| 3 | Search input | placeholder `Номер или комментарий` |
| 4 | Selection counter | `0` |
| 5 | Bulk dropdown | `Изменить ▾` |
| 6 | Create dropdown | `Создать ▾` |
| 7 | Print dropdown | `Печать ▾` |

❗ **No `Статус`/`Столбцы`/`Решения`** dropdown'lari (PNG'da ko'rinmadi)

### Columns (13 ta)
| Order | Key | Header (ru) | Type | Align |
|---|---|---|---|---|
| 1 | name | `№` | string | left |
| 2 | moment | `Время` | datetime | left |
| 3 | agent | `Контрагент` | string | left |
| 4 | organization | `Организация` | string | left |
| 5 | store | `Со склада` | string | left |
| 6 | sum | `Сумма` | money | right |
| 7 | currency | `Валюта` | string | center |
| 8 | **plan_payment_date** | **`План. дата оплаты`** | datetime | left |
| 9 | payed_sum | `Оплачено` | money | right |
| 10 | shipped_sum | `Отгружено` | money | right |
| 11 | sent | `Отправлено` | bool | center |
| 12 | printed | `Напечатано` | bool/badge | center |
| 13 | description | `Комментарий` | string | left |

### Empty state
> ❓ PNG'da rich empty render qilinmadi (capture moment'da edge case — pagination "1-1 из 0" ko'rsatdi). Avvalgi taxminiy matn saqlanadi `pages.invoices_out.empty_rich_heading` — keyingi sessiyada to'liq bo'sh test account bilan yangilash kerak.

### Pagination
- Format: `1-1 из 0` (NBSP thousands)

## 2. i18n string'lar

| Key | RU | UZ | Source |
|---|---|---|---|
| `pages.invoices_out.title` | Счета покупателям | Mijozlarga schyotlar | PNG |
| `pages.invoices_out.create_button` | Счет | Schyot | PNG |
| `pages.invoices_out.search_placeholder` | Номер или комментарий | Raqam yoki izoh | PNG |
| `fields.plan_payment_date` | План. дата оплаты | Rejalashtirilgan to'lov sanasi | PNG |
| `fields.from_warehouse` | Со склада | Ombordan | PNG |

## 10. Round 1 DOD

- [x] Toolbar moslashtirilgan (PNG bilan tasdiqlangan)
- [x] Columns 13 ta (yangi: `plan_payment_date`)
- [x] Search placeholder `Номер или комментарий`
- [x] hideTitle + filters=[] (avvalgi commit'larda)
- [ ] Empty state heading — ❓ TODO PNG'da yo'q
- [ ] Manual smoke
