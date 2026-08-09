'use client';

/**
 * Narx siyosati — chegirma va zarar chegaralari (MK38 · 4-bo'lim TZ §6,
 * «chegirma chegaralari (`ApprovalRule.threshold`)»).
 *
 * SAVOL: «qaysi chegirma/zarar menejer ko'rigiga tushsin».
 *
 * 🔴 CHEGARA BLOKLAMAYDI (TZ §5.1). Chegaradan oshgan chek TO'XTAMAYDI —
 * u menejer NAVBATIGA tushadi. Shuning uchun bu ekranda `block` rejimi YO'Q
 * va bo'lmaydi ham: taqiq uch qatlamda qulflangan (bazada CHECK, backend
 * tipida `blocks: false` literal, bu yerda esa tanlov ro'yxatida yo'q).
 *
 * ⚠️ Chegaralar `manager_rule_configs` da — MK06 navbati va MK10 SLA bilan
 * AYNI jadval. Ikkinchi sozlama manbai ATAYLAB yaratilmagan
 * ([[sla-thresholds-in-rule-config-table]]).
 *
 * ⏳ QAMROVDAN TASHQARI (ochiq qarz): narx TURLARI va GURUH narxlari — ular
 * `ContractPrice` narx dvigatelini (asosiy reja F004) talab qiladi va u hali
 * qurilmagan. Bu ekran chegirma chegaralarini boshqaradi, narx jadvalini
 * emas.
 */

