import { describe, expect, it } from 'vitest';
import { type VarianceCandidate, selectVarianceRecipients } from './variance-recipients.js';

const SESSION = { cashierId: 'kassir-1', groupId: 'guruh-A' };

const cand = (p: Partial<VarianceCandidate>): VarianceCandidate => ({
  employeeId: 'emp-1',
  telegramPhone: '+998900000001',
  scope: 'ALL',
  groupId: null,
  ...p,
});

describe('selectVarianceRecipients', () => {
  it('`ALL` qamrovli xodim har doim oladi', () => {
    const out = selectVarianceRecipients([cand({ employeeId: 'admin', scope: 'ALL' })], SESSION);
    expect(out).toEqual([{ employeeId: 'admin', phone: '+998900000001' }]);
  });

  it('`OWN_GROUP` faqat SMENA guruhida oladi', () => {
    const same = cand({ employeeId: 'm1', scope: 'OWN_GROUP', groupId: 'guruh-A' });
    const other = cand({ employeeId: 'm2', scope: 'OWN_GROUP', groupId: 'guruh-B' });
    const out = selectVarianceRecipients([same, other], SESSION);
    expect(out.map((r) => r.employeeId)).toEqual(['m1']);
  });

  it('guruhsiz `OWN_GROUP` — mos EMAS (null ≠ null)', () => {
    const noGroupEmp = cand({ employeeId: 'm3', scope: 'OWN_GROUP', groupId: null });
    expect(selectVarianceRecipients([noGroupEmp], SESSION)).toEqual([]);
    // Smenaning guruhi yo'q bo'lsa ham — moslik isbotlanmagan.
    const noGroupSession = { cashierId: 'kassir-1', groupId: null };
    expect(
      selectVarianceRecipients(
        [cand({ employeeId: 'm4', scope: 'OWN_GROUP', groupId: 'guruh-A' })],
        noGroupSession,
      ),
    ).toEqual([]);
  });

  it('`OWN` faqat smenaning O`Z kassiriga', () => {
    const self = cand({ employeeId: 'kassir-1', scope: 'OWN' });
    const stranger = cand({ employeeId: 'kassir-2', scope: 'OWN' });
    const out = selectVarianceRecipients([self, stranger], SESSION);
    expect(out.map((r) => r.employeeId)).toEqual(['kassir-1']);
  });

  it('`NO` hech qachon olmaydi', () => {
    expect(selectVarianceRecipients([cand({ scope: 'NO' })], SESSION)).toEqual([]);
  });

  it('telefonsiz xodim tashlanadi (bo`sh satr ham)', () => {
    const out = selectVarianceRecipients(
      [
        cand({ employeeId: 'a', telegramPhone: null }),
        cand({ employeeId: 'b', telegramPhone: '   ' }),
        cand({ employeeId: 'c', telegramPhone: ' +998900000009 ' }),
      ],
      SESSION,
    );
    expect(out).toEqual([{ employeeId: 'c', phone: '+998900000009' }]);
  });

  it('bir telefon — bir xabar (ikki xodimda bir raqam bo`lsa ham)', () => {
    const out = selectVarianceRecipients(
      [
        cand({ employeeId: 'a', telegramPhone: '+998911111111' }),
        cand({ employeeId: 'b', telegramPhone: '+998911111111' }),
      ],
      SESSION,
    );
    expect(out).toHaveLength(1);
  });

  it('🔴 KASSIRLARGA tarqamaydi: `update`-tipdagi keng qamrov bu yerga umuman kirmaydi', () => {
    // Prod matritsasi: `Kassir` rolida `cashiersession.approve` YO'Q (faqat
    // view/create/update/print). Ya'ni kassir nomzod ro'yxatiga tushmaydi —
    // shuning uchun ro'yxat bo'sh kelsa natija ham bo'sh bo'lishi kerak.
    expect(selectVarianceRecipients([], SESSION)).toEqual([]);
  });
});
