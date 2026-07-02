-- AlterTable
ALTER TABLE "retail_stores" ADD COLUMN     "create_cash_in_on_retail_shift_closing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "create_payment_in_on_retail_shift_closing" BOOLEAN NOT NULL DEFAULT true;
