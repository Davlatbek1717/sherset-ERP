import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Products list must NOT ship stock columns — moysklad parity regression lock
 * (2026-06-16, LIVE-grounded).
 *
 * Live on moysklad.uz «Товары и услуги» (logged in as farrux@climart_santex_group,
 * read-only): the column-customizer (⚙) offers exactly 26 columns — Изображение,
 * Тип, Наименование, Код, Артикул, Ед. изм., Страна, Вес, Объем, Учет по серийным
 * номерам, ИКПУ (MXIK), Код упаковки ТАСНИФ, НДС, Неснижаемый остаток, Поставщик,
 * Описание, Минимальная цена, Закупочная цена, Розничная цена, Оптовая цена,
 * Количество модификаций, Общий доступ, Владелец-отдел, Владелец-сотрудник, Когда
 * изменен, Кто изменил — and NONE of them is a stock figure. There is no Остаток,
 * Резерв, Ожидание or Доступно anywhere in this list; stock lives in «Склад →
 * Остатки» only.
 *
 * The earlier stock columns (added 2026-06-11i/06-12) were mis-grounded: the
 * repo's `04-module/product` captures are CONTAMINATED (their <title> is «Заказы
 * покупателей» / «Корзина» / «Заказы поставщикам» — not products), so the
 * "assortment list shows a stock cluster" premise was never true for this list.
 * User confirmed removal for true 1:1 (2026-06-16). The backend still computes &
 * returns the live cluster; this list simply does not render it.
 *
 * This guard pins the ABSENCE so a future refactor can't silently re-add the
 * columns or put stock keys back into the default-visible set.
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const PAGE = read('apps/web/src/app/(app)/products/page.tsx');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const code = stripComments(PAGE);

describe('products list does NOT ship stock columns (moysklad parity, live 2026-06-16)', () => {
  it('defines no stock column keys for the DataTable', () => {
    expect(code).not.toMatch(/key:\s*['"]stockOnHand['"]/);
    expect(code).not.toMatch(/key:\s*['"]available['"]/);
    expect(code).not.toMatch(/key:\s*['"]reserved['"]/);
    expect(code).not.toMatch(/key:\s*['"]inTransit['"]/);
  });

  it('does not render stock cells (no p.stock.* reads in the column body)', () => {
    expect(code).not.toMatch(/p\.stock\./);
  });

  it('keeps no stock keys in the default-visible set', () => {
    const defaults = code.match(/useColumnVisibility\(\s*['"]products['"],\s*\[([\s\S]*?)\]\s*\)/);
    expect(defaults, 'default-visible array present').toBeTruthy();
    const body = defaults?.[1] ?? '';
    expect(body).not.toMatch(/['"]stockOnHand['"]/);
    expect(body).not.toMatch(/['"]available['"]/);
    expect(body).not.toMatch(/['"]reserved['"]/);
    expect(body).not.toMatch(/['"]inTransit['"]/);
  });
});
