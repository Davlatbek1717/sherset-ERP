import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CreateDemandSchema, UpdateDemandSchema } from './demand.schema.js';

/**
 * Guard for the demands /new silent-drop fix (2026-06-13, Phase-2 QA):
 * organizationAccountId / agentAccountId («Счёт организации/контрагента») and
 * deliveryPlannedMoment («План. дата отгрузки») were POSTed by /demands/new but
 * absent from CreateDemandSchema, so Zod stripped them and the service never
 * persisted them — the user's picked bank-account / planned date vanished with
 * no error. This pins (1) the write-schema now ACCEPTS the keys (behavioural —
 * Zod's object parser would strip an unlisted key, so these would fail pre-fix)
 * and (2) the service actually PERSISTS them in create() AND update() (a
 * schema-accepts-but-service-drops regression is the same silent loss).
 */

const UUID = '11111111-1111-1111-1111-111111111111';
const PLANNED = '2026-06-13T00:00:00.000Z';
const baseCreate = {
  agentId: UUID,
  organizationId: UUID,
  storeId: UUID,
  positions: [{ assortmentId: UUID, quantity: '1', priceMinor: '100' }],
};

describe('CreateDemandSchema accepts the previously-dropped account/planned fields', () => {
  it('keeps organizationAccountId / agentAccountId / deliveryPlannedMoment after parse', () => {
    const parsed = CreateDemandSchema.parse({
      ...baseCreate,
      organizationAccountId: UUID,
      agentAccountId: UUID,
      deliveryPlannedMoment: PLANNED,
    });
    expect(parsed.organizationAccountId).toBe(UUID);
    expect(parsed.agentAccountId).toBe(UUID);
    expect(parsed.deliveryPlannedMoment).toBeInstanceOf(Date);
    expect(parsed.deliveryPlannedMoment?.toISOString()).toBe(PLANNED);
  });

  it('UpdateDemandSchema (partial) also accepts them', () => {
    const parsed = UpdateDemandSchema.parse({
      version: 1,
      organizationAccountId: UUID,
      deliveryPlannedMoment: PLANNED,
    });
    expect(parsed.organizationAccountId).toBe(UUID);
    expect(parsed.deliveryPlannedMoment).toBeInstanceOf(Date);
  });

  it('allows clearing them to null (disconnect path)', () => {
    const parsed = CreateDemandSchema.parse({
      ...baseCreate,
      organizationAccountId: null,
      deliveryPlannedMoment: null,
    });
    expect(parsed.organizationAccountId).toBeNull();
    expect(parsed.deliveryPlannedMoment).toBeNull();
  });
});

describe('DemandService persists the account/planned fields (not just parses them)', () => {
  const src = readFileSync(join(__dirname, 'demand.service.ts'), 'utf8');

  it('create() writes organizationAccountId, agentAccountId and deliveryPlannedMoment', () => {
    expect(src).toMatch(/organizationAccountId:\s*parsed\.organizationAccountId\s*\?\?\s*null/);
    expect(src).toMatch(/agentAccountId:\s*parsed\.agentAccountId\s*\?\?\s*null/);
    expect(src).toMatch(/deliveryPlannedMoment:\s*parsed\.deliveryPlannedMoment/);
  });

  it('update() connects/disconnects the account relations and sets the planned date', () => {
    expect(src).toMatch(/data\.organizationAccount\s*=/);
    expect(src).toMatch(/data\.agentAccount\s*=/);
    expect(src).toMatch(/data\.deliveryPlannedMoment\s*=/);
  });
});

describe('schema has the delivery_planned_moment column', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'packages/db/prisma/schema.prisma'),
    'utf8',
  );
  it('Demand model declares delivery_planned_moment', () => {
    expect(schema).toMatch(
      /deliveryPlannedMoment\s+DateTime\?\s*@map\("delivery_planned_moment"\)/,
    );
  });
});
