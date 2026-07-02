-- CreateTable
CREATE TABLE "print_templates" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "entity" VARCHAR(40) NOT NULL,
    "format" VARCHAR(10) NOT NULL DEFAULT 'pdf',
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "body_html" TEXT NOT NULL,
    "body_docx" BYTEA,
    "page_size" VARCHAR(10) NOT NULL DEFAULT 'A4',
    "margin_top" INTEGER NOT NULL DEFAULT 20,
    "margin_right" INTEGER NOT NULL DEFAULT 15,
    "margin_bottom" INTEGER NOT NULL DEFAULT 20,
    "margin_left" INTEGER NOT NULL DEFAULT 15,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "print_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "print_templates_account_id_entity_format_enabled_is_default_idx" ON "print_templates"("account_id", "entity", "format", "enabled", "is_default");

-- CreateIndex
CREATE INDEX "print_templates_account_id_archived_idx" ON "print_templates"("account_id", "archived");

-- AddForeignKey
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
