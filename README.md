# Haftalık Planlayıcı (Cinnamon Desklet)

Linux Mint Cinnamon için, her örneği bağımsız çalışan haftalık planlayıcı deskleti.

## Kurulum
```bash
./install.sh            # ~/.local/share/cinnamon/desklets/ altına kurar
./install.sh --uninstall
```
Sonra: **Sistem Ayarları → Masaüstü Bileşenleri → Haftalık Planlayıcı → +**.
Aynı bileşeni istediğiniz kadar ekleyin; her biri boş ve bağımsız başlar. Görünmezse `Alt+F2`, `r`, Enter.

## Kullanım
- Boş gün alanına tıkla → yeni kayıt. Kayda tıkla → ayrıntı / düzenle / sil.
- ☐/☑ ile tamamlama (kayıt silinmez; durum yalnızca o haftanın örneğine bağlıdır).
- Başlıkta ‹ › hafta gezinme, **Bugün**, **＋**. Sağ tık menüsü: *Kategorileri düzenle*, *Bu haftaya git*, *Yapılandır* (görünüm ayarları).
- **Tekrar:** "Yalnızca seçilen tarih" veya "Her hafta tekrarla". Haftalık kaydı düzenlerken/silerken
  *Yalnızca bu hafta* veya *Bu ve sonraki haftalar* (silmede: bu haftadan itibaren tekrarı sonlandır) seçilir.

## Veri modeli ve izolasyon
- Görünüm ayarları: Cinnamon'ın instance başına ayar dosyası (`~/.config/cinnamon/spices/weekly-planner@egemngyk/<id>.json`).
- Kayıtlar: `~/.local/share/weekly-planner-desklet/<desklet_id>.json` (atomik yazım, bir önceki sürüm `<id>.json~` yedeği;
  bozuk dosya `.corrupt-<zaman>` olarak kenara alınır).
- `items` (kurallar: `once` / `weekly`) ile `occ` (tarih başına istisna: `done`, `skip`, `over`) ayrı tutulur;
  haftalık kayıt için hafta başına kopya üretilmez. Gün/saat/hafta hesapları yerel saat dilimiyle yapılır.
- Desklet kaldırılsa bile veri dosyası silinmez (yeniden yükleme sırasında kayıp olmasın diye).

## Desteklenen sürüm / varsayımlar
- Hedef: Cinnamon 5.x ve 6.x (Linux Mint 21/22). `Desklet`, `DeskletSettings`, `ModalDialog`, `St` API'leri kullanılır;
  Node/Electron/web bağımlılığı yoktur. 4.x'te de çalışması beklenir ama doğrulanmadı.
- Tarih girişi `YYYY-AA-GG` (±1 gün düğmeleriyle), saat `SS:DD`. Gün adları/aylar Türkçe sabittir.
- "Bu ve sonraki haftalar" düzenlemesi seriyi böler; önceki haftalar eski haliyle kalır.

## Geliştirme / hata ayıklama
- Model mantığı testi (Cinnamon gerektirmez): `node tests/model.test.js`
- Kodu değiştirince: `./install.sh` → `Alt+F2` → `r`.
- Günlük: `Alt+F2` → `lg` (Looking Glass → Logs), veya `journalctl -f | grep -i weekly-planner`, `~/.xsession-errors`.
- Tek örnek verisini sıfırlamak: ilgili `<desklet_id>.json` dosyasını silin.
