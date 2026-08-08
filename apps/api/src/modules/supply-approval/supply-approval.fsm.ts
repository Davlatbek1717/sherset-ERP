import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Qabul-tasdiqlash workflow — toza state-machine (2026-07-29 spec).
 * FSM `state`/`applicable`dan ortogonal. Barcha bosqich-o'tish qoidalari SHU YERDA
 * (service faqat yupqa Prisma-I/O). Zanjir: taminotchi → omborchi → admin → stock.
 */

export const APPROVAL_STAGES = [
  'none',
  'awaiting_supplier',
  'delivering',
  'awaiting_admin',
  'completed',
] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

export type ForwardAction = 'send' | 'supplier_ok' | 'omborchi_ok' | 'admin_ok';
export type ApprovalAction = ForwardAction | 'reject';
export type ActorType = 'supplier' | 'omborchi' | 'admin' | 'system';

/** Har forward-action qaysi bosqichdan qaysisiga o'tishi. */
export const FORWARD: Record<ForwardAction, { from: ApprovalStage; to: ApprovalStage }> = {
  send: { from: 'none', to: 'awaiting_supplier' },
  supplier_ok: { from: 'awaiting_supplier', to: 'delivering' },
  omborchi_ok: { from: 'delivering', to: 'awaiting_admin' },
  admin_ok: { from: 'awaiting_admin', to: 'completed' },
};

/** Reject: rad etsa bo'ladigan har bosqich → oldingisiga. */
const BACK: Partial<Record<ApprovalStage, ApprovalStage>> = {
  awaiting_supplier: 'none',
  delivering: 'awaiting_supplier',
  awaiting_admin: 'delivering',
};

/**
 * Faza 14 (`PP-06`): tasdiq zanjiri UCHIB TURGAN bosqichlar — taminotchiga
 * yuborilgandan admin yakuniy tasdig'igacha. Shu oraliqda hujjat MUZLAYDI:
 * `post`/`update`/`delete` bloklanadi (aks holda `draft`+`applicable:false`
 * bo'lgani uchun ular ochiq turardi va omborchi sanaganidan keyin sonlar
 * sezdirmasdan o'zgartirilishi mumkin edi).
 *
 * To'ldiruvchisi — {`none`, `completed`}: zanjir hali boshlanmagan yoki
 * allaqachon tugagan qabul odatdagi hujjat sifatida ishlaydi.
 */
export const IN_FLIGHT_STAGES = ['awaiting_supplier', 'delivering', 'awaiting_admin'] as const;

/** `stage` tasdiq zanjirining o'rtasidami (hujjat muzlaganmi)? */
export function isApprovalInFlight(stage: string | null | undefined): boolean {
  return (IN_FLIGHT_STAGES as readonly string[]).includes(stage ?? 'none');
}

export function forwardTarget(action: ForwardAction, current: ApprovalStage): ApprovalStage {
  const step = FORWARD[action];
  if (step.from !== current) {
    throw new ConflictException(
      `Noto'g'ri bosqich: '${action}' faqat '${step.from}'da mumkin (joriy: '${current}')`,
    );
  }
  return step.to;
}

export function rejectTarget(current: ApprovalStage): ApprovalStage {
  const prev = BACK[current];
  if (!prev) throw new ConflictException(`'${current}' bosqichini rad etib bo'lmaydi`);
  return prev;
}

export interface QtyAdjustment {
  positionId: string;
  quantity: string;
}
export interface AdjustmentDetail {
  positionId: string;
  was: string;
  now: string;
}

/** Omborchi sanagan miqdorlar uchun audit-detali — FAQAT o'zgargan qatorlar. */
export function diffAdjustments(
  positions: { id: string; quantity: string }[],
  adjustments: QtyAdjustment[],
): AdjustmentDetail[] {
  const byId = new Map(positions.map((p) => [p.id, p.quantity]));
  const out: AdjustmentDetail[] = [];
  for (const a of adjustments) {
    const was = byId.get(a.positionId);
    if (was === undefined) throw new BadRequestException(`Pozitsiya topilmadi: ${a.positionId}`);
    if (was !== a.quantity) out.push({ positionId: a.positionId, was, now: a.quantity });
  }
  return out;
}
