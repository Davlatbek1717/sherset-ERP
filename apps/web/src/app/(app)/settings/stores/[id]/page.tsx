import { redirect } from 'next/navigation';

/** Old settings-chrome card route → the Склад-section card (moysklad parity). */
export default async function SettingsStoreRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/stores/${id}`);
}
