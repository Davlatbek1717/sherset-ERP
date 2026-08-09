'use client';

import { equipmentStatusTone } from '@/lib/domain-status-tone';
import { equipmentApi } from '@/lib/equipment-api';
import type { EquipmentRow, EquipmentStatus, ReturnCondition } from '@/lib/equipment-api';
import { hrEmployeeApi } from '@/lib/hr-api';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  formatDate,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * HR — JIHOZ REYESTRI (MK05 · 4M TZ §6.4, §6.3).
 *
 * Nima uchun bor: MK03 gacha tizim jihoz haqida hech narsa bilmasdi —
 * javobgarlik taxtasida jihoz bloki ataylab tashlangan, bo'shatish
 * ro'yxatidagi bandi esa qo'lda tasdiq edi. Reyestr ikkalasini ham tizim
 * biladigan faktga o'tkazadi.
 *
 * ⚠️ Ikki qoida ekranda ham ko'rinadi:
 *   1. «Kimda» — faqat OCHIQ biriktirishdan (`holder`), holat ustunidan EMAS.
 *   2. Xodimda turgan jihozning holatini o'zgartirib bo'lmaydi (server rad
 *      etadi) — «hisobdan chiqarildi» bosish bilan javobgarlikni o'chirish
 *      yo'li yopiq. Shuning uchun tugmalar ham shartli chiziladi.
 *
 * Tarix APPEND-ONLY: qaytarilgan qator yo'qolmaydi, sanasi bilan qoladi.
 */

const STATUSES: EquipmentStatus[] = ['in_stock', 'assigned', 'repair', 'written_off', 'lost'];
const CONDITIONS: ReturnCondition[] = ['ok', 'damaged', 'lost'];

