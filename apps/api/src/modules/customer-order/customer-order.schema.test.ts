/**
 * Customer-order schema validation tests — focuses on the Round 4
 * additions (contractId / projectId / salesChannelId) and the
 * pre-existing FSM enum guard that rules out legacy verb-style
 * targets like 'confirm' / 'unpost'.
 */
import { describe, expect, it } from 'vitest';
import {
  CreateCustomerOrderSchema,
  CustomerOrderFilterSchema,
  OrderStateSchema,
  UpdateCustomerOrderSchema,
} from './customer-order.schema.js';

const UUID = '00000000-0000-0000-0000-000000000001';
const baseInput = {
  agentId: UUID,
  organizationId: UUID,
  storeId: UUID,
};

describe('OrderStateSchema', () => {
  it('accepts every valid state slug', () => {
    for (const state of [
      'draft',
      'confirmed',
      'awaiting_payment',
      'paid',
      'partially_shipped',
      'fully_shipped',
      'closed',
      'cancelled',
    ] as const) {
      expect(() => OrderStateSchema.parse(state)).not.toThrow();
    }
  });

  it('rejects legacy verb-style values that the bulk-transition UI used to send', () => {
    // These are the bugs Round 2 hardening fixed — the controller
    // would throw "Unknown state" if any of these slipped through.
    expect(() => OrderStateSchema.parse('confirm')).toThrow();
    expect(() => OrderStateSchema.parse('unpost')).toThrow();
    expect(() => OrderStateSchema.parse('cancel')).toThrow();
    expect(() => OrderStateSchema.parse('post')).toThrow();
  });

  it('rejects arbitrary garbage', () => {
    expect(() => OrderStateSchema.parse('')).toThrow();
    expect(() => OrderStateSchema.parse('CONFIRMED')).toThrow(); // case-sensitive
    expect(() => OrderStateSchema.parse(null)).toThrow();
  });

  it('rejects account-defined custom status names (the Статус-dropdown 500 bug)', () => {
    // The status-change-dropdown previously fetched /states and sent
    // `name.toLowerCase()` as the bulk-transition target. Custom document
    // statuses (moysklad's editable "Статус") are NOT FSM states, so they
    // crashed the endpoint. safeParse(false) here is what now drives the
    // controller's 400 (instead of an opaque 500).
    expect(OrderStateSchema.safeParse('новый').success).toBe(false);
    expect(OrderStateSchema.safeParse('текширилмаган').success).toBe(false);
    expect(OrderStateSchema.safeParse('карз колди').success).toBe(false);
  });
});

describe('CreateCustomerOrderSchema', () => {
  it('parses a minimal valid order without optional FK fields', () => {
    const result = CreateCustomerOrderSchema.parse(baseInput);
    expect(result.agentId).toBe(UUID);
    expect(result.contractId).toBeUndefined();
    expect(result.projectId).toBeUndefined();
    expect(result.salesChannelId).toBeUndefined();
    // Defaults
    expect(result.vatEnabled).toBe(true);
    expect(result.vatIncluded).toBe(false);
    expect(result.positions).toEqual([]);
  });

  it('accepts contractId / projectId / salesChannelId as UUIDs', () => {
    const result = CreateCustomerOrderSchema.parse({
      ...baseInput,
      contractId: UUID,
      projectId: UUID,
      salesChannelId: UUID,
    });
    expect(result.contractId).toBe(UUID);
    expect(result.projectId).toBe(UUID);
    expect(result.salesChannelId).toBe(UUID);
  });

  it('accepts null for all three optional FK fields (used to clear an assignment)', () => {
    const result = CreateCustomerOrderSchema.parse({
      ...baseInput,
      contractId: null,
      projectId: null,
      salesChannelId: null,
    });
    expect(result.contractId).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.salesChannelId).toBeNull();
  });

  it('rejects non-UUID strings for the FK fields', () => {
    expect(() =>
      CreateCustomerOrderSchema.parse({ ...baseInput, contractId: 'not-a-uuid' }),
    ).toThrow();
    expect(() => CreateCustomerOrderSchema.parse({ ...baseInput, projectId: 'abc' })).toThrow();
    expect(() =>
      CreateCustomerOrderSchema.parse({ ...baseInput, salesChannelId: 'short' }),
    ).toThrow();
  });

  it('still rejects an order without the three required FKs', () => {
    expect(() => CreateCustomerOrderSchema.parse({})).toThrow();
    expect(() => CreateCustomerOrderSchema.parse({ agentId: UUID })).toThrow();
  });
});

