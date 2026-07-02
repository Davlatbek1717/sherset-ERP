# Page Audit — Definition of Done (har sahifa uchun nusxa oling)

Sahifa: `<module>` · Sana: `YYYY-MM-DD` · Commit: `<hash>`

## A. Reference (Phase 0)
- [ ] `pnpm capture-moysklad <module> --check` yashil (kerakli holatlar fresh)
- [ ] `docs/moysklad-reference/<module>/states/metadata.json` commit qilingan

## B. Audit deliverable
- [ ] `docs/audit-<module>.md` — structural + interactive + stateful delta + har delta yechimi

## C. 4-faza
- [ ] **P1 Structural** — top-bar, filter, table, detail, modal — har element bor va joyida
- [ ] **P2 Interactive** — dropdown item moysklad bilan match · sort ▲▼ · resize · gear ⚙ · **silent-no-op yo'q** (har tugma onClick yoki disabled+tooltip) · affordance · single-source-of-truth · sortable=API enum
- [ ] **P3 Stateful** — S1-S13: default/empty/loading/error/filter/sel-0/sel-1/sel-many/saved-filter/pagination/sort/col-hidden/mobile
- [ ] **P4 Reference side-by-side** — Playwright screenshot vs moysklad, element-by-element diff

## D. Kod darvozalari
- [ ] `pnpm --filter @moysklad/api typecheck` 0
- [ ] `pnpm --filter @moysklad/web typecheck` 0
- [ ] tests green (yangi logika → yangi test)
- [ ] biome 0 error (tegilgan fayllar; pre-existing warning qayd qilinadi, bundle qilinmaydi)
- [ ] RU qoldiq yo'q: `git grep -i "Печать\|Изменить\|Сохранить\|Найти\|Очистить"`
- [ ] husky pre-commit + commit-msg o'tdi · Ozodbek identity

## E. Tracker
- [ ] `docs/PARITY-TRACKER.md` da sahifa ✅ + commit hash + sana

---

**Qoida (protokol 6-qism #1, #8):** Audit ALL → Fix ALL → Verify ALL → **Claim ONCE**.
"Tugadi" faqat yuqoridagi HAMMA banddan keyin. Har fix'dan keyin adversarial savol:
*"yana nima qolib ketishi mumkin?"*
