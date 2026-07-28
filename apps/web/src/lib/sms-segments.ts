// GSM-7 asosiy alifbo (soddalashtirilgan): lotin harflar, raqamlar, oddiy
// tinish belgilar — o'zbekcha SMS uchun yetarli. Alifbodan tashqari HAR
// QANDAY belgi (kirill, emoji, ba'zi maxsus) → UCS-2 (unicode) rejimi (70/SMS).
const GSM = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split(
    '',
  ),
);

export interface SmsSegmentInfo {
  chars: number;
  segments: number;
  encoding: 'gsm' | 'unicode';
}

/** Matn uzunligini SMS segment soniga aylantiradi (narx ko'rsatkichi). */
export function smsSegments(text: string): SmsSegmentInfo {
  const chars = [...text].length;
  if (chars === 0) return { chars: 0, segments: 0, encoding: 'gsm' };
  const isGsm = [...text].every((c) => GSM.has(c));
  const per = isGsm ? { single: 160, multi: 153 } : { single: 70, multi: 67 };
  const segments = chars <= per.single ? 1 : Math.ceil(chars / per.multi);
  return { chars, segments, encoding: isGsm ? 'gsm' : 'unicode' };
}
