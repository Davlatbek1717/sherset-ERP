import { z } from 'zod';

/**
 * BankImport — upload and commit of a bank-statement CSV.
 *
 * Two-step flow:
 *   1. POST /bank-import/preview → parse + counterparty auto-match. Returns
 *      a rows[] array so the UI can render a review table. The statement
 *      record and rows ARE persisted (state='parsed') so the user can
 *      come back later.
 *   2. POST /bank-import/:id/commit → create PaymentIn/PaymentOut drafts
 *      for every row that has a matched counterparty and isn't skipped.
 */

export const BankStatementFormatSchema = z.enum(['csv', 'camt053']);
export type BankStatementFormat = z.infer<typeof BankStatementFormatSchema>;

export const UploadBankStatementSchema = z.object({
  filename: z.string().min(1).max(255),
  format: BankStatementFormatSchema.default('csv'),
  /** Raw CSV content — client reads the file and ships the text payload. */
  content: z.string().min(1).max(5_000_000),
  /** Optional hint: which of our bank accounts this statement concerns. */
  organizationAccountId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});
export type UploadBankStatementInput = z.infer<typeof UploadBankStatementSchema>;

export const CommitBankStatementSchema = z.object({
  /**
   * Ids of rows the user explicitly wants imported. Rows not listed are
   * treated as skipped (but still preserved in the statement record for
   * audit). If the array is empty, all matched rows are committed.
   */
  rowIds: z.array(z.string().uuid()).optional(),
  /** Which organization to bill/pay on the drafts. */
  organizationId: z.string().uuid(),
  /**
   * Optional per-row counterparty override: `{ rowId: counterpartyId }`.
   * Use this when auto-match was wrong or returned null and the user picked
   * a counterparty manually in the preview UI.
   */
  counterpartyOverrides: z.record(z.string().uuid(), z.string().uuid()).optional(),
  /**
   * Faza 20 (INT-05) — dedup'dan ataylab chiqarilgan qatorlar. Commit har
   * qatorni «shu bank tranzaksiyasi allaqachon import qilinganmi» (yo'nalish +
   * sana + summa + hujjat raqami + kontragent hisob raqami) bo'yicha
   * tekshiradi va topilsa RAD ETADI. Bir kunda bir kontragentga bir xil
   * summali IKKI HAQIQIY to'lov bo'lishi mumkin — operator preview'da
   * «baribir import qil» desa, o'sha qator id'si shu ro'yxatga tushadi va
   * faqat o'shanga dedup qo'llanmaydi.
   */
  allowDuplicateRowIds: z.array(z.string().uuid()).optional(),
});
export type CommitBankStatementInput = z.infer<typeof CommitBankStatementSchema>;
