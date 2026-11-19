#!/usr/bin/env bash
# Throwaway Kiro Crew harness for live proofs. See docs/live-proof-harness.md.
#
# It runs a second gateway with its own KIROCREW_HOME, KIRO_HOME and port, so
# your real gateway is never read, written or restarted. Every kirocrew call
# below runs with the harness home; the real home is never named.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${AVOOZL_HARNESS_DIR:-/tmp/avoozl-live-harness}"
PORT="${AVOOZL_HARNESS_PORT:-5690}"
REPO_URL="${AVOOZL_HARNESS_REPO:-https://github.com/mtdowling/avoozl-radar-test}"
AGENT="${AVOOZL_HARNESS_AGENT:-avoozl-crew}"
# The built app the harness installs (run npm run build first).
APP_SRC="${AVOOZL_HARNESS_APP_SRC:-$ROOT/kirocrew-app}"

die() { echo "harness: $*" >&2; exit 1; }

# Refuse the real home, whatever the caller set. The checks run on the
# resolved path too, so a symlink cannot point the harness at a real home.
real() { (cd "$1" 2>/dev/null && pwd -P) || echo "$1"; }
unsafe_dir() {
  case "$1" in
    /) return 0 ;;
    /*) ;;
    *) return 0 ;;
  esac
  local h
  for h in "$HOME" "$(real "$HOME")"; do
    case "$1/" in
      "$h/"|"$h/.kiro/"*|"$h/.local/state/"*) return 0 ;;
    esac
  done
  if [ -n "${KIROCREW_HOME:-}" ]; then
    for h in "${KIROCREW_HOME%/}" "$(real "$KIROCREW_HOME")"; do
      case "$1/" in "$h/"*) return 0 ;; esac
    done
  fi
  return 1
}
unsafe_dir "$DIR" && die "unsafe AVOOZL_HARNESS_DIR: $DIR"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd -P)"
unsafe_dir "$DIR" && die "unsafe AVOOZL_HARNESS_DIR (resolves to $DIR)"
HOME_DIR="$DIR/home"
# Kiro Crew lets a second home write agent files only to <home>/kiro/agents;
# anywhere else it refuses, and app agents such as avoozl-crew never load.
KIRO_DIR="$HOME_DIR/kiro"
APP_DIR="$DIR/app"
PIDFILE="$DIR/gateway.pid"
LOG="$DIR/gateway.log"
# Owner sign-in cookie (see `signin`). Chats use it for the API and the browser.
COOKIES="$DIR/cookies.txt"
for p in "$HOME_DIR" "$APP_DIR"; do
  [ ! -L "$p" ] || die "refusing symlinked harness path: $p"
done

kc() {
  env -u KIROCREW_BOUND_PORT -u KIROCREW_PORT -u KIROCREW_SPAWN_HOME \
      -u KIROCREW_SPAWN_INSTANCE -u KIROCREW_HOST_PID -u KIROCREW_SPAWNED \
      -u KIRO_SESSION_ID \
      KIROCREW_HOME="$HOME_DIR" KIRO_HOME="$KIRO_DIR" \
      KIROCREW_ISSUE_RADAR_GH="$DIR/bin/gh" \
      kirocrew "$@"
}

running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

# app_tree compare SRC INSTALLED: prints "same" when every file of SRC has the
# same content at the same path under INSTALLED, else "differs". Files the
# install adds (installed.json, data/) are not part of the source, so they
# do not count.
# app_tree stage SRC APP_DIR: makes APP_DIR an exact copy of SRC.
app_tree() {
  python3 - "$@" "$DIR" <<'PY'
import hashlib, os, shutil, sys
mode, src, dst, root = sys.argv[1:5]
def digest(base, rels):
    h = hashlib.sha256()
    for rel in rels:
        h.update(rel.encode() + b"\0")
        try:
            with open(os.path.join(base, rel), "rb") as f:
                h.update(hashlib.sha256(f.read()).digest())
        except OSError:
            h.update(b"missing")
    return h.hexdigest()
rels = sorted(os.path.relpath(os.path.join(d, f), src)
              for d, _, fs in os.walk(src) for f in fs)
if not rels:
    sys.exit(f"harness: no app files in {src} (run npm run build)")
if mode == "compare":
    print("same" if digest(src, rels) == digest(dst, rels) else "differs")
elif mode == "stage":
    # Only ever the harness's own app copy.
    if os.path.realpath(dst) != os.path.join(os.path.realpath(root), "app"):
        sys.exit(f"harness: refusing to stage outside {root}: {dst}")
    if os.path.lexists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst, symlinks=True)
PY
}

# Install the app, or reinstall it when the built source differs from the
# installed copy. The gateway must be stopped: an offline update is refused,
# so a reinstall is uninstall (app data is kept) then install.
sync_app() {
  local inst="$HOME_DIR/apps/avoozl"
  if kc app list 2>/dev/null | grep '^avoozl ' >/dev/null; then
    [ "$(app_tree compare "$APP_SRC" "$inst")" = same ] && return 0
    app_tree stage "$APP_SRC" "$APP_DIR"
    kc app uninstall avoozl >/dev/null 2>&1 || die "app uninstall failed"
    kc app install "$APP_DIR" >/dev/null || die "app install failed"
    echo "app reinstalled: the built app differed from the installed one"
  else
    # Installed apps come from a copy, so a rebuild in the repo cannot change a running harness.
    app_tree stage "$APP_SRC" "$APP_DIR"
    kc app install "$APP_DIR" >/dev/null || die "app install failed"
  fi
}

prepare() {
  mkdir -p "$HOME_DIR" "$KIRO_DIR" "$DIR/bin"
  # Radar runs gh from its own copy.
  [ -x "$DIR/bin/gh" ] || cp "$(command -v gh)" "$DIR/bin/gh"
  kc config set agent.apps_trusted_local '["avoozl"]' >/dev/null
  kc config set tunnel.enabled false >/dev/null
  kc config set agent.apps_allow_third_party true >/dev/null
  kc config set agent.sandbox_allow_unsandboxed_exec true >/dev/null
  sync_app
  kc app enable avoozl >/dev/null 2>&1 || true
  kc app enable issue-radar >/dev/null 2>&1 || true
}

# Same JSON key order and shape as Radar writes itself.
connect_repo_file() {
  python3 - "$HOME_DIR/apps/issue-radar/data/config.json" "$1" <<'PY'
import json, os, sys
f, url = sys.argv[1], sys.argv[2]
owner, repo = url.rstrip("/").split("/")[-2:]
os.makedirs(os.path.dirname(f), exist_ok=True)
try:
    d = json.load(open(f))
except Exception:
    d = {}
repos = d.setdefault("repos", [])
if not any(r.get("owner") == owner and r.get("repo") == repo for r in repos):
    repos.append({"owner": owner, "repo": repo, "provider": "github",
                  "host": "github.com", "url": f"https://github.com/{owner}/{repo}"})
json.dump(d, open(f, "w"), indent=2)
print(f"connected {owner}/{repo}")
PY
}

token() { kc token --port "$PORT" 2>/dev/null | grep -o 'token=[^& ]*' | head -1 | cut -d= -f2; }

# api METHOD PATH [JSON]. With a saved sign-in cookie (see `signin`) it uses
# that, so a chat can call owner routes; otherwise it mints a token, which
# only an unsandboxed owner shell can do.
api() {
  if [ -s "$COOKIES" ]; then
    curl -sS -X "$1" -b "$COOKIES" -c "$COOKIES" -H "Origin: http://localhost:$PORT" \
      -H 'Content-Type: application/json' "http://localhost:$PORT$2" ${3:+-d "$3"}
    echo; return
  fi
  local t s='?'
  t="$(token)"; [ -n "$t" ] || die "no sign-in token (is the harness running? from a chat, run signin in an owner shell first)"
  case "$2" in *\?*) s='&' ;; esac
  curl -sS -X "$1" "http://localhost:$PORT$2${s}token=$t" \
    -H 'Content-Type: application/json' ${3:+-d "$3"}
  echo
}

# The gateway mints a sign-in token only for a process it verifies as its
# local owner: not sandboxed on macOS, same namespaces on Linux. A chat's shell
# fails that check, so a person runs this once per harness home. The cookie
# then lasts about 30 days and survives restarts (not `reset`).
cmd_signin() {
  running || die "the harness is not running (run start first)"
  local out t
  if ! out="$(kc token --port "$PORT" 2>&1)"; then
    echo "$out" | grep -v 'token=' >&2
    die "the gateway refused to mint a sign-in token for this shell; run 'harness.sh signin' in your own terminal"
  fi
  t="$(echo "$out" | grep -o 'token=[^& ]*' | head -1 | cut -d= -f2)"
  [ -n "$t" ] || die "no sign-in token in the kirocrew token output"
  (umask 077; : >"$COOKIES")
  curl -sS -o /dev/null -c "$COOKIES" "http://localhost:$PORT/api/auth/me?token=$t"
  api GET /api/auth/me | grep -q '"owner_ok": *true' || die "sign-in did not give an owner session"
  echo "signed in: cookie saved to $COOKIES (mode 600)"
}

# Playwright storage state from the sign-in cookie, so a chat's browser opens
# the test crew signed in: browser.newContext({ storageState: <this file> }).
cmd_browser_state() {
  [ -s "$COOKIES" ] || die "no sign-in cookie at $COOKIES (run signin in an owner shell first)"
  (umask 077; python3 - "$COOKIES" >"$DIR/browser-state.json" <<'PY'
import json, sys
cookies = []
for line in open(sys.argv[1]):
    http_only = line.startswith("#HttpOnly_")
    if http_only:
        line = line[len("#HttpOnly_"):]
    elif line.startswith("#") or not line.strip():
        continue
    domain, _, path, secure, expires, name, value = line.rstrip("\n").split("\t")
    cookies.append({"name": name, "value": value, "domain": domain.lstrip("."),
                    "path": path, "expires": int(expires) or -1, "httpOnly": http_only,
                    "secure": secure == "TRUE", "sameSite": "Lax"})
print(json.dumps({"cookies": cookies, "origins": []}))
PY
  )
  echo "$DIR/browser-state.json"
}

# Load a new app build. Running with a sign-in cookie: update in place through
# the gateway, as `kirocrew app update` does, which keeps the tick's cron job.
# Otherwise: stop, reinstall, start.
cmd_reload_app() {
  if running && [ -s "$COOKIES" ]; then
    if [ "$(app_tree compare "$APP_SRC" "$HOME_DIR/apps/avoozl")" = same ]; then
      echo "app already current"; return
    fi
    app_tree stage "$APP_SRC" "$APP_DIR"
    local body
    body="$(python3 -c 'import json,sys; print(json.dumps({"source": sys.argv[1]}))' "$APP_DIR")"
    local res; res="$(api POST /api/apps/avoozl/update "$body")"
    echo "$res" | grep -q '"error"' && die "gateway refused the app update: $res"
    [ "$(app_tree compare "$APP_SRC" "$HOME_DIR/apps/avoozl")" = same ] || die "app update did not take: $res"
    echo "app updated in place"
  else
    cmd_stop >/dev/null; cmd_start
  fi
}

cmd_start() {
  if running; then echo "already running (pid $(cat "$PIDFILE"), port $PORT)"; return; fi
  if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then die "port $PORT is in use"; fi
  prepare
  connect_repo_file "$REPO_URL" >/dev/null
  setsid nohup env -u KIROCREW_BOUND_PORT -u KIROCREW_PORT -u KIROCREW_SPAWN_HOME \
      -u KIROCREW_SPAWN_INSTANCE -u KIROCREW_HOST_PID -u KIROCREW_SPAWNED -u KIRO_SESSION_ID \
      KIROCREW_HOME="$HOME_DIR" KIRO_HOME="$KIRO_DIR" KIROCREW_ISSUE_RADAR_GH="$DIR/bin/gh" \
      kirocrew gateway --port "$PORT" --no-open --no-tunnel >"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "http://localhost:$PORT/"; then
      echo "up: pid $(cat "$PIDFILE"), port $PORT"; return
    fi
    running || { tail -20 "$LOG" >&2; die "gateway exited"; }
    sleep 1
  done
  die "gateway did not answer on port $PORT (see $LOG)"
}

cmd_stop() {
  if running; then
    local p; p="$(cat "$PIDFILE")"
    kill "$p" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$p" 2>/dev/null || break; sleep 1; done
    kill -0 "$p" 2>/dev/null && kill -9 "$p" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  echo stopped
}

cmd_status() {
  if running; then echo "running pid $(cat "$PIDFILE") port $PORT home $HOME_DIR"
  else echo "stopped (home $HOME_DIR)"; fi
}

cmd_reset() {
  cmd_stop
  # Move the old state aside instead of deleting it.
  [ -d "$DIR/home" ] && mv "$DIR/home" "$DIR/home.old.$(date +%s)"
  [ -d "$DIR/kiro" ] && mv "$DIR/kiro" "$DIR/kiro.old.$(date +%s)"
  [ -d "$DIR/app" ] && mv "$DIR/app" "$DIR/app.old.$(date +%s)"
  # The cookie signs in to the old home only.
  [ -f "$COOKIES" ] && mv "$COOKIES" "$COOKIES.old.$(date +%s)"
  echo "reset: old state kept as $DIR/*.old.*; run start for a fresh home"
}

cmd_url() { kc token --port "$PORT" 2>/dev/null | grep -o 'http[^ ]*' | head -1; }

crew_ids() { api GET "/api/apps/issue-radar/crews?owner=${REPO_OWNER}&repo=${REPO_NAME}"; }

REPO_OWNER="$(echo "$REPO_URL" | awk -F/ '{print $(NF-1)}')"
REPO_NAME="$(echo "$REPO_URL" | awk -F/ '{print $NF}')"

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status) cmd_status ;;
  reset) cmd_reset ;;
  url) cmd_url ;;
  signin) cmd_signin ;;
  browser-state) cmd_browser_state ;;
  reload-app) cmd_reload_app ;;
  api) shift; api "$@" ;;
  connect-repo)   # [repo-url]; default is AVOOZL_HARNESS_REPO
    connect_repo_file "${2:-$REPO_URL}"
    running && cmd_stop && cmd_start || true ;;
  crew-create)    # NAME [JSON]; created paused unless JSON has {"enabled":true,"unattended":true}
    [ -n "${2:-}" ] || die "usage: crew-create NAME [JSON]"
    body="$(python3 - "$2" "${3:-{\}}" "$REPO_OWNER" "$REPO_NAME" "$AGENT" <<'PY'
import json, sys
name, extra, o, r, agent = sys.argv[1:6]
d = json.loads(extra); d.update({"owner": o, "repo": r, "name": name})
d.setdefault("agent", agent)
# Safe default: created paused. Pass {"enabled":true,"unattended":true} to let it run.
d.setdefault("enabled", False); d.setdefault("unattended", False)
print(json.dumps(d))
PY
)"
    api POST /api/apps/issue-radar/crews "$body" ;;
  crew-list) crew_ids ;;
  crew-edit)      # CREW_ID JSON-PATCH
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || die "usage: crew-edit CREW_ID JSON"
    body="$(python3 - "$2" "$3" "$REPO_OWNER" "$REPO_NAME" <<'PY'
import json, sys
cid, patch, o, r = sys.argv[1:5]
d = json.loads(patch); d.update({"owner": o, "repo": r, "id": cid})
print(json.dumps(d))
PY
)"
    api PUT /api/apps/issue-radar/crew "$body" ;;
  crew-retire)    # CREW_ID (retires; a retired crew keeps its record)
    [ -n "${2:-}" ] || die "usage: crew-retire CREW_ID"
    body="$(python3 -c 'import json,sys; print(json.dumps({"owner":sys.argv[1],"repo":sys.argv[2],"id":sys.argv[3]}))' "$REPO_OWNER" "$REPO_NAME" "$2")"
    api DELETE /api/apps/issue-radar/crew "$body" ;;
  crew-settings)  # JSON of the crew defaults, e.g. '{"idle_seconds":300}'
    [ -n "${2:-}" ] || die "usage: crew-settings JSON"
    body="$(python3 -c 'import json,sys; print(json.dumps({"owner":sys.argv[1],"repo":sys.argv[2],"settings":json.loads(sys.argv[3])}))' "$REPO_OWNER" "$REPO_NAME" "$2")"
    api PUT /api/apps/issue-radar/crews/settings "$body" ;;
  radar-settings) # no argument: show. With JSON: merge it into the current settings and save.
    cur="$(api GET "/api/apps/issue-radar/settings?owner=$REPO_OWNER&repo=$REPO_NAME")"
    if [ -z "${2:-}" ]; then echo "$cur"
    else
      body="$(python3 -c '
import json, sys
cur = json.loads(sys.argv[1]); cur = cur.get("settings", cur)
cur.update(json.loads(sys.argv[2]))
print(json.dumps({"owner": sys.argv[3], "repo": sys.argv[4], "settings": cur}))' "$cur" "$2" "$REPO_OWNER" "$REPO_NAME")"
      api PUT /api/apps/issue-radar/settings "$body"
    fi ;;
  route-avoozl)   # send avoozl:avoozl through the MCP broker so crew chats get a caller identity
    # Setting the override is not enough: the gateway wraps a stub only for a launch
    # the owner approved, and records an unapproved one as refused at boot. So: set,
    # restart (records the launch), approve that launch, restart (wraps it).
    kc config set mcp_gateway.stub_overrides '{"avoozl:avoozl":true}' >/dev/null
    running && cmd_stop; cmd_start
    # The refusal is recorded a few seconds after the dashboard answers.
    el=""
    for _ in $(seq 1 60); do
      el="$(python3 - "$HOME_DIR/mcp-launch-approvals/approvals.json" <<'PY'
import json, sys
try:
    r = json.load(open(sys.argv[1])).get("refused", {})
except Exception:
    r = {}
print(next((v["expected_launch"] for k, v in r.items() if k.lower() == "avoozl:avoozl"), ""))
PY
)"
      [ -n "$el" ] && break
      python3 - "$HOME_DIR/mcp-gateway/agents/avoozl--avoozl-crew.json" <<'PY' && break
import json, sys
try:
    s = json.load(open(sys.argv[1]))["mcpServers"]["avoozl:avoozl"]
except Exception:
    sys.exit(1)
sys.exit(0 if s.get("_kirocrew_mcp_gateway_wrapped") else 1)
PY
      sleep 1
    done
    if [ -n "$el" ]; then
      api POST /api/mcp-gateway/servers/stub "{\"name\":\"avoozl:avoozl\",\"stub\":true,\"expected_launch\":\"$el\"}"
      cmd_stop; cmd_start
    else echo "avoozl:avoozl launch already approved"; fi ;;
  check)
    cmd_status
    echo "dashboard:   $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/")"
    echo "avoozl:      $(kc app list 2>/dev/null | grep -E '^avoozl ' | tr -s ' ')"
    echo "issue-radar: $(kc app list 2>/dev/null | grep -E '^issue-radar ' | tr -s ' ')"
    api GET /api/apps/issue-radar/repos | head -c 400; echo
    echo "avoozl page: $(api GET /apps/avoozl | grep -c "<html")  (1 or more = loads)" ;;
  *) sed -n '2,3p' "$0"; echo "commands: start stop restart status reset url signin browser-state reload-app check api route-avoozl connect-repo crew-create crew-list crew-edit crew-retire crew-settings radar-settings"; exit 2 ;;
esac
