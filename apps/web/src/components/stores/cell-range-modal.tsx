'use client';

/**
 * «Diapazon bo'yicha yaratish» — shablon + har o'zgaruvchi uchun diapazon.
 *
 * Nomlarni FE hosil QILMAYDI: oldindan ko'rish ham, yaratish ham bitta
 * `POST :id/cells/bulk` endpointiga boradi (`dryRun` farqi bilan), shuning
 * uchun ko'rsatilgan son haqiqiy natijadan ajralib qola olmaydi.
 *
 * Xato matnlari ham SERVERDAN keladi (`e.message`) — ular allaqachon o'zbekcha
 * va qaysi o'zgaruvchi aybdorligini aytadi («qator»: boshlanish (5) tugashdan
 * (1) katta). Oyna ularni o'zi yozsa, ikkita haqiqat manbai paydo bo'lardi.
 */

import type { SegmentRange } from '@/components/stores/cell-name-range';
import { api } from '@/lib/api-client';
import { Button, Input, Modal, NativeSelect, useToast } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface RangeVar {
  key: string;
  kind: 'number' | 'letter';
  from: string;
  to: string;
  pad: string;
}

/** Task 3 javob shakli — dryRun ham, haqiqiy yaratish ham AYNAN shu shaklni beradi. */
interface BulkResult {
  total: number;
  toCreate: number;
  /** So'ralgan DIAPAZON ichidagi mavjud nomlar soni (ombordagi jami emas). */
  existing: number;
  zonesToCreate: string[];
  sample: string[];
  created: number;
  zonesCreated: number;
}

const PLACEHOLDER = /\{([^{}]+)\}/g;

/** Nomning 1-segmenti — ombor kodidan to'ldiriladi, diapazon emas. */
const OMBOR_KEY = 'ombor';
/** Nomning 2-segmenti — u ayni paytda ZONA nomi ham bo'ladi. */
const POLKA_KEY = 'polka';

/** Server kutgan variable shakli (Task 3 kontrakti). */
type RangeVariablePayload =
  | { key: string; kind: 'number'; from: number; to: number; pad?: number }
  | { key: string; kind: 'letter'; from: string; to: string };

/**
 * Ombor kodidan nomning BIRINCHI segmenti — bittalab yacheyka muharriri
 * (`NewCellRow`, address-storage-section.tsx) bilan bir xil qoida: kod 1–2
 * xonali raqam bo'lsa o'sha (nol bilan to'ldirilgan), aks holda «01».
 */
function omborSegment(storeCode?: string): string {
  const raw = storeCode?.trim() ?? '';
  return /^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : '01';
}

