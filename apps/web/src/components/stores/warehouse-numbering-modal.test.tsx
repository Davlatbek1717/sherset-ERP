import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarehouseNumberingModal } from './warehouse-numbering-modal';

/**
 * F3 (reja 2026-08-23) — «Yangi ombor raqamlashtirish» oynasi: retsept
 * serverga AYNAN bir endpoint orqali boradi (dryRun oldindan ko'rish, keyin
 * real yaratish), stelaj qatorlari soni bilan boshqariladi, xato matni
 * serverdan shundoq ko'rsatiladi.
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const { api } = await import('@/lib/api-client');

const PREVIEW = {
  total: 8,
  toCreate: 8,
  existing: 0,
  zonesToCreate: ['03-01', '03-02'],
  sample: ['03-01-01-01', '03-01-01-02'],
  created: 0,
  zonesCreated: 0,
};

function openModal() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  renderWithProviders(
    <WarehouseNumberingModal open storeId="store-1" onClose={onClose} onCreated={onCreated} />,
  );
  return { onClose, onCreated };
}

/** Ombor raqamini kiritish — retseptni «tayyor» qiladi (default 1 stelaj 4×10). */
async function typeWarehouseNo(user: ReturnType<typeof userEvent.setup>, no = '03') {
  await user.type(screen.getByTestId('numbering-no'), no);
}

beforeEach(() => {
  vi.mocked(api.post).mockReset();
  vi.mocked(api.post).mockResolvedValue(PREVIEW);
});

describe('WarehouseNumberingModal', () => {
  it("ombor raqami kiritilgach dryRun so'rovi to'g'ri payload bilan ketadi", async () => {
    const user = userEvent.setup();
    openModal();
    await typeWarehouseNo(user);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/stores/store-1/warehouse-numbering', {
        warehouseNo: '03',
        stelajlar: [{ qavatlar: 4, orinlar: 10 }],
        dryRun: true,
      }),
    );
    expect(screen.getByTestId('numbering-counts').textContent).toContain('8');
    expect(screen.getByTestId('numbering-zones').textContent).toContain('03-01');
  });

  it("ombor raqami bo'sh bo'lsa so'rov YUBORILMAYDI", async () => {
    openModal();
    // Debounce oynasidan kattaroq kutamiz — so'rov baribir ketmasligi kerak.
    await new Promise((r) => setTimeout(r, 600));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('stelajlar soni qatorlarni boshqaradi, yangi qator oxirgisining nusxasi', async () => {
    const user = userEvent.setup();
    openModal();
    await typeWarehouseNo(user);

    const qavat0 = screen.getByTestId('numbering-qavat-0');
    await user.clear(qavat0);
    await user.type(qavat0, '6');

    const count = screen.getByTestId('numbering-count');
    await user.clear(count);
    await user.type(count, '3');

    expect(screen.getByTestId('numbering-qavat-2')).toHaveValue('6');
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/admin/stores/store-1/warehouse-numbering', {
        warehouseNo: '03',
        stelajlar: [
          { qavatlar: 6, orinlar: 10 },
          { qavatlar: 6, orinlar: 10 },
          { qavatlar: 6, orinlar: 10 },
        ],
        dryRun: true,
      }),
    );
  });

  it("«1-stelajni hammasiga qo'llash» qatorlarni tenglashtiradi", async () => {
    const user = userEvent.setup();
    openModal();
    await typeWarehouseNo(user);

    const count = screen.getByTestId('numbering-count');
    await user.clear(count);
    await user.type(count, '2');

    const orin1 = screen.getByTestId('numbering-orin-1');
    await user.clear(orin1);
    await user.type(orin1, '20');

    const qavat0 = screen.getByTestId('numbering-qavat-0');
    await user.clear(qavat0);
    await user.type(qavat0, '5');

    await user.click(screen.getByTestId('numbering-apply-first'));
    expect(screen.getByTestId('numbering-qavat-1')).toHaveValue('5');
    expect(screen.getByTestId('numbering-orin-1')).toHaveValue('10');
  });

  it('yaratish: dryRun:false bilan post, onCreated ombor diapazoni bilan chaqiriladi', async () => {
    const user = userEvent.setup();
    const { onClose, onCreated } = openModal();
    await typeWarehouseNo(user);
    await waitFor(() => expect(screen.getByTestId('numbering-create')).toBeEnabled());

    vi.mocked(api.post).mockResolvedValueOnce({ ...PREVIEW, created: 8, zonesCreated: 2 });
    await user.click(screen.getByTestId('numbering-create'));

    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/admin/stores/store-1/warehouse-numbering', {
        warehouseNo: '03',
        stelajlar: [{ qavatlar: 4, orinlar: 10 }],
        dryRun: false,
      }),
    );
    // Etiketka filtri: faqat ombor segmenti chegaralangan — yangi omborning
    // HAMMA yacheykasi belgilanadi.
    expect(onCreated).toHaveBeenCalledWith([{ from: 3, to: 3 }, null, null, null]);
    expect(onClose).toHaveBeenCalled();
  });

  it("server xatosi shundoq ko'rsatiladi (stelaj raqamli matn)", async () => {
    const user = userEvent.setup();
    openModal();
    vi.mocked(api.post).mockRejectedValue(
      new Error("2-stelaj: qavatlar soni 1–99 oralig'ida bo'lsin"),
    );
    await typeWarehouseNo(user);

    await waitFor(() =>
      expect(screen.getByTestId('numbering-error').textContent).toContain('2-stelaj'),
    );
    expect(screen.getByTestId('numbering-create')).toBeDisabled();
  });
});
