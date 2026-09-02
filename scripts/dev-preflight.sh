#!/usr/bin/env bash
# Clears this repo's own orphaned dev servers before `pnpm dev` starts.
#
# `nest start --watch` runs the API as a GRANDCHILD whose command line is
# `node --enable-source-maps .../apps/api/dist/main` — note: no `.js`. Killing a
# terminal, or the pnpm wrapper, reaps the wrappers and leaves that grandchild
# alive still holding port 4100. The next `pnpm dev` then cannot bind, and
# because `pnpm --parallel` treats one child's failure as the run's failure it
# SIGTERMs the web server too. The visible error is "web dev: Command failed
# with signal SIGTERM", which blames the wrong process entirely.
#
# This kills ONLY a listener that is this repo's own dev server. Anything else
# on those ports is reported and left alone — another project's server is not
# ours to kill.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

check_port() {
  local port=$1 label=$2 pid cmd
  pid=$(ss -ltpnH "sport = :${port}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -z "$pid" ] && return 0

  cmd=$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null)
  case "$cmd" in
    *"${REPO}/apps/api/dist/main"*|*"next dev -p ${port}"*|*"next-server"*)
      echo "dev-preflight: reclaiming port ${port} (${label}) from orphaned pid ${pid}"
      kill "$pid" 2>/dev/null
      for _ in $(seq 1 20); do
        ss -ltnH "sport = :${port}" 2>/dev/null | grep -q . || return 0
        sleep 0.25
      done
      kill -9 "$pid" 2>/dev/null
      sleep 0.5
      ;;
    *)
      echo "dev-preflight: port ${port} (${label}) is held by pid ${pid}, which is NOT this repo:" >&2
      echo "  ${cmd:0:120}" >&2
      echo "  Stop it yourself, or free the port, then run pnpm dev again." >&2
      return 1
      ;;
  esac
}

# An e2e run OWNS apps/web/.next while it lasts: `next start -p 3190` serves
# straight out of that directory. Clearing it mid-run does not fail loudly —
# it pulls the build out from under the server, and every page load after that
# moment dies. The suite then reports a wall of timeouts and teardown aborts
# that look like real regressions, in tests that were never even related to the
# change under test. That is a worse outcome than a failing test, because it
# costs someone a run AND sends them hunting a bug that does not exist.
#
# Ports 3190/4190 listening is the honest signal that a run owns the directory.
# Do NOT probe for a playwright process instead: between its webServer teardown
# and the next spawn the process list goes momentarily quiet, and a check that
# samples that instant concludes the coast is clear. (It did, and it cost a
# 10-minute run.) The ports are held for the whole run; the process list is not.
refuse_if_e2e_running() {
  local port
  for port in 3190 4190; do
    if ss -ltnH "sport = :${port}" 2>/dev/null | grep -q .; then
      echo "dev-preflight: an e2e run is live (port ${port} is listening)." >&2
      echo "  It is serving out of apps/web/.next, which starting dev would clear." >&2
      echo "  Wait for the run to finish, then start dev again." >&2
      return 1
    fi
  done
}

# `next build` (e2e prepare, or a manual prod build) writes into the SAME
# apps/web/.next that `next dev` uses, and leaves a BUILD_ID behind. Starting
# dev on top of that mixes production chunk ids into dev's graph: the browser
# asks for a chunk the dev server no longer has, the module factory comes back
# undefined, and a lazy import dies with "Cannot read properties of undefined
# (reading 'call')" — an error that names nothing to do with the real cause.
# A production build is never a valid base for dev, so drop it.
clear_prod_build() {
  local next_dir="${REPO}/apps/web/.next"
  if [ -f "${next_dir}/BUILD_ID" ]; then
    echo "dev-preflight: apps/web/.next holds a production build — clearing it"
    rm -rf "${next_dir}"
  fi
}

# Before anything destructive: never step on a live e2e run.
refuse_if_e2e_running || exit 1

rc=0
check_port 4100 api || rc=1
check_port 3100 web || rc=1
[ $rc -eq 0 ] && clear_prod_build
exit $rc
