import { z } from 'zod';

const uuid = z.string().uuid();

export const TaskStatus = z.enum(['open', 'in_progress', 'done', 'cancelled']);
export type TaskStatusValue = z.infer<typeof TaskStatus>;

export const TaskPriority = z.enum(['low', 'normal', 'high', 'urgent']);
export type TaskPriorityValue = z.infer<typeof TaskPriority>;

// Whitelist of valid entity names for polymorphic links (mirrors attachment whitelist)
export const TASK_ENTITY_WHITELIST = [
  'Counterparty',
  'CustomerOrder',
  'Demand',
  'InvoiceOut',
  'Supply',
  'PurchaseOrder',
  'InvoiceIn',
  'PaymentIn',
  'PaymentOut',
  'SalesReturn',
  'PurchaseReturn',
  'Move',
  'Loss',
  'Enter',
  'Inventory',
  'CashIn',
  'CashOut',
  'Opportunity',
  'Product',
] as const;

export const TaskEntity = z.enum(TASK_ENTITY_WHITELIST);

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().nullish(),
  ),
  assigneeId: uuid.nullish(),
  // LEGACY «Тип задачи» — FK to the separate TaskType lookup. Superseded by
  // `stateId` (moysklad's task.state). Still accepted so old callers/tests work.
  typeId: z.preprocess((v) => (typeof v === 'string' && v.length === 0 ? null : v), uuid.nullish()),
  // moysklad «Тип задачи» — the task's `state` (State row, entityType="task"),
  // matching moysklad's own `task.state` API field. Empty string → null so the
  // picker's clear maps cleanly to detach.
  stateId: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    uuid.nullish(),
  ),
  // moysklad «Контрагент» — the counterparty the task is about (Task.agentId FK).
  // Set when a task is created from a counterparty card («Создать задачу»), so the
  // card's «Задачи» tab (which reads by ?agentId=) shows it. Empty string → null.
  agentId: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    uuid.nullish(),
  ),
  entity: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    TaskEntity.nullish(),
  ),
  entityId: uuid.nullish(),
  status: TaskStatus.default('open'),
  priority: TaskPriority.default('normal'),
  dueAt: z.coerce.date().nullish(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
  // caller cannot silently bypass the lost-update guard. Absent on Create.
  version: z.number().int().nonnegative(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const TransitionStatusSchema = z.object({
  status: TaskStatus,
  completedAtOverride: z.coerce.date().optional(),
});
export type TransitionStatusInput = z.infer<typeof TransitionStatusSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const TaskFilterSchema = z.object({
  assigneeId: uuid.optional(),
  authorId: uuid.optional(),
  // LEGACY «Тип задачи» (TaskType FK) — superseded by stateId.
  typeId: uuid.optional(),
  // moysklad «Тип задачи» — the task's `state` (State, entityType="task").
  stateId: uuid.optional(),
  // moysklad «Контрагент» — task.agentId FK (which counterparty the task
  // is about). Distinct from the polymorphic entity link.
  agentId: uuid.optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  archived: boolFromString.optional(),
  search: z.string().max(200).optional(),
  entity: z.string().max(50).optional(),
  entityId: uuid.optional(),
  // Period — filters Task.createdAt (moysklad «Период»).
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  // Срок (dueAt range) — moysklad's «Срок» field on the task panel.
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  // Legacy: pre-existing "everything overdue by" cutoff; kept for the
  // overdue badge on the navbar and existing callers.
  dueBefore: z.coerce.date().optional(),
  // Updated period — moysklad «Когда изменен» — filters Task.updatedAt.
  updatedFrom: z.coerce.date().optional(),
  updatedTo: z.coerce.date().optional(),
  ownership: z.enum(['mine', 'team', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueAt', 'title', 'agent']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type TaskFilterInput = z.infer<typeof TaskFilterSchema>;
