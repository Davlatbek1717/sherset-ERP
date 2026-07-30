'use client';

/**
 * «Адресное хранение товаров» — the warehouse-card address-storage manager.
 *
 * moysklad parity, re-grounded LIVE 2026-07-03
 * (docs/audits/stores-1to1-2026-07-03/GROUND.md + ms-card-full.png):
 *   · optional help paragraph + «Как работает адресное хранение» link when the
 *     store has no zones/cells yet (edit mode)
 *   · «Проводить инвентаризацию по ячейкам» checkbox (edit mode; saved with the
 *     card's «Сохранить» via the parent form)
 *   · Зоны table  — Зона(200) · Всего ячеек(100) · Свободно(100) · Занято(100);
 *     «Без зоны хранения» gray bucket row; REAL occupancy from stock-by-cell
 *   · Ячейки table — Ячейка(195) · Относится к зоне(195) · Статус(110) ·
 *     Штрихкод(195); status «Свободна»/«Занята» from per-cell stock
 *   · rows: 30px, display-mode labels; click a row → inline editors (save on
 *     blur/Enter, Escape reverts); hover → yellow + ⊗ delete
 *   · «+ Зона» / «+ Ячейка» blue add buttons under each table → append an
 *     editing draft row
 *   · header underline + table bottom border: 2px rgb(24,105,153); row
 *     separators 1px #d5d5d5 (pixel-sampled from the live capture)
 *
 * Two modes:
 *   · storeId set  → server mode, zones/cells CRUD hits the API immediately
 *     (independent of the card's «Сохранить») — moysklad behaves the same way
 *   · storeId null → CREATE mode: rows buffer locally (drafts), the parent
 *     flushes them to the API right after the store is created
 *
 * Known gap (documented): moysklad also drag-reorders zone/cell rows
 * (drop-position-marker). Deferred — needs a sortOrder PATCH sweep.
 */

import { ProductSelectModal } from '@/components/products/product-select-modal';
import { genEan13 } from '@/components/products/use-product-form';
import { CellContentsModal } from '@/components/stores/cell-contents-modal';
import { CellCountModal } from '@/components/stores/cell-count-modal';
import { CellLabelPrintOverlay } from '@/components/stores/cell-label-print';
import { CellRangeModal } from '@/components/stores/cell-range-modal';
import { CellScanBindModal } from '@/components/stores/cell-scan-bind-modal';
import { api } from '@/lib/api-client';
import { Button, Checkbox, Icons, Input, NativeSelect } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';

interface Zone {
  id: string;
  name: string;
  sortOrder: number;
  cellCount: number;
  occupiedCount: number;
  freeCount: number;
}
interface Cell {
  id: string;
  name: string;
  zoneId: string | null;
  zoneName: string | null;
  barcode: string | null;
  sortOrder: number;
  occupied: boolean;
}
interface AddressStorage {
  zones: Zone[];
  cells: Cell[];
}

/** A cell row for display — server cell or a pending (unsaved) draft cell. */
type CellView = Cell & { pending: boolean };
/** A polka row for display — carries the server zone id (null if pending-only). */
type ZoneView = Zone & { pending: boolean; serverId: string | null };

/** CREATE-mode draft rows (flushed by the parent after the store is created). */
export interface DraftZone {
  key: string;
  name: string;
}
export interface DraftCell {
  key: string;
  name: string;
  /** Chosen polka number. `null`/absent ⇒ derive from the code's 3rd segment;
   *  `''` ⇒ «Без полки» (explicitly no polka). Picked via the row's dropdown. */
  polka?: string | null;
  barcode: string | null;
}
export interface AddressStorageDrafts {
  zones: DraftZone[];
  cells: DraftCell[];
}

let draftSeq = 0;
const nextKey = () => {
  draftSeq += 1;
  return `draft-${draftSeq}`;
};

// moysklad table chrome (pixel-sampled): blue 2px header underline + bottom
// border, 1px #d5d5d5 row separators, 30px rows, 12px text.
const TABLE_BLUE = 'border-[rgb(24,105,153)]';
const HEAD_TH = 'h-[30px] px-2 text-left align-middle font-normal text-[12px] text-[#222222]';
const CELL_TD = 'h-[30px] px-2 align-middle text-[12px] text-[#222222]';
const ROW_SEP = 'border-b border-b-[#d5d5d5]';

/** Blue «+ Зона» / «+ Ячейка» add button under a table. */
function PlusAddButton({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick(): void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex items-center gap-1.5 text-[13px] text-[var(--ms-text-link)] hover:underline"
      data-test-id={testId}
    >
      <Icons.create className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/**
 * «Сгенерировать штрихкод» — auto-fill button beside the Штрихкод editor
 * (user requirement 2026-07-03): click → internal EAN13 (same generator as the
 * product card, «20…» prefix); the field itself stays EMPTY by default.
 */
function BarcodeGenButton({
  onGenerate,
  testId,
}: { onGenerate(code: string): void; testId: string }) {
  const t = useTranslations('pages.stores.address_storage');
  return (
    <button
      type="button"
      title={t('generate_barcode')}
      aria-label={t('generate_barcode')}
      onClick={(e) => {
        e.stopPropagation();
        onGenerate(genEan13());
      }}
      className="flex h-[24px] w-[26px] shrink-0 items-center justify-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-primary)]"
      data-test-id={testId}
    >
      <Icons.barcode className="h-3.5 w-3.5" />
    </button>
  );
}

/** Hover-revealed ⊗ delete button at the right edge of a row. */
function RowDelete({ label, onClick, testId }: { label: string; onClick(): void; testId: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="invisible text-[14px] text-[var(--ms-text-muted)] leading-none hover:text-[var(--ms-text-error)] group-hover:visible"
      data-test-id={testId}
    >
      ✕
    </button>
  );
}

/** Commit-on-blur text editor used by the inline editing rows. */
function InlineText({
  value,
  onCommit,
  placeholder,
  autoFocus,
  widthClass,
  testId,
}: {
  value: string;
  onCommit(v: string): void;
  placeholder?: string;
  autoFocus?: boolean;
  widthClass?: string;
  testId?: string;
}) {
  return (
    <Input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={widthClass}
      data-test-id={testId}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== value) onCommit(v);
      }}
    />
  );
}

/**
 * The cell code's first two segments (Sklad-section): seg1 = the store's «Код»
 * if it's a 1–2 digit number, else «01»; seg2 = «01». So a polka's
 * auto-generated cells read «01-01-{polka}-{NN}» (user 2026-07-05). Kept fixed
 * per store — NOT learned from existing cells (legacy/junk cells could carry a
 * stray prefix and derail the sequence).
 */
export function cellPrefix(storeCode?: string): string {
  const raw = storeCode?.trim() ?? '';
  const s1 = /^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : '01';
  return `${s1}-01`;
}

