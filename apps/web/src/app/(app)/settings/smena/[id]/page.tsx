'use client';

import { api } from '@/lib/api-client';
import { Button, Input, NativeSelect, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SEL =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] hover:border-[var(--ms-border-strong)]';

interface Option { id: string; name: string; }
interface Schedule { id: string; name: string; startTime: string; endTime: string; }
interface Employee { id: string; name: string; }

interface SmenaDetail {
  id: string;
  name: string;
  scheduleId: string;
  organizationId: string;
  schedule: Schedule;
  organization: Option;
  employees: { employee: Employee }[];
}

export default function EditSmenaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const { data: smena, isLoading } = useQuery<SmenaDetail>({
    queryKey: ['smena', id],
    queryFn: () => api.get(`/admin/smenas/${id}`),
  });
  const { data: schedules } = useQuery<Schedule[]>({ queryKey: ['shift-schedules'], queryFn: () => api.get('/admin/shift-schedules') });
  const { data: orgs } = useQuery<{ items: Option[] }>({ queryKey: ['organizations-admin'], queryFn: () => api.get('/admin/organizations') });
  const { data: employees } = useQuery<{ rows: Employee[] }>({ queryKey: ['employees-list'], queryFn: () => api.get('/hr/employees?limit=200') });

  useEffect(() => {
    if (smena && !loaded) {
      setName(smena.name);
      setScheduleId(smena.scheduleId);
      setOrganizationId(smena.organizationId);
      setSelectedEmployees(smena.employees.map(e => e.employee));
      setLoaded(true);
    }
  }, [smena, loaded]);

  const updateMut = useMutation({
    mutationFn: () =>
      api.patch(`/admin/smenas/${id}`, {
        name, scheduleId, organizationId,
        employeeIds: selectedEmployees.map(e => e.id),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smenas'] });
      qc.invalidateQueries({ queryKey: ['smena', id] });
      toast.success('Smena saqlandi');
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/admin/smenas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smenas'] });
      router.push('/settings/smena');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) { setError('Smena nomi kiritilishi shart'); return; }
    if (!scheduleId) { setError('Ish vaqti tanlanishi shart'); return; }
    if (!organizationId) { setError('Tashkilot tanlanishi shart'); return; }
    if (selectedEmployees.length === 0) { setError('Kamida bitta xodim tanlanishi shart'); return; }
    setError(null);
    updateMut.mutate();
  };

  const addEmployee = (eid: string) => {
    const emp = employees?.rows.find(e => e.id === eid);
    if (emp && !selectedEmployees.find(e => e.id === eid)) {
      setSelectedEmployees(prev => [...prev, emp]);
    }
  };

  if (isLoading) return <div className="p-6 text-sm text-[var(--ms-text-muted)]">Yuklanmoqda...</div>;

  return (
    <div className="p-6 max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--ms-text-primary)]">{smena?.name ?? 'Smena'}</h1>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => { if (confirm("Smena o'chirilsinmi?")) deleteMut.mutate(); }}
          disabled={deleteMut.isPending}
        >
          O'chirish
        </Button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="se-name" className="block text-sm font-medium mb-1">Nomi <span className="text-[var(--ms-text-destructive)]">*</span></label>
          <Input id="se-name" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div>
          <label htmlFor="se-schedule" className="block text-sm font-medium mb-1">Ish vaqti <span className="text-[var(--ms-text-destructive)]">*</span></label>
          <NativeSelect id="se-schedule" value={scheduleId} onChange={e => setScheduleId(e.target.value)} className={SEL}>
            <option value="">— tanlang —</option>
            {schedules?.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>)}
          </NativeSelect>
        </div>

        <div>
          <label htmlFor="se-org" className="block text-sm font-medium mb-1">Tashkilot <span className="text-[var(--ms-text-destructive)]">*</span></label>
          <NativeSelect id="se-org" value={organizationId} onChange={e => setOrganizationId(e.target.value)} className={SEL}>
            <option value="">— tanlang —</option>
            {orgs?.items.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </NativeSelect>
        </div>

        <div>
          <label htmlFor="se-emp" className="block text-sm font-medium mb-1">Xodimlar <span className="text-[var(--ms-text-destructive)]">*</span></label>
          <NativeSelect
            id="se-emp"
            className={SEL}
            value=""
            onChange={e => { addEmployee(e.target.value); e.target.value = ''; }}
          >
            <option value="">— xodim qo'shish —</option>
            {employees?.rows
              .filter(e => !selectedEmployees.find(s => s.id === e.id))
              .map(e => <option key={e.id} value={e.id}>{e.name}</option>)
            }
          </NativeSelect>
          {selectedEmployees.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedEmployees.map(emp => (
                <span key={emp.id} className="flex items-center gap-1 rounded-full bg-[var(--ms-brand-50)] text-[var(--ms-text-brand)] text-xs px-2.5 py-1">
                  {emp.name}
                  <button type="button" onClick={() => setSelectedEmployees(prev => prev.filter(e => e.id !== emp.id))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-[var(--ms-text-destructive)]">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Bekor</Button>
          <Button type="submit" variant="primary" disabled={updateMut.isPending}>Saqlash</Button>
        </div>
      </form>
    </div>
  );
}
