-- Sherset custom: show the product's warehouse home location «NN-NN-NN-NN» on
-- the price tag / senik. Additive boolean, default true.
ALTER TABLE "label_templates" ADD COLUMN "include_location" BOOLEAN NOT NULL DEFAULT true;
