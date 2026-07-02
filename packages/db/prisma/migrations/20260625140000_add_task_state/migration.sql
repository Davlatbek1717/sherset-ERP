-- moysklad «Тип задачи» on a task IS the task's `state` (State row,
-- entityType="task"), matching moysklad's own `task.state` API field. The
-- account-defined coloured list (Вазифа / Текшириш / Мухим иш …) is managed in
-- /settings/task-statuses, mirroring CustomerOrder.statusId / PurchaseOrder.statusId.
-- Supersedes the legacy TaskType lookup (`type_id`, kept dormant). SetNull so
-- deleting a state just unlinks the tasks that used it (no cascade).
ALTER TABLE "tasks" ADD COLUMN     "state_id" UUID;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tasks_account_id_state_id_idx" ON "tasks"("account_id", "state_id");
