import { describe, expect, it } from 'vitest';
import { renderTelegramTemplate } from './telegram-template-render.util.js';

const ctx = {
  counterparty: { name: 'Akmal aka' },
  debt: { remainingFormatted: '1 250 000', totalFormatted: '2 000 000' },
  company: { phone: '+998900000000', card: '0000', cardOwner: 'Egasi' },
};

const ZWS = '​';

describe('renderTelegramTemplate', () => {
  it("o'zgaruvchini almashtiradi, shablonning *qalin*/__tagliq__ literal o'tadi", () => {
    const out = renderTelegramTemplate(
      'Salom {{= counterparty.name }}, *__{{= debt.remainingFormatted }}__* som',
      ctx,
    );
    expect(out).toBe('Salom Akmal aka, *__1 250 000__* som');
  });

  it("bir nechta o'zgaruvchini almashtiradi", () => {
    const out = renderTelegramTemplate(
      'Karta {{= company.card }}, egasi {{= company.cardOwner }}, tel {{= company.phone }}',
      ctx,
    );
    expect(out).toBe('Karta 0000, egasi Egasi, tel +998900000000');
  });

  it("o'zgaruvchi QIYMATIdagi markdown belgisi mdSafe-escape qilinadi (format buzilmaydi)", () => {
    const out = renderTelegramTemplate('Ism: {{= counterparty.name }}', {
      ...ctx,
      counterparty: { name: 'a*b_c' },
    });
    // Har maxsus belgidan keyin zero-width space — display'da bilinmaydi, lekin
    // GramJS parseri uni delimiter deb o'qiy olmaydi.
    expect(out).toBe(`Ism: a*${ZWS}b_${ZWS}c`);
  });

  it("shablonning O'ZIDAGI markdown escape QILINMAYDI (author nazorati)", () => {
    const out = renderTelegramTemplate('*qalin* va __tagliq__', ctx);
    expect(out).toBe('*qalin* va __tagliq__'); // ZWS yo'q
  });

  it("buzuq o'zgaruvchi Eta throw qiladi (service saqlashdan oldin tutadi)", () => {
    expect(() => renderTelegramTemplate('{{= custamer.name }}', ctx)).toThrow();
  });
});
