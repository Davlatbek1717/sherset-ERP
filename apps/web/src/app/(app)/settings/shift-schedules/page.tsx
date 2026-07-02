'use client';

import { api } from '@/lib/api-client';
import { Button, Input, Modal, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface ShiftSchedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface FormState { name: string; startTime: string; endTime: string; }
const empty = (): FormState => ({ name: '', startTime: '08:00', endTime: '17:00' });

export default function ShiftSchedulesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftSchedule | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [error, setError] = useState<string | null>(null);

  const { data = [] } = useQuery<ShiftSchedule[]>({
    queryKey: ['shift-schedules'],
    queryFn: () => api.get('/admin/shift-schedules'),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/admin/shift-schedules/${editing.id}`, form)
        : api.post('/admin/shift-schedules', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-schedules'] });
      setOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/shift-schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-schedules'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(empty()); setError(null); setOpen(true); };
  const openEdit = (s: ShiftSchedule) => { setEditing(s); setForm({ name: s.name, startTime: s.startTime, endTime: s.endTime }); setError(null); setOpen(true); };

  const submit = () => {
    if (!form.name.trim()) { setError('Nomi kiritilishi shart'); return; }
    setError(null);
    saveMut.mutate();
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ms-text-primary)]">Ish vaqtlari</h1>
          <p className="text-sm text-[var(--ms-text-muted)] mt-1">Smena jadvallarini sozlang</p>
        </div>
        <Button onClick={openCreate} variant="primary">
          <Plus className="w-4 h-4 mr-1" /> Yangi ish vaqti
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 text-[var(--ms-text-muted)] text-sm">
          Hali ish vaqtlari yo'q. Birinchisini yarating.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 py-3">
              <div>
                <div className="font-medium text-[var(--ms-text-primary)]">{s.name}</div>
                <div className="text-sm text-[var(--ms-text-muted)]">{s.startTime} – {s.endTime}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteMut.mutate(s.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Tahrirlash' : 'Yangi ish vaqti'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Bekor</Button>
            <Button onClick={submit} disabled={saveMut.isPending}>Saqlash</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nomi <span className="text-[var(--ms-text-destructive)]">*</span></label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="1-smena" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Boshlanish</label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tugash</label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
          </div>
          {error && <p className="text-sm text-[var(--ms-text-destructive)]">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
