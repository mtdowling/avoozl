// A signed principal for tests that call the Kiro Crew app backend's
// /api/command route, and an environment with no AVOOZL_ variables.
import { createHash, createHmac, randomBytes } from "node:crypto";
import path from "node:path";

export const SECRET = "test-proxy-secret";

// Mirrors kiro_crew/apps/proxy_auth.py `sign_proxy_principal_claim`.
export function sign(body, kind = "owner-session") {
  const issuedAt = Math.floor(Date.now() / 1000),
    claim = {
      issuedAt,
      kind,
      ownerId: kind === "owner-session" ? "owner" : "",
      requestId: randomBytes(16).toString("hex"),
      version: 1,
    },
    encoded = Buffer.from(JSON.stringify(claim)).toString("base64url"),
    signature = createHmac("sha256", SECRET)
      .update(
        [
          "kirocrew-proxy-principal-v1",
          String(issuedAt),
          "POST",
          "/api/command",
          createHash("sha256").update(body).digest("hex"),
          encoded,
        ].join("\n"),
      )
      .digest("hex");
  return `${encoded}.${signature}`;
}

export function isolatedEnv(root) {
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^AVOOZL_/.test(name)) delete env[name];
  return env;
}
