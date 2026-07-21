# Kontragent multi-select guruh-filtri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/counterparties` ro'yxatiga `CounterpartyGroup` bo'yicha **multi-select** filtr — bir nechta guruh tanlanганда shu guruhlarning birortасidagi kontragentlar birga ko'rinadi.

**Architecture:** Backend'да `CounterpartyFilterSchema`ga `cpGroupIds` (uuid-massiv) qo'shiladi; `list()` `groups: { some: { id: { in } } }` (OR-semantika). Frontend'да filtr paneliga multi-select guruh-Field qo'shiladi (`/counterparty-groups` bilan yuklanadi, `cpGroupIds` query-param). Mavjud single `cpGroupId` (UI'siz) saqlanadi.

**Tech Stack:** NestJS + Zod + Prisma (m2m `Counterparty.groups`) · Next.js + React Query + `InlineFilterPanel` · next-intl (uz+ru) · Vitest.

## Global Constraints

- **Hamma OPUS'da** (CLAUDE.md §0).
- **Validatsiya = Zod**; tenant `accountId`-scoped; guruhlar ham account-scoped.
- **i18n:** hardcoded UI matn YO'Q — `messages/ru.json` + `uz.json` (ikkalasi).
- **Commit subject kichik harf** (commitlint); **`git add <aniq yo'l>`** — hech qachon `-A`; commitdan oldin `git status --short` bilan staged'ni tasdiqla.
- **⚠️ PARALLEL-SESSIYA (§6):** `counterparties/page.tsx` va boshqa fayllarга boshqa sessiya tegayotgan bo'lishi mumkin — commitdan oldin tekshir, faqat o'z o'zgarishlaringni stage qil.
- **Gate:** `pnpm typecheck` 0 · `pnpm lint` 0 · `pnpm i18n:gate` 0 · api+web Vitest regressiyasiz.
- **Halollik:** natija **«Phase-1, runtime-unverified»**; browser-smoke alohida (deploy/lokal).
- Spec: [`docs/superpowers/specs/2026-07-21-counterparty-group-filter-design.md`](../specs/2026-07-21-counterparty-group-filter-design.md).

## File Structure

| Fayl | Amal |
|---|---|
| `apps/api/src/modules/counterparty/counterparty.schema.ts` (~168) | `cpGroupIds` maydon |
| `apps/api/src/modules/counterparty/counterparty.service.ts` (~149) | `list()` where `groups: { some: { id: { in } } }` |
| `apps/api/src/modules/counterparty/counterparty.schema.test.ts` | `cpGroupIds` parse testi |
| `apps/web/src/app/(app)/counterparties/page.tsx` (~365, 393, 414, 966, +Field) | state + groups query + param + Field + onClear + faol-filtr |
| `apps/web/src/messages/{ru,uz}.json` | filtr label |

---

## Task 1: Backend — `cpGroupIds` filter (schema + service)

**Files:**
- Modify: `apps/api/src/modules/counterparty/counterparty.schema.ts` (`cpGroupId`dan keyin, ~170)
- Modify: `apps/api/src/modules/counterparty/counterparty.service.ts` (`cpGroupId` clause yonida, ~149)
- Test: `apps/api/src/modules/counterparty/counterparty.schema.test.ts`

**Interfaces:**
- Produces: `CounterpartyFilter.cpGroupIds?: string[]` (vergul-ajratilgan query-stringdan transform); service `groups: { some: { id: { in: cpGroupIds } } }`.

- [ ] **Step 1: Schema testini yoz** (`counterparty.schema.test.ts` — `CounterpartyFilterSchema` describe ichiga)

```ts
it('cpGroupIds — vergul-ajratilgan uuid ro\'yxatini massivga aylantiradi', () => {
  const a = '11111111-1111-1111-1111-111111111111';
  const b = '22222222-2222-2222-2222-222222222222';
  const r = CounterpartyFilterSchema.safeParse({ cpGroupIds: `${a},${b}` });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.cpGroupIds).toEqual([a, b]);
});
it('cpGroupIds — yo\'q bo\'lsa undefined/bo\'sh (filtrsiz)', () => {
  const r = CounterpartyFilterSchema.safeParse({});
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.cpGroupIds ?? []).toEqual([]);
});
it('cpGroupIds — noto\'g\'ri uuid rad etiladi', () => {
  expect(CounterpartyFilterSchema.safeParse({ cpGroupIds: 'not-a-uuid' }).success).toBe(false);
});
```

- [ ] **Step 2: Test — FAIL** · Run: `pnpm --filter @moysklad/api exec vitest run src/modules/counterparty/counterparty.schema.test.ts -t cpGroupIds`
Expected: FAIL (`cpGroupIds` yo'q → undefined, uuid-rad ishlamaydi).

- [ ] **Step 3: `cpGroupIds`ni schema'ga qo'sh** (`cpGroupId: uuid.optional(),` qatoridan keyin)

```ts
    // «Группы» multi-select — m2m guruh a'zoligi (OR: birortasида bo'lsa mos).
    // Query-param vergul-ajratilgan uuid ro'yxati sifatida keladi (`a,b,c`) →
    // string[]. `cpGroupId` (single) UI'siz saqlanadi; bu multi-select uchun.
    cpGroupIds: z
      .string()
      .optional()
      .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter((x) => x.length > 0) : []))
      .refine((arr) => arr.every((x) => uuid.safeParse(x).success), {
        message: 'cpGroupIds: har biri uuid bo\'lishi kerak',
      }),
```
> `uuid` — fayl boshida import qilingan (`z.string().uuid()`); `cpGroupId` ham uni ishlatadi.

- [ ] **Step 4: Test — PASS**

- [ ] **Step 5: `list()` where'ga qo'sh** (`counterparty.service.ts` — mavjud `cpGroupId` qatoridan keyin, ~149)

Mavjud:
```ts
      ...(filter.cpGroupId ? { groups: { some: { id: filter.cpGroupId } } } : {}),
```
Yonига qo'sh:
```ts
      ...(filter.cpGroupIds?.length
        ? { groups: { some: { id: { in: filter.cpGroupIds } } } }
        : {}),
```
> Ikkovi ham `groups: { some: ... }` — agar bir vaqtда ikkovi berilsa Prisma oxirgi `groups` kalitini oladi; amalда UI faqat `cpGroupIds` yuboradi, `cpGroupId` UI'siz. (Agar bir obyektда ikkала `groups` kaliti bo'lsa TS/JS oxirgisini oladi — `cpGroupIds` clause `cpGroupId`dan KEYIN qo'yiladi, shuning uchun multi ustun turadi.)

- [ ] **Step 6: Service test (bor bo'lsa) + typecheck**

Run: `pnpm --filter @moysklad/api typecheck && pnpm --filter @moysklad/api exec vitest run src/modules/counterparty`
Expected: tc0, testlar yashil.

- [ ] **Step 7: Commit (faqat 3 api fayl)**

```bash
git add apps/api/src/modules/counterparty/counterparty.schema.ts apps/api/src/modules/counterparty/counterparty.service.ts apps/api/src/modules/counterparty/counterparty.schema.test.ts
git status --short   # faqat shu 3 fayl
git commit -m "feat(counterparty): cpGroupIds multi-select guruh-filtri (some/in)"
```

---

## Task 2: Frontend — filtr paneliga multi-select guruh-Field

**Files:**
- Modify: `apps/web/src/app/(app)/counterparties/page.tsx`
- Modify: `apps/web/src/messages/ru.json`, `uz.json`

**Interfaces:**
- Consumes: `GET /counterparty-groups` → `{ items: { id: string; name: string }[] }` (mavjud); backend `cpGroupIds` (Task 1, vergul-ajratilgan).
- Produces: `cpGroupIds` state + query-param + filtr-Field.

- [ ] **Step 1: State + guruhlar query qo'sh** (boshqa filtr-state'lar yonida, `useState`lar bloki ~266)

```ts
  const [cpGroupIds, setCpGroupIds] = useState<string[]>([]);
  const { data: cpGroups } = useQuery<{ items: { id: string; name: string }[] }>({
    queryKey: ['counterparty-groups'],
    queryFn: () => api.get('/counterparty-groups'),
  });
```
> `useQuery`/`api` allaqachon import qilingan (sahifada ishlatiladi). Kalit `['counterparty-groups']` — group-manager-modal bilan bir xil, kesh ulashiladi.

- [ ] **Step 2: Query-param'ga qo'sh** (`const params = new URLSearchParams({ ... })`, ~365)

Mavjud `...(stateId ? { stateId } : {}),` yonига:
```ts
              ...(cpGroupIds.length ? { cpGroupIds: cpGroupIds.join(',') } : {}),
```
Va query `queryKey` deps massiviga (~393, `stateId,` yonига) `cpGroupIds.join(','),` qo'sh (o'zgarганda refetch).

- [ ] **Step 3: «faol filtr» tekshiruviga qo'sh** (~966, `!!stateId ||` yonига)

```ts
    cpGroupIds.length > 0 ||
```

- [ ] **Step 4: `onClear`ga qo'sh** (~1100, boshqa `set*('')` lar yonига)

```ts
                setCpGroupIds([]);
```

- [ ] **Step 5: Multi-select guruh-Field qo'sh** (`<InlineFilterPanel.Field label={tFilters('show')}...` yoki priceType Field yonига, `InlineFilterPanel` bolalari ichида)

```tsx
              <InlineFilterPanel.Field label={t('col_groups')} expandable>
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto" data-test-id="filter-cp-groups">
                  {(cpGroups?.items ?? []).length === 0 ? (
                    <span className="text-[var(--ms-text-muted)] text-xs">{tFilters('no_options')}</span>
                  ) : (
                    (cpGroups?.items ?? []).map((g) => (
                      <label key={g.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={cpGroupIds.includes(g.id)}
                          onChange={(e) => {
                            setCpGroupIds((prev) =>
                              e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id),
                            );
                            setPage(1);
                          }}
                        />
                        {g.name}
                      </label>
                    ))
                  )}
                </div>
              </InlineFilterPanel.Field>
```
> `t('col_groups')` label allaqachon bor (ustun sarlavhasi «Группы»/«Guruhlar»). `tFilters('no_options')` — agar yo'q bo'lsa i18n qo'shiladi (Step 6).

- [ ] **Step 6: i18n `no_options` (agar yo'q bo'lsa)** — `ru.json` `filters` namespace: `"no_options": "Нет вариантов"`; `uz.json`: `"no_options": "Variant yo'q"`. (Avval `grep -n '"no_options"' apps/web/src/messages/uz.json` bilan tekshir — bo'lsa qo'shma.)

- [ ] **Step 7: Gate — web tc + biome + i18n**

Run: `pnpm --filter @moysklad/web typecheck && pnpm exec biome check "apps/web/src/app/(app)/counterparties/page.tsx" && pnpm i18n:gate`
Expected: 0.

- [ ] **Step 8: Commit (faqat page + messages)**

```bash
git add "apps/web/src/app/(app)/counterparties/page.tsx" apps/web/src/messages/ru.json apps/web/src/messages/uz.json
git status --short
git commit -m "feat(web): kontragentlar filtriga multi-select guruh"
```

---

## Yakuniy gate + Phase-2

- [ ] `pnpm typecheck` 0 · `pnpm lint` 0 · `pnpm i18n:gate` 0 · api+web Vitest regressiyasiz.
- [ ] **Browser-smoke (deploy/lokal):** filtr panelida bir nechta guruh belgilash → ro'yxat shu guruhlardagi kontragentlar bilan yangilanadi; boshqa filtr bilan AND; tozalash ishlaydi.

## Self-Review (spec qamrovi)

| Spec talabi | Task |
|---|---|
| multi-select guruh-filtri (OR/some-in) | 1 (schema+service), 2 (Field) |
| `/counterparty-groups` bilan yuklash | 2 Step-1 |
| query-param wiring + faol-filtr + clear | 2 Step 2-4 |
| i18n ru+uz | 2 Step-6 |
| parallel-sessiya izolyatsiya | Global Constraints |
| YAGNI (tree yo'q, ungrouped yo'q) | — (qo'shilmaydi) |

**Ochiq nozik:** `cpGroups` bo'sh bo'lsa Field «variant yo'q» ko'rsatadi (xato emas); `no_options` i18n mavjudligini tekshir (Step-6).
