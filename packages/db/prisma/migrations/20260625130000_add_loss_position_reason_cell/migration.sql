-- moysklad «Причина списания» (per-position write-off reason) + «Ячейка»
-- (warehouse bin/cell reference) — free-text per-position fields on the #loss
-- editor grid (mirror enter_positions.reason/cell). The document-level
-- losses.reason enum stays as the legacy single-reason; moysklad models the
-- write-off reason PER LINE as free text. Both nullable, no data backfill.
ALTER TABLE "loss_positions" ADD COLUMN     "reason" VARCHAR(255),
ADD COLUMN     "cell" VARCHAR(255);
