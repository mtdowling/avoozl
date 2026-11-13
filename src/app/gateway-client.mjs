// Calls from the app backend to the Kiro Crew gateway, on the app's own
// token. The backend is the only Avoozl process that holds the app secret.
import { createHmac, timingSafeEqual } from "node:crypto";

// A client for the gateway routes the app token reaches, or null when the
// gateway gave this backend no trusted callback origin. The origin is used
// only when its proof (HMAC-SHA256 of the origin under the app secret)
// matches, so an inherited or spoofed KIROCREW_GATEWAY_ORIGIN is never
// trusted with the secret. `call(route, init)` adds the app token and
// exchanges it once more when the gateway answers 401.
export function gatewayClient(env = process.env, request = fetch) {
  const origin = env.KIROCREW_GATEWAY_ORIGIN,
    secret = env.KIROCREW_PROXY_SECRET,
    proof = env.KIROCREW_GATEWAY_ORIGIN_PROOF,
    app = env.KIROCREW_APP_NAME || "avoozl";
  if (!origin || !secret || !proof) return null;
  const expected = createHmac("sha256", secret).update(origin).digest("hex");
  if (
    proof.length !== expected.length ||
    !timingSafeEqual(Buffer.from(proof), Buffer.from(expected))
  )
    return null;
  let token = null;
  const exchange = async () => {
    const response = await request(
      `${origin}/api/apps/${encodeURIComponent(app)}/token`,
      { method: "POST", headers: { "X-App-Secret": secret } },
    );
    const value = await response.json().catch(() => ({}));
    if (!response.ok || typeof value.token !== "string")
      throw Error(`Kiro Crew refused the app token (${response.status}).`);
    return value.token;
  };
  return {
    async call(route, init = {}) {
      for (let attempt = 0; ; attempt++) {
        token ||= await exchange();
        const join = route.includes("?") ? "&" : "?",
          response = await request(
            `${origin}${route}${join}token=${encodeURIComponent(token)}`,
            init,
          );
        // An expired token is exchanged once more; any other answer stands.
        if (response.status !== 401 || attempt > 0) return response;
        token = null;
      }
    },
  };
}
