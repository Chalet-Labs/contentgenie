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
      const parts = normalizedIp.split(":");
      const lastPart = parts[parts.length - 1];
      if (net.isIPv4(lastPart)) {
        return isPrivateIP(lastPart);
      }
    }

    // Unspecified address ::
    if (normalizedIp === "::" || normalizedIp === "0:0:0:0:0:0:0:0") return true;

    // Discard prefix 100::/64
    if (normalizedIp.startsWith("0100:")) return true;

    // Documentation prefix 2001:db8::/32
    if (normalizedIp.startsWith("2001:db8")) return true;

    // Teredo prefix 2001::/32
    if (normalizedIp.startsWith("2001:0000")) return true;
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

    // Restrict to standard web ports to prevent internal port scanning
    // Standard ports are empty (defaults to 80/443), or explicitly 80/443
    if (url.port !== "" && url.port !== "80" && url.port !== "443") {
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

    // Resolve hostname to IP and check if it's private
    try {
      // We use dns.lookup which follows system configuration (e.g., /etc/hosts)
      const { address } = await lookup(cleanHostname);
      return !isPrivateIP(address);
    } catch {
      // If resolution fails, we cannot verify the safety, so we block it
      return false;
    }
  } catch {
    // If URL parsing fails, it's not a safe/valid URL
    return false;
  }
}
