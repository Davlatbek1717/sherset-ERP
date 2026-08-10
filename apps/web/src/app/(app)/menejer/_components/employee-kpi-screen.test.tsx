import { api } from '@/lib/api-client';
import type { EmployeeKpiTarget, KpiMetricDef } from '@/lib/manager-api';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeKpiScreen, EmployeeKpiTodoList } from './employee-kpi-screen';

/**
 * KPI-04 — «todo kabi» KPI ekranlari.
 *
 * 🔴 EKRAN SHARTNOMALARI (buzilsa menejer noto'g'ri xulosaga keladi):
 *   1. **Og'irlik IXTIYORIY** — bitta metrika + maqsad bilan saqlash ishlaydi
 *      va so'rovda `weight` YO'Q. Eski ekran og'irliklarni 100% ga yig'ishni
 *      talab qilardi (bitta KPI qo'shish = qolganini qayta muvozanatlash).
 *   2. **Uch holat uch xil chiziladi**: fakt `null` → `—` («o'lchanmagan»),
 *      `0` → `0`, oddiy qiymat → o'zi ([[data-quality-flag-layer]]).
 *   3. **«Bajarildi» faqat qo'lda metrikada.** O'lchanadigan metrikada tugma
 *      UMUMAN yo'q — fakt dvigateldan keladi, ikki manba = ikki haqiqat.
 *   4. Pul maqsadi ekranda **so'mda**, serverga ham so'mda ketadi (tiyinga
 *      o'girish SERVERDA) — FE ikkinchi marta o'girsa 100× xato bo'lardi
 *      ([[manager-kpi-unit-vocabularies]]).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const EMP = 'emp-1';

function metric(over: Partial<KpiMetricDef> = {}): KpiMetricDef {
  return {
    key: 'cash_revenue',
    labelUz: 'Kassa tushumi',
    labelRu: 'Выручка кассы',
    unit: 'money',
    direction: 'higher_better',
    source: 'cashier',
    perHour: true,
    custom: false,
    ...over,
  };
}

function target(over: Partial<EmployeeKpiTarget> = {}): EmployeeKpiTarget {
  return {
    id: 'tgt-1',
    employeeId: EMP,
    employeeName: 'Anna',
    metricKey: 'cash_revenue',
    labelUz: 'Kassa tushumi',
    labelRu: 'Выручка кассы',
    unit: 'money',
    direction: 'higher_better',
    measurable: true,
    period: 'daily',
    targetMinor: '500000',
    currency: 'UZS',
    weight: null,
    manualDoneAt: null,
    active: true,
    lastFactMinor: null,
    lastFactDate: null,
    lastFactComplete: null,
    ...over,
  };
}

/** `api.get` ni ikki manba bo'yicha stublaydi: katalog + biriktirilganlar. */
function mockApi(opts: { metrics?: KpiMetricDef[]; targets?: EmployeeKpiTarget[] } = {}) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/manager/kpi/metrics')) return opts.metrics ?? [metric()];
    if (url.includes('/targets')) return opts.targets ?? [];
    if (url.startsWith('/hr/employees')) return { rows: [{ id: EMP, name: 'Anna' }], total: 1 };
    return {};
  });
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset().mockResolvedValue(target());
  vi.mocked(api.patch).mockReset().mockResolvedValue(target());
  vi.mocked(api.delete).mockReset().mockResolvedValue({ id: 'tgt-1', deleted: true });
});

