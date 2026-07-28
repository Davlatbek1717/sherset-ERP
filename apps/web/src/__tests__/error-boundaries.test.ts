import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOBAL_ERROR_STRINGS } from '../app/global-error';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

/**
 * Error-boundary guard (MASTER-TODO #144).
 *
 * Before 2026-07-28 the app shipped ZERO error boundaries across 325 pages:
 * any render throw produced a blank white screen (the 2026-06-08k POS-register
 * incident is the documented case). These locks make sure the boundaries stay
 * present, stay localized, and that `global-error.tsx` — which by construction
 * cannot use `useTranslations` — never drifts from the message files.
 */

const APP = join(__dirname, '..', 'app');

const BOUNDARIES = [
  { file: join(APP, '(app)', 'error.tsx'), marker: 'app-error-boundary' },
  { file: join(APP, '(app)', 'not-found.tsx'), marker: 'app-not-found' },
  { file: join(APP, 'not-found.tsx'), marker: 'root-not-found' },
  { file: join(APP, 'global-error.tsx'), marker: 'global-error-boundary' },
];

describe('error boundaries exist (no more silent white screens)', () => {
  for (const { file, marker } of BOUNDARIES) {
    it(`${marker} — file present and marked`, () => {
      expect(existsSync(file), `${file} missing`).toBe(true);
      const src = readFileSync(file, 'utf8');
      expect(src).toContain(`data-test-id="${marker}"`);
      expect(src.startsWith("'use client';")).toBe(true);
    });
  }

  it('the two crash boundaries offer a recovery action', () => {
    const appErr = readFileSync(join(APP, '(app)', 'error.tsx'), 'utf8');
    const globalErr = readFileSync(join(APP, 'global-error.tsx'), 'utf8');
    // `reset()` is the only way back without a full reload.
    expect(appErr).toMatch(/onClick=\{reset\}/);
    expect(globalErr).toMatch(/onClick=\{reset\}/);
  });

  it('global-error renders its own html/body (it replaces the root layout)', () => {
    const src = readFileSync(join(APP, 'global-error.tsx'), 'utf8');
    expect(src).toContain('<html');
    expect(src).toContain('<body>');
  });

  it('global-error does NOT use useTranslations (no provider above it)', () => {
    // Strip comments first — the file's header comment EXPLAINS why it cannot
    // use useTranslations, so a raw substring scan would false-fail.
    const src = readFileSync(join(APP, 'global-error.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/from\s+'next-intl'/);
    expect(src).not.toMatch(/\buseTranslations\s*\(/);
  });
});

describe('global-error strings stay verbatim-synced with the message files', () => {
  const KEYS = ['crash_title', 'crash_hint', 'retry'] as const;

  for (const key of KEYS) {
    it(`errors.${key} — uz matches uz.json`, () => {
      expect(GLOBAL_ERROR_STRINGS.uz[key]).toBe(
        (uz as { errors: Record<string, string> }).errors[key],
      );
    });
    it(`errors.${key} — ru matches ru.json`, () => {
      expect(GLOBAL_ERROR_STRINGS.ru[key]).toBe(
        (ru as { errors: Record<string, string> }).errors[key],
      );
    });
  }

  it('covers exactly the locales the app supports', () => {
    expect(Object.keys(GLOBAL_ERROR_STRINGS).sort()).toEqual(['ru', 'uz']);
  });
});

describe('the localized boundaries resolve every key they render', () => {
  const USED = [
    'crash_title',
    'crash_hint',
    'retry',
    'go_home',
    'details',
    'not_found_title',
    'not_found_hint',
  ];

  for (const key of USED) {
    it(`errors.${key} exists in ru + uz`, () => {
      expect(
        (ru as { errors: Record<string, string> }).errors[key],
        `ru.errors.${key}`,
      ).toBeTruthy();
      expect(
        (uz as { errors: Record<string, string> }).errors[key],
        `uz.errors.${key}`,
      ).toBeTruthy();
    });
  }
});
