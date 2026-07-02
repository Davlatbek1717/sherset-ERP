# Document «Номер» format rollout — moysklad parity

**Origin (2026-06-18):** the user asked "why is our № lettered («ЗК-2026-00062») not a plain number?"
moysklad numbers documents with a plain/padded integer — NO `PREFIX-YEAR-` prefix. Our app hand-builds a
`«XX-${year}-»` prefix + `padStart(5)` in every `nextXxxName` generator (~25 of them, all via
`apps/api/src/prisma/document-number.ts` `allocateDocumentNumber`).

## RULE (grounded live on climart, 6 samples 2026-06-18) — 5-digit zero-pad, PO is the exception

Formats DIFFER per doc type — but a clear rule emerged after sampling 6 lists:

| doc | climart № | format |
|---|---|---|
| purchase-orders `#purchaseorder` | «999, 998, 997» | **PLAIN** (no pad) — the ONLY exception |
| customer-orders `#customerorder` | «03832, 02431» | 5-digit ZERO-PADDED |
| demand (Отгрузки) `#demand` | «09635, 09634» | 5-digit ZERO-PADDED |
| supply (Приёмки) `#supply` | «00772, 00771» | 5-digit ZERO-PADDED |
| move (Перемещения) `#move` | «00483, 00482» | 5-digit ZERO-PADDED |
| cash-in (ПКО) `#cashin` | «00063, 00062» | 5-digit ZERO-PADDED |

**→ Default for EVERY doc type = `padStart(5,'0')`, no prefix, year-less counter key. Purchase-orders is
the lone PLAIN one (already done).** Unchecked types are assumed 5-pad on this strong pattern; re-ground
any that look off (invoice-out's climart list was empty, couldn't read). All have NO `PREFIX-YEAR-`.

## DONE

| doc type | commit | moysklad format | fix |
|---|---|---|---|
| purchase-orders (ЗК-) | `5dfcb681` | plain «999» | `String(n)`, year-less key, renumber 2143 → 1..N |
| customer-orders (ЗП-) | `df9f9bc3` | 5-digit «03832» | `padStart(5)`, year-less key, renumber 20476 → 1..N |

## PER-TYPE PROCESS (repeat for each remaining type)

1. **Ground** — log into climart, open the doc-type list, read the «Номер» column. Note: prefix (usually
   none), padding width (none / 5 / other), continuous vs year-reset.
2. **Generator** — in `<type>.service.ts` `nextXxxName`: drop the `«XX-${year}-»` prefix, set a year-less
   counter key (`'<entitytype>'`), apply the grounded padding (`String(n)` plain, or `padStart(W,'0')`),
   and make `seed()` read the max pure-numeric name.
3. **List orderBy** — add the `{ id: dir }` deterministic tie-breaker (mirror PO/CO) so same-date rows read
   in clean descending «Номер».
4. **Migration** — one-off dev-DB renumber to a clean 1..N sequence by (moment, id), in the grounded
   format. **Two-phase** (temp `__tmp_${id}` names first, then final) to dodge the `(accountId, name)`
   unique constraint. Back up names to `apps/api/scratch-<type>-names-backup.json` first. Point the
   `DocumentSequence` counter at the max. (Existing data is MESSY — mixed formats, outliers like a 12-digit
   CO number, QA names — so a full renumber is cleaner than trying to strip prefixes.)
5. **Cert** — live :3100: list shows the grounded format, descending, no prefix. Run the type's tests.
6. ⚠️ A backend-only edit may need a `pnpm dev` restart — tsx-watch missed the PO orderBy reload until a
   restart (kill the turbo tree + relaunch).

## REMAINING ~23 generators (file : current prefix) — grep `prefix = \`...-${year}\`` in apps/api/src/modules

inventory `ИН-` · work-order `ТЗ-` · move `ПЕ-` · internal-order `IO-` · facture-in `СФП-` ·
facture-out `СФ-` · opportunity `СД-` · prepayment-return `PRR-` · processing-order `PO-` · enter `ОП-` ·
prepayment `PR-` · payroll `Z-` · sales-return `ВП-` · supply `ПР-` · payment-out `ПР-` · loss `СП-` ·
counterparty-adjustment `KV-` · payment-in `ПП-` · invoice-out `СЧ-` · processing `TP-` · invoice-in ·
demand · production · retail-related · service-request — (re-grep for the full list before starting).

**Scale note:** each type is a ground + generator + renumber-migration + cert. CO alone was a 20476-row
migration. This is a multi-session initiative — do a few types per focused session, grounding each.
