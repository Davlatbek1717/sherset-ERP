/**
 * Xodimni to'liq o'chirish — tasdiq oynasi uchun sof mantiq.
 *
 * Server `GET /hr/employees/:id/delete-preflight` da nima bo'lishini oldindan
 * aytadi: nima TO'SIB turibdi (pul/kassa izi) va xodim bilan birga nima
 * o'chadi (HR hosila loglari). Bu funksiya o'sha javobni oynaga tayyor matnga
 * aylantiradi va **fail-closed** qaror beradi.
 */

export interface EmployeeRelationCount {
  key: string;
  label: string;
  count: number;
}

export interface EmployeeDeletePreflight {
  canDelete: boolean;
  blockers: EmployeeRelationCount[];
  cascade: EmployeeRelationCount[];
}

export interface EmployeeDeleteDescription {
  /** Oyna o'chirishga ruxsat berishi mumkinmi. */
  canDelete: boolean;
  /** Preflight umuman kelmadi (tarmoq/xato) — sabab noma'lum. */
  unknown: boolean;
  /** «oylik — 3, kassa smenasi — 1» */
  blockerText: string;
  /** «kunlik KPI — 17, davomat — 4» — faqat o'chirish mumkin bo'lganda. */
  cascadeText: string;
}

function join(rows: readonly EmployeeRelationCount[]): string {
  return rows
    .filter((r) => r.count > 0)
    .map((r) => `${r.label} — ${r.count}`)
    .join(', ');
}

export function describeEmployeeDelete(
  preflight: EmployeeDeletePreflight | null | undefined,
): EmployeeDeleteDescription {
  // Fail-closed: javob yo'q bo'lsa «tarixsiz xodim» deb TAXMIN qilmaymiz.
  // Aks holda tarmoq xatosi jimgina «o'chirish xavfsiz» degan xulosaga
  // aylanardi va kassir server 409 berganini sababsiz ko'rardi.
  if (!preflight) {
    return { canDelete: false, unknown: true, blockerText: '', cascadeText: '' };
  }

  const blockerText = join(preflight.blockers ?? []);
  // 🔴 `canDelete` bayrog'iga YOLG'IZ ishonmaymiz — to'siq ro'yxati bo'sh
  // emasligi ham qulf. Ikkovi ayrilsa (eskirgan javob, qisman o'qish),
  // xavfsiz tomonga og'amiz: server baribir rad etadi.
  const canDelete = preflight.canDelete && blockerText === '';

  return {
    canDelete,
    unknown: false,
    blockerText,
    // To'siq bo'lsa hech narsa o'chmaydi — «nima o'chadi» ro'yxati
    // ko'rsatilsa kassir uni bo'ladigan ish deb o'qirdi.
    cascadeText: canDelete ? join(preflight.cascade ?? []) : '',
  };
}
