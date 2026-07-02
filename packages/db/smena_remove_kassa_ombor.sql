-- DropForeignKey
ALTER TABLE "cashier_sessions" DROP CONSTRAINT "cashier_sessions_cash_desk_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_sessions" DROP CONSTRAINT "cashier_sessions_store_id_fkey";

-- DropForeignKey
ALTER TABLE "smenas" DROP CONSTRAINT "smenas_cash_desk_id_fkey";

-- DropForeignKey
ALTER TABLE "smenas" DROP CONSTRAINT "smenas_store_id_fkey";

-- AlterTable
ALTER TABLE "cashier_sessions" ALTER COLUMN "cash_desk_id" DROP NOT NULL,
ALTER COLUMN "store_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "smenas" DROP COLUMN "cash_desk_id",
DROP COLUMN "store_id";

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

