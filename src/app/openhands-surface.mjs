import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import http from "node:http";
import https from "node:https";
import { WebSocket, WebSocketServer } from "ws";
import { openHandsSettings } from "./providers/openhands.mjs";
import { fail } from "./store.mjs";

function hash(value) {
  return createHash("sha256").update(value).digest();
}

export function mintOpenHandsSurface(
  store,
  runId,
  { lifetimeMs = 8 * 60 * 60 * 1000 } = {},
) {
  const run = store.get("runs", runId);
  if (!run || run.provider !== "openhands" || !run.providerSessionId)
    fail("OpenHands surface is unavailable for this run.", 409);
  const token = "avoozl_surface_" + randomBytes(32).toString("hex"),
    id = "surface-" + randomUUID(),
    now = new Date(),
    record = {
      id,
      runId,
      conversationId: run.providerSessionId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + lifetimeMs).toISOString(),
    };
  store.db
    .prepare(
      "INSERT INTO surface_capabilities(id,run_id,conversation_id,token_hash,expires_at,body) VALUES (?,?,?,?,?,?)",
    )
    .run(
      id,
      runId,
      run.providerSessionId,
      hash(token),
      record.expiresAt,
      JSON.stringify(record),
    );
  return { token, ...record };
}

export function authorizeOpenHandsSurface(store, runId, token) {
  if (typeof token !== "string" || !token.startsWith("avoozl_surface_"))
    fail("OpenHands surface capability required.", 403);
  const candidate = hash(token),
    rows = store.db
      .prepare(
        "SELECT * FROM surface_capabilities WHERE run_id=? ORDER BY rowid DESC LIMIT 8",
      )
      .all(runId);
  for (const row of rows) {
    const expected = Buffer.from(row.token_hash);
    if (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    ) {
      if (Date.parse(row.expires_at) <= Date.now())
        fail("OpenHands surface capability expired.", 403);
      const capability = JSON.parse(row.body),
        run = store.get("runs", runId);
      if (
        !run ||
        run.provider !== "openhands" ||
        run.providerSessionId !== capability.conversationId
      )
        fail("OpenHands surface is no longer bound to this run.", 403);
      return capability;
    }
  }
  fail("OpenHands surface capability refused.", 403);
}

function routeParts(pathname) {
  const match = pathname.match(/^\/openhands\/([^/]+)(\/.*)$/);
  return match
    ? { runId: decodeURIComponent(match[1]), upstreamPath: match[2] }
    : null;
}

export function openHandsSurfaceSocketRoute(
  pathname,
  searchParams = new URLSearchParams(),
) {
  const parts = routeParts(pathname),
    match = parts?.upstreamPath.match(
      /^\/sockets\/(events|session)\/([^/]+)$/,
    );
  if (!parts || !match) return null;
  const kind = match[1],
    entries = [...searchParams.entries()];
  if (
    (kind === "events" && entries.length !== 0) ||
    (kind === "session" &&
      (entries.length > 1 ||
        (entries.length === 1 &&
          (entries[0][0] !== "after_seq" ||
            !/^(?:-1|0|[1-9]\d*)$/.test(entries[0][1])))))
  )
    return null;
  try {
    return {
      ...parts,
      kind,
      conversationId: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export function openHandsSurfaceRouteAllowed(
  pathname,
  conversationId,
  method,
  mode,
  searchParams = new URLSearchParams(),
) {
  if (method === "GET" && ["/health", "/server_info"].includes(pathname))
    return true;
  if (pathname === "/api/auth/workspace-session")
    return method === "POST" || method === "DELETE";
  if (pathname === "/api/conversations") {
    const entries = [...searchParams.entries()];
    return (
      method === "GET" &&
      entries.length === 1 &&
      entries[0][0] === "ids" &&
      entries[0][1] === conversationId
    );
  }
  const prefix = "/api/conversations/" + encodeURIComponent(conversationId);
  if (!pathname.startsWith(prefix)) return false;
  const tail = pathname.slice(prefix.length);
  if (tail && !tail.startsWith("/")) return false;
  if (
    tail.split("/").some((part) => {
      try {
        return [".", ".."].includes(decodeURIComponent(part));
      } catch {
        return true;
      }
    })
  )
    return false;
  if (method === "GET" || method === "HEAD")
    return (
      tail === "" ||
      tail === "/runtime" ||
      tail === "/agent_final_response" ||
      /^\/events(?:\/(?:search|count|[^/]+))?$/.test(tail) ||
      /^\/(?:workspace|bash\/bash_events|file\/download|git\/(?:changes|diff|commits))(?:\/|$)/.test(
        tail,
      )
    );
  if (method !== "POST") return false;
  if (
    [
      "/events",
      "/run",
      "/pause",
      "/interrupt",
      "/events/respond_to_confirmation",
      "/ask_agent",
      "/condense",
    ].includes(tail)
  )
    return true;
  if (mode !== "implement") return false;
  return /^\/(?:bash\/(?:start_bash_command|execute_bash_command|bash_commands\/[^/]+\/stop)|file\/(?:upload|create_directory))(?:\/|$)/.test(
    tail,
  );
}

function requestToken(req) {
  const header = req.headers["x-session-api-key"];
  if (header) return header;
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("avoozl_oh_surface="));
  return cookie
    ? decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1))
    : "";
}

