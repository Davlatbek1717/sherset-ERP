-- AlterTable
ALTER TABLE "factures_in" ADD COLUMN     "payment_out_id" UUID;

-- AlterTable
ALTER TABLE "factures_out" ADD COLUMN     "advance_vat_rate" INTEGER,
ADD COLUMN     "payment_in_id" UUID,
ADD COLUMN     "purchase_return_id" UUID;

-- CreateTable
CREATE TABLE "facture_out_demands" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "facture_out_id" UUID NOT NULL,
    "demand_id" UUID NOT NULL,

    CONSTRAINT "facture_out_demands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture_in_supplies" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "facture_in_id" UUID NOT NULL,
    "supply_id" UUID NOT NULL,

    CONSTRAINT "facture_in_supplies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "facture_out_demands_account_id_demand_id_idx" ON "facture_out_demands"("account_id", "demand_id");

-- CreateIndex
CREATE UNIQUE INDEX "facture_out_demands_facture_out_id_demand_id_key" ON "facture_out_demands"("facture_out_id", "demand_id");

-- CreateIndex
CREATE INDEX "facture_in_supplies_account_id_supply_id_idx" ON "facture_in_supplies"("account_id", "supply_id");

-- CreateIndex
CREATE UNIQUE INDEX "facture_in_supplies_facture_in_id_supply_id_key" ON "facture_in_supplies"("facture_in_id", "supply_id");

-- CreateIndex
CREATE INDEX "factures_in_account_id_payment_out_id_idx" ON "factures_in"("account_id", "payment_out_id");

-- CreateIndex
CREATE INDEX "factures_out_account_id_purchase_return_id_idx" ON "factures_out"("account_id", "purchase_return_id");

-- CreateIndex
CREATE INDEX "factures_out_account_id_payment_in_id_idx" ON "factures_out"("account_id", "payment_in_id");

-- AddForeignKey
ALTER TABLE "factures_out" ADD CONSTRAINT "factures_out_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_out" ADD CONSTRAINT "factures_out_payment_in_id_fkey" FOREIGN KEY ("payment_in_id") REFERENCES "payments_in"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_out_demands" ADD CONSTRAINT "facture_out_demands_facture_out_id_fkey" FOREIGN KEY ("facture_out_id") REFERENCES "factures_out"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_out_demands" ADD CONSTRAINT "facture_out_demands_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "demands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_in" ADD CONSTRAINT "factures_in_payment_out_id_fkey" FOREIGN KEY ("payment_out_id") REFERENCES "payments_out"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_in_supplies" ADD CONSTRAINT "facture_in_supplies_facture_in_id_fkey" FOREIGN KEY ("facture_in_id") REFERENCES "factures_in"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_in_supplies" ADD CONSTRAINT "facture_in_supplies_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
