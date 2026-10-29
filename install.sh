#!/usr/bin/env bash
# Haftalık Planlayıcı desklet kurulum betiği
#   ./install.sh              kur / güncelle
#   ./install.sh --uninstall  kaldır (veri dosyalarına dokunmaz)
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

command -v cinnamon >/dev/null 2>&1 && echo "Cinnamon sürümü: $(cinnamon --version 2>/dev/null || echo bilinmiyor)"
[[ -f "$SRC/metadata.json" ]] || { echo "Hata: $SRC/metadata.json bulunamadı" >&2; exit 1; }

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -r "$SRC" "$DEST"
echo "Kuruldu: $DEST"
echo
echo "Sonraki adımlar:"
echo "  1) Sistem Ayarları > Masaüstü Bileşenleri (Desklets) > 'Haftalık Planlayıcı' > + ile masaüstüne ekleyin."
echo "  2) Aynı bileşeni istediğiniz kadar tekrar ekleyebilirsiniz; her örnek bağımsızdır."
echo "  3) Güncelleme sonrası görünmüyorsa: Alt+F2, 'r' yazıp Enter (Cinnamon'ı yeniden başlatır)."
