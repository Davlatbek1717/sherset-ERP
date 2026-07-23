import { z } from 'zod';

const uuid = z.string().uuid();

// Whitelist of host entities that can carry attachments. Adding a new
// entity here is the single point of change — the service rejects any
// `entity` value not in this list.
export const ATTACHMENT_ENTITIES = [
  'Counterparty',
  'CustomerOrder',
  'Demand',
  'InvoiceOut',
  'Supply',
  'PurchaseOrder',
  'InvoiceIn',
  'PaymentIn',
  'PaymentOut',
  // Counterparty settlement money-docs — each /[id] page wires an AttachmentsSection
  // (was missing here → its «Файлы» tab 400'd «Invalid entity»).
  'CounterpartyAdjustment',
  'Prepayment',
  'PrepaymentReturn',
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
  'Task',
  // «Отчёт комиссионера» «Файлы» tabs (commission-reports/new + new-in staged upload).
  'CommissionReportOut',
  'CommissionReportIn',
  // Debt payment screenshot (Sherset KEEP — B3).
  'DebtPayment',
  // Telegram chat media (Sherset KEEP — B3).
  'TelegramChatMessage',
] as const;

const Entity = z.enum(ATTACHMENT_ENTITIES);
export type AttachmentEntity = z.infer<typeof Entity>;

export const UploadAttachmentSchema = z.object({
  entity: Entity,
  entityId: uuid,
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(100),
  // base64-encoded payload. Accepts data URL (data:application/pdf;base64,...)
  // or bare base64. Service decodes and enforces the 10 MB cap.
  dataBase64: z.string().min(1),
  description: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(500).nullish(),
  ),
});
export type UploadAttachmentInput = z.infer<typeof UploadAttachmentSchema>;

export const ListAttachmentsSchema = z.object({
  entity: Entity,
  entityId: uuid,
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListAttachmentsInput = z.infer<typeof ListAttachmentsSchema>;

/**
 * Account-wide file repository (moysklad «Файлы» homepage tab). SEPARATE
 * from ListAttachmentsSchema on purpose: that schema's per-entity
 * invariant (entity+entityId required) is intentional and test-locked
 * for the per-document attachments panel. This one is cross-entity,
 * cursor-paginated, with an optional host-type / filename filter.
 */
export const AccountAttachmentsFilterSchema = z.object({
  entity: Entity.optional(),
  search: z.string().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: uuid.optional(),
});
export type AccountAttachmentsFilterInput = z.infer<typeof AccountAttachmentsFilterSchema>;
