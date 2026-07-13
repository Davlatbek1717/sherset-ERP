'use client';

/**
 * §3.3 — YANGI QARZ BERISH (kassir).
 *
 * TZ ning qat'iy talabi: izoh VA keyingi qo'ng'iroq/to'lov sanasi «ixtiyoriy
 * emas — majburiy maydon sifatida so'raladi, toki call-markaz keyinchalik
 * qachon bog'lanishni bilsin». Shuning uchun Saqlash tugmasi ikkalasi
 * to'ldirilmaguncha O'CHIQ turadi (server ham 400 bilan rad etadi — ikki qavat).
 *
 * Saqlangach, kiritilgan izoh muloqot tarixiga «Kassir» yozuvi bo'lib tushadi
 * va qarz belgilangan sanada «Bugungi qo'ng'iroqlar» ro'yxatiga chiqadi.
 */

import { useBackspaceBack } from '@/hooks/use-keyboard-nav';
import { api } from '@/lib/api-client';
import { debtApi, todayAt9InputValue } from '@/lib/debt-api';
import {
  Button,
  Combobox,
  type ComboboxItem,
  Container,
  Input,
  MoneyInput,
  PageHeader,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface CounterpartyLite {
  id: string;
  name: string;
  phone: string | null;
}

export default function NewDebtPage() {
  const t = useTranslations('pages.debts');
  // Backspace → orqaga («Ro'yxatga qaytish» bosmasdan; matn maydonlarida ishlamaydi).
  useBackspaceBack();
  const router = useRouter();

  const [counterpartyId, setCounterpartyId] = useState<string | undefined>();
  const [totalMinor, setTotalMinor] = useState('0');
  const [comment, setComment] = useState('');
  const [nextContactAt, setNextContactAt] = useState(todayAt9InputValue());
  const [error, setError] = useState<string | null>(null);

  // Kontragent tanlagichi ikki rejimda ishlaydi:
  //   1. Boshlang'ich ro'yxat — limit=250 (API maksimumi! 500 so'ralsa Zod 400
  //      qaytaradi va ro'yxat BO'M-BO'SH qoladi — prod'da tutilgan real bug),
  //      createdAt desc default tartibi yangi qo'shilgan mijozni tepaga chiqaradi.
  //   2. Yozib qidirilganda — SERVER qidiruvi (name/phone/STIR bo'yicha), shunda
  //      bazadagi minglab kontragentning istalgani topiladi, 250-lik oyna cheklamaydi.
  const counterparties = useQuery({
    queryKey: ['counterparties', 'lite'],
    queryFn: () => api.get<{ items: CounterpartyLite[] }>('/counterparties?limit=250'),
  });

  const toItem = (c: CounterpartyLite): ComboboxItem<string> => ({
    value: c.id,
    label: c.phone ? `${c.name} · ${c.phone}` : c.name,
  });

  const items: ComboboxItem<string>[] = (counterparties.data?.items ?? []).map(toItem);

  const searchCounterparties = async (query: string): Promise<ComboboxItem<string>[]> => {
    const q = query.trim();
    if (!q) return items;
    const res = await api.get<{ items: CounterpartyLite[] }>(
      `/counterparties?limit=50&search=${encodeURIComponent(q)}`,
    );
    return res.items.map(toItem);
  };

  const create = useMutation({
    mutationFn: () =>
      debtApi.create({
        counterpartyId: counterpartyId as string,
        totalMinor,
        comment: comment.trim(),
        nextContactAt: new Date(nextContactAt).toISOString(),
      }),
    onSuccess: (debt) => router.push(`/debts/${debt.id}`),
    onError: (e: Error) => setError(e.message),
  });

  // §3.3 — barcha to'rt maydon majburiy.
  const valid =
    Boolean(counterpartyId) &&
    totalMinor !== '0' &&
    totalMinor !== '' &&
    comment.trim().length > 0 &&
    nextContactAt !== '';

  return (
    <Container>
      <PageHeader
        title={t('new_debt_title')}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/debts">{t('cancel')}</Link>
          </Button>
        }
      />

      <div className="max-w-[560px] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 font-medium text-sm">{t('field_counterparty')}</div>
            <Combobox
              value={counterpartyId}
              onChange={(v) => setCounterpartyId(v ?? undefined)}
              items={items}
              onSearch={searchCounterparties}
              placeholder={t('field_counterparty')}
              data-test-id="debt-counterparty"
            />
          </div>

          <div>
            <div className="mb-1 font-medium text-sm">{t('field_amount')}</div>
            <MoneyInput
              valueMinor={totalMinor}
              onChangeMinor={setTotalMinor}
              data-test-id="debt-amount"
            />
          </div>

          {/* §3.3 — MAJBURIY maydonlar; nima uchunligi ochiq yozilgan */}
          <div className="rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] p-2 text-[var(--ms-text-secondary)] text-xs">
            {t('required_hint')}
          </div>

          <div>
            <div className="mb-1 font-medium text-sm">{t('field_comment')}</div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('field_comment_hint')}
              rows={3}
              data-test-id="debt-comment"
            />
          </div>

          <div>
            <div className="mb-1 font-medium text-sm">{t('field_next_contact')}</div>
            <Input
              type="datetime-local"
              value={nextContactAt}
              onChange={(e) => setNextContactAt(e.target.value)}
              data-test-id="debt-next-contact"
            />
          </div>

          {error && (
            <div className="text-[var(--ms-text-destructive)] text-sm" data-test-id="debt-error">
              {error}
            </div>
          )}

          <Button
            variant="success"
            loading={create.isPending}
            disabled={!valid}
            onClick={() => create.mutate()}
            data-test-id="debt-create"
          >
            {t('create')}
          </Button>
        </div>
      </div>
    </Container>
  );
}
