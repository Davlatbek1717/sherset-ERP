-- Omborchi zanjiri MoySklad buyurtmalari uchun: new -> picking -> picked.
-- Holat MAHALLIY: MoySklad'da bu tushuncha yo'q, shuning uchun sync uni
-- ustidan yozmaydi (upsert faqat MoySklad maydonlarini yangilaydi).
ALTER TABLE "ms_pick_lists" ADD COLUMN "pick_state" VARCHAR(20) NOT NULL DEFAULT 'new';
ALTER TABLE "ms_pick_lists" ADD COLUMN "picked_by_id" UUID;
ALTER TABLE "ms_pick_lists" ADD COLUMN "pick_started_at" TIMESTAMPTZ;
ALTER TABLE "ms_pick_lists" ADD COLUMN "picked_at" TIMESTAMPTZ;
ALTER TABLE "ms_pick_lists" ADD COLUMN "pick_note" TEXT;

CREATE INDEX "ms_pick_lists_account_state_moment_idx"
  ON "ms_pick_lists"("account_id", "pick_state", "moment" DESC);

ALTER TABLE "ms_pick_lists"
  ADD CONSTRAINT "ms_pick_lists_picked_by_id_fkey"
  FOREIGN KEY ("picked_by_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
