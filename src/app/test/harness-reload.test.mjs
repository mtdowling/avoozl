import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../../scripts/live-harness/harness.sh", import.meta.url),
);
// The harness is a bash script for Linux and macOS.
const skip = process.platform === "win32";

// Stand-ins for kirocrew, curl, gh and setsid. Each logs its arguments.
const stubs = {
  kirocrew: `#!/bin/bash
echo "kirocrew $*" >>"$STUB_LOG"
A="$KIROCREW_HOME/apps/avoozl"
case "$1 $2" in
  "app list") [ -f "$A/app.json" ] && echo "avoozl  0.1.0  enabled  Avoozl"; exit 0 ;;
  "app install") mkdir -p "$A"; cp -R "$3/." "$A/"; exit 0 ;;
  "app uninstall") find "$A" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +; exit 0 ;;
  "gateway --port") exec sleep 120 ;;
  "token --port") echo "Gateway refused the token request (HTTP 403)" >&2; exit 1 ;;
esac
exit 0
`,
  curl: `#!/bin/bash
echo "curl $*" >>"$STUB_LOG"
data=""; prev=""
for a in "$@"; do [ "$prev" = "-d" ] && data="$a"; prev="$a"; done
case "$*" in
  */api/apps/avoozl/update*)
    src="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["source"])' "$data")"
    cp -R "$src/." "$STUB_HOME/apps/avoozl/"; echo '{"ok": true}' ;;
  */api/auth/me*) echo '{"owner_ok": true}' ;;
esac
exit 0
`,
  gh: "#!/bin/bash\nexit 0\n",
  setsid: '#!/bin/bash\nexec "$@"\n',
};

function setup() {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "harness-reload-"));
  const bin = path.join(t, "bin");
  fs.mkdirSync(bin);
  for (const [name, body] of Object.entries(stubs)) {
    fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
  }
  const src = path.join(t, "src");
  fs.mkdirSync(path.join(src, "ui"), { recursive: true });
  fs.writeFileSync(path.join(src, "app.json"), '{"name":"avoozl"}\n');
  fs.writeFileSync(path.join(src, "ui", "index.mjs"), "export const v = 1;\n");
  const dir = path.join(t, "h");
  const log = path.join(t, "log");
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HOME: path.join(t, "userhome"),
    AVOOZL_HARNESS_DIR: dir,
    AVOOZL_HARNESS_APP_SRC: src,
    AVOOZL_HARNESS_PORT: String(40000 + Math.floor(Math.random() * 20000)),
    STUB_LOG: log,
    STUB_HOME: path.join(fs.realpathSync(t), "h", "home"),
  };
  delete env.KIROCREW_HOME;
  const run = (...args) => {
    const r = spawnSync("bash", [script, ...args], { env, encoding: "utf8" });
    return { ...r, out: r.stdout + r.stderr };
  };
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "");
  const clear = () => fs.rmSync(log, { force: true });
  const installed = path.join(env.STUB_HOME, "apps", "avoozl");
  return { t, src, dir, env, run, calls, clear, installed };
}

test("start installs the app, then reinstalls only when the build changed", { skip }, (t) => {
  const h = setup();
  t.after(() => h.run("stop"));
  let r = h.run("start");
  assert.equal(r.status, 0, r.out);
  assert.match(h.calls(), /kirocrew app install .*\/h\/app/);
  assert.equal(fs.readFileSync(path.join(h.installed, "ui", "index.mjs"), "utf8"), "export const v = 1;\n");
  fs.mkdirSync(path.join(h.installed, "data"));
  fs.writeFileSync(path.join(h.installed, "data", "keep.txt"), "keep");

  h.clear();
  r = h.run("restart");
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(h.calls(), /app (install|uninstall)/, "unchanged build: no reinstall");

  fs.writeFileSync(path.join(h.src, "ui", "index.mjs"), "export const v = 2;\n");
  h.clear();
  r = h.run("restart");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /app reinstalled/);
  const log = h.calls();
  assert.match(log, /kirocrew app uninstall avoozl\n/, "uninstall keeps data (no --purge-data)");
  // The readiness probe is the first curl call, after the gateway is launched.
  assert.ok(log.indexOf("app install") < log.indexOf("curl -s -o /dev/null"), "reinstall happens before the gateway starts");
  assert.equal(fs.readFileSync(path.join(h.installed, "ui", "index.mjs"), "utf8"), "export const v = 2;\n");
  assert.equal(fs.readFileSync(path.join(h.installed, "data", "keep.txt"), "utf8"), "keep");
});

