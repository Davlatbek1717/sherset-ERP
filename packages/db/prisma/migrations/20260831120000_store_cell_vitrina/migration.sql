-- «Vitrina» yacheyka (egasi, 2026-08-31): ko'rsatish uchun qo'yilgan tovar —
-- POS avto-taqsimoti bu yacheykani faqat boshqa hech bir manba yetmaganda
-- ishlatadi. Additiv: DEFAULT false, mavjud qatorlar xulqi o'zgarmaydi.
ALTER TABLE "store_cells" ADD COLUMN "vitrina" BOOLEAN NOT NULL DEFAULT false;