export default function HrEquipmentPage() {
  const t = useTranslations('pages.hrEquipment');
  const tCommon = useTranslations('common');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<EquipmentRow | null>(null);
  const [returnTarget, setReturnTarget] = useState<EquipmentRow | null>(null);
  const [historyTarget, setHistoryTarget] = useState<EquipmentRow | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['hr-equipment', status, q],
    queryFn: () => equipmentApi.list({ status: status || undefined, q: q || undefined }),
  });

  const rows = data?.items ?? [];

  return (
    <div className="space-y-4" data-test-id="hr-equipment-page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-test-id="hr-equipment-create">
          + {t('create_button')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search_placeholder')}
          className="max-w-xs"
          data-test-id="hr-equipment-search"
        />
        <Select
          value={status}
          onChange={setStatus}
          ariaLabel={t('col_status')}
          options={[
            { value: '', label: t('filter_all') },
            ...STATUSES.map((s) => ({ value: s, label: t(`status_${s}` as never) })),
          ]}
          className="w-56"
        />
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title={tCommon('action_failed')}
            description={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t('empty_title')} description={t('empty_hint')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_name')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_inventory_no')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_status')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_holder')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_issued_at')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-[var(--ms-border-default)] border-b last:border-b-0"
                  data-test-id={`hr-equipment-row-${row.id}`}
                >
                  <td className="px-3 py-2 font-medium text-[var(--ms-text-primary)]">
                    {row.name}
                    {row.category && (
                      <span className="ml-2 text-[var(--ms-text-muted)] text-xs">
                        {row.category}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.inventoryNo ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={equipmentStatusTone(row.status)}>
                      {t(`status_${row.status}` as never)}
                    </Badge>
                  </td>
                  {/* «Kimda» — ochiq biriktirishdan. Holat ustuni bu yerda
                      ishlatilmaydi: ikkinchi manba jimgina uzoqlashardi. */}
                  <td className="px-3 py-2">{row.holder?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                    {row.issuedAt ? formatDate(row.issuedAt) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {row.holder ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setReturnTarget(row)}
                          data-test-id={`hr-equipment-return-${row.id}`}
                        >
                          {t('return_button')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          // Biriktirish faqat OMBORDAGI jihozda: ta'mir /
                          // hisobdan chiqarilgan / yo'qolganini serverning
                          // o'zi ham rad etadi.
                          disabled={row.status !== 'in_stock'}
                          onClick={() => setAssignTarget(row)}
                          data-test-id={`hr-equipment-assign-${row.id}`}
                        >
                          {t('assign_button')}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setHistoryTarget(row)}
                        data-test-id={`hr-equipment-history-${row.id}`}
                      >
                        {t('history_button')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateModal open={createOpen} onOpenChange={setCreateOpen} />
      <AssignModal target={assignTarget} onClose={() => setAssignTarget(null)} />
      <ReturnModal target={returnTarget} onClose={() => setReturnTarget(null)} />
      <HistoryModal target={historyTarget} onClose={() => setHistoryTarget(null)} />
    </div>
  );
}

function CreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations('pages.hrEquipment');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [inventoryNo, setInventoryNo] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setInventoryNo('');
    setCategory('');
  }, [open]);

  const save = useMutation({
    mutationFn: () =>
      equipmentApi.create({
        name: name.trim(),
        inventoryNo: inventoryNo.trim() || null,
        category: category.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-equipment'] });
      toast.success(tCommon('saved'));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('create_title')}>
      <div className="space-y-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('col_name')}
          data-test-id="hr-equipment-name"
        />
        <Input
          value={inventoryNo}
          onChange={(e) => setInventoryNo(e.target.value)}
          placeholder={t('col_inventory_no')}
        />
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t('col_category')}
        />
        {/* Yangi jihoz HAR DOIM omborda — «kimda» faqat biriktirish orqali. */}
        <p className="text-[var(--ms-text-muted)] text-xs">{t('create_hint')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
            data-test-id="hr-equipment-save"
          >
            {tCommon('save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AssignModal({ target, onClose }: { target: EquipmentRow | null; onClose: () => void }) {
  const t = useTranslations('pages.hrEquipment');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [employeeId, setEmployeeId] = useState<string>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!target) return;
    setEmployeeId('');
    setNote('');
  }, [target]);

  const { data: employees } = useQuery({
    queryKey: ['hr-employees-for-equipment'],
    queryFn: () => hrEmployeeApi.list({ limit: 200 }),
    enabled: target !== null,
  });

  const save = useMutation({
    mutationFn: () =>
      equipmentApi.assign(String(target?.id), { employeeId, note: note.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-equipment'] });
      qc.invalidateQueries({ queryKey: ['manager-accountability'] });
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  return (
    <Modal open={target !== null} onOpenChange={(v) => !v && onClose()} title={t('assign_title')}>
      <div className="space-y-3">
        <div className="text-[var(--ms-text-muted)] text-sm">{target?.name}</div>
        <Select
          value={employeeId || undefined}
          onChange={setEmployeeId}
          ariaLabel={t('assign_employee')}
          placeholder={t('assign_employee')}
          options={(employees?.rows ?? []).map((e) => ({ value: e.id, label: e.name }))}
          testId="hr-equipment-assign-employee"
        />
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('note_placeholder')}
          rows={2}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!employeeId || save.isPending}
            data-test-id="hr-equipment-assign-save"
          >
            {t('assign_button')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReturnModal({ target, onClose }: { target: EquipmentRow | null; onClose: () => void }) {
  const t = useTranslations('pages.hrEquipment');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [condition, setCondition] = useState<ReturnCondition>('ok');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!target) return;
    setCondition('ok');
    setNote('');
  }, [target]);

  const save = useMutation({
    mutationFn: () =>
      equipmentApi.returnItem(String(target?.id), { condition, note: note.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-equipment'] });
      qc.invalidateQueries({ queryKey: ['manager-accountability'] });
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  return (
    <Modal open={target !== null} onOpenChange={(v) => !v && onClose()} title={t('return_title')}>
      <div className="space-y-3">
        <div className="text-[var(--ms-text-muted)] text-sm">
          {target?.name} · {target?.holder?.name ?? '—'}
        </div>
        <Select
          value={condition}
          onChange={(v) => setCondition(v as ReturnCondition)}
          ariaLabel={t('return_condition')}
          options={CONDITIONS.map((c) => ({ value: c, label: t(`condition_${c}` as never) }))}
          testId="hr-equipment-return-condition"
        />
        {/* Shart holatni belgilaydi: shikastlangani ta'mirga, yo'qolgani
            `lost` ga o'tadi va reyestrda QOLADI. */}
        <p className="text-[var(--ms-text-muted)] text-xs">{t('return_hint')}</p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('note_placeholder')}
          rows={2}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            data-test-id="hr-equipment-return-save"
          >
            {t('return_button')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function HistoryModal({ target, onClose }: { target: EquipmentRow | null; onClose: () => void }) {
  const t = useTranslations('pages.hrEquipment');

  const { data, isLoading } = useQuery({
    queryKey: ['hr-equipment-detail', target?.id],
    queryFn: () => equipmentApi.get(String(target?.id)),
    enabled: target !== null,
  });

  return (
    <Modal open={target !== null} onOpenChange={(v) => !v && onClose()} title={t('history_title')}>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (data?.history ?? []).length === 0 ? (
        <EmptyState title={t('history_empty')} />
      ) : (
        <ul className="divide-y divide-[var(--ms-border-default)] text-sm">
          {(data?.history ?? []).map((h) => (
            <li key={h.id} className="py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{h.employee?.name ?? '—'}</span>
                <span className="text-[var(--ms-text-muted)] text-xs">
                  {formatDate(h.issuedAt)}
                  {h.returnedAt ? ` → ${formatDate(h.returnedAt)}` : ''}
                </span>
              </div>
              <div className="text-[var(--ms-text-muted)] text-xs">
                {/* Ochiq qator ALOHIDA belgilanadi: aynan shu qator
                    bo'shatish ro'yxatini bloklaydi. */}
                {h.returnedAt === null
                  ? t('history_open')
                  : t(`condition_${h.returnCondition ?? 'ok'}` as never)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
