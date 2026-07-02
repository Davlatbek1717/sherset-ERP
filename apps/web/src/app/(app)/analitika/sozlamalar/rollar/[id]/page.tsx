'use client';

import { useParams } from 'next/navigation';
import { RoleDetailView } from '../../_components/role-detail-view';

export default function RoleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return null;
  return <RoleDetailView id={id} />;
}
