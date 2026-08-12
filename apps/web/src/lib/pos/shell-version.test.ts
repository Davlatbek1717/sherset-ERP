import { SHELL_DEFAULT_PRINTER_MIN, shellAtLeast } from '@/lib/pos/shell-version';
import { describe, expect, it } from 'vitest';

describe('shellAtLeast — exe versiya darvozasi', () => {
  it('teng versiya O`TADI', () => {
    expect(shellAtLeast('1.4.0', '1.4.0')).toBe(true);
  });

  it('yuqori versiya o`tadi (minor va major bo`yicha)', () => {
    expect(shellAtLeast('1.4.1', '1.4.0')).toBe(true);
    expect(shellAtLeast('1.5.0', '1.4.0')).toBe(true);
    expect(shellAtLeast('2.0.0', '1.4.0')).toBe(true);
  });

  it('past versiya O`TMAYDI', () => {
    expect(shellAtLeast('1.3.0', '1.4.0')).toBe(false);
    expect(shellAtLeast('0.9.9', '1.4.0')).toBe(false);
  });

  // 🔴 Leksikografik taqqoslash bu yerda 10 < 9 deb xato qilardi.
  it('ikki xonali qismlarni SON sifatida taqqoslaydi', () => {
    expect(shellAtLeast('1.10.0', '1.9.0')).toBe(true);
    expect(shellAtLeast('1.9.0', '1.10.0')).toBe(false);
  });

  // Eski exe'da maydon umuman bo'lmasligi mumkin — «yo'q» = ESKI, darvoza yopiq.
  it('versiya yo`q bo`lsa darvoza YOPIQ', () => {
    expect(shellAtLeast(undefined, '1.4.0')).toBe(false);
    expect(shellAtLeast('', '1.4.0')).toBe(false);
    expect(shellAtLeast('nonsense', '1.4.0')).toBe(false);
  });

  it('minimal versiya B1 bilan mos', () => {
    expect(SHELL_DEFAULT_PRINTER_MIN).toBe('1.4.0');
  });
});