describe('EmployeeKpiTodoList — xodim kartasi «todo» ro`yxati', () => {
  it('biriktirilgan KPI kartasi ko`rinadi (butun katalog jadvali EMAS)', async () => {
    mockApi({
      metrics: [metric(), metric({ key: 'receipt_count', labelUz: 'Chek soni', unit: 'count' })],
      targets: [target()],
    });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    expect(await screen.findByTestId('ekpi-row-tgt-1')).toBeTruthy();
    // Biriktirilmagan metrika qator sifatida CHIZILMAYDI — u faqat
    // «qo'shish» tanlagichida bo'ladi (eski ekranning asosiy muammosi).
    expect(screen.queryByText('Chek soni')).toBeNull();
  });

  it('🔴 «+ KPI qo`shish» metrika+maqsad bilan POST yuboradi — OG`IRLIKSIZ', async () => {
    mockApi({ metrics: [metric()], targets: [] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    await user.click(await screen.findByTestId('ekpi-add-open'));
    await user.type(screen.getByTestId('ekpi-add-target'), '5000');
    await user.click(screen.getByTestId('ekpi-add-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = vi.mocked(api.post).mock.calls[0] ?? [];
    expect(url).toBe(`/manager/kpi/employee/${EMP}/targets`);
    expect(body).toMatchObject({ metricKey: 'cash_revenue', period: 'daily' });
    // Og'irlik UMUMAN yuborilmaydi — «Kengaytirilgan» ochilmagan.
    expect((body as Record<string, unknown>).weight ?? null).toBeNull();
  });

  it('🔴 pul maqsadi SO`MDA ketadi (FE tiyinga o`girmaydi — server o`giradi)', async () => {
    mockApi({ metrics: [metric()], targets: [] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    await user.click(await screen.findByTestId('ekpi-add-open'));
    await user.type(screen.getByTestId('ekpi-add-target'), '5000');
    await user.click(screen.getByTestId('ekpi-add-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = vi.mocked(api.post).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.targetValue).toBe('5000');
  });

  it('og`irlik «Kengaytirilgan» ostida — ochilib kiritilsa so`rovga QO`SHILADI', async () => {
    mockApi({ metrics: [metric()], targets: [] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    await user.click(await screen.findByTestId('ekpi-add-open'));
    // Yopiq turganda maydon YO'Q — bu «og'irlik ixtiyoriy» ning UI ifodasi.
    expect(screen.queryByTestId('ekpi-add-weight')).toBeNull();
    await user.click(screen.getByTestId('ekpi-add-advanced'));
    await user.type(screen.getByTestId('ekpi-add-weight'), '40');
    await user.click(screen.getByTestId('ekpi-add-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({ weight: 40 });
  });

  it('o`chirish tugmasi DELETE chaqiradi', async () => {
    mockApi({ targets: [target()] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    await user.click(await screen.findByTestId('ekpi-remove-tgt-1'));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/manager/kpi/targets/tgt-1'));
  });

  it('tahrir maqsadni PATCH bilan yuboradi (so`mda)', async () => {
    mockApi({ targets: [target()] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    await user.click(await screen.findByTestId('ekpi-edit-tgt-1'));
    const input = screen.getByTestId('ekpi-edit-target');
    // Saqlangan 500000 tiyin → maydonda 5000 so'm ko'rinadi.
    expect((input as HTMLInputElement).value).toBe('5000');
    await user.clear(input);
    await user.type(input, '7000');
    await user.click(screen.getByTestId('ekpi-edit-save'));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const [url, body] = vi.mocked(api.patch).mock.calls[0] ?? [];
    expect(url).toBe('/manager/kpi/targets/tgt-1');
    expect(body).toMatchObject({ targetValue: '7000' });
  });

  it('🔴 qo`lda metrikada «bajarildi» → `/done`; o`lchanadiganda tugma YO`Q', async () => {
    mockApi({
      targets: [
        target({ id: 'tgt-manual', measurable: false, metricKey: 'custom_x', unit: 'count' }),
        target({ id: 'tgt-auto', measurable: true }),
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    await screen.findByTestId('ekpi-row-tgt-manual');
    expect(screen.queryByTestId('ekpi-done-tgt-auto')).toBeNull();

    await user.click(screen.getByTestId('ekpi-done-tgt-manual'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/manager/kpi/targets/tgt-manual/done', { done: true }),
    );
  });

  it('belgilangan qo`lda KPI qayta ochiladi (`done: false`)', async () => {
    mockApi({
      targets: [
        target({
          id: 'tgt-manual',
          measurable: false,
          unit: 'count',
          manualDoneAt: '2026-08-10T09:00:00.000Z',
        }),
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    await user.click(await screen.findByTestId('ekpi-done-tgt-manual'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/manager/kpi/targets/tgt-manual/done', {
        done: false,
      }),
    );
  });

  it('🔴 fakt O`LCHANMAGAN → «—» (0 EMAS)', async () => {
    mockApi({ targets: [target({ lastFactMinor: null })] });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);
    const row = await screen.findByTestId('ekpi-fact-tgt-1');
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toMatch(/\b0\b/);
  });

  it('🔴 fakt o`lchangan NOL → «0» chiziladi («—» EMAS)', async () => {
    mockApi({
      targets: [
        target({ unit: 'count', targetMinor: '40', lastFactMinor: '0', lastFactComplete: true }),
      ],
    });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);
    const cell = await screen.findByTestId('ekpi-fact-tgt-1');
    expect(cell.textContent).toContain('0');
    expect(cell.textContent).not.toContain('—');
  });

  it('chala fakt bayrog`i ko`rinadi (raqamga ishonch darajasi)', async () => {
    mockApi({
      targets: [
        target({ unit: 'count', lastFactMinor: '12', lastFactComplete: false, targetMinor: '40' }),
      ],
    });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);
    const row = await screen.findByTestId('ekpi-row-tgt-1');
    expect(row.getAttribute('data-fact-complete')).toBe('false');
  });

  it('og`irliksiz qator «ballanmaydi» deb belgilanadi (kuzatiladi)', async () => {
    mockApi({ targets: [target({ weight: null })] });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);
    const row = await screen.findByTestId('ekpi-row-tgt-1');
    expect(row.getAttribute('data-scored')).toBe('false');
  });

  it('og`irlikli qator ballanadi deb belgilanadi', async () => {
    mockApi({ targets: [target({ weight: 40 })] });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);
    const row = await screen.findByTestId('ekpi-row-tgt-1');
    expect(row.getAttribute('data-scored')).toBe('true');
  });

  it('🔴 hech qanday «og`irlik 100%» talabi QOLMAGAN', async () => {
    mockApi({ targets: [target({ weight: 40 })] });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);
    await screen.findByTestId('ekpi-row-tgt-1');
    expect(document.body.textContent).not.toContain('100%');
  });

  it('bo`sh holatda «qo`shish» taklifi ko`rinadi', async () => {
    mockApi({ targets: [] });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);
    expect(await screen.findByTestId('ekpi-empty')).toBeTruthy();
  });
});

describe('EmployeeKpiScreen — menejer «barcha KPI» ekrani', () => {
  it('xodimlar kesimida ro`yxat chizadi', async () => {
    mockApi({
      targets: [
        target({ id: 't1', employeeId: 'emp-1', employeeName: 'Anna' }),
        target({ id: 't2', employeeId: 'emp-2', employeeName: 'Bek' }),
      ],
    });
    renderWithProviders(<EmployeeKpiScreen />);

    expect(await screen.findByTestId('ekpi-emp-emp-1')).toBeTruthy();
    expect(screen.getByTestId('ekpi-emp-emp-2')).toBeTruthy();
    expect(screen.getByTestId('ekpi-emp-emp-1').textContent).toContain('Anna');
  });

  it('davr filtri so`rovga tushadi', async () => {
    mockApi({ targets: [] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiScreen />);

    await user.selectOptions(await screen.findByTestId('ekpi-filter-period'), 'weekly');
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.some(([u]) => u.includes('period=weekly'))).toBe(true),
    );
  });

  it('xodim filtri so`rovga tushadi', async () => {
    mockApi({ targets: [target({ employeeId: EMP })] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiScreen />);

    // Variantlar yuklangan qatorlardan yig'iladi — avval ular kelishini kut.
    await screen.findByTestId(`ekpi-emp-${EMP}`);
    await user.selectOptions(screen.getByTestId('ekpi-filter-employee'), EMP);
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.some(([u]) => u.includes(`employeeId=${EMP}`))).toBe(
        true,
      ),
    );
  });

  it('bo`sh natijada «KPI biriktirilmagan» holati', async () => {
    mockApi({ targets: [] });
    renderWithProviders(<EmployeeKpiScreen />);
    expect(await screen.findByTestId('ekpi-all-empty')).toBeTruthy();
  });

  it('inline QO`SHISH: xodim guruhida yangi KPI POST qilinadi', async () => {
    mockApi({ metrics: [metric()], targets: [target({ id: 't1', metricKey: 'receipt_count' })] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiScreen />);

    await user.click(await screen.findByTestId(`ekpi-group-add-${EMP}`));
    await user.type(screen.getByTestId('ekpi-add-target'), '5000');
    await user.click(screen.getByTestId('ekpi-add-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = vi.mocked(api.post).mock.calls[0] ?? [];
    expect(url).toBe(`/manager/kpi/employee/${EMP}/targets`);
    expect(body).toMatchObject({ metricKey: 'cash_revenue', period: 'daily' });
  });

  it('inline qo`shishda ALLAQACHON biriktirilgan metrika tanlovda yo`q', async () => {
    mockApi({
      metrics: [metric(), metric({ key: 'receipt_count', labelUz: 'Chek soni', unit: 'count' })],
      targets: [target({ id: 't1', metricKey: 'receipt_count' })],
    });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiScreen />);

    await user.click(await screen.findByTestId(`ekpi-group-add-${EMP}`));
    const options = [...screen.getByTestId('ekpi-add-metric').querySelectorAll('option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(options).toEqual(['cash_revenue']);
  });

  it('inline o`chirish menejer ekranida ham ishlaydi', async () => {
    mockApi({ targets: [target({ id: 't1' })] });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeKpiScreen />);

    await user.click(await screen.findByTestId('ekpi-remove-t1'));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/manager/kpi/targets/t1'));
  });
});

/**
 * KPI-06 brauzer-QA (2026-08-10) — real brauzerda o'lchangan ikki defekt.
 * Ikkalasi ham «ekran raqamni ko'rsatadi, LEKIN u nimani anglatishini
 * ko'rsatmaydi» sinfidan ([[browser-qa-catches-what-static-cannot]]).
 */
describe('KPI-06 brauzer-QA topilmalari', () => {
  /**
   * O'lchangan: qo'lda KPI'da «Bajarildi deb belgilash» bosilgach ekranda
   * O'ZGARGAN YAGONA narsa — tugma matni. Fakt hamon «—», hech qanday holat
   * belgisi yo'q. Dvigatel faktni faqat KUN QAYTA HISOBLANGANDA yozadi
   * (`manualDailyOutcome`), shuning uchun oradagi vaqtda menejer qaysi qo'lda
   * KPI bajarilganini ro'yxatdan umuman o'qiy olmaydi.
   */
  it('🔴 belgilangan qo`lda KPI qatorda «bajarildi» holatini KO`RSATADI', async () => {
    mockApi({
      targets: [
        target({
          id: 'm1',
          metricKey: 'custom_x',
          measurable: false,
          manualDoneAt: '2026-08-10T09:00:00.000Z',
        }),
      ],
    });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    const row = await screen.findByTestId('ekpi-row-m1');
    expect(row.getAttribute('data-done')).toBe('true');
    expect(within(row).getByTestId('ekpi-done-badge-m1')).toBeTruthy();
  });

  it('belgilanmagan qo`lda KPI `data-done="false"`', async () => {
    mockApi({
      targets: [target({ id: 'm2', measurable: false, manualDoneAt: null })],
    });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    const row = await screen.findByTestId('ekpi-row-m2');
    expect(row.getAttribute('data-done')).toBe('false');
    expect(within(row).queryByTestId('ekpi-done-badge-m2')).toBeNull();
  });

  /**
   * O'lchangan: karta «Fakt: —» deb yozadi, lekin bu fakt QAYSI KUNNIKI ekani
   * ekranda yo'q. Jonli bazada oxirgi hisoblangan kun 2026-08-09 edi, ekran
   * esa 2026-08-10 da ochilgan — ya'ni menejer kechagi (yoki undan ham eski)
   * o'lchovni bugungisi deb o'qiydi. `lastFactDate` API'da bor edi, UI uni
   * shunchaki chizmasdi.
   */
  it('🔴 fakt SANASI ko`rsatiladi (raqam qaysi kunniki ekani)', async () => {
    mockApi({
      targets: [
        target({ id: 'f1', lastFactMinor: '250000', lastFactDate: '2026-08-09T00:00:00.000Z' }),
      ],
    });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    const stamp = await screen.findByTestId('ekpi-fact-date-f1');
    expect(stamp.textContent).toMatch(/09/);
    expect(stamp.textContent).toMatch(/08/);
  });

  it('hisoblangan kun umuman bo`lmasa sana bloki chizilmaydi', async () => {
    mockApi({ targets: [target({ id: 'f2', lastFactMinor: null, lastFactDate: null })] });
    renderWithProviders(<EmployeeKpiTodoList employeeId={EMP} />);

    await screen.findByTestId('ekpi-row-f2');
    expect(screen.queryByTestId('ekpi-fact-date-f2')).toBeNull();
  });
});