function proxyHeaders(req, settings, target) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  delete headers.cookie;
  delete headers.origin;
  headers.host = target.host;
  if (settings.apiKey) headers["x-session-api-key"] = settings.apiKey;
  else delete headers["x-session-api-key"];
  return headers;
}

export async function proxyOpenHandsSurface(req, res, store, url) {
  const parts = routeParts(url.pathname);
  if (!parts) return false;
  const capability = authorizeOpenHandsSurface(
      store,
      parts.runId,
      requestToken(req),
    ),
    run = store.get("runs", parts.runId),
    method = req.method || "GET";
  if (
    !openHandsSurfaceRouteAllowed(
      parts.upstreamPath,
      capability.conversationId,
      method,
      run.mode,
      url.searchParams,
    )
  )
    fail("OpenHands surface route refused.", 403);
  if (parts.upstreamPath === "/api/auth/workspace-session") {
    const path =
        "/openhands/" + encodeURIComponent(parts.runId) + "/",
      cookie =
        method === "POST"
          ? "avoozl_oh_surface=" +
            encodeURIComponent(requestToken(req)) +
            "; HttpOnly; SameSite=Strict; Path=" +
            path
          : "avoozl_oh_surface=; HttpOnly; SameSite=Strict; Max-Age=0; Path=" +
            path;
    res.writeHead(204, { "Set-Cookie": cookie });
    res.end();
    return true;
  }
  const settings = openHandsSettings(),
    target = new URL(parts.upstreamPath + url.search, settings.host),
    transport = target.protocol === "https:" ? https : http;
  await new Promise((resolve, reject) => {
    const upstream = transport.request(
      target,
      {
        method,
        headers: proxyHeaders(req, settings, target),
      },
      (response) => {
        const headers = { ...response.headers };
        delete headers["set-cookie"];
        res.writeHead(response.statusCode || 502, headers);
        response.pipe(res);
        response.on("end", resolve);
      },
    );
    upstream.on("error", reject);
    req.pipe(upstream);
  });
  return true;
}

export function installOpenHandsWebSocketProxy(server, store) {
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    let url, parts;
    try {
      url = new URL(req.url, "http://" + req.headers.host);
      parts = openHandsSurfaceSocketRoute(url.pathname, url.searchParams);
      if (!parts) return socket.destroy();
      const run = store.get("runs", parts.runId);
      if (
        !run ||
        run.provider !== "openhands" ||
        run.providerSessionId !== parts.conversationId
      )
        return socket.destroy();
    } catch {
      return socket.destroy();
    }
    sockets.handleUpgrade(req, socket, head, (client) => {
      let upstream,
        authorized = false;
      const timer = setTimeout(
        () => client.close(4401, "Authentication required"),
        10000,
      );
      client.once("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          authorizeOpenHandsSurface(
            store,
            parts.runId,
            message.session_api_key,
          );
          authorized = true;
          clearTimeout(timer);
          const settings = openHandsSettings(),
            target = new URL(parts.upstreamPath + url.search, settings.host);
          target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
          upstream = new WebSocket(target);
          upstream.on("open", () => {
            if (settings.apiKey)
              upstream.send(
                JSON.stringify({
                  type: "auth",
                  session_api_key: settings.apiKey,
                }),
              );
          });
          upstream.on("message", (value, binary) =>
            client.send(value, { binary }),
          );
          upstream.on("close", (code, reason) => client.close(code, reason));
          upstream.on("error", () =>
            client.close(1011, "Upstream unavailable"),
          );
          client.on("message", (value, binary) => {
            if (authorized && upstream?.readyState === WebSocket.OPEN)
              upstream.send(value, { binary });
          });
          client.on("close", () => upstream?.close());
        } catch {
          clearTimeout(timer);
          client.close(4403, "Capability refused");
        }
      });
    });
  });
}
