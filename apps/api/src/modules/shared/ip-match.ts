/**
 * IPv4 allowlist matching for the moysklad employee card «Сеть» block
 * («Доступ только с адресов» = exact IPs, «Доступ только из сети» = CIDR).
 *
 * Semantics mirror moysklad: when BOTH lists are empty the employee may log
 * in from anywhere; when at least one entry exists, the request IP must match
 * one of them. Non-IPv4 request IPs (e.g. bare IPv6) never match a non-empty
 * list — fail closed, except loopback which maps to 127.0.0.1.
 */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Parse dotted-quad IPv4 into a uint32, or null if malformed. */
export function parseIpv4(ip: string): number | null {
  const m = IPV4_RE.exec(ip.trim());
  if (!m) return null;
  let value = 0;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(m[i]);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

/**
 * Normalize a request IP as delivered by fastify/x-forwarded-for:
 * take the first entry of a comma list, strip the IPv6-mapped prefix
 * (::ffff:1.2.3.4), and map IPv6 loopback to 127.0.0.1.
 */
export function normalizeRequestIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim() ?? '';
  if (first === '::1') return '127.0.0.1';
  const unmapped = first.startsWith('::ffff:') ? first.slice(7) : first;
  return unmapped || null;
}

/** True when `ip` lies inside `cidr` (e.g. 192.168.0.0/24). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [network, prefixRaw] = cidr.split('/');
  if (!network || prefixRaw === undefined) return false;
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipNum = parseIpv4(ip);
  const netNum = parseIpv4(network);
  if (ipNum === null || netNum === null) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (netNum & mask);
}

/**
 * moysklad «Сеть» rule: empty lists → allowed from anywhere; otherwise the
 * request IP must equal one allowed address OR fall inside one allowed net.
 * Unparseable request IPs are rejected when a restriction exists.
 */
export function isIpAllowed(
  rawIp: string | undefined | null,
  allowedIps: readonly string[] | undefined,
  allowedNetworks: readonly string[] | undefined,
): boolean {
  const ips = allowedIps ?? [];
  const nets = allowedNetworks ?? [];
  if (ips.length === 0 && nets.length === 0) return true;
  const ip = normalizeRequestIp(rawIp);
  if (!ip || parseIpv4(ip) === null) return false;
  if (ips.some((allowed) => parseIpv4(allowed) !== null && parseIpv4(allowed) === parseIpv4(ip))) {
    return true;
  }
  return nets.some((net) => ipInCidr(ip, net));
}
