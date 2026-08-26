'use client';

import { buildEntryFromRegistry, entryMatchesQuantity, parsePieceEntry } from '@/lib/piece-entry';
import { Button, Input } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/**
 * K5 — bo'lak TARKIBINI kiritish maydoni (sanash · priyomka · vozvrat).
 *
 * Uchala oqim BITTA maydonni ishlatadi. Sabab K3 dagi `piece-composition.ts`
 * bilan bir xil: uch ekranda uch xil kiritish bo'lsa omborchi har safar
 * boshqa qoidani eslashi kerak bo'lardi va matn formati jimgina ajralib
 * ketardi — server esa bitta parser bilan o'qiydi.
 *
 * 🔴 **Maydon HECH NARSA yozmaydi.** U faqat matnni oladi, yig'indini
 * ko'rsatadi va `onChange` bilan chaqiruvchiga qaytaradi. Reyestrga nima
 * yozilishini SERVER hal qiladi (hujjat post bo'lganda) — ya'ni ekran
 * yopilib qolsa ham reyestr buzilmaydi.
 *
 * Ikki qulaylik ATAYLAB qo'yilgan (busiz sanash amalda bajarilmas ish bo'lardi):
 *   · **«Reyestrdan olish»** — hozirgi holatni maydonga qo'yadi, omborchi
 *     faqat FARQNI tuzatadi (nolдан yozish 4428 tovar uchun real emas);
 *   · **jami avtomat** — Σ hisoblanadi va sanoq maydoniga
 *     tushadi (`onChange` ning ikkinchi argumenti), chunki server Σ === miqdor
 *     bo'lishini TALAB qiladi va uni qo'lda qo'shish arifmetik xatoga
 *     to'g'ridan-to'g'ri taklif bo'lardi.
 */

export interface PieceEntryFieldProps {
  value: string;
  /**
   * Matn o'zgarganda chaqiriladi. Ikkinchi argument — Σ uzunlik, LEKIN faqat
   * matn to'liq to'g'ri bo'lganda; aks holda `null`.
   *
   * Nega bitta callback (ikkitasi emas): chaqiruvchi ikkala qiymatni BIR
   * yangilanishda yozadi. Ikki alohida callback bo'lsa ikkinchisi birinchisi
   * qo'ygan holatni hali ko'rmasdi (React batching) va yig'indi eski matnga
   * yozilib qolardi.
   */
  onChange: (next: string, total: string | null) => void;
  /** Qator miqdori (sanoq/priyomka/vozvrat) — Σ shunga solishtiriladi. */
  quantity: string;
  /** Reyestrdagi joriy FAOL bo'laklar («Reyestrdan olish» tugmasi uchun). */
  registry?: ReadonlyArray<{ length: string; whole: boolean; label: string | null }>;
  /** Priyomka: bo'lak kiritish TAQIQLANGAN (K-Q3 — kelgan tovar butun o'ram). */
  wholeOnly?: boolean;
  disabled?: boolean;
  id?: string;
}

export function PieceEntryField({
  value,
  onChange,
  quantity,
  registry,
  wholeOnly = false,
  disabled = false,
  id,
}: PieceEntryFieldProps) {
  const t = useTranslations('pages.piece_entry');

  const parsed = useMemo(() => parsePieceEntry(value), [value]);
  const hasPieces = parsed.groups.some((g) => g.kind === 'piece');
  const matches = value.trim() === '' || entryMatchesQuantity(parsed.total, quantity);

  const problem = !value.trim()
    ? null
    : parsed.badGroup !== null
      ? t('bad_group', { n: parsed.badGroup })
      : wholeOnly && hasPieces
        ? t('whole_only')
        : !matches
          ? t('mismatch', { total: parsed.total, quantity })
          : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          className="h-11 font-mono"
          value={value}
          disabled={disabled}
          placeholder={wholeOnly ? t('placeholder_whole') : t('placeholder')}
          aria-label={t('label')}
          aria-invalid={problem !== null}
          onChange={(e) => {
            const next = e.target.value;
            const p = parsePieceEntry(next);
            // Yig'indi FAQAT matn to'g'ri bo'lganda uzatiladi: yarim yozilgan
            // qatordan chiqqan son sanoq maydoniga tushib, omborchi uni
            // sezmay saqlab yuborardi.
            onChange(next, next.trim() && p.badGroup === null ? p.total : null);
          }}
        />
        {registry && registry.length > 0 && !disabled ? (
          <Button
            type="button"
            variant="secondary"
            className="h-11 shrink-0"
            onClick={() => {
              const next = buildEntryFromRegistry(registry);
              const p = parsePieceEntry(next);
              onChange(next, p.badGroup === null ? p.total : null);
            }}
          >
            {t('from_registry')}
          </Button>
        ) : null}
      </div>

      {value.trim() ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={problem ? 'text-destructive' : 'text-muted-foreground'}>
            {t('total', { total: parsed.total, count: parsed.pieceCount })}
          </span>
          {problem ? <span className="text-destructive">{problem}</span> : null}
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">{t('hint')}</span>
      )}
    </div>
  );
}
