// Sign-in and request checks for `avoozl serve` (spec standalone-web, SW4, D5).
// The server listens on 127.0.0.1 only, but any local program and any web page
// the owner visits can reach that socket, so every request is checked here
// before any work: Host, method, a live session cookie, and for a write the
// Origin, Sec-Fetch-Site, Content-Type and CSRF header.
//
// Nothing here logs, returns or stores a token, cookie value, CSRF value or API
// value in the clear: links and cookies are kept as SHA-256 hashes, and
// compared in constant time.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const LINK_TTL_MS = 10 * 60 * 1000;
export const IDLE_MS = 12 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
export const CSRF_HEADER = "x-avoozl-csrf";
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

function cookies(header) {
  const found = new Map();
  for (const part of String(header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) found.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return found;
}

export class ServeAuth {
  constructor({ port, links, now = () => Date.now() }) {
    this.port = port;
    this.links = links;
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

  // The checks that run before any other work, in order. Returns null to go
  // on, else `{ status, message }`. `url` is the parsed request URL.
  refuse(req, url) {
    if (!this.hostOk(req)) return { status: 403, message: "Not allowed." };
    if (req.method === "OPTIONS")
      return { status: 403, message: "Not allowed." };
    return null;
  }

  // Who may do what for a request that is not /login. Returns
  // `{ kind: "session", session }` or `{ status, message }`. Only a valid
  // session cookie counts: there is no other way in.
  authenticate(req, url) {
    const authorization = req.headers.authorization;
    if (authorization !== undefined)
      return { status: 401, message: "Bearer tokens are not accepted." };
    const session = this.session(req);
    if (session) return { kind: "session", session };
    return { status: 401, message: SIGN_IN_PAGE };
  }

  // The extra checks for a write (SW4.6, SW4.7): a same-origin Origin, a
  // same-origin Sec-Fetch-Site when sent, a JSON content type, and the CSRF
  // header the page read from its own HTML.
  writeProblem(req, auth) {
    const origin = req.headers.origin,
      site = req.headers["sec-fetch-site"],
      type = String(req.headers["content-type"] ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    if (origin === undefined || !this.origins.has(origin)) return "origin";
    if (site !== undefined && site !== "same-origin") return "site";
    if (type !== "application/json") return "type";
    const given = req.headers[CSRF_HEADER];
    if (typeof given !== "string") return "csrf";
    if (!same(sha256(given), sha256(auth.session.csrf))) return "csrf";
    return null;
  }
}
