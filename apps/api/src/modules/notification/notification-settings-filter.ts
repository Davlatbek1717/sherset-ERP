import type { EmployeeSystemAttrs } from '../hr/hr-employee/hr-employee.service.js';
import type { NotificationKindValue } from './notification.schema.js';

/**
 * moysklad employee card «Уведомления» → runtime delivery filter.
 *
 * The card stores a per-employee matrix (row toggle + Веб-интерфейс/Почта/
 * Телефон channels) in Employee.attributes.__employee_system.notifications.
 * Every in-app notification funnels through NotificationService.emit(), which
 * is our «Веб-интерфейс» channel (bell + SSE) — so emit() consults this map
 * and silently drops kinds the recipient turned off.
 *
 * Backward compatible by design: an employee with NO stored row for a group
 * (or no settings at all) keeps receiving everything, exactly like before
 * the matrix existed. Only an explicit `enabled:false` or `web:false` mutes.
 */

/** Notification kind → «Уведомления» row key. Unmapped kinds (system, CRM
 *  deal outcomes) have no row in moysklad's matrix — always delivered. */
const ROW_BY_KIND: Partial<Record<NotificationKindValue, string>> = {
  task_assigned: 'tasks',
  task_due_soon: 'tasks',
  task_overdue: 'tasks',
  invoice_paid: 'customer_invoices',
  invoice_overdue: 'customer_invoices',
  mention: 'mentions',
  return_to_warehouse: 'retail',
  restock_assigned: 'retail',
  picking_assigned: 'retail',
  // G2 — kontrol oqimi kassir-signallari ham «Розница» qatorida.
  sale_edited: 'retail',
  sale_ready: 'retail',
};

export function notificationRowForKind(kind: NotificationKindValue): string | undefined {
  return ROW_BY_KIND[kind];
}

/** True when the web (bell/SSE) channel may deliver `kind` to this employee. */
export function isWebDeliveryAllowed(
  sys: EmployeeSystemAttrs,
  kind: NotificationKindValue,
): boolean {
  const rowKey = notificationRowForKind(kind);
  if (!rowKey) return true; // unmapped kind — matrix has no say
  const row = sys.notifications?.[rowKey];
  if (!row) return true; // never configured — keep legacy always-deliver
  if (row.enabled === false) return false; // row toggle off mutes the group
  return row.web !== false; // channel checkbox off mutes just the web channel
}

/**
 * True when the «Почта» channel may e-mail `kind` to this employee.
 * OPT-IN, unlike web: the matrix default for Почта is unchecked (☐), so
 * an absent row / absent flag means NO e-mail — only an explicit
 * `email: true` (with the row toggle on) enqueues one. Unmapped kinds
 * (system, CRM outcomes) are web-only.
 */
export function isEmailDeliveryAllowed(
  sys: EmployeeSystemAttrs,
  kind: NotificationKindValue,
): boolean {
  const rowKey = notificationRowForKind(kind);
  if (!rowKey) return false;
  const row = sys.notifications?.[rowKey];
  if (!row || row.enabled === false) return false;
  return row.email === true;
}
