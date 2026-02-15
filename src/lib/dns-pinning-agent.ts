import { Agent } from "undici";
import dns from "node:dns";

import { isPrivateIP } from "@/lib/security";

/**
 * Custom DNS lookup that resolves all IPs, validates them against isPrivateIP(),
 * and returns the first safe IP for the TCP connection.
 *
 * If ANY resolved IP is private, the connection is rejected entirely.
 * DNS resolution failures are also rejected (fail-closed).
 *
 * Exported for unit testing — not intended for direct use outside this module.
 */
export function pinnedLookup(
  hostname: string,
  dnsOptions: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
): void {
  dns.lookup(
    hostname,
    { ...dnsOptions, all: true },
    (err, addresses) => {
      if (err) {
        callback(err, "", 0);
        return;
      }

      const results = Array.isArray(addresses) ? addresses : [];

      if (results.length === 0) {
        callback(
          new Error(
            `DNS resolution for ${hostname} returned no addresses`,
          ),
          "",
          0,
        );
        return;
      }

      // Validate ALL resolved IPs — reject if any is private
      for (const { address } of results) {
        if (isPrivateIP(address)) {
          callback(
            new Error(
              `DNS resolution for ${hostname} returned private IP: ${address}`,
            ),
            "",
            0,
          );
          return;
        }
      }

      // All IPs are public — pin the first one for the TCP connection
      callback(null, results[0].address, results[0].family);
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
      lookup: pinnedLookup,
      timeout: 30_000,
    },
    bodyTimeout: 60_000,
    headersTimeout: 60_000,
    maxCachedSessions: options?.maxCachedSessions,
  });
}

/** Module-level singleton agent for use across the application. */
export const dnsPinningAgent: Agent = createDnsPinningAgent();
