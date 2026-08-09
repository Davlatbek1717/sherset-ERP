import { redirect } from 'next/navigation';

/**
 * Legacy stub route. moysklad's settings nav calls this row «Токены»; the
 * real screen shipped in Faza Q14 at `/settings/api-tokens` (the path the
 * API controller has always documented). The old path is kept as a redirect
 * rather than deleted — ⛔ preserve rule: routes stay reachable, and any
 * bookmark or older nav build must not 404.
 */
export default function SettingsTokensPage() {
  redirect('/settings/api-tokens');
}
