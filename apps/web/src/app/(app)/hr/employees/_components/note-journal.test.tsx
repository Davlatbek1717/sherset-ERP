import { api } from '@/lib/api-client';
import type { EmployeeCard } from '@/lib/hr-api';
import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteJournal } from './note-journal';

/**
 * MK04 — suhbat/ogohlantirish jurnali (4M.4 · TZ §6.2).
 *
 * JURNAL APPEND-ONLY. Uchta xulq shu yerda qulflanadi:
 *   1. bekor qilingan yozuv ro'yxatdan CHIQMAYDI — belgisi bilan turadi;
 *   2. naqsh belgisi SERVER bayrog'idan chiziladi, ro'yxatdan qayta
 *      sanalmaydi (bekor qilingan yozuvlar ham `items` ichida keladi —
 *      qayta sanash ularni ham hisoblab, soxta «naqsh» chiqarardi);
 *   3. maqtov ham ko'rinadi — jurnal faqat salbiydan iborat bo'lmasin.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

type Notes = EmployeeCard['notes'];

const NOTE = (over: Partial<Notes['items'][number]> & { id: string }): Notes['items'][number] => ({
  kind: 'warning',
  text: 'Kechikdi',
  createdAt: '2026-08-01T09:00:00.000Z',
  author: { id: 'm1', name: 'Menejer' },
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  ...over,
});

const NOTES = (over: Partial<Notes> = {}): Notes => ({
  total: 0,
  talkCount: 0,
  warningCount: 0,
  praiseCount: 0,
  activeWarnings: 0,
  hasWarningPattern: false,
  lastAt: null,
  windowDays: 90,
  patternCount: 3,
  items: [],
  ...over,
});

describe('NoteJournal — append-only jurnal', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ id: 'n1', voidedAt: 'x', changed: true });
  });

  it('bekor qilingan yozuv ro`yxatda QOLADI va belgisi bilan turadi', () => {
    renderWithProviders(
      <NoteJournal
        employeeId="e1"
        notes={NOTES({
          total: 1,
          warningCount: 1,
          items: [NOTE({ id: 'n-void', text: 'Xato yozuv', voidedAt: '2026-08-02T10:00:00.000Z' })],
        })}
      />,
    );

    expect(screen.getByTestId('note-row-n-void')).toBeInTheDocument();
    expect(screen.getByText('Xato yozuv')).toBeInTheDocument();
    expect(screen.getByTestId('note-voided-n-void')).toBeInTheDocument();
  });

  it('bekor qilingan yozuvda «bekor qilish» tugmasi YO`Q (ikki marta bekor qilinmaydi)', () => {
    renderWithProviders(
      <NoteJournal
        employeeId="e1"
        notes={NOTES({
          total: 1,
          items: [
            NOTE({ id: 'n-live' }),
            NOTE({ id: 'n-dead', voidedAt: '2026-08-02T10:00:00.000Z' }),
          ],
        })}
      />,
    );

    expect(screen.getByTestId('note-void-n-live')).toBeInTheDocument();
    expect(screen.queryByTestId('note-void-n-dead')).toBeNull();
    // O'chirish tugmasi umuman yo'q — jurnal append-only.
    expect(screen.queryByTestId('note-delete-n-live')).toBeNull();
  });

  it('naqsh belgisi SERVER bayrog`idan — ro`yxatdagi 3 yozuvdan QAYTA sanalmaydi', () => {
    // Uchta ogohlantirish ko'rinadi, lekin ikkitasi bekor qilingan ⇒
    // kuchdagisi bitta, naqsh YO'Q. FE o'zi sanasa, soxta naqsh chiqardi.
    renderWithProviders(
      <NoteJournal
        employeeId="e1"
        notes={NOTES({
          total: 1,
          warningCount: 1,
          activeWarnings: 1,
          hasWarningPattern: false,
          items: [
            NOTE({ id: 'w1' }),
            NOTE({ id: 'w2', voidedAt: '2026-08-02T10:00:00.000Z' }),
            NOTE({ id: 'w3', voidedAt: '2026-08-03T10:00:00.000Z' }),
          ],
        })}
      />,
    );

    expect(screen.queryByTestId('note-warning-pattern')).toBeNull();
  });

  it('3-ogohlantirish naqsh belgisini YOQADI', () => {
    renderWithProviders(
      <NoteJournal
        employeeId="e1"
        notes={NOTES({
          total: 3,
          warningCount: 3,
          activeWarnings: 3,
          hasWarningPattern: true,
          items: [NOTE({ id: 'w1' }), NOTE({ id: 'w2' }), NOTE({ id: 'w3' })],
        })}
      />,
    );

    const badge = screen.getByTestId('note-warning-pattern');
    expect(badge).toBeInTheDocument();
    // Oyna va chegara SERVERDAN keladi (90/3 qattiq yozilmagan).
    expect(badge.textContent ?? '').toContain('90');
    expect(badge.textContent ?? '').toContain('3');
  });

  it('maqtov ham ko`rinadi — jurnal faqat salbiy emas', () => {
    renderWithProviders(
      <NoteJournal
        employeeId="e1"
        notes={NOTES({
          total: 1,
          praiseCount: 1,
          items: [NOTE({ id: 'p1', kind: 'praise', text: 'Oyning eng yaxshisi' })],
        })}
      />,
    );

    expect(screen.getByText('Oyning eng yaxshisi')).toBeInTheDocument();
    expect(screen.getByTestId('note-kind-p1').textContent ?? '').not.toBe('');
  });

  it('yozuv yo`q bo`lsa «yozuv yo`q» holati — 0 raqami emas', () => {
    renderWithProviders(<NoteJournal employeeId="e1" notes={NOTES()} />);

    expect(screen.getByTestId('note-journal-empty')).toBeInTheDocument();
  });

  it('bekor qilish serverga BEKOR so`rovini yuboradi (o`chirish emas)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NoteJournal employeeId="e1" notes={NOTES({ total: 1, items: [NOTE({ id: 'n-live' })] })} />,
    );

    await user.click(screen.getByTestId('note-void-n-live'));
    await user.click(await screen.findByTestId('note-void-confirm'));

    expect(api.post).toHaveBeenCalledWith('/hr/employees/notes/n-live/void', expect.anything());
    expect(api.delete).not.toHaveBeenCalled();
  });
});
