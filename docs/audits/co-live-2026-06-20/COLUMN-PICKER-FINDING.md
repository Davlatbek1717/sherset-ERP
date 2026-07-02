# ⚙ Column-set parity — §4 grounding finding (2026-06-20)

**Task:** capture the live moysklad CO «Столбцы» (column-customizer) full hideable
set and compare to our default 14–15 columns.

## What the live capture actually showed

Logged into the real climart account (read-only, saved session) and opened the
customer-order grid toolbar. The grid toolbar controls (measured, left→right):

```
Изменить (x711) · Статус (x800) · Создать (x873) · Печать (x953) · Столбцы (x1058)
```

Clicking **«Столбцы»** does NOT open a column-visibility picker in this account.
It opens a **promo modal** titled **«Столбцы по статусам»** whose body invites you
to **enable the NEW design** ("…включите новый дизайн… Переключиться на старый
дизайн можно в любой момент") with a single **«Новый дизайн»** button.
Screenshot: `columns-popup-full.png` (+ clip `columns-popup.png`).

## Conclusion (§4-disciplined)

- The climart account runs the **OLD design**, which all our parity captures have
  targeted. In the old design **there is no column-customizer dropdown to mirror** —
  «Столбцы» is gated behind the new design.
- Our **default grid columns already match** the old-design grid (separately
  certified — list parity work, commit history).
- A loose earlier probe surfaced strings «Проведено» / «НДС» / «Цена включает НДС».
  These are **NOT cleanly grounded** as old-design column-picker options (they did
  not reproduce when «Столбцы» was clicked directly — that yields the promo modal).
  They most likely belong to the **new design's** column picker.

**Decision: DEFER — do NOT build speculative new-design-only columns.** This is the
§4 bug-class ("web-UI-only / other-design field → do not build speculative columns";
cf. Фасовка/Тип-учёта memory). Our default-column parity for the design the account
actually uses is intact. Revisit only if the user switches the account to the new
design and asks for the per-status column grouping + extra optional columns.

Captured by: `tools/capture/co-columns-final.mjs`, `co-toolbar-clip.mjs` (read-only).