/** Polka = the cell code's THIRD segment (numeric), else null (polka-less). */
export function polkaSeg3(name: string): string | null {
  const seg = name.split('-')[2]?.trim();
  return seg && /^\d+$/.test(seg) ? seg : null;
}

/**
 * A draft cell's effective polka = ONLY the explicitly chosen `polka` (via the
 * row dropdown). User 2026-07-06: the old «polka = the code's 3rd segment» auto-
 * rule is REMOVED — a new cell has no polka by default («Без полки»), set later.
 */
export function draftPolka(c: DraftCell): string | null {
  return c.polka ? c.polka : null;
}

/**
 * Existing-polka edit row: clicking a polka row opens THREE inputs — polka
 * number · «Код ячейки» (the polka's cell-code prefix, prefilled from its
 * cells) · «Всего ячеек» count. Changing the count SETS the exact number of
 * cells (adds or removes to match); changing the code re-prefixes them. All
 * digit(+dash)-only. Commits on focus-out / Enter; Escape cancels. (user
 * 2026-07-06: the code must show + be editable, and count must be adjustable.)
 */
function PolkaEditRow({
  zone,
  code: initialCode,
  onCommit,
  onCancel,
  onDelete,
}: {
  zone: Zone;
  code: string;
  onCommit(name: string, code: string, count: number): void;
  onCancel(): void;
  onDelete(): void;
}) {
  const [name, setName] = useState(zone.name);
  const [code, setCode] = useState(initialCode);
  const [count, setCount] = useState(String(zone.cellCount));
  const commit = () =>
    onCommit(
      name.trim(),
      code.trim().replace(/-+$/, ''),
      Math.max(0, Math.min(999, Number.parseInt(count, 10) || 0)),
    );
  return (
    <tr
      className={`${ROW_SEP} bg-[rgb(255,251,140)]`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      data-test-id={`zone-row-${zone.id}`}
    >
      <td className={CELL_TD}>
        <Input
          value={name}
          autoFocus
          inputMode="numeric"
          onChange={(e) => setName(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="01"
          className="h-[24px] w-[60px] text-center tabular-nums"
          data-test-id={`zone-name-${zone.id}`}
        />
      </td>
      <td className={CELL_TD}>
        {/* «Код ячейки» — the polka's cell-code prefix (digits + dashes). */}
        <Input
          value={code}
          inputMode="numeric"
          onChange={(e) => setCode(e.target.value.replace(/[^\d-]/g, '').slice(0, 12))}
          placeholder="03-01-02"
          className="h-[24px] w-[110px] text-center tabular-nums"
          data-test-id={`zone-code-${zone.id}`}
        />
      </td>
      <td className={CELL_TD}>
        <Input
          value={count}
          inputMode="numeric"
          onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="0"
          className="h-[24px] w-[70px] text-center tabular-nums"
          data-test-id={`zone-count-${zone.id}`}
        />
      </td>
      <td className={CELL_TD}>{zone.freeCount}</td>
      <td className={CELL_TD}>{zone.occupiedCount}</td>
      <td className={`${CELL_TD} text-center`}>
        <button
          type="button"
          aria-label={`delete ${zone.name}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onDelete();
          }}
          className="text-[14px] text-[var(--ms-text-muted)] leading-none hover:text-[var(--ms-text-error)]"
          data-test-id={`zone-del-${zone.id}`}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

/**
 * NEW-cells row (user 2026-07-06, «the easiest way to create cells»): enter a
 * THREE fields (user 2026-07-06): «Polka» (polka number, may be blank ⇒ «Без
 * полки») · «Yacheyka kodi» (the cell-code prefix, first 3 segments e.g.
 * «03-01-02») · count N. Generates N cells «{code}-01 … {code}-NN» (the 4th
 * segment is the running number: 03-01-02-01, 03-01-02-02, …) into the entered
 * polka. Commits on focus-out / Enter; Escape/✕ cancels.
 */
function NewPolkaRow({
  onCommit,
  onCancel,
}: {
  onCommit(polka: string, code: string, count: number): void;
  onCancel(): void;
}) {
  const [polka, setPolka] = useState('');
  const [code, setCode] = useState('');
  const [count, setCount] = useState('');
  const commit = () => {
    const c = code.trim().replace(/-+$/, '');
    if (!c) {
      onCancel();
      return;
    }
    onCommit(polka.trim(), c, Math.max(0, Math.min(999, Number.parseInt(count, 10) || 0)));
  };
  return (
    <tr
      className={`${ROW_SEP} bg-[rgb(255,251,140)]`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      data-test-id="new-zone-row"
    >
      <td className={CELL_TD}>
        {/* «Polka» — the polka NUMBER (blank ⇒ «Без полки»); digits only. */}
        <Input
          value={polka}
          onChange={(e) => setPolka(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="0"
          autoFocus
          inputMode="numeric"
          className="h-[24px] w-[60px] text-center tabular-nums"
          data-test-id="new-zone-name"
        />
      </td>
      <td className={CELL_TD}>
        {/* «Yacheyka kodi» — first 3 segments; digits + dashes only. */}
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d-]/g, '').slice(0, 12))}
          placeholder="03-01-02"
          inputMode="numeric"
          className="h-[24px] w-[110px] text-center tabular-nums"
          data-test-id="new-zone-code"
        />
      </td>
      <td className={CELL_TD}>
        <Input
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="0"
          inputMode="numeric"
          className="h-[24px] w-[70px] text-center tabular-nums"
          data-test-id="new-zone-count"
        />
      </td>
      <td className={CELL_TD}>0</td>
      <td className={CELL_TD}>0</td>
      <td className={`${CELL_TD} text-center`}>
        <button
          type="button"
          aria-label="cancel"
          onMouseDown={(e) => {
            e.preventDefault();
            onCancel();
          }}
          className="text-[14px] text-[var(--ms-text-muted)] leading-none hover:text-[var(--ms-text-error)]"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

/**
 * NEW-cell editing row. The cell code is entered as FOUR two-digit segments
 * (user structure 2026-07-04: «01-02-03-04» = Склад · Полка · Ярус · Ячейка —
 * two digits each so codes never collide and staff can read the location
 * straight off the code). Segments compose the stored name («1» pads to
 * «01»); the first prefills from the store's «Код». The «Полка» column is NOT
 * picked by hand — it mirrors the THIRD segment live (user 2026-07-05;
 * commitNewCell auto-finds/creates the matching polka row). Commits when focus
 * leaves the row (all four segments required), Escape/✕ cancels.
 */
const CELL_SEGMENTS = ['seg_store', 'seg_shelf', 'seg_level', 'seg_cell'] as const;

function NewCellRow({
  storeCode,
  onCommit,
  onCancel,
}: {
  storeCode?: string;
  onCommit(name: string, barcode: string | null): void;
  onCancel(): void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const [segs, setSegs] = useState<string[]>(() => [
    /^\d{1,2}$/.test(storeCode?.trim() ?? '') ? (storeCode as string).trim().padStart(2, '0') : '',
    '',
    '',
    '',
  ]);
  const segRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [barcode, setBarcode] = useState('');
  const commit = () => {
    if (segs.every((s) => s.trim() !== '')) {
      const name = segs.map((s) => s.trim().padStart(2, '0')).join('-');
      onCommit(name, barcode.trim() || null);
    } else {
      onCancel();
    }
  };
  const setSeg = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 2);
    setSegs((prev) => prev.map((s, j) => (j === i ? v : s)));
    if (v.length === 2 && i < 3) segRefs.current[i + 1]?.focus();
  };
  return (
    <tr
      className={`${ROW_SEP} bg-[rgb(255,251,140)]`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      data-test-id="new-cell-row"
    >
      <td className={CELL_TD}>
        <div className="flex items-center gap-0.5">
          {CELL_SEGMENTS.map((key, i) => (
            <span key={key} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-[#999999]">-</span>}
              <Input
                ref={(el) => {
                  segRefs.current[i] = el;
                }}
                value={segs[i]}
                onChange={(e) => setSeg(i, e.target.value)}
                placeholder={String(i + 1).padStart(2, '0')}
                title={t(key)}
                aria-label={t(key)}
                autoFocus={i === 0}
                inputMode="numeric"
                className="h-[24px] w-[34px] px-1 text-center tabular-nums"
                data-test-id={`new-cell-seg-${i}`}
              />
            </span>
          ))}
        </div>
      </td>
      <td className={CELL_TD}>
        {/* «Полка» — NO polka by default (user 2026-07-06: removed the seg3 auto-
            rule); assigned later via the saved cell's dropdown. */}
        <span className="text-[12px] text-[var(--ms-text-muted)]" data-test-id="new-cell-polka">
          0
        </span>
      </td>
      <td className={CELL_TD}>{t('status_free')}</td>
      <td className={CELL_TD}>
        <div className="flex items-center gap-1">
          <Input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="h-[24px] w-[160px]"
            data-test-id="new-cell-barcode"
          />
          <BarcodeGenButton onGenerate={setBarcode} testId="new-cell-barcode-gen" />
        </div>
      </td>
      <td className={`${CELL_TD} text-center`}>
        <button
          type="button"
          aria-label="cancel"
          onMouseDown={(e) => {
            e.preventDefault();
            onCancel();
          }}
          className="text-[14px] text-[var(--ms-text-muted)] leading-none hover:text-[var(--ms-text-error)]"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

function HelpBlock() {
  const t = useTranslations('pages.stores.address_storage');
  return (
    <p className="max-w-[560px] text-[12px] text-[var(--ms-text-primary)] leading-relaxed">
      {t('help')}{' '}
      <a
        href="https://support.moysklad.ru/hc/ru/articles/4404897834513"
        target="_blank"
        rel="noreferrer"
        className="text-[var(--ms-text-link)] hover:underline"
      >
        {t('help_link')}
      </a>
    </p>
  );
}

/** Shared zone-table shell (header + bucket row) for both modes. */
function ZoneTable({ children, bucket }: { children: ReactNode; bucket: ReactNode }) {
  const t = useTranslations('pages.stores.address_storage');
  return (
    // Mobile: the 615px fixed-col zone grid pans in its own scroll box.
    <div className="max-md:overflow-x-auto">
      <table
        className={`w-full max-w-[660px] table-fixed border-collapse border-b-2 ${TABLE_BLUE}`}
        data-test-id="zones-table"
      >
        <colgroup>
          <col className="w-[140px]" />
          <col className="w-[150px]" />
          <col className="w-[105px]" />
          <col className="w-[90px]" />
          <col className="w-[90px]" />
          <col className="w-[40px]" />
        </colgroup>
        <thead>
          <tr className={`border-b-2 ${TABLE_BLUE}`}>
            <th className={HEAD_TH}>{t('zone')}</th>
            <th className={HEAD_TH}>{t('cell_code')}</th>
            <th className={HEAD_TH}>{t('zone_total')}</th>
            <th className={HEAD_TH}>{t('zone_free')}</th>
            <th className={HEAD_TH}>{t('zone_occupied')}</th>
            <th className={HEAD_TH} aria-hidden />
          </tr>
        </thead>
        <tbody>
          {bucket}
          {children}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Section bar above each table (user 2026-07-05): a ▾ collapse toggle (click to
 * open/close ONLY this section) + a search box scoped to this section alone
 * (polka box searches polkas, cell box searches cells).
 */
function SectionBar({
  open,
  onToggle,
  label,
  query,
  onQuery,
  searchPlaceholder,
  testPrefix,
}: {
  open: boolean;
  onToggle(): void;
  label: string;
  query: string;
  onQuery(v: string): void;
  searchPlaceholder: string;
  testPrefix: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-3 max-md:flex-wrap">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1 font-medium text-[13px] text-[var(--ms-text-primary)]"
        data-test-id={`${testPrefix}-toggle`}
      >
        <Icons.down className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        {label}
      </button>
      <div className="relative w-[220px] max-md:w-full max-md:min-w-0">
        <Icons.search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 text-[var(--ms-text-muted)]" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-[28px] w-full pl-7 text-[12px]"
          data-test-id={`${testPrefix}-search`}
        />
      </div>
    </div>
  );
}

function CellTable({ children }: { children: ReactNode }) {
  const t = useTranslations('pages.stores.address_storage');
  return (
    // The fixed-col cell grid (~890px) pans in its own scroll box on ANY viewport
    // that can't show it in full — so the last «amallar» ustuni (Ko'rish/＋/🖨/✕)
    // hech qachon card chetidan tashqariga chiqmaydi (2026-07-29: ✕ card'dan
    // «chiqib ketgan» edi — amallar ustuni 40px'da 4 tugmani ushlolmasdi).
    <div className="overflow-x-auto">
      <table
        className={`w-full max-w-[891px] table-fixed border-collapse border-b-2 ${TABLE_BLUE}`}
        data-test-id="cells-table"
      >
        <colgroup>
          <col className="w-[205px]" />
          <col className="w-[205px]" />
          <col className="w-[115px]" />
          <col className="w-[195px]" />
          {/* «Amallar» — Ko'rish + ＋ + 🖨 + ✕ (~150px); 40px'dan kengaytirildi. */}
          <col className="w-[171px]" />
        </colgroup>
        <thead>
          <tr className={`border-b-2 ${TABLE_BLUE}`}>
            <th className={HEAD_TH}>{t('cell')}</th>
            <th className={HEAD_TH}>{t('cell_zone')}</th>
            <th className={HEAD_TH}>{t('cell_status')}</th>
            <th className={HEAD_TH}>{t('cell_barcode')}</th>
            <th className={HEAD_TH} aria-hidden />
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function AddressStorageSection({
  storeId,
  storeCode,
  cellInventory,
  onCellInventoryChange,
  drafts,
  onDraftsChange,
}: {
  /** null ⇒ CREATE mode: buffer rows locally via drafts/onDraftsChange. */
  storeId: string | null;
  /** The store's «Код» — prefills the first (Склад) segment of new cell codes. */
  storeCode?: string;
  /** «Проводить инвентаризацию по ячейкам» — rendered only when provided (edit mode). */
  cellInventory?: boolean;
  onCellInventoryChange?(v: boolean): void;
  drafts?: AddressStorageDrafts;
  onDraftsChange?(d: AddressStorageDrafts): void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const tProductSelect = useTranslations('product_select');
  const tFilters = useTranslations('filters');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const queryKey = ['store-address', storeId] as const;
  const [error, setError] = useState<string | null>(null);
  // «Добавить товар в ячейку» — the cell whose + opened the product picker.
  const [assignCell, setAssignCell] = useState<{ id: string; name: string } | null>(null);
  // «Scan» (owner 2026-07-19): the two-step barcode bind modal, opened from the
  // add-product-to-cell picker's header.
  const [scanOpen, setScanOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  // Row currently in inline-edit mode ('zone-<id>' / 'cell-<id>' / 'new-zone' / 'new-cell').
  const [editing, setEditing] = useState<string | null>(null);
  // «Diapazon bo'yicha» — ommaviy yacheyka generatori (faqat server rejimida:
  // yangi ombor hali saqlanmagan, `storeId` yo'q ⇒ endpoint ham yo'q).
  const [rangeOpen, setRangeOpen] = useState(false);
  // «🖨 Этикетка» print-preview target (server mode only — needs per-cell stock).
  const [labelCell, setLabelCell] = useState<{
    id: string;
    name: string;
    barcode: string | null;
  } | null>(null);
  // «Содержимое ячейки» — click the «Занята» status → per-product contents modal.
  const [contentsCell, setContentsCell] = useState<{ id: string; name: string } | null>(null);
  // Per-section search + collapse (user 2026-07-05): each table has its OWN
  // search box (polka-only / cell-only) and its OWN ▾ collapse toggle.
  const [polkaOpen, setPolkaOpen] = useState(true);
  const [cellOpen, setCellOpen] = useState(true);
  const [polkaQuery, setPolkaQuery] = useState('');
  const [cellQuery, setCellQuery] = useState('');

  const serverMode = !!storeId;
  const { data } = useQuery<AddressStorage>({
    queryKey,
    queryFn: () => api.get<AddressStorage>(`/admin/stores/${storeId}/address-storage`),
    enabled: serverMode,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });
  const sharedOpts = {
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  };

  const renameZone = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      api.patch(`/admin/stores/${storeId}/zones/${v.id}`, { name: v.name }),
    ...sharedOpts,
  });
  const deleteZone = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/stores/${storeId}/zones/${id}`),
    ...sharedOpts,
  });
  const patchCell = useMutation({
    mutationFn: (v: {
      id: string;
      name?: string;
      zoneId?: string | null;
      barcode?: string | null;
    }) => {
      const { id, ...body } = v;
      return api.patch(`/admin/stores/${storeId}/cells/${id}`, body);
    },
    ...sharedOpts,
  });
  const deleteCell = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/stores/${storeId}/cells/${id}`),
    ...sharedOpts,
  });

  // «Добавить товар в ячейку» — products currently assigned to the open cell
  // (their home cell / __yacheyka is this cell). Drives the picker's checked-and-
  // disabled rows so they can't be re-added, and is shown as the cell's contents.
  const assignedProductsQuery = useQuery<{ items: Array<{ id: string }> }>({
    queryKey: ['cell-products', storeId, assignCell?.id],
    queryFn: () => api.get(`/admin/stores/${storeId}/cells/${assignCell?.id}/products`),
    enabled: !!storeId && !!assignCell,
  });
  const assignedProductIds = assignedProductsQuery.data?.items.map((p) => p.id) ?? [];
  const assignProducts = useMutation({
    mutationFn: (productIds: string[]) =>
      api.post(`/admin/stores/${storeId}/cells/${assignCell?.id}/products`, { productIds }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['cell-products', storeId, assignCell?.id] });
      // The product card reads its home cell from the same binding — refresh it.
      qc.invalidateQueries({ queryKey: ['product-cell-stock'] });
      qc.invalidateQueries({ queryKey: ['product-storage-options'] });
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const setDrafts = (next: AddressStorageDrafts) => onDraftsChange?.(next);
  const draftState: AddressStorageDrafts = drafts ?? { zones: [], cells: [] };

  // ---- view model: SERVER rows + PENDING drafts, merged --------------------
  // User 2026-07-05: a newly-added cell must NOT reach other users until the
  // card's «Сохранить». So in edit mode new cells/polkas live in `drafts`
  // (local, marked pending) and only flush to the server on save. The tables
  // render the server snapshot + the pending drafts together.
  const serverZones = serverMode ? (data?.zones ?? []) : [];
  const serverCells = serverMode ? (data?.cells ?? []) : [];

  // A persisted draft whose name is ALREADY on the server was saved (here or on
  // another laptop) — drop it so it never shows as a phantom pending duplicate
  // and never fails the save with a unique-name clash.
  const serverCellNames = new Set(serverCells.map((c) => c.name));
  const serverZoneNames = new Set(serverZones.map((z) => z.name));
  const draftCells = draftState.cells.filter((c) => !serverCellNames.has(c.name));
  const draftZones = draftState.zones.filter((z) => !serverZoneNames.has(z.name));

  const cells: CellView[] = [
    ...serverCells.map((c) => ({ ...c, pending: false })),
    ...draftCells.map((c) => ({
      id: c.key,
      name: c.name,
      zoneId: null,
      zoneName: draftPolka(c),
      barcode: c.barcode,
      sortOrder: 0,
      occupied: false,
      pending: true,
    })),
  ];

  // Polka rows = server zones ∪ explicit draft polkas ∪ polkas the pending cells
  // are assigned to; counts add the pending cells for each polka.
  const pendingByPolka = new Map<string, number>();
  for (const c of draftCells) {
    const pk = draftPolka(c);
    if (pk) pendingByPolka.set(pk, (pendingByPolka.get(pk) ?? 0) + 1);
  }
  const polkaNames = new Set<string>([
    ...serverZones.map((z) => z.name),
    ...draftZones.map((z) => z.name),
    ...pendingByPolka.keys(),
  ]);
  const zones: ZoneView[] = [...polkaNames]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((nm) => {
      const sz = serverZones.find((z) => z.name === nm);
      const pend = pendingByPolka.get(nm) ?? 0;
      return {
        id: sz?.id ?? `pk-${nm}`,
        name: nm,
        sortOrder: sz?.sortOrder ?? 0,
        cellCount: (sz?.cellCount ?? 0) + pend,
        freeCount: (sz?.freeCount ?? 0) + pend,
        occupiedCount: sz?.occupiedCount ?? 0,
        serverId: sz?.id ?? null,
        pending: !sz,
      };
    });

  const zonelessTotal = cells.filter((c) => (c.pending ? !c.zoneName : !c.zoneId)).length;
  const zonelessOccupied = cells.filter((c) => !c.pending && !c.zoneId && c.occupied).length;
  const isEmpty = zones.length === 0 && cells.length === 0;

  // Polka numbers offered in each cell's «Полка» dropdown (user 2026-07-05: pick
  // the polka, don't only derive it). A pending cell may join any polka (server
  // OR draft — both exist on save); a saved cell can only move to a SAVED zone.
  const allPolkaOptions = zones.map((z) => z.name);
  const serverPolkaOptions = zones.filter((z) => z.serverId).map((z) => z.name);

  // Each polka's «Код ячейки» prefix (its cells' name minus the last segment),
  // so PolkaEditRow can prefill + edit it (user 2026-07-06). First cell wins.
  const polkaCodeByName = new Map<string, string>();
  for (const c of cells) {
    if (!c.zoneName || polkaCodeByName.has(c.zoneName)) continue;
    const parts = c.name.split('-');
    if (parts.length > 1) polkaCodeByName.set(c.zoneName, parts.slice(0, -1).join('-'));
  }

  // Per-section search filters (case-insensitive substring). Polka box matches
  // ONLY polka numbers; cell box matches ONLY cell code/barcode.
  const pq = polkaQuery.trim().toLowerCase();
  const cq = cellQuery.trim().toLowerCase();
  const zonesShown = pq ? zones.filter((z) => z.name.toLowerCase().includes(pq)) : zones;
  const cellsShown = cq
    ? cells.filter(
        (c) => c.name.toLowerCase().includes(cq) || (c.barcode ?? '').toLowerCase().includes(cq),
      )
    : cells;

  /**
   * Edit an existing polka: RENAME its existing cells IN PLACE to «{code}-01 …
   * {code}-NN» and resize to `count` (user 2026-07-06). It matches cells by
   * POSITION (display order), so changing the code just re-prefixes the SAME
   * cells (no new duplicate rows appear); changing the count adds the missing /
   * removes the excess. Pending cells keep their identity + barcode; saved
   * (server) cells are renamed via PATCH, and a free excess server cell is
   * deleted. New rows are ONLY created here to reach a HIGHER count — editing
   * never spawns a parallel set.
   */
  const setPolkaCells = (oldPolka: string, newPolka: string, code: string, count: number) => {
    const prefix = code.trim().replace(/-+$/, '');
    const targetPolka = newPolka.trim() || null;
    if (!prefix) {
      // No code → at most a polka re-label of this polka's pending cells.
      if (targetPolka !== oldPolka) {
        setDrafts({
          ...draftState,
          cells: draftState.cells.map((c) =>
            draftPolka(c) === oldPolka ? { ...c, polka: targetPolka } : c,
          ),
        });
      }
      return;
    }
    // This polka's current cells in display order (server first, then pending).
    const existing = cells.filter((c) => c.zoneName === oldPolka);
    const draftByKey = new Map(
      draftState.cells.filter((c) => draftPolka(c) === oldPolka).map((c) => [c.key, c]),
    );
    const others = draftState.cells.filter((c) => draftPolka(c) !== oldPolka);
    const nextDrafts: DraftCell[] = [];
    existing.forEach((c, i) => {
      const pos = i + 1;
      const name = `${prefix}-${String(pos).padStart(2, '0')}`;
      if (pos > count) {
        // Excess → drop. Pending: just omit; free server cell: delete on server.
        if (!c.pending && !c.occupied) deleteCell.mutate(c.id);
        return;
      }
      if (c.pending) {
        const d = draftByKey.get(c.id); // pending cell id === its draft key
        nextDrafts.push(
          d
            ? { ...d, name, polka: targetPolka }
            : { key: nextKey(), name, polka: targetPolka, barcode: c.barcode },
        );
      } else if (c.name !== name) {
        // Saved cell → rename in place (its zone follows the polka rename).
        patchCell.mutate({ id: c.id, name });
      }
    });
    // Only ADD when the new count exceeds what already exists (never on a mere edit).
    for (let pos = existing.length + 1; pos <= count; pos++) {
      const name = `${prefix}-${String(pos).padStart(2, '0')}`;
      nextDrafts.push({ key: nextKey(), name, polka: targetPolka, barcode: null });
    }
    setDrafts({ ...draftState, cells: [...others, ...nextDrafts] });
  };

  /**
   * «Yacheyka kodi» + count → cells «{code}-01 … {code}-NN» (user 2026-07-06),
   * assigned to the given polka number (blank ⇒ «Без полки», set later via the
   * dropdown). The code is the first 3 segments as typed; the 4th is the running
   * number. Skips names that already exist (server OR pending) so re-running dupes.
   */
  const genCellsFromCode = (code: string, targetCount: number, polka: string) => {
    const prefix = code.trim().replace(/-+$/, '');
    if (!prefix) return;
    const pk = polka.trim() || null;
    const existing = new Set(cells.map((c) => c.name));
    const toCreate: DraftCell[] = [];
    for (let i = 1; i <= targetCount; i++) {
      const name = `${prefix}-${String(i).padStart(2, '0')}`;
      if (!existing.has(name)) toCreate.push({ key: nextKey(), name, polka: pk, barcode: null });
    }
    setDrafts({ ...draftState, cells: [...draftState.cells, ...toCreate] });
  };

  const commitNewCells = (polka: string, code: string, count: number) => {
    setEditing(null);
    const c = code.trim().replace(/-+$/, '');
    if (!c) return;
    genCellsFromCode(c, count, polka);
  };
  const commitZoneRename = (id: string, name: string) => {
    setEditing(null);
    if (!name) return;
    // Only a real server zone can be renamed here (pending polkas are derived
    // from their cells' codes). Server rename IS immediate — moysklad parity.
    renameZone.mutate({ id, name });
  };
  const removeZone = (z: ZoneView) => {
    if (z.serverId) {
      deleteZone.mutate(z.serverId);
      return;
    }
    // Pending-only polka → drop its pending cells + placeholder draft zone.
    setDrafts({
      zones: draftState.zones.filter((dz) => dz.name !== z.name),
      cells: draftState.cells.filter((c) => draftPolka(c) !== z.name),
    });
  };
  const commitNewCell = (name: string, barcode: string | null) => {
    setEditing(null);
    if (!name) return;
    // Always buffer (user 2026-07-05). NO polka by default (user 2026-07-06 —
    // removed the seg3 auto-rule); the row dropdown assigns it later.
    setDrafts({
      ...draftState,
      cells: [...draftState.cells, { key: nextKey(), name, polka: null, barcode }],
    });
  };
  const patchDraftCell = (id: string, patch: Partial<DraftCell>) => {
    setDrafts({
      ...draftState,
      cells: draftState.cells.map((c) => (c.key === id ? { ...c, ...patch } : c)),
    });
  };
  // Reassign a cell's polka from the row dropdown. Pending cell → its draft
  // polka; saved cell → move to that SAVED zone («» ⇒ «Без полки»).
  const setCellPolka = (cell: CellView, polka: string) => {
    if (cell.pending) {
      patchDraftCell(cell.id, { polka });
      return;
    }
    const zone = zones.find((z) => z.name === polka);
    patchCell.mutate({ id: cell.id, zoneId: polka && zone?.serverId ? zone.serverId : null });
  };
  const removeCell = (cell: CellView) => {
    // Pending cell → drop from the buffer; saved cell → delete on the server.
    if (cell.pending)
      setDrafts({ ...draftState, cells: draftState.cells.filter((c) => c.key !== cell.id) });
    else deleteCell.mutate(cell.id);
  };

  return (
    <div data-test-id="address-storage">
      {error && (
        <p
          className="mb-2 text-[12px] text-[var(--ms-text-error)]"
          data-test-id="address-storage-error"
        >
          {error}
        </p>
      )}

      {/* Onboarding help — moysklad shows it while the store has no zones/cells. */}
      {isEmpty && serverMode && (
        <div className="mb-4">
          <HelpBlock />
        </div>
      )}

      {/* Top row: «Проводить инвентаризацию по ячейкам» (edit mode) on the left,
          the BIG «Scan» button top-right (owner 2026-07-21: moved OUT of the
          per-cell product-add modal — the flow is cell-agnostic, any cell label
          scanned inside the window picks the target, so it must not live inside
          one cell's context). */}
      {(onCellInventoryChange || (serverMode && storeId)) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          {onCellInventoryChange ? (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[#222222] text-[12px]">
              <Checkbox
                checked={!!cellInventory}
                onCheckedChange={(v) => onCellInventoryChange(!!v)}
                data-test-id="cell-inventory-checkbox"
              />
              {t('cell_inventory')}
            </label>
          ) : (
            <span />
          )}
          {serverMode && storeId && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setCountOpen(true)}
                className="shrink-0 font-semibold text-[14px]"
                style={{ height: 40 }}
                data-test-id="cell-count-open"
              >
                {t('count_button')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setScanOpen(true)}
                // Owner 2026-07-21: «kattaroq» — the section's primary hardware
                // action, phone-tappable. Explicit height beats the global compact
                // control override.
                className="shrink-0 font-semibold text-[14px]"
                style={{ height: 40 }}
                data-test-id="cell-scan-open"
              >
                <Icons.barcode className="h-5 w-5" />
                {t('scan_button')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---- Полка (Зоны) ---- */}
      <SectionBar
        open={polkaOpen}
        onToggle={() => setPolkaOpen((v) => !v)}
        label={t('zone')}
        query={polkaQuery}
        onQuery={setPolkaQuery}
        searchPlaceholder={t('search_polka')}
        testPrefix="polka-section"
      />
      {polkaOpen && (
        <>
          <ZoneTable
            bucket={
              // Hide the «Без полки» bucket while a polka search is active.
              pq ? null : (
                <tr className={ROW_SEP}>
                  <td className={`${CELL_TD} text-[rgb(153,153,153)]`}>{t('no_zone')}</td>
                  <td className={CELL_TD} />
                  <td className={CELL_TD}>{zonelessTotal}</td>
                  <td className={CELL_TD}>{zonelessTotal - zonelessOccupied}</td>
                  <td className={CELL_TD}>{zonelessOccupied}</td>
                  <td className={CELL_TD} />
                </tr>
              )
            }
          >
            {zonesShown.map((z) => {
              // Click a polka row → the whole row edits: BOTH a polka-number input
              // AND a «Всего ячеек» count input (user 2026-07-05). Typing a higher
              // count auto-creates the missing «{prefix}-{polka}-{NN}» cells.
              if (editing === `zone-${z.id}`) {
                return (
                  <PolkaEditRow
                    key={z.id}
                    zone={z}
                    code={polkaCodeByName.get(z.name) ?? ''}
                    onCommit={(name, code, count) => {
                      setEditing(null);
                      // Rename the server zone (pending polkas re-label via drafts).
                      if (z.serverId && name && name !== z.name) commitZoneRename(z.serverId, name);
                      // SET this polka's pending cells to exactly `count` of {code}-NN.
                      setPolkaCells(z.name, name || z.name, code, count);
                    }}
                    onCancel={() => setEditing(null)}
                    onDelete={() => removeZone(z)}
                  />
                );
              }
              return (
                <tr
                  key={z.id}
                  onClick={() => setEditing(`zone-${z.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditing(`zone-${z.id}`);
                  }}
                  className={`group ${ROW_SEP} cursor-pointer hover:bg-[rgb(255,251,140)]`}
                  data-test-id={`zone-row-${z.id}`}
                >
                  <td className={CELL_TD}>
                    <span
                      className={`block truncate ${z.pending ? 'text-[var(--ms-text-brand)] italic' : ''}`}
                      data-test-id={`zone-label-${z.id}`}
                      title={z.pending ? t('unsaved_hint') : undefined}
                    >
                      {z.name}
                      {z.pending && ' •'}
                    </span>
                  </td>
                  {/* «Код ячейки» — always visible (user 2026-07-06), the polka's
                      cell-code prefix. */}
                  <td
                    className={`${CELL_TD} tabular-nums`}
                    data-test-id={`zone-code-label-${z.id}`}
                  >
                    {polkaCodeByName.get(z.name) ?? ''}
                  </td>
                  <td className={`${CELL_TD} tabular-nums`}>{z.cellCount}</td>
                  <td className={CELL_TD}>{z.freeCount}</td>
                  <td className={CELL_TD}>{z.occupiedCount}</td>
                  <td className={`${CELL_TD} text-center`}>
                    <RowDelete
                      label={`delete ${z.name}`}
                      onClick={() => removeZone(z)}
                      testId={`zone-del-${z.id}`}
                    />
                  </td>
                </tr>
              );
            })}
            {editing === 'new-zone' && (
              <NewPolkaRow onCommit={commitNewCells} onCancel={() => setEditing(null)} />
            )}
          </ZoneTable>
          <PlusAddButton
            label={t('add_zone')}
            onClick={() => setEditing('new-zone')}
            testId="add-zone"
          />
        </>
      )}

      {/* ---- Ячейка (Ячейки) ---- */}
      <div className="mt-6">
        <SectionBar
          open={cellOpen}
          onToggle={() => setCellOpen((v) => !v)}
          label={t('cell')}
          query={cellQuery}
          onQuery={setCellQuery}
          searchPlaceholder={t('search_cell')}
          testPrefix="cell-section"
        />
        {cellOpen && (
          <>
            <CellTable>
              {cellsShown.map((c) => {
                const isEdit = editing === `cell-${c.id}`;
                return (
                  <tr
                    key={c.id}
                    // moysklad: ONE click anywhere on the row → ALL fields edit at
                    // once (name + zone dropdown + barcode); closes on focus-out.
                    onClick={() => {
                      if (!isEdit) setEditing(`cell-${c.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isEdit) setEditing(`cell-${c.id}`);
                    }}
                    onBlur={(e) => {
                      if (isEdit && !e.currentTarget.contains(e.relatedTarget as Node | null))
                        setEditing(null);
                    }}
                    className={`group ${ROW_SEP} cursor-pointer hover:bg-[rgb(255,251,140)] ${
                      isEdit ? 'bg-[rgb(255,251,140)]' : ''
                    }`}
                    data-test-id={`cell-row-${c.id}`}
                  >
                    <td className={CELL_TD}>
                      {isEdit ? (
                        <InlineText
                          value={c.name}
                          onCommit={(name) => {
                            if (!name || name === c.name) return;
                            if (c.pending) patchDraftCell(c.id, { name });
                            else patchCell.mutate({ id: c.id, name });
                          }}
                          placeholder={t('cell_placeholder')}
                          autoFocus
                          widthClass="h-[24px] w-[160px]"
                          testId={`cell-name-${c.id}`}
                        />
                      ) : (
                        <span
                          className={`block truncate ${c.pending ? 'text-[var(--ms-text-brand)] italic' : ''}`}
                          data-test-id={`cell-label-${c.id}`}
                          title={c.pending ? t('unsaved_hint') : undefined}
                        >
                          {c.name}
                          {c.pending && ' •'}
                        </span>
                      )}
                    </td>
                    <td className={CELL_TD}>
                      {/* «Полка» — pick from the existing polka numbers (user
                      2026-07-05). Defaults to the code's 3rd segment; a pending
                      cell edits its draft polka, a saved cell moves zone. */}
                      {isEdit ? (
                        <NativeSelect
                          value={c.zoneName ?? ''}
                          className="h-[24px] w-[163px] text-[12px]"
                          onChange={(e) => setCellPolka(c, e.target.value)}
                          data-test-id={`cell-polka-${c.id}`}
                        >
                          <option value="">{t('no_zone')}</option>
                          {(c.pending ? allPolkaOptions : serverPolkaOptions).map((nm) => (
                            <option key={nm} value={nm}>
                              {nm}
                            </option>
                          ))}
                          {c.zoneName &&
                            !(c.pending ? allPolkaOptions : serverPolkaOptions).includes(
                              c.zoneName,
                            ) && <option value={c.zoneName}>{c.zoneName}</option>}
                        </NativeSelect>
                      ) : (
                        <span className="block truncate">{c.zoneName ?? ''}</span>
                      )}
                    </td>
                    <td className={CELL_TD}>
                      {c.occupied && serverMode && !c.pending ? (
                        // Occupied → clickable: opens the per-product contents modal
                        // (a cell can hold SEVERAL products, each with its own qty).
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContentsCell({ id: c.id, name: c.name });
                          }}
                          className="text-[var(--ms-text-brand)] hover:underline"
                          data-test-id={`cell-contents-${c.id}`}
                        >
                          {t('status_occupied')}
                        </button>
                      ) : c.occupied ? (
                        t('status_occupied')
                      ) : (
                        t('status_free')
                      )}
                    </td>
                    <td className={CELL_TD}>
                      {isEdit ? (
                        <div className="flex items-center gap-1">
                          <InlineText
                            value={c.barcode ?? ''}
                            onCommit={(barcode) => {
                              if (c.pending) patchDraftCell(c.id, { barcode: barcode || null });
                              else patchCell.mutate({ id: c.id, barcode: barcode || null });
                            }}
                            widthClass="h-[24px] w-[160px]"
                            testId={`cell-barcode-${c.id}`}
                          />
                          <BarcodeGenButton
                            onGenerate={(code) => {
                              if (c.pending) patchDraftCell(c.id, { barcode: code });
                              else patchCell.mutate({ id: c.id, barcode: code });
                            }}
                            testId={`cell-barcode-gen-${c.id}`}
                          />
                        </div>
                      ) : (
                        <span className="block truncate">{c.barcode ?? ''}</span>
                      )}
                    </td>
                    <td className={`${CELL_TD} text-center`}>
                      <span className="flex items-center justify-center gap-1">
                        {/* «＋ Добавить товар» — saved cells only: assign products to
                            this cell (user 2026-07-06). Always visible so it reads as
                            the row's primary action. */}
                        {serverMode && !c.pending && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setContentsCell({ id: c.id, name: c.name });
                            }}
                            className="shrink-0 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-strong)] px-2 py-0.5 text-[12px] text-[var(--ms-text-link)] transition-colors hover:border-[var(--ms-border-focus)] hover:bg-[var(--ms-text-brand)] hover:text-white"
                            data-test-id={`cell-view-${c.id}`}
                          >
                            {t('view_button')}
                          </button>
                        )}
                        {serverMode && !c.pending && (
                          // Owner 2026-07-20: bigger, phone-tappable (40px on
                          // mobile) and unmistakable on hover (fills brand-blue).
                          <button
                            type="button"
                            aria-label={t('add_product_to_cell')}
                            title={t('add_product_to_cell')}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignCell({ id: c.id, name: c.name });
                            }}
                            // px sizes, not rem: the mobile root font is 14px, so
                            // h-10 (2.5rem) silently became 35px; shrink-0 stops
                            // the cramped cell from squeezing the tap target.
                            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-strong)] text-[var(--ms-text-link)] transition-colors hover:border-[var(--ms-border-focus)] hover:bg-[var(--ms-text-brand)] hover:text-white max-md:h-[44px] max-md:w-[44px]"
                            data-test-id={`cell-add-product-${c.id}`}
                          >
                            <Icons.create className="h-4 w-4 max-md:h-5 max-md:w-5" />
                          </button>
                        )}
                        {/* «🖨 Этикетка» (F1) — saved cells only (needs a real cell id). */}
                        {serverMode && !c.pending && (
                          <button
                            type="button"
                            aria-label={t('print_label')}
                            title={t('print_label')}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLabelCell({ id: c.id, name: c.name, barcode: c.barcode });
                            }}
                            // Owner 2026-07-28: was `invisible group-hover:visible` —
                            // hover doesn't fire on touch, so the print button never
                            // showed on a phone (the warehouse's main device). Always
                            // visible + 44px tap target on mobile, like the ＋ button.
                            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-strong)] text-[var(--ms-text-link)] transition-colors hover:border-[var(--ms-border-focus)] hover:bg-[var(--ms-text-brand)] hover:text-white max-md:h-[44px] max-md:w-[44px]"
                            data-test-id={`cell-print-${c.id}`}
                          >
                            <Icons.print className="h-4 w-4 max-md:h-5 max-md:w-5" />
                          </button>
                        )}
                        <RowDelete
                          label={`delete ${c.name}`}
                          onClick={() => removeCell(c)}
                          testId={`cell-del-${c.id}`}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
              {editing === 'new-cell' && (
                <NewCellRow
                  storeCode={storeCode}
                  onCommit={commitNewCell}
                  onCancel={() => setEditing(null)}
                />
              )}
            </CellTable>
            <div className="flex items-center gap-4">
              <PlusAddButton
                label={t('add_cell')}
                onClick={() => setEditing('new-cell')}
                testId="add-cell"
              />
              {serverMode && storeId && (
                <PlusAddButton
                  label={t('range_button')}
                  onClick={() => setRangeOpen(true)}
                  testId="add-cell-range"
                />
              )}
            </div>
          </>
        )}
      </div>

      {serverMode && storeId && labelCell && (
        <CellLabelPrintOverlay
          cell={labelCell}
          // Only saved cells are printable — pending drafts have no real id yet.
          cells={cells
            .filter((c) => !c.pending)
            .map((c) => ({ id: c.id, name: c.name, barcode: c.barcode }))}
          onClose={() => setLabelCell(null)}
        />
      )}

      {/* «Diapazon bo'yicha yaratish» — bitta amalda yuzlab yacheyka. Oldindan
          ko'rish ham, yaratish ham SERVERdagi bitta endpointdan o'tadi. */}
      {serverMode && storeId && (
        <CellRangeModal
          open={rangeOpen}
          storeId={storeId}
          storeCode={storeCode}
          onClose={() => setRangeOpen(false)}
          onCreated={invalidate}
        />
      )}

      {serverMode && storeId && contentsCell && (
        <CellContentsModal
          storeId={storeId}
          cell={contentsCell}
          cells={serverCells.map((c) => ({ id: c.id, name: c.name, barcode: c.barcode }))}
          onClose={() => setContentsCell(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['product-cell-stock'] });
            qc.invalidateQueries({ queryKey: ['product-storage-options'] });
            invalidate();
          }}
        />
      )}

      {/* «Добавить товар в ячейку» — the moysklad product picker (search + filter
          + folder tree), selection mode. Already-assigned products show checked +
          disabled; picking new ones sets their home cell to this cell. */}
      {serverMode && assignCell && (
        <ProductSelectModal
          open={!!assignCell}
          onClose={() => setAssignCell(null)}
          currency="UZS"
          selectionMode
          disabledIds={assignedProductIds}
          onConfirm={() => undefined}
          onConfirmSelection={(products) => {
            assignProducts.mutate(products.map((p) => p.id));
          }}
          labels={{
            title: `${t('add_product_to_cell')} · ${assignCell.name}`,
            searchPlaceholder: tProductSelect('searchPlaceholder'),
            refresh: tProductSelect('refresh'),
            priceColumns: tProductSelect('priceColumns'),
            colName: tProductSelect('colName'),
            colQty: tProductSelect('colQty'),
            colOnHand: tProductSelect('colOnHand'),
            colReserved: tProductSelect('colReserved'),
            colInTransit: tProductSelect('colInTransit'),
            colAvailable: tProductSelect('colAvailable'),
            colCode: tProductSelect('colCode'),
            colArticle: tProductSelect('colArticle'),
            colUom: tProductSelect('colUom'),
            colCountry: tProductSelect('colCountry'),
            colWeight: tProductSelect('colWeight'),
            colImage: tProductSelect('colImage'),
            colKind: tProductSelect('colKind'),
            colDescription: tProductSelect('colDescription'),
            colMinPrice: tProductSelect('colMinPrice'),
            colRetailPrice: tProductSelect('colRetailPrice'),
            colPrice: tProductSelect('colPrice'),
            select: tProductSelect('select'),
            cancel: tProductSelect('cancel'),
            close: tProductSelect('close'),
            empty: tProductSelect('empty'),
            loading: tProductSelect('loading'),
            filter: {
              toggle: tFilters('trigger'),
              kind: tFilters('product_kind'),
              kindOptions: [
                { value: '', label: tCommon('all') },
                { value: 'product', label: tFilters('kind_product') },
                { value: 'service', label: tFilters('kind_service') },
                { value: 'bundle', label: tFilters('kind_bundle') },
              ],
              show: tFilters('show'),
              showOptions: [
                { value: 'active', label: tFilters('show_regular') },
                { value: 'archived', label: tFilters('show_archived') },
                { value: 'all', label: tCommon('all') },
              ],
              barcode: tFilters('barcode'),
              belowMinimum: tFilters('below_minimum'),
              belowMinimumOptions: [
                { value: '', label: tCommon('all') },
                { value: 'true', label: tCommon('yes') },
                { value: 'false', label: tCommon('no') },
              ],
              reset: tCommon('clear'),
              description: tFilters('description'),
              article: tFilters('article'),
              code: tFilters('code'),
              externalCode: tFilters('external_code'),
            },
          }}
        />
      )}

      {/* «Scan» — hands-free cell↔product barcode binding (owner 2026-07-19).
          Saved cells only: a pending draft cell has no server id to bind to. */}
      {serverMode && storeId && (
        <CellCountModal
          open={countOpen}
          onOpenChange={setCountOpen}
          storeId={storeId}
          cells={serverCells.map((c) => ({ id: c.id, name: c.name, barcode: c.barcode }))}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['cell-contents', storeId] });
            qc.invalidateQueries({ queryKey: ['product-cell-stock'] });
            invalidate();
          }}
        />
      )}

      {serverMode && storeId && (
        <CellScanBindModal
          open={scanOpen}
          onOpenChange={setScanOpen}
          storeId={storeId}
          cells={serverCells.map((c) => ({ id: c.id, name: c.name, barcode: c.barcode }))}
          // Owner 2026-07-20 spec: the flow ALWAYS starts at «№ 1 — scan the
          // cell label» — no pre-selected cell, the shelf label is the truth.
          initialCell={null}
          onBound={() => {
            qc.invalidateQueries({ queryKey: ['cell-products', storeId, assignCell?.id] });
            qc.invalidateQueries({ queryKey: ['product-cell-stock'] });
            qc.invalidateQueries({ queryKey: ['product-storage-options'] });
            invalidate();
          }}
        />
      )}
    </div>
  );
}
