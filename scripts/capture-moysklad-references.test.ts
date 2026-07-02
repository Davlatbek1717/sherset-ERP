import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DETAIL_DROPDOWNS,
  DETAIL_STATES,
  DETAIL_TABS,
  STATES,
  classifyFreshness,
} from './capture-moysklad-lib.js';

test('classifyFreshness: null age → missing', () => {
  const r = classifyFreshness({ '01-default': null });
  assert.deepEqual(r.missing, ['01-default']);
  assert.deepEqual(r.fresh, []);
});

test('classifyFreshness: age <= maxAge → fresh', () => {
  const r = classifyFreshness({ '01-default': 5 }, 30);
  assert.deepEqual(r.fresh, ['01-default']);
});

test('classifyFreshness: age > maxAge → stale', () => {
  const r = classifyFreshness({ '01-default': 45 }, 30);
  assert.deepEqual(r.stale, ['01-default']);
});

test('classifyFreshness: mixed bucket', () => {
  const r = classifyFreshness({ a: null, b: 5, c: 45 }, 30);
  assert.deepEqual(r, { missing: ['a'], fresh: ['b'], stale: ['c'] });
});

test('STATES has the 12 protocol states', () => {
  assert.equal(STATES.length, 12);
});

test('DETAIL_STATES has 10 detail states incl. edit-default', () => {
  assert.equal(DETAIL_STATES.length, 10);
  assert.ok(DETAIL_STATES.includes('edit-default'));
});

test('DETAIL_DROPDOWNS + DETAIL_TABS reference only known DETAIL_STATES (and not edit-default)', () => {
  const known = new Set<string>(DETAIL_STATES);
  for (const { state } of [...DETAIL_DROPDOWNS, ...DETAIL_TABS]) {
    assert.ok(known.has(state), `${state} must be a DETAIL_STATES member`);
    assert.notEqual(state, 'edit-default', 'edit-default is the base snapshot, not a sub-state');
  }
  // dropdowns + tabs together cover the 9 non-base states exactly once
  const covered = [...DETAIL_DROPDOWNS, ...DETAIL_TABS].map((s) => s.state);
  assert.equal(new Set(covered).size, DETAIL_STATES.length - 1);
});
