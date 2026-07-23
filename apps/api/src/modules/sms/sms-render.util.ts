import { Eta } from 'eta';

/** Sherset defaults — CompanySettings.messaging* bo'sh bo'lsa ishlatiladi. */
export const DEFAULT_MESSAGING_CONTACT = {
  phone: '+998915748800',
  card: '9860 1201 2532 1642',
  cardOwner: 'Ilhom Ziyaviddinov',
} as const;

export interface SmsRenderContext {
  counterparty: { name: string };
  debt: { remainingFormatted: string; totalFormatted: string };
  company: { phone: string; card: string; cardOwner: string };
}

// SMS uchun mustaqil Eta instansi ({{= x }} interpolatsiya). autoEscape=false —
// SMS oddiy matn; useWith top-level kalitlarni to'g'ridan-to'g'ri o'qishga imkon.
// (HR-telegram render util'idan ATAYLAB alohida — o'sha fayl parallel sessiyada.)
const eta = new Eta({
  tags: ['{{', '}}'],
  autoEscape: false,
  autoTrim: false,
  cache: false,
  useWith: true,
});

export function renderSmsTemplate(body: string, ctx: SmsRenderContext): string {
  const out = eta.renderString(body, ctx as unknown as Record<string, unknown>);
  if (typeof out !== 'string') throw new Error('renderSmsTemplate: Eta returned non-string');
  return out;
}

/** 125000000 (tiyin) → «1 250 000». null/undefined → «—». */
export function formatSomMinor(v: bigint | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  let big: bigint;
  try {
    big = typeof v === 'bigint' ? v : BigInt(v);
  } catch {
    return '—';
  }
  if (big === 0n) return '0';
  const neg = big < 0n;
  const som = (neg ? -big : big) / 100n;
  const grouped = som.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return neg ? `-${grouped}` : grouped;
}
