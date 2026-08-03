-- Har-xodim KPI profili + ko'rsatkich maqsad-raqami (TZ 4M.2 — «har xodim uchun alohida»).
--
-- kpi_profiles.employee_id: profil bitta xodimga biriktiriladi. Kunlik hisob
--   profilni XODIM → LAVOZIM → sukut tartibida tanlaydi (individual ustun turadi).
-- kpi_profile_metrics.target: kunlik maqsad-raqam (reja), ko'rsatkich O'Z birligida.
--
-- Qaytarish: DROP + ALTER DROP COLUMN target/employee_id.

-- AlterTable
ALTER TABLE "kpi_profiles" ADD COLUMN "employee_id" UUID;

-- AlterTable
ALTER TABLE "kpi_profile_metrics" ADD COLUMN "target" BIGINT;

-- CreateIndex
CREATE INDEX "kpi_profiles_account_id_employee_id_idx" ON "kpi_profiles"("account_id", "employee_id");

-- AddForeignKey
ALTER TABLE "kpi_profiles" ADD CONSTRAINT "kpi_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
