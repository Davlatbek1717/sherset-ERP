-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "type_id" UUID;

-- CreateTable
CREATE TABLE "task_types" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color" VARCHAR(9),
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_types_account_id_archived_position_idx" ON "task_types"("account_id", "archived", "position");

-- CreateIndex
CREATE UNIQUE INDEX "task_types_account_id_name_key" ON "task_types"("account_id", "name");

-- CreateIndex
CREATE INDEX "tasks_account_id_type_id_idx" ON "tasks"("account_id", "type_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "task_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
