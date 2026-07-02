-- spec §13.17: snapshot the employee name on each bonus/fine log (survives renames)
ALTER TABLE "hr_bonus_fine_log" ADD COLUMN "employee_name" VARCHAR(255);

-- spec §13.11: soft-delete bonus/fine rules (preserve rule for historical ruleId refs)
ALTER TABLE "hr_bonus_fine_rule" ADD COLUMN "deleted_at" TIMESTAMPTZ;
