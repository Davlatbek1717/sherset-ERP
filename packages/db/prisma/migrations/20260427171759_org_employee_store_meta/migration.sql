-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "external_code" VARCHAR(50),
ADD COLUMN     "full_name" VARCHAR(310),
ADD COLUMN     "image_content" BYTEA,
ADD COLUMN     "image_mime" VARCHAR(100),
ADD COLUMN     "inn" VARCHAR(20),
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "salary_currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
ADD COLUMN     "salary_minor" BIGINT,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "short_fio" VARCHAR(120),
ADD COLUMN     "uid" VARCHAR(64);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "actual_address" TEXT,
ADD COLUMN     "actual_address_full" JSONB,
ADD COLUMN     "bonus_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonus_program_id" UUID,
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "external_code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "is_egais_enable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legal_address_full" JSONB,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "tracking_contract_date" DATE,
ADD COLUMN     "tracking_contract_number" VARCHAR(50);

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "address_full" JSONB,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "external_code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "parent_id" UUID,
ADD COLUMN     "path_name" VARCHAR(500),
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "zones" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "stores_account_id_parent_id_idx" ON "stores"("account_id", "parent_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_bonus_program_id_fkey" FOREIGN KEY ("bonus_program_id") REFERENCES "bonus_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
