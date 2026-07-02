-- Align Product.paymentItemType to moysklad's official enum codes
-- (was COMMODITY / EXCISABLE_GOODS — see docs/moysklad-reference dictionaries/_product.md).
-- Data-only: the column is already VARCHAR; only existing values are renamed.
UPDATE "products" SET "payment_item_type" = 'GOOD' WHERE "payment_item_type" = 'COMMODITY';
UPDATE "products" SET "payment_item_type" = 'EXCISABLE_GOOD' WHERE "payment_item_type" = 'EXCISABLE_GOODS';
