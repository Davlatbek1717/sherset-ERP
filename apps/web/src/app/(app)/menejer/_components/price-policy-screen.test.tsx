import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricePolicyScreen, inputToThreshold, thresholdToInput } from './price-policy-screen';

/**
 * MK38 — narx siyosati ekrani.
 *
 * 🔴 ASOSIY SHARTNOMA: chegara **BLOKLAMAYDI**. Bu qulf uch qatlamda turadi
 * (bazada CHECK, backend tipida `blocks: false` literal, bu yerda esa tanlov
 * ro'yxatida `block` YO'Q) — chunki bitta qatlamdagi qulf refaktoringda
 * jimgina yo'qoladi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const RULES = {
  rules: [
    {
      ruleType: 'BIG_DISCOUNT',
      category: 'loss_discount',
      enabled: true,
      threshold: 10,
      thresholdUnit: 'percent',
      mode: 'notify',
      severity: 'warning',
      thresholdRejected: false,
      blocks: false,
    },
    {
      ruleType: 'BELOW_COST',
      category: 'loss_discount',
      enabled: true,
      threshold: 0,
      thresholdUnit: 'minor',
      mode: 'notify',
      severity: 'critical',
      thresholdRejected: false,
      blocks: false,
    },
    {
      // Boshqa toifa — bu ekranga TUSHMASLIGI kerak.
      ruleType: 'LOW_STOCK',
      category: 'warehouse',
      enabled: true,
      threshold: 7,
      thresholdUnit: 'days',
      mode: 'notify',
      severity: 'warning',
      thresholdRejected: false,
      blocks: false,
    },
  ],
};

describe('PricePolicyScreen — 🔴 chegara bloklamaydi', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue(RULES);
  });

  it('ekranda «to`xtatmaydi, navbatga tushadi» ochiq yozilgan', async () => {
    renderWithProviders(<PricePolicyScreen />);
    const note = await screen.findByTestId('pp-no-block');
    expect(note.textContent?.length).toBeGreaterThan(10);
  });

  it('rejim tanlovida `block` YO`Q (faqat navbat yoki kuzatuv)', async () => {
    renderWithProviders(<PricePolicyScreen />);
    const select = (await screen.findByTestId('pp-mode-BIG_DISCOUNT')) as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values.sort()).toEqual(['notify', 'observe']);
    expect(values).not.toContain('block');
  });

  it('manba faylida ham `block` rejimi yozilmagan (refaktoring qulfi)', () => {
    const src = readFileSync(join(__dirname, 'price-policy-screen.tsx'), 'utf8');
    expect(src).not.toMatch(/value=["']block["']/);
  });

  it('faqat narx/chegirma toifasi ko`rsatiladi', async () => {
    renderWithProviders(<PricePolicyScreen />);
    await screen.findByTestId('pp-row-BIG_DISCOUNT');
    expect(screen.queryByTestId('pp-row-BELOW_COST')).not.toBeNull();
    // Ombor qoidasi bu ekranning savoli emas.
    expect(screen.queryByTestId('pp-row-LOW_STOCK')).toBeNull();
  });
});

describe('PricePolicyScreen — chegara birligi (100× klass)', () => {
  it('🔴 pul chegarasi TIYINDA saqlanadi, ekranda so`mda ko`rsatiladi', () => {
    expect(thresholdToInput(500_000_00, 'minor')).toBe('500000');
    expect(inputToThreshold('500000', 'minor')).toBe(500_000_00);
  });

  it('foiz chegarasi konvertatsiya QILINMAYDI', () => {
    expect(thresholdToInput(10, 'percent')).toBe('10');
    expect(inputToThreshold('10', 'percent')).toBe(10);
  });

  it('yaroqsiz kiritma `null` (jimgina 0 ga aylanmaydi)', () => {
    expect(inputToThreshold('abc', 'percent')).toBeNull();
    expect(inputToThreshold('', 'percent')).toBeNull();
  });

  it('chegara yo`q bo`lsa maydon BO`SH (0 EMAS)', () => {
    expect(thresholdToInput(null, 'percent')).toBe('');
  });
});
