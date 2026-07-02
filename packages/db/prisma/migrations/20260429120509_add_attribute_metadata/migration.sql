-- CreateTable
CREATE TABLE "attribute_metadata" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "default_value" JSONB,
    "description" TEXT,
    "enum_options" JSONB,
    "reference_entity" VARCHAR(50),
    "custom_entity_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attribute_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attribute_metadata_account_id_entity_archived_position_idx" ON "attribute_metadata"("account_id", "entity", "archived", "position");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_metadata_account_id_entity_code_key" ON "attribute_metadata"("account_id", "entity", "code");
