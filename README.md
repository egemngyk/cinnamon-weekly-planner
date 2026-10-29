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
- **Add:** press **＋** in the header. The new entry is added at the **bottom of the selected day**.
  The selected day has an accent-colored border; click a day to select it (by default it is today, or the first visible day).
- **Edit / delete:** click an entry. The dialog has *Title*, *Notes*, a **color picker** (palette swatches),
  a *To-do* toggle (adds a completion checkbox) and an *Important* toggle (★, highlighted). *Delete* asks for confirmation.
- **Reorder:** press and drag the **≡** grip of an entry. It moves live while you drag; drop it between other entries.
  Dragging onto another day moves the entry to that day.
- **Complete:** ☐/☑ toggles a *To-do* entry (the entry is not deleted).
- **Weeks:** ‹ › and **Today** in the header. Entries belong to a date; nothing repeats automatically.
- **Settings (Configure):** *General* — language, layout, size, UI scale, colors, frame, title formats.
  *Entries* — **Visible days** (hide any weekdays completely; their entries are kept) and **Content** (notes preview, checkbox, ★).
- **Resizing:** drag the right edge (`⋮`), the bottom edge (`⋯`) or the bottom-right corner (`◢`) with the mouse.
  The right-click menu also has *Width ±60*, *Height ±60* and *Go to this week*.
- **Responsive columns:** the seven columns shrink with the desklet width; below a minimum column width
  they stop shrinking and horizontal scrolling takes over.

## Language
Open **Configure → General** (right-click the desklet → *Configure…*, or the gear button in System Settings → Desklets)
and pick **Language → English / Turkish**. The change applies immediately to the week title, day names,
buttons, dialogs and the right-click menu. The language is a per-instance setting, so different desklets can use different languages.
The Configure window itself (setting names) is always shown in English.

## Data model and isolation
- Appearance settings: Cinnamon's per-instance settings file (`~/.config/cinnamon/spices/weekly-planner@egemngyk/<id>.json`).
- Entries: `~/.local/share/weekly-planner-desklet/<desklet_id>.json` (atomic writes, the previous version is kept as a `<id>.json~` backup;
  a corrupt file is moved aside as `.corrupt-<timestamp>`).
- `days` maps a date (`YYYY-MM-DD`) to the ordered list of its entries; each entry has `title`, `notes`, `color`, `important`, `todo`, `done`.
  Day/time/week calculations use the local time zone.
- Data files from versions before 1.3 are converted automatically on first load (the original is kept as `<id>.json.pre-v3`).
  Weekly entries of those files are copied onto the dates from 8 weeks back to a year ahead; due dates are dropped.
- Removing the desklet does not delete its data file (so nothing is lost when reloading).

## Supported versions / assumptions
- Target: Cinnamon 5.x and 6.x (Linux Mint 21/22). Uses the `Desklet`, `DeskletSettings`, `ModalDialog` and `St` APIs;
  there is no Node/Electron/web dependency. It is expected to work on 4.x as well but this was not verified.
- Weeks start on Monday.
- The settings window uses a `layout` with two pages (General, Entries), which Cinnamon 5.x/6.x support.

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