-- Sherset custom: product home warehouse location (4 numeric bin segments,
-- composed into the «NN-NN-NN-NN» code: sklad-polka-qavat-yacheyka). All
-- nullable/additive — existing products are unaffected.
ALTER TABLE "products" ADD COLUMN "loc_sklad" INTEGER;
ALTER TABLE "products" ADD COLUMN "loc_polka" INTEGER;
ALTER TABLE "products" ADD COLUMN "loc_qavat" INTEGER;
ALTER TABLE "products" ADD COLUMN "loc_yacheyka" INTEGER;
