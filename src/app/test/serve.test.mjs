import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { principalAllows } from "../command-dispatch.mjs";
import { workspaceConfig } from "../config.mjs";
import { machineAvoozlPaths } from "../host-config.mjs";
import { sandboxSecretPaths } from "../sandbox.mjs";
import { ABSOLUTE_MS, IDLE_MS, LINK_TTL_MS } from "../serve-auth.mjs";
import { contentSecurityPolicy, startServe } from "../serve-server.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const STYLE = "a{color:red}";

// A built page small enough to need no build: the real files are checked by the
// standalone build tests.
function fakeUi(root) {
  const ui = path.join(root, "ui"),
    dist = path.join(ui, "dist", "standalone");
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  fs.mkdirSync(path.join(dist, "fonts"), { recursive: true });
  fs.writeFileSync(
    path.join(dist, "index.html"),
    '<!doctype html><meta name="avoozl-csrf" content="" /><script type="module" src="/apps/avoozl/assets/a.js"></script>',
  );
  fs.writeFileSync(path.join(dist, "assets", "a.js"), "console.log(1)");
  fs.writeFileSync(path.join(dist, "NOTICE"), "not served");
  fs.writeFileSync(
    path.join(ui, "dist", "standalone-build.json"),
    JSON.stringify({ styles: [STYLE] }),
  );
  return ui;
}

function isolatedEnv(root) {
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(root, "xdg-config"),
    XDG_STATE_HOME: path.join(root, "xdg-state"),
    HOME: path.join(root, "home"),
    USERPROFILE: path.join(root, "home"),
    LOCALAPPDATA: path.join(root, "local"),
    APPDATA: path.join(root, "roaming"),
  };
  for (const name of Object.keys(env))
    if (/^AVOOZL_/.test(name)) delete env[name];
  return env;
}

