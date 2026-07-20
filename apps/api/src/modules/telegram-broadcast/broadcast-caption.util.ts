/**
 * Broadcast caption → plain text + explicit BOLD entities (2026-07-20).
 *
 * NEGA markdown EMAS, entity: caption'da emoji + `!`, `|`, `–`, `(`, `)` kabi
 * belgilar aralash. GramJS MarkdownV2 dialektida bularning ba'zisi maxsus
 * (escape talab qiladi) — bitta xato butun formatni buzadi va u 1600 mijozga
 * ketadi. Shuning uchun matnni SEGMENTLARDAN yig'amiz va qalin joylarni
 * offset/length bilan ANIQ belgilaymiz. Telegram entity offset'lari UTF-16
 * kod-birligida; JS `string.length` ham aynan UTF-16 kod-birligi (emoji =
 * surrogat juft = 2 birlik ikkalasida ham) — shuning uchun offset hisobi
 * mos keladi, escape muammosi umuman yo'q.
 */

export interface CaptionSegment {
  t: string;
  /** true → shu segment qalin (Api.MessageEntityBold). */
  b?: boolean;
}

export interface BuiltCaption {
  text: string;
  /** UTF-16 offset/length qalin oraliqlar. */
  bold: { offset: number; length: number }[];
}

/** Segmentlardan matn + qalin-oraliqlarni yig'adi (UTF-16 offset). */
export function buildCaption(segments: CaptionSegment[]): BuiltCaption {
  let text = '';
  const bold: { offset: number; length: number }[] = [];
  for (const seg of segments) {
    const offset = text.length; // JS length = UTF-16 kod-birligi = Telegram offset
    text += seg.t;
    if (seg.b && seg.t.length > 0) bold.push({ offset, length: seg.t.length });
  }
  return { text, bold };
}

/**
 * «SHERSETDA KATTA YANGILIK» — kechki-smena e'loni (2026-07-20 tarqatma).
 * Matn foydalanuvchi tomonidan tasdiqlangan (asl «Optom narxlarlarda» saqlangan).
 * Qalin joylar rasmga mos: sarlavha, vaqt, «Bizda barchasi bir joyda», har
 * qatordagi BREND nomlari, yakuniy chaqiriq.
 */
export const KECHKI_SMENA_CAPTION: BuiltCaption = buildCaption([
  { t: '🌙 ' },
  { t: 'SHERSETDA KATTA YANGILIK!', b: true },
  { t: '\n\n' },
  {
    t: "Endi ish vaqtini o'ylab o'tirmang — SHERSET elektr tovarlar do'koni endi KECHKI SMENADA ham xizmatingizda!",
  },
  { t: '\n\n🕖 ' },
  { t: 'Har kuni 19:00 – 23:00', b: true },
  { t: '\n(kunduzgi savdo odatdagidek davom etadi)' },
  { t: '\n\n⚡️ ' },
  { t: 'Bizda barchasi bir joyda:', b: true },
  { t: '\n☑️ Kabel va simlar — ' },
  { t: 'SHERSET KABEL, Uzkabel, AAK', b: true },
  { t: '\n☑️ Rozetka va vyklyuchatellar — ' },
  { t: 'VIKO, Panasonic', b: true },
  { t: '\n☑️ Avtomatlar va hisoblagichlar — ' },
  { t: 'Schneider, CHINT, Delixi', b: true },
  { t: '\n☑️ Lyustra va LED yoritish — ' },
  { t: 'Akfa, Lucem', b: true },
  { t: '\n☑️ Metiz va elektromontaj mollari' },
  { t: '\n\n💡 Barcha turdagi elektrotovarlar | 💰 Optom narxlarlarda' },
  { t: "\n\n📍 G'ijduvon eski pivo zavod" },
  { t: '\n📞 +998 91 925 87 00' },
  { t: '\n\n' },
  { t: 'Kechqurun ham sizni Shersetda kutib qolamiz!', b: true },
  { t: ' ⚡️' },
]);
