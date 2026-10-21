#!/bin/bash
# Installa l'aggiornamento automatico del menu su questo Mac.
# Uso:  bash locale/installa.sh               (prima installazione)
#       bash locale/installa.sh --nuovo-token (sostituisce il token GitHub)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
LABEL="it.menumensa.aggiorna"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "Node.js non trovato. Installa la versione LTS da https://nodejs.org e rilancia questo comando."
  exit 1
fi
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 18 ]; then
  echo "Serve Node.js 18 o più recente (hai $("$NODE" -v))."
  exit 1
fi
echo "$NODE" > locale/.node_path
BIN="$(dirname "$NODE")"
NPM="$BIN/npm";  [ -x "$NPM" ] || NPM="$(command -v npm)"
NPX="$BIN/npx";  [ -x "$NPX" ] || NPX="$(command -v npx)"

echo "1/4  Installo Playwright e Chromium (qualche minuto la prima volta)..."
"$NPM" install --no-audit --no-fund --silent
"$NPX" playwright install chromium

echo "2/4  Token GitHub"
if /usr/bin/security find-generic-password -s menu-mensa-alexa -a github >/dev/null 2>&1 && [ "${1:-}" != "--nuovo-token" ]; then
  echo "     Token già salvato nel Portachiavi."
else
  echo "     Incolla il token GitHub (non viene mostrato mentre lo incolli) e premi Invio:"
  read -rs TOKEN; echo
  if [ -z "$TOKEN" ]; then echo "Nessun token inserito."; exit 1; fi
  /usr/bin/security add-generic-password -U -s menu-mensa-alexa -a github -l "Menu mensa – token GitHub" -w "$TOKEN"
  unset TOKEN
  echo "     Token salvato nel Portachiavi."
fi

echo "3/4  Pianifico l'aggiornamento (ogni giorno alle 6:40 e alle 13:10)"
mkdir -p "$HOME/Library/LaunchAgents" logs
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DIR/locale/aggiorna.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>40</integer></dict>
    <dict><key>Hour</key><integer>13</integer><key>Minute</key><integer>10</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$DIR/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/launchd.log</string>
</dict>
</plist>
EOF
/usr/bin/plutil -lint "$PLIST" >/dev/null
/bin/launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "4/4  Primo aggiornamento di prova..."
if /bin/bash locale/aggiorna.sh; then
  echo
  tail -n 4 logs/aggiorna.log
  echo
  echo "Fatto. Il menu si aggiornerà da solo ogni giorno."
else
  echo
  tail -n 40 logs/aggiorna.log
  echo
  echo "Il primo aggiornamento NON è riuscito: copia le righe qui sopra e mandale a Claude."
  exit 1
fi
