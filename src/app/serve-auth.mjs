// Sign-in and request checks for `avoozl serve` (spec standalone-web, SW4, D5).
// The server listens on 127.0.0.1 only, but any local program and any web page
// the owner visits can reach that socket, so every request is checked here
// before any work: Host, method, a live session cookie, and for a write the
// Origin, Sec-Fetch-Site, Content-Type and CSRF header.
//
// Nothing here logs, returns or stores a token, cookie value, CSRF value or API
// key in the clear: links, cookies and keys are kept as SHA-256 hashes, and
// compared in constant time.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const LINK_TTL_MS = 10 * 60 * 1000;
export const IDLE_MS = 12 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
export const CSRF_HEADER = "x-avoozl-csrf";
export const KEY_HEADER = "x-api-key";
export const LINK_REFUSAL = "This link is not valid. Run avoozl serve link.";
export const SIGN_IN_PAGE =
  "Sign in needed. Run `avoozl serve link` in a terminal on this computer and open the link it prints.";

const sha256 = (value) => createHash("sha256").update(value).digest();
const token = () => randomBytes(32).toString("base64url");
const same = (a, b) => a.length === b.length && timingSafeEqual(a, b);

function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  // A folder made earlier keeps its mode; tighten it. Windows has no modes.
  if (process.platform !== "win32") fs.chmodSync(directory, 0o700);
}

function writePrivate(file, text) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, file);
}

// The owner links: SHA-256 hashes with their times, in serve.sqlite in the
// machine state folder. `avoozl serve link` writes here and the running server
// reads it, so the two need no channel between them.
export class LinkStore {
  constructor(stateDirectory) {
    privateDirectory(stateDirectory);
    this.file = path.join(stateDirectory, "serve.sqlite");
    this.db = new DatabaseSync(this.file);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS serve_links (hash BLOB PRIMARY KEY, created INTEGER NOT NULL, used INTEGER)",
    );
    if (process.platform !== "win32") fs.chmodSync(this.file, 0o600);
  }

  // A new link's token: shown once, never stored.
  make(now = Date.now()) {
    const value = token();
    this.db
      .prepare(
        "INSERT INTO serve_links (hash, created, used) VALUES (?, ?, NULL)",
      )
      .run(sha256(value), now);
    return value;
  }

  // True once for a token that is unused and under ten minutes old.
  consume(value, now = Date.now()) {
    this.db
      .prepare("DELETE FROM serve_links WHERE used IS NOT NULL OR created < ?")
      .run(now - LINK_TTL_MS);
    const wanted = sha256(String(value ?? ""));
    for (const row of this.db
      .prepare("SELECT hash FROM serve_links WHERE used IS NULL")
      .all()) {
      if (!same(Buffer.from(row.hash), wanted)) continue;
      this.db
        .prepare("UPDATE serve_links SET used = ? WHERE hash = ?")
        .run(now, row.hash);
      return true;
    }
    return false;
  }

  close() {
    this.db.close();
  }
}

// The one API key, for scripts and other programs that are not a browser. It
// lives in the machine configuration folder, mode 0600, and is read from the
// file on each request, so a key regenerated anywhere stops the old one at once.
export const API_KEY_FILE = "serve-api-key.json";

export function apiKeyFile(configDirectory) {
  return path.join(configDirectory, API_KEY_FILE);
}

export function readApiKey(configDirectory) {
  try {
    const key = JSON.parse(
      fs.readFileSync(apiKeyFile(configDirectory), "utf8"),
    ).key;
    return typeof key === "string" && key.length >= 43 ? key : null;
  } catch {
    return null;
  }
}

// A new key, written before the old one stops being read: 32 random bytes.
export function regenerateApiKey(configDirectory) {
  privateDirectory(configDirectory);
  const key = token();
  writePrivate(apiKeyFile(configDirectory), JSON.stringify({ key }) + "\n");
  return key;
}

// The key, made on first use.
export function ensureApiKey(configDirectory) {
  return readApiKey(configDirectory) ?? regenerateApiKey(configDirectory);
}

