import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SupplyApprovalService } from './supply-approval.service.js';

/**
 * Faza E magic-link — xavfsizlik/validatsiya (DB'siz, mock prisma).
 * To'liq oqim (tasdiq→stock) — Phase-2 jonli QA.
 */
function svcWith(linkRow: unknown) {
  const prisma = {
    client: {
      supplyApprovalLink: {
        findUnique: vi.fn(async () => linkRow),
        update: vi.fn(async () => ({})),
      },
      supply: { findFirst: vi.fn(async () => null) },
    },
  };
  return new SupplyApprovalService(prisma as never, {} as never);
}

describe('decideViaLink — rad sababi majburiy', () => {
  it('rad + sababsiz → BadRequest (DB tegilmaydi)', async () => {
    const svc = svcWith(null);
    await expect(svc.decideViaLink('tok', false, '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.decideViaLink('tok', false, '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.decideViaLink('tok', false, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('loadValidLink — muddat/mavjudlik (getPublicSupplyView orqali)', () => {
  it('token topilmasa → NotFound', async () => {
    const svc = svcWith(null);
    await expect(svc.getPublicSupplyView('yoq')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("muddati o'tган token → NotFound", async () => {
    const svc = svcWith({
      id: 'l1',
      accountId: 'a1',
      supplyId: 's1',
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(svc.getPublicSupplyView('eski')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('yaroqli token, lekin qabul topilmasa → NotFound', async () => {
    const svc = svcWith({
      id: 'l1',
      accountId: 'a1',
      supplyId: 's1',
      expiresAt: new Date(Date.now() + 100000),
    });
    await expect(svc.getPublicSupplyView('yaroqli')).rejects.toBeInstanceOf(NotFoundException);
  });
});
