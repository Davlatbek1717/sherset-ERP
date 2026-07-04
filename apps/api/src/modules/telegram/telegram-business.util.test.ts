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
      chatId: 555,
      chatFirstName: 'Feruz',
      chatLastName: null,
      chatUsername: 'feruz',
      fromId: 555,
      fromName: 'Feruz',
      text: 'Salom, narx qancha?',
      tgMessageId: 42,
    });
  });

  it('uses caption when text is absent; skips media without caption', () => {
    const withCaption = parseBusinessUpdate({
      business_message: { message_id: 1, chat: { id: 9 }, caption: 'rasm izohi' },
    });
    expect(withCaption.kind).toBe('business_message');
    if (withCaption.kind === 'business_message') expect(withCaption.text).toBe('rasm izohi');

    const bare = parseBusinessUpdate({ business_message: { message_id: 2, chat: { id: 9 } } });
    expect(bare.kind).toBe('other');
  });

  it('classifies plain bot updates as other', () => {
    expect(parseBusinessUpdate({ message: { chat: { id: 1 }, text: 'hi' } }).kind).toBe('other');
    expect(parseBusinessUpdate(null).kind).toBe('other');
    expect(parseBusinessUpdate('x').kind).toBe('other');
  });
});
