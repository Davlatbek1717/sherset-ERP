-- moysklad «Группы контрагентов» — flat named groups, many-to-many with Counterparty.
-- SEPARATE from `groups` (the access department «Отдел»). Additive only.

-- CreateTable
CREATE TABLE "counterparty_groups" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "counterparty_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable (implicit m2m join: A = Counterparty, B = CounterpartyGroup)
CREATE TABLE "_CounterpartyGroups" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE INDEX "counterparty_groups_account_id_idx" ON "counterparty_groups"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_groups_account_id_name_key" ON "counterparty_groups"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "_CounterpartyGroups_AB_unique" ON "_CounterpartyGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_CounterpartyGroups_B_index" ON "_CounterpartyGroups"("B");

-- AddForeignKey
ALTER TABLE "counterparty_groups" ADD CONSTRAINT "counterparty_groups_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CounterpartyGroups" ADD CONSTRAINT "_CounterpartyGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CounterpartyGroups" ADD CONSTRAINT "_CounterpartyGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "counterparty_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
