-- CreateTable
CREATE TABLE "help_articles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "route_key" VARCHAR(120),
    "locale" VARCHAR(8) NOT NULL DEFAULT 'uz',
    "title" VARCHAR(255) NOT NULL,
    "body_md" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "category" VARCHAR(80),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_progress" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "current_step" VARCHAR(40) NOT NULL DEFAULT 'organization',
    "completed_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "skipped_at" TIMESTAMPTZ,
    "started_by_id" UUID,

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_articles_account_id_route_key_enabled_locale_idx" ON "help_articles"("account_id", "route_key", "enabled", "locale");

-- CreateIndex
CREATE INDEX "help_articles_account_id_category_position_idx" ON "help_articles"("account_id", "category", "position");

-- CreateIndex
CREATE UNIQUE INDEX "help_articles_account_id_slug_locale_key" ON "help_articles"("account_id", "slug", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_progress_account_id_key" ON "onboarding_progress"("account_id");

-- AddForeignKey
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
