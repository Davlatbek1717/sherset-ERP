import { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CreateServiceRequestInput,
  CreateServiceRequestSchema,
  ServiceRequestFilterSchema,
  type ServiceRequestStatus,
  ServiceRequestTransitionSchema,
  type ServiceRequestTransitionTarget,
  TRANSITION_FROM,
  TRANSITION_RESULT,
  type UpdateServiceRequestInput,
  UpdateServiceRequestSchema,
} from './service-request.schema.js';

const NAME_PREFIX = 'ZP';
const TERMINAL_STATUSES: ServiceRequestStatus[] = ['closed', 'cancelled'];

@Injectable()
export class ServiceRequestService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ServiceRequestFilterSchema.parse(rawFilter);
    const dueDateRange =
      filter.dueDateFrom || filter.dueDateTo
        ? {
            dueDate: tashkentRangeBounds(filter.dueDateFrom, filter.dueDateTo),
          }
        : {};
    const where: Prisma.ServiceRequestWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      ...(filter.channel ? { channel: filter.channel } : {}),
      ...(filter.counterpartyId ? { counterpartyId: filter.counterpartyId } : {}),
      ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.openOnly ? { status: { notIn: TERMINAL_STATUSES } } : {}),
      ...(filter.overdueOnly
        ? { dueDate: { lt: new Date() }, status: { notIn: TERMINAL_STATUSES } }
        : dueDateRange),
      ...(filter.search
        ? {
            OR: [
              { subject: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { name: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.serviceRequest.findMany({
      where,
      orderBy:
        filter.sortBy === 'priority'
          ? // Map enum text → ordinal in app layer for sortable presentation;
            // for now sort by createdAt as proxy. Future: use a numeric column.
            { createdAt: filter.sortDir }
          : { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        counterparty: { select: { id: true, name: true, legalTitle: true } },
        contactPerson: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.serviceRequest.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.serviceRequest.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        counterparty: true,
        contactPerson: true,
        assignee: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException(`ServiceRequest ${id} not found`);
    return row;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    const name = parsed.name ?? (await this.nextName(accountId));

    if (parsed.counterpartyId) await this.assertCounterparty(accountId, parsed.counterpartyId);
    if (parsed.contactPersonId) {
      await this.assertContact(accountId, parsed.contactPersonId, parsed.counterpartyId ?? null);
    }
    if (parsed.assigneeId) await this.assertEmployee(accountId, parsed.assigneeId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'ServiceRequest',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    try {
      const created = await this.prisma.client.serviceRequest.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          externalCode: parsed.externalCode ?? null,
          subject: parsed.subject,
          description: parsed.description ?? null,
          counterpartyId: parsed.counterpartyId ?? null,
          contactPersonId: parsed.contactPersonId ?? null,
          assigneeId: parsed.assigneeId ?? null,
          channel: parsed.channel,
          priority: parsed.priority,
          status: 'new',
          dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
          tags: parsed.tags,
          attributes: attributes as Prisma.InputJsonValue,
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'servicerequest', 'CREATE', created.id);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (TERMINAL_STATUSES.includes(existing.status as ServiceRequestStatus)) {
      throw new BadRequestException(
        `${existing.status} holatdagi zayavkani o'zgartirib bo'lmaydi — avval qayta oching`,
      );
    }

    if (parsed.counterpartyId !== undefined && parsed.counterpartyId !== null) {
      await this.assertCounterparty(accountId, parsed.counterpartyId);
    }
    if (parsed.contactPersonId !== undefined && parsed.contactPersonId !== null) {
      const cp =
        parsed.counterpartyId !== undefined ? parsed.counterpartyId : existing.counterpartyId;
      await this.assertContact(accountId, parsed.contactPersonId, cp);
    }
    if (parsed.assigneeId !== undefined && parsed.assigneeId !== null) {
      await this.assertEmployee(accountId, parsed.assigneeId);
    }

    const data: Prisma.ServiceRequestUpdateInput = {};
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.subject !== undefined) data.subject = parsed.subject;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.channel !== undefined) data.channel = parsed.channel;
    if (parsed.priority !== undefined) data.priority = parsed.priority;
    if (parsed.dueDate !== undefined) {
      data.dueDate = parsed.dueDate ? new Date(parsed.dueDate) : null;
    }
    if (parsed.tags !== undefined) data.tags = { set: parsed.tags };
    if (parsed.counterpartyId !== undefined) {
      data.counterparty = parsed.counterpartyId
        ? { connect: { id: parsed.counterpartyId } }
        : { disconnect: true };
    }
    if (parsed.contactPersonId !== undefined) {
      data.contactPerson = parsed.contactPersonId
        ? { connect: { id: parsed.contactPersonId } }
        : { disconnect: true };
    }
    if (parsed.assigneeId !== undefined) {
      data.assignee = parsed.assigneeId
        ? { connect: { id: parsed.assigneeId } }
        : { disconnect: true };
    }
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'ServiceRequest',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }

    try {
      const updated = await this.prisma.client.serviceRequest.update({
        where: { id, accountId },
        data,
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'servicerequest', 'UPDATE', id);
      return updated;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = ServiceRequestTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: ${Object.keys(TRANSITION_RESULT).join(' | ')}`,
      );
    }
    const target: ServiceRequestTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);
    const currentStatus = existing.status as ServiceRequestStatus;
    const allowed = TRANSITION_FROM[target];
    if (!allowed.includes(currentStatus)) {
      throw new BadRequestException(
        `${currentStatus} holatdan '${target}' tranzitsiya qilib bo'lmaydi (ruxsat: ${allowed.join(', ')})`,
      );
    }
    const newStatus = TRANSITION_RESULT[target];
    const now = new Date();
    const data: Prisma.ServiceRequestUpdateInput = { status: newStatus };
    if (newStatus === 'resolved') data.resolvedAt = now;
    if (newStatus === 'closed') data.closedAt = now;
    if (target === 'reopen') {
      data.resolvedAt = null;
      data.closedAt = null;
    }

    const updated = await this.prisma.client.serviceRequest.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, `transition:${newStatus}`, id, {
      from: { before: currentStatus, after: newStatus },
    });
    this.webhookFire.fireForEvent(accountId, 'servicerequest', 'UPDATE', id, ['status']);
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    const existing = await this.findById(accountId, id);
    if (!TERMINAL_STATUSES.includes(existing.status as ServiceRequestStatus)) {
      throw new BadRequestException("Faqat closed yoki cancelled zayavkani o'chirib bo'ladi");
    }
    await this.prisma.client.serviceRequest.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'servicerequest', 'DELETE', id);
    return { ok: true };
  }

  /** mass-edit single-row apply. ServiceRequest lacks projectId. */
  async massEditApply(
    accountId: string,
    userId: string,
    id: string,
    patch: { ownerId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('description' in patch) data.description = patch.description;
    const updated = await this.prisma.client.serviceRequest.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'servicerequest', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  // ----- helpers --------------------------------------------------------

  private async nextName(accountId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `${NAME_PREFIX}-${year}-`;
    const next = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.serviceRequest.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      const tail = last?.name.slice(prefix.length) ?? '0';
      return Number.parseInt(tail, 10) || 0;
    });
    return `${prefix}${next.toString().padStart(5, '0')}`;
  }

  private async assertCounterparty(accountId: string, counterpartyId: string): Promise<void> {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true },
    });
    if (!cp) throw new BadRequestException(`Kontragent topilmadi: ${counterpartyId}`);
  }

  private async assertContact(
    accountId: string,
    contactPersonId: string,
    counterpartyId: string | null,
  ): Promise<void> {
    const cp = await this.prisma.client.contactPerson.findFirst({
      where: { id: contactPersonId, accountId },
      select: { id: true, counterpartyId: true },
    });
    if (!cp) throw new BadRequestException(`Kontakt shaxs topilmadi: ${contactPersonId}`);
    if (counterpartyId && cp.counterpartyId !== counterpartyId) {
      throw new BadRequestException('Kontakt shaxs boshqa kontragentga tegishli');
    }
  }

  private async assertEmployee(accountId: string, employeeId: string): Promise<void> {
    const e = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!e) throw new BadRequestException(`Xodim topilmadi: ${employeeId}`);
  }

  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
    fieldChanges: Prisma.InputJsonValue | null,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'ServiceRequest',
        entityId,
        action,
        fieldChanges: fieldChanges ?? Prisma.JsonNull,
      },
    });
  }

  private parseCreate(raw: unknown): CreateServiceRequestInput {
    const r = CreateServiceRequestSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateServiceRequestInput {
    const r = UpdateServiceRequestSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new ConflictException('Bunday nom allaqachon mavjud');
      }
    }
    throw e;
  }
}
