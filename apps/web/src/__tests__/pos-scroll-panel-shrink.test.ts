import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SCROLL PANELI QO'RIQCHISI (2026-08-17, egasi: «chekni scrol qilib bo'lmayapti»).
 *
 * 🔴 O'LCHANGAN XATO SINFI: `overflow-y-auto` + `flex flex-col` konteynerda
 * farzandlar sukut bo'yicha `flex-shrink: 1` bilan turadi, ya'ni kontent
 * sig'maganda OSHIB CHIQMAYDI — EZILADI. Chek detali panelida jonli brauzerda
 * o'lchandi: pozitsiyalar bloki 71,7px dan **4,3px** ga qisilib,
 * `scrollHeight === clientHeight` bo'lib qolgan ⇒ scroll umuman paydo
 * bo'lmagan va kassir chekning qolganini ko'ra olmagan.
 * `[&>*]:shrink-0` bilan: 186 → 254px, scroll ishlaydi (o'lchandi).
 *
 * 🔴 NEGA STATIK QO'RIQCHI: jsdom LAYOUTNI hisoblamaydi (`clientHeight` doim 0),
 * ya'ni bu xatoni komponent testi PRINSIPIAL ravishda tutolmaydi. Shuning uchun
 * qoida manba matnida qulflanadi — repodagi i18n-registri bilan bir uslub.
 *
 * Qoida: scroll qiladigan ustunli flex konteyner YO `[&>*]:shrink-0` bo'lsin,
 * YO `space-y-*` ishlatsin (u flex emas, margin bilan oraliq beradi).
 */

const REPO = resolve(__dirname, '..', '..', '..', '..');

/**
 * HOZIRCHA TUZATILMAGANLAR — ataylab ro'yxatda (jim qolib ketmasin).
 *
 * Bular POS'dan tashqaridagi yoki `max-h-*` bilan cheklangan RO'YXAT
 * konteynerlari: qatorlari kichik va bir xil balandlikda, shuning uchun
 * ezilish ko'rinmaydi. Ular tuzatilganda shu ro'yxatdan olib tashlanadi —
 * ro'yxat qisqarishi kerak, o'sishi EMAS.
 */
const KNOWN_UNFIXED = new Set<string>([
  // Ro'yxat FAYL darajasida — qator raqami tahrirda siljiydi va qo'riqchi
  // soxta qizarardi.
  'apps/web/src/app/(app)/cell/[code]/page.tsx',
  'apps/web/src/app/(app)/hr/schedules/_components/schedule-form-modal.tsx',
  'apps/web/src/app/(app)/scan/[id]/page.tsx',
  // cheklar-mode DETAL paneli tuzatildi; bu yerdagi qoldiq — chap RO'YXAT
  // konteyneri (qatorlari bir xil balandlikda).
  'apps/web/src/app/(app)/sotuv/_components/cheklar-mode.tsx',
  'apps/web/src/app/(app)/sotuv/_components/zakazlar-mode.tsx',
  'apps/web/src/components/customer-orders/kanban-board.tsx',
  // cash-out-dialog: asosiy forma tuzatildi, qoldiq — `max-h-40` ro'yxati.
  'apps/web/src/components/pos/cash-out-dialog.tsx',
  'apps/web/src/components/pos/cashier-select-screen.tsx',
  'apps/web/src/components/pos/customers-panel.tsx',
  'apps/web/src/components/pos/pos-sidebar.tsx',
  'apps/web/src/components/stores/cell-contents-modal.tsx',
  'apps/web/src/components/stores/cell-count-modal.tsx',
  'apps/web/src/components/stores/cell-move-target-modal.tsx',
  'apps/web/src/components/stores/cell-scan-bind-modal.tsx',
]);

interface Hit {
  file: string;
  line: number;
  cls: string;
}

function scan(): Hit[] {
  const files = execSync('git ls-files "apps/web/src/**/*.tsx"', { cwd: REPO })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  const hits: Hit[] = [];
  for (const f of files) {
    const src = readFileSync(resolve(REPO, f), 'utf8');
    const re = /className="([^"]*)"/g;
    let m = re.exec(src);
    while (m !== null) {
      const cls = m[1] ?? '';
      const scrolls = /\boverflow-y-auto\b|\boverflow-auto\b/.test(cls);
      const colFlex = /\bflex\b/.test(cls) && /\bflex-col\b/.test(cls);
      const guarded = /\[&>\*\]:shrink-0/.test(cls) || /\bspace-y-/.test(cls);
      if (scrolls && colFlex && !guarded) {
        hits.push({
          file: f.replace(/\\/g, '/'),
          line: src.slice(0, m.index).split('\n').length,
          cls,
        });
      }
      m = re.exec(src);
    }
  }
  return hits;
}

describe('POS scroll panellari — farzandlar QISILMASIN (2026-08-17)', () => {
  const hits = scan();

  it('yangi `overflow-y-auto` + `flex-col` konteyner shrink-qo`riqchisiz qo`shilmaydi', () => {
    const unexpected = hits.filter(
      (h) => !KNOWN_UNFIXED.has(`${h.file}:${h.line}`) && !KNOWN_UNFIXED.has(h.file),
    );
    const detail = unexpected.map((h) => `${h.file}:${h.line}  «${h.cls}»`).join('\n');
    expect(
      unexpected,
      `Scroll qiladigan ustunli flex konteynerga \`[&>*]:shrink-0\` qo'shing (yoki \`space-y-*\` ishlating) — aks holda kontent sig'maganda EZILADI va scroll paydo bo'lmaydi:\n${detail}`,
    ).toEqual([]);
  });

  it('chek detali paneli tuzatilgan holda QOLADI (regressiya qulfi)', () => {
    const src = readFileSync(
      resolve(REPO, 'apps/web/src/app/(app)/sotuv/_components/cheklar-mode.tsx'),
      'utf8',
    );
    // Egasi xabar qilgan aynan shu konteyner.
    expect(src).toContain('flex-1 overflow-y-auto p-4 flex flex-col gap-4 [&>*]:shrink-0');
  });

  it('KNOWN_UNFIXED ro`yxati eskirmaydi — yo`q joy ro`yxatda turmaydi', () => {
    // Ro'yxat faqat HAQIQATAN mavjud joylarni sanashi kerak; tuzatilgach
    // qatorni olib tashlash MAJBUR bo'ladi (aks holda bu test qizaradi).
    const present = new Set<string>();
    for (const h of hits) {
      present.add(`${h.file}:${h.line}`);
      present.add(h.file);
    }
    const stale = [...KNOWN_UNFIXED].filter((k) => !present.has(k));
    expect(
      stale,
      `Ro'yxatdagi bu yozuvlar endi mavjud emas — olib tashlang:\n${stale.join('\n')}`,
    ).toEqual([]);
  });
});
