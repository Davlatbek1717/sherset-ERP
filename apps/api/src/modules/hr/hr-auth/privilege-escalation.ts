import { ForbiddenException } from '@nestjs/common';

/**
 * Imtiyoz-chegarasi qoidalari (audit `HR-10`).
 *
 * Muammo: `employees:full` HR-ruxsati bo'lgan HAR KIM `PUT /hr/employees/:id/permissions`
 * yoki `PATCH /hr/employees/:id` (`hrRoles`) orqali O'ZIGA to'liq HR-admin bera olardi —
 * ya'ni «ruxsat berish» amali imtiyoz chegarasini saqlamasdi.
 *
 * Ikki qoida:
 *  1. **Self-check** — hech kim o'zining ruxsat/rolini o'zgartira olmaydi (`actorId === targetId` → 403).
 *     Ruxsatni boshqa (yuqoriroq) shaxs beradi.
 *  2. **Admin-grant** — `admin` HR-rolini faqat o'zi `admin` bo'lgan aktor bera oladi.
 *     Bootstrap mavjud: `packages/db/prisma/seed-hr.ts` akkaunt egasiga `hrRoles: ['admin']`
 *     yozadi, shuning uchun bu qoida hech qachon «admin qololmaydigan akkaunt» hosil qilmaydi.
 *
 * Sof funksiyalar — I/O yo'q, chaqiruvchi kerakli qatorlarni o'zi o'qiydi.
 */
export const HR_ADMIN_ROLE = 'admin';

/**
 * `actorId === targetEmployeeId` bo'lsa 403.
 *
 * `actorId === undefined` — tizim/seed chaqiruvi (HTTP aktor yo'q): tekshiruv o'tkazib
 * yuboriladi. Barcha HTTP yo'llari aktorni `user.sub` bilan uzatadi.
 */
export function assertNoSelfPrivilegeChange(
  actorId: string | undefined,
  targetEmployeeId: string,
  subject: string,
): void {
  if (actorId && actorId === targetEmployeeId) {
    throw new ForbiddenException(
      `O'z ${subject} o'zingiz o'zgartira olmaysiz — buni boshqa mas'ul xodim bajaradi`,
    );
  }
}

/** Yangi ro'yxatda `admin` paydo bo'ldimi (ya'ni BERILDIMI)? */
export function grantsAdminRole(
  currentHrRoles: readonly string[],
  nextHrRoles: readonly string[],
): boolean {
  return nextHrRoles.includes(HR_ADMIN_ROLE) && !currentHrRoles.includes(HR_ADMIN_ROLE);
}

/** `admin` rolini berish — faqat aktor o'zi admin bo'lsa. */
export function assertAdminRoleGrantAllowed(args: {
  actorHrRoles: readonly string[];
  currentHrRoles: readonly string[];
  nextHrRoles: readonly string[];
}): void {
  if (!grantsAdminRole(args.currentHrRoles, args.nextHrRoles)) return;
  if (args.actorHrRoles.includes(HR_ADMIN_ROLE)) return;
  throw new ForbiddenException(
    `'${HR_ADMIN_ROLE}' HR-rolini faqat admin bera oladi — sizda bu rol yo'q`,
  );
}
