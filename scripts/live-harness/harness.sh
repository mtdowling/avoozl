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
HOME_DIR="$DIR/home"
# Kiro Crew lets a second home write agent files only to <home>/kiro/agents;
# anywhere else it refuses, and app agents such as avoozl-crew never load.
KIRO_DIR="$HOME_DIR/kiro"
PIDFILE="$DIR/gateway.pid"
LOG="$DIR/gateway.log"

die() { echo "harness: $*" >&2; exit 1; }

# Refuse the real home, whatever the caller set.
case "$DIR" in
  "$HOME/.kiro"*|"$HOME/.local/state"*|"") die "unsafe AVOOZL_HARNESS_DIR: $DIR" ;;
esac
[ "$DIR" != "/" ] || die "unsafe AVOOZL_HARNESS_DIR"

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

prepare() {
  mkdir -p "$HOME_DIR" "$KIRO_DIR" "$DIR/bin"
  # Radar runs gh from its own copy.
  [ -x "$DIR/bin/gh" ] || cp "$(command -v gh)" "$DIR/bin/gh"
  # Installed apps come from a copy, so a rebuild in the repo cannot change a running harness.
  mkdir -p "$DIR/app"
  cp -r "$ROOT/kirocrew-app/." "$DIR/app/"
  kc config set agent.apps_trusted_local '["avoozl"]' >/dev/null
  kc config set tunnel.enabled false >/dev/null
  kc config set agent.apps_allow_third_party true >/dev/null
  kc config set agent.sandbox_allow_unsandboxed_exec true >/dev/null
  kc app list 2>/dev/null | grep -q '^avoozl ' || kc app install "$DIR/app" >/dev/null
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

# api METHOD PATH [JSON]
api() {
  local t s='?'
  t="$(token)"; [ -n "$t" ] || die "no sign-in token (is the harness running?)"
  case "$2" in *\?*) s='&' ;; esac
  curl -sS -X "$1" "http://localhost:$PORT$2${s}token=$t" \
    -H 'Content-Type: application/json' ${3:+-d "$3"}
  echo
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
  check)
    cmd_status
    echo "dashboard:   $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/")"
    echo "avoozl:      $(kc app list 2>/dev/null | grep -E '^avoozl ' | tr -s ' ')"
    echo "issue-radar: $(kc app list 2>/dev/null | grep -E '^issue-radar ' | tr -s ' ')"
    api GET /api/apps/issue-radar/repos | head -c 400; echo
    echo "avoozl page: $(api GET /apps/avoozl | grep -c "<html")  (1 or more = loads)" ;;
  *) sed -n '2,3p' "$0"; echo "commands: start stop restart status reset url check api connect-repo crew-create crew-list crew-edit crew-retire crew-settings radar-settings"; exit 2 ;;
esac
