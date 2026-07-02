-- «Тип кода» — barcode symbology for a product pack's barcode (moysklad pack-row
-- column, default EAN13). Nullable; null is treated as ean13 in the UI.
ALTER TABLE "product_packs" ADD COLUMN "code_type" VARCHAR(20);
