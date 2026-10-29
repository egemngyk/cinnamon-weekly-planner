#!/usr/bin/env bash
# Weekly Planner desklet install script
#   ./install.sh                   install / update
#   ./install.sh --uninstall       remove (does not touch data files)
#   ./install.sh --reset-settings  install + clear stale settings files
set -euo pipefail

UUID="weekly-planner@egemngyk"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$UUID"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/desklets/$UUID"

if [[ "${1:-}" == "--uninstall" ]]; then
    rm -rf "$DEST"
    echo "Removed: $DEST"
    echo "Remove any instances on your desktop from the 'Desklets' settings screen."
    echo "Your data is still here (delete it manually if you want): ${XDG_DATA_HOME:-$HOME/.local/share}/weekly-planner-desklet/"
    exit 0
fi

if [[ "${1:-}" == "--reset-settings" ]]; then
    # Clears settings files left over from old/broken attempts (entry data is untouched).
    rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/cinnamon/spices/$UUID"
    echo "Stale settings cleared. Remove the old desklet instance from your desktop and add it again."
fi

command -v cinnamon >/dev/null 2>&1 && echo "Cinnamon version: $(cinnamon --version 2>/dev/null || echo unknown)"
[[ -f "$SRC/metadata.json" ]] || { echo "Error: $SRC/metadata.json not found" >&2; exit 1; }

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -r "$SRC" "$DEST"
echo "Installed: $DEST"
echo