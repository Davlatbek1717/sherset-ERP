-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "author_id" UUID,
    "assignee_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "entity" VARCHAR(50),
    "entity_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "priority" VARCHAR(10) NOT NULL DEFAULT 'normal',
    "due_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_account_id_assignee_id_status_due_at_idx" ON "tasks"("account_id", "assignee_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_account_id_entity_entity_id_idx" ON "tasks"("account_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "tasks_account_id_status_archived_idx" ON "tasks"("account_id", "status", "archived");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
