import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

/**
 * Read-only reference endpoints for pickers:
 *   /organizations, /stores, /organization-accounts, /cash-desks — simple
 *   list by accountId, active-only.
 *
 * Kept minimal (no CRUD) — full management lives in Admin Settings (Sprint 10).
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ReferenceController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('organization-accounts')
  async organizationAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('currency') currency?: string,
    @Query('search') search?: string,
  ) {
    const items = await this.prisma.client.organizationAccount.findMany({
      where: {
        accountId: user.accountId,
        archived: false,
        ...(organizationId ? { organizationId } : {}),
        ...(currency ? { currency } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { bankName: { contains: search, mode: 'insensitive' } },
                { accountNumber: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      take: 100,
      select: {
        id: true,
        name: true,
        isDefault: true,
        currency: true,
        bankName: true,
        accountNumber: true,
        bic: true,
        balanceMinor: true,
        organization: { select: { id: true, name: true } },
      },
    });
    return {
      items: items.map((i) => ({ ...i, balanceMinor: i.balanceMinor.toString() })),
      total: items.length,
    };
  }

  @Get('cash-desks')
  async cashDesks(
    @CurrentUser() user: AuthenticatedUser,
    @Query('currency') currency?: string,
    @Query('search') search?: string,
  ) {
    const items = await this.prisma.client.cashDesk.findMany({
      where: {
        accountId: user.accountId,
        archived: false,
        ...(currency ? { currency } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, currency: true, balanceMinor: true },
    });
    return {
      items: items.map((i) => ({ ...i, balanceMinor: i.balanceMinor.toString() })),
      total: items.length,
    };
  }

  @Get('organizations')
  async organizations(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    const items = await this.prisma.client.organization.findMany({
      where: {
        accountId: user.accountId,
        archived: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { legalTitle: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        legalTitle: true,
        companyType: true,
        uzRequisites: true,
      },
    });
    return { items, total: items.length };
  }

  @Get('stores')
  async stores(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    const items = await this.prisma.client.store.findMany({
      where: {
        accountId: user.accountId,
        archived: false,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, code: true, address: true },
    });
    return { items, total: items.length };
  }

  // «Группа»/«Отдел» picker (GET /groups) moved to GroupModule (group.controller)
  // which now owns the full CRUD; the GET shape is unchanged so every picker that
  // fetched /groups keeps working.

  /**
   * Employee picker — used by 6+ list pages for the "owner" filter (Demand,
   * Customer-Order, Cash-In/Out, Payment-In/Out, Invoice-Out). Until this
   * existed, every dropdown silently 404'd and the page degraded to "no
   * results", which the user perceived as a broken filter. Same shape as
   * the other reference endpoints — returns minimal columns the picker
   * UI binds to.
   */
  @Get('employees')
  async employees(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    const items = await this.prisma.client.employee.findMany({
      where: {
        accountId: user.accountId,
        archived: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { position: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take,
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        archived: true,
      },
    });
    return { items, total: items.length };
  }

  /**
   * Bank-account picker — needed by /payments-in /payments-out forms to
   * choose which org account the money lands on. Reuses the
   * organization-account model (no separate `BankAccount` entity); same
   * shape as `/organization-accounts` but exposed at `/bank-accounts` so
   * pages can pick by intuitive name.
   */
  @Get('bank-accounts')
  async bankAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('currency') currency?: string,
    @Query('search') search?: string,
  ) {
    const items = await this.prisma.client.organizationAccount.findMany({
      where: {
        accountId: user.accountId,
        archived: false,
        ...(organizationId ? { organizationId } : {}),
        ...(currency ? { currency } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { bankName: { contains: search, mode: 'insensitive' } },
                { accountNumber: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      take: 100,
      select: {
        id: true,
        name: true,
        isDefault: true,
        currency: true,
        bankName: true,
        accountNumber: true,
        bic: true,
        balanceMinor: true,
        organization: { select: { id: true, name: true } },
      },
    });
    return {
      items: items.map((i) => ({ ...i, balanceMinor: i.balanceMinor.toString() })),
      total: items.length,
    };
  }
}
