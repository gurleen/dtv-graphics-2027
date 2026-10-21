#!/usr/bin/env bash
# One verification instance of the DTV show server, on a scratch database.
#
#   dtv.sh up      [--port=8998]   fresh scratch DB, seed, serve; waits until it answers
#   dtv.sh doctor  [--port=8998]   read-only: is this instance ours, this checkout's, and drivable
#   dtv.sh stop    [--port=8998]   SIGTERM the server, keep its DB (the restart journey)
#   dtv.sh start   [--port=8998]   serve the kept DB again, without seeding
#   dtv.sh down    [--port=8998]   stop, then delete the scratch dir; build/verify/ is never touched
#
# Scratch state (DB, backups, log, pid) lives in ${TMPDIR:-/tmp}/dtv-verify-<port>/.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
PORT=8998
for arg in "${@:2}"; do
  case $arg in
    --port=*) PORT=${arg#--port=} ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done
RUN="${TMPDIR:-/tmp}"
RUN="${RUN%/}/dtv-verify-$PORT"
DB="$RUN/dtv.sqlite"
PIDFILE="$RUN/server.pid"
LOG="$RUN/server.log"
MAIN="$ROOT/apps/server/src/main.ts"

pid() { [[ -f $PIDFILE ]] && cat "$PIDFILE" || true; }
alive() { local p; p=$(pid); [[ -n $p ]] && kill -0 "$p" 2>/dev/null; }
# A pid is ours only while it still runs this checkout's server; a recycled pid is someone else's.
ours() { local p; p=$(pid); [[ -n $p ]] && ps -o command= -p "$p" 2>/dev/null | grep -qF "$MAIN"; }
listener() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true; }

serve() {
  local seed=$1
  local holder; holder=$(listener)
  if [[ -n $holder ]]; then
    echo "FAIL port $PORT is held by pid $holder ($(ps -o command= -p "$holder" | cut -c1-120)); not ours, not driving it" >&2
    exit 1
  fi
  mkdir -p "$RUN"
  echo "$ROOT" > "$RUN/root"
  cd "$ROOT"
  PORT=$PORT DTV_DB=$DB nohup bun "$MAIN" $seed >> "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  for _ in $(seq 1 150); do
    if grep -q "dtv server on http://localhost:$PORT" "$LOG" 2>/dev/null; then
      echo "up: http://localhost:$PORT  pid $(pid)  db $DB  log $LOG"
      return 0
    fi
    if ! alive; then echo "FAIL the server exited before serving:" >&2; tail -20 "$LOG" >&2; exit 1; fi
    sleep 0.2
  done
  echo "FAIL no 'dtv server on' line after 30 s; see $LOG" >&2
  exit 1
}

stop() {
  if ! alive; then rm -f "$PIDFILE"; echo "stop: nothing running on $PORT from $RUN"; return 0; fi
  if ! ours; then echo "FAIL pid $(pid) is not this checkout's server; leaving it alone" >&2; exit 1; fi
  local p; p=$(pid)
  kill -TERM "$p"
  for _ in $(seq 1 50); do kill -0 "$p" 2>/dev/null || break; sleep 0.2; done
  if kill -0 "$p" 2>/dev/null; then echo "FAIL pid $p ignored SIGTERM for 10 s" >&2; exit 1; fi
  rm -f "$PIDFILE"
  echo "stopped pid $p"
}

doctor() {
  local failed=0
  fail() { echo "FAIL $*"; failed=1; }
  ok() { echo "ok   $*"; }
  alive && ok "server pid $(pid) is running" || fail "no server from $PIDFILE; run dtv.sh up --port=$PORT"
  ours && ok "pid $(pid) runs $MAIN" || fail "pid $(pid) is not this checkout's server"
  local holder; holder=$(listener)
  [[ -n $holder && $holder == "$(pid)" ]] && ok "port $PORT is held by our pid" || fail "port $PORT is held by '${holder:-nobody}', not pid $(pid)"
  [[ -f $RUN/root && $(cat "$RUN/root") == "$ROOT" ]] && ok "started from $ROOT" || fail "started from $(cat "$RUN/root" 2>/dev/null || echo '?'), not $ROOT"
  local status; status=$(curl -fsS "http://localhost:$PORT/status" 2>/dev/null || true)
  if [[ -z $status ]]; then
    fail "/status does not answer"
  else
    local db; db=$(perl -ne 'print $1 if m{<th>Database</th><td>([^<]*)</td>}' <<<"$status")
    [[ $db == "$DB" ]] && ok "serves the scratch DB $DB" || fail "serves '$db', not the scratch DB $DB"
    perl -ne 'while (m{<th>([^<]*)</th><td>([^<]*)</td>}g) { print "     $1: $2\n" unless $1 eq "Database" }' <<<"$status"
  fi
  for path in / /renderer /riv/basketball_scorebug.riv; do
    local code; code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT$path" || true)
    [[ $code == 200 ]] && ok "GET $path 200" || fail "GET $path $code"
  done
  local scenes=0 stale="" missing="" rml riv
  for rml in "$ROOT"/graphics/basketball-v2/*.rml; do
    scenes=$((scenes + 1))
    riv="$ROOT/build/riv/$(basename "${rml%.rml}").riv"
    if [[ ! -f $riv ]]; then missing="$missing $(basename "$riv")"; elif [[ $rml -nt $riv ]]; then stale="$stale $(basename "$riv")"; fi
  done
  [[ -z $missing ]] && ok "build/riv has all $scenes signed scenes" || fail "build/riv lacks$missing; run bun run riv:build"
  [[ -z $stale ]] && ok "no .riv is older than its .rml" || fail "stale:$stale; run bun run riv:build"
  echo "     checkout: $(git -C "$ROOT" rev-parse --short HEAD) on $(git -C "$ROOT" branch --show-current)$(git -C "$ROOT" diff --quiet HEAD -- . ':!.claude' || echo ', uncommitted changes')"
  return $failed
}

case ${1:-} in
  up)
    if alive; then echo "FAIL pid $(pid) already serves port $PORT; dtv.sh down --port=$PORT first" >&2; exit 1; fi
    rm -rf "$RUN"
    serve --seed
    ;;
  start)
    if alive; then echo "already running: pid $(pid)"; exit 0; fi
    [[ -f $DB ]] || { echo "FAIL no kept DB at $DB; use up" >&2; exit 1; }
    serve ""
    ;;
  stop) stop; echo "DB kept at $DB" ;;
  down) stop; rm -rf "$RUN"; echo "removed $RUN" ;;
  doctor) doctor ;;
  *) sed -n '2,10p' "$0"; exit 2 ;;
esac
