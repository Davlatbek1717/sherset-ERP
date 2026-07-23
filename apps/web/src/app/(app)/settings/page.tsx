import { redirect } from 'next/navigation';

/**
 * moysklad settings-nav parity: the settings root lands on Настройки
 * компании. The old tile-grid overview moved to /settings/all.
 */
export default function SettingsRootRedirect() {
  redirect('/settings/company');
}
