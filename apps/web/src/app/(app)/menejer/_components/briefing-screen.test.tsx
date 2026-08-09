import { api } from '@/lib/api-client';
import type {
  BriefingBlock,
  BriefingBlockKey,
  BriefingKind,
  BriefingSnapshot,
} from '@/lib/manager-api';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingScreen } from './briefing-screen';

/**
 * MK19 — ertalabki brifing / kechki yakun (4M TZ §8.1/5).
 *
 * 🔴 EKRAN SHARTNOMASI:
 *  (1) **«o'lchanmadi» ≠ «nol»** — `—` chiziladi, `0` emas;
 *  (2) **«o'lchanmadi» ≠ «tinch kun»** — o'lchanmagan manbadan chiqqan
 *      xotirjamlik menejerni aldardi;
 *  (3) **`measure` bloki ogohlantirish rangini olmaydi** — 9 ta buyurtma
 *      yig'ilayotgani normal ish kuni.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const MORNING_KEYS: BriefingBlockKey[] = [
  'stuck',
  'sla_breach',
  'acceptance_pending',
  'stock_signal',
];
const EVENING_KEYS: BriefingBlockKey[] = [
  'revenue',
  'shift_acceptance',
  'cash_variance',
  'open_items',
];

const MEASURES: BriefingBlockKey[] = ['stuck', 'revenue'];

function blk(key: BriefingBlockKey, over: Partial<BriefingBlock> = {}): BriefingBlock {
  return {
    key,
    role: MEASURES.includes(key) ? 'measure' : 'signal',
    source: `stub:${key}`,
    count: 0,
    amountMinor: null,
    quality: 'complete',
    attention: false,
    context: {},
    ...over,
  };
}

function SNAP(kind: BriefingKind, over: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  const keys = kind === 'morning' ? MORNING_KEYS : EVENING_KEYS;
  return {
    kind,
    businessDate: '2026-08-10',
    generatedAt: '2026-08-10T10:00:00.000Z',
    currency: 'UZS',
    blocks: keys.map((k) => blk(k)),
    summary: {
      kind,
      status: 'quiet',
      attentionCount: 0,
      attentionBlocks: [],
      quality: 'complete',
    },
    ...over,
  };
}

/** Ikkala panel bir sahifada — javob so'ralgan `kind` bo'yicha beriladi. */
function mockBoth(morning: BriefingSnapshot, evening: BriefingSnapshot) {
  vi.mocked(api.get).mockImplementation(async (url: string) =>
    url.endsWith('/morning') ? morning : evening,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe('BriefingScreen — ikkita panel', () => {
  it('ertalabki va kechki panellar chiziladi', async () => {
    mockBoth(SNAP('morning'), SNAP('evening'));
    renderWithProviders(<BriefingScreen />);
    expect(await screen.findByTestId('br-panel-morning')).toBeInTheDocument();
    expect(await screen.findByTestId('br-panel-evening')).toBeInTheDocument();
  });

  it('har blok o‘z MANBASI bilan chiziladi (raqam qayerdan kelgani)', async () => {
    mockBoth(SNAP('morning'), SNAP('evening'));
    renderWithProviders(<BriefingScreen />);
    for (const k of [...MORNING_KEYS, ...EVENING_KEYS]) {
      expect(await screen.findByTestId(`br-source-${k}`)).toHaveTextContent(`stub:${k}`);
    }
  });
});

describe('BriefingScreen — «o‘lchanmadi» ≠ «nol»', () => {
  it('o‘lchanmagan blok `—` bo‘lib chiziladi, `0` EMAS', async () => {
    const morning = SNAP('morning', {
      blocks: MORNING_KEYS.map((k) =>
        blk(k, k === 'stock_signal' ? { count: null, quality: 'uncollected' } : {}),
      ),
      summary: {
        kind: 'morning',
        status: 'incomplete',
        attentionCount: null,
        attentionBlocks: [],
        quality: 'partial',
      },
    });
    mockBoth(morning, SNAP('evening'));
    renderWithProviders(<BriefingScreen />);

    expect(await screen.findByTestId('br-count-value-stock_signal')).toHaveTextContent('—');
    // O'lchangan nol esa ODDIY raqam bo'lib chiziladi — u haqiqiy o'lchov.
    expect(await screen.findByTestId('br-count-value-sla_breach')).toHaveTextContent('0');
    expect(await screen.findByTestId('br-quality-stock_signal')).toHaveAttribute(
      'data-level',
      'uncollected',
    );
  });

  it('🔴 o‘lchanmagan signal bo‘lsa holat «tinch kun» EMAS va jami `—`', async () => {
    const morning = SNAP('morning', {
      blocks: MORNING_KEYS.map((k) => blk(k, k === 'stock_signal' ? { count: null } : {})),
      summary: {
        kind: 'morning',
        status: 'incomplete',
        attentionCount: null,
        attentionBlocks: [],
        quality: 'partial',
      },
    });
    mockBoth(morning, SNAP('evening'));
    renderWithProviders(<BriefingScreen />);

    expect(await screen.findByTestId('br-status-morning')).toHaveAttribute(
      'data-status',
      'incomplete',
    );
    expect(await screen.findByTestId('br-count-morning')).toHaveTextContent('—');
  });

  it('bo‘sh kunda holat «tinch kun»', async () => {
    mockBoth(SNAP('morning'), SNAP('evening'));
    renderWithProviders(<BriefingScreen />);
    expect(await screen.findByTestId('br-status-morning')).toHaveAttribute('data-status', 'quiet');
    expect(await screen.findByTestId('br-count-morning')).toHaveTextContent('0');
  });
});

describe('BriefingScreen — signal va kontekst farqi', () => {
  it('🔴 `measure` bloki katta son bilan ham OGOHLANTIRISH bo‘lmaydi', async () => {
    const morning = SNAP('morning', {
      blocks: MORNING_KEYS.map((k) => blk(k, k === 'stuck' ? { count: 9 } : {})),
    });
    mockBoth(morning, SNAP('evening'));
    renderWithProviders(<BriefingScreen />);

    const stuck = await screen.findByTestId('br-block-stuck');
    expect(stuck).toHaveAttribute('data-role', 'measure');
    expect(stuck).toHaveAttribute('data-attention', 'false');
    expect(await screen.findByTestId('br-status-morning')).toHaveAttribute('data-status', 'quiet');
  });

  it('`signal` bloki musbat bo‘lsa belgilanadi', async () => {
    const morning = SNAP('morning', {
      blocks: MORNING_KEYS.map((k) =>
        blk(k, k === 'sla_breach' ? { count: 3, attention: true } : {}),
      ),
      summary: {
        kind: 'morning',
        status: 'attention',
        attentionCount: 3,
        attentionBlocks: ['sla_breach'],
        quality: 'complete',
      },
    });
    mockBoth(morning, SNAP('evening'));
    renderWithProviders(<BriefingScreen />);

    expect(await screen.findByTestId('br-block-sla_breach')).toHaveAttribute(
      'data-attention',
      'true',
    );
    expect(await screen.findByTestId('br-status-morning')).toHaveAttribute(
      'data-status',
      'attention',
    );
  });

  it('pul o‘lchovi bor blok summani ham ko‘rsatadi', async () => {
    const evening = SNAP('evening', {
      blocks: EVENING_KEYS.map((k) =>
        blk(k, k === 'revenue' ? { count: 12, amountMinor: '4500000' } : {}),
      ),
    });
    mockBoth(SNAP('morning'), evening);
    renderWithProviders(<BriefingScreen />);
    expect(await screen.findByTestId('br-amount-revenue')).toHaveTextContent('45 000');
  });
});

describe('BriefingScreen — Telegram yuborish', () => {
  it('yuborilganda tasdiq ko‘rinadi', async () => {
    mockBoth(SNAP('morning'), SNAP('evening'));
    vi.mocked(api.post).mockResolvedValue({
      sent: true,
      skipped: null,
      outboxId: 'o-1',
      chatId: '-100500',
      tag: '#brifing_2026-08-10',
      businessDate: '2026-08-10',
      status: 'quiet',
    });
    renderWithProviders(<BriefingScreen />);

    await userEvent.click(await screen.findByTestId('br-send-morning'));
    await waitFor(() => expect(screen.getByTestId('br-sent-morning')).toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith('/manager/briefing/morning/telegram', {});
  });

  it('dublikat XATO emas — alohida matn bilan aytiladi', async () => {
    mockBoth(SNAP('morning'), SNAP('evening'));
    vi.mocked(api.post).mockResolvedValue({
      sent: false,
      skipped: 'duplicate',
      outboxId: null,
      chatId: '-100500',
      tag: '#brifing_2026-08-10',
      businessDate: '2026-08-10',
      status: 'quiet',
    });
    renderWithProviders(<BriefingScreen />);

    await userEvent.click(await screen.findByTestId('br-send-morning'));
    const note = await screen.findByTestId('br-sent-morning');
    expect(note.textContent ?? '').not.toBe('');
  });

  it('🔴 yuborish xatosi JIM yutilmaydi', async () => {
    mockBoth(SNAP('morning'), SNAP('evening'));
    vi.mocked(api.post).mockRejectedValue(new Error('Telegram sozlanmagan'));
    renderWithProviders(<BriefingScreen />);

    await userEvent.click(await screen.findByTestId('br-send-morning'));
    expect(await screen.findByTestId('br-send-error-morning')).toHaveTextContent(
      'Telegram sozlanmagan',
    );
  });
});
