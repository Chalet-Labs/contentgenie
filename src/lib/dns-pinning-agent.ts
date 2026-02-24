import { Agent } from "undici";
import dns from "node:dns";

import { isPrivateIP } from "@/lib/security";

/**
 * Custom DNS lookup that resolves all IPs, validates them against isPrivateIP(),
 * and returns only safe (public) IPs for the TCP connection.
 *
 * If ANY resolved IP is private, the connection is rejected entirely.
 * DNS resolution failures are also rejected (fail-closed).
 *
 * Respects `dnsOptions.all`: when true (undici 7+ npm package default), returns
 * the full validated address array; otherwise returns a single address + family.
 *
 * Exported for unit testing — not intended for direct use outside this module.
 */
export function pinnedLookup(
  hostname: string,
  dnsOptions: dns.LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
): void;
export function pinnedLookup(
  hostname: string,
  dnsOptions: dns.LookupOneOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
): void;
export function pinnedLookup(
  hostname: string,
  dnsOptions: dns.LookupOptions,
  callback:
    | ((err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void)
    | ((err: NodeJS.ErrnoException | null, address: string, family: number) => void),
): void {
  dns.lookup(
    hostname,
    { ...dnsOptions, all: true },
    (err, addresses) => {
      const callbackAll = callback as (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void;
      const callbackOne = callback as (err: NodeJS.ErrnoException | null, address: string, family: number) => void;
      const fail = (e: NodeJS.ErrnoException | Error) =>
        dnsOptions.all ? callbackAll(e as NodeJS.ErrnoException, []) : callbackOne(e as NodeJS.ErrnoException, "", 0);

      if (err) { fail(err); return; }

      const results = Array.isArray(addresses) ? addresses : [];

      if (results.length === 0) {
        fail(new Error(`DNS resolution for ${hostname} returned no addresses`));
        return;
      }

      // Validate ALL resolved IPs — reject if any is private
      for (const { address } of results) {
        if (isPrivateIP(address)) {
          fail(new Error(`DNS resolution for ${hostname} returned private IP: ${address}`));
          return;
        }
      }

      // Return format matching what the caller expects:
      // undici 7+ npm package passes all:true and expects the array format;
      // older versions expect (address, family).
      if (dnsOptions.all) {
        callbackAll(null, results);
      } else {
        callbackOne(null, results[0].address, results[0].family);
      }
    },
  );
}

/**
 * Creates a DNS-pinning undici Agent that validates resolved IPs against isPrivateIP().
 *
 * The custom connect.lookup resolves DNS once, validates all returned IPs,
 * and pins the validated IP for the TCP connection. This eliminates the
 * TOCTOU window where an attacker could DNS-rebind between a pre-check
 * and the actual connection.
 */
export function createDnsPinningAgent(options?: {
  maxCachedSessions?: number;
}): Agent {
  return new Agent({
    connect: {
      // pinnedLookup is overloaded for type safety when called directly.
      // The cast is required because undici's connect.lookup type declarations
      // still use the legacy single-address callback signature, while the
      // runtime in undici 7+ (npm package) passes all:true and expects an
      // array callback — which pinnedLookup handles correctly at runtime.
      lookup: pinnedLookup as (hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => void,
      timeout: 30_000,
    },
    bodyTimeout: 60_000,
    headersTimeout: 60_000,
    maxCachedSessions: options?.maxCachedSessions,
  });
}

/** Module-level singleton agent for use across the application. */
export const dnsPinningAgent: Agent = createDnsPinningAgent();
