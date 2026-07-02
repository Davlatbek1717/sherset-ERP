'use client';

import { api } from '@/lib/api-client';
import { Button, useToast } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { Clock, Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SmenaRow {
  id: string;
  name: string;
  schedule: { name: string; startTime: string; endTime: string };
  organization: { name: string };
  employees: { employee: { id: string; name: string } }[];
}

export default function SmenaListPage() {
  const router = useRouter();
  const { toast } = useToast();

  const { data = [], isLoading } = useQuery<SmenaRow[]>({
    queryKey: ['smenas'],
    queryFn: () => api.get('/admin/smenas'),
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ms-text-primary)]">Smenalar</h1>
          <p className="text-sm text-[var(--ms-text-muted)] mt-1">
            Kassa, ombor va xodimlar biriktirilgan ish smenalari
          </p>
        </div>
        <Button variant="primary" onClick={() => router.push('/settings/smena/new')}>
          <Plus className="w-4 h-4 mr-1" /> Yangi smena
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-[var(--ms-text-muted)]">Yuklanmoqda...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-[var(--ms-text-muted)] text-sm">
          Hali smena yo'q. Birinchisini yarating.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 cursor-pointer hover:border-[var(--ms-border-strong)] transition-colors"
              onClick={() => router.push(`/settings/smena/${s.id}`)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-[var(--ms-text-primary)]">{s.name}</div>
                  <div className="flex items-center gap-1 mt-1 text-sm text-[var(--ms-text-muted)]">
                    <Clock className="w-3.5 h-3.5" />
                    {s.schedule.name} · {s.schedule.startTime}–{s.schedule.endTime}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-[var(--ms-text-muted)]">
                  <Users className="w-3.5 h-3.5" />
                  {s.employees.length} kassir
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--ms-text-muted)]">
                <span className="rounded bg-[var(--ms-bg-app)] px-2 py-0.5">{s.organization.name}</span>
              </div>
              {s.employees.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.employees.map(({ employee }) => (
                    <span key={employee.id} className="rounded-full bg-[var(--ms-brand-50)] text-[var(--ms-text-brand)] text-xs px-2 py-0.5">
                      {employee.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
