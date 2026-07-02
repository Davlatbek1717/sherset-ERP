-- CreateTable
CREATE TABLE "sales_channels" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "external_ref" VARCHAR(500),
    "settings" JSONB,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMPTZ,
    "last_sync_ok" BOOLEAN,
    "last_sync_msg" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sales_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "external_order_id" VARCHAR(100) NOT NULL,
    "customer_name" VARCHAR(255),
    "customer_phone" VARCHAR(20),
    "customer_address" TEXT,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "items" JSONB,
    "state" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "customer_order_id" UUID,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "online_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_installs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "app_key" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "installed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_installs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_channels_account_id_archived_idx" ON "sales_channels"("account_id", "archived");

-- CreateIndex
CREATE INDEX "sales_channels_account_id_kind_idx" ON "sales_channels"("account_id", "kind");

-- CreateIndex
CREATE INDEX "online_orders_account_id_state_received_at_idx" ON "online_orders"("account_id", "state", "received_at" DESC);

-- CreateIndex
CREATE INDEX "online_orders_account_id_channel_id_state_idx" ON "online_orders"("account_id", "channel_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "online_orders_channel_id_external_order_id_key" ON "online_orders"("channel_id", "external_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_installs_account_id_app_key_key" ON "app_installs"("account_id", "app_key");

-- AddForeignKey
ALTER TABLE "sales_channels" ADD CONSTRAINT "sales_channels_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "sales_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_installs" ADD CONSTRAINT "app_installs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
