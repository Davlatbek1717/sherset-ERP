-- CreateTable
CREATE TABLE "exchange_rates" (
    "date" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(20,6) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'CBRU',
    "nominal" INTEGER NOT NULL DEFAULT 1,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("date","currency","source")
);

-- CreateIndex
CREATE INDEX "exchange_rates_currency_date_idx" ON "exchange_rates"("currency", "date" DESC);
