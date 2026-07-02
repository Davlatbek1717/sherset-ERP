-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "group_id" UUID;

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'NO',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","entity","action")
);

-- CreateTable
CREATE TABLE "employee_roles" (
    "employee_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_roles_pkey" PRIMARY KEY ("employee_id","role_id")
);

-- CreateIndex
CREATE INDEX "roles_account_id_idx" ON "roles"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_account_id_name_key" ON "roles"("account_id", "name");

-- CreateIndex
CREATE INDEX "employee_roles_employee_id_idx" ON "employee_roles"("employee_id");

-- CreateIndex
CREATE INDEX "employees_account_id_group_id_idx" ON "employees"("account_id", "group_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
