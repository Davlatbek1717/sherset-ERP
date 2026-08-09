/**
 * MK26 — xodim darajasidagi ruxsat override qatlami (SOF qatlam).
 *
 * TZ: docs/superpowers/specs/2026-08-01-menejer-tz-design.md §3.1, §3.3.
 *
 *     Amaldagi ruxsat = ROL qatlami (MAX) → XODIM qatlami (override g'olib)
 *
 * Bu faylda Prisma, Nest va `Date.now()` YO'Q — qaror mantiqi shu yerda,
 * I/O `employee-permission.service.ts` da. Shu ajratma tufayli G1 (imtiyoz
 * oshirish taqiqi) DB'siz, jadval-test bilan qulflanadi.
 */
import {
  type PermissionAction,
  type PermissionEntity,
  type PermissionScope,
  SCOPE_ORDER,
  maxScope,
} from './permissions.types.js';

/** Bitta rolning shu (entity, action) uchun bergan scope'i. */
export interface RoleGrant {
  roleName: string;
  scope: PermissionScope;
}

/** `EmployeePermission` qatorining qaror uchun kerakli qismi. */
export interface OverrideRow {
  scope: PermissionScope;
  /** ISO satr — sof qatlam vaqt hisoblamaydi, faqat uzatadi. */
  grantedAt: string | null;
  grantedByName: string | null;
}

/** Amaldagi ruxsat + u qayerdan kelgani (G2 uchun manba saqlanadi). */
export interface EffectivePermission {
  scope: PermissionScope;
  source: 'role' | 'override' | 'none';
  /** MAX'ni bergan rol nomi (determinist). Override g'olib bo'lsa ham saqlanadi. */
  roleName: string | null;
  /** Rol qatlami o'zi nima bergan — override tushirgan bo'lsa farq ko'rinadi. */
  roleScope: PermissionScope;
  grantedAt: string | null;
  grantedByName: string | null;
}

/**
 * Rol qatlami: barcha rollar bo'yicha MAX(scope) — MAVJUD qoida, o'zgarmaydi.
 * Teng scope beruvchi bir nechta rol bo'lsa alifbo bo'yicha birinchisi olinadi:
 * G2 qatori so'rovdan so'rovga sakramasligi kerak (rollar tartibi DB'dan
 * kafolatlanmagan).
 */
function resolveRoleLayer(grants: readonly RoleGrant[]): {
  scope: PermissionScope;
  name: string | null;
} {
  let scope: PermissionScope = 'NO';
  let name: string | null = null;
  for (const g of [...grants].sort((a, b) => a.roleName.localeCompare(b.roleName))) {
    const next = maxScope(scope, g.scope);
    // Faqat scope KO'TARILGANDA nom yangilanadi → teng qiymatda alifbodagi
    // birinchi rol g'olib qoladi.
    if (next !== scope || name === null) {
      if (SCOPE_ORDER[g.scope] > SCOPE_ORDER[scope] || name === null) name = g.roleName;
      scope = next;
    }
  }
  return { scope, name: scope === 'NO' ? null : name };
}

/**
 * Bitta uch-lik uchun override qo'llash. `null` = override yo'q.
 * Diqqat: `MAX` EMAS — override rol natijasini KO'TARADI ham, TUSHIRADI ham
 * (TZ §3.1). MAX qilinsa «bitta xodimni cheklash» imkonsiz bo'lardi.
 */
export function applyOverride(
  roleScope: PermissionScope,
  overrideScope: PermissionScope | null,
): PermissionScope {
  return overrideScope ?? roleScope;
}

/** Rol qatlami + override → amaldagi ruxsat (manbasi bilan). */
export function resolveEffective(
  grants: readonly RoleGrant[],
  override: OverrideRow | null,
): EffectivePermission {
  const role = resolveRoleLayer(grants);
  if (override) {
    return {
      scope: override.scope,
      source: 'override',
      roleName: role.name,
      roleScope: role.scope,
      grantedAt: override.grantedAt,
      grantedByName: override.grantedByName,
    };
  }
  return {
    scope: role.scope,
    source: role.scope === 'NO' ? 'none' : 'role',
    roleName: role.name,
    roleScope: role.scope,
    grantedAt: null,
    grantedByName: null,
  };
}

// ── G1 — imtiyoz oshirish taqiqi ────────────────────────────────────────────

export type GrantRefusalReason =
  | 'actor_lacks_permission'
  | 'scope_above_actor'
  | 'allowed'
  | 'owner_bypass';

export interface GrantVerdict {
  allowed: boolean;
  reason: GrantRefusalReason;
}

/**
 * G1 (TZ §3.3): aktor **o'zida yo'q ruxsatni** bera olmaydi va **o'zidan
 * yuqori scope** tayinlay olmaydi. Aks holda bir marta `role:update` olgan
 * xodim o'zini adminga aylantiradi.
 *
 * Ikki ataylab qilingan istisno:
 *  - **`NO` berish har doim mumkin** — cheklash imtiyoz oshirish emas.
 *    Bloklansa, admin o'zi ochib qo'ygan teshikni yopa olmay qolardi.
 *  - **egasi (owner)** tekshiruvdan ozod, lekin bu OSHKORA bayroq bilan
 *    (`actorIsOwner`) — chaqiruvchi buni bilib turib uzatadi.
 */
export function checkGrantAllowed(input: {
  actorScope: PermissionScope;
  requestedScope: PermissionScope;
  actorIsOwner?: boolean;
}): GrantVerdict {
  const { actorScope, requestedScope, actorIsOwner = false } = input;

  if (actorIsOwner) return { allowed: true, reason: 'owner_bypass' };
  // Ruxsatni olib tashlash — har doim ruxsat etiladi.
  if (requestedScope === 'NO') return { allowed: true, reason: 'allowed' };
  if (actorScope === 'NO') return { allowed: false, reason: 'actor_lacks_permission' };
  if (SCOPE_ORDER[requestedScope] > SCOPE_ORDER[actorScope]) {
    return { allowed: false, reason: 'scope_above_actor' };
  }
  return { allowed: true, reason: 'allowed' };
}

// ── G2 — «nega bu ruxsat bor?» ──────────────────────────────────────────────

export interface PermissionExplanation {
  entity: PermissionEntity;
  action: PermissionAction;
  scope: PermissionScope;
  source: 'role' | 'override' | 'none';
  roleName: string | null;
  /** Rol qatlami bergan scope — override tushirganini ko'rsatish uchun. */
  roleScope: PermissionScope;
  grantedAt: string | null;
  grantedByName: string | null;
}

/**
 * Xodim kartasidagi bitta qator (TZ §3.3 G2):
 *
 *     demand : view : ALL     ← «Savdo menejeri» rolidan
 *     debt   : update : OWN   ← individual berilgan · 2026-08-01 · Admin
 */
export function explainPermission(
  entity: PermissionEntity,
  action: PermissionAction,
  eff: EffectivePermission,
): PermissionExplanation {
  return {
    entity,
    action,
    scope: eff.scope,
    source: eff.source,
    roleName: eff.roleName,
    roleScope: eff.roleScope,
    grantedAt: eff.grantedAt,
    grantedByName: eff.grantedByName,
  };
}
