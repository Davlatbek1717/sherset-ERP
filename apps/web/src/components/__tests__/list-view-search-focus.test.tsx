import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { ListView } from '@moysklad/ui';
import { useState } from 'react';
/**
 * ListView qidiruv maydoni — FOKUS REGRESSIYASI (2026-08-17).
 *
 * Egasi: «loyihadagi barcha qidiruv inputlariga bitta belgi yozaman, keyin
 * fokus inputdan chiqib ketadi». Ildiz `Input` primitivida edi: adornment
 * (tozalash ✕ tugmasi) inputning O'Z qiymatiga bog'langani uchun birinchi
 * belgidayoq daraxt shakli `<input>` → `<div><input/></div>` ga o'zgarardi,
 * React esa DOM tugunini almashtirib fokusni yo'qotardi.
 *
 * Bu yerdagi testlar xatoni PRIMITIVDA emas, HAQIQIY foydalanishda —
 * ListView toolbar qidiruvida — qulflaydi: ro'yxat sahifalarining hammasi
 * (kontragentlar, hujjatlar, katalog…) shu bitta komponentdan qidiradi.
 */
import { describe, expect, it } from 'vitest';

type Row = { id: string; name: string };

function SearchableList() {
  const [search, setSearch] = useState('');
  const rows: Row[] = [
    { id: '1', name: 'Alfa' },
    { id: '2', name: 'Beta' },
  ];
  const visible = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <ListView<Row>
      title="Ro'yxat"
      moyskladToolbar
      search={search}
      onSearchChange={setSearch}
      columns={[{ key: 'name', header: 'Nom', cell: (r) => r.name }]}
      rows={visible}
      keyField="id"
      total={visible.length}
      limit={25}
    />
  );
}

describe('ListView search — focus survival', () => {
  it('keeps focus in the search box after the first character', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchableList />);
    const input = screen.getByTestId('search-input');
    input.focus();

    await user.keyboard('B');

    expect(document.activeElement).toBe(screen.getByTestId('search-input'));
  });

  it('accepts a whole word without dropping characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchableList />);
    const input = screen.getByTestId('search-input') as HTMLInputElement;
    input.focus();

    await user.keyboard('Beta');

    // Xato bo'lganda bu yerda 'B' qolardi: qolgan belgilar hech qayerga
    // bormasdi, chunki maydon birinchi belgidayoq qayta yaratilardi.
    expect((screen.getByTestId('search-input') as HTMLInputElement).value).toBe('Beta');
  });

  it('does not recreate the search input element when the clear button appears', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchableList />);
    const before = screen.getByTestId('search-input');

    before.focus();
    await user.keyboard('A');

    // Tozalash tugmasi paydo bo'ldi, LEKIN input o'sha DOM tuguni bo'lib qoldi.
    expect(screen.getByTestId('search-clear')).toBeInTheDocument();
    expect(screen.getByTestId('search-input')).toBe(before);
  });

  it('still filters the rows while typing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchableList />);
    screen.getByTestId('search-input').focus();

    await user.keyboard('Beta');

    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alfa')).not.toBeInTheDocument();
  });
});
