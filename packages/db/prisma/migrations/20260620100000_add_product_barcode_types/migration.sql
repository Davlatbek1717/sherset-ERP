-- Per-barcode GTIN type (moysklad parity — barcodes are stored typed).
-- Index-aligned PARALLEL array to products.barcodes; additive, defaults to empty
-- so existing rows + the list/search `has` filters over raw barcode values are
-- unaffected.
ALTER TABLE "products" ADD COLUMN "barcode_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
