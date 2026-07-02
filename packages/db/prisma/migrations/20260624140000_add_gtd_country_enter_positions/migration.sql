-- moysklad «Номер ГТД» / «Сумма ГТД» / «Страна» — import/customs block on the
-- #enter create grid (mirror SupplyPosition §41, migration 20260518085517).
-- РНПТ/Маркировка intentionally NOT here — separate marking-system feature.
ALTER TABLE "enter_positions" ADD COLUMN     "country_id" UUID,
ADD COLUMN     "gtd_number" VARCHAR(255),
ADD COLUMN     "gtd_sum_minor" BIGINT;

-- CreateIndex
CREATE INDEX "enter_positions_country_id_idx" ON "enter_positions"("country_id");

-- AddForeignKey
ALTER TABLE "enter_positions" ADD CONSTRAINT "enter_positions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
