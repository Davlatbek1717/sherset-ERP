-- moysklad «РНПТ» (registration number of goods batch) + «Ячейка» (warehouse
-- bin/cell reference) — free-text per-position fields on the #enter grid. РНПТ
-- is a plain text field here (NOT the full Честный Знак marking-system feature);
-- Ячейка is a free-text cell reference (NOT the validated address-storage picker).
ALTER TABLE "enter_positions" ADD COLUMN     "rnpt" VARCHAR(255),
ADD COLUMN     "cell" VARCHAR(255);