describe('CustomerOrderFilterSchema', () => {
  it('parses an empty filter with the documented defaults', () => {
    const result = CustomerOrderFilterSchema.parse({});
    expect(result.limit).toBe(25);
    expect(result.sortBy).toBe('moment');
    expect(result.sortDir).toBe('desc');
  });

  it('accepts the new moysklad-parity FK filters as UUIDs', () => {
    const result = CustomerOrderFilterSchema.parse({
      contractId: UUID,
      agentGroupId: UUID,
      agentAccountId: UUID,
      groupId: UUID,
      salesChannelId: UUID,
    });
    expect(result.contractId).toBe(UUID);
    expect(result.agentGroupId).toBe(UUID);
    expect(result.agentAccountId).toBe(UUID);
    expect(result.groupId).toBe(UUID);
    expect(result.salesChannelId).toBe(UUID);
  });

  it('rejects non-UUID strings for the new FK filters', () => {
    expect(() => CustomerOrderFilterSchema.parse({ contractId: 'nope' })).toThrow();
    expect(() => CustomerOrderFilterSchema.parse({ agentGroupId: 'abc' })).toThrow();
    expect(() => CustomerOrderFilterSchema.parse({ salesChannelId: 'short' })).toThrow();
  });

  it('coerces the boolFromString flag filters (printed / published / shared)', () => {
    const asTrue = CustomerOrderFilterSchema.parse({
      printed: 'true',
      published: 'true',
      shared: 'true',
    });
    expect(asTrue.printed).toBe(true);
    expect(asTrue.published).toBe(true);
    expect(asTrue.shared).toBe(true);

    const asFalse = CustomerOrderFilterSchema.parse({
      printed: 'false',
      published: 'false',
      shared: 'false',
    });
    expect(asFalse.printed).toBe(false);
    expect(asFalse.published).toBe(false);
    expect(asFalse.shared).toBe(false);
  });

  it('accepts the reservedStatus tri-state enum and rejects garbage', () => {
    for (const s of ['none', 'partial', 'full'] as const) {
      expect(CustomerOrderFilterSchema.parse({ reservedStatus: s }).reservedStatus).toBe(s);
    }
    expect(() => CustomerOrderFilterSchema.parse({ reservedStatus: 'reserved' })).toThrow();
  });

  it('accepts the paid / shipped derived states (previously silent no-ops)', () => {
    expect(CustomerOrderFilterSchema.parse({ paymentStatus: 'paid' }).paymentStatus).toBe('paid');
    expect(CustomerOrderFilterSchema.parse({ shippedStatus: 'shipped' }).shippedStatus).toBe(
      'shipped',
    );
  });

  it('accepts the updatedAt range bounds (Когда изменен)', () => {
    const result = CustomerOrderFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(result.updatedFrom).toBe('2026-01-01');
    expect(result.updatedTo).toBe('2026-01-31');
  });

  it('accepts the relational + money sort keys and rejects unknown ones', () => {
    for (const k of ['agent', 'organization', 'shippedSumMinor', 'reservedSumMinor'] as const) {
      expect(CustomerOrderFilterSchema.parse({ sortBy: k }).sortBy).toBe(k);
    }
    expect(() => CustomerOrderFilterSchema.parse({ sortBy: 'bogusColumn' })).toThrow();
  });
});

describe('UpdateCustomerOrderSchema', () => {
  it('makes every field except version optional', () => {
    // version is REQUIRED (optimistic-lock token); all other fields stay optional.
    expect(() => UpdateCustomerOrderSchema.parse({ version: 1 })).not.toThrow();
  });

  it('accepts partial updates with just one optional FK field', () => {
    const result = UpdateCustomerOrderSchema.parse({ version: 1, projectId: UUID });
    expect(result.projectId).toBe(UUID);
    expect(result.agentId).toBeUndefined();
  });

  it('accepts null to clear an FK on update', () => {
    const result = UpdateCustomerOrderSchema.parse({
      version: 1,
      contractId: null,
      projectId: null,
      salesChannelId: null,
    });
    expect(result.contractId).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.salesChannelId).toBeNull();
  });

  it('accepts null externalCode on update (edit form clears it by sending null — was a 400)', () => {
    // Regression: externalCode was z.string().optional() (not nullable), so the
    // edit form's null (empty «Внешний код») 400'd every save. Now .nullish().
    expect(UpdateCustomerOrderSchema.safeParse({ version: 1, externalCode: null }).success).toBe(
      true,
    );
    expect(CreateCustomerOrderSchema.safeParse({ ...baseInput, externalCode: null }).success).toBe(
      true,
    );
  });

  it('accepts null description on update (edit form ALWAYS sends description || null — was a 400)', () => {
    // Regression: the save mutation unconditionally sends `description: form.description
    // || null` (page.tsx:389), so an order with an empty description sent null and the
    // bare z.string().optional() 400'd ("Expected string, received null"). externalCode
    // was fixed in the sales/purchase sweep but description was the missed straggler.
    expect(UpdateCustomerOrderSchema.safeParse({ version: 1, description: null }).success).toBe(
      true,
    );
    expect(CreateCustomerOrderSchema.safeParse({ ...baseInput, description: null }).success).toBe(
      true,
    );
  });
});

describe('UpdateCustomerOrderSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateCustomerOrderSchema.safeParse({}).success).toBe(false);
    expect(UpdateCustomerOrderSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateCustomerOrderSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateCustomerOrderSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateCustomerOrderSchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateCustomerOrderSchema.safeParse(baseInput).success).toBe(true);
  });
});
