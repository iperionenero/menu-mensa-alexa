#!/bin/bash
# Lanciato da macOS (launchd) ogni giorno: legge il menu e lo pubblica su GitHub.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1
mkdir -p logs
LOG="$DIR/logs/aggiorna.log"

NODE="$(cat locale/.node_path 2>/dev/null)"
[ -x "$NODE" ] || NODE="$(command -v node)"
export PATH="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

avvisa() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Menu mensa\"" >/dev/null 2>&1
}

esegui() {
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="
  local token
  token="$(/usr/bin/security find-generic-password -s menu-mensa-alexa -a github -w 2>/dev/null)"
  if [ -z "$token" ]; then
    echo "Token GitHub non trovato nel Portachiavi: lancia locale/installa.sh --nuovo-token"
    return 1
  fi
  GITHUB_TOKEN="$token" "$NODE" locale/pubblica.mjs
}

esegui >>"$LOG" 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  echo "ERRORE (codice $rc)" >>"$LOG"
  avvisa "Aggiornamento del menu non riuscito: guarda logs/aggiorna.log"
fi

# tiene il log corto
tail -n 2000 "$LOG" >"$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
exit $rc
