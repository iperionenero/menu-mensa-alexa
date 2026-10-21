#!/bin/bash
# Rimuove l'aggiornamento automatico e il token dal Portachiavi (la cartella resta).
LABEL="it.menumensa.aggiorna"
/bin/launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
/usr/bin/security delete-generic-password -s menu-mensa-alexa -a github >/dev/null 2>&1
echo "Aggiornamento automatico rimosso."
