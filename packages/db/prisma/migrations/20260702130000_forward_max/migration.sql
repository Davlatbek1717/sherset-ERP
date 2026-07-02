-- Forward-pick replenishment: products keep up to `forward_max` in the forward
-- (fast-pick) store; the replenishment list flags those below it.
ALTER TABLE "products" ADD COLUMN "forward_max" INTEGER;
ALTER TABLE "stores" ADD COLUMN "is_forward" BOOLEAN NOT NULL DEFAULT false;
