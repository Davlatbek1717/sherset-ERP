'use client';

/**
 * HR Employee «KPI» tab — **todo ro'yxati** (KPI-04).
 *
 * ILGARI (4M.2): butun ko'rsatkich katalogi bitta jadvalda, har qatorda
 * «qo'shish» katakchasi + og'irlik + maqsad, va og'irliklar **100% ga
 * yig'ilishi** talab qilinardi — bitta KPI qo'shish qolganini qayta
 * muvozanatlashga majbur qilardi. Saqlash yangi profil VERSIYASINI yozardi,
 * shuning uchun ekranda versiya raqami turardi.
 *
 * HOZIR: faqat **biriktirilgan** KPI'lar ro'yxati (`EmployeeKpiTodoList`) —
 * metrika + maqsad + davr; og'irlik «Kengaytirilgan» ostida IXTIYORIY. Qatlam
 * versiyalanmaydi (tarixni kunlik snapshot muzlatadi), shuning uchun versiya
 * raqami ekrandan olib tashlandi.
 *
 * Hisobning O'Z ko'rsatkichini yaratish/tahrirlash shu yerda QOLADI: u
 * katalog amali (metrika TA'RIFI), biriktirish emas — biriktirish uchun
 * ro'yxatdagi «+ KPI qo'shish» ishlatiladi.
 */

import { hrEmployeeApi } from '@/lib/hr-api';
import type { HrEmployeeDetail } from '@/lib/hr-api';
import {
  type KpiMetricDef,
  type KpiUnit,
  type SaveCustomMetricInput,
  managerKpiApi,
} from '@/lib/manager-api';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Modal,
  NativeSelect,
  Skeleton,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmployeeKpiTodoList } from '../../../../menejer/_components/employee-kpi-screen';
import { TabBar } from '../../_components/tab-bar';

