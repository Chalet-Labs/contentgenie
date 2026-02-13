import net from "node:net";
import dns from "node:dns";
import { promisify } from "node:util";

const lookup = promisify(dns.lookup);

/**
 * Checks if an IP address is in a private, loopback, or link-local range.
 * This is used to prevent SSRF attacks by blocking access to internal resources.
 */
export function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((n) => parseInt(n, 10));

    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return true;

    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;

    // 169.254.0.0/16 (Link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // 0.0.0.0/8 (Current network/Broadcast)
    if (parts[0] === 0) return true;

    // 100.64.0.0/10 (Shared Address Space)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;

    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;

    // 224.0.0.0/4 (Multicast)
    if (parts[0] >= 224 && parts[0] <= 239) return true;

    // 240.0.0.0/4 (Reserved)
    if (parts[0] >= 240) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const normalizedIp = ip.toLowerCase();

    // Loopback ::1
    if (normalizedIp === "::1" || normalizedIp === "0:0:0:0:0:0:0:1") return true;

    // Unique Local Address fc00::/7
    if (normalizedIp.startsWith("fc") || normalizedIp.startsWith("fd")) return true;

    // Link-local Address fe80::/10
    if (normalizedIp.startsWith("fe8") || normalizedIp.startsWith("fe9") || normalizedIp.startsWith("fea") || normalizedIp.startsWith("feb")) return true;

    // IPv4-mapped IPv6 ::ffff:0:0/96
    if (normalizedIp.startsWith("::ffff:")) {
      const ipv4Part = normalizedIp.substring("::ffff:".length);
      if (net.isIPv4(ipv4Part)) {
        // Dot-decimal form: ::ffff:127.0.0.1
        return isPrivateIP(ipv4Part);
      }
      // Hex notation form: ::ffff:7f00:1 (same as 127.0.0.1)
      const hexParts = ipv4Part.split(":");
      if (hexParts.length === 2) {
        const high = parseInt(hexParts[0], 16);
        const low = parseInt(hexParts[1], 16);
        if (!isNaN(high) && !isNaN(low)) {
          const reconstructedIPv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
          return isPrivateIP(reconstructedIPv4);
        }
      }
    }

    // Unspecified address ::
    if (normalizedIp === "::" || normalizedIp === "0:0:0:0:0:0:0:0") return true;

    // Discard prefix 100::/64
    if (normalizedIp.startsWith("100:") || normalizedIp.startsWith("0100:")) return true;

    // Documentation prefix 2001:db8::/32
    if (normalizedIp.startsWith("2001:db8")) return true;

    // Teredo prefix 2001::/32 (match both compressed and expanded forms)
    if (
      normalizedIp.startsWith("2001:0:") ||
      normalizedIp.startsWith("2001::") ||
      normalizedIp.startsWith("2001:0000")
    ) return true;
  }

  return false;
}

/**
 * Validates if a URL is safe from SSRF by checking its protocol, port, and resolving its hostname.
 */
export async function isSafeUrl(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString);

    // Only allow http and https protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    // Restrict to standard web ports per protocol to prevent internal port scanning
    const isStandardPort =
      (url.protocol === "http:" && (url.port === "" || url.port === "80")) ||
      (url.protocol === "https:" && (url.port === "" || url.port === "443"));
    if (!isStandardPort) {
      return false;
    }

    const hostname = url.hostname;

    // Remove brackets for IPv6 hostnames (e.g., [::1])
    const cleanHostname = hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

    // If hostname is an IP, check if it's private
    if (net.isIP(cleanHostname)) {
      return !isPrivateIP(cleanHostname);
    }

    // Block common local hostnames before DNS resolution
    const lowerHostname = cleanHostname.toLowerCase();
    if (
      lowerHostname === "localhost" ||
      lowerHostname.endsWith(".local") ||
      lowerHostname.endsWith(".localhost")
    ) {
      return false;
    }

    // Resolve hostname to all IPs and reject if any is private
    try {
      const addresses = await lookup(cleanHostname, { all: true });
      const results = Array.isArray(addresses) ? addresses : [addresses];
      for (const { address } of results) {
        if (isPrivateIP(address)) {
          return false;
        }
      }
      return results.length > 0;
    } catch {
      // If resolution fails, we cannot verify the safety, so we block it
      return false;
    }
  } catch {
    // If URL parsing fails, it's not a safe/valid URL
    return false;
  }
}

/**
 * Safely fetches a URL by validating every redirect against SSRF protections.
 * This prevents attackers from bypassing checks via redirects.
 *
 * Note: This function assumes GET-only usage (e.g., RSS feed fetching).
 * It does not handle HTTP method changes on 303 redirects (POST→GET).
 */
export async function safeFetch(
  url: string,
  options: RequestInit = {}
): Promise<string> {
  const MAX_REDIRECTS = 5;
  const SENSITIVE_HEADERS = ["authorization", "cookie", "proxy-authorization"];
  let currentUrl = url;
  let redirectCount = 0;
  const initialOrigin = new URL(url).origin;

  // Build persistent request options outside the loop so header mutations survive across iterations
  const { redirect: _ignoredRedirect, headers: originalHeaders, ...baseOptions } = options ?? {};
  let currentHeaders: Headers | undefined = originalHeaders
    ? new Headers(originalHeaders as HeadersInit)
    : undefined;

  while (redirectCount < MAX_REDIRECTS) {
    // 1. Validate URL security
    if (!(await isSafeUrl(currentUrl))) {
      throw new Error(`Unsafe URL detected: ${currentUrl}`);
    }

    // 2. Fetch with manual redirect handling
    const response = await fetch(currentUrl, {
      ...baseOptions,
      headers: currentHeaders,
      redirect: "manual",
    });

    // 3. Handle redirects (301, 302, 303, 307, 308) — exclude 304 Not Modified
    const REDIRECT_CODES = [301, 302, 303, 307, 308];
    if (REDIRECT_CODES.includes(response.status)) {
      const location = response.headers.get("Location");
      if (!location) {
        throw new Error("Redirect response missing Location header");
      }

      // Resolve relative URLs
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid redirect URL: ${location} (${message})`);
      }

      // Strip sensitive headers when leaving the initial origin to prevent credential leaking
      const newOrigin = new URL(currentUrl).origin;
      if (initialOrigin !== newOrigin && currentHeaders) {
        for (const name of SENSITIVE_HEADERS) {
          currentHeaders.delete(name);
        }
      }

      redirectCount++;

      // Consume the redirect response body to avoid resource leaks
      try {
        await response.text();
      } catch {
        // Ignore errors while consuming the body
      }

      continue;
    }

    // 4. Return successful response
    if (response.ok) {
      return response.text();
    }

    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText}`
    );
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}
