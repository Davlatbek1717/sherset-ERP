/**
 * i18n-wire — conservative codemod for document `/new` forms.
 *
 *   pnpm i18n:wire <route>        e.g.  pnpm i18n:wire processings
 *
 * Internationalises apps/web/src/app/(app)/<route>/new/page.tsx by applying a
 * dictionary of EXACT, verified mappings (chrome + common fields + pickers +
 * currency/overhead options + structural import/hooks/STATUS_OPTIONS). It LEARNS
 * the form's irregular namespaces (pages.X / states.Y / titleKey) from the
 * audited `[id]` twin — route→namespace is NOT 1:1 (processings → pages.processing).
 *
 * SAFETY: it only ever applies a known mapping; anything it does not recognise it
 * LEAVES and prints under `RESIDUE:` for a human to handle. Its only failure mode
 * is under-applying, never applying wrong. Re-running is idempotent.
 *
 * After running: handle the residue, then `pnpm test` (i18n gates) +
 * `Workflow i18n-group-verify`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const APP = join(ROOT, 'apps', 'web', 'src', 'app', '(app)');

// ───────────────────────── dictionary (exact substring replacements) ─────────
// Every target key is known to exist in ru.json + uz.json (verified across the
// money/sales/purchase/inventory groups). label="X" / placeholder="X" / title="X"
// are matched as substrings, so surrounding indentation does not matter.

const FIELD_LABELS: Record<string, string> = {
  Организация: "tFields('organization')",
  Склад: "tFields('store')",
  'Склад-источник': "tFields('store_from')",
  'Склад-получатель': "tFields('store_to')",
  Договор: "tFields('contract')",
  Проект: "tFields('project')",
  'Внешний код': "tDetailForm('external_code')",
  'Валюта документа': "tDetailForm('currency')",
  'Счёт контрагента': "tFields('agent_account')",
  'Счёт организации': "tFields('organization_account')",
  'Входящий номер': "tFields('incoming_number')",
  'Входящий №': "tFields('incoming_number')",
  'Входящая дата': "tFields('incoming_date')",
  Причина: "tFields('reason')",
  Себестоимость: "tFields('cost')",
  'Накладные расходы': "tDetailForm('overhead_sum')",
  'Распределять по': "tDetailForm('overhead_distribution')",
};

// placeholder/title source text (Uzbek or RU) → tForm/tFields call
const PICKER_PLACEHOLDERS: Record<string, string> = {
  'Tovar tanlang': "tForm('select_product')",
  'Tashkilot tanlang': "tForm('select_organization')",
  'Ombor tanlang': "tForm('select_store')",
  "Ta'minlovchi tanlang": "tForm('select_supplier')",
  'Shartnoma tanlang': "tForm('select_contract')",
  'Loyiha tanlang': "tForm('select_project')",
  Комментарий: "tFields('description')",
  Страна: "tFields('country')",
};

const PICKER_TITLES: Record<string, string> = {
  'Tashkilotni tanlash': "tForm('organization_picker_title')",
  'Omborni tanlash': "tForm('store_picker_title')",
  'Shartnoma tanlash': "tForm('contract_picker_title')",
  'Shartnomani tanlash': "tForm('contract_picker_title')",
  'Loyihani tanlash': "tForm('project_picker_title')",
  'Tovarni tanlash': "tForm('product_picker_title')",
  "Ta'minlovchini tanlash": "tForm('supplier_picker_title')",
  'Bank hisobini tanlash': "tForm('bank_account_picker_title')",
  'Kontragent hisobini tanlash': "tForm('agent_account_picker_title')",
};

// full <option> bodies (exact)
const OPTION_TEXT: Record<string, string> = {
  'сум (UZS)': "tForm('currency_uzs')",
  'доллар (USD)': "tForm('currency_usd')",
  'евро (EUR)': "tForm('currency_eur')",
  'руб (RUB)': "tForm('currency_rub')",
  'по весу': "tDetailForm('overhead_by_weight')",
  'по цене': "tDetailForm('overhead_by_price')",
  'по объёму': "tDetailForm('overhead_by_volume')",
  'по количеству': "tDetailForm('overhead_by_quantity')",
};

// chrome attribute titles
const CHROME_ATTR: Record<string, string> = {
  Задачи: "tForm('tasks_section')",
  Файлы: "tForm('files_section')",
  Vazifalar: "tForm('tasks_section')",
  Fayllar: "tForm('files_section')",
};

// chrome JSX-text + hint strings (exact literals, replaced as text nodes)
const CHROME_TEXT: Array<[string, string]> = [
  ['Vazifalarni hujjat saqlanganidan keyin qo’shish mumkin', "{tForm('tasks_after_save_hint')}"],
  ["Vazifalarni hujjat saqlanganidan keyin qo'shish mumkin", "{tForm('tasks_after_save_hint')}"],
  ['Fayllarni hujjat saqlanganidan keyin biriktirish mumkin', "{tForm('files_after_save_hint')}"],
];

interface Twin {
  pagesNs: string | null; // e.g. 'pages.processing'
  statesNs: string | null; // e.g. 'states.processing'
  titleKey: string | null; // e.g. 'processing'
}

function learnFromTwin(route: string): Twin {
  const twinPath = join(APP, route, '[id]', 'page.tsx');
  let src = '';
  try {
    src = readFileSync(twinPath, 'utf8');
  } catch {
    return { pagesNs: null, statesNs: null, titleKey: null };
  }
  const pages = src.match(/useTranslations\(\s*'(pages\.[a-z_]+)'\s*\)/);
  const states = src.match(/useTranslations\(\s*'(states\.[a-z_]+)'\s*\)/);
  const title = src.match(/tDetailTitles\(\s*'([a-z_]+)'\s*\)/);
  return {
    pagesNs: pages?.[1] ?? null,
    statesNs: states?.[1] ?? null,
    titleKey: title?.[1] ?? null,
  };
}

/** Replace label="X" / placeholder="X" / title="X" (single or double quoted). */
function replaceAttr(src: string, attr: string, dict: Record<string, string>): string {
  let out = src;
  for (const [text, call] of Object.entries(dict)) {
    for (const q of ['"', "'"]) {
      out = out.split(`${attr}=${q}${text}${q}`).join(`${attr}={${call}}`);
    }
  }
  return out;
}

