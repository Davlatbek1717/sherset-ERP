import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { DebtNoteKind } from '../../debt/debt.schema.js';
import { type ActorRole, DebtService } from '../../debt/debt.service.js';
import { SALE_DEBT_SOURCE_DOC_TYPE } from '../../debt/sale-debt-registry.js';
import {
  type CollectionDebtInput,
  type CollectionResponsible,
  type CollectionRow,
  type CollectionSummary,
  buildCollectionList,
  filterCollectionRowsBySource,
  isRemindedOn,
  summarizeCollection,
} from './debt-collection.js';
import type { CollectionQuery, CollectionRemindInput } from './manager-collection.schema.js';

/**
 * MK16 — undirish ro'yxatining I/O qatlami. **Qoidalar bu yerda emas** —
 * ular sof `debt-collection.ts` da (22 test). Bu yerda faqat Prisma o'qishlari
 * va mavjud jo'natgichga delegatsiya.
 *
 * **Ikki yangi narsa OCHILMADI:**
 *  · Yangi qarz manbai yo'q — qatorlar mavjud `Debt` daftaridan.
 *  · Yangi jo'natgich yo'q — `DebtService.sendBulkReminders` (SMS/Telegram)
 *    chaqiriladi: shablonlar, kontakt ma'lumoti, kanal xatolari o'sha yerda
 *    hal qilinadi va o'sha yerda sinalgan.
 *
 * **Q4 (2026-08-25) — MANBA ustuni.** Qator endi «bu qarz qayerdan keldi»
 * ni ham aytadi (`Debt.sourceDocType` → `registry | retailsale`) va chek
 * RAQAMI hujjatning o'zidan bitta yig'ma so'rov bilan o'qiladi. Bu **yangi
 * qarz manbai OCHMAYDI**: ro'yxat hamon FAQAT `Debt` reyestridan yuradi —
 * kontragent SALDOSI jadvaliga bu faylda bir marta ham murojaat qilinmaydi
 * (A3 ning qo'riqchi testi buni mexanik qulflaydi, shuning uchun o'sha
 * delegatning nomi bu izohda ham ATAYLAB yozilmagan), ya'ni avansli mijoz
 * bu yerga tusha olmaydi.
 *
 * **Idempotentlik jurnali — yangi jadval EMAS:** eslatma mavjud `DebtNote`
 * jurnaliga `kind='reminder'` bilan yoziladi. Shu tanlovning ikki foydasi bor:
 * (1) migratsiya kerak emas, (2) eslatma qarzning MULOQOT TARIXIDA operator
 * ko'radigan joyda paydo bo'ladi — «oxirgi aloqa» endi eslatmani ham hisobga
 * oladi. `recomputeLastCall` faqat `kind='call'` ni o'qiydi, shuning uchun
 * yangi tur qo'ng'iroq natijasini BUZMAYDI.
 *
 * **Jurnal FAQAT haqiqatan ketgan xabarga yoziladi.** Aks holda telefoni
 * yo'qligi sababli o'tkazib yuborilgan qarz «bugun eslatilgan» bo'lib qolar
 * va operator raqamni to'g'irlagach ham bugun qayta urina olmasdi.
 */