test("reload-app updates in place through the gateway with a sign-in cookie", { skip }, (t) => {
  const h = setup();
  t.after(() => h.run("stop"));
  assert.equal(h.run("start").status, 0);
  fs.writeFileSync(path.join(h.dir, "cookies.txt"), "# Netscape HTTP Cookie File\n");
  fs.writeFileSync(path.join(h.src, "ui", "index.mjs"), "export const v = 3;\n");
  h.clear();
  const r = h.run("reload-app");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /app updated in place/);
  const log = h.calls();
  assert.match(log, /-X POST -b \S+cookies\.txt .*\/api\/apps\/avoozl\/update/);
  assert.doesNotMatch(log, /app uninstall|curl -s -o \/dev\/null/, "no reinstall, no gateway restart");
  assert.equal(fs.readFileSync(path.join(h.installed, "ui", "index.mjs"), "utf8"), "export const v = 3;\n");
  assert.match(h.run("reload-app").out, /app already current/);
});

test("reload-app without a cookie restarts and reinstalls", { skip }, (t) => {
  const h = setup();
  t.after(() => h.run("stop"));
  assert.equal(h.run("start").status, 0);
  fs.writeFileSync(path.join(h.src, "ui", "index.mjs"), "export const v = 4;\n");
  h.clear();
  const r = h.run("reload-app");
  assert.equal(r.status, 0, r.out);
  assert.match(h.calls(), /app uninstall avoozl[\s\S]*app install[\s\S]*curl -s -o \/dev\/null/);
  assert.equal(fs.readFileSync(path.join(h.installed, "ui", "index.mjs"), "utf8"), "export const v = 4;\n");
});

test("harness refuses a directory outside its own", { skip }, () => {
  const h = setup();
  const kiro = path.join(h.env.HOME, ".kiro", "crew");
  fs.mkdirSync(kiro, { recursive: true });
  const link = path.join(h.t, "link");
  fs.symlinkSync(kiro, link);
  for (const dir of [kiro, path.join(h.env.HOME, ".local", "state", "x"), "relative/dir", "/", link]) {
    const r = spawnSync("bash", [script, "status"], {
      env: { ...h.env, AVOOZL_HARNESS_DIR: dir },
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0, dir);
    assert.match(r.stderr, /unsafe AVOOZL_HARNESS_DIR/, dir);
  }
  assert.deepEqual(fs.readdirSync(kiro), [], "nothing written into the real home");
  assert.equal(h.calls(), "");
});

test("signin from a refused shell says why and saves no cookie", { skip }, (t) => {
  const h = setup();
  t.after(() => h.run("stop"));
  assert.equal(h.run("start").status, 0);
  const r = h.run("signin");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /refused .*run 'harness.sh signin' in your own terminal/);
  assert.equal(fs.existsSync(path.join(h.dir, "cookies.txt")), false);
});

test("browser-state turns the sign-in cookie into Playwright storage state", { skip }, () => {
  const h = setup();
  fs.mkdirSync(h.dir, { recursive: true });
  fs.writeFileSync(
    path.join(h.dir, "cookies.txt"),
    "# Netscape HTTP Cookie File\n#HttpOnly_localhost\tFALSE\t/\tFALSE\t1797526690\tsess\tabc\n",
  );
  const r = h.run("browser-state");
  assert.equal(r.status, 0, r.out);
  const file = r.stdout.trim();
  assert.equal(fs.statSync(file).mode & 0o077, 0, "owner-only file");
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(state.cookies, [
    { name: "sess", value: "abc", domain: "localhost", path: "/", expires: 1797526690, httpOnly: true, secure: false, sameSite: "Lax" },
  ]);
});