import { api } from '@/lib/api-client';
import { Badge, Button, Checkbox, Input, NativeSelect, Skeleton, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { majorToMinor, minorToMajor } from './expense-budget-screen';

interface PolicyRule {
  ruleType: string;
  category: string;
  enabled: boolean;
  threshold: number | null;
  thresholdUnit: string | null;
  mode: string;
  severity: string;
  thresholdRejected: boolean;
  /** 🔴 Backend doim `false` qaytaradi — ekran shuni ko'rsatadi. */
  blocks: boolean;
}

/** Narx/chegirma siyosati toifasi — MK06 registridagi `RULE_CATEGORY`. */
const POLICY_CATEGORY = 'loss_discount';

export function PricePolicyScreen() {
  const t = useTranslations('pages.menejer');
  const tRule = useTranslations('pages.managerQueue');
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ rules: PolicyRule[] }>({
    queryKey: ['manager-queue-rules'],
    queryFn: () => api.get('/manager/queue/rules'),
  });

  const save = useMutation({
    mutationFn: (v: { ruleType: string; body: Record<string, unknown> }) =>
      api.put(`/manager/queue/rules/${v.ruleType}`, v.body),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['manager-queue-rules'] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('pp_save_failed')),
  });

  const rules = (data?.rules ?? []).filter((r) => r.category === POLICY_CATEGORY);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">{t('pp_title')}</h1>
        <p className="text-[var(--ms-text-muted)] text-sm">{t('pp_subtitle')}</p>
      </header>

      {/* Falsafa ekranda OCHIQ turadi: menejer «bu taqiq» deb o'ylamasin. */}
      <p
        className="rounded-md border border-[var(--ms-border)] p-2 text-[var(--ms-text-muted)] text-sm"
        data-test-id="pp-no-block"
      >
        {t('pp_no_block')}
      </p>

      {isLoading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {error && (
            <p className="text-[var(--ms-text-danger,#c00)] text-sm" data-test-id="pp-error">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ms-text-muted)]">
                  <th className="py-1 pr-3 font-normal">{t('pp_col_rule')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('pp_col_threshold')}</th>
                  <th className="py-1 pr-3 font-normal">{t('pp_col_severity')}</th>
                  <th className="py-1 pr-3 font-normal">{t('pp_col_mode')}</th>
                  <th className="py-1 font-normal">{t('pp_col_state')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-3 text-[var(--ms-text-muted)]"
                      data-test-id="pp-empty"
                    >
                      {t('pp_empty')}
                    </td>
                  </tr>
                )}
                {rules.map((rule) => {
                  const isPercent = rule.thresholdUnit === 'percent';
                  const shown =
                    draft[rule.ruleType] ?? thresholdToInput(rule.threshold, rule.thresholdUnit);
                  return (
                    <tr
                      key={rule.ruleType}
                      className="border-[var(--ms-border)] border-t"
                      data-test-id={`pp-row-${rule.ruleType}`}
                    >
                      <td className="py-1 pr-3">
                        {tRule(`rule_${rule.ruleType}` as 'rule_BIG_DISCOUNT')}
                        {/* Sozlama JIM tushib qolmasin: birligi mos kelmagan
                            qiymat qo'llanmagani ochiq aytiladi. */}
                        {rule.thresholdRejected && (
                          <span className="ml-2 text-[var(--ms-text-danger,#c00)] text-xs">
                            {t('pp_threshold_rejected')}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        <span className="flex items-center justify-end gap-1">
                          <Input
                            value={shown}
                            inputMode="decimal"
                            data-test-id={`pp-threshold-${rule.ruleType}`}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, [rule.ruleType]: e.target.value }))
                            }
                            className="w-28 text-right"
                          />
                          <span className="text-[var(--ms-text-muted)] text-xs">
                            {isPercent ? '%' : t('pp_unit_money')}
                          </span>
                          <Button
                            size="sm"
                            disabled={save.isPending}
                            data-test-id={`pp-save-${rule.ruleType}`}
                            onClick={() => {
                              const parsed = inputToThreshold(shown, rule.thresholdUnit);
                              if (parsed === null) {
                                setError(t('pp_invalid_threshold'));
                                return;
                              }
                              save.mutate({
                                ruleType: rule.ruleType,
                                body: { thresholdValue: parsed },
                              });
                            }}
                          >
                            {t('pp_save')}
                          </Button>
                        </span>
                        {/* Amaldagi qiymat pul birligida bo'lsa uni odam
                            o'qiydigan ko'rinishda ham ko'rsatamiz. */}
                        {!isPercent && rule.threshold != null && (
                          <div className="text-[var(--ms-text-muted)] text-xs">
                            {formatMoney(String(Math.trunc(rule.threshold)))}
                          </div>
                        )}
                      </td>
                      <td className="py-1 pr-3">
                        <NativeSelect
                          value={rule.severity}
                          data-test-id={`pp-severity-${rule.ruleType}`}
                          onChange={(e) =>
                            save.mutate({
                              ruleType: rule.ruleType,
                              body: { severity: e.target.value },
                            })
                          }
                        >
                          {['info', 'warning', 'critical'].map((s) => (
                            <option key={s} value={s}>
                              {tRule(`severity_${s}` as 'severity_info')}
                            </option>
                          ))}
                        </NativeSelect>
                      </td>
                      <td className="py-1 pr-3">
                        <NativeSelect
                          value={rule.mode}
                          data-test-id={`pp-mode-${rule.ruleType}`}
                          onChange={(e) =>
                            save.mutate({ ruleType: rule.ruleType, body: { mode: e.target.value } })
                          }
                        >
                          {/* `block` YO'Q — §5.1 falsafasi. */}
                          <option value="notify">{t('pp_mode_notify')}</option>
                          <option value="observe">{t('pp_mode_observe')}</option>
                        </NativeSelect>
                      </td>
                      <td className="py-1">
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={rule.enabled}
                            data-test-id={`pp-enabled-${rule.ruleType}`}
                            onCheckedChange={(v) =>
                              save.mutate({
                                ruleType: rule.ruleType,
                                body: { enabled: Boolean(v) },
                              })
                            }
                          />
                          <Badge tone={rule.enabled ? 'success' : 'neutral'}>
                            {rule.enabled ? t('pp_enabled') : t('pp_disabled')}
                          </Badge>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Chegarani tahrir maydoniga chiqarish. Pul birligida (`minor`) qiymat
 * TIYINDA saqlanadi — menejerga so'mda ko'rsatiladi, aks holda «1000» deb
 * yozilgan chegara aslida 10 so'm bo'lib chiqardi (100× klass).
 */
export function thresholdToInput(threshold: number | null, unit: string | null): string {
  if (threshold === null) return '';
  if (unit === 'minor') return minorToMajor(String(Math.trunc(threshold)));
  return String(threshold);
}

/** Teskarisi. Yaroqsiz kiritmada `null` — chaqiruvchi xato ko'rsatadi. */
export function inputToThreshold(raw: string, unit: string | null): number | null {
  const clean = raw.replace(/\s/g, '').replace(',', '.');
  if (clean === '') return null;
  if (unit === 'minor') {
    const minor = majorToMinor(clean);
    return minor === null ? null : Number(minor);
  }
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}