@Injectable()
export class DebtCollectionService {
  private readonly logger = new Logger(DebtCollectionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DebtService) private readonly debts: DebtService,
  ) {}

  /**
   * Ish ro'yxati. `now` argument sifatida kiradi (test muzlatilgan vaqt bilan
   * ishlaydi); HTTP qatlami uni bermaydi ⇒ `new Date()`.
   */
  async list(
    accountId: string,
    query: CollectionQuery,
    now: Date = new Date(),
  ): Promise<{
    rows: CollectionRow[];
    summary: CollectionSummary;
    totalCount: number;
    truncated: boolean;
    generatedAt: string;
  }> {
    // Faqat FAOL qarzlar: yopilganlar so'rovdayoq chiqib ketadi (qoldiq
    // bo'yicha ikkinchi filtr sof qatlamda — status eskirgan bo'lsa ham
    // yolg'on qator chiqmasin).
    const debts = await this.prisma.client.debt.findMany({
      where: {
        accountId,
        deletedAt: null,
        status: { in: ['unpaid', 'partial'] },
        ...(query.problemOnly ? { problem: true } : {}),
        ...(query.responsibleId
          ? {
              OR: [{ ownerId: query.responsibleId }, { issuedById: query.responsibleId }],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        counterpartyId: true,
        totalMinor: true,
        paidMinor: true,
        currency: true,
        status: true,
        problem: true,
        nextContactAt: true,
        lastCallAt: true,
        lastCallOutcome: true,
        // Q4 — «bu qarz qayerdan keldi» (Q1 migratsiyasi qo'ygan bog'lam).
        sourceDocType: true,
        sourceDocId: true,
        counterparty: { select: { name: true, phone: true } },
        owner: { select: { id: true, name: true } },
        issuedBy: { select: { id: true, name: true } },
      },
    });

    const debtIds = debts.map((d) => d.id);
    // Ikki alohida yig'ma: (a) har turdagi eng yangi izoh — «oxirgi aloqa»,
    // (b) faqat eslatma yozuvlari — idempotentlik oynasi.
    const [noteMax, reminderMax, saleNames] = await Promise.all([
      this.latestNoteByDebt(accountId, debtIds, null),
      this.latestNoteByDebt(accountId, debtIds, 'reminder'),
      // Q4 — chek RAQAMI hujjatning o'zidan (`Debt.comment` matnidan EMAS).
      this.saleNamesByDebtSource(accountId, debts),
    ]);

    const inputs: CollectionDebtInput[] = debts.map((d) => ({
      id: d.id,
      name: d.name,
      counterpartyId: d.counterpartyId,
      counterpartyName: d.counterparty?.name ?? '',
      counterpartyPhone: d.counterparty?.phone ?? null,
      totalMinor: d.totalMinor,
      paidMinor: d.paidMinor,
      currency: d.currency,
      status: d.status,
      problem: d.problem,
      nextContactAt: d.nextContactAt,
      lastCallAt: d.lastCallAt,
      lastCallOutcome: d.lastCallOutcome,
      lastNoteAt: noteMax.get(d.id) ?? null,
      lastReminderAt: reminderMax.get(d.id) ?? null,
      responsible: resolveResponsible(d.owner, d.issuedBy),
      sourceDocType: d.sourceDocType,
      sourceDocId: d.sourceDocId,
      // Chek o'chirilgan/topilmagan bo'lsa `null` — ekran shunda faqat
      // manba belgisini ko'rsatadi, xom id chizmaydi.
      sourceDocNumber: (d.sourceDocId && saleNames.get(d.sourceDocId)) || null,
    }));

    let rows = buildCollectionList(inputs, now);
    // `due` — menejerning bugungi ishi: muddati kelgan/o'tgan + MUDDATSIZLAR.
    // Muddatsizlar ataylab qoladi: ular «keyinroq» deb isbotlanmagan, aksincha
    // muddat qo'yilmagani o'zi ish (ma'lumot-sifati signali).
    if (query.scope === 'due') {
      rows = rows.filter((r) => r.overdueDays === null || r.overdueDays >= 0);
    }
    // Q4 — MANBA kesimi. Sof qatlamda (`scope` bilan bir joyda) va SQL'da
    // EMAS: `registry` = «`retailsale` EMAS» va u NULL larni ham qamraydi,
    // SQL'dagi `<> 'retailsale'` esa NULL larni chiqarib tashlardi.
    rows = filterCollectionRowsBySource(rows, query.source);

    const totalCount = rows.length;
    const truncated = totalCount > query.limit;
    if (truncated) rows = rows.slice(0, query.limit);

    return {
      rows,
      // Jam KESILGANDAN KEYINGI qatorlar bo'yicha — ekrandagi son bilan
      // ekrandagi qatorlar doim mos keladi.
      summary: summarizeCollection(rows),
      totalCount,
      truncated,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Tanlangan qarzlarga eslatma. Uch bosqich: nomzodlarni tekshirish →
   * mavjud jo'natgichga delegatsiya → HAQIQATAN ketganini jurnalga yozish.
   */
  async remind(
    accountId: string,
    userId: string,
    role: ActorRole,
    input: CollectionRemindInput,
    now: Date = new Date(),
  ): Promise<{
    requested: number;
    queued: number;
    journaled: number;
    skipped: Array<{ debtId: string; name: string; reason: string }>;
  }> {
    const requestedIds = [...new Set(input.debtIds)];
    const skipped: Array<{ debtId: string; name: string; reason: string }> = [];

    const debts = await this.prisma.client.debt.findMany({
      where: {
        id: { in: requestedIds },
        accountId,
        deletedAt: null,
        status: { in: ['unpaid', 'partial'] },
      },
      select: { id: true, name: true, counterparty: { select: { name: true } } },
    });
    const byId = new Map(debts.map((d) => [d.id, d]));

    // Yopilgan / o'chirilgan / begona akkaunt qarzi — jimgina yo'qolmaydi.
    for (const id of requestedIds) {
      if (!byId.has(id)) skipped.push({ debtId: id, name: '', reason: 'not_found_or_settled' });
    }

    const reminderMax = await this.latestNoteByDebt(
      accountId,
      debts.map((d) => d.id),
      'reminder',
    );

    const candidateIds: string[] = [];
    for (const d of debts) {
      const name = d.counterparty?.name ?? d.name;
      if (isRemindedOn(reminderMax.get(d.id) ?? null, now)) {
        skipped.push({ debtId: d.id, name, reason: 'reminded_today' });
        continue;
      }
      candidateIds.push(d.id);
    }

    if (candidateIds.length === 0) {
      return { requested: requestedIds.length, queued: 0, journaled: 0, skipped };
    }

    const result = await this.debts.sendBulkReminders(accountId, userId, {
      ids: candidateIds,
      channel: input.channel,
      templateId: input.templateId,
    });

    const failedIds = new Set(result.skipped.map((s) => s.id));
    for (const s of result.skipped) {
      skipped.push({ debtId: s.id, name: s.name, reason: s.reason });
    }
    const sentIds = candidateIds.filter((id) => !failedIds.has(id));

    // Invariant: nomzod = ketgan + o'tkazilgan. Buzilsa — jo'natgich shakli
    // o'zgargan; jurnal baribir `sentIds` bo'yicha yoziladi (mijozga IKKINCHI
    // xabar ketishi — bloklangan urinishdan ko'ra og'irroq xato).
    if (sentIds.length !== result.queued) {
      this.logger.warn(
        `MK16 eslatma hisobi mos kelmadi: queued=${result.queued}, xulosa=${sentIds.length} ` +
          `(nomzod=${candidateIds.length}, o'tkazilgan=${result.skipped.length})`,
      );
    }

    if (sentIds.length > 0) {
      await this.prisma.client.debtNote.createMany({
        data: sentIds.map((debtId) => ({
          accountId,
          debtId,
          text: reminderNoteText(input.channel),
          authorId: userId,
          authorRole: role,
          kind: 'reminder' satisfies DebtNoteKind,
        })),
      });
    }

    return {
      requested: requestedIds.length,
      queued: result.queued,
      journaled: sentIds.length,
      skipped,
    };
  }

  /**
   * Q4 — kassa chekidan tug'ilgan qatorlar uchun CHEK RAQAMI (`saleId → name`).
   *
   * Bitta yig'ma so'rov (N+1 yo'q); chekdan kelmagan qatorlar so'rovga umuman
   * kirmaydi va ro'yxat butunlay reyestr qatorlaridan iborat bo'lsa so'rov
   * YUBORILMAYDI ham.
   *
   * ⚠️ Raqam `Debt.comment` matnidan O'QILMAYDI (u yerda ham bor —
   * «Kassa cheki «CHK-…» bo'yicha qarz»): izoh erkin matn va uni operator
   * tahrirlashi mumkin, hujjat esa yolg'on gapirmaydi (Q3 ning 5-eslatmasi).
   *
   * ⚠️ `accountId` filtri MAJBURIY — `sourceDocId` boshqa akkauntning
   * chekiga ishora qilishi mumkin emas, lekin buni so'rov O'ZI kafolatlaydi,
   * izoh emas.
   */
  private async saleNamesByDebtSource(
    accountId: string,
    debts: Array<{ sourceDocType: string | null; sourceDocId: string | null }>,
  ): Promise<Map<string, string>> {
    const saleIds = [
      ...new Set(
        debts
          .filter((d) => d.sourceDocType === SALE_DEBT_SOURCE_DOC_TYPE && d.sourceDocId)
          .map((d) => d.sourceDocId as string),
      ),
    ];
    if (saleIds.length === 0) return new Map();
    const sales = await this.prisma.client.retailSale.findMany({
      where: { accountId, id: { in: saleIds } },
      select: { id: true, name: true },
    });
    return new Map(sales.map((s) => [s.id, s.name]));
  }

  /**
   * Har qarz uchun eng yangi (bekor qilinmagan) izoh vaqti. `kind=null` ⇒
   * har turdagi izoh; aks holda faqat berilgan tur.
   */
  private async latestNoteByDebt(
    accountId: string,
    debtIds: string[],
    kind: DebtNoteKind | null,
  ): Promise<Map<string, Date>> {
    if (debtIds.length === 0) return new Map();
    const rows = await this.prisma.client.debtNote.groupBy({
      by: ['debtId'],
      where: {
        accountId,
        debtId: { in: debtIds },
        canceledAt: null,
        ...(kind ? { kind } : {}),
      },
      _max: { createdAt: true },
    });
    const out = new Map<string, Date>();
    for (const r of rows) {
      if (r._max.createdAt) out.set(r.debtId, r._max.createdAt);
    }
    return out;
  }
}

/**
 * Javobgar: avval qarzga biriktirilgan MAS'UL, u yo'q bo'lsa qarzni BERGAN
 * xodim. Ikkovi ham yo'q ⇒ `null` — «javobgarsiz» holat yashirilmaydi.
 */
function resolveResponsible(
  owner: { id: string; name: string } | null,
  issuedBy: { id: string; name: string } | null,
): CollectionResponsible | null {
  if (owner) return { id: owner.id, name: owner.name, role: 'owner' };
  if (issuedBy) return { id: issuedBy.id, name: issuedBy.name, role: 'issuer' };
  return null;
}

/** Muloqot tarixida ko'rinadigan jurnal matni. */
function reminderNoteText(channel: 'sms' | 'telegram'): string {
  return channel === 'sms'
    ? 'Qarz eslatmasi yuborildi (SMS) — undirish ro’yxatidan'
    : 'Qarz eslatmasi yuborildi (Telegram) — undirish ro’yxatidan';
}
