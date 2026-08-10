/**
 * MK40 brauzer-QA topilmasi — **egasi tayinlanmagan akkauntda imtiyoz oshirish**.
 *
 * Jonli oqim (Playwright, `climart_adopt`): faqat `employee:update` +
 * `role:*` ruxsatiga ega oddiy xodim o'z kartasidagi «Egasi qilish» tugmasini
 * bosdi va `POST /roles/owner/transfer` uni `AccountOwner` qilib qo'ydi —
 * cheklangan roli O'CHIB, o'rniga cheksiz egalik keldi.
 *
 * Sabab: `transferOwner` da tekshiruv `holders.length > 0` sharti bilan
 * boshlanardi, ya'ni **egasi hali yo'q bo'lsa hech kim tekshirilmasdi**.
 * G1 (rol matritsasi) bu yo'lni umuman ko'rmaydi: bu yerda matritsa yozilmaydi,
 * tayyor tizim roli biriktiriladi.
 *
 * Qoida: egasi yo'q bo'lsa ham birinchi egani FAQAT allaqachon cheksiz kirishga
 * ega aktor (Administrator yoki AccountOwner) tayinlay oladi — «o'zingda yo'q
 * narsani bera olmaysan» tamoyilining aynan o'zi.
 */
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RolesService } from './roles.service.js';

const ACC = 'acc-1';
const ACTOR = 'actor-1';
const TARGET = 'actor-1'; // o'ziga o'tkazish — hujumning aynan shakli
const OWNER_ROLE = 'owner-role-1';

function makeService(opts: {
  /** Aktordagi rollar (nomlari). */
  actorRoles: string[];
  /** Egalik roli egalari (bo'sh = akkauntda egasi yo'q). */
  ownerHolders?: string[];
}) {
  const employeeRole = {
    findMany: vi.fn(async () => (opts.ownerHolders ?? []).map((employeeId) => ({ employeeId }))),
    deleteMany: vi.fn(async () => ({})),
    create: vi.fn(async () => ({})),
    createMany: vi.fn(async () => ({})),
  };
  const employee = {
    findFirst: vi.fn(async () => ({ id: TARGET, archived: false })),
    findUnique: vi.fn(async () => ({
      roles: opts.actorRoles.map((name) => ({ role: { name } })),
    })),
  };
  const role = {
    findFirst: vi.fn(async ({ where }: { where: { name?: string } }) =>
      where.name === 'Administrator' ? { id: 'admin-role' } : { id: OWNER_ROLE, isSystem: true },
    ),
    create: vi.fn(async () => ({ id: OWNER_ROLE })),
  };
  const auditLog = { create: vi.fn(async () => ({})) };
  const prisma = {
    client: {
      employee,
      employeeRole,
      role,
      auditLog,
      $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) =>
        fn({ employeeRole, auditLog }),
      ),
    },
  };
  const permissions = { resolveScope: vi.fn(async () => 'NO'), invalidate: vi.fn() };
  // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for a unit test
  const svc = new RolesService(prisma as any, permissions as any);
  return { svc, employeeRole };
}

describe('MK40 — egasi tayinlanmaganda egalikni o‘zlashtirish to‘siladi', () => {
  it('oddiy xodim (Administrator emas) o‘zini egasi qila olmaydi → 403', async () => {
    const { svc, employeeRole } = makeService({ actorRoles: ['QA MK40 Menejer'] });
    await expect(svc.transferOwner(ACC, TARGET, ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
    // Hech nima yozilmasin — yarim qo'llash yo'q.
    expect(employeeRole.create).not.toHaveBeenCalled();
    expect(employeeRole.deleteMany).not.toHaveBeenCalled();
  });

  it('Administrator birinchi egani tayinlay oladi', async () => {
    const { svc, employeeRole } = makeService({ actorRoles: ['Administrator'] });
    await expect(svc.transferOwner(ACC, TARGET, ACTOR)).resolves.toMatchObject({ ok: true });
    expect(employeeRole.create).toHaveBeenCalledTimes(1);
  });

  it('egasi bor bo‘lsa — eski qoida saqlanadi: begona aktor 403', async () => {
    const { svc } = makeService({
      actorRoles: ['Administrator'],
      ownerHolders: ['boshqa-xodim'],
    });
    await expect(svc.transferOwner(ACC, TARGET, ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('joriy egasi egalikni o‘tkaza oladi', async () => {
    const { svc, employeeRole } = makeService({
      actorRoles: ['AccountOwner'],
      ownerHolders: [ACTOR],
    });
    await expect(svc.transferOwner(ACC, 'boshqa-xodim', ACTOR)).resolves.toMatchObject({
      ok: true,
    });
    expect(employeeRole.create).toHaveBeenCalledTimes(1);
  });
});
