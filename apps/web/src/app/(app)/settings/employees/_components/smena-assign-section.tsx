'use client';

/**
 * «Kassa smenasi» — xodimni smenaga biriktirish, XODIM KARTASIDAN.
 *
 * 🔴 NEGA KERAK (P11, 2026-08-11 o'lchovi): biriktirish UI'si FAQAT teskari
 * yo'nalishda bor edi (`/settings/smena/[id]` → «Xodimlar»), o'sha sahifaga
 * esa hech bir menyudan yo'l yo'q (settings-sidebar'da qatori yo'q). Ya'ni
 * yangi kassir yollagan egasi `SmenaEmployee` qatorini UI'dan qo'ya olmasdi,
 * POS esa biriktirilmagan kassirni «Siz bu smenaga biriktirilmagansiz» deb
 * rad etadi (`smena.service.ts#openSessionFromSmena`) — kassir yaratish
 * zanjirining uzilgan bo'g'ini shu edi.
 *
 * Naqsh `pos-pin-modal.tsx` bilan bir xil: kartaning o'zida, saqlash
 * darhol (kartaning «Saqlash» tugmasidan MUSTAQIL) — chunki bu xodim
 * qatorini emas, bog'lanish jadvalini o'zgartiradi.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, Checkbox } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface SmenaOption {
  id: string;
  name: string;
  schedule: { name: string; startTime: string; endTime: string };
  organization: { name: string };
}

interface EmployeeSmenas {
  items: SmenaOption[];
  smenaIds: string[];
}

export function SmenaAssignSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('pages.employee_card');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<EmployeeSmenas>({
    queryKey: ['employee-smenas', employeeId],
    queryFn: () => api.get(`/admin/smenas/employee/${employeeId}`),
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  // Server holati kelgach (yoki boshqa xodimga o'tilganda) tanlovni tiklaymiz.
  // `dirty` qo'riqchisi: saqlanmagan belgilashni refetch bosib ketmasin.
  useEffect(() => {
    if (data && !dirty) setSelected(data.smenaIds);
  }, [data, dirty]);

  const save = useApiMutation<EmployeeSmenas, Error, void>({
    mutationFn: () => api.put(`/admin/smenas/employee/${employeeId}`, { smenaIds: selected }),
    successMessage: t('smena_saved'),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['employee-smenas', employeeId] });
      qc.invalidateQueries({ queryKey: ['smenas'] });
    },
  });

  const toggle = (id: string, on: boolean) => {
    setDirty(true);
    setSelected((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  return (
    <section className="flex flex-col gap-3" data-test-id="employee-smena-section">
      <h2 className="font-normal text-[17px] text-[var(--ms-settings-heading)] leading-none">
        {t('smena_section')}
      </h2>
      <p className="text-[13px] text-[var(--ms-text-muted)]">{t('smena_hint')}</p>

      {isLoading ? (
        <span className="text-[13px] text-[var(--ms-text-muted)]">…</span>
      ) : (data?.items.length ?? 0) === 0 ? (
        <p className="text-[13px] text-[var(--ms-text-muted)]" data-test-id="employee-smena-empty">
          {t('smena_none')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {data?.items.map((s) => (
            <label
              key={s.id}
              className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-[var(--ms-text-primary)]"
            >
              <Checkbox
                checked={selected.includes(s.id)}
                onCheckedChange={(v) => toggle(s.id, v === true)}
                data-test-id={`employee-smena-${s.id}`}
              />
              <span>
                {s.name}
                <span className="ml-1.5 text-[var(--ms-text-muted)]">
                  {s.schedule.startTime}–{s.schedule.endTime} · {s.organization.name}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!dirty}
          data-test-id="employee-smena-save"
        >
          {t('smena_save')}
        </Button>
        {/* Smena/jadval yaratish sahifasiga YAGONA ko'rinadigan yo'l (nav'da
            qatori yo'q — P11 o'lchovi). */}
        <a
          href="/settings/smena"
          className="text-[13px] text-[var(--ms-text-brand)] hover:underline"
          data-test-id="employee-smena-manage"
        >
          {t('smena_manage')}
        </a>
      </div>
    </section>
  );
}
