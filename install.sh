#!/usr/bin/env bash
# Haftalık Planlayıcı desklet kurulum betiği
#   ./install.sh              kur / güncelle
#   ./install.sh --uninstall  kaldır (veri dosyalarına dokunmaz)
#   ./install.sh --reset-settings  kur + eski ayar dosyalarını temizle
set -euo pipefail

UUID="weekly-planner@egemngyk"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$UUID"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/desklets/$UUID"

if [[ "${1:-}" == "--uninstall" ]]; then
    rm -rf "$DEST"
    echo "Kaldırıldı: $DEST"
    echo "Masaüstündeki örnekleri 'Masaüstü Bileşenleri' ekranından silin."
    echo "Verileriniz şurada duruyor (silmek isterseniz elle): ${XDG_DATA_HOME:-$HOME/.local/share}/weekly-planner-desklet/"
    exit 0
fi

if [[ "${1:-}" == "--reset-settings" ]]; then
    # Eski/bozuk denemelerden kalan ayar dosyalarını temizler (kayıt verilerine dokunmaz).
    rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/cinnamon/spices/$UUID"
    echo "Eski ayar dosyaları temizlendi. Masaüstündeki eski örneği kaldırıp yeniden ekleyin."
fi

command -v cinnamon >/dev/null 2>&1 && echo "Cinnamon sürümü: $(cinnamon --version 2>/dev/null || echo bilinmiyor)"
[[ -f "$SRC/metadata.json" ]] || { echo "Hata: $SRC/metadata.json bulunamadı" >&2; exit 1; }

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -r "$SRC" "$DEST"
echo "Kuruldu: $DEST"
echo