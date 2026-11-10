import os from "node:os";
import { isIP } from "node:net";

export function privateAddress(value = "") {
  const address = value.replace(/^::ffff:/, "");
  if (address === "::1") return true;
  if (isIP(address) === 6) return /^(fc|fd|fe[89ab])/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}
export function networkPolicy({
  host = "127.0.0.1",
  allowedHosts = [],
  allowedOrigins = [],
  interfaces = os.networkInterfaces(),
  hostname = os.hostname(),
} = {}) {
  const names = new Set(["localhost", "127.0.0.1", "[::1]", ...allowedHosts]),
    origins = new Set(
      allowedOrigins.map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return "";
        }
      }),
    );
  origins.delete("");
  if (host !== "127.0.0.1" && host !== "::1") {
    names.add(hostname.toLowerCase());
    names.add(hostname.toLowerCase().replace(/\.local$/, "") + ".local");
    for (const rows of Object.values(interfaces))
      for (const row of rows || [])
        if (privateAddress(row.address))
          names.add(
            row.family === "IPv6"
              ? "[" + row.address.toLowerCase() + "]"
              : row.address,
          );
  }
  return (req, port) => {
    if (!privateAddress(req.socket.remoteAddress))
      return "Private network clients only.";
    let url;
    try {
      url = new URL("http://" + req.headers.host);
    } catch {
      return "Invalid site address.";
    }
    if (
      !names.has(url.hostname.toLowerCase()) ||
      Number(url.port || 80) !== port
    )
      return "Site address is not allowed.";
    const trustedOrigin =
      req.headers.origin &&
      (req.headers.origin === url.origin || origins.has(req.headers.origin));
    if (req.headers.origin && !trustedOrigin)
      return "Same-origin request required.";
    if (req.headers["sec-fetch-site"] === "cross-site" && !trustedOrigin)
      return "Same-origin request required.";
    return null;
  };
}
