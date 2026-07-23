import { describe, expect, it } from 'vitest';
import { ipInCidr, isIpAllowed, normalizeRequestIp, parseIpv4 } from './ip-match.js';

describe('parseIpv4', () => {
  it('parses dotted quads', () => {
    expect(parseIpv4('0.0.0.0')).toBe(0);
    expect(parseIpv4('127.0.0.1')).toBe(0x7f000001);
    expect(parseIpv4('255.255.255.255')).toBe(0xffffffff);
  });

  it('rejects malformed input', () => {
    expect(parseIpv4('')).toBeNull();
    expect(parseIpv4('1.2.3')).toBeNull();
    expect(parseIpv4('1.2.3.4.5')).toBeNull();
    expect(parseIpv4('256.0.0.1')).toBeNull();
    expect(parseIpv4('a.b.c.d')).toBeNull();
    expect(parseIpv4('192.168.0.0/24')).toBeNull();
  });
});

describe('normalizeRequestIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    expect(normalizeRequestIp('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7');
  });
  it('strips the IPv6-mapped prefix', () => {
    expect(normalizeRequestIp('::ffff:192.168.1.10')).toBe('192.168.1.10');
  });
  it('maps IPv6 loopback to IPv4 loopback', () => {
    expect(normalizeRequestIp('::1')).toBe('127.0.0.1');
  });
  it('handles empty input', () => {
    expect(normalizeRequestIp(undefined)).toBeNull();
    expect(normalizeRequestIp('')).toBeNull();
  });
});

describe('ipInCidr', () => {
  it('matches inside the network', () => {
    expect(ipInCidr('192.168.0.42', '192.168.0.0/24')).toBe(true);
    expect(ipInCidr('192.168.1.42', '192.168.0.0/24')).toBe(false);
    expect(ipInCidr('10.5.5.5', '10.0.0.0/8')).toBe(true);
  });
  it('/32 is exact-match, /0 is everything', () => {
    expect(ipInCidr('1.2.3.4', '1.2.3.4/32')).toBe(true);
    expect(ipInCidr('1.2.3.5', '1.2.3.4/32')).toBe(false);
    expect(ipInCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });
  it('rejects malformed cidr or ip', () => {
    expect(ipInCidr('1.2.3.4', '1.2.3.4')).toBe(false);
    expect(ipInCidr('1.2.3.4', '1.2.3.4/33')).toBe(false);
    expect(ipInCidr('bogus', '10.0.0.0/8')).toBe(false);
  });
});

describe('isIpAllowed (moysklad «Сеть» semantics)', () => {
  it('no restriction → allowed from anywhere (even unparseable ip)', () => {
    expect(isIpAllowed('1.2.3.4', [], [])).toBe(true);
    expect(isIpAllowed(undefined, undefined, undefined)).toBe(true);
  });

  it('exact IP allowlist', () => {
    expect(isIpAllowed('203.0.113.7', ['203.0.113.7'], [])).toBe(true);
    expect(isIpAllowed('203.0.113.8', ['203.0.113.7'], [])).toBe(false);
  });

  it('CIDR allowlist', () => {
    expect(isIpAllowed('192.168.0.99', [], ['192.168.0.0/24'])).toBe(true);
    expect(isIpAllowed('192.168.2.99', [], ['192.168.0.0/24'])).toBe(false);
  });

  it('either list grants access', () => {
    expect(isIpAllowed('10.0.0.5', ['203.0.113.7'], ['10.0.0.0/8'])).toBe(true);
  });

  it('x-forwarded-for chain + v6-mapped uses the client hop', () => {
    expect(isIpAllowed('::ffff:203.0.113.7, 10.0.0.1', ['203.0.113.7'], [])).toBe(true);
  });

  it('fails closed on unparseable ip when a restriction exists', () => {
    expect(isIpAllowed(undefined, ['203.0.113.7'], [])).toBe(false);
    expect(isIpAllowed('fe80::1', ['203.0.113.7'], [])).toBe(false);
  });
});