function wire(route: string): { changed: boolean; residue: string[] } {
  const file = join(APP, route, 'new', 'page.tsx');
  const orig = readFileSync(file, 'utf8');
  let src = orig;
  const twin = learnFromTwin(route);

  // 1. import
  if (!src.includes("from 'next-intl'")) {
    src = src.replace(
      /(import .*from 'next\/navigation';\n)/,
      "import { useTranslations } from 'next-intl';\n$1",
    );
  }

  // 2. field labels (label="X")
  src = replaceAttr(src, 'label', FIELD_LABELS);
  // 3. placeholders + titles
  src = replaceAttr(src, 'placeholder', PICKER_PLACEHOLDERS);
  src = replaceAttr(src, 'title', { ...PICKER_TITLES, ...CHROME_ATTR });
  src = replaceAttr(src, 'documentTypeLabel', {}); // handled below

  // 4. <option> text bodies — >TEXT< → >{call}<
  for (const [text, call] of Object.entries(OPTION_TEXT)) {
    src = src.split(`>${text}<`).join(`>{${call}}<`);
  }

  // 5. chrome JSX text (Задача / Файл button labels + hints)
  src = src.replace(/(\/>\s*\n\s*)Задача(\s*\n\s*<\/Button>)/g, "$1{tForm('add_task')}$2");
  src = src.replace(/(\/>\s*\n\s*)Файл(\s*\n\s*<\/Button>)/g, "$1{tForm('add_file')}$2");
  src = src.replace(/(\/>\s*\n\s*)Vazifa(\s*\n\s*<\/Button>)/g, "$1{tForm('add_task')}$2");
  src = src.replace(/(\/>\s*\n\s*)Fayl(\s*\n\s*<\/Button>)/g, "$1{tForm('add_file')}$2");
  for (const [text, call] of CHROME_TEXT) {
    // <p ...>\n  TEXT\n</p>  →  <p ...>{call}</p>   (collapse the text node)
    const re = new RegExp(
      `(<p[^>]*>)\\s*\\n\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*(</p>)`,
      'g',
    );
    src = src.replace(re, `$1${call}$2`);
  }

  // 6. tab labels  label: 'Asosiy' / "Bog'liq hujjatlar"
  src = src.replace(/label:\s*'Asosiy'/g, "label: tDetailTabs('main')");
  src = src.replace(/label:\s*"Bog'liq hujjatlar"/g, "label: tDetailTabs('related')");

  // 7. documentTypeLabel / applicableHelp / waitingHelp / rightSlot fallback
  if (twin.titleKey) {
    src = src.replace(
      /documentTypeLabel="[^"]*"/g,
      `documentTypeLabel={tDetailTitles('${twin.titleKey}')}`,
    );
  }
  // applicableHelp / waitingHelp are deliberately NOT auto-replaced: their text is
  // often form-specific (e.g. productions «…ишлаб чиқариш бошланади») and blindly
  // genericising to t('applicable_help') would silently drop meaning. They surface
  // as residue (Cyrillic / «provedeno qiling») for the human to map correctly.
  src = src.replace(
    /user\.position \?\? 'Asosiy'/g,
    "user.position ?? tDetailHeader('role_primary')",
  );

  // 8. STATUS_OPTIONS: move module-level → inside component, labels → tStates(value)
  const statusMod = src.match(/const STATUS_OPTIONS = \[\s*([\s\S]*?)\];\n/);
  let statusInside = '';
  if (statusMod && twin.statesNs && /label:\s*['"][^'"{]/.test(statusMod[0])) {
    const items = [
      ...statusMod[1].matchAll(
        /\{\s*value:\s*'([a-z_]+)',\s*label:\s*['"][^'"]*['"],\s*color:\s*'([^']*)'/g,
      ),
    ];
    if (items.length) {
      const lines = items
        .map((m) => `    { value: '${m[1]}', label: tStates('${m[1]}'), color: '${m[2]}' },`)
        .join('\n');
      statusInside =
        `\n  // FSM mirrors ${route}/[id]; status is decorative on /new (API creates a draft).\n` +
        `  const STATUS_OPTIONS = [\n${lines}\n  ];\n`;
      src = src.replace(statusMod[0], ''); // remove module-level
    }
  }

  // 9. hooks block — exactly the hooks now used
  const HOOK_NS: Record<string, string> = {
    tFields: 'fields',
    tForm: 'form',
    tDetailForm: 'detail_form',
    tDetailTabs: 'detail_tabs',
    tDetailTitles: 'detail_titles',
    tDetailHeader: 'detail_header',
    tCommon: 'common',
    tErrors: 'errors',
  };
  const needed: string[] = [];
  if (twin.pagesNs && /\bt\(/.test(src))
    needed.push(`  const t = useTranslations('${twin.pagesNs}');`);
  if (twin.statesNs && (statusInside || /\btStates\(/.test(src)))
    needed.push(`  const tStates = useTranslations('${twin.statesNs}');`);
  for (const [hook, ns] of Object.entries(HOOK_NS)) {
    const re = new RegExp(`\\b${hook}\\(`);
    const alreadyDeclared = new RegExp(`const ${hook} = useTranslations`).test(src);
    if (re.test(src) && !alreadyDeclared)
      needed.push(`  const ${hook} = useTranslations('${ns}');`);
  }
  if (needed.length || statusInside) {
    // insert after `const { user } = useAuth();` (all these forms have it)
    src = src.replace(
      /(const \{ user \} = useAuth\(\);\n)/,
      `$1${needed.join('\n')}${needed.length ? '\n' : ''}${statusInside}`,
    );
  }

  const changed = src !== orig;
  if (changed) writeFileSync(file, src, 'utf8');

  // 10. residue scan — remaining Cyrillic / Uzbek markers (excl. comments)
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, (_m, p1) => p1);
  const UZ = [
    'tanlang',
    'tanlash',
    'Yangi kontragent',
    'Yangi loyiha',
    "qo'shing",
    'kutyapmiz',
    'provedeno qiling',
    'Hujjatni saqlang',
    'Avval ',
  ];
  const residue: string[] = [];
  stripped.split('\n').forEach((line, i) => {
    if (/[А-Яа-яЁё]/.test(line) || UZ.some((m) => line.includes(m))) {
      residue.push(`  ${route}/new/page.tsx:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
  return { changed, residue };
}

// ───────────────────────── main ─────────────────────────
const route = process.argv[2];
if (!route) {
  console.error('usage: pnpm i18n:wire <route>   (e.g. processings)');
  process.exit(1);
}
const twin = learnFromTwin(route);
console.log(`i18n-wire ${route}`);
console.log(
  `  twin namespaces: pages=${twin.pagesNs} states=${twin.statesNs} title=${twin.titleKey}`,
);
const { changed, residue } = wire(route);
console.log(`  ${changed ? 'WROTE' : 'no change'} ${route}/new/page.tsx`);
if (residue.length) {
  console.log(
    `\nRESIDUE (${residue.length} line(s) — handle by hand: form-specific labels, throws, etc.):`,
  );
  console.log(residue.join('\n'));
} else {
  console.log('\nRESIDUE: none — form fully wired by the dictionary.');
}
