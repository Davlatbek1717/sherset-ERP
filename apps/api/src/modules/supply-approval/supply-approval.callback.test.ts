import { describe, expect, it } from 'vitest';
import {
  adminKeyboard,
  buildCallbackData,
  confirmKeyboard,
  doubleConfirmKeyboard,
  omborchiKeyboard,
  parseCallbackData,
} from './supply-approval.callback.js';

const ID = '11111111-1111-1111-1111-111111111111';

describe('supply-approval callback protocol', () => {
  it('build → parse round-trip (barcha action)', () => {
    expect(parseCallbackData(buildCallbackData('cfm', ID))).toEqual({
      action: 'cfm',
      supplyId: ID,
    });
    expect(parseCallbackData(buildCallbackData('cfm2', ID))).toEqual({
      action: 'cfm2',
      supplyId: ID,
    });
    expect(parseCallbackData(buildCallbackData('rej', ID))).toEqual({
      action: 'rej',
      supplyId: ID,
    });
    expect(parseCallbackData(buildCallbackData('cxl', ID))).toEqual({
      action: 'cxl',
      supplyId: ID,
    });
  });

  it('callback_data ≤ 64 bayt (Telegram limiti)', () => {
    expect(buildCallbackData('cfm2', ID).length).toBeLessThanOrEqual(64);
  });

  it("noto'g'ri/begona data → null", () => {
    expect(parseCallbackData(`other:cfm:${ID}`)).toBeNull();
    expect(parseCallbackData(`sa:bad:${ID}`)).toBeNull();
    expect(parseCallbackData('sa:cfm:')).toBeNull();
    expect(parseCallbackData('sa:cfm')).toBeNull();
    expect(parseCallbackData('random text')).toBeNull();
  });

  it("keyboardlar to'g'ri callback_data beradi", () => {
    const cfm = confirmKeyboard(ID);
    expect(cfm.inline_keyboard[0][0].callback_data).toBe(`sa:cfm:${ID}`);
    expect(cfm.inline_keyboard[0][1].callback_data).toBe(`sa:rej:${ID}`);
    const dbl = doubleConfirmKeyboard(ID);
    expect(dbl.inline_keyboard[0][0].callback_data).toBe(`sa:cfm2:${ID}`);
    expect(dbl.inline_keyboard[1][0].callback_data).toBe(`sa:cxl:${ID}`);
  });

  // ── Omborchi (Faza D2) ────────────────────────────────────────────────────
  it('omborchi action (ocfm/oadj) round-trip', () => {
    expect(parseCallbackData(buildCallbackData('ocfm', ID))).toEqual({
      action: 'ocfm',
      supplyId: ID,
    });
    expect(parseCallbackData(buildCallbackData('oadj', ID))).toEqual({
      action: 'oadj',
      supplyId: ID,
    });
    expect(buildCallbackData('ocfm', ID).length).toBeLessThanOrEqual(64);
  });

  it("omborchiKeyboard to'g'ri callback_data beradi", () => {
    const kb = omborchiKeyboard(ID);
    expect(kb.inline_keyboard[0][0].callback_data).toBe(`sa:ocfm:${ID}`);
    expect(kb.inline_keyboard[0][1].callback_data).toBe(`sa:oadj:${ID}`);
  });

  // ── Admin (Faza D3) ───────────────────────────────────────────────────────
  it('admin action (acfm/arej) round-trip', () => {
    expect(parseCallbackData(buildCallbackData('acfm', ID))).toEqual({
      action: 'acfm',
      supplyId: ID,
    });
    expect(parseCallbackData(buildCallbackData('arej', ID))).toEqual({
      action: 'arej',
      supplyId: ID,
    });
    expect(buildCallbackData('arej', ID).length).toBeLessThanOrEqual(64);
  });

  it("adminKeyboard to'g'ri callback_data beradi", () => {
    const kb = adminKeyboard(ID);
    expect(kb.inline_keyboard[0][0].callback_data).toBe(`sa:acfm:${ID}`);
    expect(kb.inline_keyboard[0][1].callback_data).toBe(`sa:arej:${ID}`);
  });
});
