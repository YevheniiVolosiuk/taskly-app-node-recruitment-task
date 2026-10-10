#!/usr/bin/env bash
# Usage: stack.sh up | doctor | env | down
#   up      start a disposable Postgres container, the built backend, and the built frontend
#   doctor  read-only health check of the instance this script started; exit 1 if unfit to drive
#   env     print shell assignments for the running instance: eval "$(stack.sh env)"
#   down    stop what `up` started, keep the evidence, print its path
# One instance per machine: fixed ports and container name. `up` refuses to start over a live instance.
# Linux only (ss, setsid).
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
STATE="$ROOT/.verify/state"
CONTAINER=taskly-verify-postgres
DB_PORT=55432
API_PORT=18000
WEB_PORT=14173
DATABASE_URL="postgresql://taskly:taskly@127.0.0.1:$DB_PORT/taskly"
API_URL="http://127.0.0.1:$API_PORT"
WEB_URL="http://127.0.0.1:$WEB_PORT"

say() { printf '%s\n' "$*"; }
fail() { printf 'stack.sh: %s\n' "$*" >&2; exit 1; }

port_busy() { ss -Htln "sport = :$1" | grep -q .; }

wait_for() { # wait_for <seconds> <description> <command...>
  local seconds=$1 what=$2; shift 2
  for _ in $(seq "$seconds"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  fail "$what not ready after ${seconds}s"
}

start_bg() { # start_bg <name> <log> <command...>: own process group, pid recorded for down
  local name=$1 log=$2; shift 2
  setsid "$@" >"$log" 2>&1 < /dev/null &
  echo $! > "$STATE/$name.pid"
}

up() {
  [ -e "$STATE" ] && fail "an instance is already recorded in $STATE; run doctor or down first"
  for port in $DB_PORT $API_PORT $WEB_PORT; do port_busy "$port" && fail "port $port is in use by something this script did not start"; done
  docker info >/dev/null 2>&1 || fail "docker is not running"

  local run_id evidence
  run_id="$(date -u +%Y%m%dT%H%M%SZ)"
  evidence="$ROOT/.verify/evidence/$run_id"
  mkdir -p "$STATE" "$evidence"
  echo "$evidence" > "$STATE/evidence"
  { say "run: $run_id"; say "commit: $(git -C "$ROOT" rev-parse HEAD)"; git -C "$ROOT" status --short; } > "$evidence/run.txt"

  say "postgres: $CONTAINER on 127.0.0.1:$DB_PORT (tmpfs, discarded on down)"
  docker run -d --name "$CONTAINER" --label taskly.verify=1 --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_USER=taskly -e POSTGRES_PASSWORD=taskly -e POSTGRES_DB=taskly \
    -p "127.0.0.1:$DB_PORT:5432" postgres:17-alpine >/dev/null
  wait_for 60 postgres docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U taskly -d taskly

  for package in backend frontend; do
    [ -d "$ROOT/$package/node_modules" ] || npm --prefix "$ROOT/$package" ci
  done

  say "backend: build, then $API_URL"
  npm --prefix "$ROOT/backend" run build > "$STATE/backend-build.log" 2>&1 || fail "backend build failed, see $STATE/backend-build.log"
  (cd "$ROOT/backend" && DATABASE_URL="$DATABASE_URL" API_PORT=$API_PORT start_bg backend "$STATE/backend.log" node dist/main.js)
  wait_for 60 backend curl -fsS "$API_URL/api/health"

  say "frontend: build, then $WEB_URL (proxies /api to $API_URL)"
  npm --prefix "$ROOT/frontend" run build > "$STATE/frontend-build.log" 2>&1 || fail "frontend build failed, see $STATE/frontend-build.log"
  (cd "$ROOT/frontend" && TASKLY_API_URL="$API_URL" start_bg frontend "$STATE/frontend.log" \
    node_modules/.bin/vite preview --host 127.0.0.1 --port $WEB_PORT --strictPort)
  wait_for 60 frontend curl -fsS "$WEB_URL/api/health"

  say "ready: $WEB_URL"
  say "evidence: $evidence"
}

doctor() {
  [ -d "$STATE" ] || fail "no instance recorded; run up"
  local ok=0
  check() { if "${@:2}" >/dev/null 2>&1; then say "ok    $1"; else say "FAIL  $1"; ok=1; fi; }
  local backend_pid frontend_pid
  backend_pid="$(cat "$STATE/backend.pid" 2>/dev/null || echo none)"
  frontend_pid="$(cat "$STATE/frontend.pid" 2>/dev/null || echo none)"
  check "postgres container $CONTAINER running" \
    sh -c "[ \"\$(docker inspect -f '{{.State.Running}} {{index .Config.Labels \"taskly.verify\"}}' $CONTAINER)\" = 'true 1' ]"
  check "backend pid $backend_pid alive" kill -0 "$backend_pid"
  check "frontend pid $frontend_pid alive" kill -0 "$frontend_pid"
  check "port $API_PORT owned by backend pid" sh -c "ss -Htlnp 'sport = :$API_PORT' | grep -q 'pid=$backend_pid,'"
  check "port $WEB_PORT owned by frontend process group" sh -c "ss -Htlnp 'sport = :$WEB_PORT' | grep -oP 'pid=\K[0-9]+' | xargs -r ps -o pgid= -p | grep -qw '$frontend_pid'"
  check "GET $API_URL/api/health is ok" sh -c "curl -fsS $API_URL/api/health | grep -q '\"ok\"'"
  check "GET $WEB_URL/api/health is ok (frontend proxy)" sh -c "curl -fsS $WEB_URL/api/health | grep -q '\"ok\"'"
  check "GET $WEB_URL/ serves the app" sh -c "curl -fsS $WEB_URL/ | grep -q '<div id=\"root\">'"
  say "built from: $(sed -n 's/^commit: //p' "$(cat "$STATE/evidence")/run.txt"), HEAD is $(git -C "$ROOT" rev-parse HEAD)"
  return $ok
}

print_env() {
  [ -f "$STATE/evidence" ] || fail "no instance recorded; run up"
  local scripts="$ROOT/.claude/skills/verify/scripts"
  say "S=$scripts/stack.sh U=$scripts/ui.sh WEB=$WEB_URL API=$API_URL EVIDENCE=$(cat "$STATE/evidence")"
}

down() {
  [ -d "$STATE" ] || { say "nothing to stop"; return 0; }
  local evidence
  evidence="$(cat "$STATE/evidence" 2>/dev/null || true)"
  local pids=() alive
  for name in frontend backend; do
    [ -f "$STATE/$name.pid" ] && pids+=("$(cat "$STATE/$name.pid")")
  done
  for pid in "${pids[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || true; done
  for _ in $(seq 10); do
    alive=0
    for pid in "${pids[@]}"; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ $alive = 0 ] && break
    sleep 1
  done
  for pid in "${pids[@]}"; do kill -KILL -- "-$pid" 2>/dev/null || true; done
  if [ "$(docker inspect -f '{{index .Config.Labels "taskly.verify"}}' "$CONTAINER" 2>/dev/null)" = 1 ]; then
    docker rm -f "$CONTAINER" >/dev/null
  fi
  [ -n "$evidence" ] && cp "$STATE"/*.log "$evidence"/ 2>/dev/null || true
  rm -rf "$STATE"
  say "stopped; evidence kept at ${evidence:-<none>}"
}

case "${1:-}" in
  up) up ;;
  doctor) doctor ;;
  env) print_env ;;
  down) down ;;
  *) fail "usage: stack.sh up | doctor | env | down" ;;
esac
