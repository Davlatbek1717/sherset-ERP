'use client';

/**
 * «Bo'lak hisobi» kartasi — K-reja K6/1 (bayroq tovar kartochkasida).
 *
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K6 fazasi.
 * `ProductCutCard` naqshi: FAQAT tahrir formasida (`productId` bo'lganda)
 * ko'rinadigan, o'z API chaqiruvlarini qiladigan mustaqil karta.
 *
 * 🔴 **Bayroq forma bilan SAQLANMAYDI.** U `POST /stock-pieces/flag` orqali
 * DARHOL yoziladi va `piecetracking.update` ruxsatini talab qiladi (K-Q9:
 * katta omborchi + egasi/menejer). Formaning `product.update` yo'liga
 * qo'shilsa, tovar kartochkasini tahrirlay oladigan HAR KIM kassa
 * taqsimotini (K3 ning 7.1 istisnosi — bo'linadigan tovarda avto-taqsimot
 * o'chadi) jimgina o'zgartira olardi.
 *
 * Ruxsati yo'q foydalanuvchi holatni KO'RADI, lekin o'zgartira olmaydi —
 * «yashirish» emas, «o'chirish»: bayroq nima uchun yoqilganini tushunish
 * kassirga ham, menejerga ham kerak.
 */

import { ProductFormCard } from '@/components/product-form-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { Button, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface ProductFlagResponse {
  id: string;
  name: string;
  uom: string | null;
  pieceTracked: boolean;
  pieceTrackedDecidedAt: string | null;
}

interface FlagMutationResponse {
  id: string;
  pieceTracked: boolean;
  decidedAt: string | null;
}

export function PieceTrackingCard({ productId }: { productId: string }) {
  const t = useTranslations('pages.piece_flag');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canDecide = can('piecetracking', 'update');

  const product = useQuery<ProductFlagResponse>({
    queryKey: ['product', productId, 'piece-flag'],
    queryFn: () => api.get<ProductFlagResponse>(`/products/${productId}`),
  });

  const flagMut = useMutation({
    mutationFn: (pieceTracked: boolean) =>
      api.post<FlagMutationResponse>('/stock-pieces/flag', {
        assortmentId: productId,
        pieceTracked,
      }),
    onSuccess: (res) => {
      toast.success(res.pieceTracked ? t('turned_on') : t('turned_off'));
      qc.invalidateQueries({ queryKey: ['product', productId] });
      qc.invalidateQueries({ queryKey: ['piece-pending-decisions'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const row = product.data;
  const tracked = row?.pieceTracked ?? false;
  // Qaror YO'Q — tovar «Hal qilinmagan» ro'yxatida turibdi (K6/3).
  const undecided = !!row && !row.pieceTrackedDecidedAt;

  return (
    <ProductFormCard title={t('section_title')} testId="card-piece-tracking">
      <div className="space-y-3 text-sm" data-test-id="piece-flag-body">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={
              tracked
                ? 'font-semibold text-emerald-700'
                : 'font-semibold text-[var(--ms-text-muted)]'
            }
            data-test-id="piece-flag-state"
          >
            {tracked ? t('state_on') : t('state_off')}
          </span>
          {canDecide && (
            <Button
              variant="secondary"
              disabled={flagMut.isPending || !row}
              onClick={() => flagMut.mutate(!tracked)}
              data-test-id="piece-flag-toggle"
            >
              {tracked ? t('turn_off') : t('turn_on')}
            </Button>
          )}
        </div>

        <p className="text-[var(--ms-text-muted)]">{t('hint')}</p>

        {undecided && (
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900"
            data-test-id="piece-flag-undecided"
          >
            {t('undecided_hint')}{' '}
            <Link href="/omborchi/hal-qilinmagan" className="underline">
              {t('undecided_link')}
            </Link>
          </div>
        )}

        {!canDecide && (
          <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="piece-flag-readonly">
            {t('readonly_hint')}
          </p>
        )}

        {tracked && (
          <Link
            href="/omborchi/bolaklar"
            className="inline-block text-[var(--ms-accent)] underline"
            data-test-id="piece-flag-registry-link"
          >
            {t('registry_link')}
          </Link>
        )}
      </div>
    </ProductFormCard>
  );
}
