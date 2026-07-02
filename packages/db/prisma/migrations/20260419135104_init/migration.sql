-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "country" VARCHAR(2) NOT NULL DEFAULT 'UZ',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'uz-Latn',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Tashkent',
    "plan" VARCHAR(20) NOT NULL DEFAULT 'trial',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "middle_name" VARCHAR(100),
    "position" VARCHAR(255),
    "phone" VARCHAR(20),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "legal_title" VARCHAR(255),
    "legal_address" TEXT,
    "company_type" VARCHAR(20) NOT NULL DEFAULT 'legalUZ',
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "director" VARCHAR(255),
    "director_position" VARCHAR(255),
    "chief_accountant" VARCHAR(255),
    "payer_vat" BOOLEAN NOT NULL DEFAULT true,
    "uz_requisites" JSONB,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "address" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_folders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "path_name" TEXT,
    "description" TEXT,
    "use_parent_vat" BOOLEAN NOT NULL DEFAULT true,
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tax_system" VARCHAR(30),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparties" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "legal_title" VARCHAR(255),
    "legal_address" TEXT,
    "company_type" VARCHAR(20) NOT NULL DEFAULT 'legalUZ',
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uz_requisites" JSONB,
    "description" TEXT,
    "code" VARCHAR(50),
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sales_amount" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "product_folder_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "article" VARCHAR(50),
    "description" TEXT,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "min_price" BIGINT,
    "buy_price" BIGINT,
    "sale_prices" JSONB,
    "weight_g" INTEGER,
    "volume_ml" INTEGER,
    "weighed" BOOLEAN NOT NULL DEFAULT false,
    "uom" VARCHAR(20),
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "use_parent_vat" BOOLEAN NOT NULL DEFAULT true,
    "tax_system" VARCHAR(30),
    "mxik_code" VARCHAR(20),
    "tracking_type" VARCHAR(30),
    "gtin" VARCHAR(14),
    "is_serial_trackable" BOOLEAN NOT NULL DEFAULT false,
    "discount_prohibited" BOOLEAN NOT NULL DEFAULT false,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sync_id" UUID,
    "barcodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "user_id" UUID,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "field_changes" JSONB,
    "context" JSONB,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_account_id_archived_idx" ON "employees"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "employees_account_id_email_key" ON "employees"("account_id", "email");

-- CreateIndex
CREATE INDEX "organizations_account_id_archived_idx" ON "organizations"("account_id", "archived");

-- CreateIndex
CREATE INDEX "stores_account_id_archived_idx" ON "stores"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "stores_account_id_code_key" ON "stores"("account_id", "code");

-- CreateIndex
CREATE INDEX "product_folders_account_id_archived_idx" ON "product_folders"("account_id", "archived");

-- CreateIndex
CREATE INDEX "product_folders_account_id_parent_id_idx" ON "product_folders"("account_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_folders_account_id_code_key" ON "product_folders"("account_id", "code");

-- CreateIndex
CREATE INDEX "counterparties_account_id_archived_idx" ON "counterparties"("account_id", "archived");

-- CreateIndex
CREATE INDEX "counterparties_account_id_company_type_idx" ON "counterparties"("account_id", "company_type");

-- CreateIndex
CREATE INDEX "products_account_id_archived_deleted_at_idx" ON "products"("account_id", "archived", "deleted_at");

-- CreateIndex
CREATE INDEX "products_account_id_product_folder_id_idx" ON "products"("account_id", "product_folder_id");

-- CreateIndex
CREATE INDEX "products_account_id_kind_idx" ON "products"("account_id", "kind");

-- CreateIndex
CREATE INDEX "products_account_id_tracking_type_idx" ON "products"("account_id", "tracking_type");

-- CreateIndex
CREATE INDEX "products_account_id_mxik_code_idx" ON "products"("account_id", "mxik_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_account_id_code_key" ON "products"("account_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "products_account_id_external_code_key" ON "products"("account_id", "external_code");

-- CreateIndex
CREATE INDEX "audit_log_account_id_entity_entity_id_at_idx" ON "audit_log"("account_id", "entity", "entity_id", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_account_id_user_id_at_idx" ON "audit_log"("account_id", "user_id", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_account_id_at_idx" ON "audit_log"("account_id", "at" DESC);

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_folders" ADD CONSTRAINT "product_folders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_folders" ADD CONSTRAINT "product_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_product_folder_id_fkey" FOREIGN KEY ("product_folder_id") REFERENCES "product_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
