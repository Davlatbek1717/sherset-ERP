import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProductRepository } from './product.repository.js';
import { ProductService } from './product.service.js';

function makeService() {
  const repo = {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    softDelete: vi.fn(),
    // Cross-tenant FK guards — default to "exists" so the happy-path tests are
    // unaffected; individual tests flip one to false to assert the guard fires.
    counterpartyExists: vi.fn(async () => true),
    folderExists: vi.fn(async () => true),
    employeeExists: vi.fn(async () => true),
    groupExists: vi.fn(async () => true),
  } as unknown as ProductRepository;

  const prisma = {
    client: {
      auditLog: { create: vi.fn() },
      employee: { findUnique: vi.fn(async () => null) },
      // «Код» auto-allocation on create-with-no-code: atomic counter (seeded once
      // from maxProductCode → product.findMany) then increment. Defaults make the
      // first allocation return value 1 → code "00001".
      documentSequence: {
        findUnique: vi.fn(async () => null),
        createMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({ value: 1 })),
      },
      // `findFirst` = the free-code collision probe (`assortmentCodeTaken`); null
      // means the allocated code is unused, which is the healthy-counter path.
      product: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
      // MASTER-TODO #24: `maxProductCode` seeds the shared «Код» sequence from
      // BOTH tables — moysklad gives a product and its modifications one
      // sequence (Скоч маляр 00001 → its variants 00002, 00003). The mock only
      // had `product`, so create() threw «Cannot read properties of undefined
      // (reading 'findMany')» and the VAT / audit / owner tests failed for a
      // reason unrelated to what they assert.
      variant: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    },
  };

  const service = new ProductService(repo, prisma as never);
  return { service, repo, prisma };
}

describe('ProductService', () => {
  it('validates name is required on create', async () => {
    const { service } = makeService();
    await expect(service.create('acc', 'user', { name: '' })).rejects.toThrow(
      /required|majburiy|at least/i,
    );
  });

  it('requires GTIN for marked products', async () => {
    const { service } = makeService();
    await expect(
      service.create('acc', 'user', {
        name: 'Phones',
        trackingType: 'TOBACCO',
        // no gtin
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows VAT null with useParentVat=true', async () => {
    const { service, repo } = makeService();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      name: 'OK',
    });
    await expect(
      service.create('acc', 'user', {
        name: 'OK',
        useParentVat: true,
      }),
    ).resolves.toBeDefined();
  });

  it('throws NotFoundException when product not found', async () => {
    const { service, repo } = makeService();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.findById('acc', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('logs audit event on create', async () => {
    const { service, repo, prisma } = makeService();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      name: 'Test',
    });
    await service.create('acc', 'user', { name: 'Test' });
    expect(prisma.client.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc',
        userId: 'user',
        entity: 'Product',
        entityId: 'p1',
        action: 'create',
      }),
    });
  });
});

/**
 * «Доступ — Владелец» (ownerId) + cross-tenant FK guard on create AND edit.
 *
 * moysklad lets the create/edit form choose the owning employee; the service
 * must thread a chosen ownerId to the repo (omit ⇒ the repo stamps the actor).
 * AND every assignable relation id (owner/group/folder/supplier) must be proven
 * to belong to THIS account before it is written — the FK references only [id],
 * so a bare connect / unchecked scalar would otherwise silently accept another
 * tenant's row (the gap that existed on create/edit until now; bulk-edit was
 * already guarded in 849a9653).
 */
describe('ProductService «Доступ» owner + cross-tenant FK guard (create + edit)', () => {
  const owner = '22222222-2222-2222-2222-222222222222';

  it('create passes a chosen ownerId through to the repo', async () => {
    const { service, repo } = makeService();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', name: 'X' });
    await service.create('acc', 'actor', { name: 'X', ownerId: owner });
    expect(repo.create).toHaveBeenCalledWith(
      'acc',
      'actor',
      expect.objectContaining({ ownerId: owner }),
    );
    expect(repo.employeeExists).toHaveBeenCalledWith('acc', owner);
  });

  it('create rejects a foreign-tenant owner (404, before the repo write)', async () => {
    const { service, repo } = makeService();
    (repo.employeeExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(service.create('acc', 'actor', { name: 'X', ownerId: owner })).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create rejects a foreign-tenant supplier', async () => {
    const { service, repo } = makeService();
    (repo.counterpartyExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(
      service.create('acc', 'actor', {
        name: 'X',
        supplierId: '33333333-3333-3333-3333-333333333333',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create rejects a foreign-tenant folder and group', async () => {
    const folder = '44444444-4444-4444-4444-444444444444';
    const group = '55555555-5555-5555-5555-555555555555';
    const f = makeService();
    (f.repo.folderExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(
      f.service.create('acc', 'actor', { name: 'X', productFolderId: folder }),
    ).rejects.toThrow(NotFoundException);

    const g = makeService();
    (g.repo.groupExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(g.service.create('acc', 'actor', { name: 'X', groupId: group })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('edit rejects a foreign-tenant owner (404, before the repo update)', async () => {
    const { service, repo } = makeService();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      name: 'X',
      version: 1,
    });
    (repo.employeeExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(
      service.update('acc', 'actor', 'p1', { name: 'X', version: 1, ownerId: owner }),
    ).rejects.toThrow(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('edit accepts a valid owner re-assignment', async () => {
    const { service, repo } = makeService();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      name: 'X',
      version: 1,
    });
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      name: 'X',
      ownerId: owner,
      version: 2,
    });
    await expect(
      service.update('acc', 'actor', 'p1', { name: 'X', version: 1, ownerId: owner }),
    ).resolves.toMatchObject({ ownerId: owner });
    expect(repo.employeeExists).toHaveBeenCalledWith('acc', owner);
  });
});