export default function HrEmployeeKpiPage() {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: employee } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrEmployeeApi.findOne(id),
    enabled: !!id,
  });
  const { data: metrics, isLoading: metricsLoading } = useQuery<KpiMetricDef[]>({
    queryKey: ['kpi-metrics'],
    queryFn: () => managerKpiApi.metrics(),
  });
  /** Ochiq bo'lsa — o'z ko'rsatkichi dialogi (`create` yoki tahrirlanayotgan kalit). */
  const [metricDialog, setMetricDialog] = useState<'create' | string | null>(null);
  const qc = useQueryClient();

  const label = (m: KpiMetricDef) => (locale === 'ru' ? m.labelRu : m.labelUz);

  const refreshMetrics = () => {
    void qc.invalidateQueries({ queryKey: ['kpi-metrics'] });
    // Biriktirilgan qatorlar metrika YORLIG'INI katalogdan oladi — nom
    // o'zgargach ro'yxat ham yangilanishi kerak.
    void qc.invalidateQueries({ queryKey: ['ekpi-targets', id] });
  };

  const saveMetricMut = useMutation({
    mutationFn: (v: { key: string | null; data: SaveCustomMetricInput }) =>
      v.key ? managerKpiApi.updateMetric(v.key, v.data) : managerKpiApi.createMetric(v.data),
    onSuccess: () => {
      toast.success(t('kpi_saved'));
      setMetricDialog(null);
      refreshMetrics();
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const archiveMetricMut = useMutation({
    mutationFn: (key: string) => managerKpiApi.archiveMetric(key),
    onSuccess: () => {
      toast.success(t('kpi_saved'));
      refreshMetrics();
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const editing = typeof metricDialog === 'string' ? metricDialog : null;
  const editingDef = (metrics ?? []).find((m) => m.key === editing) ?? null;

  const loading = metricsLoading;

  return (
    <div className="space-y-4">
      <Link
        href="/hr/employees"
        className="text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
      >
        ← {tCommon('back')}
      </Link>

      <div>
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">
          {employee?.name ? `${employee.name} — ` : ''}
          {t('tab_kpi')}
        </h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('kpi_hint')}</p>
      </div>

      <TabBar employeeId={id} active="kpi" />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-4">
          {/* Biriktirilgan KPI'lar — «todo» ro'yxati (KPI-04). Butun katalog
              jadvali va «og'irlik 100%» talabi OLIB TASHLANDI: bitta KPI
              qo'shish endi qolganini qayta muvozanatlashni talab qilmaydi. */}
          <EmployeeKpiTodoList employeeId={id} />

          {/* Katalog amali (biriktirish EMAS): hisobning O'Z ko'rsatkichini
              yaratish/tahrirlash. Ro'yxatdan PASTDA ataylab — bu kundalik ish
              emas, sozlama. */}
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[var(--ms-text-muted)] text-xs">{t('kpi_custom_hint')}</p>
              <Button
                variant="secondary"
                onClick={() => setMetricDialog('create')}
                data-test-id="kpi-metric-new"
              >
                + {t('kpi_custom_new')}
              </Button>
            </div>
            {(metrics ?? []).some((m) => m.custom) && (
              <ul className="mt-2 flex flex-wrap items-center gap-3">
                {(metrics ?? [])
                  .filter((m) => m.custom)
                  .map((m) => (
                    <li key={m.key} className="flex items-center gap-1.5 text-sm">
                      <span className="text-[var(--ms-text-primary)]">{label(m)}</span>
                      {/* «Qo'lda» — tizim bu raqamni hisoblay olmaydi; buni
                          yashirish yolg'on va'da bo'lardi. */}
                      <Badge tone="warning">{t('kpi_custom_manual')}</Badge>
                      <button
                        type="button"
                        onClick={() => setMetricDialog(m.key)}
                        className="text-[var(--ms-text-brand)] text-xs underline"
                        data-test-id={`kpi-metric-edit-${m.key}`}
                      >
                        {tCommon('edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => archiveMetricMut.mutate(m.key)}
                        className="text-[var(--ms-text-muted)] text-xs underline"
                        data-test-id={`kpi-metric-archive-${m.key}`}
                      >
                        {tCommon('archive')}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <CustomMetricDialog
        open={metricDialog != null}
        def={editingDef}
        pending={saveMetricMut.isPending}
        onClose={() => setMetricDialog(null)}
        onSubmit={(data) => saveMetricMut.mutate({ key: editing, data })}
        t={t}
        tCommon={tCommon}
      />
    </div>
  );
}

/**
 * O'z ko'rsatkichini yaratish/tahrirlash.
 *
 * `source` maydoni ATAYLAB yo'q: hisob yaratgan ko'rsatkichni tizim hisoblay
 * olmaydi, shuning uchun uni «kassadan olinadi» deb belgilash yolg'on va'da
 * bo'lardi. Dialog buni ochiq aytadi.
 */
function CustomMetricDialog({
  open,
  def,
  pending,
  onClose,
  onSubmit,
  t,
  tCommon,
}: {
  open: boolean;
  def: KpiMetricDef | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (data: SaveCustomMetricInput) => void;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const [labelUz, setLabelUz] = useState('');
  const [labelRu, setLabelRu] = useState('');
  const [unit, setUnit] = useState<KpiUnit>('count');
  const [direction, setDirection] = useState<'higher_better' | 'lower_better'>('higher_better');
  const [perHour, setPerHour] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabelUz(def?.labelUz ?? '');
    setLabelRu(def?.labelRu ?? '');
    setUnit(def?.unit ?? 'count');
    setDirection(def?.direction === 'lower_better' ? 'lower_better' : 'higher_better');
    setPerHour(def?.perHour ?? false);
  }, [open, def]);

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={def ? t('kpi_custom_edit') : t('kpi_custom_new')}
      description={t('kpi_custom_manual_hint')}
      testId="kpi-custom-metric-dialog"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => onSubmit({ labelUz, labelRu, unit, direction, perHour })}
            disabled={pending || labelUz.trim().length < 2}
            data-test-id="kpi-custom-metric-save"
          >
            {tCommon('save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-sm">{t('kpi_custom_name_uz')}</div>
          <Input
            value={labelUz}
            onChange={(e) => setLabelUz(e.target.value)}
            data-test-id="kpi-custom-name-uz"
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-sm">{t('kpi_custom_name_ru')}</div>
          <Input value={labelRu} onChange={(e) => setLabelRu(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-[var(--ms-text-muted)] text-sm">{t('kpi_custom_unit')}</div>
            <NativeSelect
              value={unit}
              onChange={(e) => setUnit(e.target.value as KpiUnit)}
              data-test-id="kpi-custom-unit"
            >
              <option value="count">{t('kpi_unit_dona')}</option>
              <option value="money">{t('kpi_unit_som')}</option>
              <option value="minutes">{t('kpi_unit_min')}</option>
              <option value="percent">{t('kpi_unit_pct')}</option>
            </NativeSelect>
          </div>
          <div>
            <div className="mb-1 text-[var(--ms-text-muted)] text-sm">
              {t('kpi_custom_direction')}
            </div>
            <NativeSelect
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'higher_better' | 'lower_better')}
              data-test-id="kpi-custom-direction"
            >
              <option value="higher_better">{t('kpi_dir_higher')}</option>
              <option value="lower_better">{t('kpi_dir_lower')}</option>
            </NativeSelect>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[var(--ms-text-primary)] text-sm">
          <Checkbox checked={perHour} onCheckedChange={(v) => setPerHour(v === true)} />
          {t('kpi_custom_per_hour')}
        </label>
      </div>
    </Modal>
  );
}
