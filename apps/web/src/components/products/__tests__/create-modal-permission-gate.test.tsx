import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { act, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ProductCreateModal — «product.create» ruxsati bo'lmaganda modal ham qo'riqlanadi.
 *
 * 🔴 Nega bu test bor (2026-08-23 auditi): `d7937657` prodda o'lchangan bugni
 * (allocate-code 403 `.catch(() => {})` da yutilib «Код» jimgina bo'sh qolishi,
 * xato esa faqat «Сохранить» da chiqishi) FAQAT `/products/new` sahifasida
 * tuzatgan. Ayni forma ikkinchi kirish nuqtasi — bu modal — chetda qolgan:
 * unda `usePermissions` umuman yo'q edi. Modal esa aynan B2B oqimlaridan
 * ochiladi (`supplies/new`, `demands/new`, `demands/[id]` — «Создать новый
 * товар "…"» havolasi), ya'ni prodda 403 bergan o'sha auditoriya.
 *
 * Qulflanadigan shartnomalar (sahifadagilarning aynan nusxasi):
 *   1. ruxsat yo'q → forma UMUMAN chiqmaydi, tushunarli rad xabari chiqadi;
 *   2. ruxsat yo'q → mahkum `allocate-code` so'rovi UMUMAN yuborilmaydi;
 *   3. ruxsat bor → forma chiqadi va «Код» oldindan olinadi.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/supplies/new',
}));

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(() => ({ can: () => true, canView: () => true })),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'u-1', name: 'Admin' },
    accessToken: 't',
    initialized: true,
  })),
}));

const { api } = await import('@/lib/api-client');
const { usePermissions } = await import('@/hooks/use-permissions');
const { ProductCreateModal } = await import('../product-create-modal');

function wirePermissions(canCreate: boolean) {
  vi.mocked(usePermissions).mockReturnValue({
    can: (entity: string, action: string) =>
      entity === 'product' && action === 'create' ? canCreate : true,
    canView: () => true,
  } as unknown as ReturnType<typeof usePermissions>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue([] as never);
  vi.mocked(api.post).mockResolvedValue({ code: '05107' } as never);
});

function renderModal() {
  renderWithProviders(
    <ProductCreateModal open initialName="Kabel" onClose={() => {}} onCreated={() => {}} />,
  );
}

describe("ProductCreateModal — «product.create» qo'riqi", () => {
  it("ruxsat yo'q: forma o'rniga rad xabari, «Код» so'ralmaydi", async () => {
    wirePermissions(false);
    renderModal();

    await waitFor(() => expect(screen.getByText(/Нет прав|Ruxsat yo/i)).toBeInTheDocument());
    expect(screen.queryByTestId('product-create-modal-save')).not.toBeInTheDocument();
    const allocateCalls = vi
      .mocked(api.post)
      .mock.calls.filter((c) => String(c[0]).includes('allocate-code'));
    expect(allocateCalls).toHaveLength(0);
  });

  it('ruxsat bor: forma chiqadi va «Код» oldindan olinadi', async () => {
    wirePermissions(true);
    renderModal();

    await waitFor(() =>
      expect(screen.getByTestId('product-create-modal-save')).toBeInTheDocument(),
    );
    await waitFor(() => {
      const allocateCalls = vi
        .mocked(api.post)
        .mock.calls.filter((c) => String(c[0]).includes('allocate-code'));
      expect(allocateCalls).toHaveLength(1);
    });
  });
});

/**
 * 🔴 2026-08-23 auditi: modal `<form>` ichida `type="submit"` tugma bor va ism
 * `initialName` dan oldindan to'ldirilgan — ya'ni validatsiya o'tadi. Shtrix-kod
 * qatoriga skaner o'qishi (skaner oxirida Enter yuboradi) formani DARHOL
 * jo'natardi: narx ham, gruppa ham kiritilmagan tovar yaratilib, hujjatga
 * 1 dona pozitsiya tushardi. `/products/new` da bunday emas (u yerda formada
 * submit-tugma yo'q), ya'ni ikki kirish nuqtasi yana bir joyda ajralgan edi.
 *
 * Endi bitta qatorli inputdagi Enter formani jo'natmaydi (saqlash faqat tugma
 * orqali); `<textarea>` va tugmaning o'z Enter'i tegilmaydi.
 */
describe('ProductCreateModal — bitta qatorli inputdagi Enter saqlamaydi', () => {
  it("input ustidagi Enter bekor qilinadi (skaner formani jo'natmaydi)", async () => {
    wirePermissions(true);
    renderModal();
    await waitFor(() => expect(screen.getByTestId('field-name')).toBeInTheDocument());

    // fireEvent `false` qaytarsa — hodisa bekor qilingan (preventDefault).
    const notCancelled = fireEvent.keyDown(screen.getByTestId('field-name'), {
      key: 'Enter',
      bubbles: true,
    });
    expect(notCancelled).toBe(false);
  });

  it('boshqa tugmalar tegilmaydi', async () => {
    wirePermissions(true);
    renderModal();
    await waitFor(() => expect(screen.getByTestId('field-name')).toBeInTheDocument());

    const notCancelled = fireEvent.keyDown(screen.getByTestId('field-name'), {
      key: 'a',
      bubbles: true,
    });
    expect(notCancelled).toBe(true);
  });
});

