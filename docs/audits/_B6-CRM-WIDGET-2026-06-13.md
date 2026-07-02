# B6 S17 — counterparties/[id] CRM activity widget (2026-06-13)

> **`davom et` (lokal Opus, ultracode).** Phase-1 structural + **browser-certified**
> (Playwright on :3100 — the 779d01a profile was freed with the user's go-ahead).
> One of the master plan's two genuinely-open in-scope HIGH refactors (§3.2).

## What

moysklad's counterparty card shows a RIGHT tabbed CRM widget. The clone instead
stacked an audit `DocumentTabs`, an `AttachmentsSection`, and a balance table as
three separate sections. This builds the real moysklad widget and consolidates
those three into it.

**§4 DOM-grounded tab set** (`_B5-B6-DESIGN-GROUNDING-2026-06-13.md:48`, captured
from the live counterparty card): **События · Задачи · Документы · Файлы ·
Показатели**. Each tab is wired against an endpoint that already exists (grounded
by the 2026-06-13 grounding workflow):

| Tab | Source (existing endpoint) |
|---|---|
| **События** | AuditLog feed — `useDocumentHistory('Counterparty', id)` (the prior История tab's data) |
| **Задачи** | `GET /tasks?agentId=<cp>` (Task.agentId FK), localized status badges (`states.task`) |
| **Документы** | fan-out across the 5 core agent-facing doc lists (customer-orders · demands · invoices-out · supplies · invoices-in), each `?agentId=`, `Promise.allSettled`, merged + sorted by `moment` desc; per-type state labels via `states.<type>.<slug>` |
| **Файлы** | `AttachmentsSection entity="Counterparty"` (reused) |
| **Показатели** | per-currency balances + total sales (already on the page) |

`Promise.allSettled` so one list 500ing can't blank the whole tab. Money stays
BigInt minor (`formatMoney(BigInt(sumMinor))`). All queries are accountId-scoped
by the backend. Clickable rows are keyboard-accessible (`onKeyDown` + `tabIndex`).

## Scope / honest deferral

The **Документы** tab covers the **sell + buy core** (5 doc types). moysklad's
captured Документы table is a single cross-document table over EVERY doc type with
sub-tabs (Документы · Договоры · Операции с баллами); a complete aggregator (every
doc type, merged/paged server-side) is a later **backend** slice. The current
fan-out is a faithful, useful subset — it shows the counterparty's main documents
today, sorted and localized.

## Gate + runtime

- web tc0 · biome0 · web Vitest counterparty 10/10 (incl new 4-assert widget
  guard `counterparty-activity-widget.test.ts`) · button-conventions 94/94 ·
  i18n `counterparty_activity` namespace complete ru+uz (asserted in the guard).
- **Browser-certified (Playwright, :3100, RU):** all 5 tabs render
  (События[selected] · Задачи · **Документы (2)** · Файлы · Показатели). The
  Документы tab renders a real table — «Отгрузка 03407 / 1 500 012,00 сум /
  Проведён» and «Заказ покупателя 00917 / 1 500 012,00 сум / Отгружен» — sorted
  by date desc with per-type localized type + state labels. Показатели renders
  «Сумма продаж 0,00 сум» + «Нет данных по балансу». **ZERO console errors**.

## Honest status

**Browser-certified** for render + the Документы fan-out (real data). The full
cross-document aggregator + the «Договоры»/«Операции с баллами» sub-tabs remain a
backend slice (deferred, named not hidden). The B5 products/[id] right widget
(§3.1) is the symmetric remaining refactor.
