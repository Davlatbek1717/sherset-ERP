import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  MassEditBaseSchema,
  assertMassEditRefsInTenant,
  assertPatchHasAtLeastOneField,
} from './mass-edit.js';

const uuid = () => crypto.randomUUID();

describe('MassEditBaseSchema', () => {
  it('accepts ids with optional ownerId / projectId / description', () => {
    const r = MassEditBaseSchema.parse({
      ids: [uuid(), uuid()],
      ownerId: uuid(),
      description: 'note',
    });
    expect(r.ids).toHaveLength(2);
    expect(r.description).toBe('note');
  });

  it('accepts ids alone (further validation lives in assertPatchHasAtLeastOneField)', () => {
    const r = MassEditBaseSchema.parse({ ids: [uuid()] });
    expect(r.ids).toHaveLength(1);
  });

  it('accepts explicit null for nullable fields', () => {
    const r = MassEditBaseSchema.parse({
      ids: [uuid()],
      ownerId: null,
      projectId: null,
      description: null,
    });
    expect(r.ownerId).toBeNull();
    expect(r.projectId).toBeNull();
    expect(r.description).toBeNull();
  });

  it('rejects empty ids', () => {
    expect(() => MassEditBaseSchema.parse({ ids: [] })).toThrow();
  });

  it('rejects > 100 ids', () => {
    const ids = Array.from({ length: 101 }, uuid);
    expect(() => MassEditBaseSchema.parse({ ids })).toThrow();
  });

  it('rejects non-uuid id entries', () => {
    expect(() => MassEditBaseSchema.parse({ ids: ['not-uuid'] })).toThrow();
  });

  it('rejects non-uuid ownerId', () => {
    expect(() => MassEditBaseSchema.parse({ ids: [uuid()], ownerId: 'nope' })).toThrow();
  });

  it('rejects description longer than 4096 chars', () => {
    const long = 'a'.repeat(4097);
    expect(() => MassEditBaseSchema.parse({ ids: [uuid()], description: long })).toThrow();
  });
});

describe('assertPatchHasAtLeastOneField', () => {
  it('passes when at least one whitelisted field is present', () => {
    expect(() =>
      assertPatchHasAtLeastOneField({ ownerId: 'x' }, ['ownerId', 'projectId']),
    ).not.toThrow();
    expect(() =>
      assertPatchHasAtLeastOneField({ projectId: null }, ['ownerId', 'projectId']),
    ).not.toThrow();
  });

  it('throws a ZodError when no whitelisted field is present', () => {
    let thrown: unknown;
    try {
      assertPatchHasAtLeastOneField({ irrelevant: 1 }, ['ownerId', 'projectId']);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(z.ZodError);
    expect((thrown as z.ZodError).issues[0]?.path).toEqual(['patch']);
  });

  it('counts explicit null as "present"', () => {
    expect(() => assertPatchHasAtLeastOneField({ ownerId: null }, ['ownerId'])).not.toThrow();
  });

  it('throws when the patch is empty', () => {
    expect(() => assertPatchHasAtLeastOneField({}, ['ownerId'])).toThrow(z.ZodError);
  });
});

describe('assertMassEditRefsInTenant', () => {
  const ACCOUNT = 'acc-1';

  /** Minimal prisma stub — the real DB integration is covered by the live
   * cross-tenant smoke (verify-mass-edit-tenant-smoke.ts); here we only
   * pin the helper's control flow. `found` decides whether findFirst
   * resolves to a row or null. */
  function stub(found: { employee: boolean; project: boolean }) {
    const employee = vi.fn().mockResolvedValue(found.employee ? { id: 'e' } : null);
    const project = vi.fn().mockResolvedValue(found.project ? { id: 'p' } : null);
    const prisma = {
      client: { employee: { findFirst: employee }, project: { findFirst: project } },
    };
    return { prisma: prisma as unknown as PrismaService, employee, project };
  }

  it('skips DB checks when no FK is present (description-only / empty patch)', async () => {
    const { prisma, employee, project } = stub({ employee: true, project: true });
    await expect(assertMassEditRefsInTenant(prisma, ACCOUNT, {})).resolves.toBeUndefined();
    await expect(
      assertMassEditRefsInTenant(prisma, ACCOUNT, { ownerId: null, projectId: null }),
    ).resolves.toBeUndefined();
    expect(employee).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
  });

  it('passes when both refs resolve inside the tenant', async () => {
    const { prisma, employee, project } = stub({ employee: true, project: true });
    await expect(
      assertMassEditRefsInTenant(prisma, ACCOUNT, { ownerId: 'e', projectId: 'p' }),
    ).resolves.toBeUndefined();
    expect(employee).toHaveBeenCalledWith({
      where: { id: 'e', accountId: ACCOUNT },
      select: { id: true },
    });
    expect(project).toHaveBeenCalledWith({
      where: { id: 'p', accountId: ACCOUNT },
      select: { id: true },
    });
  });

  it('rejects a cross-tenant ownerId (employee not in account)', async () => {
    const { prisma } = stub({ employee: false, project: true });
    await expect(
      assertMassEditRefsInTenant(prisma, ACCOUNT, { ownerId: 'other-acct-emp' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a cross-tenant projectId (project not in account)', async () => {
    const { prisma } = stub({ employee: true, project: false });
    await expect(
      assertMassEditRefsInTenant(prisma, ACCOUNT, { projectId: 'other-acct-prj' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks only the FK that is present (owner-only services skip project)', async () => {
    const { prisma, employee, project } = stub({ employee: true, project: true });
    await assertMassEditRefsInTenant(prisma, ACCOUNT, { ownerId: 'e' });
    expect(employee).toHaveBeenCalledTimes(1);
    expect(project).not.toHaveBeenCalled();
  });
});
