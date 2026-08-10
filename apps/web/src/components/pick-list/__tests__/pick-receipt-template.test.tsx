import { buildSheetHtml, buildSheetText } from '@/lib/print-agent';
import ruMessages from '@/messages/ru.json' with { type: 'json' };
import { renderWithProviders, screen } from '@/test-utils';
import { describe, expect, it } from 'vitest';
import { PickReceiptBody, type ReceiptData } from '../receipt-print-portal';

/**
 * «Товарный чек» shabloni (egasining climart namunasi, 2026-08-10).
 *
 * NEGA BU TEST BOR: omborga chiqadigan varaqa UCH joyda alohida chizilgan edi
 * (React sahifa · Electron HTML · ESC/POS matn) va ularning HECH BIRIDA render
 * qamrovi yo'q edi — «YIG'ISH VARAQASI» butunlay olib tashlanganda ham 3152
 * testdan bittasi ham yiqilmadi. Shu bo'shliq bu yerda yopiladi: uch kanal ham
 * bir xil ma'lumotni bir xil TARTIBDA berishi qulflanadi.
 *
 * Ikki nozik joy ataylab test qilinadi:
 *  1. `groups` uzatilganda qatorlar QAYTA TARTIBLANMAYDI — omborchi varaqasi
 *     serverning ilon-izi (serpentine) marshrut tartibida keladi; ichkarida
 *     yacheyka kodi bo'yicha qayta saralash omborchini yo'lakdan ikki marta
 *     yurishga majbur qilardi.
 *  2. Jami qatori KO'RSATILGAN qatorlarni sanaydi (guruh ichidagilar), hujjat
 *     pozitsiyalari massivini emas — bitta sklad varaqasida ular teng emas.
 */

const RU = ruMessages as Record<string, unknown>;
/** RU qiymatlari xabar faylidan o'qiladi — test matnni ikkinchi marta yozmaydi. */
const RCPT = (ruMessages as unknown as { pages: { pickLists: Record<string, string> } }).pages
  .pickLists as { receipt_footer_brand: string; print_no_cell: string };

function data(over: Partial<ReceiptData> = {}): ReceiptData {
  const positions = [
    { name: 'Заглушка 20 Пластерм', qty: 50, uom: 'шт', cell: '01-03-05-30' },
    { name: 'Тройник 32*20 ЖИП Аква Повер', qty: 30, uom: 'шт', cell: '01-04-02-10' },
  ];
  return {
    title: 'Товарный чек',
    number: '3476',
    dateStr: '08.08.2026',
    agentName: 'Устасизлар Камолиддин',
    agentPhone: '+998901112233',
    ownerName: 'Камолиддин',
    description: 'izoh matni',
    positions,
    ...over,
  };
}

describe('PickReceiptBody — climart «Товарный чек» namunasi', () => {
  it('renders the header block, 5 columns, group heading and brand footer', () => {
    renderWithProviders(<PickReceiptBody data={data()} />, { messages: RU });

    expect(screen.getByTestId('receipt-title')).toHaveTextContent('Товарный чек № 3476');
    expect(screen.getByTestId('receipt-agent')).toHaveTextContent('Устасизлар Камолиддин');
    expect(screen.getByText(/Продавец: Камолиддин/)).toBeInTheDocument();
    expect(screen.getByText(/Покупатель: Устасизлар Камолиддин/)).toBeInTheDocument();
    expect(screen.getByText(/Телефон: \+998901112233/)).toBeInTheDocument();
    expect(screen.getByText(/Комментарий: izoh matni/)).toBeInTheDocument();

    // Namunadagi ustunlar, aynan shu tartibda.
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['№', 'Наименование', 'Ед.изм', 'Кол-во', 'Yacheyka']);

    // Yacheyka kodining birinchi bo'lagi = guruh sarlavhasi.
    expect(screen.getByTestId('receipt-group-01')).toHaveTextContent('01');
    expect(screen.getByTestId('receipt-items-line')).toHaveTextContent('Всего наименований 2');
    expect(screen.getByText(RCPT.receipt_footer_brand)).toBeInTheDocument();
  });

  it('heads the cell-less group «Yacheykasiz» and dashes the empty cell', () => {
    renderWithProviders(
      <PickReceiptBody
        data={data({
          positions: [{ name: 'Гидропарабариер 130', qty: 500, uom: 'шт', cell: null }],
        })}
      />,
      { messages: RU },
    );
    expect(screen.getByTestId('receipt-group-none')).toHaveTextContent(RCPT.print_no_cell);
    expect(screen.getByTestId('receipt-cell')).toHaveTextContent('–');
  });

  it('keeps the caller-supplied row order (serpentine pick route survives)', () => {
    // Yacheyka kodi bo'yicha saralansa 01-05-02-08 BIRINCHI bo'lardi.
    const positions = [
      { name: 'B', qty: 1, uom: 'шт', cell: '01-05-04-14' },
      { name: 'A', qty: 2, uom: 'шт', cell: '01-05-02-08' },
    ];
    renderWithProviders(
      <PickReceiptBody data={data({ positions, groups: [{ warehouse: '01', positions }] })} />,
      { messages: RU },
    );
    const cells = screen.getAllByTestId('receipt-cell').map((td) => td.textContent);
    expect(cells).toEqual(['01-05-04-14', '01-05-02-08']);
  });

  it('counts the rows it actually printed, not the document position array', () => {
    // Bitta sklad varaqasi: hujjatda 5 pozitsiya, bu chekda 2 tasi.
    const positions = data().positions;
    renderWithProviders(
      <PickReceiptBody
        data={data({
          positions: [...positions, ...positions, ...positions].slice(0, 5),
          groups: [{ warehouse: '01', positions }],
        })}
      />,
      { messages: RU },
    );
    expect(screen.getByTestId('receipt-items-line')).toHaveTextContent('Всего наименований 2');
  });
});

