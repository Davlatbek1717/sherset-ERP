-- moysklad «Привязать документ» — manual document associations shown in the
-- «Связанные документы» tab. Polymorphic + snapshot of both endpoints' display
-- fields, so the related panel needs no cross-model resolution. Additive.

CREATE TABLE "document_links" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "source_type" VARCHAR(64) NOT NULL,
    "source_id" UUID NOT NULL,
    "target_type" VARCHAR(64) NOT NULL,
    "target_id" UUID NOT NULL,
    "source_name" VARCHAR(255) NOT NULL,
    "source_moment" TIMESTAMPTZ NOT NULL,
    "source_sum_minor" BIGINT NOT NULL,
    "source_state" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "target_name" VARCHAR(255) NOT NULL,
    "target_moment" TIMESTAMPTZ NOT NULL,
    "target_sum_minor" BIGINT NOT NULL,
    "target_state" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_links_unique" ON "document_links"("account_id", "source_type", "source_id", "target_type", "target_id");
CREATE INDEX "document_links_source_idx" ON "document_links"("account_id", "source_type", "source_id");
CREATE INDEX "document_links_target_idx" ON "document_links"("account_id", "target_type", "target_id");
