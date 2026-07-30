-- Faza E: qabul tasdiqlash magic-link (taminotchi parolsiz tasdiq/rad, capability-token).
CREATE TABLE "supply_approval_links" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "supply_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "agent_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "supply_approval_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supply_approval_links_token_key" ON "supply_approval_links"("token");
CREATE INDEX "supply_approval_links_account_id_supply_id_idx" ON "supply_approval_links"("account_id", "supply_id");
ALTER TABLE "supply_approval_links" ADD CONSTRAINT "supply_approval_links_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
