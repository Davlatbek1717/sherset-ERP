-- Commission report «Статус» — account-defined custom status (State row,
-- entityType="commissionreportout" / "commissionreportin"), mirroring
-- Supply.statusId / Demand.statusId. Orthogonal to the FSM `state` + «Проведено».
-- onDelete SET NULL: deleting a status just unlinks it from any reports.
ALTER TABLE "commission_reports_out" ADD COLUMN "status_id" UUID;
ALTER TABLE "commission_reports_out" ADD CONSTRAINT "commission_reports_out_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "commission_reports_in" ADD COLUMN "status_id" UUID;
ALTER TABLE "commission_reports_in" ADD CONSTRAINT "commission_reports_in_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
