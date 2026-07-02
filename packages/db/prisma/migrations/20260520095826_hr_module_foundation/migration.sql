-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('CRM', 'HR');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "department" VARCHAR(100),
ADD COLUMN     "hr_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "is_checker" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moysklad_agent_id" UUID,
ADD COLUMN     "salary_config" JSONB,
ADD COLUMN     "telegram_phone" VARCHAR(20),
ADD COLUMN     "username" VARCHAR(50);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "hr_checker_id" UUID,
ADD COLUMN     "hr_deadline_minutes" INTEGER,
ADD COLUMN     "hr_depends_on_id" UUID,
ADD COLUMN     "hr_fine_minor" BIGINT,
ADD COLUMN     "hr_response_type" VARCHAR(20) DEFAULT 'none',
ADD COLUMN     "hr_reward_minor" BIGINT,
ADD COLUMN     "hr_template_id" UUID,
ADD COLUMN     "kind" "TaskKind" NOT NULL DEFAULT 'CRM';

-- CreateTable
CREATE TABLE "hr_task_template" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "assigned_employee_id" UUID,
    "assigned_role" VARCHAR(50),
    "department" VARCHAR(100),
    "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "trigger_type" VARCHAR(20) NOT NULL,
    "schedule_config" JSONB,
    "event_config" JSONB,
    "response_type" VARCHAR(20) NOT NULL DEFAULT 'none',
    "deadline_minutes" INTEGER,
    "reward_minor" BIGINT,
    "fine_minor" BIGINT,
    "checker_id" UUID,
    "depends_on_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_task_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_task_log" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "response_text" TEXT,
    "sent_at" TIMESTAMPTZ NOT NULL,
    "answered_at" TIMESTAMPTZ,
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by_id" UUID,
    "review_comment" TEXT,
    "telegram_message_id" VARCHAR(50),
    "fail_reason" TEXT,

    CONSTRAINT "hr_task_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_attendance" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "check_in_time" TIMESTAMPTZ NOT NULL,
    "check_out_time" TIMESTAMPTZ,
    "edited_by_id" UUID,
    "edited_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_telegram_account" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "api_id" INTEGER NOT NULL,
    "api_hash_encrypted" TEXT NOT NULL,
    "session_encrypted" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_connected_at" TIMESTAMPTZ,
    "flood_wait_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_telegram_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_telegram_session" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "account_slot" INTEGER NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_telegram_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_chat_history" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_chat_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_telegram_outbox" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID,
    "employee_id" UUID,
    "to_phone" VARCHAR(20) NOT NULL,
    "message_text" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "fail_reason" TEXT,
    "source_event_type" VARCHAR(50),
    "source_doc_id" UUID,
    "telegram_message_id" VARCHAR(50),
    "sent_by_slot" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_telegram_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_bonus_fine_log" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" TEXT,
    "task_log_id" UUID,
    "rule_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_bonus_fine_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_bonus_fine_rule" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "condition" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_bonus_fine_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_salary_config" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "fix_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.7,
    "kpi_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.2,
    "bonus_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.1,
    "monthly_sales_target" BIGINT NOT NULL,
    "monthly_kpi_budget" BIGINT NOT NULL,
    "commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "kpi_tiers" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_salary_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_kpi_daily_log" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "personal_sales_minor" BIGINT NOT NULL,
    "target_minor" BIGINT NOT NULL,
    "achievement_percent" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_kpi_daily_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_kpi_monthly_score" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "total_sales_minor" BIGINT NOT NULL,
    "target_minor" BIGINT NOT NULL,
    "achievement_percent" DECIMAL(6,2) NOT NULL,
    "tier_payout_percent" DECIMAL(6,2) NOT NULL,
    "kpi_earned_minor" BIGINT NOT NULL,
    "fix_component_minor" BIGINT NOT NULL,
    "bonus_sum_minor" BIGINT NOT NULL,
    "fine_sum_minor" BIGINT NOT NULL,
    "commission_minor" BIGINT NOT NULL,
    "final_salary_minor" BIGINT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_kpi_monthly_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employee_permission" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "page_key" VARCHAR(50) NOT NULL,
    "section" VARCHAR(50),
    "access_level" VARCHAR(20) NOT NULL DEFAULT 'read',

    CONSTRAINT "hr_employee_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_role" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "value" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "hr_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_notification_template" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "doc_type" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "template_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "large_sale_min_threshold" BIGINT,

    CONSTRAINT "hr_notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_activity_log" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "diff" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hr_task_template_account_id_is_active_idx" ON "hr_task_template"("account_id", "is_active");

