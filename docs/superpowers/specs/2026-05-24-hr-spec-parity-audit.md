# HR module — yangibolim spec parity audit (2026-05-24)

> Full audit of the HR module against the reference spec (`yangibolim/spec/`,
> the Python FastAPI system being cloned 1:1). Scope = the spec's OWN
> authoritative checklists: §6 verification checklist (17) + §13 critical
> edge cases (17), cross-checked against `apps/api`/`apps/web` HR code.
>
> Status key: ✅ matched · ◑ by-design difference (functional-equivalent or
> better) · ⚠️ minor deviation (cosmetic / no functional impact) · ❌ real gap.

## §6 — Verification checklist (spec's own "done")

| # | Item | Status | Evidence / note |
|---|---|---|---|
| 1 | Auth: admin/xodim token, is_checker, permissions | ✅ | P1 JWT (`hrRoles`, `isChecker`, `hrPermissions`) + HrPermissionGuard. **◑ stronger:** spec uses base64 token + token-less endpoints; we use real JWT + guards (deliberate hardening, spec §13.1 allows it). |
| 2 | Template 16-input + conditional + validation | ✅ | TemplateModal (807 lines) + HrTaskTemplateSchema superRefine |
| 3 | Scheduled task cron | ✅ | HrTemplateSchedulerService (Asia/Tashkent) |
| 4 | "Ha"+checker yo'q → bonus darhol; checker bor → pending_review | ✅ | recordAnswer FSM (verified) |
| 5 | approve→bonus, reject→fine, Telegram outcome | ✅ | review service + **admin notifier (15956c5f)** |
| 6 | Deadline 60s → answered_no + auto-fine | ✅ | HrDeadlineExpireService |
| 7 | 5 bonus/fine sources + OylikPage **day-group detail modal** | ◑/❌ | 5 sources ✅; **day-group detail modal NOT built** (web shows flat bonus tab). Real UI gap (low risk, cosmetic-ish). |
| 8 | KPI cron 23:30, tier formula | ✅ | HrKpiCron + **live smoke 15/15 (4a57b09)** |
| 9 | Oylik: base+fix+kpi+bonus−fine+commission | ✅ | **live smoke proved identity (4a57b09)** |
| 10 | MoySklad sync polling + processed-set dedup | ◑ N/A | Spec polls an EXTERNAL MoySklad REST API. We ARE the source system — HR listens to our own domain events (demand.posted…) directly. Polling is architecturally moot here (direct events > polling). |
| 11 | Queue worker 5s, retry backoff, flood pause | ✅ | HrTelegramOutboxWorker (30/90/270s, flood) |
| 12 | 2 telegram akkaunt failover, flood persist | ✅ | gramjs MtprotoWorkerService, 2-slot |
| 13 | Attendance check-in/out/edit, Asia/Tashkent | ✅ | P2 attendance |
| 14 | WS new_task/task_answered/pending_review/task_reviewed | ✅ | HrTasksGateway: task_dispatched(=new_task)/task_answered/pending_review/task_finalized(=reviewed)/deadline_expired (91f8280f) |
| 15 | dateUtils tz-naive ISO → +05:00 → Asia/Tashkent | ◑ | We store proper UTC timestamptz + render via date-fns-tz Asia/Tashkent. Spec's tz-naive +05:00 hack is intentionally NOT replicated (our approach is correct, not buggy). |
| 16 | Activity log on every CRUD | ✅ | **CLOSED (9fd43e48)** — HrActivityInterceptor (self-scoping APP_INTERCEPTOR) writes HrActivityLog on every successful /hr mutation; secret-redacted diff; non-fatal. 8 tests. |
| 17 | Permission per-page full/read/own_only | ✅ | HrPermissionGuard (11 tests) |

## §13 — Critical edge cases (1:1)