/**
 * 🔴 2026-08-23 auditi: modal `onCreated` ga FAQAT `{ id }` uzatardi, shuning
 * uchun uchala chaqiruvchi (supplies/new, demands/new, demands/[id]) tovarni
 * darhol `GET /products/:id` bilan qayta o'qirdi — va o'sha GET bo'sh
 * catch ichida edi. Modal esa `onCreated` ni await qilmay yopilardi. Ya'ni GET
 * yiqilsa (tarmoq yoki `product.view` cheklovi): tovar YARATILGAN, qator YO'Q,
 * toast YO'Q, modal yopiq — foydalanuvchi «bo'lmadi» deb qayta uradi va
 * katalogda haqiqiy dublikat paydo bo'ladi.
 *
 * Ildiz yechim: `POST /products` allaqachon TO'LIQ tovarni qaytaradi
 * (`repo.create` da `select` yo'q), shuning uchun ikkinchi so'rovning hojati
 * yo'q — modal shu obyektni butunligicha uzatadi, chaqiruvchi qatorni undan
 * quradi va yiqiladigan qadam umuman qolmaydi.
 *
 * Eslatma (halol chegara): «onCreated POST javobini butunligicha uzatadi»
 * degan qism bu yerda RENDER bilan tekshirilmaydi. Modal formasini test
 * muhitida submit qildirib bo'lmadi — `fireEvent.submit` ham, `act` bilan
 * o'ralgani ham RHF `handleSubmit` callback'iga yetmadi (forma o'zi sog'lom:
 * `useProductForm` ni izolyatsiyada `trigger()` qilganda VALID, xatolar bo'sh).
 * Shu sababli shartnoma ikki qatlamda qulflangan:
 *   • quyidagi manba-qo'riq — chaqiruvchilarda ikkinchi so'rov qolmagani;
 *   • TIP TIZIMI — `onCreated` endi to'liq tovar shaklini talab qiladi va
 *     sahifalar `created.name` / `created.buyPrice` ni o'qiydi, ya'ni modal
 *     yana `{ id }` ga qaytsa typecheck yiqiladi.
 */
describe("yaratilgan tovarni hujjatga qo'shish — ikkinchi so'rov yo'q", () => {
  const CALLERS = [
    'src/app/(app)/supplies/new/page.tsx',
    'src/app/(app)/demands/new/page.tsx',
    'src/app/(app)/demands/[id]/page.tsx',
  ];

  it('hech bir chaqiruvchi onCreated ichida tovarni qayta GET qilmaydi', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const p of CALLERS) {
      const src = readFileSync(join(__dirname, '..', '..', '..', '..', p), 'utf8');
      // Bu URL faqat o'sha qayta-o'qishda ishlatilardi — mavjudligining o'zi
      // ikkinchi so'rov qaytganini bildiradi.
      expect(src).not.toContain('`/products/${created.id}`');
    }
  });
});

/**
 * 🔴 2026-08-23 auditi: «Код» ni oldindan olish javobi SHARTSIZ yozilardi
 * (`.then((r) => form.setValue('code', r.code))`). Sekin tarmoqda foydalanuvchi
 * o'z kodini kiritib ulgursa, javob kelgach u ustidan yozilardi va tovar
 * boshqa kod bilan saqlanardi — foydalanuvchi buni sezmasligi ham mumkin.
 */
describe('ProductCreateModal — kechikkan «Код» javobi', () => {
  it('foydalanuvchi kiritgan kodni ustidan YOZMAYDI', async () => {
    wirePermissions(true);
    let resolveCode: (v: { code: string }) => void = () => {};
    vi.mocked(api.post).mockImplementation((url: string) =>
      String(url).includes('allocate-code')
        ? (new Promise((res) => {
            resolveCode = res as (v: { code: string }) => void;
          }) as never)
        : (Promise.resolve({ id: 'p-1' }) as never),
    );
    renderModal();
    const code = () => screen.getByTestId('field-code') as HTMLInputElement;
    await waitFor(() => expect(code()).toBeInTheDocument());

    // Foydalanuvchi javob kelmasdan o'z kodini kiritdi.
    fireEvent.change(code(), { target: { value: '09999' } });
    await act(async () => {
      resolveCode({ code: '05107' });
    });

    expect(code().value).toBe('09999');
  });

  it("maydon bo'sh bo'lsa javob avvalgidek to'ldiradi", async () => {
    wirePermissions(true);
    renderModal();
    await waitFor(() =>
      expect((screen.getByTestId('field-code') as HTMLInputElement).value).toBe('05107'),
    );
  });
});
