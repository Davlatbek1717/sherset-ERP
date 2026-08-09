import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  decryptBuffer,
  decryptPassword,
  encryptBuffer,
  encryptPassword,
  isEncryptedBuffer,
} from '../email/crypto.js';
import {
  CreateEdoSubmissionSchema,
  ListEdoSubmissionsSchema,
  type SaveEdoConfigInput,
  SaveEdoConfigSchema,
} from './edo.schema.js';
import { type EhfPayload, buildEhfXml } from './ehf-builder.js';

interface PublicEdoConfig {
  id: string;
  provider: string;
  stir: string;
  orgNameCyrl: string;
  apiBaseUrl: string;
  hasApiToken: boolean;
  hasPfx: boolean;
  testMode: boolean;
  enabled: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMsg: string | null;
}

/**
 * EdoService — Soliq.uz / Didox EDO integration.
 *
 * Pipeline:
 *   1. createDraft(sourceEntity, sourceEntityId) — server reads source
 *      doc, builds EhfPayload, calls buildEhfXml → stores XML in
 *      EdoSubmission.xmlBody with status='draft'.
 *   2. sign(submissionId) — calls signer with cached PFX → status='signed'.
 *   3. submit(submissionId) — POSTs signed XML to provider →
 *      status='sent', captures providerEhfId.
 *   4. Background poller checks delivery status → 'delivered' / 'confirmed'
 *      / 'rejected'.
 *
 * V1 supports steps 1 (XML build) end-to-end and 2-4 as scaffolding —
 * the actual signer + provider HTTP calls are stubbed (`Method not yet
 * configured` errors) until ECP credentials and provider API token are
 * wired by the operator. This is intentional: it lets the workflow be
 * validated and the UI built before live PKI integration.
 */
