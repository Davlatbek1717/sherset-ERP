import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Oyna faqat qo'l bilan yopiladi» konvensiya qo'riqchisi (2026-08-12).
 *
 * Egasining jonli sinovi: kassir sensorli monoblokda oynaning CHETIGA tegib
 * ketardi — yarim to'ldirilgan to'lov/qarz oynasi yopilib, hamma kiritilgan
 * narsa yo'qolardi (undo yo'q, chekni qaytadan terish kerak edi). Klaviatura
 * ham xuddi shunday: Esc — Radix'ning sukut xulqi, bizning dizayn qarorimiz
 * EMAS edi, va skanerdan kelgan tasodifiy tugma ham oynani yopardi.
 *
 * Bu test statik skaner: har bir oyna YO himoyalangan, YO ataylab
 * «dismissible» deb belgilangan bo'lishi shart. Sabab statik tekshiruvda:
 * yangi oyna qo'shgan odam bu qoidani bilmasligi mumkin, jsdom esa Radix'ning
 * interact-outside hodisasini to'liq simulyatsiya qilmaydi (ya'ni runtime test
 * bu bug-klassni tutolmaydi — `modal-from-ui.test.tsx` dagi izohga qara).
 *
 * Yangi oyna qo'shayotgan bo'lsang:
 *   • ma'lumot kiritiladigan oyna  → `<Dialog.Content {...noAccidentalClose}>`
 *     (yoki DS `<Modal>` / `<Drawer>` — ular buni o'zi qiladi);
 *   • navigatsion/faqat-o'qish overlay → `dismissible` prop + shu faylda
 *     `dismissible-by-design:` izohi bilan sababni yoz.
 */

const WEB_SRC = join(__dirname, '..');
const DS_SRC = join(WEB_SRC, '..', '..', '..', 'packages', 'design-system', 'src');

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '__tests__', 'tests']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const FILES = [...walk(WEB_SRC), ...walk(DS_SRC)].map((path) => ({
  path,
  rel: path.replace(join(WEB_SRC, '..', '..', '..'), '').replace(/\\/g, '/'),
  src: readFileSync(path, 'utf8'),
}));

/**
 * `<Dialog.Content` ochilish tegining O'ZINI qaytaradi (bolalarini emas):
 * `{}` chuqurligi 0 bo'lgan birinchi `>` gacha. Bolalarni ham qamrab olsak,
 * pastroqdagi begona `noAccidentalClose` so'zi himoyani soxta «bor» qilib
 * ko'rsatardi.
 */
function openingTags(src: string, tag: string): string[] {
  const tags: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf(tag, from);
    if (start === -1) return tags;
    let depth = 0;
    let i = start + tag.length;
    for (; i < src.length; i++) {
      const ch = src[i];
      // Izoh va satrlarni O'TKAZIB yuborish shart: teg ichidagi
      // `// … <Dialog.Description>` izohi yoki `[&>div]` klassi ham `>`
      // saqlaydi va tegni vaqtidan oldin «tugadi» deb ko'rsatardi.
      if (ch === '/' && src[i + 1] === '/') {
        i = src.indexOf('\n', i);
        if (i === -1) break;
        continue;
      }
      if (ch === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end === -1) break;
        i = end + 1;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        for (i++; i < src.length; i++) {
          if (src[i] === '\\') i++;
          else if (src[i] === ch) break;
        }
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push(src.slice(start, i + 1));
    from = i + 1;
  }
}

describe('Oyna tasodifan yopilmaydi (konvensiya qo‘riqchisi)', () => {
  /**
   * Vakuum-qulf: skaner fayllarni umuman topmasa (yo'l o'zgardi, `walk`
   * buzildi) qolgan hamma tekshiruv «bo'sh ro'yxat = yashil» bo'lib jimgina
   * o'tib ketardi. Bu qatorlar shu holatni baland ovozda yiqitadi.
   */
  it('skaner haqiqatan fayl va oyna topadi (test bo‘sh o‘tmaydi)', () => {
    expect(FILES.length).toBeGreaterThan(300);
    const dialogs = FILES.flatMap((f) => openingTags(f.src, '<Dialog.Content'));
    expect(dialogs.length).toBeGreaterThanOrEqual(14);
  });

  it('har bir <Dialog.Content> yo himoyalangan, yo ataylab dismissible', () => {
    const unguarded: string[] = [];
    for (const file of FILES) {
      for (const tag of openingTags(file.src, '<Dialog.Content')) {
        const spreadsGuard = tag.includes('noAccidentalClose');
        const inlineGuard = tag.includes('onEscapeKeyDown') && tag.includes('onInteractOutside');
        const deliberate = tag.includes('dismissible-by-design');
        if (!spreadsGuard && !inlineGuard && !deliberate) unguarded.push(file.rel);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it('fonni bosish oynani yopmaydi (backdrop-click naqshi taqiqlangan)', () => {
    const offenders = FILES.filter(
      (f) => f.src.includes('e.target === e.currentTarget') && f.src.includes('role="dialog"'),
    ).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('Escape oynani yopmaydi — `dismissible-by-design` deb belgilanmagan bo‘lsa', () => {
    const offenders = FILES.filter(
      (f) =>
        /e\.key === 'Escape'\)\s*(onClose|close)\(\)/.test(f.src) &&
        !f.src.includes('dismissible-by-design'),
    ).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('DS `Modal`/`Drawer` sukut bo‘yicha qulflangan (dismissible = ixtiyoriy opt-in)', () => {
    for (const name of ['feedback/Modal.tsx', 'feedback/Drawer.tsx']) {
      const src = readFileSync(join(DS_SRC, ...name.split('/')), 'utf8');
      // Sukut qiymati aynan `false` bo'lishi shart: `dismissible = true` yoki
      // prop'ning yo'qolishi butun ilovani jimgina eski xulqqa qaytaradi.
      expect(src).toContain('dismissible = false');
      expect(src).toContain('onEscapeKeyDown');
      expect(src).toContain('onInteractOutside');
      // Boshlang'ich fokus ✕ da qolmaydi — aks holda ochilgach kelgan ilk
      // Enter (skanerning oxirgi tugmasi) oynani yopardi.
      expect(src).toContain('onOpenAutoFocus');
    }
  });

  it('POS oynalari — hammasi himoyalangan (kassa: eng qimmat yo‘qotish)', () => {
    const POS = [
      'payment-dialog.tsx',
      'debt-payment-dialog.tsx',
      'cash-out-dialog.tsx',
      'cart-line-edit-modal.tsx',
      'rasmilashtirish-modal.tsx',
      'customer-card-panel.tsx',
    ];
    for (const name of POS) {
      const src = readFileSync(join(WEB_SRC, 'components', 'pos', name), 'utf8');
      expect(src, `${name}: noAccidentalClose yo'q`).toContain('noAccidentalClose');
    }
  });
});
