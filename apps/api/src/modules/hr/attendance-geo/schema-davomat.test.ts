import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * HR GPS-davomat schema guard — pins the new models + column extensions so a
 * later edit can't silently drop them. Mirrors the schema-text-assertion style
 * of employee-username-unique-index.test.ts (the db package has no test runner,
 * so schema guards live here in the API package).
 *
 * TZ: docs/superpowers/specs/2026-07-23-hr-gps-attendance-design.md
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const SCHEMA = join(REPO_ROOT, 'packages/db/prisma/schema.prisma');

// Strip comments — the models carry `///` doc-comments that mention these
// tokens in prose; a raw scan must match live declarations, not the docs.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const modelBlock = (schema: string, name: string): string =>
  schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';

describe('HR davomat gps schema', () => {
  const schema = stripComments(readFileSync(SCHEMA, 'utf8'));

  it('declares HrWorkLocation with radius default 150 + archived index', () => {
    const m = modelBlock(schema, 'HrWorkLocation');
    expect(m).toMatch(/radiusMeters\s+Int\s+@default\(150\)/);
    expect(m).toContain('@@map("hr_work_locations")');
    expect(m).toMatch(/@@index\(\[accountId,\s*archived\]\)/);
  });

  it('declares EmployeeWorkSchedule with per-employee-per-weekday unique', () => {
    const m = modelBlock(schema, 'EmployeeWorkSchedule');
    expect(m).toMatch(/@@unique\(\[employeeId,\s*weekday\]\)/);
    expect(m).toContain('@@map("employee_work_schedules")');
    expect(m).toMatch(/weekday\s+Int/);
  });

  it('declares HrLocationPing with desc index', () => {
    const m = modelBlock(schema, 'HrLocationPing');
    expect(m).toMatch(/@@index\(\[accountId,\s*employeeId,\s*createdAt\(sort:\s*Desc\)\]\)/);
    expect(m).toContain('@@map("hr_location_pings")');
    expect(m).toMatch(/inside\s+Boolean/);
  });

  it('extends HrAttendance with geo + late + source columns', () => {
    const m = modelBlock(schema, 'HrAttendance');
    expect(m).toMatch(/lateMinutes\s+Int\s+@default\(0\)/);
    expect(m).toMatch(/source\s+String\s+@default\("auto_gps"\)/);
    expect(m).toMatch(/autoClosed\s+Boolean\s+@default\(false\)/);
    expect(m).toMatch(/checkInLat\s+Float\?/);
  });

  it('extends Employee with attendanceOptIn + workLocation', () => {
    const m = modelBlock(schema, 'Employee');
    expect(m).toMatch(/attendanceOptIn\s+Boolean\s+@default\(false\)/);
    expect(m).toMatch(/workLocationId\s+String\?/);
    expect(m).toMatch(/workSchedules\s+EmployeeWorkSchedule\[\]/);
  });
});
