import { z } from 'zod';

const uuid = z.string().uuid();

const Provider = z.enum(['gmail', 'yandex', 'mailru', 'custom']);

export const SaveEmailConfigSchema = z.object({
  provider: Provider.default('custom'),
  fromName: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(255).nullish(),
  ),
  fromEmail: z.string().email().max(255),
  replyTo: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().email().max(255).nullish(),
  ),
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.coerce.boolean().default(false),
  username: z.string().min(1).max(255),
  // Optional on update: empty/undefined password keeps the existing one.
  password: z.string().max(500).optional(),
});
export type SaveEmailConfigInput = z.infer<typeof SaveEmailConfigSchema>;

// Whitelist of host entities that can be the `entity` discriminator on
// an email send. Mirrors the AttachmentEntity list (different physical
// table, but same conceptual host set).
const EMAIL_ENTITIES = [
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
  'CashIn',
  'CashOut',
  'Opportunity',
] as const;
const Entity = z.enum(EMAIL_ENTITIES);

const emailAddress = z.string().email().max(255);

export const SendEmailSchema = z.object({
  // Entity context is optional (one-off contact emails are allowed)
  // but if provided, must be a known entity discriminator.
  entity: Entity.nullish(),
  entityId: uuid.nullish(),
  to: z.array(emailAddress).min(1).max(20),
  cc: z.array(emailAddress).max(20).default([]),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1).max(200_000),
  // Optional list of attachment IDs (already-uploaded files via /attachments).
  attachmentIds: z.array(uuid).max(10).default([]),
});
export type SendEmailInput = z.infer<typeof SendEmailSchema>;

/** Status values stored on EmailLog. 'failed' is a legacy value from the
 *  pre-Sprint-17.4 inline-send path; new rows use pending/sent/dead. */
/** `sending` — Faza 28 claim holati: worker SMTP bilan gaplashmoqda. */
export const EmailLogStatusSchema = z.enum(['pending', 'sending', 'sent', 'dead', 'failed']);
export type EmailLogStatus = z.infer<typeof EmailLogStatusSchema>;

export const ListEmailLogsSchema = z.object({
  entity: Entity.optional(),
  entityId: uuid.optional(),
  status: EmailLogStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  sortBy: z.enum(['createdAt', 'sentAt', 'subject']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type ListEmailLogsInput = z.infer<typeof ListEmailLogsSchema>;
