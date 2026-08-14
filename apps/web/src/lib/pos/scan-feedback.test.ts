/**
 * Skaner-javob tovushlari (POS redizayn F3, spec §5.1).
 *
 * happy-dom'da `AudioContext` YO'Q — shuning uchun bu yerda ikki narsa
 * qulflanadi: (1) qurilmasiz muhitda modul JIM no-op (crash TAQIQ — bip
 * chiqmagani savdoni to'xtatmasligi shart); (2) mock-kontekst bilan tovush
 * shartnomasi: ok = bitta BALAND qisqa ton, notFound = PAST ton ×2, hammasi
 * 600ms ichida; kontekst yagona nusxada kesh qilinadi (brauzer ~6 ta
 * AudioContext bilan cheklaydi).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetScanFeedbackForTests, scanFeedback } from './scan-feedback';

class MockOscillator {
  type = '';
  frequency = { value: 0 };
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  connect = vi.fn();
  start = vi.fn((t: number) => {
    this.startedAt = t;
  });
  stop = vi.fn((t: number) => {
    this.stoppedAt = t;
  });
}

class MockGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn();
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  state = 'running';
  currentTime = 0;
  destination = {};
  oscillators: MockOscillator[] = [];
  resume = vi.fn();
  constructor() {
    MockAudioContext.instances.push(this);
  }
  createOscillator() {
    const osc = new MockOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    return new MockGain();
  }
}

function installMock(): typeof MockAudioContext {
  MockAudioContext.instances = [];
  vi.stubGlobal('AudioContext', MockAudioContext);
  return MockAudioContext;
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetScanFeedbackForTests();
});

describe('scanFeedback — qurilmasiz muhit', () => {
  it('AudioContext YO`Q bo`lsa ok() ham, notFound() ham jim o`tadi (crash TAQIQ)', () => {
    // happy-dom'ning o'zida AudioContext yo'q — hech narsa stub qilinmaydi.
    expect(window.AudioContext).toBeUndefined();
    expect(() => scanFeedback.ok()).not.toThrow();
    expect(() => scanFeedback.notFound()).not.toThrow();
  });

  it('AudioContext konstruktori OTILSA ham crash yo`q', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('autoplay blocked');
        }
      },
    );
    expect(() => scanFeedback.ok()).not.toThrow();
  });
});

describe('scanFeedback — tovush shartnomasi (mock AudioContext)', () => {
  it('ok() — bitta baland qisqa ton, 600ms ichida tugaydi', () => {
    const AC = installMock();
    scanFeedback.ok();

    const ctx = AC.instances[0] as MockAudioContext;
    expect(ctx.oscillators).toHaveLength(1);
    const osc = ctx.oscillators[0] as MockOscillator;
    expect(osc.frequency.value).toBeGreaterThan(1000); // baland
    expect(osc.startedAt).toBe(0);
    expect(osc.stoppedAt).toBeLessThanOrEqual(0.6);
  });

  it('notFound() — PAST ton ×2, ketma-ket, 600ms ichida', () => {
    const AC = installMock();
    scanFeedback.notFound();

    const ctx = AC.instances[0] as MockAudioContext;
    expect(ctx.oscillators).toHaveLength(2);
    const [first, second] = ctx.oscillators as [MockOscillator, MockOscillator];
    expect(first.frequency.value).toBeLessThan(500); // past
    expect(second.frequency.value).toBeLessThan(500);
    // Ikkinchisi birinchisi TUGAGANDAN keyin boshlanadi.
    expect(second.startedAt ?? 0).toBeGreaterThanOrEqual(first.stoppedAt ?? 0);
    expect(second.stoppedAt).toBeLessThanOrEqual(0.6);
  });

  it('notFound toni ok tonidan PAST — kassir eshitib farqlaydi', () => {
    const AC = installMock();
    scanFeedback.ok();
    scanFeedback.notFound();

    const ctx = AC.instances[0] as MockAudioContext;
    const okFreq = (ctx.oscillators[0] as MockOscillator).frequency.value;
    const missFreq = (ctx.oscillators[1] as MockOscillator).frequency.value;
    expect(missFreq).toBeLessThan(okFreq);
  });

  it('kontekst YAGONA nusxada kesh qilinadi (brauzer limiti ~6)', () => {
    const AC = installMock();
    scanFeedback.ok();
    scanFeedback.ok();
    scanFeedback.notFound();
    expect(AC.instances).toHaveLength(1);
  });

  it('suspended kontekst resume qilinadi (autoplay-siyosat)', () => {
    const AC = installMock();
    scanFeedback.ok(); // kontekst yaratildi
    const ctx = AC.instances[0] as MockAudioContext;
    ctx.state = 'suspended';
    scanFeedback.ok();
    expect(ctx.resume).toHaveBeenCalled();
  });
});