async function serve(t, options = {}) {
  const root = temporaryDirectory(),
    workspace = path.join(root, "ws"),
    stateDirectory = path.join(root, "state"),
    configDirectory = path.join(root, "config"),
    lines = [];
  initializeWorkspace(workspace);
  fs.mkdirSync(path.join(root, "home"));
  const clock = { now: 1_800_000_000_000 };
  const server = await startServe({
    config: workspaceConfig({ workspace, env: isolatedEnv(root) }),
    uiDir: fakeUi(root),
    stateDirectory,
    configDirectory,
    home: path.join(root, "home"),
    demoRoot: path.join(root, "demo"),
    registryOptions: {
      configPath: path.join(root, "machine", "config.json"),
      catalogPath: path.join(root, "machine", "catalog.sqlite"),
    },
    now: () => clock.now,
    log: (line) => lines.push(line),
    ...options,
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.port;
  const call = (path_, { method = "GET", headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: path_,
          method,
          headers: { Host: `127.0.0.1:${port}`, ...headers },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              text: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  const origin = `http://127.0.0.1:${port}`;
  const token = new URL(server.ownerLink).searchParams.get("token");
  // Sign in with the first link: { cookie, csrf }.
  const signIn = async (value = token) => {
    const res = await call(`/login?token=${value}`);
    if (res.status !== 303) return { res };
    const cookie = res.headers["set-cookie"][0].split(";")[0];
    const page = await call("/apps/avoozl", { headers: { Cookie: cookie } });
    const csrf = page.text.match(/name="avoozl-csrf" content="([^"]+)"/)?.[1];
    return { res, cookie, csrf };
  };
  const post = (session, value, extra = {}) =>
    call("/apps/avoozl/api/command", {
      method: "POST",
      headers: {
        Cookie: session.cookie,
        Origin: origin,
        "Content-Type": "application/json",
        "X-Avoozl-CSRF": session.csrf,
        ...extra,
      },
      body: JSON.stringify(value),
    });
  return {
    server,
    port,
    origin,
    token,
    call,
    signIn,
    post,
    lines,
    clock,
    root,
    stateDirectory,
    configDirectory,
  };
}

test("the listener is on 127.0.0.1 and nowhere else (SW3.6)", async (t) => {
  const { server } = await serve(t);
  assert.equal(server.address().address, "127.0.0.1");
  assert.equal(server.address().family, "IPv4");
});

test("--host, --bind and AVOOZL_HOST each refuse to start; a child is refused (SW3.1, SW3.7)", () => {
  const root = temporaryDirectory(),
    env = isolatedEnv(root),
    run = (args, extra = {}) =>
      spawnSync(process.execPath, [cli, ...args], {
        env: { ...env, ...extra },
        encoding: "utf8",
        timeout: 30000,
      });
  for (const [args, extra, name] of [
    [["serve", "--host", "0.0.0.0"], {}, "--host"],
    [["serve", "--bind", "0.0.0.0"], {}, "--bind"],
    [["serve"], { AVOOZL_HOST: "0.0.0.0" }, "AVOOZL_HOST"],
    [["serve"], { AVOOZL_CHILD: "1" }, "supervisor child"],
    [["serve", "link"], { AVOOZL_CHILD: "1" }, "supervisor child"],
  ]) {
    const result = run(args, extra);
    assert.notEqual(result.status, 0, name);
    assert.ok(result.stderr.includes(name), `${name}: ${result.stderr}`);
  }
});

test("a taken port exits with 'port N is in use' and tries no other (SW3.2)", async (t) => {
  const holder = net.createServer();
  await new Promise((resolve) => holder.listen(0, "127.0.0.1", resolve));
  t.after(() => holder.close());
  const taken = holder.address().port;
  const root = temporaryDirectory(),
    workspace = path.join(root, "ws");
  initializeWorkspace(workspace);
  await assert.rejects(
    startServe({
      config: workspaceConfig({ workspace, env: isolatedEnv(root) }),
      uiDir: fakeUi(root),
      port: taken,
      stateDirectory: path.join(root, "state"),
      configDirectory: path.join(root, "config"),
      log: () => {},
    }),
    new RegExp(`port ${taken} is in use`),
  );
  await assert.rejects(
    startServe({ config: {}, uiDir: "x", port: 80 }),
    /1024 to 65535/,
  );
});

test("a link works once, and fails after use and after ten minutes with the same 403 (SW4.1, SW4.3)", async (t) => {
  const s = await serve(t);
  const first = await s.signIn();
  assert.equal(first.res.status, 303);
  assert.equal(first.res.headers.location, "/apps/avoozl");
  const reused = await s.call(`/login?token=${s.token}`);
  assert.equal(reused.status, 403);
  // A link made for the running server by `serve link`, left past its time.
  const { LinkStore } = await import("../serve-auth.mjs");
  const links = new LinkStore(s.stateDirectory);
  const old = links.make(s.clock.now);
  links.close();
  s.clock.now += LINK_TTL_MS + 1;
  const expired = await s.call(`/login?token=${old}`);
  const unknown = await s.call("/login?token=nope");
  assert.equal(expired.status, 403);
  assert.equal(expired.text, reused.text);
  assert.equal(unknown.text, reused.text);
  assert.equal(expired.headers["set-cookie"], undefined);
  assert.equal(unknown.headers["set-cookie"], undefined);
});

test("the cookie is HttpOnly, SameSite=Strict, Path=/, has no Domain and a port in its name (SW4.4)", async (t) => {
  const s = await serve(t);
  const { res } = await s.signIn();
  const cookie = res.headers["set-cookie"][0];
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.match(cookie, /; Path=\//);
  assert.doesNotMatch(cookie, /Domain/i);
  assert.ok(cookie.startsWith(`avoozl_session_${s.port}=`));
  assert.ok(cookie.split(";")[0].split("=")[1].length >= 43);
});

test("without a session a page gets how to sign in and the API gets 401 JSON (SW4.5)", async (t) => {
  const s = await serve(t);
  const page = await s.call("/apps/avoozl");
  assert.equal(page.status, 401);
  assert.match(page.text, /avoozl serve link/);
  const api = await s.call("/apps/avoozl/api/command", {
    method: "POST",
    headers: { Origin: s.origin, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(api.status, 401);
  assert.ok(JSON.parse(api.text).error);
  assert.equal((await s.call("/anything")).status, 401);
});

test("the CSRF token is in the page for a cookie request and in no cookie (SW4.6)", async (t) => {
  const s = await serve(t);
  const { res, cookie, csrf } = await s.signIn();
  assert.ok(csrf && csrf.length >= 43);
  assert.ok(!res.headers["set-cookie"].join(";").includes(csrf));
  assert.ok(!cookie.includes(csrf));
  const bare = await s.call("/apps/avoozl");
  assert.ok(!bare.text.includes(csrf));
});

test("each refusal of SW4.7 is a 403 before any other work, and a good request is not", async (t) => {
  const s = await serve(t);
  const session = await s.signIn();
  const base = {
    Cookie: session.cookie,
    Origin: s.origin,
    "Content-Type": "application/json",
    "X-Avoozl-CSRF": session.csrf,
  };
  const send = (headers) =>
    s.call("/apps/avoozl/api/command", {
      method: "POST",
      headers,
      body: JSON.stringify({ operation: "demo.status" }),
    });
  assert.equal((await send(base)).status, 200, "a good request");
  const without = (name) => {
    const copy = { ...base };
    delete copy[name];
    return copy;
  };
  assert.equal(
    (await send(without("X-Avoozl-CSRF"))).status,
    403,
    "no CSRF header",
  );
  assert.equal(
    (await send({ ...base, "X-Avoozl-CSRF": "wrong" })).status,
    403,
    "wrong CSRF",
  );
  assert.equal(
    (await send({ ...base, Origin: "http://evil.example" })).status,
    403,
    "wrong Origin",
  );
  assert.equal((await send(without("Origin"))).status, 403, "missing Origin");
  assert.equal(
    (await send({ ...base, "Sec-Fetch-Site": "cross-site" })).status,
    403,
    "cross-site",
  );
  assert.equal(
    (await send({ ...base, "Content-Type": "text/plain" })).status,
    403,
    "text/plain",
  );
  assert.equal(
    (await send({ ...base, Host: `evil.example:${s.port}` })).status,
    403,
    "Host",
  );
  assert.equal(
    (await send({ ...base, "Sec-Fetch-Site": "same-origin" })).status,
    200,
  );
  assert.equal(
    (
      await send({
        ...base,
        Origin: `http://localhost:${s.port}`,
        Host: `localhost:${s.port}`,
      })
    ).status,
    200,
    "localhost counts",
  );
  const options = await s.call("/apps/avoozl/api/command", {
    method: "OPTIONS",
    headers: base,
  });
  assert.equal(options.status, 403);
  assert.equal(
    (await s.call("/apps/avoozl", { headers: { Host: "evil.example" } }))
      .status,
    403,
  );
});

test("no response has an Access-Control-Allow header and every one has the SW4.8 headers", async (t) => {
  const s = await serve(t);
  const session = await s.signIn();
  const csp = contentSecurityPolicy([STYLE]);
  const responses = [
    session.res,
    await s.call("/login?token=bad"),
    await s.call("/apps/avoozl"),
    await s.call("/apps/avoozl", { headers: { Cookie: session.cookie } }),
    await s.call("/apps/avoozl/assets/a.js", {
      headers: { Cookie: session.cookie },
    }),
    await s.call("/nope", { headers: { Cookie: session.cookie } }),
    await s.call("/apps/avoozl/api/command", { method: "OPTIONS" }),
    await s.post(session, { operation: "demo.status" }),
    await s.post({ ...session, csrf: "x" }, { operation: "demo.status" }),
  ];
  for (const res of responses) {
    assert.ok(
      !Object.keys(res.headers).some((name) =>
        name.startsWith("access-control-"),
      ),
    );
    assert.equal(res.headers["content-security-policy"], csp);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["referrer-policy"], "no-referrer");
  }
  assert.equal(responses[0].headers["cache-control"], "no-store");
  assert.equal(responses[7].headers["cache-control"], "no-store");
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.match(csp, /style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test("pages come from a fixed list; a path is never joined to a folder (SW3.4)", async (t) => {
  const s = await serve(t);
  const { cookie } = await s.signIn();
  const get = (p) => s.call(p, { headers: { Cookie: cookie } });
  assert.equal((await get("/")).status, 302);
  assert.equal((await get("/apps/avoozl/assets/a.js")).status, 200);
  assert.equal((await get("/apps/avoozl/NOTICE")).status, 404);
  assert.equal((await get("/apps/avoozl/assets/../NOTICE")).status, 404);
  assert.equal(
    (await get("/apps/avoozl/%2e%2e/%2e%2e/package.json")).status,
    404,
  );
  assert.equal((await get("/elsewhere")).status, 404);
});

test("the app backend's principal headers and a bearer header, with no cookie, get 401 (SW5.4)", async (t) => {
  const s = await serve(t);
  const session = await s.signIn();
  for (const headers of [
    { "X-KiroCrew-Principal": "x.y" },
    { Authorization: "Bearer abc" },
  ]) {
    const res = await s.call("/apps/avoozl/api/command", {
      method: "POST",
      headers: {
        Origin: s.origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ operation: "demo.status" }),
    });
    assert.equal(res.status, 401, JSON.stringify(Object.keys(headers)));
  }
  const ok = await s.post(session, { operation: "demo.status" });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(ok.text).result.active, false);
});

test("an oversize body is 413 and bad JSON is 400 (SW4.11)", async (t) => {
  const s = await serve(t);
  const session = await s.signIn();
  const big = await s.call("/apps/avoozl/api/command", {
    method: "POST",
    headers: {
      Cookie: session.cookie,
      Origin: s.origin,
      "Content-Type": "application/json",
      "X-Avoozl-CSRF": session.csrf,
    },
    body: "x".repeat(1024 * 1024 + 10),
  });
  assert.equal(big.status, 413);
  const bad = await s.call("/apps/avoozl/api/command", {
    method: "POST",
    headers: {
      Cookie: session.cookie,
      Origin: s.origin,
      "Content-Type": "application/json",
      "X-Avoozl-CSRF": session.csrf,
    },
    body: "{",
  });
  assert.equal(bad.status, 400);
});

test("a session ends after 12 idle hours, after 7 days, and at logout (SW4.4, SW4.9)", async (t) => {
  const s = await serve(t);
  const a = await s.signIn();
  assert.equal(
    (await s.call("/apps/avoozl", { headers: { Cookie: a.cookie } })).status,
    200,
  );
  s.clock.now += IDLE_MS - 1000;
  assert.equal(
    (await s.call("/apps/avoozl", { headers: { Cookie: a.cookie } })).status,
    200,
  );
  s.clock.now += IDLE_MS + 1;
  assert.equal(
    (await s.call("/apps/avoozl", { headers: { Cookie: a.cookie } })).status,
    401,
  );
  const { LinkStore } = await import("../serve-auth.mjs");
  const links = new LinkStore(s.stateDirectory);
  let b = await s.signIn(links.make(s.clock.now));
  for (let day = 0; day < 6; day++) {
    s.clock.now += 11 * 60 * 60 * 1000;
    assert.equal(
      (await s.call("/apps/avoozl", { headers: { Cookie: b.cookie } })).status,
      200,
    );
  }
  s.clock.now += ABSOLUTE_MS;
  assert.equal(
    (await s.call("/apps/avoozl", { headers: { Cookie: b.cookie } })).status,
    401,
  );
  b = await s.signIn(links.make(s.clock.now));
  links.close();
  const out = await s.call("/logout", {
    method: "POST",
    headers: {
      Cookie: b.cookie,
      Origin: s.origin,
      "Content-Type": "application/json",
      "X-Avoozl-CSRF": b.csrf,
    },
    body: "{}",
  });
  assert.equal(out.status, 200);
  assert.match(out.headers["set-cookie"][0], /Max-Age=0/);
  assert.equal(
    (await s.call("/apps/avoozl", { headers: { Cookie: b.cookie } })).status,
    401,
  );
});

test("the server's end is a sign-out: sessions are not on disk", async (t) => {
  const s = await serve(t);
  const a = await s.signIn();
  const cookieValue = a.cookie.split("=")[1];
  for (const file of fs.readdirSync(s.stateDirectory)) {
    const bytes = fs.readFileSync(path.join(s.stateDirectory, file));
    assert.ok(!bytes.includes(cookieValue), file);
    assert.ok(!bytes.includes(a.csrf), file);
    assert.ok(!bytes.includes(s.token), file);
  }
});

test("no token, cookie or CSRF value is in the log, serve.json or the database (SW4.10)", async (t) => {
  const s = await serve(t);
  const a = await s.signIn();
  await s.post(a, { operation: "demo.status" });
  await s.call(`/apps/avoozl?token=${s.token}`, {
    headers: { Cookie: a.cookie },
  });
  const secrets = [s.token, a.cookie.split("=")[1], a.csrf];
  const all = [s.lines.join("\n")];
  const state = JSON.parse(
    fs.readFileSync(path.join(s.stateDirectory, "serve.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(state).sort(), ["origin", "pid", "port"]);
  for (const file of fs.readdirSync(s.stateDirectory))
    all.push(
      fs.readFileSync(path.join(s.stateDirectory, file)).toString("latin1"),
    );
  for (const text of all)
    for (const secret of secrets) assert.ok(!text.includes(secret));
  assert.ok(
    s.lines.every((line) => !line.includes("?")),
    "a query never reaches the log",
  );
  assert.ok(s.lines.length > 3);
});

test("serve.json and the state folder are private (SW3.5)", {
  skip: process.platform === "win32",
}, async (t) => {
  const s = await serve(t);
  assert.equal(
    fs.statSync(path.join(s.stateDirectory, "serve.json")).mode & 0o777,
    0o600,
  );
  assert.equal(
    fs.statSync(path.join(s.stateDirectory, "serve.sqlite")).mode & 0o777,
    0o600,
  );
  assert.equal(fs.statSync(s.stateDirectory).mode & 0o777, 0o700);
});

test("demo mode works on the page (SW5.3)", async (t) => {
  const s = await serve(t);
  const a = await s.signIn();
  const status = await s.post(a, { operation: "demo.status" });
  assert.equal(JSON.parse(status.text).result.workspaceId.length > 0, true);
});

test("the machine state and configuration folders are outside a child's roots (SW5.5)", () => {
  const root = temporaryDirectory(),
    stateDirectory = path.join(root, "state"),
    configDirectory = path.join(root, "config");
  fs.mkdirSync(stateDirectory);
  fs.mkdirSync(configDirectory);
  const denied = sandboxSecretPaths({
    home: path.join(root, "home"),
    env: {},
    stateDirectory,
    configDirectory,
  });
  const real = (p) => fs.realpathSync(p);
  assert.ok(
    denied.includes(real(stateDirectory)),
    "serve.json and serve.sqlite",
  );
  assert.ok(
    denied.includes(real(configDirectory)),
    "the machine configuration",
  );
});

// Only a session cookie opens /api/command: no key, no bearer token.
test("a request with no session cookie is refused whatever else it carries (SW4.5, SW5.4)", async (t) => {
  const s = await serve(t);
  for (const headers of [
    {},
    { "X-Credential": "x".repeat(43) },
    { Authorization: "Bearer abc" },
    { "X-KiroCrew-Principal": "x.y" },
  ]) {
    const res = await s.call("/apps/avoozl/api/command", {
      method: "POST",
      headers: {
        Origin: s.origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ operation: "demo.status" }),
    });
    assert.equal(res.status, 401, JSON.stringify(Object.keys(headers)));
  }
  // The CLI's own address is no way in either.
  const cliPath = await s.call("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(cliPath.status, 401);
});

test("avoozl serve link prints a new link for the running server, and refuses with none running (SW4.2)", async (t) => {
  const root = temporaryDirectory(),
    env = isolatedEnv(root),
    machine = machineAvoozlPaths({ env, home: env.HOME }),
    run = () =>
      spawnSync(process.execPath, [cli, "serve", "link"], {
        env,
        encoding: "utf8",
        timeout: 30000,
      });
  const none = run();
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /No avoozl serve is running/);
  const s = await serve(t, {
    stateDirectory: machine.stateDirectory,
    configDirectory: machine.configDirectory,
    now: () => Date.now(),
  });
  const printed = run();
  assert.equal(printed.status, 0, printed.stderr);
  const url = new URL(printed.stdout.trim());
  assert.equal(url.origin, s.origin);
  assert.equal(url.pathname, "/login");
  const res = await s.call(`${url.pathname}${url.search}`);
  assert.equal(res.status, 303);
});

test("the placeholder in the real built page is the one the server fills (SW4.6)", () => {
  const built = path.join(
    fileURLToPath(
      new URL(
        "../../../kirocrew-app/ui/dist/standalone/index.html",
        import.meta.url,
      ),
    ),
  );
  const html = fs.readFileSync(built, "utf8");
  assert.match(html, /<meta name="avoozl-csrf" content=""\s*\/?>/);
});

test("the Kiro Crew gateway routes the page calls answer 'Needs Kiro Crew' or empty, for a session only (D2, D9)", async (t) => {
  const s = await serve(t);
  assert.equal((await s.call("/api/models")).status, 401);
  const a = await s.signIn();
  const get = (p) => s.call(p, { headers: { Cookie: a.cookie } });
  assert.deepEqual(JSON.parse((await get("/api/models")).text).models, []);
  assert.deepEqual(JSON.parse((await get("/api/chat/slots")).text), []);
  const radar = await get("/api/apps/issue-radar/crews");
  assert.equal(radar.status, 409);
  assert.match(radar.text, /Needs Kiro Crew/);
  const builder = await s.call("/api/apps/spec-builder/specs", {
    method: "POST",
    headers: {
      Cookie: a.cookie,
      Origin: s.origin,
      "Content-Type": "application/json",
      "X-Avoozl-CSRF": a.csrf,
    },
    body: "{}",
  });
  assert.equal(builder.status, 409);
  assert.match(builder.text, /Needs Kiro Crew: Spec Builder/);
  const bare = await s.call("/api/apps/spec-builder/specs", {
    method: "POST",
    headers: {
      Cookie: a.cookie,
      Origin: s.origin,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(bare.status, 403, "a write still needs the CSRF header");
});

test("stopping the server ends open keep-alive connections, so an old session cannot be used after (SW4.4)", async (t) => {
  const s = await serve(t);
  const a = await s.signIn();
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const once = () =>
    new Promise((resolve) => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port: s.port,
          path: "/apps/avoozl",
          agent,
          headers: { Cookie: a.cookie, Host: `127.0.0.1:${s.port}` },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      req.on("error", (error) => resolve(error.code ?? "error"));
    });
  assert.equal(await once(), 200);
  await new Promise((resolve) => s.server.close(resolve));
  assert.notEqual(
    await once(),
    200,
    "the open connection is gone with the server",
  );
  agent.destroy();
});

test("the CLI pointed at avoozl serve is refused, and the error says why (SW5.4)", async (t) => {
  const s = await serve(t);
  const workspace = path.join(s.root, "ws");
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [cli, "gate", "list", "--workspace", workspace, "--url", s.origin],
      { env: { ...process.env, XDG_CONFIG_HOME: path.join(s.root, "xdg") } },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stderr }));
  });
  assert.notEqual(result.code, 0);
  assert.match(
    result.stderr,
    /accepts \/api\/command only with a valid browser session cookie/,
  );
  assert.match(result.stderr, /Drop --url/);
});