-- CreateIndex
CREATE INDEX "hr_task_template_account_id_trigger_type_idx" ON "hr_task_template"("account_id", "trigger_type");

-- CreateIndex
CREATE UNIQUE INDEX "hr_task_log_task_id_key" ON "hr_task_log"("task_id");

-- CreateIndex
CREATE INDEX "hr_task_log_account_id_employee_id_status_idx" ON "hr_task_log"("account_id", "employee_id", "status");

-- CreateIndex
CREATE INDEX "hr_task_log_account_id_template_id_sent_at_idx" ON "hr_task_log"("account_id", "template_id", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "hr_task_log_account_id_status_sent_at_idx" ON "hr_task_log"("account_id", "status", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "hr_attendance_account_id_employee_id_check_in_time_idx" ON "hr_attendance"("account_id", "employee_id", "check_in_time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "hr_telegram_account_account_id_slot_key" ON "hr_telegram_account"("account_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "hr_telegram_session_account_id_account_slot_key_key" ON "hr_telegram_session"("account_id", "account_slot", "key");

-- CreateIndex
CREATE UNIQUE INDEX "hr_chat_history_account_id_counterparty_id_key" ON "hr_chat_history"("account_id", "counterparty_id");

-- CreateIndex
CREATE INDEX "hr_telegram_outbox_account_id_status_next_retry_at_idx" ON "hr_telegram_outbox"("account_id", "status", "next_retry_at");

-- CreateIndex
CREATE INDEX "hr_telegram_outbox_account_id_counterparty_id_created_at_idx" ON "hr_telegram_outbox"("account_id", "counterparty_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "hr_bonus_fine_log_account_id_employee_id_created_at_idx" ON "hr_bonus_fine_log"("account_id", "employee_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "hr_bonus_fine_log_account_id_source_created_at_idx" ON "hr_bonus_fine_log"("account_id", "source", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "hr_salary_config_account_id_key" ON "hr_salary_config"("account_id");

-- CreateIndex
CREATE INDEX "hr_kpi_daily_log_account_id_date_idx" ON "hr_kpi_daily_log"("account_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "hr_kpi_daily_log_account_id_employee_id_date_key" ON "hr_kpi_daily_log"("account_id", "employee_id", "date");

-- CreateIndex
CREATE INDEX "hr_kpi_monthly_score_account_id_year_month_idx" ON "hr_kpi_monthly_score"("account_id", "year_month");

-- CreateIndex
CREATE UNIQUE INDEX "hr_kpi_monthly_score_account_id_employee_id_year_month_key" ON "hr_kpi_monthly_score"("account_id", "employee_id", "year_month");

-- CreateIndex
CREATE UNIQUE INDEX "hr_employee_permission_account_id_employee_id_page_key_sect_key" ON "hr_employee_permission"("account_id", "employee_id", "page_key", "section");

-- CreateIndex
CREATE UNIQUE INDEX "hr_role_account_id_value_key" ON "hr_role"("account_id", "value");

-- CreateIndex
CREATE UNIQUE INDEX "hr_notification_template_account_id_doc_type_event_type_key" ON "hr_notification_template"("account_id", "doc_type", "event_type");

-- CreateIndex
CREATE INDEX "hr_activity_log_account_id_created_at_idx" ON "hr_activity_log"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "hr_activity_log_account_id_entity_type_entity_id_created_at_idx" ON "hr_activity_log"("account_id", "entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_account_id_username_key" ON "employees"("account_id", "username");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_hr_template_id_fkey" FOREIGN KEY ("hr_template_id") REFERENCES "hr_task_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_template" ADD CONSTRAINT "hr_task_template_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_template" ADD CONSTRAINT "hr_task_template_assigned_employee_id_fkey" FOREIGN KEY ("assigned_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_template" ADD CONSTRAINT "hr_task_template_checker_id_fkey" FOREIGN KEY ("checker_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_template" ADD CONSTRAINT "hr_task_template_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "hr_task_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_log" ADD CONSTRAINT "hr_task_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_log" ADD CONSTRAINT "hr_task_log_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "hr_task_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_log" ADD CONSTRAINT "hr_task_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_log" ADD CONSTRAINT "hr_task_log_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_task_log" ADD CONSTRAINT "hr_task_log_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_attendance" ADD CONSTRAINT "hr_attendance_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_attendance" ADD CONSTRAINT "hr_attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_attendance" ADD CONSTRAINT "hr_attendance_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_telegram_account" ADD CONSTRAINT "hr_telegram_account_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_telegram_session" ADD CONSTRAINT "hr_telegram_session_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_chat_history" ADD CONSTRAINT "hr_chat_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_chat_history" ADD CONSTRAINT "hr_chat_history_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_telegram_outbox" ADD CONSTRAINT "hr_telegram_outbox_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_telegram_outbox" ADD CONSTRAINT "hr_telegram_outbox_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_telegram_outbox" ADD CONSTRAINT "hr_telegram_outbox_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_bonus_fine_log" ADD CONSTRAINT "hr_bonus_fine_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_bonus_fine_log" ADD CONSTRAINT "hr_bonus_fine_log_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_bonus_fine_log" ADD CONSTRAINT "hr_bonus_fine_log_task_log_id_fkey" FOREIGN KEY ("task_log_id") REFERENCES "hr_task_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_bonus_fine_log" ADD CONSTRAINT "hr_bonus_fine_log_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "hr_bonus_fine_rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_bonus_fine_log" ADD CONSTRAINT "hr_bonus_fine_log_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_bonus_fine_rule" ADD CONSTRAINT "hr_bonus_fine_rule_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_salary_config" ADD CONSTRAINT "hr_salary_config_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_kpi_daily_log" ADD CONSTRAINT "hr_kpi_daily_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_kpi_daily_log" ADD CONSTRAINT "hr_kpi_daily_log_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_kpi_monthly_score" ADD CONSTRAINT "hr_kpi_monthly_score_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_kpi_monthly_score" ADD CONSTRAINT "hr_kpi_monthly_score_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_permission" ADD CONSTRAINT "hr_employee_permission_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_permission" ADD CONSTRAINT "hr_employee_permission_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_role" ADD CONSTRAINT "hr_role_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_notification_template" ADD CONSTRAINT "hr_notification_template_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_activity_log" ADD CONSTRAINT "hr_activity_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_activity_log" ADD CONSTRAINT "hr_activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- HR module RLS policies (multi-tenant isolation)
-- ============================================================================
-- This block is appended manually to the migration SQL generated by
-- `prisma migrate dev --create-only --name hr_module_foundation`.
--
-- App must SET LOCAL app.account_id = '<uuid>' via Prisma middleware before
-- every query (see packages/db/src/account-context.ts pattern used by mavjud
-- modules).
-- ============================================================================

-- 1. Partial unique index on Employee.username — only enforced when NOT NULL.
--    Prisma generates a plain UNIQUE index from @@unique([accountId, username]);
--    we replace it with a partial index so NULL usernames don't collide.
DROP INDEX IF EXISTS "employees_account_id_username_key";
CREATE UNIQUE INDEX "Employee_account_username_uk"
  ON "employees"("account_id", "username")
  WHERE "username" IS NOT NULL;

-- 2. Enable RLS + tenant_isolation policy for each new HR table.
--    Policy: row visible iff account_id matches current session setting.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'hr_task_template',
    'hr_task_log',
    'hr_attendance',
    'hr_telegram_account',
    'hr_telegram_session',
    'hr_chat_history',
    'hr_telegram_outbox',
    'hr_bonus_fine_log',
    'hr_bonus_fine_rule',
    'hr_salary_config',
    'hr_kpi_daily_log',
    'hr_kpi_monthly_score',
    'hr_employee_permission',
    'hr_role',
    'hr_notification_template',
    'hr_activity_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("account_id" = current_setting(''app.account_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END $$;
