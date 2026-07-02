import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Employee-pair optimistic-lock source contract (2026-06-08i).
 *
 * ONE physical Employee row is editable from THREE field-edit forms, so all
 * three lost-update surfaces converge on the single `version` column:
 *   - /hr/employees        (HrEmployeeService.update)  — check + increment
 *   - /analitika/staff/:id  (StaffService.update)       — check + increment (tx)
 *   - /auth/me              (AuthController.updateMe)    — bump-only
 * plus the writers of edit-form-visible fields (archive/restore/set-password)
 * which bump-only so a stale edit-form save 409s.
 *
 * The design hinges on a DISCRIMINATOR that no typechecker / linter can see:
 * "is this field shown in an edit form?". Auth BOOKKEEPING writes (login success
 * / failure → lastLoginAt + failedLoginAttempts + lockedUntil, and password
 * resets → passwordHash) are NOT edit-form fields, so they must NEVER bump the
 * version — otherwise every open admin edit-form would 409 after any login (the
 * exact false-409 hazard that got this pair deferred). This test pins BOTH
 * directions: the locked paths increment, the auth bookkeeping path does not.
 * All paths were runtime-verified live (api+db lock battery, 2026-06-08i).
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const countVersionBumps = (src: string) =>
  (src.match(/version:\s*\{\s*increment:\s*1\s*\}/g) ?? []).length;

describe('Employee optimistic-lock — the three locked edit-form paths', () => {
  it('HrEmployeeService.update: versioned WHERE + increment + 409 mapping', () => {
    const src = read('../hr/hr-employee/hr-employee.service.ts');
    expect(src).toMatch(/where:\s*\{\s*id,\s*version:\s*input\.version\s*\}/);
    // The catch routes through the shared helper (11ac): a version-guard miss →
    // OptimisticLockException('Employee'); a bad nested connect → 400 bad-reference.
    expect(src).toContain("mapVersionedUpdateError(e, 'Employee')");
  });

  it('HrEmployeeService bumps version on EVERY edit-form-field writer (update + archive/restore + set-password)', () => {
    const src = read('../hr/hr-employee/hr-employee.service.ts');
    // update + softDelete + setArchived + setPassword = 4 bumps. (`archived` and
    // `username` are staff-form fields, so their discrete writers must bump too,
    // unlike most entities — this is the Employee-specific specialization.)
    expect(countVersionBumps(src)).toBeGreaterThanOrEqual(4);
  });

  it('StaffService.update: versioned WHERE inside the tx (guards the EmployeeRole rewrite) + 409 mapping', () => {
    const src = read('../analitika/staff.service.ts');
    expect(src).toMatch(/where:\s*\{\s*id,\s*version:\s*input\.version\s*\}/);
    expect(src).toContain("mapVersionedUpdateError(e, 'Employee')");
    // The versioned header update must ALWAYS run (no `Object.keys(data).length`
    // gate) so a roleIds-only edit still bumps + checks the version.
    expect(src).not.toMatch(/if\s*\(\s*Object\.keys\(data\)\.length\s*>\s*0\s*\)/);
  });

  it('AuthController.updateMe: bump-only (increments version, no version-check)', () => {
    const src = read('../auth/auth.controller.ts');
    expect(countVersionBumps(src)).toBeGreaterThanOrEqual(1);
    // self-profile is contract-stable: it must NOT add a version filter to WHERE.
    expect(src).not.toMatch(/where:\s*\{\s*id:\s*user\.sub,\s*version/);
  });
});

describe('Employee optimistic-lock — auth bookkeeping must STAY unguarded (the false-409 guard)', () => {
  it('AuthService login/password writes never bump version (would 409 every login after)', () => {
    const src = read('../auth/auth.service.ts');
    // The login-success, failed-login and password-reset employee.update calls
    // write lastLoginAt / failedLoginAttempts / lockedUntil / passwordHash —
    // none of which are edit-form fields. Versioning them is the regression this
    // whole design avoids, so the file must contain ZERO version bumps.
    expect(countVersionBumps(src)).toBe(0);
  });
});
