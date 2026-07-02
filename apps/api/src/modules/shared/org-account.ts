import type { PrismaClient } from '@moysklad/db';
import { BadRequestException } from '@nestjs/common';

/**
 * Money-integrity guard for the organization ↔ bank-account link.
 *
 * Every money / sales / purchase document stores both `organizationId` (the legal
 * entity the document belongs to) and an optional `organizationAccountId` (which
 * of that organization's bank accounts the money posts to). An OrganizationAccount
 * belongs to exactly one organization, so the two MUST refer to the same org:
 * attaching organization B's account to organization A's document would post funds
 * to the wrong legal entity — a silent money-integrity defect.
 *
 * Historically the account picker did not scope its list by the chosen
 * organization, and no service validated the pair, so a cross-org (or even, via
 * Prisma `connect`, a cross-tenant) account could be persisted. This guard closes
 * both holes: it confirms the account exists within the caller's tenant
 * (`accountId`) AND that its `organizationId` matches the document's.
 *
 * No-op when `organizationAccountId` is null/undefined — the field is optional on
 * every document. Throws BadRequestException otherwise.
 *
 * Call it BEFORE the write (create/update). It is a read-only validation, so it is
 * safe to run outside the document's transaction — pass `this.prisma.client`.
 */
export async function assertOrgAccountMatchesOrg(
  db: Pick<PrismaClient, 'organizationAccount'>,
  accountId: string,
  organizationId: string,
  organizationAccountId: string | null | undefined,
): Promise<void> {
  if (!organizationAccountId) return;
  const account = await db.organizationAccount.findFirst({
    where: { id: organizationAccountId, accountId },
    select: { organizationId: true },
  });
  if (!account) throw new BadRequestException('Hisob raqami topilmadi');
  if (account.organizationId !== organizationId) {
    throw new BadRequestException('Tanlangan hisob raqami tashkilotga tegishli emas');
  }
}

/**
 * Money-integrity guard for the counterparty ↔ bank-account link — the agent-side
 * mirror of {@link assertOrgAccountMatchesOrg}. A document stores `agentId` (the
 * counterparty) and an optional `agentAccountId` (which of that counterparty's
 * bank accounts the settlement is tied to). A CounterpartyAccount belongs to one
 * counterparty, so the two MUST match: attaching counterparty B's account to a
 * document for counterparty A routes the settlement to the wrong party — the same
 * silent money-routing defect the org guard prevents. It also confirms the account
 * is in the caller's tenant (`accountId`), closing the cross-tenant scalar-FK hole.
 *
 * No-op when `agentAccountId` is null/undefined (optional field). Read-only — call
 * BEFORE the write, safe outside the document transaction (`this.prisma.client`).
 */
export async function assertAgentAccountMatchesAgent(
  db: Pick<PrismaClient, 'counterpartyAccount'>,
  accountId: string,
  agentId: string,
  agentAccountId: string | null | undefined,
): Promise<void> {
  if (!agentAccountId) return;
  const account = await db.counterpartyAccount.findFirst({
    where: { id: agentAccountId, accountId },
    select: { counterpartyId: true },
  });
  if (!account) throw new BadRequestException('Hisob raqami topilmadi');
  if (account.counterpartyId !== agentId) {
    throw new BadRequestException('Tanlangan hisob raqami kontragentga tegishli emas');
  }
}
