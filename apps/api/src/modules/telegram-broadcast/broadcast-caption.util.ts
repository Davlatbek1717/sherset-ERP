/**
 * Broadcast caption → plain text + ANIQ entity'lar (bold + blockquote).
 * 2026-07-20 (blockquote qo'shildi 2026-07-21).
 *
 * NEGA markdown EMAS, entity: caption'da emoji + `!`, `|`, `–`, `(`, `)` kabi
 * belgilar aralash. GramJS MarkdownV2 dialektida bularning ba'zisi maxsus
 * (escape talab qiladi) — bitta xato butun formatni buzadi va u 1600 mijozga
 * ketadi. Shuning uchun matnni SEGMENTLARDAN yig'amiz va qalin/blockquote
 * joylarni offset/length bilan ANIQ belgilaymiz. Telegram entity offset'lari
 * UTF-16 kod-birligida; JS `string.length` ham aynan UTF-16 kod-birligi
 * (emoji = surrogat juft = 2 birlik ikkalasida ham) — offset hisobi mos
 * keladi, escape muammosi umuman yo'q.
 *
 * Blockquote (kulrang qutичка, chap chiziq + `»`) — Telegram
 * `Api.MessageEntityBlockquote`. Bir «q» guruhidagi qo'shni segmentlar bitta
 * blockquote'ga birlashadi (ko'p qatorli quti).
 */

export interface CaptionRange {
  offset: number;
  length: number;
}

export interface CaptionSegment {
  t: string;
  /** true → shu segment qalin (Api.MessageEntityBold). */
  b?: boolean;
  /**
   * Blockquote guruh id'si. Bir xil id'li QO'SHNI segmentlar bitta
   * blockquote'ga birlashadi (masalan ko'p qatorli ro'yxat qutisi).
   */
  q?: number;
}

export interface BuiltCaption {
  text: string;
  /** UTF-16 offset/length qalin oraliqlar. */
  bold: CaptionRange[];
  /** UTF-16 offset/length blockquote oraliqlar. */
  quote: CaptionRange[];
}

/** Segmentlardan matn + qalin + blockquote oraliqlarni yig'adi (UTF-16 offset). */
export function buildCaption(segments: CaptionSegment[]): BuiltCaption {
  let text = '';
  const bold: CaptionRange[] = [];
  const quoteMap = new Map<number, { offset: number; end: number }>();
  for (const seg of segments) {
    const offset = text.length; // JS length = UTF-16 kod-birligi = Telegram offset
    text += seg.t;
    const end = text.length;
    if (seg.t.length === 0) continue;
    if (seg.b) bold.push({ offset, length: seg.t.length });
    if (seg.q !== undefined) {
      const cur = quoteMap.get(seg.q);
      if (cur)
        cur.end = end; // qo'shni segment — blockquote'ni cho'zamiz
      else quoteMap.set(seg.q, { offset, end });
    }
  }
  const quote = [...quoteMap.values()].map((r) => ({ offset: r.offset, length: r.end - r.offset }));
  return { text, bold, quote };
}

/**
 * «SHERSETDA KATTA YANGILIK» — kechki-smena e'loni (2026-07-20 tarqatma).
 * Matn foydalanuvchi tomonidan tasdiqlangan (asl «Optom narxlarlarda» saqlangan).
 * Rasm 1:1: sarlavha va checkmark ro'yxati BLOCKQUOTE (kulrang quti) ichida;
 * brend nomlari + sarlavha + vaqt + yakuniy chaqiriq QALIN.
 *   q:1 — sarlavha qutisi · q:2 — checkmark ro'yxati qutisi.
 */
export const KECHKI_SMENA_CAPTION: BuiltCaption = buildCaption([
  { t: '🌙 ', q: 1 },
  { t: 'SHERSETDA KATTA YANGILIK!', b: true, q: 1 },
  { t: '\n\n' },
  {
    t: "Endi ish vaqtini o'ylab o'tirmang — SHERSET elektr tovarlar do'koni endi KECHKI SMENADA ham xizmatingizda!",
  },
  { t: '\n\n🕖 ' },
  { t: 'Har kuni 19:00 – 23:00', b: true },
  { t: '\n(kunduzgi savdo odatdagidek davom etadi)' },
  { t: '\n\n⚡️ ' },
  { t: 'Bizda barchasi bir joyda:', b: true },
  { t: '\n' },
  { t: '☑️ Kabel va simlar — ', q: 2 },
  { t: 'SHERSET KABEL, Uzkabel, AAK', b: true, q: 2 },
  { t: '\n☑️ Rozetka va vyklyuchatellar — ', q: 2 },
  { t: 'VIKO, Panasonic', b: true, q: 2 },
  { t: '\n☑️ Avtomatlar va hisoblagichlar — ', q: 2 },
  { t: 'Schneider, CHINT, Delixi', b: true, q: 2 },
  { t: '\n☑️ Lyustra va LED yoritish — ', q: 2 },
  { t: 'Akfa, Lucem', b: true, q: 2 },
  { t: '\n☑️ Metiz va elektromontaj mollari', q: 2 },
  { t: '\n\n💡 Barcha turdagi elektrotovarlar | 💰 Optom narxlarlarda' },
  { t: "\n\n📍 G'ijduvon eski pivo zavod" },
  { t: '\n📞 +998 91 925 87 00' },
  { t: '\n\n' },
  { t: 'Kechqurun ham sizni Shersetda kutib qolamiz!', b: true },
  { t: ' ⚡️' },
]);
