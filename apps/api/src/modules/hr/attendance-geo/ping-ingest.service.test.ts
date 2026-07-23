import { afterEach, describe, expect, it, vi } from 'vitest';
import { HrPingIngestService } from './ping-ingest.service.js';

interface MakeOpts {
  attendanceOptIn?: boolean;
  workLocationId?: string | null;
}

function makePrisma(opts: MakeOpts = {}) {
  const { attendanceOptIn = true, workLocationId = 'wl1' } = opts;
  return {
    client: {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ attendanceOptIn, workLocationId }),
      },
      hrWorkLocation: {
        findFirst: vi.fn().mockResolvedValue({ lat: 41.311, lng: 69.24, radiusMeters: 150 }),
      },
      hrLocationPing: {
        findFirst: vi.fn().mockResolvedValue(null), // last ping today (jumpFilter prev)
        findMany: vi.fn().mockResolvedValue([]), // recent samples (desc)
        create: vi.fn().mockResolvedValue({}),
      },
      hrAttendance: {
        findFirst: vi.fn().mockResolvedValue(null), // open record today
        create: vi.fn().mockResolvedValue({
          checkInTime: new Date(),
          checkOutTime: null,
          lateMinutes: 10,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employeeWorkSchedule: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ startTime: '09:00', endTime: '18:00', isDayOff: false }),
      },
    },
  };
}

const INSIDE = { lat: 41.311, lng: 69.24, accuracy: 10 };
const OUTSIDE = { lat: 41.35, lng: 69.24, accuracy: 10 };

afterEach(() => vi.useRealTimers());

describe('HrPingIngestService.ingest', () => {
  it('rejects accuracy>100 without persisting', async () => {
    const prisma = makePrisma();
    const svc = new HrPingIngestService(prisma as never);
    const r = await svc.ingest('acc', 'emp', { lat: 41.311, lng: 69.24, accuracy: 250 });
    expect(r).toMatchObject({ accepted: false, reason: 'accuracy' });
    expect(prisma.client.hrLocationPing.create).not.toHaveBeenCalled();
  });

  it('benign when not opted in', async () => {
    const prisma = makePrisma({ attendanceOptIn: false });
    const svc = new HrPingIngestService(prisma as never);
    const r = await svc.ingest('acc', 'emp', INSIDE);
    expect(r).toMatchObject({ accepted: false, reason: 'not_opted_in' });
    expect(prisma.client.hrLocationPing.create).not.toHaveBeenCalled();
  });

  it('benign when no work-location assigned', async () => {
    const prisma = makePrisma({ workLocationId: null });
    const svc = new HrPingIngestService(prisma as never);
    const r = await svc.ingest('acc', 'emp', INSIDE);
    expect(r).toMatchObject({ accepted: false, reason: 'no_location' });
  });

  it('creates auto_gps check-in on KELDI with lateMinutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T09:10:00+05:00')); // 10 min after 09:00 start
    const prisma = makePrisma();
    // two inside samples (desc) -> reversed to ascending -> last 2 all inside -> KELDI
    prisma.client.hrLocationPing.findMany.mockResolvedValue([
      { inside: true, createdAt: new Date('2026-07-27T09:10:00+05:00') },
      { inside: true, createdAt: new Date('2026-07-27T09:09:00+05:00') },
    ]);
    const svc = new HrPingIngestService(prisma as never);
    const r = await svc.ingest('acc', 'emp', INSIDE);

    expect(r.decision).toBe('KELDI');
    expect(prisma.client.hrLocationPing.create).toHaveBeenCalled();
    const createArg = prisma.client.hrAttendance.create.mock.calls[0]?.[0] as {
      data: { source: string; lateMinutes: number; checkInLat: number };
    };
    expect(createArg.data.source).toBe('auto_gps');
    expect(createArg.data.lateMinutes).toBe(10);
    expect(createArg.data.checkInLat).toBe(INSIDE.lat);
  });

  it('closes open record on KETDI via atomic updateMany', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-07-27T18:30:00+05:00');
    vi.setSystemTime(now);
    const prisma = makePrisma();
    prisma.client.hrAttendance.findFirst.mockResolvedValue({
      id: 'att1',
      checkInTime: new Date('2026-07-27T09:00:00+05:00'),
      lateMinutes: 0,
    });
    // trailing continuous outside run >= 3 min (desc order from the service query)
    prisma.client.hrLocationPing.findMany.mockResolvedValue([
      { inside: false, createdAt: new Date('2026-07-27T18:29:00+05:00') },
      { inside: false, createdAt: new Date('2026-07-27T18:25:00+05:00') },
      { inside: true, createdAt: new Date('2026-07-27T18:10:00+05:00') },
    ]);
    const svc = new HrPingIngestService(prisma as never);
    const r = await svc.ingest('acc', 'emp', OUTSIDE);

    expect(r.decision).toBe('KETDI');
    expect(r.status).toBe('left');
    const updArg = prisma.client.hrAttendance.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; checkOutTime: null };
      data: { checkOutTime: Date };
    };
    expect(updArg.where).toMatchObject({ id: 'att1', checkOutTime: null });
    expect(updArg.data.checkOutTime).toBeInstanceOf(Date);
  });
});