function cookies(header) {
  const found = new Map();
  for (const part of String(header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) found.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return found;
}

export class ServeAuth {
  constructor({ port, links, configDirectory, now = () => Date.now() }) {
    this.port = port;
    this.links = links;
    this.configDirectory = configDirectory;
    this.now = now;
    // cookie hash (hex) -> { csrf, started, last }. In memory only: a restart
    // ends every session, and no cookie hash reaches the disk.
    this.sessions = new Map();
    this.cookieName = `avoozl_session_${port}`;
    this.origins = new Set([
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
    ]);
    this.hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  }

  hostOk(req) {
    return this.hosts.has(String(req.headers.host ?? ""));
  }

  // A browser session from the cookie, or null.
  session(req) {
    const value = cookies(req.headers.cookie).get(this.cookieName);
    if (!value) return null;
    const id = sha256(value).toString("hex"),
      found = this.sessions.get(id),
      now = this.now();
    if (!found) return null;
    if (now - found.last > IDLE_MS || now - found.started > ABSOLUTE_MS) {
      this.sessions.delete(id);
      return null;
    }
    found.last = now;
    return { id, ...found };
  }

  // Signs in with a link's token: a cookie header value, or null.
  signIn(value) {
    if (!this.links.consume(value, this.now())) return null;
    const cookie = token(),
      now = this.now();
    this.sessions.set(sha256(cookie).toString("hex"), {
      csrf: token(),
      started: now,
      last: now,
    });
    return `${this.cookieName}=${cookie}; HttpOnly; SameSite=Strict; Path=/`;
  }

  signOut(session) {
    this.sessions.delete(session.id);
    return `${this.cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
  }

  end() {
    this.sessions.clear();
  }

  // Whether the X-Api-Key header holds the current key.
  keyOk(req) {
    const given = req.headers[KEY_HEADER];
    const key = readApiKey(this.configDirectory);
    if (typeof given !== "string" || !key) return false;
    return same(sha256(given), sha256(key));
  }

  // The checks that run before any other work, in order. Returns null to go
  // on, else `{ status, message }`. `url` is the parsed request URL.
  refuse(req, url) {
    if (!this.hostOk(req)) return { status: 403, message: "Not allowed." };
    if (req.method === "OPTIONS")
      return { status: 403, message: "Not allowed." };
    return null;
  }

  // Who may do what for a request that is not /login. Returns
  // `{ kind: "session" | "key", session? }` or `{ status, message }`.
  authenticate(req, url) {
    const authorization = req.headers.authorization;
    if (authorization !== undefined)
      return { status: 401, message: "Bearer tokens are not accepted." };
    // The key goes in a header only, never in the address.
    for (const name of url.searchParams.keys())
      if (/^(x-?)?api[-_]?key$|^key$|^token$/i.test(name))
        return {
          status: 401,
          message:
            "Send the API key in the X-Api-Key header, never in the address.",
        };
    const session = this.session(req);
    if (session) return { kind: "session", session };
    if (this.keyOk(req)) return { kind: "key" };
    return { status: 401, message: SIGN_IN_PAGE };
  }

  // The extra checks for a write (SW4.6, SW4.7). A browser session needs the
  // CSRF header and a same-origin Origin. A key request carries no cookie, so it
  // has no CSRF to forge; it may send no Origin, but not a foreign one.
  writeProblem(req, auth) {
    const origin = req.headers.origin,
      site = req.headers["sec-fetch-site"],
      type = String(req.headers["content-type"] ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    if (auth.kind === "session") {
      if (origin === undefined || !this.origins.has(origin)) return "origin";
      if (site !== undefined && site !== "same-origin") return "site";
    } else if (origin !== undefined && !this.origins.has(origin))
      return "origin";
    if (type !== "application/json") return "type";
    if (auth.kind === "session") {
      const given = req.headers[CSRF_HEADER];
      if (typeof given !== "string") return "csrf";
      if (!same(sha256(given), sha256(auth.session.csrf))) return "csrf";
    }
    return null;
  }
}
