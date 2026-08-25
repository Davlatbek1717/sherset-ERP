import { PieceOfferPanel } from '@/components/pos/piece-offer-panel';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { describe, expect, it, vi } from 'vitest';

/**
 * K3 — kassir bo'laklarni ko'radi.
 *
 * Egasining muammosi (K-reja 1-bo'lim): omborda
 * `250 + 250 + 250 + 200 + 150 + 70 + 50` yotibdi, ekranda esa `1220 m`.
 * Kassir «4 ta rulon bor» deydi, omborda 3 ta chiqadi.
 *
 * Qulflanadigan uchta shartnoma:
 *  🔴 bayroq O'CHIQ / reyestr BO'SH ⇒ panel UMUMAN chizilmaydi (kassa ekrani
 *     bir bayt ham o'zgarmaydi va HECH NARSA to'smaydi);
 *  🔴 «eng uzun uzluksiz» ALOHIDA qator — kassir mijozga aytadigan raqam;
 *  🔴 taklif tugmasi FAQAT kassir bosganda ishlaydi (tizim o'zi tanlamaydi —
 *     K-reja 4-bo'lim, vakolat chegarasi).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mockGet = vi.mocked(api.get);

interface Over {
  pieceTracked?: boolean;
  wholeGroups?: Array<{ length: string; count: number }>;
  pieces?: Array<{ id: string; label: string | null; length: string; cellName: string | null }>;
  activePieces?: number;
  registryQty?: string;
  longest?: string | null;
  verdict?: 'no-registry' | 'single' | 'needs-split' | 'not-enough';
  single?: { id: string; label: string | null; length: string; whole: boolean } | null;
  suggestion?: string[];
  missing?: string;
  stores?: unknown[];
}

function payload(over: Over = {}) {
  const composition = {
    wholeGroups: over.wholeGroups ?? [{ length: '250', count: 3 }],
    pieces: over.pieces ?? [
      { id: 'p4', label: 'BLK-000004', length: '200', cellName: null },
      { id: 'p5', label: 'BLK-000005', length: '150', cellName: null },
    ],
    registryQty: over.registryQty ?? '1100',
    activePieces: over.activePieces ?? 5,
    wholeCount: 3,
    longest: over.longest === undefined ? '250' : over.longest,
  };
  return {
    product: {
      id: 'prod-1',
      name: 'UzKabel VVG 2x2.5',
      uom: 'м',
      pieceTracked: over.pieceTracked ?? true,
    },
    stores: over.stores ?? [],
    composition,
    offer: {
      requested: '180',
      verdict: over.verdict ?? 'single',
      single:
        over.single === undefined
          ? { id: 'p4', label: null, length: '200', whole: false }
          : over.single,
      suggestion: over.suggestion ?? [],
      longest: composition.longest,
      registryQty: composition.registryQty,
      missing: over.missing ?? '0',
    },
  };
}

function render(over: Over = {}, props: { onApplySplit?: (l: string[]) => void } = {}) {
  mockGet.mockResolvedValue(payload(over));
  renderWithProviders(
    <PieceOfferPanel productId="prod-1" quantity="180" onApplySplit={props.onApplySplit} />,
  );
}

describe('tarkib — bitta son emas, TARKIB', () => {
  it('`250 × 3 · 200 · 150` va eng uzun uzluksiz ko`rinadi', async () => {
    render();
    const comp = await screen.findByTestId('pos-piece-composition');
    expect(comp.textContent).toContain('250 × 3');
    expect(comp.textContent).toContain('200');
    expect(comp.textContent).toContain('150');
    expect((await screen.findByTestId('pos-piece-longest')).textContent).toContain('250');
  });

  it('miqdor so`rovga tushadi (hukm shundan hisoblanadi)', async () => {
    render();
    await screen.findByTestId('pos-piece-offer');
    expect(mockGet).toHaveBeenCalledWith(
      '/stock-pieces/availability?assortmentId=prod-1&quantity=180',
    );
  });

  it('ombor kesimi bittadan ko`p bo`lsa ko`rsatiladi', async () => {
    render({
      stores: [
        {
          storeId: 's1',
          storeName: 'Ombor 02',
          composition: {
            wholeGroups: [{ length: '250', count: 3 }],
            pieces: [],
            registryQty: '750',
            activePieces: 3,
            wholeCount: 3,
            longest: '250',
          },
        },
        {
          storeId: 's2',
          storeName: 'Ombor 01',
          composition: {
            wholeGroups: [],
            pieces: [{ id: 'p4', label: null, length: '200', cellName: '01-02-03-04' }],
            registryQty: '200',
            activePieces: 1,
            wholeCount: 0,
            longest: '200',
          },
        },
      ],
    });
    const stores = await screen.findByTestId('pos-piece-stores');
    expect(stores.textContent).toContain('Ombor 02');
    expect(stores.textContent).toContain('Ombor 01');
  });
});

describe('🔴 panel HECH NARSANI to`smaydi va jim turadi', () => {
  it('bayroq O`CHIQ tovarda panel UMUMAN chizilmaydi', async () => {
    render({ pieceTracked: false, activePieces: 0 });
    // So'rov ketadi-yu, javob bo'sh bo'lgani uchun ekran o'zgarmaydi.
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByTestId('pos-piece-offer')).toBeNull();
  });

  it('reyestr BO`SH bo`lsa ham chizilmaydi (K5 gacha normal holat)', async () => {
    render({ activePieces: 0, wholeGroups: [], pieces: [], registryQty: '0', longest: null });
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByTestId('pos-piece-offer')).toBeNull();
  });
});

describe('hukmlar', () => {
  it('`single` — uzluksiz bor, qaysi bo`lakdan kesilishi bilan', async () => {
    render({ verdict: 'single' });
    const box = await screen.findByTestId('pos-piece-verdict-single');
    expect(box.textContent).toContain('200');
    expect(screen.queryByTestId('pos-piece-verdict-split')).toBeNull();
  });

  it('`needs-split` — ogohlantirish + «150 + 30» taklifi', async () => {
    render({ verdict: 'needs-split', suggestion: ['150', '30'], single: null, longest: '150' });
    const box = await screen.findByTestId('pos-piece-verdict-split');
    expect(box.textContent).toContain('150 + 30');
  });

  it('`not-enough` — jami yetmagani aytiladi', async () => {
    render({ verdict: 'not-enough', suggestion: [], single: null, missing: '80' });
    const box = await screen.findByTestId('pos-piece-verdict-short');
    expect(box.textContent).toContain('80');
  });
});

describe('🔴 taklifni FAQAT kassir qabul qiladi', () => {
  it('tugma bosilganda uzunliklar chaqiruvchiga qaytadi', async () => {
    const onApplySplit = vi.fn();
    render(
      { verdict: 'needs-split', suggestion: ['150', '30'], single: null, longest: '150' },
      { onApplySplit },
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('pos-piece-apply-split'));
    expect(onApplySplit).toHaveBeenCalledWith(['150', '30']);
  });

  it('tugma BOSILMASA hech narsa yuborilmaydi (tizim o`zi tanlamaydi)', async () => {
    const onApplySplit = vi.fn();
    render(
      { verdict: 'needs-split', suggestion: ['150', '30'], single: null, longest: '150' },
      { onApplySplit },
    );
    await screen.findByTestId('pos-piece-verdict-split');
    expect(onApplySplit).not.toHaveBeenCalled();
  });

  it('callback berilmasa tugma umuman chizilmaydi (faqat ko`rish)', async () => {
    render({ verdict: 'needs-split', suggestion: ['150', '30'], single: null, longest: '150' });
    await screen.findByTestId('pos-piece-verdict-split');
    expect(screen.queryByTestId('pos-piece-apply-split')).toBeNull();
  });
});
