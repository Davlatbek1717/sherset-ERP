/**
 * P11 — «Доступ только к точкам продаж» radiosi (`POST /roles/system/pos/ensure`).
 *
 * 🔴 Qulflanadigan bug-klass (2026-08-11 o'lchovi): bu radio — egasi uchun
 * xodimni kassirga aylantiradigan ENG ko'rinadigan yo'l — `uiMode` ni
 * umuman qo'ymasdi (sxema sukuti `full`) va qo'lda yozilgan 10 katakchali
 * matritsa berardi. Natija: «kassir» butun ERP menyusini ko'rar, qarz
 * to'lovi / xarajat / zakaz qabuli esa 403 bo'lardi. Endi ikkalasi ham
 * `cashier` shablonidan keladi.
 *
 * Mavjud rol TEGILMASLIGI ham shu yerda qulflanadi: ishlab turgan hisobda
 * kimningdir kirishi jimgina o'zgarib ketmasin.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolveTemplateMatrix } from './role-templates.js';
import { RolesService } from './roles.service.js';

const ACC = 'acc-1';

function makeService(existing: { id: string; name: string } | null) {
  const create = vi.fn(async () => ({ id: 'new-role', name: 'PointOfSale' }));
  const client = {
    role: {
      findFirst: vi.fn(async () => existing),
      create,
    },
  };
  const service = new RolesService({ client } as never, {} as never);
  return { service, create, client };
}

describe('ensurePosRole — kassir shabloni + kiosk', () => {
  it('yangi rol `uiMode=kiosk` va `templateSlug=cashier` bilan yaratiladi', async () => {
    const { service, create } = makeService(null);
    await service.ensurePosRole(ACC);

    const data = create.mock.calls[0]?.[0] as unknown as {
      data: { uiMode: string; templateSlug: string; isSystem: boolean };
    };
    expect(data.data.uiMode).toBe('kiosk');
    expect(data.data.templateSlug).toBe('cashier');
    expect(data.data.isSystem).toBe(true);
  });

  it('matritsa AYNAN `cashier` shablonidan (nusxa emas — registrdan)', async () => {
    const { service, create } = makeService(null);
    await service.ensurePosRole(ACC);

    const data = create.mock.calls[0]?.[0] as unknown as {
      data: { permissions: { createMany: { data: Array<{ entity: string; action: string }> } } };
    };
    const written = data.data.permissions.createMany.data;
    const expected = resolveTemplateMatrix('cashier').filter((c) => c.scope !== 'NO');
    expect(written).toHaveLength(expected.length);
    // Kassaga kerak bo'lgan, eski qo'lda ro'yxatda YO'Q bo'lgan bo'g'inlar:
    // qarz to'lovi va kassa xarajati (aks holda POS'da 403).
    const has = (entity: string, action: string) =>
      written.some((c) => c.entity === entity && c.action === action);
    expect(has('debtpayment', 'create')).toBe(true);
    expect(has('cashout', 'create')).toBe(true);
  });

  it('rol allaqachon bo`lsa — TEGILMAYDI (yozuv yo`q)', async () => {
    const { service, create } = makeService({ id: 'r-old', name: 'PointOfSale' });
    const res = await service.ensurePosRole(ACC);
    expect(res.id).toBe('r-old');
    expect(create).not.toHaveBeenCalled();
  });
});
