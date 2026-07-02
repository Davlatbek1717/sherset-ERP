# i18n Automation — Design Spec (2026-06-02)

## Problem

Document-form i18n is the dominant workstream (money→sales→purchase→inventory→production,
`docs/audits/modals-i18n-audit.md` §C). Across the 20 forms wired so far, ~75% of every form is
**deterministic, byte-identical** mechanical work, repeated by hand each session:

- A "chrome block" of ~12 keys is **byte-identical in 19/19 forms** (frequency-grep proven):
  `tDetailTabs('main'|'related')`, `tForm('tasks_section'|'add_task'|'tasks_after_save_hint'|
  'files_section'|'add_file'|'files_after_save_hint')`, `tFields('description')`,
  `tDetailHeader('role_primary')`.
- Common fields repeat: `tFields('organization')` 37×, `('project')` 36×, `('contract')` 31×, etc.
- Same structural transforms every form: import `useTranslations`, hooks block, move
  `STATUS_OPTIONS` inside the component + `tStates`, `documentTypeLabel`→`tDetailTitles`,
  `applicableHelp`→`t('applicable_help')`.
- Same 5 per-page keys added to each namespace × 2 catalogs (~190 manual JSON edits).
- Same gate suite (tc/biome/test/key-existence/grep) re-run by hand.
- Same 3-lens adversarial verify workflow **rewritten** per group (5 separate scripts).

**The bugs live in the other ~25% (form-specific).** Every blocker the adversarial verify caught
(supply mistranslation, inventories «Причина» mislabel) was in form-specific code, never in the
mechanical part. So the design **automates the safe 75%** and keeps **maximum human + adversarial
attention on the risky 25%**.

## Non-goals (deliberately excluded)

- **No full-autonomy pipeline.** Per-form human attention catches semantic bugs; "quality must not
  drop at all" (user mandate) argues for belt-and-suspenders.
- **No doc auto-update.** NEXT.md has an honesty gate to prevent the drift/inflation bug-class;
  auto-writing "done" claims works against quality. Docs stay human-authored.

## Core safety property

The codemod is **conservative by construction**: it only replaces a string for which it has an
**exact, unambiguous** mapping (from a verified dictionary whose keys are known to exist in ru+uz).
Anything it does not recognize, it **leaves untouched and reports** as residue. Its only failure mode
is *under-applies + reports*, never *applies wrong*. The existing grep-0-hardcoded gate (now a CI
test) catches anything left behind. ⇒ safe to run aggressively.

## Components

### 1. `scripts/i18n-wire.ts` — codemod (`pnpm i18n:wire <route>`)

Input: a route name (e.g. `processings`). Operates on `apps/web/src/app/(app)/<route>/new/page.tsx`.

**Learns from the `[id]` twin** (`<route>/[id]/page.tsx`) — the audited source of truth — to discover
the irregular per-form namespaces. (Verified necessary: `processings`→`pages.processing` singular,
`productions`→`pages.productions` plural — route→namespace is NOT 1:1.) Reads the twin's
`useTranslations('pages.X')` / `('states.Y')` declarations and its `tDetailTitles('Z')` call.

Steps (each conservative):
1. Add `import { useTranslations } from 'next-intl';` if missing.
2. Apply the **dictionary** of exact literal replacements (chrome + common fields + pickers +
   currency + overhead options + validation throws). Dictionary built from this session's ~40 proven
   mappings. Key principle: every target key is verified present in ru+uz before the dictionary
   admits it.
3. Move module-level `const STATUS_OPTIONS = [{label:'<hardcoded>'}...]` inside the component,
   converting labels to `tStates(value)` using the twin's states namespace; align states to the
   twin's FSM. (If the shape doesn't match the known pattern → leave + report.)
4. Insert the hooks block — exactly the hooks actually used after replacement (scan for `tFields(`,
   `tForm(`, … ) plus `t`/`tStates` from the twin's namespaces. Never inserts an unused hook (would
   be a lint error).
5. `documentTypeLabel="…"`→`tDetailTitles('<twin titleKey>')`; `applicableHelp`/`waitingHelp`→
   `t('applicable_help'|'waiting_help')` (only if those keys exist in the form's namespace, else
   report).
6. Emit a **`RESIDUE:` report** — every remaining Cyrillic/Uzbek-latin user-facing literal it did
   not transform, with line + snippet, for the human to handle.

Output: modified `/new` file + residue report. Idempotent (re-running is a no-op on already-wired
strings).

### 2. Vitest gates (permanent CI regression guards — the highest-quality item)

- `apps/web/src/__tests__/i18n-key-existence.test.ts` — scan every `t()` call in `(app)/**/*.tsx`,
  resolve hook→namespace, assert each key exists in **both** `ru.json` and `uz.json`. Closes the
  silent-wrong-key bug-class permanently (next-intl does not typecheck keys). Replaces the ad-hoc
  node script I write each session.
- `apps/web/src/__tests__/i18n-no-hardcoded.test.ts` — assert document `*/new` + `*/[id]` forms have
  zero hardcoded RU/UZ literals in `label=`/`placeholder=`/`title=`/`<option>`/throw/setError
  (allow-list: `—`, currency codes, comments, data-test-id, var()). Document-forms scope only (avoid
  false positives elsewhere).

Both run in the existing `pnpm test` (already a gate) + CI. No "did I remember to run it" risk.

### 3. `.claude/workflows/i18n-group-verify.js` — durable parametrized workflow

`Workflow({ name: 'i18n-group-verify', args: { group: 'production' } })`. Group→form-list registry
inside. 3 lenses (mislabel-vs-`[id]` / leftover-hardcoded / key-existence+parity) × each form,
pipelined. One stable artifact instead of rewriting `wf-<group>-verify.js` each time — keeps the
adversarial rigor from drifting.

## New process (per group)

```
pnpm i18n:wire <form>        # mechanical 75%, emits RESIDUE
→ human handles residue       # form-specific 25% (the part where bugs live)
→ pnpm test                   # gates incl. the 2 new i18n tests (auto)
→ Workflow i18n-group-verify  # 3-lens adversarial (unchanged rigor)
→ apply findings → commit + docs (human-authored)
```

Expected: ~20 hand-edits/form → ~4. Quality **identical** (improved by the permanent test gates).
Token ~halved. Adversarial verify + human residue pass unchanged.

## Validation plan (this task)

Build all 3, then **live-test on the production group** (processings, processing-orders, productions
— work-orders has no `/new` page). Success criteria: the codemod correctly auto-wires the mechanical
share; I handle only genuine form-specific residue; final gates (tc/biome/test incl. new i18n tests/
grep) green; the 3-lens adversarial verify finds no MORE issues than a hand-wired group would
(i.e. automation did not lower quality). Report the auto-wired % and any residue the codemod missed
that it *should* have caught (→ dictionary improvement).
