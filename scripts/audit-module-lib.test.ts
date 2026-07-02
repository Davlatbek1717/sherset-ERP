import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Item,
  buildTodo,
  diffDropdown,
  normalizeLabel,
  parseStaticOurs,
  referenceItemCount,
  verdict,
} from './audit-module-lib.js';

// ---- normalizeLabel ------------------------------------------------------

test('normalizeLabel: trims surrounding whitespace', () => {
  assert.equal(normalizeLabel('  Удалить  '), 'Удалить');
});

test('normalizeLabel: collapses NBSP and whitespace runs to a single space', () => {
  assert.equal(normalizeLabel('Массовое   редактирование'), 'Массовое редактирование');
});

test('normalizeLabel: strips zero-width and BOM characters', () => {
  assert.equal(normalizeLabel('﻿Цены...​'), 'Цены...');
});

test('normalizeLabel: preserves case (parity is case-sensitive)', () => {
  assert.equal(normalizeLabel('Удалить'), 'Удалить');
  assert.notEqual(normalizeLabel('удалить'), normalizeLabel('Удалить'));
});

// ---- diffDropdown --------------------------------------------------------

const I = (label: string, disabled = false): Item => ({ label, disabled });

test('diffDropdown: identical menus → no deltas, all matched', () => {
  const m = [I('Удалить'), I('Копировать', true)];
  const o = [I('Удалить'), I('Копировать', true)];
  const d = diffDropdown(m, o);
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.extra, []);
  assert.deepEqual(d.disabledMismatch, []);
  assert.equal(d.orderMismatch, false);
  assert.equal(d.matched, 2);
});

test('diffDropdown: item in moysklad but not ours → missing', () => {
  const d = diffDropdown([I('Удалить'), I('Объединить')], [I('Удалить')]);
  assert.deepEqual(
    d.missing.map((x) => x.label),
    ['Объединить'],
  );
  assert.deepEqual(d.extra, []);
});

test('diffDropdown: item in ours but not moysklad → extra', () => {
  const d = diffDropdown([I('Удалить')], [I('Удалить'), I('Открыть в API')]);
  assert.deepEqual(
    d.extra.map((x) => x.label),
    ['Открыть в API'],
  );
  assert.deepEqual(d.missing, []);
});

test('diffDropdown: same label, different disabled → disabledMismatch', () => {
  const d = diffDropdown([I('Копировать', false)], [I('Копировать', true)]);
  assert.deepEqual(d.disabledMismatch, [{ label: 'Копировать', moysklad: false, ours: true }]);
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.extra, []);
});

test('diffDropdown: same set, different order → orderMismatch', () => {
  const d = diffDropdown([I('Удалить'), I('Копировать')], [I('Копировать'), I('Удалить')]);
  assert.equal(d.orderMismatch, true);
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.extra, []);
});

test('diffDropdown: normalization applied before comparison (NBSP)', () => {
  const d = diffDropdown([I('Массовое редактирование')], [I('Массовое редактирование')]);
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.extra, []);
  assert.equal(d.matched, 1);
});

test('diffDropdown: empty moysklad menu with non-empty ours → all extra', () => {
  const d = diffDropdown([], [I('Удалить')]);
  assert.deepEqual(
    d.extra.map((x) => x.label),
    ['Удалить'],
  );
  assert.equal(d.matched, 0);
});

// ---- buildTodo + verdict -------------------------------------------------

test('buildTodo: aggregates totals across dropdowns', () => {
  const todo = buildTodo({
    bulk: diffDropdown([I('Удалить'), I('Объединить')], [I('Удалить'), I('Лишнее')]),
    print: diffDropdown([I('Ценник')], [I('Ценник')]),
  });
  assert.equal(todo.totals.missing, 1); // Объединить
  assert.equal(todo.totals.extra, 1); // Лишнее
  assert.equal(todo.totals.disabledMismatch, 0);
  assert.equal(todo.totals.orderMismatch, 0);
});

test('verdict: all-zero totals → exact', () => {
  const todo = buildTodo({ bulk: diffDropdown([I('Удалить')], [I('Удалить')]) });
  assert.equal(verdict(todo), 'exact');
});

test('verdict: any delta → delta', () => {
  const todo = buildTodo({ bulk: diffDropdown([I('Удалить')], []) });
  assert.equal(verdict(todo), 'delta');
});

// ---- referenceItemCount (both-empty / no-reference guard) ----------------

test('referenceItemCount: counts moysklad-side items (matched + missing)', () => {
  const todo = buildTodo({
    bulk: diffDropdown([I('Удалить'), I('Объединить')], [I('Удалить')]), // 1 matched + 1 missing
    print: diffDropdown([I('Ценник')], [I('Ценник')]), // 1 matched
  });
  assert.equal(referenceItemCount(todo), 3);
});

test('referenceItemCount: both sides empty → 0 (guards false-exact)', () => {
  // A double capture failure (no moysklad reference AND no live dump) yields
  // all-zero totals, which verdict() alone would call "exact". The orchestrator
  // uses referenceItemCount===0 to refuse that silent false-positive.
  const todo = buildTodo({ bulk: diffDropdown([], []) });
  assert.equal(verdict(todo), 'exact'); // pure verdict still says exact…
  assert.equal(referenceItemCount(todo), 0); // …but the guard catches it
});

// ---- parseStaticOurs -----------------------------------------------------

const RU = {
  bulk_actions: {
    trigger: 'Изменить',
    delete: 'Удалить',
    copy: 'Копировать',
    mass_edit: 'Массовое редактирование',
    merge: 'Объединить',
  },
  bulk: { archive: 'В архив', restore: 'Из архива' },
};

const FIXTURE = `
'use client';
import { useTranslations } from 'next-intl';
export function CounterpartyBulkActionsDropdown() {
  const t = useTranslations('bulk_actions');
  const tBulk = useTranslations('bulk');
  return (
    <DropdownMenu>
      <DropdownMenu.Item onSelect={handleDelete} destructive disabled={!hasSelection || isPending} testId="x-delete">
        {t('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="x-copy">
        {t('copy')}
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={onMassEdit} disabled={!hasSelection} testId="x-mass-edit">
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={handleArchive} disabled={!hasSelection || isPending} testId="x-archive">
        {tBulk('archive')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="x-merge">
        {t('merge')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
`;

test('parseStaticOurs: resolves labels across two i18n namespaces, in order', () => {
  const items = parseStaticOurs(FIXTURE, RU);
  assert.deepEqual(
    items.map((i) => i.label),
    ['Удалить', 'Копировать', 'Массовое редактирование', 'В архив', 'Объединить'],
  );
});

test('parseStaticOurs: bare `disabled` → disabled:true', () => {
  const items = parseStaticOurs(FIXTURE, RU);
  const copy = items.find((i) => i.label === 'Копировать');
  assert.equal(copy?.disabled, true);
});

test('parseStaticOurs: selection-conditional `disabled={...}` → enabled (false) in selected state', () => {
  const items = parseStaticOurs(FIXTURE, RU);
  const del = items.find((i) => i.label === 'Удалить');
  assert.equal(del?.disabled, false);
});
