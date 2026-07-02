# Live API Metadata Verification

Our 79 schema JSONs include 7 manually-written. They need verification against the live Moysklad API's `/metadata` endpoint to catch any field/type drift.

## What it does

For each schema, fetches `GET https://api.moysklad.uz/api/remap/1.2/entity/<slug>/metadata` and compares:

1. **Field names** — do all ours appear in API? Are there new fields?
2. **Field types** — do types match (handling name variations)?
3. **Flags** — required/readOnly flags match?

Produces: `docs/moysklad-reference/data-model/_verification-report.json`

## Usage

```bash
# 1. Get API token from Moysklad
#    Login to https://online.moysklad.uz
#    Settings → Токены API → Generate new token
#    Copy the token

# 2. Run verification
export MOYSKLAD_API_TOKEN="your-token-here"
npx tsx tools/verify-api/verify.ts
```

## Output

```
Verifying 79 schemas against live Moysklad API...
  product...  VERIFIED
  counterparty... VERIFIED
  customerorder... DRIFT (2 new, 0 missing, 0 type diffs)
  purchaseorder... DRIFT (1 new, 0 missing, 0 type diffs)
  role... NOT FOUND
  ...

Summary:
  Verified:   68
  Drift:      9
  Not found:  2
  Errors:     0

Report: docs/moysklad-reference/data-model/_verification-report.json

Drift details (first 5):
  customerorder:
    + new: taxSystem, reservedSum
  ...
```

## Interpreting results

- **VERIFIED**: our schema matches API. No action.
- **DRIFT**: add missing fields to our schema, remove obsolete ones.
- **NOT FOUND**: API doesn't have this entity slug — either renamed or doesn't exist in UZ region.
- **ERROR**: network/auth issue, check token.

## Next steps after run

1. Review `_verification-report.json`
2. For each DRIFT entry:
   - Add `newInApi` fields to our schema JSON
   - Remove `missingInApi` fields from our schema JSON (or add note why kept)
   - Fix type differences
3. Re-run until all VERIFIED
4. Commit updated schemas

## Rate limits

Script sleeps 150ms between requests to stay under 7 req/s (well below Moysklad limits).

## Security

- Don't commit the token to git
- Store in `.env.local` or export on demand
- Revoke after use if concerned
