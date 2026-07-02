-- Backfill: migrate salePrices `priceTypeId` string sentinels to the real
-- PriceType id, per account.
--   'default'   -> the account's default price type   (is_default, lowest position)
--   'wholesale' -> the account's first non-default tier (lowest position)
-- Sentinels are LEFT UNTOUCHED when the account has no matching price type (the
-- read layer still resolves them), and already-real ids fall through unchanged,
-- so this migration is safe to re-run.

-- Products --------------------------------------------------------------------
UPDATE products p
SET sale_prices = remapped.arr
FROM (
  SELECT
    pr.id AS pid,
    jsonb_agg(
      CASE
        WHEN e.elem->>'priceTypeId' = 'default' AND dt.id IS NOT NULL
          THEN jsonb_set(e.elem, '{priceTypeId}', to_jsonb(dt.id::text))
        WHEN e.elem->>'priceTypeId' = 'wholesale' AND wt.id IS NOT NULL
          THEN jsonb_set(e.elem, '{priceTypeId}', to_jsonb(wt.id::text))
        ELSE e.elem
      END
      ORDER BY e.ord
    ) AS arr
  FROM products pr
  -- Coerce a non-array sale_prices (object/scalar) to an empty array INSIDE the
  -- lateral. jsonb_array_elements is in FROM, evaluated before WHERE, so a bare
  -- jsonb_array_elements(pr.sale_prices) on a non-array row aborts the whole
  -- statement; the CASE makes it yield zero rows instead (that product is then
  -- simply excluded — left as-is). Array data is unaffected.
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(pr.sale_prices) = 'array' THEN pr.sale_prices ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(elem, ord)
  LEFT JOIN LATERAL (
    SELECT id FROM price_types
    WHERE account_id = pr.account_id AND is_default = true AND archived = false
    ORDER BY position ASC LIMIT 1
  ) dt ON true
  LEFT JOIN LATERAL (
    SELECT id FROM price_types
    WHERE account_id = pr.account_id AND is_default = false AND archived = false
    ORDER BY position ASC LIMIT 1
  ) wt ON true
  WHERE pr.sale_prices IS NOT NULL
  GROUP BY pr.id
) remapped
WHERE p.id = remapped.pid;

-- Variants --------------------------------------------------------------------
UPDATE variants v
SET sale_prices = remapped.arr
FROM (
  SELECT
    vr.id AS vid,
    jsonb_agg(
      CASE
        WHEN e.elem->>'priceTypeId' = 'default' AND dt.id IS NOT NULL
          THEN jsonb_set(e.elem, '{priceTypeId}', to_jsonb(dt.id::text))
        WHEN e.elem->>'priceTypeId' = 'wholesale' AND wt.id IS NOT NULL
          THEN jsonb_set(e.elem, '{priceTypeId}', to_jsonb(wt.id::text))
        ELSE e.elem
      END
      ORDER BY e.ord
    ) AS arr
  FROM variants vr
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(vr.sale_prices) = 'array' THEN vr.sale_prices ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(elem, ord)
  LEFT JOIN LATERAL (
    SELECT id FROM price_types
    WHERE account_id = vr.account_id AND is_default = true AND archived = false
    ORDER BY position ASC LIMIT 1
  ) dt ON true
  LEFT JOIN LATERAL (
    SELECT id FROM price_types
    WHERE account_id = vr.account_id AND is_default = false AND archived = false
    ORDER BY position ASC LIMIT 1
  ) wt ON true
  WHERE vr.sale_prices IS NOT NULL
  GROUP BY vr.id
) remapped
WHERE v.id = remapped.vid;
