import { api } from '@/lib/api-client';
import { renderWithProviders, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenejerQarorlarPage from './page';

/**
 * MK21 — qaror jurnali (4M TZ §8.1/9). MK25 Phase-2 QA da yozildi.
 *
 * Jurnal bir necha manbani (`daily_kpi`, `work_item`, `shift`, `supply`)
 * BIRLASHTIRADI, ularning holat lug'atlari esa boshqa-boshqa. QA da ekran
 * holatlarni umuman tarjima qilmasdan xom kod bilan chizayotgani ko'rindi
 * («escalated → force_accepted»). Bu yerda qulflanadi:
 *
 *  · har manba O'Z mavjud lug'atidan o'qiladi (uchinchi nusxa ochilmaydi);
 *  · lug'ati yo'q manba/holat xom KOD bo'lib qoladi — hech qachon xom i18n
 *    KALIT YO'LI («pages.…state_x») bo'lib emas.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

function row(over: Record<string, unknown> = {}) {
  return {
    source: 'daily_kpi',
    eventId: 'ev-1',
    occurredAt: '2026-08-09T18:53:48.390Z',
    action: 'force_accept',
    fromState: 'escalated',
    toState: 'force_accepted',
    actorType: 'owner',
    actorId: 'emp-1',
    actorName: 'Admin User',
    subjectId: 'day-1',
    subjectLabel: '2026-08-02',
    subjectEmployeeId: 'emp-2',
    subjectEmployeeName: 'QA Sotuvchi',
    reasonCode: 'owner_decision',
    comment: null,
    key: 'daily_kpi:ev-1',
    money: [],
    voided: false,
    voidedByKey: null,
    ...over,
  };
}

/** Konvert shakli JONLI `/manager/decisions` javobidan olingan. */
function payload(rows: Record<string, unknown>[]) {
  return {
    rows,
    totalCount: rows.length,
    truncated: false,
    hiddenSystemCount: 0,
    summary: { bySource: [], byAction: [], voidedCount: 0 },
    facets: { actors: [], actions: [], reasons: [] },
    from: '2026-07-11T00:00:00.000Z',
    to: '2026-08-10T00:00:00.000Z',
    cappedSources: [],
    generatedAt: '2026-08-10T09:00:00.000Z',
  };
}

function mount(rows: Record<string, unknown>[]) {
  vi.mocked(api.get).mockImplementation(async () => payload(rows));
  return renderWithProviders(<MenejerQarorlarPage />);
}

/**
 * JSX `{a} → {b}` uchta matn tuguni yaratadi, shuning uchun `getByText`
 * to'liq iborani topa olmaydi — qator matni yaxlit o'qiladi.
 */
async function rowText(view: { container: HTMLElement }): Promise<string> {
  const li = await waitFor(() => {
    const el = view.container.querySelector('li');
    if (!el) throw new Error('qator hali chizilmadi');
    return el;
  });
  return li.textContent ?? '';
}

describe('MK21 — qaror jurnali holat yorlig‘i', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('`daily_kpi` holatlari KPI lug‘atidan tarjima qilinadi', async () => {
    const view = mount([row()]);
    expect(await rowText(view)).toContain('Egada → Ega majburiy yopdi');
  });

  it('`work_item` holatlari navbat lug‘atidan tarjima qilinadi', async () => {
    const view = mount([
      row({
        source: 'work_item',
        key: 'work_item:ev-2',
        eventId: 'ev-2',
        subjectLabel: 'CASH_VARIANCE',
        fromState: 'open',
        toState: 'resolved',
        reasonCode: 'policy_violation',
      }),
    ]);
    expect(await rowText(view)).toContain('Ochiq → Yopilgan');
  });

  it('lug‘ati yo‘q manba xom KOD ko‘rsatadi, xom i18n kaliti EMAS', async () => {
    const view = mount([
      row({
        source: 'supply',
        key: 'supply:ev-3',
        eventId: 'ev-3',
        subjectLabel: 'SUP-1',
        fromState: 'draft',
        toState: 'approved',
        reasonCode: null,
      }),
    ]);
    const text = await rowText(view);
    expect(text).toContain('draft → approved');
    expect(text).not.toMatch(/pages\.(menejer|managerQueue|managerDecisions)\./);
  });

  it('noma’lum sabab kodi xom i18n kaliti bo‘lib chizilmaydi', async () => {
    const view = mount([row({ reasonCode: 'brand_new_reason_code' })]);
    const text = await rowText(view);
    expect(text).toContain('brand_new_reason_code');
    expect(text).not.toMatch(/pages\.managerDecisions\.reason_/);
  });
});
