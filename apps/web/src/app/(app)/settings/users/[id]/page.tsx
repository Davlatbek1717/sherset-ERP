'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * moysklad settings-nav parity: the employee detail moved to
 * /settings/employees/[id]. Old bookmarks land there, id preserved.
 * Client redirect (useParams) — the dynamic segment is only known at runtime.
 */
export default function SettingsUserRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/settings/employees/${params.id}`);
  }, [params.id, router]);

  return null;
}
