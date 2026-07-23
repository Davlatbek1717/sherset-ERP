import { describe, expect, it } from 'vitest';
import {
  isEmailDeliveryAllowed,
  isWebDeliveryAllowed,
  notificationRowForKind,
} from './notification-settings-filter.js';

describe('notificationRowForKind', () => {
  it('maps task/invoice/mention/retail kinds to their matrix rows', () => {
    expect(notificationRowForKind('task_assigned')).toBe('tasks');
    expect(notificationRowForKind('task_due_soon')).toBe('tasks');
    expect(notificationRowForKind('task_overdue')).toBe('tasks');
    expect(notificationRowForKind('invoice_paid')).toBe('customer_invoices');
    expect(notificationRowForKind('invoice_overdue')).toBe('customer_invoices');
    expect(notificationRowForKind('mention')).toBe('mentions');
    expect(notificationRowForKind('return_to_warehouse')).toBe('retail');
  });

  it('leaves system/CRM kinds unmapped (matrix has no such rows)', () => {
    expect(notificationRowForKind('system')).toBeUndefined();
    expect(notificationRowForKind('opportunity_won')).toBeUndefined();
    expect(notificationRowForKind('opportunity_lost')).toBeUndefined();
  });
});

describe('isWebDeliveryAllowed (moysklad «Уведомления» semantics)', () => {
  it('no settings at all → deliver (legacy behaviour untouched)', () => {
    expect(isWebDeliveryAllowed({}, 'task_assigned')).toBe(true);
    expect(isWebDeliveryAllowed({ notifications: {} }, 'mention')).toBe(true);
  });

  it('row toggle off mutes the whole group', () => {
    const sys = { notifications: { tasks: { enabled: false, web: true } } };
    expect(isWebDeliveryAllowed(sys, 'task_assigned')).toBe(false);
    expect(isWebDeliveryAllowed(sys, 'task_overdue')).toBe(false);
  });

  it('web checkbox off mutes only the web channel of that group', () => {
    const sys = { notifications: { customer_invoices: { enabled: true, web: false } } };
    expect(isWebDeliveryAllowed(sys, 'invoice_paid')).toBe(false);
    // other groups untouched
    expect(isWebDeliveryAllowed(sys, 'mention')).toBe(true);
  });

  it('row enabled + web on → deliver', () => {
    const sys = {
      notifications: { retail: { enabled: true, web: true, email: false, phone: true } },
    };
    expect(isWebDeliveryAllowed(sys, 'return_to_warehouse')).toBe(true);
  });

  it('unmapped kinds always deliver regardless of the matrix', () => {
    const sys = { notifications: { tasks: { enabled: false, web: false } } };
    expect(isWebDeliveryAllowed(sys, 'system')).toBe(true);
  });
});

describe('isEmailDeliveryAllowed (Почта channel — OPT-IN)', () => {
  it('no settings / no row / no flag → NO e-mail (matrix default ☐)', () => {
    expect(isEmailDeliveryAllowed({}, 'task_assigned')).toBe(false);
    expect(isEmailDeliveryAllowed({ notifications: {} }, 'task_assigned')).toBe(false);
    expect(
      isEmailDeliveryAllowed(
        { notifications: { tasks: { enabled: true, web: true } } },
        'task_assigned',
      ),
    ).toBe(false);
  });

  it('explicit email:true with the row on → e-mail allowed', () => {
    const sys = { notifications: { tasks: { enabled: true, web: true, email: true } } };
    expect(isEmailDeliveryAllowed(sys, 'task_assigned')).toBe(true);
    expect(isEmailDeliveryAllowed(sys, 'task_overdue')).toBe(true);
  });

  it('row toggle off beats the email checkbox', () => {
    const sys = { notifications: { tasks: { enabled: false, email: true } } };
    expect(isEmailDeliveryAllowed(sys, 'task_assigned')).toBe(false);
  });

  it('channels are independent: web off + email on still e-mails', () => {
    const sys = { notifications: { mentions: { enabled: true, web: false, email: true } } };
    expect(isEmailDeliveryAllowed(sys, 'mention')).toBe(true);
    expect(isWebDeliveryAllowed(sys, 'mention')).toBe(false);
  });

  it('unmapped kinds are web-only (never e-mailed)', () => {
    expect(isEmailDeliveryAllowed({ notifications: {} }, 'system')).toBe(false);
  });
});
