#!/bin/sh
set -eu

SERVICE_NAME="${1:-shibakubot}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
SYSTEM_NODE="${SYSTEM_NODE:-/usr/bin/node}"
SYSTEM_NPM="${SYSTEM_NPM:-/usr/bin/npm}"

if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
  USE_SUDO=1
else
  USE_SUDO=0
fi

log() {
  printf '\n==> %s\n' "$*"
}

run() {
  printf '+ %s\n' "$*"
  "$@"
}

run_sudo() {
  if [ "$USE_SUDO" -eq 1 ]; then
    printf '+ sudo %s\n' "$*"
    sudo "$@"
  else
    printf '+ %s\n' "$*"
    "$@"
  fi
}

cd "$REPO_DIR"

log "repo"
pwd

log "runtime versions"
run node -v
run npm -v
if [ -x "$SYSTEM_NODE" ]; then
  run "$SYSTEM_NODE" -v
  run "$SYSTEM_NODE" -p "process.execPath + \" abi=\" + process.versions.modules"
fi

log "stop service"
run_sudo systemctl stop "$SERVICE_NAME" || true

log "clean install dependencies for current Node.js"
run rm -rf node_modules
if [ -x "$SYSTEM_NODE" ] && [ -f "$SYSTEM_NPM" ]; then
  run env npm_config_build_from_source=true "$SYSTEM_NODE" "$SYSTEM_NPM" ci
else
  run env npm_config_build_from_source=true npm ci
fi

log "rebuild better-sqlite3 for current Node.js"
if [ -d node_modules/better-sqlite3 ]; then
  run rm -rf node_modules/better-sqlite3/build
fi
if [ -x "$SYSTEM_NODE" ] && [ -f "$SYSTEM_NPM" ]; then
  run env npm_config_build_from_source=true "$SYSTEM_NODE" "$SYSTEM_NPM" rebuild better-sqlite3
else
  run env npm_config_build_from_source=true npm rebuild better-sqlite3
fi

log "build bot"
if [ -x "$SYSTEM_NODE" ] && [ -f "$SYSTEM_NPM" ]; then
  run "$SYSTEM_NODE" "$SYSTEM_NPM" run build
else
  run npm run build
fi

if [ -f dist/music/commandHandlers.js ]; then
  log "verify spotify fix markers in dist"
  run grep -nE 'artist-author|title-noise|歌い方' dist/music/commandHandlers.js || true
fi

log "verify better-sqlite3 load"
if [ -x "$SYSTEM_NODE" ]; then
  run "$SYSTEM_NODE" -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.prepare('select 1 as x').get(); db.close(); console.log('better-sqlite3 ok', process.execPath, process.version, process.versions.modules);"
else
  run node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.prepare('select 1 as x').get(); db.close(); console.log('better-sqlite3 ok', process.execPath, process.version, process.versions.modules);"
fi

log "start service"
run_sudo systemctl start "$SERVICE_NAME"

log "service status"
run_sudo systemctl --no-pager --full status "$SERVICE_NAME" || true

log "recent logs"
run_sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager || true
