-- AlterTable
ALTER TABLE "demands" ADD COLUMN     "car_number" VARCHAR(50),
ADD COLUMN     "cargo_name" VARCHAR(255),
ADD COLUMN     "carrier_id" UUID,
ADD COLUMN     "consignee_id" UUID,
ADD COLUMN     "consignor_id" UUID,
ADD COLUMN     "places_count" INTEGER,
ADD COLUMN     "shipper_instructions" TEXT,
ADD COLUMN     "shipping_doc_date" TIMESTAMPTZ,
ADD COLUMN     "shipping_doc_no" VARCHAR(100),
ADD COLUMN     "state_contract_id" VARCHAR(100),
ADD COLUMN     "transport_facility" VARCHAR(255);

-- CreateIndex
CREATE INDEX "demands_account_id_consignor_id_idx" ON "demands"("account_id", "consignor_id");

-- CreateIndex
CREATE INDEX "demands_account_id_consignee_id_idx" ON "demands"("account_id", "consignee_id");

-- CreateIndex
CREATE INDEX "demands_account_id_carrier_id_idx" ON "demands"("account_id", "carrier_id");

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_consignor_id_fkey" FOREIGN KEY ("consignor_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_consignee_id_fkey" FOREIGN KEY ("consignee_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
