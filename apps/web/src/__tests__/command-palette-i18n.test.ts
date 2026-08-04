import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

/**
 * Command-palette yorliqlari — i18n drift-lock.
 *
 * BUG-CLASS (2026-08-04 brauzer-QA'da tutildi): palitraga yangi buyruq
 * qo'shilib, yorlig'i `command_palette.commands` EMAS, `command_palette`
 * ostiga yozildi. Komponent kalitni **dinamik** (`t(\`commands.${labelKey}\`)`)
 * o'qigani uchun:
 *   · typecheck jim — `labelKey` oddiy string;
 *   · i18n key-existence gate jim — u statik `t('...')` chaqiruvlarini skanlaydi;
 *   · test suite jim — palitra hech bir testda render qilinmaydi.
 * Natijada har sahifa yuklanishida konsolga `MISSING_MESSAGE` chiqib turardi va
 * buni FAQAT brauzerda ochib ko'rish oshkor qildi.
 *
 * Bu guard aynan shu bo'shliqni yopadi: manba fayldagi har `labelKey` uchun
 * ru va uz da tarjima BORLIGINI tekshiradi.
 */

const SRC = join(__dirname, '..', 'components', 'command-palette.tsx');
const src = readFileSync(SRC, 'utf8');

/** `labelKey: 'go_x'` — buyruqlar ro'yxatidagi barcha kalitlar. */
const LABEL_KEYS = [
  ...new Set([...src.matchAll(/labelKey:\s*'([a-z0-9_]+)'/g)].map((m) => m[1] ?? '')),
].filter(Boolean);

function commands(bundle: unknown): Record<string, string> {
  const b = bundle as { command_palette?: { commands?: Record<string, string> } };
  return b.command_palette?.commands ?? {};
}

describe('command-palette i18n', () => {
  it('manba fayldan kalitlar o`qildi (test bo`sh emas)', () => {
    // Ro'yxat qisqarib ketsa guard vakuum bo'lib qolardi.
    expect(LABEL_KEYS.length).toBeGreaterThanOrEqual(15);
  });

  it.each([
    ['ru', ru],
    ['uz', uz],
  ])('%s: har `labelKey` uchun `command_palette.commands` da tarjima bor', (locale, bundle) => {
    const have = commands(bundle);
    const missing = LABEL_KEYS.filter((k) => !have[k]);
    expect(missing, `${locale} da yo'q: ${missing.join(', ')}`).toEqual([]);
  });

  it('ru va uz buyruq yorliqlari BIR XIL to`plam', () => {
    expect(Object.keys(commands(ru)).sort()).toEqual(Object.keys(commands(uz)).sort());
  });

  it('har buyruq `href` i mavjud route`ga qaraydi (menejer regressiyasi)', () => {
    // `/manager/kpi` — merge qilinmagan branchdagi eski yo'l; bizda `/menejer`.
    expect(src).not.toContain("href: '/manager/kpi'");
    expect(src).toContain("href: '/menejer'");
  });
});
