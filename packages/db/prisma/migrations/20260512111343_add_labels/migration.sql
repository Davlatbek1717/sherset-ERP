-- CreateTable
CREATE TABLE "label_templates" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "page_size" VARCHAR(20) NOT NULL DEFAULT 'A4',
    "page_width_mm" INTEGER,
    "page_height_mm" INTEGER,
    "cols" INTEGER NOT NULL DEFAULT 3,
    "rows" INTEGER NOT NULL DEFAULT 8,
    "margin_top_mm" INTEGER NOT NULL DEFAULT 10,
    "margin_left_mm" INTEGER NOT NULL DEFAULT 10,
    "column_gap_mm" INTEGER NOT NULL DEFAULT 3,
    "row_gap_mm" INTEGER NOT NULL DEFAULT 3,
    "label_width_mm" INTEGER NOT NULL DEFAULT 60,
    "label_height_mm" INTEGER NOT NULL DEFAULT 30,
    "include_name" BOOLEAN NOT NULL DEFAULT true,
    "include_price" BOOLEAN NOT NULL DEFAULT true,
    "include_barcode" BOOLEAN NOT NULL DEFAULT true,
    "include_article" BOOLEAN NOT NULL DEFAULT true,
    "header_text" VARCHAR(255),
    "barcode_format" VARCHAR(20) NOT NULL DEFAULT 'EAN13',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "label_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_print_jobs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "items_snapshot" JSONB NOT NULL,
    "total_labels" INTEGER NOT NULL DEFAULT 0,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "label_templates_account_id_archived_deleted_at_idx" ON "label_templates"("account_id", "archived", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "label_templates_account_id_name_key" ON "label_templates"("account_id", "name");

-- CreateIndex
CREATE INDEX "label_print_jobs_account_id_created_at_idx" ON "label_print_jobs"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "label_templates" ADD CONSTRAINT "label_templates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "label_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
