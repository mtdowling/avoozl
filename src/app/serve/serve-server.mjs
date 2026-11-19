// `avoozl serve`: the standalone page on 127.0.0.1 (spec standalone-web, SW3).
// The listener binds the loopback address and nothing else; there is no host
// or bind option. Every request is checked by serve-auth.mjs before any other
// work, then handed to the same dispatch the Kiro Crew app backend uses.
import fs from "node:fs";
import http from "node:http";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { commandContext, dispatchCommand } from "../api/command-dispatch.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { pageTarget } from "../api/direct-links.mjs";
import {
  LINK_REFUSAL,
  LinkStore,
  ServeAuth,
  SIGN_IN_PAGE,
} from "./serve-auth.mjs";

export const HOST = "127.0.0.1";
// The placeholder the built page carries for the CSRF token (either tag form).
const CSRF_META = /<meta name="avoozl-csrf" content=""\s*\/?>/;
const MAX_BODY_BYTES = 1024 * 1024;
const APP_PATH = "/apps/avoozl";
const COMMAND_PATH = `${APP_PATH}/api/command`;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
};

const styleHash = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

// The policy of SW4.8: one hash for each style text the build lists, and
// nothing wider ('unsafe-inline' never appears).
export function contentSecurityPolicy(styles) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    `style-src 'self' ${styles.map(styleHash).join(" ")}`.trim(),
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// The built files by URL, listed once at start. A request path is looked up in
// this table; it is never joined to a folder (SW3.4).
function builtFiles(folder) {
  const files = new Map();
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(folder, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(name);
      else if (
        entry.isFile() &&
        (name === "index.html" || /^(assets|fonts)\//.test(name)) &&
        TYPES[path.extname(name)]
      )
        files.set(name === "index.html" ? "" : name, {
          file: path.join(folder, name),
          type: TYPES[path.extname(name)],
        });
    }
  };
  walk("");
  if (!files.has(""))
    throw Error("The standalone page is not built. Run npm run build.");
  if (!CSRF_META.test(fs.readFileSync(files.get("").file, "utf8")))
    throw Error(
      "The standalone page has no CSRF placeholder. Run npm run build.",
    );
  return files;
}

// The routes of Kiro Crew's own gateway that the page also calls (D2, D9). With
// no Kiro Crew, each answers in the shape the page reads, empty or refused with
// "Needs Kiro Crew", never as a failure of the server.
const NEEDS = (what) => `Needs Kiro Crew: ${what} works only inside Kiro Crew.`;
const KIROCREW_ROUTES = new Map([
  ["GET /api/models", [200, { models: [], needsKiroCrew: true }]],
  ["GET /api/chat/slots", [200, []]],
  ["GET /api/usage/turns", [200, []]],
  [
    "POST /api/reveal",
    [
      200,
      { ok: false, copy: null, error: NEEDS("Reveal in the file manager") },
    ],
  ],
  [
    "GET /api/apps/spec-builder/specs",
    [200, { specs: [], needsKiroCrew: true }],
  ],
  [
    "POST /api/apps/spec-builder/specs",
    [409, { error: NEEDS("Spec Builder"), needsKiroCrew: true }],
  ],
]);

