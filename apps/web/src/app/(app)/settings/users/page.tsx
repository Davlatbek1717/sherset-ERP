import { redirect } from 'next/navigation';

/**
 * moysklad settings-nav parity: the employee list moved to
 * /settings/employees (Настройки → Сотрудники). Old bookmarks land there.
 */
export default function SettingsUsersRedirect() {
  redirect('/settings/employees');
}
