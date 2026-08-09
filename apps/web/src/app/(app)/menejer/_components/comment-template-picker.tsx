'use client';

/**
 * MK20 / 4M TZ §8.1/6 — SHABLON IZOH TANLAGICHI.
 *
 * 🔴 EKRAN SHARTNOMASI: shablon — **taklif**, buyruq emas. Tanlangach matn
 * chaqiruvchining izoh maydoniga tushadi va o'sha yerda tahrirlanadi. Bu
 * komponent hech qanday amalni bloklamaydi va izohni majburiy qilmaydi.
 *
 * Shablon YO'Q bo'lsa — tanlagich umuman chizilmaydi: bo'sh «shablon tanlang»
 * ro'yxati menejerni «nimadir yo'qolgan» degan gumon bilan qoldirardi.
 */

import { type CommentTemplate, commentTemplateApi } from '@/lib/comment-template-api';
import { NativeSelect } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

export interface CommentTemplatePick {
  /** Statistika uchun. Jurnalga TUSHMAYDI — u yerda faqat matn. */
  templateId: string | null;
  /** Izoh maydoniga qo'yiladigan matn. */
  text: string | null;
}

interface Props {
  /** FSM amali — taklif shu bo'yicha filtrlanadi. */
  action: string;
  /** Navbat elementining qoidasi (bo'lsa). */
  ruleType?: string | null;
  onPick: (pick: CommentTemplatePick) => void;
  'data-test-id'?: string;
}

export function CommentTemplatePicker({ action, ruleType, onPick, ...rest }: Props) {
  const t = useTranslations('pages.commentTemplates');
  const locale = useLocale();
  const [selected, setSelected] = useState('');

  const { data } = useQuery({
    queryKey: ['comment-template-suggest', action, ruleType ?? '', locale],
    queryFn: () => commentTemplateApi.suggest({ action, ruleType: ruleType ?? undefined, locale }),
  });

  const templates: CommentTemplate[] = data?.templates ?? [];
  if (templates.length === 0) return null;

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[var(--ms-text-muted)] text-xs">{t('picker_label')}</span>
      <NativeSelect
        value={selected}
        className="w-56"
        aria-label={t('picker_label')}
        data-test-id={rest['data-test-id'] ?? 'comment-template-picker'}
        onChange={(e) => {
          const id = e.target.value;
          setSelected(id);
          const found = templates.find((x) => x.id === id);
          // Tanlov bekor qilinsa havola ham, matn ham tozalanadi: aks holda
          // menejer matnni o'chirib yuborsa-yu `templateId` qolsa, hisoblagich
          // ishlatilmagan shablonni «ishlatilgan» deb sanardi.
          onPick(
            found ? { templateId: found.id, text: found.body } : { templateId: null, text: null },
          );
        }}
      >
        <option value="">{t('picker_placeholder')}</option>
        {templates.map((x) => (
          <option key={x.id} value={x.id}>
            {x.title}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
