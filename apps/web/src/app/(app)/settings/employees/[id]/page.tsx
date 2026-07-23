'use client';

import { useParams } from 'next/navigation';
import { EmployeeCard } from '../_components/employee-card';

/** moysklad employee card (Настройки → Справочники → Сотрудники → карточка). */
export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return null;
  return <EmployeeCard id={id} />;
}
