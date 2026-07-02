import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  OPTIMISTIC_LOCK_CODE,
  OptimisticLockException,
  isNestedConnectNotFound,
  isRecordNotFound,
  mapVersionedUpdateError,
} from './optimistic-lock.js';
import { BAD_REFERENCE_MESSAGE } from './prisma-exception.filter.js';

/**
 * P2025 is overloaded on a version-guarded `update` that also performs nested
 * `connect`s. These tests lock the disambiguation (audit §3 of the 11ab
 * Prisma-not-found filter): a bad nested connect → 400 bad-reference, a
 * version-guard miss / concurrent delete → 409 optimistic-lock.
 *
 * The `cause` strings below are GROUNDED — captured verbatim from the live
 * Prisma 5.x client against PostgreSQL via a throwaway probe (counterparty
 * `update`, 2026-06-12). Locking them here means a Prisma upgrade that changes
 * the wording fails this test loudly instead of silently regressing the
 * classification back to "everything is an optimistic-lock conflict".
 */

/** Verbatim `meta.cause` Prisma emits when a nested `connect` references a missing row. */
const CAUSE_BAD_CONNECT =
  "No 'Group' record(s) (needed to inline the relation on 'Counterparty' record(s)) was found for a nested connect on one-to-many relation 'CounterpartyToGroup'.";
/** Verbatim `meta.cause` Prisma emits when `where: { id, version }` matches zero rows. */
const CAUSE_UPDATE_MISS = 'Record to update not found.';
/** Verbatim `meta.cause` Prisma emits when a delete matches zero rows. */
const CAUSE_DELETE_MISS = 'Record to delete does not exist.';

function p2025(cause?: string) {
  return Object.assign(new Error('db boom'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2025',
    ...(cause === undefined ? {} : { meta: { modelName: 'Counterparty', cause } }),
  });
}

describe('isNestedConnectNotFound — grounded cause classification', () => {
  it('is TRUE for a bad nested connect (grounded cause)', () => {
    expect(isNestedConnectNotFound(p2025(CAUSE_BAD_CONNECT))).toBe(true);
  });

  it('is FALSE for a version-guard miss / record-to-update-not-found (grounded cause)', () => {
    expect(isNestedConnectNotFound(p2025(CAUSE_UPDATE_MISS))).toBe(false);
  });

  it('is FALSE for a record-to-delete-not-found (grounded cause)', () => {
    expect(isNestedConnectNotFound(p2025(CAUSE_DELETE_MISS))).toBe(false);
  });

  it('is FALSE for a P2025 with no meta (degrades safely to the lock path)', () => {
    expect(isNestedConnectNotFound(p2025())).toBe(false);
  });

  it('is FALSE for a non-P2025 error', () => {
    expect(isNestedConnectNotFound(Object.assign(new Error('x'), { code: 'P2002' }))).toBe(false);
    expect(isNestedConnectNotFound(null)).toBe(false);
    expect(isNestedConnectNotFound(new Error('plain'))).toBe(false);
  });
});

describe('mapVersionedUpdateError', () => {
  it('maps a bad nested connect to 400 BadRequest with BAD_REFERENCE_MESSAGE (was a misleading 409 reload)', () => {
    try {
      mapVersionedUpdateError(p2025(CAUSE_BAD_CONNECT), 'Counterparty');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getStatus()).toBe(400);
      const body = (e as BadRequestException).getResponse() as { message?: string };
      expect(body.message).toBe(BAD_REFERENCE_MESSAGE);
    }
  });

  it('maps a version-guard miss to 409 OptimisticLockException (form is stale → reload)', () => {
    try {
      mapVersionedUpdateError(p2025(CAUSE_UPDATE_MISS), 'Counterparty');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OptimisticLockException);
      expect((e as OptimisticLockException).getStatus()).toBe(409);
      const body = (e as OptimisticLockException).getResponse() as {
        code?: string;
        message?: string;
      };
      expect(body.code).toBe(OPTIMISTIC_LOCK_CODE);
      expect(body.message).toContain('Counterparty');
    }
  });

  it('maps a P2025 with no meta to 409 OptimisticLockException (safe default)', () => {
    expect(() => mapVersionedUpdateError(p2025(), 'Store')).toThrow(OptimisticLockException);
  });

  it('does NOT throw for a non-P2025 error — caller falls through to handlePrisma', () => {
    const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
    expect(() => mapVersionedUpdateError(p2002, 'Counterparty')).not.toThrow();
    expect(() => mapVersionedUpdateError(new Error('plain'), 'Counterparty')).not.toThrow();
    expect(() => mapVersionedUpdateError(null, 'Counterparty')).not.toThrow();
  });

  it('still recognises a bare P2025 (no meta) via isRecordNotFound for the lock branch', () => {
    // Guards the layering: isRecordNotFound stays the broad P2025 test; the
    // narrow nested-connect classifier only refines which P2025s become 400.
    expect(isRecordNotFound(p2025())).toBe(true);
    expect(isRecordNotFound(p2025(CAUSE_BAD_CONNECT))).toBe(true);
  });
});

/**
 * Source-scan guard (regression-lock for the 11ac sweep). The old bypass pattern
 *   `if (isRecordNotFound(e)) throw new OptimisticLockException(...)`
 * misclassifies a bad nested `connect` P2025 as a 409 reload. Every locked-update
 * catch must instead route through `mapVersionedUpdateError`, which disambiguates
 * the connect failure → 400. This guard fails if a service reintroduces the raw
 * pattern (e.g. a new entity copy-pasted from an old example) so the bug-class
 * cannot silently return.
 */
describe('source-scan: no service bypasses mapVersionedUpdateError', () => {
  const MODULES_DIR = join(__dirname, '..');
  const BYPASS = /isRecordNotFound\([^)]*\)\)\s*throw new OptimisticLockException/;

  /** @returns {string[]} every *.service.ts under modules/ */
  function serviceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...serviceFiles(p));
      else if (name.endsWith('.service.ts')) out.push(p);
    }
    return out;
  }

  it('finds the service tree (sanity: > 50 service files scanned)', () => {
    expect(serviceFiles(MODULES_DIR).length).toBeGreaterThan(50);
  });

  it('no *.service.ts contains the raw isRecordNotFound→OptimisticLockException one-liner', () => {
    const offenders = serviceFiles(MODULES_DIR).filter((f) => BYPASS.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
