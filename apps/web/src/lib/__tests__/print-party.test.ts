import { agentParty, orgParty, partySignatures } from '@/lib/print-party';
import { describe, expect, it } from 'vitest';

/**
 * Chop hujjati tomon kartasi + imzo bloki (2026-08-01).
 *
 * 14 ta chop sahifasi bir xil `PrintDoc` ni ishlatadi, lekin tomon ma'lumotini
 * har biri O'ZI yig'ardi va aksari faqat `legalAddress` chizardi — STIR, bank,
 * MFO, telefon API'dan kelib turib ISHLATILMASDI. Imzo qatorlari esa
 * «Директор / MCHJ Demo» bo'lib chiqardi: yorliq to'g'ri, nom esa
 * kompaniyaniki, direktorniki emas.
 *
 * Bu testlar shu ikki nuqsonni qulflaydi.
 */

// `pages.print` tarjimoni o'rniga — kalitning o'zini qaytaradi.
const t = (k: string) => k;

const ORG = {
  name: 'MCHJ Demo',
  legalTitle: 'Mas’uliyati cheklangan jamiyat "Demo"',
  legalAddress: 'Toshkent sh., Amir Temur 1',
  phone: '+998901234567',
  director: 'Davlatbek Azamov',
  directorPosition: 'Bosh direktor',
  chiefAccountant: 'Nodira Karimova',
  uzRequisites: { inn: '301234567' },
};

const ACCOUNT = { accountNumber: '20208000000000000001', bankName: 'Ipoteka Bank', bic: '00443' };

describe('orgParty — tashkilot rekviziti', () => {
  it('STIR, hisob raqam, bank, MFO va telefonni chiqaradi', () => {
    const p = orgParty(t, 'Tashkilot', ORG, ACCOUNT);
    expect(p.details).toContain('req.inn: 301234567');
    expect(p.details).toContain('req.account: 20208000000000000001');
    expect(p.details).toContain('Ipoteka Bank');
    expect(p.details).toContain('req.mfo: 00443');
    expect(p.details).toContain('req.phone: +998901234567');
  });

  it('yuridik nomni afzal ko’radi, bo‘lmasa oddiy nomni', () => {
    expect(orgParty(t, 'X', ORG, null).name).toContain('Demo"');
    expect(orgParty(t, 'X', { name: 'Faqat nom' }, null).name).toBe('Faqat nom');
  });

  it('bank hisobi bo‘lmasa bank qatorlarini TASHLAB ketadi', () => {
    const p = orgParty(t, 'X', ORG, null);
    expect(p.details).not.toContain('req.account');
    expect(p.details).not.toContain('req.mfo');
    // qolganlari baribir chiqadi
    expect(p.details).toContain('req.inn');
  });

  it('hech qanday rekvizit bo‘lmasa null qaytaradi (bo‘sh qator emas)', () => {
    expect(orgParty(t, 'X', { name: 'Nom' }, null).details).toBeNull();
  });
});

describe('agentParty — kontragent', () => {
  it('manzil, STIR va telefonni chiqaradi', () => {
    const p = agentParty(t, 'Kontragent', {
      name: 'Zikrillo aka',
      legalAddress: 'Andijon',
      phone: '+998911112233',
      uzRequisites: { inn: '987654321' },
    });
    expect(p.details).toContain('Andijon');
    expect(p.details).toContain('req.inn: 987654321');
    expect(p.details).toContain('req.phone: +998911112233');
  });
});

describe('partySignatures — imzo bloki', () => {
  it('direktorning HAQIQIY ismini va lavozimini qo‘yadi', () => {
    const s = partySignatures(t, ORG, 'Xaridor MChJ', 'signature.received_by');
    expect(s[0]).toEqual({ label: 'Bosh direktor', name: 'Davlatbek Azamov' });
  });

  it('lavozim kiritilmagan bo‘lsa umumiy «Директор» yorlig‘ini oladi', () => {
    const { directorPosition, ...noPos } = ORG;
    expect(partySignatures(t, noPos, 'X', 'y')[0]?.label).toBe('signature.director');
  });

  it('direktor kiritilmagan bo‘lsa kompaniya nomiga tushadi', () => {
    const { director, ...noDir } = ORG;
    expect(partySignatures(t, noDir, 'X', 'y')[0]?.name).toBe('MCHJ Demo');
  });

  it('bosh buxgalter bo‘lsa QO‘SHADI, bo‘lmasa qo‘shmaydi', () => {
    expect(partySignatures(t, ORG, 'X', 'y')).toHaveLength(3);
    const { chiefAccountant, ...noAcc } = ORG;
    expect(partySignatures(t, noAcc, 'X', 'y')).toHaveLength(2);
  });

  it('qarshi tomon yorlig‘ini CHAQIRUVCHI belgilaydi (hujjat yo‘nalishi)', () => {
    const out = partySignatures(t, ORG, 'Xaridor MChJ', 'signature.received_by');
    expect(out.at(-1)).toEqual({ label: 'signature.received_by', name: 'Xaridor MChJ' });
    const inb = partySignatures(t, ORG, 'Taminotchi', 'signature.issued_by');
    expect(inb.at(-1)).toEqual({ label: 'signature.issued_by', name: 'Taminotchi' });
  });
});
