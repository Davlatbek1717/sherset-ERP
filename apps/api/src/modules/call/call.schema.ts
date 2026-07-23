import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';

const uuid = z.string().uuid();

const Direction = z.enum(['in', 'out']);
const Channel = z.enum(['call', 'sms', 'email', 'meeting']);
const Status = z.enum(['completed', 'missed', 'cancelled', 'scheduled']);

export const CreateCallSchema = z.object({
  counterpartyId: uuid.nullish(),
  contactPersonId: uuid.nullish(),
  direction: Direction,
  channel: Channel.default('call'),
  status: Status.default('completed'),
  startedAt: z.coerce.date(),
  durationSec: z.coerce.number().int().min(0).max(86400).nullish(),
  externalNumber: z.string().max(50).nullish(),
  summary: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(4000).nullish(),
  ),
});
export type CreateCallInput = z.infer<typeof CreateCallSchema>;

export const UpdateCallSchema = CreateCallSchema.partial();
export type UpdateCallInput = z.infer<typeof UpdateCallSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CallFilterSchema = z.object({
  counterpartyId: uuid.optional(),
  counterpartyIds: csvUuid.optional(),
  contactPersonId: uuid.optional(),
  ownerId: uuid.optional(),
  direction: Direction.optional(),
  channel: Channel.optional(),
  status: Status.optional(),
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  // Period — filters Call.startedAt (moysklad «Период»).
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  // Updated period — moysklad «Когда изменен» — filters Call.updatedAt.
  updatedFrom: z.coerce.date().optional(),
  updatedTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z
    .enum(['startedAt', 'durationSec', 'createdAt', 'updatedAt', 'agent'])
    .default('startedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type CallFilterInput = z.infer<typeof CallFilterSchema>;
