export const meta = {
  name: 'modal-audit-discover',
  description: 'Fact-gather for per-modal field audit: CatalogPicker leak completeness, call-site blast radius, moysklad reference labels, other-modal leak scan',
  phases: [{ title: 'Discover', detail: '4 parallel fact-gatherers — leak inventory, call sites, reference labels, other-modal scan' }],
}

// Per-modal field audit — discovery phase. The dominant finding (already
// hand-verified) is the CatalogPicker design-system Uzbek-default leak
// (same bug-class fixed for Modal/ConfirmDialog/EditForm/PositionEditor via
// a root-injected labels provider). This workflow gathers the remaining
// facts so the fix is complete and parity-correct before any code changes.

const CTX = `PROJECT: moysklad.uz 1:1 clone (Uzbekistan ERP), Next.js web app at apps/web,
shared design-system at packages/design-system (imported as @moysklad/ui).
i18n: next-intl, two locales — ru (apps/web/src/messages/ru.json) + uz (uz.json).
Default UI locale shown to users = RU (must match moysklad.uz exactly).

BUG-CLASS under audit: design-system components ship HARDCODED UZBEK defaults
(string literals or default prop values) that LEAK into the RU UI whenever the
caller does not pass an explicit label. Already fixed this way: Modal
(ModalLabelsProvider), ConfirmDialog (ConfirmProvider defaultLabels), EditForm
(useEditFormLabels), PositionEditor (usePositionEditorLabels). Fix pattern =
a React context provider wired at apps/web/src/app/layout.tsx that injects RU
strings from getTranslations(); the design-system keeps the Uzbek hard fallback
for callers outside the provider (tests/storybook). Resolve order is
explicit-prop -> injected-context -> Uzbek-fallback.

A user-visible string is a LEAK if it is Uzbek (or Russian hardcoded) AND
rendered to the user AND not coming from a t() call / labels prop. NEUTRAL
(not a leak): icon-only literals, email examples like "cc@example.com",
technical tokens (URLs, CREATE/UPDATE/DELETE, entity slugs like 'customerorder',
"(HTML)"), CSS/var() strings.`

phase('Discover')

