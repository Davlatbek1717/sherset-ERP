-- «План. дата оплаты» (planned payment date) for Demand — mirrors
-- InvoiceOut/InvoiceIn.payment_planned_moment. DOM-grounded field-role label
-- in dom/08-edit-default.html. Nullable, backward-compatible (no backfill).
ALTER TABLE "demands" ADD COLUMN "payment_planned_moment" TIMESTAMPTZ;
