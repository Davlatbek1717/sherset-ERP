import { z } from 'zod';

// === Enum-like constants (mirror Prisma TaskKind + HrTaskLog status FSM) ===

export const HR_TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type HrTaskPriority = (typeof HR_TASK_PRIORITIES)[number];

export const HR_TASK_TRIGGER_TYPES = ['manual', 'scheduled', 'event'] as const;
export type HrTaskTriggerType = (typeof HR_TASK_TRIGGER_TYPES)[number];

export const HR_TASK_RESPONSE_TYPES = ['none', 'yes_no', 'text'] as const;
export type HrTaskResponseType = (typeof HR_TASK_RESPONSE_TYPES)[number];

// MoySklad doc types for event-triggered tasks (5 yangibolim manba)
export const HR_TASK_EVENT_DOC_TYPES = [
  'demand',
  'customer_order',
  'payment_in',
  'supply',
  'sales_return',
] as const;

export const HR_TASK_EVENT_STATES = ['created', 'posted', 'updated', 'large_sale'] as const;

// === Sub-schemas ===

/**
 * Scheduled trigger config: cron-like description. Either weekly (with
 * weekday array, ISO 1=Mon..7=Sun) or monthly (specific day-of-month 1-31).
 */
export const ScheduleConfigSchema = z
  .object({
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM format'),
    mode: z.enum(['weekly', 'monthly']),
    days: z.array(z.number().int().min(1).max(7)).optional(), // weekly
    dayOfMonth: z.number().int().min(1).max(31).optional(), // monthly
  })
  .refine(
    (v) =>
      v.mode === 'weekly' ? Array.isArray(v.days) && v.days.length > 0 : v.dayOfMonth !== undefined,
    { message: 'weekly mode requires days[], monthly mode requires dayOfMonth' },
  );

/**
 * Event trigger config — MoySklad domain event hook.
 * `large_sale` event has an extra threshold (minimum total in minor units).
 */
export const EventConfigSchema = z.object({
  docType: z.enum(HR_TASK_EVENT_DOC_TYPES),
  state: z.enum(HR_TASK_EVENT_STATES),
  largeSaleMinThresholdMinor: z.union([z.string(), z.number()]).optional(),
});

// === Main CRUD schemas — 16 input form ===

export const CreateHrTaskTemplateSchema = z
  .object({
    title: z.string().min(1, 'Sarlavha kiritilishi shart').max(255),
    description: z.string().max(2000).optional().nullable(),

    // Assignee XOR — either specific employee, or role-based broadcast
    assignedEmployeeId: z.string().uuid().optional().nullable(),
    assignedRole: z.string().max(50).optional().nullable(),

    department: z.string().max(100).optional().nullable(),

    priority: z.enum(HR_TASK_PRIORITIES).default('medium'),

    // Trigger discriminator
    triggerType: z.enum(HR_TASK_TRIGGER_TYPES),
    scheduleConfig: ScheduleConfigSchema.optional().nullable(),
    eventConfig: EventConfigSchema.optional().nullable(),

    // Response shape
    responseType: z.enum(HR_TASK_RESPONSE_TYPES).default('none'),

    // Deadline (minutes from sent_at). 0/null = no deadline.
    deadlineMinutes: z.number().int().min(0).max(525_600).optional().nullable(),

    // Bonus/fine amounts (UZS tiyin = minor units). Accept string or number; coerce to BigInt server-side.
    rewardMinor: z.union([z.string(), z.number(), z.bigint()]).optional().nullable(),
    fineMinor: z.union([z.string(), z.number(), z.bigint()]).optional().nullable(),

    // 4-ko'z (4-eye review). If set, answered_yes/answered_text → pending_review.
    checkerId: z.string().uuid().optional().nullable(),

    // Chain dependency. If set, only auto-triggers after dependsOn finalized=answered_yes.
    dependsOnId: z.string().uuid().optional().nullable(),

    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // XOR: assignedEmployeeId or assignedRole, NOT both, NOT neither
    const hasEmployee = !!data.assignedEmployeeId;
    const hasRole = !!data.assignedRole;
    if (!hasEmployee && !hasRole) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignedEmployeeId'],
        message: 'Xodim yoki rolni tanlang',
      });
    }
    if (hasEmployee && hasRole) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignedRole'],
        message: 'Faqat birini tanlang: xodim YOKI rol',
      });
    }
    // Trigger discriminator validations
    if (data.triggerType === 'scheduled' && !data.scheduleConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduleConfig'],
        message: "Vaqt bo'yicha trigger uchun scheduleConfig kerak",
      });
    }
    if (data.triggerType === 'event' && !data.eventConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eventConfig'],
        message: 'Hodisa triggeri uchun eventConfig kerak',
      });
    }
    // Anti-self-approval: checker cannot be the assigned employee
    if (data.checkerId && data.assignedEmployeeId && data.checkerId === data.assignedEmployeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkerId'],
        message: "Tekshiruvchi vazifa egasi bo'la olmaydi",
      });
    }
    // checker only makes sense when response is answerable
    if (data.checkerId && data.responseType === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkerId'],
        message: "Tekshiruvchi tayinlash uchun javob turi yes_no yoki text bo'lishi kerak",
      });
    }
  });

/**
 * Update accepts an optional `expectedUpdatedAt` for optimistic concurrency.
 * When supplied, the service compares it against the row's current
 * `updatedAt` and throws Conflict if the row has been modified since the
 * client loaded it.
 */
export const UpdateHrTaskTemplateSchema = z.intersection(
  CreateHrTaskTemplateSchema,
  z.object({ expectedUpdatedAt: z.coerce.date().optional() }),
);

export const HrTaskTemplateFilterSchema = z.object({
  search: z.string().optional(),
  triggerType: z.enum(HR_TASK_TRIGGER_TYPES).optional(),
  priority: z.enum(HR_TASK_PRIORITIES).optional(),
  department: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  checkerId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type CreateHrTaskTemplateInput = z.infer<typeof CreateHrTaskTemplateSchema>;
export type UpdateHrTaskTemplateInput = z.infer<typeof UpdateHrTaskTemplateSchema>;
export type HrTaskTemplateFilter = z.infer<typeof HrTaskTemplateFilterSchema>;
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;
export type EventConfig = z.infer<typeof EventConfigSchema>;
