-- CreateTable
CREATE TABLE "demand_position_cost_consumptions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "demand_position_id" UUID NOT NULL,
    "supply_position_id" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unit_cost_minor" BIGINT NOT NULL,
    "line_cost_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_position_cost_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demand_position_cost_consumptions_demand_position_id_idx" ON "demand_position_cost_consumptions"("demand_position_id");

-- CreateIndex
CREATE INDEX "demand_position_cost_consumptions_supply_position_id_idx" ON "demand_position_cost_consumptions"("supply_position_id");

-- CreateIndex
CREATE INDEX "demand_position_cost_consumptions_account_id_idx" ON "demand_position_cost_consumptions"("account_id");

-- CreateIndex
CREATE INDEX "supply_positions_account_id_assortment_kind_assortment_id_r_idx" ON "supply_positions"("account_id", "assortment_kind", "assortment_id", "remaining_qty");

-- AddForeignKey
ALTER TABLE "demand_position_cost_consumptions" ADD CONSTRAINT "demand_position_cost_consumptions_demand_position_id_fkey" FOREIGN KEY ("demand_position_id") REFERENCES "demand_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_position_cost_consumptions" ADD CONSTRAINT "demand_position_cost_consumptions_supply_position_id_fkey" FOREIGN KEY ("supply_position_id") REFERENCES "supply_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