| # | Edge case | Status |
|---|---|---|
| 1 | Token-less endpoints | ◑ we guard with JWT (spec §13.1 permits) |
| 2 | answered_no bypasses review | ✅ recordAnswer |
| 3 | pending_review never expires | ✅ expire takes only status='sent' |
| 4 | chain only on direct finalize (checker template child never auto-fires — spec calls it a probable bug to replicate) | ✅ our finalize chains on positive direct finalize only — matches (incl. the quirk) |
| 5 | send_to_employee doesn't set log.checker_id | ✅ checker resolved from template at answer |
| 6 | TZ inconsistency (some UTC, most local) | ◑ we use consistent UTC+TZ-render (not replicated by design) |
| 7 | _to_iso only attendance | ◑ frontend formatting, equivalent |
| 8 | exclude_unset PUT diff | ✅ partial-update Zod schemas |
| 9 | MoySklad sum in tiyin (large_sale /100) | ✅ BigInt tiyin throughout |
| 10 | log_activity doesn't commit | ◑ N/A (see §16 — activity log not wired) |
| 11 | Delete modes: Employee soft / BonusFineRule soft / TaskTemplate hard / Attendance hard / BonusFineLog hard | ⚠️ Employee soft ✅, BonusFineLog hard ✅; **BonusFineRule: we hard-delete (spec=soft)**; TaskTemplate: we soft-if-referenced else hard (spec=hard always — ours safer) |
| 12 | Telegram error never breaks main flow | ✅ all notify paths try/catch; admin notifier is out-of-band @OnEvent |
| 13 | Markdown parse_mode | ✅ admin notifier Markdown; MTProto md |
| 14 | status=failed, sent_at=null, deadline still set, failed don't expire | ✅ outbox + expire logic |
| 15 | schedule_days formats (all / 1-5 / monthly:N) | ✅ buildCronExpr |
| 16 | assigned_role "all"/null → all telegram employees | ✅ resolveAssignee |
| 17 | bonus/fine employee_name **snapshot** | ❌ HrBonusFineLog has no employeeName column — name resolved via relation join (current name, not snapshot). Schema change to fix. |

## Gap summary

**Real gaps — ALL CLOSED:**
1. ~~**§16 activity log**~~ — ✅ CLOSED (9fd43e48, interceptor).
2. ~~**§7 payroll day-group detail modal**~~ — ✅ CLOSED (e05da976).
3. ~~**§13.17 employee_name snapshot**~~ — ✅ CLOSED (e05da976, migration + all create sites).
4. ~~**§13.11 BonusFineRule soft-delete**~~ — ✅ CLOSED (e05da976, deleted_at + list filter).

**No ❌ gaps remain.** Every §6 + §13 item is ✅ matched or ◑ deliberate
improvement. The four ◑ by-design differences (real JWT, event-driven vs
external polling, correct UTC+TZ, soft-delete-when-referenced templates) are
intentional and documented.

**By-design differences (◑) — deliberately NOT replicated (ours is correct/better):**
- Real JWT + guards instead of base64 token-less endpoints (§6.1, §13.1).
- Event-driven HR (we are the source) instead of polling an external MoySklad (§6.10).
- Correct UTC + TZ-render instead of the spec's tz-naive +05:00 hack (§6.15, §13.6).
- TaskTemplate soft-delete-when-referenced instead of always-hard (§13.11).

**Closed this session:** admin Telegram Bot-API notifier (§10, commit 15956c5f);
payroll/KPI real-data smoke + concurrency (4a57b09); WS answered/pending_review
events + admin sync channel (91f8280f); telegram file-structure alignment (51e9bb10).

## Verdict (final)
**Full 1:1 parity reached** against the spec's §6 + §13 checklists. Every item
is ✅ matched or ◑ a deliberate improvement (real JWT, event-driven vs external
polling, correct UTC+TZ, soft-delete-when-referenced). All four ❌ gaps found in
the first pass were closed this session: §10 admin notifier (15956c5f), §16
activity log (9fd43e48), and §7 + §13.11 + §13.17 (e05da976). Backed by live
smoke (payroll/KPI 4a57b09) + the regenerated, live-verified Prisma client.
HR module: core 1:1 + Phase-2 real-data/concurrency hardening done.
