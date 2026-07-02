import { describe, expect, it } from 'vitest';
import {
  CreateServiceRequestSchema,
  ServiceRequestChannelSchema,
  ServiceRequestFilterSchema,
  ServiceRequestPrioritySchema,
  ServiceRequestStatusSchema,
  ServiceRequestTransitionSchema,
  TRANSITION_FROM,
  TRANSITION_RESULT,
  UpdateServiceRequestSchema,
} from './service-request.schema.js';

describe('ServiceRequestStatusSchema', () => {
  it.each(['new', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'cancelled'])(
    'accepts %s',
    (s) => {
      expect(ServiceRequestStatusSchema.safeParse(s).success).toBe(true);
    },
  );

  it('rejects unknown status', () => {
    expect(ServiceRequestStatusSchema.safeParse('archived').success).toBe(false);
  });
});

describe('ServiceRequestChannelSchema', () => {
  it.each(['phone', 'email', 'chat', 'in_person', 'web_form', 'other'])('accepts %s', (c) => {
    expect(ServiceRequestChannelSchema.safeParse(c).success).toBe(true);
  });

  it('rejects unknown channel', () => {
    expect(ServiceRequestChannelSchema.safeParse('telegram').success).toBe(false);
  });
});

describe('ServiceRequestPrioritySchema', () => {
  it.each(['low', 'normal', 'high', 'critical'])('accepts %s', (p) => {
    expect(ServiceRequestPrioritySchema.safeParse(p).success).toBe(true);
  });
});

describe('ServiceRequestTransitionSchema', () => {
  it.each(Object.keys(TRANSITION_RESULT))('accepts %s', (t) => {
    expect(ServiceRequestTransitionSchema.safeParse(t).success).toBe(true);
  });

  it('rejects unknown target', () => {
    expect(ServiceRequestTransitionSchema.safeParse('escalate').success).toBe(false);
  });
});

describe('CreateServiceRequestSchema', () => {
  it('accepts minimal payload (just subject)', () => {
    const r = CreateServiceRequestSchema.safeParse({ subject: 'Help me' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.channel).toBe('other');
      expect(r.data.priority).toBe('normal');
      expect(r.data.tags).toEqual([]);
    }
  });

  it('rejects missing subject', () => {
    expect(CreateServiceRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects empty subject', () => {
    expect(CreateServiceRequestSchema.safeParse({ subject: '' }).success).toBe(false);
  });

  it('accepts dueDate ISO', () => {
    const r = CreateServiceRequestSchema.safeParse({
      subject: 'Issue',
      dueDate: '2026-05-01T12:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('rejects too many tags', () => {
    const tags = Array.from({ length: 25 }, (_, i) => `tag${i}`);
    expect(CreateServiceRequestSchema.safeParse({ subject: 'x', tags }).success).toBe(false);
  });
});

describe('UpdateServiceRequestSchema', () => {
  it('accepts partial update', () => {
    expect(UpdateServiceRequestSchema.safeParse({ priority: 'high' }).success).toBe(true);
  });

  it('accepts assignee disconnect via null', () => {
    expect(UpdateServiceRequestSchema.safeParse({ assigneeId: null }).success).toBe(true);
  });
});

describe('ServiceRequestFilterSchema', () => {
  it('uses defaults', () => {
    const r = ServiceRequestFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('createdAt');
      expect(r.data.sortDir).toBe('desc');
      expect(r.data.limit).toBe(50);
    }
  });

  it('coerces openOnly string', () => {
    const r = ServiceRequestFilterSchema.safeParse({ openOnly: 'true' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.openOnly).toBe(true);
  });

  it('rejects unknown sortBy', () => {
    expect(ServiceRequestFilterSchema.safeParse({ sortBy: 'subject' }).success).toBe(false);
  });
});

describe('Transition tables', () => {
  it('every transition target maps to a status', () => {
    for (const target of Object.keys(TRANSITION_RESULT)) {
      const result = TRANSITION_RESULT[target as keyof typeof TRANSITION_RESULT];
      expect(ServiceRequestStatusSchema.safeParse(result).success).toBe(true);
    }
  });

  it('every transition has at least one allowed source status', () => {
    for (const target of Object.keys(TRANSITION_FROM)) {
      const sources = TRANSITION_FROM[target as keyof typeof TRANSITION_FROM];
      expect(sources.length).toBeGreaterThan(0);
    }
  });
});
