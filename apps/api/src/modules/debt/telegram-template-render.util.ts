/**
 * Telegram xabar-shablonini render qiladi (2026-07-20 shablon-kutubxonasi).
 *
 * Xabar shaxsiy raqamdan (MTProto userbot) ketadi va GramJS **MarkdownV2**
 * dialektida yoziladi (`*qalin*`, `__tagliq__`) — `debt-telegram.util.ts`dagi
 * hardcoded `reminderMessage` bilan bir xil format. Farqi: matn endi DB-shablon
 * (`MessageTemplate.body`), Eta (`{{= x }}`) bilan render qilinadi.
 *
 * XAVFSIZLIK: shablonning O'ZIDAGI `*`/`__` — author'ning ataylab formatlashi
 * (o'tadi). LEKIN o'zgaruvchi QIYMATLARI (mijoz nomi va h.k.) tasodifan
 * delimiter hosil qilib butun xabarni buzmasin — ular `mdSafeValue` bilan
 * escape qilinadi (har maxsus belgidan keyin U+200B, odam sezmaydi, GramJS
 * parseri delimiter deb o'qimaydi). Bu `debt-telegram.util.ts` `mdSafe`
 * mantiqining nusxasi — HR/parallel-tahrirlanayotgan fayllarga BOG'LANMASLIK
 * uchun alohida (SMS `sms-render.util.ts` izolyatsiyasi bilan bir intizom).
 */

import { Eta } from 'eta';
import { formatSomMinor } from '../sms/sms-render.util.js';
import { reminderMessage } from './debt-telegram.util.js';

const ZERO_WIDTH_SPACE = '​';

/** O'zgaruvchi QIYMATIdagi MarkdownV2 delimiterlarini zararsizlantiradi. */
export function mdSafeValue(s: string): string {
  return s.replace(/[*_~`|-]/g, (c) => c + ZERO_WIDTH_SPACE);
}

export interface TelegramTemplateContext {
  counterparty: { name: string };
  debt: { remainingFormatted: string; totalFormatted: string };
  company: { phone: string; card: string; cardOwner: string };
}

// SMS `sms-render.util.ts` bilan bir xil izolyatsiya — mustaqil Eta instansi
// ({{= x }} interpolatsiya, autoEscape=false chunki bu HTML emas, useWith
// top-level kalitlarni to'g'ridan-to'g'ri o'qishga imkon).
const eta = new Eta({
  tags: ['{{', '}}'],
  autoEscape: false,
  autoTrim: false,
  cache: false,
  useWith: true,
});

/**
 * Kontekst string-qiymatlarini `mdSafeValue` bilan escape qiladi, keyin Eta
 * render qiladi. Buzuq o'zgaruvchi/tag → Eta throw (service saqlashdan oldin
 * tutadi, aks holda keyingi HAR yuborishda yiqilardi).
 */
export function renderTelegramTemplate(body: string, ctx: TelegramTemplateContext): string {
  const safe: TelegramTemplateContext = {
    counterparty: { name: mdSafeValue(ctx.counterparty.name) },
    debt: {
      remainingFormatted: mdSafeValue(ctx.debt.remainingFormatted),
      totalFormatted: mdSafeValue(ctx.debt.totalFormatted),
    },
    company: {
      phone: mdSafeValue(ctx.company.phone),
      card: mdSafeValue(ctx.company.card),
      cardOwner: mdSafeValue(ctx.company.cardOwner),
    },
  };
  const out = eta.renderString(body, safe as unknown as Record<string, unknown>);
  if (typeof out !== 'string') throw new Error('renderTelegramTemplate: Eta returned non-string');
  return out;
}

/**
 * Qarz-eslatma Telegram matni: tanlangan/default shablonni render qiladi;
 * shablon YO'Q yoki o'chirilgan bo'lsa — eski hardcoded `reminderMessage`
 * (fallback, backward-compatible). Bulk + cron + bitta-yuborish shu YAGONA
 * yo'ldan foydalanadi (DRY), shuning uchun uchala joyda xulq bir xil.
 */
export function renderReminderText(
  tpl: { body: string; enabled: boolean } | null,
  args: {
    name: string;
    remainingMinor: bigint;
    totalMinor: bigint;
    contact: { phone: string; card: string; cardOwner: string };
  },
): string {
  if (tpl?.enabled) {
    return renderTelegramTemplate(tpl.body, {
      counterparty: { name: args.name },
      debt: {
        remainingFormatted: formatSomMinor(args.remainingMinor),
        totalFormatted: formatSomMinor(args.totalMinor),
      },
      company: args.contact,
    });
  }
  return reminderMessage({
    name: args.name,
    remainingMinor: args.remainingMinor,
    contact: args.contact,
  });
}
