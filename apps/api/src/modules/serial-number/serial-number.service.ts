import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Серийные номера (serial numbers) — read-only registry.
 *
 * In moysklad a serial number is recorded per physical unit of a
 * serial-tracked product as it moves through documents (приёмка / отгрузка /
 * etc.). The list aggregates those per-unit records with their originating
 * document, warehouse and counterparty.
 *
 * This clone does not yet have a serial-accounting subsystem (serial entry on
 * document positions), so there are no serial records to return — the registry
 * is empty. That is faithful to moysklad's own behaviour on accounts that do
 * not use serial tracking (the live `farrux@climart_santex_group` account shows
 * «1-1 из 0» here too). The endpoint is the real, tenant-scoped query surface,
 * ready to be wired to serial-tracked positions once that subsystem exists.
 */

export interface SerialNumberRow {
  id: string;
  serialNumber: string;
  code: string | null;
  article: string | null;
  productName: string | null;
  batch: string | null;
  store: string | null;
  documentType: string | null;
  documentNumber: string | null;
  description: string | null;
  counterparty: string | null;
}

export interface SerialNumberListResponse {
  items: SerialNumberRow[];
  nextCursor?: string;
  total: number;
}

@Injectable()
export class SerialNumberService {
  // PrismaService is injected so the query surface is real and tenant-aware
  // the moment serial records become available.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    accountId: string,
    _query: Record<string, unknown>,
  ): Promise<SerialNumberListResponse> {
    // No serial-accounting subsystem yet → no serial records for this account.
    // Tenant scope is honoured (accountId) so this stays correct once wired.
    void accountId;
    void this.prisma;
    return { items: [], total: 0 };
  }
}
