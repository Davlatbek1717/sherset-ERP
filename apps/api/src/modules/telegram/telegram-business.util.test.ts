import { describe, expect, it } from 'vitest';
import { parseBusinessUpdate } from './telegram-business.util.js';

describe('parseBusinessUpdate', () => {
  it('parses business_connection (enabled)', () => {
    const r = parseBusinessUpdate({
      update_id: 1,
      business_connection: {
        id: 'conn-123',
        user: { id: 777, first_name: 'Ozodbek', last_name: 'M' },
        user_chat_id: 777,
        is_enabled: true,
      },
    });
    expect(r).toEqual({
      kind: 'business_connection',
      connectionId: 'conn-123',
      enabled: true,
      user: { id: 777, name: 'Ozodbek M' },
    });
  });

  it('parses business_connection disconnect (is_enabled=false)', () => {
    const r = parseBusinessUpdate({
      business_connection: {
        id: 'conn-123',
        user: { id: 777, first_name: 'O' },
        is_enabled: false,
      },
    });
    expect(r.kind).toBe('business_connection');
    if (r.kind === 'business_connection') expect(r.enabled).toBe(false);
  });

  it('parses an incoming client business_message', () => {
    const r = parseBusinessUpdate({
      business_message: {
        message_id: 42,
        chat: { id: 555, first_name: 'Feruz', username: 'feruz' },
        from: { id: 555, first_name: 'Feruz' },
        text: 'Salom, narx qancha?',
      },
    });
    expect(r).toEqual({
      kind: 'business_message',
      source: 'business',
      chatId: 555,
      chatFirstName: 'Feruz',
      chatLastName: null,
      chatUsername: 'feruz',
      fromId: 555,
      fromName: 'Feruz',
      text: 'Salom, narx qancha?',
      tgMessageId: 42,
      messageKind: 'text',
      fileId: null,
      fileName: null,
      mimeType: null,
      contactPhone: null,
      fwdFromName: null,
    });
  });

  it('uses caption when text is absent', () => {
    const withCaption = parseBusinessUpdate({
      business_message: { message_id: 1, chat: { id: 9 }, caption: 'rasm izohi' },
    });
    expect(withCaption.kind).toBe('business_message');
    if (withCaption.kind === 'business_message') expect(withCaption.text).toBe('rasm izohi');
  });

  // ── 2026-07-13: MEDIA ────────────────────────────────────────────────────
  // Ilgari matnsiz xabar TASHLAB YUBORILARDI («skip in V1») — mijoz CHEK
  // rasmini yuborsa, u hech qayerda ko'rinmasdi. Endi saqlanadi.

  it('izohsiz RASM ham qabul qilinadi (chek yoqolmasin)', () => {
    const r = parseBusinessUpdate({
      business_message: {
        message_id: 7,
        chat: { id: 9, first_name: 'Feruz' },
        photo: [
          { file_id: 'small', file_size: 1000 },
          { file_id: 'big', file_size: 90000 },
        ],
      },
    });
    expect(r.kind).toBe('business_message');
    if (r.kind !== 'business_message') return;
    expect(r.messageKind).toBe('photo');
    // ENG KATTA o'lcham olinadi — chek o'qilarli bo'lishi kerak
    expect(r.fileId).toBe('big');
    expect(r.mimeType).toBe('image/jpeg');
    expect(r.text).toBe('📷 Rasm');
  });

  it('rasm izohi bilan kelsa: izoh matn boladi', () => {
    const r = parseBusinessUpdate({
      business_message: {
        message_id: 8,
        chat: { id: 9 },
        photo: [{ file_id: 'f1', file_size: 500 }],
        caption: 'Chek shu',
      },
    });
    if (r.kind !== 'business_message') throw new Error('business_message kutilgandi');
    expect(r.messageKind).toBe('photo');
    expect(r.text).toBe('Chek shu');
  });

  it('hujjat / ovoz ham qabul qilinadi', () => {
    const doc = parseBusinessUpdate({
      business_message: {
        message_id: 9,
        chat: { id: 9 },
        document: { file_id: 'd1', file_name: 'chek.pdf', mime_type: 'application/pdf' },
      },
    });
    if (doc.kind !== 'business_message') throw new Error('business_message kutilgandi');
    expect(doc.messageKind).toBe('document');
    expect(doc.fileName).toBe('chek.pdf');

    const voice = parseBusinessUpdate({
      business_message: { message_id: 10, chat: { id: 9 }, voice: { file_id: 'v1' } },
    });
    if (voice.kind !== 'business_message') throw new Error('business_message kutilgandi');
    expect(voice.messageKind).toBe('voice');
  });

  it('mijoz KONTAKTINI ulashsa: telefon ajratiladi (avtomatik boglash uchun)', () => {
    const r = parseBusinessUpdate({
      message: {
        message_id: 11,
        chat: { id: 9, first_name: 'Feruz' },
        contact: { phone_number: '+998901234567', first_name: 'Feruz' },
      },
    });
    if (r.kind !== 'business_message') throw new Error('business_message kutilgandi');
    expect(r.source).toBe('bot');
    expect(r.messageKind).toBe('contact');
    expect(r.contactPhone).toBe('+998901234567');
  });

  it('oddiy BOT chati ham saqlanadi (source=bot)', () => {
    const r = parseBusinessUpdate({ message: { chat: { id: 1 }, text: 'hi' } });
    expect(r.kind).toBe('business_message');
    if (r.kind === 'business_message') expect(r.source).toBe('bot');
  });

  // ── 2026-07-20 Phase 2: FORWARD KO'RSATKICHI ────────────────────────────
  // Telegram'ning o'zidagi "Переслано от: X" — Bot API 7.0+ `forward_origin`
  // to'rtta shakldan biri bilan keladi, hammasi ismga/nomga tushishi kerak.
  describe('forward_origin — "Переслано от: X" ko\'rsatkichi', () => {
    it('oddiy foydalanuvchidan forward (type=user)', () => {
      const r = parseBusinessUpdate({
        business_message: {
          message_id: 20,
          chat: { id: 9 },
          text: 'qarang',
          forward_origin: { type: 'user', sender_user: { id: 1, first_name: 'Anvar' } },
        },
      });
      if (r.kind !== 'business_message') throw new Error('business_message kutilgandi');
      expect(r.fwdFromName).toBe('Anvar');
    });

    it('forward-maxfiylik yoqilgan (type=hidden_user) — ism satrdan olinadi', () => {
      const r = parseBusinessUpdate({
        business_message: {
          message_id: 21,
          chat: { id: 9 },
          text: 'qarang',
          forward_origin: { type: 'hidden_user', sender_user_name: 'ABDIXAMIDOVICH' },
        },
      });
      if (r.kind !== 'business_message') throw new Error('business_message kutilgandi');
      expect(r.fwdFromName).toBe('ABDIXAMIDOVICH');
    });

    it('guruh/chat kanalidan forward (type=chat)', () => {
      const r = parseBusinessUpdate({
        business_message: {
          message_id: 22,
          chat: { id: 9 },
          text: 'qarang',
          forward_origin: { type: 'chat', sender_chat: { title: 'Sotuv guruhi' } },
        },
      });
      if (r.kind !== 'business_message') throw new Error('business_message kutilgandi');
      expect(r.fwdFromName).toBe('Sotuv guruhi');
    });

    it('kanaldan forward (type=channel)', () => {
      const r = parseBusinessUpdate({
        business_message: {
          message_id: 23,
          chat: { id: 9 },
          text: 'qarang',
          forward_origin: { type: 'channel', chat: { title: 'Yangiliklar' } },
        },
      });
      if (r.kind !== 'business_message') throw new Error('business_message kutilgandi');
      expect(r.fwdFromName).toBe('Yangiliklar');
    });

    it("oddiy (forward bo'lmagan) xabarda fwdFromName null", () => {
      const r = parseBusinessUpdate({
        business_message: { message_id: 24, chat: { id: 9 }, text: 'oddiy xabar' },
      });
      if (r.kind !== 'business_message') throw new Error('business_message kutilgandi');
      expect(r.fwdFromName).toBeNull();
    });
  });

  it('stiker kabi bosh xabar saqlanmaydi', () => {
    expect(parseBusinessUpdate({ business_message: { message_id: 2, chat: { id: 9 } } }).kind).toBe(
      'other',
    );
    expect(parseBusinessUpdate(null).kind).toBe('other');
    expect(parseBusinessUpdate('x').kind).toBe('other');
  });
});
