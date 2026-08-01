import type { PrintParty } from '@/components/print/print-doc';

/**
 * Chop etiladigan hujjat uchun TOMON kartasi va IMZO bloki.
 *
 * Nega umumiy: 14 ta chop sahifasi bir xil `PrintDoc` ni ishlatadi, lekin har
 * biri tomon ma'lumotini O'ZI yig'ardi — natijada aksari faqat `legalAddress`
 * chizardi, STIR/bank/telefon esa API'dan kelib turib ishlatilmasdi, imzo
 * qatorlari esa kompaniya nomini takrorlardi (2026-08-01 audit).
 *
 * Bu yerda bir marta to'g'ri yozilib, hamma sahifa shuni chaqiradi.
 */

/** `PrintDoc` tomon kartasi uchun kerakli tashkilot maydonlari. */
export interface PrintOrgLike {
  name: string;
  legalTitle?: string | null;
  legalAddress?: string | null;
  phone?: string | null;
  director?: string | null;
  directorPosition?: string | null;
  chiefAccountant?: string | null;
  uzRequisites?: { inn?: string } | null;
}

/** Bank hisobi (moysklad «Счёт организации»). */
export interface PrintAccountLike {
  accountNumber?: string | null;
  bankName?: string | null;
  bic?: string | null;
}

/** Kontragent — tashkilotdan kamroq maydon (direktor/buxgalter bizda yo'q). */
export interface PrintAgentLike {
  name: string;
  legalTitle?: string | null;
  legalAddress?: string | null;
  phone?: string | null;
  uzRequisites?: { inn?: string } | null;
}

/** `pages.print` nomlar fazosidagi tarjimon. */
type T = (key: string) => string;

function joinLines(parts: (string | null | undefined)[]): string | null {
  return parts.filter(Boolean).join('\n') || null;
}

/**
 * Tashkilot kartasi — TO'LIQ rekvizit bilan.
 * Birlamchi hujjat tomonni nomi bilan emas, STIR va bank bilan tanitadi.
 */
export function orgParty(
  t: T,
  label: string,
  org: PrintOrgLike,
  account?: PrintAccountLike | null,
): PrintParty {
  return {
    label,
    name: org.legalTitle ?? org.name,
    details: joinLines([
      org.legalAddress,
      org.uzRequisites?.inn ? `${t('req.inn')}: ${org.uzRequisites.inn}` : null,
      account?.accountNumber ? `${t('req.account')}: ${account.accountNumber}` : null,
      account?.bankName,
      account?.bic ? `${t('req.mfo')}: ${account.bic}` : null,
      org.phone ? `${t('req.phone')}: ${org.phone}` : null,
    ]),
  };
}

/** Kontragent kartasi — manzil + STIR + telefon. */
export function agentParty(t: T, label: string, agent: PrintAgentLike): PrintParty {
  return {
    label,
    name: agent.legalTitle ?? agent.name,
    details: joinLines([
      agent.legalAddress,
      agent.uzRequisites?.inn ? `${t('req.inn')}: ${agent.uzRequisites.inn}` : null,
      agent.phone ? `${t('req.phone')}: ${agent.phone}` : null,
    ]),
  };
}

/**
 * Imzo bloki.
 *
 * Asosiy tuzatish: sahifalar `signature.director` yorlig'ini to'g'ri
 * tanlagan-u, NOM sifatida KOMPANIYA nomini qo'yardi — ya'ni imzo qatori
 * «Директор / MCHJ Demo» bo'lib chiqardi. Endi direktorning haqiqiy ismi
 * (va lavozimi, agar kiritilgan bo'lsa) ishlatiladi.
 *
 * `agentSideLabel` — qarshi tomon yorlig'ini CHAQIRUVCHI beradi, chunki u
 * hujjat yo'nalishiga bog'liq: chiquvchida «Принял», kiruvchida «Отпустил».
 */
export function partySignatures(
  t: T,
  org: PrintOrgLike,
  agentName: string,
  agentSideLabel: string,
): { label: string; name: string }[] {
  return [
    { label: org.directorPosition ?? t('signature.director'), name: org.director ?? org.name },
    ...(org.chiefAccountant
      ? [{ label: t('signature.accountant'), name: org.chiefAccountant }]
      : []),
    { label: agentSideLabel, name: agentName },
  ];
}
