/**
 * Har `<ResponsiveContainer>` `initialDimension` bilan chiqsin.
 *
 * recharts 3.x boshlang'ich o'lcham holati standart bo'yicha `{-1, -1}`
 * (`defaultResponsiveContainerProps`), `width="100%"` esa foizli bo'lgani
 * uchun birinchi render'da `calculatedWidth/Height` ham `-1` bo'ladi va
 * konsolga «The width(-1) and height(-1) of chart should be greater than 0»
 * chiqadi — ResizeObserver hali o'lchamagan bo'ladi.
 *
 * DIQQAT: xabarning o'zidagi «minWidth/minHeight qo'shing» maslahati bu
 * versiyada YORDAM BERMAYDI — `calculateChartDimensions()` ga faqat
 * `width/height/aspect/maxHeight` uzatiladi, `minWidth`/`minHeight` esa
 * shunchaki xabar matnida chop etiladi. Yagona ishlaydigan prop —
 * `initialDimension`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('recharts ResponsiveContainer', () => {
  it('har bir konteyner initialDimension beradi', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes('<ResponsiveContainer')) continue;
      // Har bir ochilish tegini alohida ko'rib chiqamiz.
      for (const m of src.matchAll(/<ResponsiveContainer\b[\s\S]*?>/g)) {
        if (!m[0].includes('initialDimension')) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${path.relative(SRC, file).split(path.sep).join('/')}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
