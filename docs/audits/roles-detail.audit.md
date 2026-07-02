# analitika/sozlamalar/rollar — detail parity audit (Cohort L)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** moysklad capture `00-module/role` («Роли и права доступа»). The route `analitika/sozlamalar/rollar/[id]/page.tsx` is a 2-line delegate — real content lives in `_components/role-detail-view.tsx` (read THAT, per premise: do not audit the empty shell in isolation).
**Pages:** `analitika/sozlamalar/rollar/[id]` → `RoleDetailView`.

## A. Structural / field deltas

- Fields: role name, description (both disabled for system roles), system/custom badge, member count, system-locked notice, + a full `PermissionMatrix` (entity × action × scope). i18n'd via `pages.analitika_settings`.
- **No deltas.** Already fully internationalised; structurally unique permission-matrix editor (premise: do NOT diff against settings EditForm siblings — would fabricate deltas).

## B. Interactive deltas

- Save → PATCH `/roles/:id` (system roles send only `permissions`; custom also send name/description). Discard (resets to server state), Delete (confirm; disabled when memberCount > 0 or system). Dirty-count via sparse-cell serialization → "Save (n)" label.
- Save success/error surfaced in the sticky bottom bar. No deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress). No code change required (clean).