export function CellRangeModal({
  open,
  storeId,
  storeCode,
  onClose,
  onCreated,
}: {
  open: boolean;
  storeId: string;
  /** Ombor «Kod»i — nomning 1-segmenti shundan oldindan to'ldiriladi. */
  storeCode?: string;
  onClose(): void;
  /**
   * Yaratilgandan keyin. `ranges` — aynan shu amalda ishlatilgan diapazon
   * (ombor segmenti cheklanmagan deb beriladi, chunki oyna baribir bitta
   * ombor ichida). Ota-komponent shu bilan etiketka chop etish oynasini
   * to'g'ridan-to'g'ri ochadi — foydalanuvchi 400 katakchani qayta
   * belgilamasin.
   */
  onCreated(ranges: Array<SegmentRange | null>): void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const tc = useTranslations('common');
  const { toast } = useToast();

  // Egasi (2026-07-30) aniqlagan tuzilish: OMBOR-POLKA-QATOR-YACHEYKA.
  // Bittalab yacheyka muharriri ham aynan shu 4 segmentni ishlatadi (har biri
  // 2 xonali raqam, nol bilan to'ldirilgan) — ikkalasi bir xil nom beradi.
  const [template, setTemplate] = useState('{ombor}-{polka}-{qator}-{yacheyka}');
  const ombor = omborSegment(storeCode);
  const [vars, setVars] = useState<Record<string, RangeVar>>({});
  const [zoneFrom, setZoneFrom] = useState<string>('');
  const [preview, setPreview] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Shablondagi {nom} lar — tartibi bilan, takrorsiz. */
  const keys = useMemo(() => {
    const out: string[] = [];
    for (const m of template.matchAll(PLACEHOLDER)) {
      const k = m[1];
      if (k !== undefined && !out.includes(k)) out.push(k);
    }
    return out;
  }, [template]);

  // Yangi {nom} paydo bo'lsa — default diapazon; yo'qolgani o'chadi.
  useEffect(() => {
    setVars((prev) => {
      const next: Record<string, RangeVar> = {};
      for (const k of keys) {
        if (prev[k]) {
          next[k] = prev[k];
          continue;
        }
        // «ombor» — diapazon EMAS, bitta qiymat: oyna aynan SHU ombor ichida
        // ochiladi, boshqa omborga yacheyka yaratib bo'lmaydi. Shuning uchun
        // from == to va ombor kodidan oldindan to'ldiriladi (foydalanuvchi
        // xohlasa o'zgartira oladi — kod raqam bo'lmasa «01» tushadi).
        next[k] =
          k === OMBOR_KEY
            ? { key: k, kind: 'number', from: ombor, to: ombor, pad: '2' }
            : { key: k, kind: 'number', from: '1', to: '5', pad: '2' };
      }
      return next;
    });
    // Zona = POLKA: egasining tuzilishida polka aynan zona rolini o'ynaydi.
    // Shablonda {polka} bo'lsa uni avtomat tanlaymiz; bo'lmasa — zonasiz.
    setZoneFrom((z) => (keys.includes(z) ? z : keys.includes(POLKA_KEY) ? POLKA_KEY : ''));
  }, [keys, ombor]);

  const payload = useMemo(() => {
    const variables: RangeVariablePayload[] = keys.map((k) => {
      const v = vars[k];
      if (!v) return { key: k, kind: 'number', from: 1, to: 1 };
      return v.kind === 'number'
        ? { key: k, kind: 'number', from: Number(v.from), to: Number(v.to), pad: Number(v.pad) }
        : { key: k, kind: 'letter', from: v.from, to: v.to };
    });
    return { template, variables, zoneFrom: zoneFrom || null };
  }, [template, keys, vars, zoneFrom]);

  /**
   * Yarim yozilgan diapazon so'rov YUBORMAYDI. Bo'sh maydon `Number('') === 0`
   * bo'lib ketardi va oldindan ko'rish foydalanuvchi hech qachon so'ramagan
   * «0 dan» diapazonini ko'rsatardi (harf uchun esa serverdan xato olardi).
   */
  const ready =
    keys.length > 0 &&
    keys.every((k) => {
      const v = vars[k];
      return !!v && v.from.trim() !== '' && v.to.trim() !== '';
    });

  // Oldindan ko'rish — 400ms debounce (har harfda so'rov ketmasin).
  useEffect(() => {
    if (!open || !ready) {
      setPreview(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      api
        .post<BulkResult>(`/admin/stores/${storeId}/cells/bulk`, { ...payload, dryRun: true })
        .then((r) => {
          if (!alive) return;
          setPreview(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (!alive) return;
          setPreview(null);
          setError(e.message);
        });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [open, storeId, payload, ready]);

  const createMut = useMutation({
    mutationFn: () =>
      api.post<BulkResult>(`/admin/stores/${storeId}/cells/bulk`, { ...payload, dryRun: false }),
    onSuccess: (r) => {
      // HAQIQIY `created` ko'rsatiladi, `toCreate` emas: parallel sessiya oralab
      // o'sha nomlarni yaratib ulgursa, server kamroq yozadi va oyna yolg'on
      // son aytmasligi kerak.
      toast.success(t('range_done', { created: r.created, skipped: r.existing }));
      // Nom `ombor-polka-qator-yacheyka`: chop etish filtri uchun oxirgi uch
      // segment kifoya, ombor cheklanmagan (oyna shu ombor ichida).
      const seg = (key: string): SegmentRange | null => {
        const v = vars[key];
        if (!v || v.kind !== 'number') return null;
        const f = Number.parseInt(v.from, 10);
        const t2 = Number.parseInt(v.to, 10);
        if (!Number.isFinite(f) || !Number.isFinite(t2)) return null;
        return f <= t2 ? { from: f, to: t2 } : { from: t2, to: f };
      };
      onCreated([null, seg('polka'), seg('qator'), seg('yacheyka')]);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const setVar = (k: string, patch: Partial<RangeVar>) =>
    setVars((p) => {
      const cur = p[k];
      if (!cur) return p;
      return { ...p, [k]: { ...cur, ...patch } };
    });

  /** Kind bo'yicha kirishni tozalash — raqam maydoniga harf tushmasin. */
  const cleanBound = (kind: RangeVar['kind'], raw: string) =>
    kind === 'number'
      ? raw.replace(/\D/g, '').slice(0, 6)
      : raw
          .replace(/[^A-Za-z]/g, '')
          .toUpperCase()
          .slice(0, 1);

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={t('range_title')}
      widthClass="w-[560px]"
      testId="cell-range-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-test-id="range-cancel">
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            loading={createMut.isPending}
            disabled={!preview || preview.toCreate === 0}
            data-test-id="range-create"
          >
            {preview && preview.toCreate > 0
              ? t('range_create', { count: preview.toCreate })
              : t('range_nothing')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-4">
        <label className="block font-medium text-[var(--ms-text-secondary)] text-sm">
          {t('range_template')}
          <Input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="mt-1"
            data-test-id="range-template"
          />
          <span className="mt-1 block text-[var(--ms-text-muted)] text-xs">
            {t('range_template_hint')}
          </span>
        </label>

        <div className="space-y-2">
          {keys.map((k) => {
            const v = vars[k];
            if (!v) return null;
            // «ombor» — DIAPAZON EMAS: oyna aynan shu ombor ichida ochiladi,
            // boshqa omborga yacheyka yaratib bo'lmaydi. Shuning uchun bitta
            // maydon ko'rsatiladi va u from/to ni birga o'rnatadi — «dan 01
            // gacha 01» degan chalkash juftlik chiqmasin.
            if (k === OMBOR_KEY) {
              return (
                <div
                  key={k}
                  className="flex flex-wrap items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-2"
                  data-test-id={`range-var-${k}`}
                >
                  <span className="w-24 shrink-0 truncate font-medium text-sm" title={k}>
                    {k}
                  </span>
                  <Input
                    value={v.from}
                    onChange={(e) => {
                      const val = cleanBound('number', e.target.value);
                      setVar(k, { from: val, to: val });
                    }}
                    className="h-7 w-16"
                    aria-label={t('range_ombor')}
                    title={t('range_ombor')}
                    data-test-id="range-ombor"
                  />
                  <span className="text-[var(--ms-text-muted)] text-xs">
                    {t('range_ombor_hint')}
                  </span>
                </div>
              );
            }
            return (
              <div
                key={k}
                className="flex flex-wrap items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-2"
                data-test-id={`range-var-${k}`}
              >
                <span className="w-24 shrink-0 truncate font-medium text-sm" title={k}>
                  {k}
                </span>
                <NativeSelect
                  value={v.kind}
                  onChange={(e) => {
                    const kind = e.target.value as RangeVar['kind'];
                    // Kind almashganda chegaralar yangi turga mos kelmaydi
                    // («12» harf emas) — shuning uchun default'ga qaytadi.
                    setVar(
                      k,
                      kind === 'number'
                        ? { kind, from: '1', to: '5' }
                        : { kind, from: 'A', to: 'E' },
                    );
                  }}
                  className="w-24"
                  selectClassName="h-7 text-[12px]"
                  data-test-id={`range-kind-${k}`}
                >
                  <option value="number">{t('range_kind_number')}</option>
                  <option value="letter">{t('range_kind_letter')}</option>
                </NativeSelect>
                <Input
                  value={v.from}
                  onChange={(e) => setVar(k, { from: cleanBound(v.kind, e.target.value) })}
                  className="h-7 w-16"
                  aria-label={t('range_from')}
                  title={t('range_from')}
                  data-test-id={`range-from-${k}`}
                />
                <span className="text-[var(--ms-text-muted)]">–</span>
                <Input
                  value={v.to}
                  onChange={(e) => setVar(k, { to: cleanBound(v.kind, e.target.value) })}
                  className="h-7 w-16"
                  aria-label={t('range_to')}
                  title={t('range_to')}
                  data-test-id={`range-to-${k}`}
                />
                {v.kind === 'number' && (
                  <>
                    <span className="text-[var(--ms-text-muted)] text-xs">{t('range_pad')}</span>
                    <Input
                      value={v.pad}
                      onChange={(e) =>
                        setVar(k, { pad: e.target.value.replace(/\D/g, '').slice(0, 1) })
                      }
                      className="h-7 w-12"
                      aria-label={t('range_pad')}
                      data-test-id={`range-pad-${k}`}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <label className="block font-medium text-[var(--ms-text-secondary)] text-sm">
          {t('range_zone')}
          <NativeSelect
            value={zoneFrom}
            onChange={(e) => setZoneFrom(e.target.value)}
            className="mt-1"
            data-test-id="range-zone"
          >
            <option value="">{t('range_zone_none')}</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {`{${k}}`}
              </option>
            ))}
          </NativeSelect>
        </label>

        <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-app)] p-2 text-sm">
          <div className="mb-1 font-medium">{t('range_preview')}</div>
          {error ? (
            // Server matni SHUNDOQ ko'rsatiladi — o'zbekcha va o'zgaruvchi nomli.
            <p className="text-[var(--ms-text-destructive)] text-xs" data-test-id="range-error">
              {error}
            </p>
          ) : preview ? (
            <>
              <p data-test-id="range-counts">
                {t('range_total')}: {preview.total} · {preview.toCreate} {t('range_new')} ·{' '}
                {preview.existing} {t('range_existing')}
              </p>
              <p className="mt-1 text-[var(--ms-text-muted)] text-xs" data-test-id="range-sample">
                {preview.sample.join(', ')}
              </p>
              {preview.zonesToCreate.length > 0 && (
                <p className="mt-1 text-[var(--ms-text-muted)] text-xs" data-test-id="range-zones">
                  {t('range_zones_to_create')}: {preview.zonesToCreate.join(', ')}
                </p>
              )}
            </>
          ) : (
            <p className="text-[var(--ms-text-muted)] text-xs">…</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