@Injectable()
export class EdoService {
  private readonly logger = new Logger(EdoService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // --- config -----------------------------------------------------------

  async getConfig(accountId: string): Promise<PublicEdoConfig | null> {
    const row = await this.prisma.client.edoConfig.findUnique({ where: { accountId } });
    if (!row) return null;
    return this.publicView(row);
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicEdoConfig> {
    const r = SaveEdoConfigSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data as SaveEdoConfigInput;
    const existing = await this.prisma.client.edoConfig.findUnique({ where: { accountId } });

    const apiTokenCipher =
      parsed.apiToken && parsed.apiToken.length > 0 ? encryptPassword(parsed.apiToken) : undefined;
    const pfxPassCipher =
      parsed.pfxPass && parsed.pfxPass.length > 0 ? encryptPassword(parsed.pfxPass) : undefined;

    const data = {
      accountId,
      provider: parsed.provider,
      stir: parsed.stir,
      orgNameCyrl: parsed.orgNameCyrl,
      apiBaseUrl: parsed.apiBaseUrl,
      ...(apiTokenCipher !== undefined ? { apiTokenCipher } : {}),
      ...(pfxPassCipher !== undefined ? { pfxPassCipher } : {}),
      testMode: parsed.testMode,
      lastTestedAt: null,
      lastTestOk: null,
      lastTestMsg: null,
    };

    const saved = existing
      ? await this.prisma.client.edoConfig.update({ where: { accountId }, data })
      : await this.prisma.client.edoConfig.create({ data });
    return this.publicView(saved);
  }

  async deleteConfig(accountId: string): Promise<{ ok: true }> {
    await this.prisma.client.edoConfig.deleteMany({ where: { accountId } });
    return { ok: true };
  }

  /**
   * Upload PFX bytes (binary). Both the key material and its password are
   * AES-256-GCM encrypted at rest under `EMAIL_ENCRYPTION_KEY`
   * (`email/crypto.ts` — shared envelope, `encryptBuffer` for the blob).
   *
   * Before Faza 24 the comment claimed this while writing `pfxBytes` raw:
   * a DB dump handed over the ECP private key, i.e. the ability to legally
   * sign tax documents. Rows written back then stay readable —
   * `loadSignerMaterial` detects the missing envelope; see `INT-06`.
   */
  async setPfx(
    accountId: string,
    pfxBytes: Buffer,
    pfxPass: string,
  ): Promise<{ ok: true; bytes: number }> {
    const cfg = await this.requireConfig(accountId);
    await this.prisma.client.edoConfig.update({
      where: { accountId: cfg.accountId },
      data: {
        pfxCipher: encryptBuffer(pfxBytes),
        pfxPassCipher: encryptPassword(pfxPass),
      },
    });
    // Report the real key size, not the envelope size.
    return { ok: true, bytes: pfxBytes.length };
  }

  /**
   * Decrypted signer material for the GOST signer. The only read path for
   * `pfxCipher` — keep it that way so the plaintext key never spreads.
   *
   * `legacyPlaintext: true` means the row predates Faza 24 (stored raw);
   * it is returned as-is so signing keeps working, and re-uploading the
   * PFX migrates it. Callers must not log `pfx`/`pass`.
   */
  async loadSignerMaterial(
    accountId: string,
  ): Promise<{ pfx: Buffer; pass: string; legacyPlaintext: boolean }> {
    const cfg = await this.requireConfig(accountId);
    if (!cfg.pfxCipher || !cfg.pfxPassCipher) {
      throw new BadRequestException('ECP fayl yuklanmagan — avval PFX ni yuklang');
    }
    const stored = Buffer.from(cfg.pfxCipher);
    const legacyPlaintext = !isEncryptedBuffer(stored);
    if (legacyPlaintext) {
      this.logger.warn(
        `EDO PFX for account ${accountId} is stored UNENCRYPTED (pre-Faza-24 row) — re-upload the PFX to encrypt it at rest`,
      );
    }
    return {
      pfx: legacyPlaintext ? stored : decryptBuffer(stored),
      pass: decryptPassword(cfg.pfxPassCipher),
      legacyPlaintext,
    };
  }

  // --- submission lifecycle --------------------------------------------

  async listSubmissions(accountId: string, raw: unknown) {
    const filter = ListEdoSubmissionsSchema.parse(raw);
    const where: Prisma.EdoSubmissionWhereInput = {
      accountId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.sourceEntity ? { sourceEntity: filter.sourceEntity } : {}),
      ...(filter.buyerStir ? { buyerStir: filter.buyerStir } : {}),
    };
    const rows = await this.prisma.client.edoSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, nextCursor };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.edoSubmission.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`EdoSubmission ${id} not found`);
    return row;
  }

  /**
   * Create or refresh the draft submission for a source document. If a
   * row already exists for (sourceEntity, sourceEntityId) and is still
   * 'draft', regenerates XML; otherwise returns the existing row.
   *
   * V1 implementation builds XML for FactureOut. Demand/InvoiceOut paths
   * are reserved (return BadRequest until their factoring helpers ship).
   */
  async createDraft(accountId: string, raw: unknown) {
    const r = CreateEdoSubmissionSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const { sourceEntity, sourceEntityId } = r.data;
    const cfg = await this.requireConfig(accountId);

    const existing = await this.prisma.client.edoSubmission.findUnique({
      where: {
        accountId_sourceEntity_sourceEntityId: {
          accountId,
          sourceEntity,
          sourceEntityId,
        },
      },
    });

    const payload = await this.assemblePayload(accountId, cfg, sourceEntity, sourceEntityId);
    const xml = buildEhfXml(payload);

    if (existing && existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new BadRequestException(
        `EHF allaqachon ${existing.status} holatida — qayta yaratib bo'lmaydi`,
      );
    }

    const row = existing
      ? await this.prisma.client.edoSubmission.update({
          where: { id: existing.id },
          data: {
            xmlBody: xml,
            buyerStir: payload.buyer.tin,
            status: 'draft',
            errorMsg: null,
          },
        })
      : await this.prisma.client.edoSubmission.create({
          data: {
            accountId,
            sourceEntity,
            sourceEntityId,
            xmlBody: xml,
            buyerStir: payload.buyer.tin,
            status: 'draft',
          },
        });
    return row;
  }

  /**
   * Sign the draft XML with ECP. V1 stubs the actual GOST signature —
   * once an `EdoSigner` provider is wired (native module / external
   * sign service), this method calls it. For now: refuses without
   * PFX present, marks signed=true with a placeholder signature.
   */
  async sign(accountId: string, submissionId: string) {
    const submission = await this.findById(accountId, submissionId);
    if (submission.status !== 'draft' && submission.status !== 'rejected') {
      throw new BadRequestException(
        `Imzolab bo'lmaydi: ${submission.status} → signed. Faqat draft yoki rejected dan`,
      );
    }
    // Decrypts here (not just a presence check) so a key that cannot be
    // opened fails at sign time with a clear error instead of at the first
    // live provider call.
    const material = await this.loadSignerMaterial(accountId);
    if (!submission.xmlBody) {
      throw new BadRequestException('Draft XML topilmadi — qayta yarating');
    }

    // V1 stub — placeholder until GOST signer is wired.
    // Real impl: signer(submission.xmlBody, material.pfx, material.pass)
    // (native addon, external service, or pure-TS GOST 34.10/34.11).
    void material;
    const placeholderSig = Buffer.from(`UNSIGNED-V1-${submission.id}`).toString('base64');

    return this.prisma.client.edoSubmission.update({
      where: { id: submission.id },
      data: {
        signatureB64: placeholderSig,
        status: 'signed',
        signedAt: new Date(),
      },
    });
  }

  /**
   * Submit signed XML to the EDO provider. V1 stubs the network call;
   * once `apiToken` is available, this POSTs to didox/edocs and stores
   * the returned EHF id.
   */
  async submit(accountId: string, submissionId: string) {
    const submission = await this.findById(accountId, submissionId);
    if (submission.status !== 'signed') {
      throw new BadRequestException(
        `Yuborib bo'lmaydi: ${submission.status} → sent. Faqat signed dan`,
      );
    }
    const cfg = await this.requireConfig(accountId);
    if (!cfg.apiTokenCipher) {
      // Mark as sent in test mode anyway — provider integration deferred.
      this.logger.warn(
        `EDO submit ${submissionId}: API token missing, marking as sent (test mode)`,
      );
      return this.prisma.client.edoSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          providerEhfId: `STUB-${submission.id.slice(0, 8)}`,
          providerLog: { stub: true, reason: 'no_api_token' },
        },
      });
    }

    // Real impl placeholder — actual fetch() to provider goes here.
    // Decrypt token: const token = decryptPassword(cfg.apiTokenCipher);
    // For now, mark sent with a placeholder log entry.
    return this.prisma.client.edoSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        providerEhfId: `STUB-${submission.id.slice(0, 8)}`,
        providerLog: { stub: true, note: 'provider HTTP not yet wired' },
      },
    });
  }

  /** Manual cancel — provider must support cancel for delivered EHFs. */
  async cancel(accountId: string, submissionId: string, reason: string) {
    const submission = await this.findById(accountId, submissionId);
    if (submission.status === 'cancelled') {
      throw new BadRequestException('Allaqachon cancel qilingan');
    }
    return this.prisma.client.edoSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'cancelled',
        errorMsg: reason.slice(0, 500),
      },
    });
  }

  // --- helpers ----------------------------------------------------------

  /**
   * Build the EhfPayload from the source document. V1 supports FactureOut
   * (not yet shipped) and InvoiceOut (existing) as a pragmatic fallback —
   * the EHF references the InvoiceOut data when no FactureOut row exists.
   */
  private async assemblePayload(
    accountId: string,
    cfg: { stir: string; orgNameCyrl: string },
    sourceEntity: string,
    sourceEntityId: string,
  ): Promise<EhfPayload> {
    if (
      sourceEntity !== 'InvoiceOut' &&
      sourceEntity !== 'Demand' &&
      sourceEntity !== 'FactureOut'
    ) {
      throw new BadRequestException(
        `Source entity ${sourceEntity} EHF builderda qo'llab-quvvatlanmaydi`,
      );
    }

    if (sourceEntity === 'InvoiceOut') {
      const inv = await this.prisma.client.invoiceOut.findFirst({
        where: { id: sourceEntityId, accountId },
        include: { agent: true, organization: true, positions: { include: { product: true } } },
      });
      if (!inv) throw new NotFoundException(`InvoiceOut ${sourceEntityId} topilmadi`);
      const sellerTin = (inv.organization as { stir?: string | null }).stir ?? cfg.stir;
      const buyerTin = (inv.agent as { stir?: string | null }).stir ?? '';
      if (!buyerTin) {
        throw new BadRequestException("Xaridor STIR'i belgilanmagan");
      }
      return {
        facturaId: inv.id,
        facturaNo: inv.name,
        facturaDate: inv.moment,
        facturaType: 1,
        seller: { tin: sellerTin, nameCyrl: cfg.orgNameCyrl },
        buyer: {
          tin: buyerTin,
          nameCyrl:
            (inv.agent as { legalTitle?: string | null; name?: string }).legalTitle ??
            (inv.agent as { name?: string }).name ??
            '',
        },
        positions: inv.positions.map((p, idx) => {
          const sumMinor =
            (BigInt(p.priceMinor.toString()) *
              BigInt(Math.round(Number(p.quantity.toString()) * 1_000_000))) /
            1_000_000n;
          // VAT: positions have integer percentage. We trust the existing
          // computeTotals that already produced inv.vatSumMinor; for per-row
          // distribution we approximate proportionally.
          const ndsRate = (p.vat ?? 0) === 12 ? 12 : (p.vat ?? 0) === 15 ? 15 : 0;
          const ndsSumMinor = ndsRate > 0 ? (sumMinor * BigInt(ndsRate)) / 100n : 0n;
          return {
            ordNo: idx + 1,
            mxik: (p.product as { mxikCode?: string | null } | null)?.mxikCode ?? '',
            name: p.product?.name ?? '',
            measureCode: '108', // Default 'piece'; real impl reads UoM mapping.
            count: p.quantity.toString(),
            priceMinor: BigInt(p.priceMinor.toString()),
            sumMinor,
            ndsRate,
            ndsSumMinor,
            totalMinor: sumMinor + ndsSumMinor,
          };
        }),
      };
    }
    throw new BadRequestException(`${sourceEntity} → EHF builder hali sinov rejimida`);
  }

  private async requireConfig(accountId: string) {
    const cfg = await this.prisma.client.edoConfig.findUnique({ where: { accountId } });
    if (!cfg) throw new BadRequestException("EDO sozlanmagan — Sozlamalar > EDO bo'limida");
    return cfg;
  }

  private publicView(row: {
    id: string;
    provider: string;
    stir: string;
    orgNameCyrl: string;
    apiBaseUrl: string;
    apiTokenCipher: string | null;
    pfxCipher: Buffer | null;
    testMode: boolean;
    enabled: boolean;
    lastTestedAt: Date | null;
    lastTestOk: boolean | null;
    lastTestMsg: string | null;
  }): PublicEdoConfig {
    return {
      id: row.id,
      provider: row.provider,
      stir: row.stir,
      orgNameCyrl: row.orgNameCyrl,
      apiBaseUrl: row.apiBaseUrl,
      hasApiToken: row.apiTokenCipher !== null && row.apiTokenCipher.length > 0,
      hasPfx: row.pfxCipher !== null && row.pfxCipher.length > 0,
      testMode: row.testMode,
      enabled: row.enabled,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
      lastTestMsg: row.lastTestMsg,
    };
  }
}
