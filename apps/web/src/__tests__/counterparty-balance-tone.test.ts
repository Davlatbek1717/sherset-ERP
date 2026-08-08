import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BALANCE_TONE_CLASS,
  counterpartyBalanceTone,
  counterpartyBalanceToneClass,
} from '../lib/counterparty-balance-tone';

/**
 * Counterparty balance → colour tone — permanent lock (2026-08-08 owner rule).
 *
 * The inline balance line under «Контрагент» is a RISK signal: red iff the
 * counterparty owes us, green otherwise (zero balance included, and also when
 * WE owe them). This inverts the pre-2026-08-08 accounting-sign colouring
 * (positive was green) and turns the zero branch from muted grey to green.
 *
 * This is a DELIBERATE non-parity deviation from moysklad.uz — see the helper's
 * header comment. The tests below lock it so a later parity audit that "fixes"
 * the colour back to moysklad's sign-based scheme fails loudly instead of
 * silently reverting an owner decision.
 */

describe('counterpartyBalanceTone — canonical values', () => {
  it('positive balance (counterparty owes us) → debt', () => {
    expect(counterpartyBalanceTone(1n)).toBe('debt');
    expect(counterpartyBalanceTone(1_013_000_00n)).toBe('debt');
  });

  it('zero balance → clear (NOT muted, NOT debt)', () => {
    expect(counterpartyBalanceTone(0n)).toBe('clear');
  });

  it('negative balance (we owe them) → clear', () => {
    expect(counterpartyBalanceTone(-1n)).toBe('clear');
    expect(counterpartyBalanceTone(-500_000_00n)).toBe('clear');
  });

  it('debt is red, clear is green', () => {
    expect(BALANCE_TONE_CLASS.debt).toContain('--ms-text-destructive');
    expect(BALANCE_TONE_CLASS.clear).toContain('--ms-text-success');
    expect(counterpartyBalanceToneClass(5n)).toBe(BALANCE_TONE_CLASS.debt);
    expect(counterpartyBalanceToneClass(0n)).toBe(BALANCE_TONE_CLASS.clear);
    expect(counterpartyBalanceToneClass(-5n)).toBe(BALANCE_TONE_CLASS.clear);
  });
});

const SRC = join(__dirname, '..');
const INLINE = join(SRC, 'components', 'counterparty-balance-inline.tsx');

describe('drift-lock: the inline balance component resolves colour via the helper', () => {
  const src = readFileSync(INLINE, 'utf8');

  it('imports + uses the helper', () => {
    expect(src).toMatch(
      /import \{[^}]*counterpartyBalanceToneClass[^}]*\} from '@\/lib\/counterparty-balance-tone'/,
    );
    expect(src).toMatch(/counterpartyBalanceToneClass\(/);
  });

  it('hardcodes no colour class of its own (incl. the old muted zero branch)', () => {
    // Detector is non-vacuous: these are the exact shapes the file carried
    // before the fix — a sign ternary and a muted zero line.
    const BANNED = /--ms-text-(?:success|destructive|muted)/g;
    const offenders = src.match(BANNED) ?? [];
    expect(
      offenders,
      `counterparty-balance-inline.tsx must take every colour from counterpartyBalanceToneClass(); found: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the zero branch is coloured too (no uncoloured balance line)', () => {
    // Both render branches (rows and the zero fallback) must pass through the
    // helper — two call sites, not one.
    const calls = src.match(/counterpartyBalanceToneClass\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
