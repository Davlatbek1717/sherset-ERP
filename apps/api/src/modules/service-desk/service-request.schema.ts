import { z } from 'zod';

const uuid = z.string().uuid();
const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );
const stringFromBool = z.preprocess((v) => {
  if (typeof v === 'string') return v === 'true' || v === '1';
  return v;
}, z.boolean());

/**
 * ServiceRequest (Заявка) schema.
 *
 * Customer-support ticket flow. moysklad's "Сервисный модуль" / desk.
 *
 * FSM:
 *   new                 → in_progress | cancelled
 *   in_progress         → waiting_customer | resolved | cancelled
 *   waiting_customer    → in_progress | cancelled
 *   resolved            → closed | in_progress (re-open if customer pushes back)
 *   closed | cancelled  → terminal
 */
export const ServiceRequestStatusSchema = z.enum([
  'new',
  'in_progress',
  'waiting_customer',
  'resolved',
  'closed',
  'cancelled',
]);
export type ServiceRequestStatus = z.infer<typeof ServiceRequestStatusSchema>;

export const ServiceRequestChannelSchema = z.enum([
  'phone',
  'email',
  'chat',
  'in_person',
  'web_form',
  'other',
]);
export type ServiceRequestChannel = z.infer<typeof ServiceRequestChannelSchema>;

export const ServiceRequestPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export type ServiceRequestPriority = z.infer<typeof ServiceRequestPrioritySchema>;

export const ServiceRequestTransitionSchema = z.enum([
  'start',
  'wait_customer',
  'resume',
  'resolve',
  'reopen',
  'close',
  'cancel',
]);
export type ServiceRequestTransitionTarget = z.infer<typeof ServiceRequestTransitionSchema>;

export const CreateServiceRequestSchema = z.object({
  name: optionalEmpty(100),
  externalCode: optionalEmpty(50),
  subject: z.string().min(1).max(500),
  description: optionalEmpty(20_000),
  counterpartyId: uuid.nullish(),
  contactPersonId: uuid.nullish(),
  assigneeId: uuid.nullish(),
  channel: ServiceRequestChannelSchema.default('other'),
  priority: ServiceRequestPrioritySchema.default('normal'),
  dueDate: z.string().datetime().nullish(),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>;

export const UpdateServiceRequestSchema = CreateServiceRequestSchema.partial();
export type UpdateServiceRequestInput = z.infer<typeof UpdateServiceRequestSchema>;

export const ServiceRequestFilterSchema = z.object({
  status: ServiceRequestStatusSchema.optional(),
  priority: ServiceRequestPrioritySchema.optional(),
  channel: ServiceRequestChannelSchema.optional(),
  counterpartyId: uuid.optional(),
  assigneeId: uuid.optional(),
  ownerId: uuid.optional(),
  archived: stringFromBool.optional(),
  /** "open" shortcut — non-terminal statuses. */
  openOnly: stringFromBool.optional(),
  /** Filter rows whose dueDate is before NOW (overdue tickets). */
  overdueOnly: stringFromBool.optional(),
  search: z.string().max(200).optional(),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'name']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
});
export type ServiceRequestFilterInput = z.infer<typeof ServiceRequestFilterSchema>;

/** Map transition target → resulting status. Centralised for safety. */
export const TRANSITION_RESULT: Record<ServiceRequestTransitionTarget, ServiceRequestStatus> = {
  start: 'in_progress',
  wait_customer: 'waiting_customer',
  resume: 'in_progress',
  resolve: 'resolved',
  reopen: 'in_progress',
  close: 'closed',
  cancel: 'cancelled',
};

/** Allowed source statuses for each transition target. */
export const TRANSITION_FROM: Record<ServiceRequestTransitionTarget, ServiceRequestStatus[]> = {
  start: ['new'],
  wait_customer: ['in_progress'],
  resume: ['waiting_customer', 'resolved'],
  resolve: ['in_progress', 'waiting_customer'],
  reopen: ['resolved', 'closed'],
  close: ['resolved'],
  cancel: ['new', 'in_progress', 'waiting_customer', 'resolved'],
};