const AGENT_RES = {
  sourceName: '3476',
  docNumber: '3476',
  docDate: '2026-08-08T09:00:00.000Z',
  buyerName: 'Устасизлар Камолиддин',
  buyerPhone: '+998901112233',
  sellerName: 'Камолиддин',
  comment: 'izoh matni',
  sheets: [],
};
const AGENT_SHEET = {
  skladNo: 1,
  omborchiName: 'Камолиддин',
  lines: [
    { productName: 'Заглушка 20 Пластерм', quantity: '50', binLocation: '01-03-05-30', uom: 'шт' },
    { productName: 'Тройник 32*20', quantity: '30', binLocation: '01-04-02-10', uom: 'шт' },
  ],
};

describe('Electron HTML kanali — o‘sha shablon', () => {
  const html = buildSheetHtml(AGENT_SHEET, AGENT_RES);

  it('carries the same header block, columns and totals', () => {
    expect(html).toContain('Товарный чек № 3476');
    expect(html).toContain('от 08.08.2026');
    expect(html).toContain('Продавец: Камолиддин');
    expect(html).toContain('Покупатель: Устасизлар Камолиддин');
    expect(html).toContain('Телефон: +998901112233');
    expect(html).toContain('Комментарий: izoh matni');
    // Ustunlar aynan shu TARTIBDA — «toContain» har birini alohida tekshirsa,
    // o'rin almashgani sezilmay qolardi.
    const headRow = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    const cols = [...headRow.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(cols).toEqual(['№', 'Наименование', 'Ед.изм', 'Кол-во', 'Yacheyka']);
    expect(html).toContain('Всего наименований 2');
    expect(html).toContain('Sherset - savdo va ombor boshqaruvi');
  });

  it('drops the retired «YIG‘ISH VARAG‘I» strip', () => {
    expect(html).not.toContain('VARAG');
    expect(html).not.toContain('Omborchi:');
  });

  it('heads the sheet with its sklad number, «Yacheykasiz» when unassigned', () => {
    expect(html).toContain('>01<');
    expect(buildSheetHtml({ ...AGENT_SHEET, skladNo: null }, AGENT_RES)).toContain('>Yacheykasiz<');
  });
});

describe('ESC/POS matn kanali — jadvalsiz, lekin ayni tartibda', () => {
  const text = buildSheetText(AGENT_SHEET, AGENT_RES);

  it('follows the receipt order: header → group → lines → total → brand', () => {
    const at = (s: string) => text.indexOf(s);
    expect(at('Tovar cheki № 3476')).toBeGreaterThanOrEqual(0);
    expect(at('Sotuvchi: Камолиддин')).toBeGreaterThan(at('Tovar cheki № 3476'));
    expect(at('Xaridor: Устасизлар Камолиддин')).toBeGreaterThan(at('Sotuvchi:'));
    expect(at('Telefon: +998901112233')).toBeGreaterThan(at('Xaridor:'));
    expect(at('\n01')).toBeGreaterThan(at('Izoh:'));
    expect(at('1. Заглушка 20 Пластерм')).toBeGreaterThan(at('\n01'));
    expect(at('01-03-05-30   50 шт')).toBeGreaterThan(at('1. Заглушка 20 Пластерм'));
    expect(at('Jami nomlanish 2')).toBeGreaterThan(at('2. Тройник 32*20'));
    expect(at('Sherset - savdo va ombor boshqaruvi')).toBeGreaterThan(at('Jami nomlanish 2'));
  });

  it('drops the retired sheet header and its checkbox column', () => {
    expect(text).not.toContain('VARAG');
    expect(text).not.toContain('[ ]');
  });
});