function writeFileSync0600(file, text) {
  fs.writeFileSync(file, text, { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(file, 0o600);
}

function reply(res, status, headers, body = "") {
  res.writeHead(status, headers);
  res.end(body);
}

// Starts the server. Resolves to the listening http.Server once it listens, or
// rejects with "port N is in use".
export async function startServe({
  config,
  port = 0,
  uiDir,
  stateDirectory = machineAvoozlPaths().stateDirectory,
  home = os.homedir(),
  registryOptions = {},
  demoRoot,
  now = () => Date.now(),
  log = (line) => console.error(line),
  // Print the first owner link (avoozl serve); a supervised server prints none.
  link = true,
}) {
  if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535)))
    throw Error("--port takes 0, or a number from 1024 to 65535.");
  const folder = path.join(uiDir, "dist", "standalone"),
    files = builtFiles(folder),
    built = JSON.parse(
      fs.readFileSync(
        path.join(uiDir, "dist", "standalone-build.json"),
        "utf8",
      ),
    ),
    csp = contentSecurityPolicy(built.styles),
    links = new LinkStore(stateDirectory),
    context = commandContext({
      host: "standalone",
      config,
      home,
      registryOptions,
      ...(demoRoot ? { demoRoot } : {}),
    });
  let auth = null;

  const headers = (extra = {}) => ({
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extra,
  });
  const json = (res, status, value) =>
    reply(
      res,
      status,
      headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      }),
      JSON.stringify(value),
    );

  const handle = async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    const early = auth.refuse(req, url);
    if (early) return json(res, early.status, { error: early.message });

    if (url.pathname === "/login") {
      if (req.method !== "GET") return json(res, 405, { error: "Use GET." });
      const cookie = auth.signIn(url.searchParams.get("token"));
      if (!cookie)
        return reply(
          res,
          403,
          headers({
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          }),
          LINK_REFUSAL,
        );
      // The page a link asked for before sign-in, checked again here
      // (direct-links D1); else the page itself.
      return reply(
        res,
        303,
        headers({
          Location: auth.nextTarget(req) ?? APP_PATH,
          "Set-Cookie": [cookie, auth.clearNext()],
          "Cache-Control": "no-store",
        }),
      );
    }

    const who = auth.authenticate(req, url);
    if (who.status) {
      const page =
        req.method === "GET" && !url.pathname.startsWith(`${APP_PATH}/api/`);
      // A decision link opened before sign-in is kept for /login to return to.
      const next = page && who.status === 401 ? pageTarget(url) : null;
      return page
        ? reply(
            res,
            who.status,
            headers({
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
              ...(next ? { "Set-Cookie": auth.rememberNext(next) } : {}),
            }),
            who.message === SIGN_IN_PAGE ? SIGN_IN_PAGE : who.message,
          )
        : json(res, who.status, { error: who.message });
    }

    if (req.method === "POST") {
      const problem = auth.writeProblem(req, who);
      if (problem) {
        // The name of the check, never a value (SW4.10).
        log(`refused ${req.method} ${url.pathname}: ${problem}`);
        return json(res, 403, { error: "Not allowed." });
      }
      if (url.pathname === "/logout") {
        return reply(
          res,
          200,
          headers({
            "Set-Cookie": auth.signOut(who.session),
            "Cache-Control": "no-store",
            "Content-Type": "application/json",
          }),
          "{}",
        );
      }
      const crew = KIROCREW_ROUTES.get(`POST ${url.pathname}`);
      if (crew) return json(res, ...crew);
      if (url.pathname !== COMMAND_PATH)
        return json(res, 404, { error: "Not found." });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES)
          return json(res, 413, { error: "Request too large." });
        chunks.push(chunk);
      }
      let request;
      try {
        request = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        return json(res, 400, { error: "Send a JSON object." });
      }
      const { status, body } = await dispatchCommand({
        principal: { kind: "owner-session", ownerId: "local" },
        request,
        context,
      });
      return json(res, status, body);
    }

    // Pages and files come only to a signed-in browser.
    if (req.method !== "GET" && req.method !== "HEAD")
      return json(res, 405, { error: "Use GET." });
    if (url.pathname === "/")
      return reply(res, 302, headers({ Location: APP_PATH }));
    const crew = KIROCREW_ROUTES.get(`GET ${url.pathname}`);
    if (crew) return json(res, ...crew);
    if (url.pathname.startsWith("/api/apps/issue-radar/"))
      return json(res, 409, {
        error: NEEDS("Issue Radar"),
        needsKiroCrew: true,
      });
    if (url.pathname !== APP_PATH && !url.pathname.startsWith(`${APP_PATH}/`))
      return json(res, 404, { error: "Not found." });
    const name = url.pathname.slice(APP_PATH.length).replace(/^\//, ""),
      found = files.get(name);
    if (!found) return json(res, 404, { error: "Not found." });
    let body = fs.readFileSync(found.file);
    const extra = { "Content-Type": found.type };
    if (name === "") {
      // The CSRF token reaches the page only here, in the HTML of a request
      // that carried the session cookie (SW4.6).
      body = body
        .toString("utf8")
        .replace(
          CSRF_META,
          `<meta name="avoozl-csrf" content="${who.session.csrf}">`,
        );
      extra["Cache-Control"] = "no-store";
    }
    return reply(res, 200, headers(extra), req.method === "HEAD" ? "" : body);
  };

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    res.once("finish", () =>
      // Method, path without its query, status and time. Never a header,
      // a query or a body (SW4.10).
      log(
        `${req.method} ${(req.url ?? "").split("?")[0]} ${res.statusCode} ${Date.now() - started}ms`,
      ),
    );
    try {
      await handle(req, res);
    } catch (error) {
      if (!res.headersSent) json(res, 500, { error: "Avoozl serve error." });
      else res.end();
      log(`error ${error?.code ?? error?.name ?? "unknown"}`);
    }
  });
  // Stopping the server ends every open connection too (SW4.4: a session ends
  // when the server stops). http.Server.close alone leaves a keep-alive
  // connection serving the old process's sessions until the browser drops it.
  const stop = server.close.bind(server);
  server.close = (callback) => {
    const closed = stop(callback);
    server.closeAllConnections();
    return closed;
  };
  let stopped = false;
  server.on("close", () => {
    // A second close() emits again; everything below runs once.
    if (stopped) return;
    stopped = true;
    if (server.stateFile) fs.rmSync(server.stateFile, { force: true });
    auth?.end();
    links.close();
    context.close();
  });
  return new Promise((resolve, reject) => {
    server.once("error", (error) =>
      reject(
        error.code === "EADDRINUSE" ? Error(`port ${port} is in use`) : error,
      ),
    );
    // The only listen call: the loopback address, with no way to change it.
    server.listen(port, HOST, () => {
      const actual = server.address().port;
      auth = new ServeAuth({ port: actual, links, now });
      server.origin = `http://${HOST}:${actual}`;
      // Origin, port and pid only: never the link or any token (SW3.5).
      server.stateFile = path.join(stateDirectory, "serve.json");
      writeFileSync0600(
        server.stateFile,
        JSON.stringify({
          origin: server.origin,
          port: actual,
          pid: process.pid,
        }) + "\n",
      );
      server.port = actual;
      server.ownerLink = link
        ? `${server.origin}/login?token=${links.make(now())}`
        : null;
      resolve(server);
    });
  });
}