const [leakInventory, callSites, reference, otherModals] = await parallel([
  // 1 — adversarial completeness check on CatalogPicker (I already found ~12;
  //     this independently confirms NOTHING is missed).
  () => agent(
    `${CTX}

TASK: Exhaustively inventory EVERY user-visible string in
packages/design-system/src/patterns/CatalogPicker.tsx. This file exports TWO
components: CatalogPicker (the search dialog) and CatalogPickerField (the
input-like opener button). Read the whole file.

For EACH user-visible string (default prop value OR hardcoded JSX literal OR
aria-label), record: line number, the exact text, whether it is a prop-default
or a hardcoded-literal or via-t, whether it is a LEAK (Uzbek/Russian hardcoded
shown to user), whether it is currently OVERRIDABLE by a caller prop, and a
suggested i18n approach (reuse an existing common.* key if obvious — e.g.
common.loading="Загрузка...", common.cancel="Отмена", common.close="Закрыть",
common.search="Поиск", common.no_results="Ничего не найдено", common.create=
"Создtь" — otherwise propose a new catalog_picker.* key).

Be exhaustive — the goal is that NOTHING leaks after the fix. Include the close
"X" aria-label, the loading text, the empty-state title+description, the footer
clear+cancel buttons, the create button, AND in CatalogPickerField: the
placeholder, the clear aria, the chevron/pick aria, the create aria.`,
    { label: 'leak:CatalogPicker', phase: 'Discover', schema: {
      type: 'object', additionalProperties: false,
      properties: {
        component: { type: 'string' },
        strings: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            line: { type: 'number' },
            text: { type: 'string' },
            kind: { type: 'string', enum: ['prop-default', 'hardcoded-literal', 'via-t', 'other'] },
            isLeak: { type: 'boolean' },
            overridable: { type: 'boolean' },
            suggestion: { type: 'string' },
          },
          required: ['line', 'text', 'kind', 'isLeak', 'overridable', 'suggestion'],
        } },
        totalLeaks: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['component', 'strings', 'totalLeaks', 'notes'],
    } },
  ),

  // 2 — blast radius: every call site + whether it's under the root provider.
  () => agent(
    `${CTX}

TASK: Map the blast radius of the CatalogPicker / CatalogPickerField Uzbek-leak
fix. Search apps/web/src (and packages/design-system/src for MassEditModal which
embeds CatalogPickerField) for ALL usages of <CatalogPicker> and
<CatalogPickerField> (and the MassEditModal which renders CatalogPickerField).

For each call site report: file path, the component used, and which of the
leak-prone props it explicitly passes (searchPlaceholder, createLabel,
emptyTitle, emptyDescription, placeholder, createLabel) vs relies on the default.

CRITICAL question: is EVERY call site rendered inside the apps/web/src/app/
layout.tsx provider tree (which is where ModalLabelsProvider/ConfirmProvider are
wired)? Specifically check whether there is any usage under a SEPARATE root
layout or outside (app)/ — e.g. POS (components/pos), a (pos) route group,
storybook, or any standalone layout.tsx — that would NOT receive a root-injected
CatalogPickerLabelsProvider. List any such "outside the provider tree" files.

Also: does any caller intentionally pass an Uzbek string for these props (which
would mean RU parity is already broken at that call site too)?`,
    { label: 'callsites:CatalogPicker', phase: 'Discover', schema: {
      type: 'object', additionalProperties: false,
      properties: {
        callSites: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            file: { type: 'string' },
            component: { type: 'string' },
            propsPassed: { type: 'array', items: { type: 'string' } },
            underRootProvider: { type: 'boolean' },
          },
          required: ['file', 'component', 'propsPassed', 'underRootProvider'],
        } },
        outsideProviderTree: { type: 'array', items: { type: 'string' } },
        callersPassingUzbek: { type: 'array', items: { type: 'string' } },
        rootLayoutCount: { type: 'number' },
        summary: { type: 'string' },
      },
      required: ['callSites', 'outsideProviderTree', 'callersPassingUzbek', 'summary'],
    } },
  ),

  // 3 — moysklad reference labels + the task «Тип задачи» parity question.
  () => agent(
    `${CTX}

TASK: Find moysklad's authoritative RU labels for two things, using the captured
reference under docs/moysklad-reference/ (visual-captures/*/dom/*.html are real
moysklad DOM snapshots; also <module>/detail/*.html). Use ripgrep on those dirs.

(A) The catalog/entity PICKER dialog moysklad shows when you click a reference
field (Контрагент / Проект / Товар / Сотрудник pickers, "Выбрать из справочника").
Find the RU text for: the search input placeholder, the create/add action, the
empty-state ("nothing found") text, the loading text, a clear action, the
field placeholder shown before selection. Report each value you can find with
its source file. If a label is not in the captures, say so and give the
moysklad-standard RU term from domain knowledge (mark source="domain").

(B) moysklad's «Создание задачи» (task create) modal — does it have a "Тип
задачи" (task type) selector field? Our clone's task-create modal adds a
<select> "Тип задачи". Determine from the reference DOM (search for "Задач",
"Создание задачи", task tab captures *-edit-tab-tasks.html) whether moysklad's
task create form has a type field, and what the field set / order is
(Описание, Срок, Выполнена, Исполнитель, ...). Report evidence + a verdict:
is "Тип задачи" moysklad-parity, our-superset, or unknown.`,
    { label: 'reference:picker+task', phase: 'Discover', schema: {
      type: 'object', additionalProperties: false,
      properties: {
        pickerLabels: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            slot: { type: 'string' },
            ruValue: { type: 'string' },
            source: { type: 'string' },
          },
          required: ['slot', 'ruValue', 'source'],
        } },
        taskTypeVerdict: { type: 'string', enum: ['moysklad-parity', 'our-superset', 'unknown'] },
        taskFieldSet: { type: 'array', items: { type: 'string' } },
        taskEvidence: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['pickerLabels', 'taskTypeVerdict', 'taskFieldSet', 'taskEvidence', 'notes'],
    } },
  ),

  // 4 — other-modal leak scan (completeness across the whole modal surface).
  () => agent(
    `${CTX}

TASK: Scan these modal/dialog components for any remaining hardcoded-Uzbek (or
hardcoded-Russian) user-visible LEAK — strings NOT coming from a t() call or a
labels prop, that are not neutral (see NEUTRAL rules above). Read each file.

FILES:
- apps/web/src/components/task-create-modal.tsx
- apps/web/src/components/send-email-dialog.tsx   (NOTE: lines ~79-81 build
  validation errors as \`\${t('to')} majburiy\` — "majburiy" is a hardcoded
  Uzbek leak; confirm and find ALL such concatenations)
- apps/web/src/app/(app)/settings/webhooks/webhook-dialog.tsx
- packages/design-system/src/patterns/MassEditModal.tsx
- apps/web/src/app/(app)/settings/attributes/attribute-metadata-dialog.tsx
- apps/web/src/components/pos/payment-dialog.tsx
- apps/web/src/app/(app)/hr/employees/_components/employee-modal.tsx
- apps/web/src/app/(app)/hr/employees/_components/set-password-modal.tsx
- apps/web/src/app/(app)/hr/attendance/_components/check-in-modal.tsx
- apps/web/src/app/(app)/hr/attendance/_components/edit-attendance-modal.tsx
- apps/web/src/app/(app)/hr/tasks/_components/template-modal.tsx
- apps/web/src/app/(app)/hr/my-tasks/_components/answer-modal.tsx
- apps/web/src/app/(app)/hr/review/_components/review-modal.tsx

For each file: report useTranslations count (grep), and a list of any leaks
(line, exact text, whether overridable). If a file is fully clean, say so
explicitly. Flag any file that is ENTIRELY hardcoded (0 useTranslations and
visible Uzbek/Russian) as a high-priority full-i18n target.`,
    { label: 'scan:other-modals', phase: 'Discover', schema: {
      type: 'object', additionalProperties: false,
      properties: {
        files: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            file: { type: 'string' },
            useTranslationsCount: { type: 'number' },
            fullyHardcoded: { type: 'boolean' },
            leaks: { type: 'array', items: {
              type: 'object', additionalProperties: false,
              properties: {
                line: { type: 'number' },
                text: { type: 'string' },
                overridable: { type: 'boolean' },
              },
              required: ['line', 'text', 'overridable'],
            } },
            clean: { type: 'boolean' },
          },
          required: ['file', 'useTranslationsCount', 'fullyHardcoded', 'leaks', 'clean'],
        } },
        highPriorityTargets: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
      },
      required: ['files', 'highPriorityTargets', 'summary'],
    } },
  ),
])

return { leakInventory, callSites, reference, otherModals }
