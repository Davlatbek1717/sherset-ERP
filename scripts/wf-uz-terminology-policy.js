export const meta = {
  name: 'uz-terminology-policy',
  description: 'Ground the #20 Uzbek-locale terminology decision in real Uzbek accounting/tax standards + a full codebase inventory, then synthesize a professional glossary decision matrix',
  phases: [
    { title: 'Research+Inventory', detail: '3 web-research agents (soliq/didox/faktura.uz, 1C UZ, business-language norms) + 1 codebase variant inventory' },
    { title: 'Synthesize', detail: 'Opus-level decision matrix: concept → chosen UZ term + rationale + confidence + scale' },
  ],
}

// ---- Schemas ---------------------------------------------------------------

const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings', 'overall_norm', 'summary'],
  properties: {
    overall_norm: {
      type: 'string',
      description: 'One-sentence verdict: in professional Uzbek accounting UIs, is the norm Russian-loanword transliteration, proper literary Uzbek, or a mix? Cite the strongest evidence.',
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ru_term', 'recommended_uz', 'alternatives', 'evidence', 'confidence'],
        properties: {
          ru_term: { type: 'string', description: 'Russian source term, e.g. «Счёт», «Счёт-фактура», «Отгрузка», «Провести/Проведён», «Покупатель», «Накладная»' },
          recommended_uz: { type: 'string', description: 'The professional Uzbek term you recommend, based on the sources' },
          alternatives: { type: 'string', description: 'Other UZ forms seen, and why rejected/weaker' },
          evidence: { type: 'string', description: 'Concrete source(s): which platform/site/doc uses this term (didox.uz, faktura.uz, soliq.uz, 1C UZ, etc.) — quote if possible' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const INVENTORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts', 'summary'],
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['concept_ru', 'variants', 'total_occurrences', 'inconsistency'],
        properties: {
          concept_ru: { type: 'string' },
          variants: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['uz_value', 'count', 'sample_keys', 'maps_to_ru'],
              properties: {
                uz_value: { type: 'string', description: 'The distinct UZ word/spelling used (e.g. schyot, hisob, otgruzka, jo’natish, provedeno, o’tkazildi)' },
                count: { type: 'number' },
                sample_keys: { type: 'string', description: '2-3 example dotted key paths + file:line' },
                maps_to_ru: { type: 'string', description: 'The RU value the sibling key holds (to confirm the referent)' },
              },
            },
          },
          total_occurrences: { type: 'number' },
          inconsistency: { type: 'string', description: 'Is this concept currently consistent or split across variants? Describe the split.' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['policy_principle', 'decisions', 'execution_notes'],
  properties: {
    policy_principle: { type: 'string', description: 'The one-paragraph guiding principle for the UZ locale terminology (transliteration vs proper Uzbek vs principled hybrid), justified by the research.' },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['concept_ru', 'chosen_uz', 'rejected', 'rationale', 'confidence', 'est_occurrences', 'locale_scope', 'risk'],
        properties: {
          concept_ru: { type: 'string' },
          chosen_uz: { type: 'string' },
          rejected: { type: 'string', description: 'Variants rejected + why' },
          rationale: { type: 'string', description: 'Why this is the most professional choice (tie research evidence + codebase reality + ambiguity considerations)' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          est_occurrences: { type: 'number', description: 'Approx # of strings to change to enforce this decision' },
          locale_scope: { type: 'string', enum: ['uz-only', 'both-locales'], description: 'uz-only if RU anchor is already correct; both-locales if RU itself needs fixing' },
          risk: { type: 'string', description: 'Any ambiguity, collision, or referent-verification needed before sweeping' },
        },
      },
    },
    execution_notes: { type: 'string', description: 'Suggested order of sweeps (lowest-risk first), what needs route/referent verification, what needs adversarial 3-lens.' },
  },
}

// ---- Phase 1: Research + Inventory (barrier — synthesis needs all) ---------

phase('Research+Inventory')

const CONTESTED = '«Счёт» (invoice/bill for payment, the invoices-out doc) · «Счёт-фактура» (VAT tax invoice / ЭСФ, the separate factures doc) · «Отгрузка»/«Реализация» (goods shipment to customer, the demands doc) · «Провести»/«Проведён»/«Проведение» (post/posting a document) · «Покупатель» vs «Клиент» (buyer vs client) · «Накладная» (waybill) · «Оприходование» (goods receipt/enters) · «Списание» (write-off/losses)'

const research = await parallel([
  () => agent(
    `You are a domain expert on Uzbekistan e-invoicing and tax accounting terminology. Research the OFFICIAL / professional Uzbek-language terms used by Uzbekistan's real e-invoicing & tax platforms: soliq.uz / my.soliq.uz (ЭСФ — электрон счёт-фактура), didox.uz, faktura.uz, e-fakt, and the State Tax Committee.

Use WebSearch + WebFetch (load them via ToolSearch: query "select:WebSearch,WebFetch"). Search in Uzbek and Russian, e.g.: "didox.uz hisob-faktura", "faktura.uz schyot", "soliq.uz elektron hisob-faktura", "ЭСФ uzbek hisob-faktura", "didox shartnoma akt hisob-faktura", "yuk xati nakladnaya uzbek".

For EACH of these concepts, determine the term the Uzbek platforms actually use: ${CONTESTED}.

KEY question to resolve precisely: in Uzbek e-invoicing, «Счёт-фактура» = «hisob-faktura» (the ЭСФ tax document). But what is «Счёт» (a plain payment invoice / счёт на оплату, NOT the VAT doc) called — «schyot», «hisob», «to'lov hisobi», or something else? They are DIFFERENT documents and must have DIFFERENT Uzbek names. Confirm with evidence.

Return per the schema. Be concrete: name the platform and quote the term where you can. If a term cannot be verified, mark confidence low rather than guessing.`,
    { label: 'research:e-invoicing', phase: 'Research+Inventory', schema: RESEARCH_SCHEMA },
  ),
  () => agent(
    `You are an expert on accounting-software localization for the Uzbek market. Research how professional Uzbek accounting / ERP software localizes Russian accounting terms — especially 1C:Предприятие Uzbek localization, Uzbek versions of warehouse/trade systems, and how they handle the action verbs and document types.

Use WebSearch + WebFetch (load via ToolSearch: query "select:WebSearch,WebFetch"). Search e.g.: "1C uzbek lokalizatsiya hujjatni o'tkazish", "provesti dokument uzbek o'tkazish", "otgruzka uzbek jo'natish realizatsiya", "ombor dasturi uzbek hisob-faktura schyot", "buxgalteriya dasturi o'zbek tilida".

For EACH concept, report the localization norm and the specific Uzbek term: ${CONTESTED}.

Focus especially on the contested action/document terms: «Провести/Проведён» (post a document — is it «o'tkazish/o'tkazildi» or transliterated «provedeno»?), «Отгрузка» (is it «jo'natish/jo'natma», «yuk berish», or «otgruzka»?), «Покупатель» («xaridor» or «mijoz»?), «Накладная» («yuk xati» or «nakladnaya»?).

Return per the schema. Distinguish what is the PROFESSIONAL norm from what is merely colloquial. Mark confidence honestly.`,
    { label: 'research:1c-localization', phase: 'Research+Inventory', schema: RESEARCH_SCHEMA },
  ),
  () => agent(
    `You are a linguist specializing in modern Uzbek business/technical language register. The question: for a professional B2B accounting/inventory web app aimed at Uzbek SMEs (a moysklad.uz clone), is the appropriate register (a) Russian-accounting loanwords transliterated to Latin (schyot, otgruzka, provedeno, nakladnaya), (b) proper literary Uzbek (hisob, jo'natma, o'tkazildi, yuk xati), or (c) a principled mix?

Use WebSearch + WebFetch (load via ToolSearch: query "select:WebSearch,WebFetch"). Consider: Uzbek government/tax language policy, the bilingual reality of Uzbek accountants, what modern Uzbek fintech/SaaS UIs actually ship (e.g. Uzum, Payme, Click, didox), and readability/recognizability tradeoffs.

For EACH concept give your register recommendation: ${CONTESTED}. Also give an OVERALL norm verdict.

Be decisive but evidence-based. The goal is the MOST PROFESSIONAL choice for a shipping product — neither slavish transliteration nor academic purism if that harms usability. Return per the schema.`,
    { label: 'research:register', phase: 'Research+Inventory', schema: RESEARCH_SCHEMA },
  ),
  () => agent(
    `You are auditing an existing i18n message catalog. Inventory the CURRENT Uzbek-term variants for each contested accounting concept in this repo.

Files: apps/web/src/messages/uz.json (Uzbek) and apps/web/src/messages/ru.json (Russian, the parity anchor — same key structure). Use Grep + Read.

For EACH concept below, find ALL distinct Uzbek spellings/words currently used, with occurrence counts and 2-3 sample dotted-key paths (file:line), and the RU value the sibling key holds (to confirm the referent):
${CONTESTED}

Concrete things to grep for (case-insensitive, both spellings):
- Счёт axis: "schyot", "hisob" (careful: hisob also = report/account), "hisob-faktura", "schyot-faktura", "faktura"
- Отгрузка axis: "otgruzka", "jo’natish"/"jo'natish", "jo’natma", "yuborish", "yuk berish", "yuk xati", "realizatsiya", "sotuv"
- Провести axis: "provedeno", "provesti", "o’tkaz"/"o'tkaz" (o'tkazildi/o'tkazish/o'tkazilgan), "tasdiq" (confirm — different!), check ru.json "Провед"/"Провести"
- Покупатель axis: "mijoz", "xaridor", "haridor"; Клиент → "mijoz"/"klient"
- Накладная: "nakladnaya", "yuk xati", "yuk hujjati"
- Оприходование (enters): current uz term; Списание (losses): current uz term
- Also report the «Provedeno» total count specifically (it is a known ~91-occurrence item).

For each concept note whether it is currently CONSISTENT or SPLIT across variants. Return per the schema. Do NOT change any files — read-only inventory.`,
    { label: 'inventory:uz-variants', phase: 'Research+Inventory', schema: INVENTORY_SCHEMA, agentType: 'Explore' },
  ),
])

const [eInvoicing, localization, register, inventory] = research

// ---- Phase 2: Synthesize ---------------------------------------------------

phase('Synthesize')

const decision = await agent(
  `You are the lead localization architect making the FINAL Uzbek-locale terminology policy for a moysklad.uz clone (Uzbek SME accounting/inventory app). The user delegated this decision and asked for "the most professional" result. RU is the parity anchor (byte-exact to moysklad); UZ is the localization under decision.

You have three research reports and one codebase inventory. Reconcile them into a single, coherent, professional terminology decision matrix.

=== RESEARCH: Uzbek e-invoicing / tax platforms ===
${JSON.stringify(eInvoicing, null, 2)}

=== RESEARCH: 1C / accounting-software localization ===
${JSON.stringify(localization, null, 2)}

=== RESEARCH: business-language register ===
${JSON.stringify(register, null, 2)}

=== CODEBASE INVENTORY (current UZ variants) ===
${JSON.stringify(inventory, null, 2)}

Produce a DECISION per the schema. Hard requirements:
1. ONE term per concept (consistency is non-negotiable — call out every current split).
2. «Счёт» and «Счёт-фактура» MUST get distinct Uzbek names (they are different documents). If research confirms «Счёт-фактура»=«hisob-faktura» (ЭСФ), then «Счёт» must be something else (likely «schyot») to preserve the distinction — justify.
3. Prefer the choice that is genuinely most professional for a shipping Uzbek product: weight (a) what real Uzbek tax/e-invoicing platforms use, (b) consistency, (c) recognizability for bilingual Uzbek accountants, (d) avoiding ambiguous collisions (e.g. «hisob» alone = account/report/calculation).
4. For each decision, set locale_scope: "uz-only" if the RU anchor is already correct (only UZ needs changing), "both-locales" if RU itself is wrong/inconsistent.
5. Give est_occurrences (from the inventory) and flag anything that needs route/referent verification before a blind sweep.
6. In execution_notes, propose a sweep ORDER (lowest-risk, highest-consistency-win first) and which sweeps need adversarial 3-lens verification.

Be decisive. Where research conflicts, make the call and explain. This matrix will be written into docs/i18n-uz-terminology.md and drive the actual sweeps.`,
  { label: 'synthesize:decision-matrix', phase: 'Synthesize', schema: DECISION_SCHEMA },
)

return { eInvoicing, localization, register, inventory, decision }
