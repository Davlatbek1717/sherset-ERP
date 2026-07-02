import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * counterparties/[id] editable «Статус» dropdown lock (B6 S13).
 *
 * Grounded against the LIVE moysklad counterparty card (2026-06-13): «О контрагенте»
 * opens with an editable «Статус» dropdown. Ours rendered the state read-only. This
 * slice fetches the tenant CRM states (/states?entityType=counterparty), renders an
 * editable NativeSelect, threads `stateId` into the PATCH payload (BE connects/
 * disconnects the State relation), and keeps Save live on a state-only change.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const src = readFileSync(join(REPO, 'apps/web/src/app/(app)/counterparties/[id]/page.tsx'), 'utf8');

describe('counterparty/[id] editable «Статус» dropdown (B6 S13)', () => {
  it('fetches counterparty CRM states and renders an editable dropdown', () => {
    expect(src).toMatch(/\/states\?entityType=counterparty&archived=false/);
    expect(src).toMatch(/data-test-id="field-state"/);
    expect(src).toMatch(/crmStateOptions\.map/);
  });

  it('threads stateId into the PATCH payload and keeps Save live on a state-only edit', () => {
    expect(src).toMatch(/stateId: stateId \?\? null/);
    expect(src).toMatch(/setStateChanged\(true\)/);
    // whitespace-tolerant: the dirty-chain is biome-wrapped across lines once it grew long.
    // (The «Метки» field — and its tagsChanged flag — was dropped in the 2026-06-21 moysklad
    // card regroup; the chain now leads with the RHF isDirty.)
    expect(src).toMatch(/isDirty\s*\|\|\s*stateChanged/);
  });
});
