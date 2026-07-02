-- CreateTable
CREATE TABLE "mxik_codes" (
    "code" VARCHAR(17) NOT NULL,
    "name_uz" VARCHAR(500) NOT NULL,
    "name_ru" VARCHAR(500),
    "name_en" VARCHAR(500),
    "unit_code" VARCHAR(20),
    "group_code" VARCHAR(17),
    "class_code" VARCHAR(17),
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mxik_codes_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "mxik_codes_archived_name_uz_idx" ON "mxik_codes"("archived", "name_uz");

-- CreateIndex
CREATE INDEX "mxik_codes_group_code_idx" ON "mxik_codes"("group_code");
