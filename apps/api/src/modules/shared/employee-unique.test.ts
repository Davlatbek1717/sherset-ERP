import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { throwIfEmployeeUniqueViolation } from './employee-unique.js';
import { OPTIMISTIC_LOCK_CODE } from './optimistic-lock.js';

/** Build a Prisma-shaped P2002 the way the live client emits it (grounded via
 *  scripts/probe-employee-p2002-shape.mts: meta.target is the field array). */
function p2002(target: string[] | string) {
  return Object.assign(new Error('Unique constraint failed'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2002',
    meta: { modelName: 'Employee', target },
  });
}

describe('throwIfEmployeeUniqueViolation', () => {
  it('maps a P2002 on the email index to a ConflictException naming email', () => {
    expect(() => throwIfEmployeeUniqueViolation(p2002(['account_id', 'email']))).toThrow(
      ConflictException,
    );
    expect(() => throwIfEmployeeUniqueViolation(p2002(['account_id', 'email']))).toThrow(/email/i);
  });

  it('maps a P2002 on the username partial index to a ConflictException naming login', () => {
    expect(() => throwIfEmployeeUniqueViolation(p2002(['account_id', 'username']))).toThrow(
      ConflictException,
    );
    expect(() => throwIfEmployeeUniqueViolation(p2002(['account_id', 'username']))).toThrow(
      /login/i,
    );
  });

  it('maps a P2002 on an unknown Employee target to a generic ConflictException', () => {
    expect(() => throwIfEmployeeUniqueViolation(p2002(['account_id', 'phone']))).toThrow(
      ConflictException,
    );
  });

  it('does NOT carry the OPTIMISTIC_LOCK code (web client must show a plain conflict, not the reload dialog)', () => {
    try {
      throwIfEmployeeUniqueViolation(p2002(['account_id', 'email']));
      throw new Error('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      const resp = (e as ConflictException).getResponse();
      const code = typeof resp === 'object' ? (resp as { code?: string }).code : undefined;
      expect(code).not.toBe(OPTIMISTIC_LOCK_CODE);
    }
  });

  it('discriminates even when meta.target is a string (driver/index-name variance)', () => {
    expect(() => throwIfEmployeeUniqueViolation(p2002('Employee_account_username_uk'))).toThrow(
      /login/i,
    );
  });

  it('returns (does NOT throw) for non-P2002 errors so the caller can map/rethrow them', () => {
    // P2025 must pass through untouched — the caller maps it to OptimisticLockException.
    expect(() =>
      throwIfEmployeeUniqueViolation(Object.assign(new Error('nf'), { code: 'P2025' })),
    ).not.toThrow();
    expect(() => throwIfEmployeeUniqueViolation(new Error('connection lost'))).not.toThrow();
    expect(() => throwIfEmployeeUniqueViolation(null)).not.toThrow();
    expect(() => throwIfEmployeeUniqueViolation(undefined)).not.toThrow();
  });
});
