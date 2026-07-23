import { redirect } from 'next/navigation';

/** Old settings-chrome create route → the Склад-section blank card. */
export default function SettingsStoreNewRedirect() {
  redirect('/stores/new');
}
