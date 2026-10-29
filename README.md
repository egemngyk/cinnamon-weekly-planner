# Weekly Planner (Cinnamon Desklet)

A weekly planner desklet for Linux Mint Cinnamon. Every instance works independently, with its own entries and settings.
The interface is available in **English** (default) and **Turkish**.

## Installation
```bash
./install.sh            # installs into ~/.local/share/cinnamon/desklets/
./install.sh --uninstall
./install.sh --reset-settings   # install + clear stale settings files from old attempts
```
Then: **System Settings → Desklets → Weekly Planner → +**.
Add the desklet as many times as you like; each one starts empty and independent. If it doesn't show up, press `Alt+F2`, type `r`, and hit Enter.

## Usage
- Click an empty day area to add a new entry. Click an entry to see details, edit or delete it.
- ☐/☑ toggles completion (the entry is not deleted; the state belongs only to that week's occurrence).
- In the header: ‹ › week navigation, **Today**, **＋**.
- **Repeat:** "Selected date only" or "Repeat every week". When editing or deleting a weekly entry you choose
  *This week only* or *This and following weeks* (for deletion: end the repeat from this week on).
- **Resizing:** drag the right edge (`⋮`), the bottom edge (`⋯`) or the bottom-right corner (`◢`) with the mouse.
  The right-click menu also has *Width ±60*, *Height ±60* and *Go to this week*.
- **Scale:** Configure → Size → *UI scale* (75%–200%) scales fonts, spacing and buttons together.
- **Responsive columns:** the seven columns shrink with the desklet width; below a minimum column width
  they stop shrinking and horizontal scrolling takes over.

## Language
Open **Configure** (right-click the desklet → *Configure…*, or the gear button in System Settings → Desklets)
and pick **Language → English / Türkçe**. The change applies immediately to the week title, day names,
buttons, dialogs and the right-click menu. The language is a per-instance setting, so different desklets can use different languages.
The Configure window itself (setting names) is always shown in English.

## Data model and isolation
- Appearance settings: Cinnamon's per-instance settings file (`~/.config/cinnamon/spices/weekly-planner@egemngyk/<id>.json`).
- Entries: `~/.local/share/weekly-planner-desklet/<desklet_id>.json` (atomic writes, the previous version is kept as a `<id>.json~` backup;
  a corrupt file is moved aside as `.corrupt-<timestamp>`).
- `items` (rules: `once` / `weekly`) and `occ` (per-date exceptions: `done`, `skip`, `over`) are stored separately;
  no per-week copies are generated for weekly entries. Day/time/week calculations use the local time zone.
- Removing the desklet does not delete its data file (so nothing is lost when reloading).

## Supported versions / assumptions
- Target: Cinnamon 5.x and 6.x (Linux Mint 21/22). Uses the `Desklet`, `DeskletSettings`, `ModalDialog` and `St` APIs;
  there is no Node/Electron/web dependency. It is expected to work on 4.x as well but this was not verified.
- Dates are entered as `YYYY-MM-DD` (± day buttons). Weeks start on Monday.
- "This and following weeks" editing splits the series; earlier weeks keep their old state.

## Development / debugging
- Model logic tests (no Cinnamon needed): `node tests/model.test.js` (runs without touching `desklet.js`).
- After changing the code: `./install.sh` → `Alt+F2` → `r`.
- Logs: `Alt+F2` → `lg` (Looking Glass → Logs), or `journalctl -f | grep -i weekly-planner`, `~/.xsession-errors`.
- To reset a single instance's data, delete its `<desklet_id>.json` file.
- If the desklet fails to start, the error is shown on the desktop in red and written to the log.

## Troubleshooting
- **Configure won't open / "!" icon:** run `./install.sh --reset-settings`, remove the old desklet instance from the desktop,
  restart Cinnamon (`Alt+F2` → `r`) and add the desklet again.

## License

MIT — see [LICENSE](LICENSE).