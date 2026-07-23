/**
 * Backfill dvigateli uchun DB/gramjs'siz sof yordamchilar (unit-test yadrosi).
 * gramjs qatlami (`gramjs-client.factory.ts`) va worker (`telegram-backfill-
 * worker.service.ts`) shu funksiyalarni qayta ishlatadi — mantiq bir joyda,
 * testlanadigan bo'lib qoladi.
 */

export type MediaKind = 'text' | 'photo' | 'document' | 'voice' | 'video';

/**
 * gramjs `Message`ning media-getterlaridan (`.photo`/`.voice`/`.video`/
 * `.document`) faqat KIND ni aniqlaydi — aniq mime/fileName gramjs qatlamida
 * (`resolveGramjsMedia`) qo'shiladi. Voice aslida document ostida, shuning
 * uchun aniqroq bayroq (voice/video) umumiy `document`dan ustun turadi;
 * `photo` esa hammasidan ustun (rasm alohida maydonda keladi).
 */
export function mediaKindFromFlags(f: {
  photo?: boolean;
  voice?: boolean;
  video?: boolean;
  document?: boolean;
}): MediaKind {
  if (f.photo) return 'photo';
  if (f.voice) return 'voice';
  if (f.video) return 'video';
  if (f.document) return 'document';
  return 'text';
}

/**
 * Sahifadagi eng kichik `tgMessageId` — keyingi (eskiroq) sahifa uchun
 * `offsetId`. gramjs `getMessages` `offsetId`dan ESKIROQ xabarlarni beradi,
 * shuning uchun har sahifadan keyin eng kichik id'ni kursor qilamiz. Bo'sh
 * sahifa → null (dialog boshiga yetildi).
 */
export function olderCursor(page: { tgMessageId: number }[]): number | null {
  let min: number | null = null;
  for (const m of page) {
    if (min === null || m.tgMessageId < min) min = m.tgMessageId;
  }
  return min;
}
