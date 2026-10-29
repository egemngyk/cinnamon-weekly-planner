/* Weekly Planner — Cinnamon desklet
 *
 * Architecture:
 *  - Model: pure data logic with no GI dependency (testable with node).
 *  - PlannerDesklet: Cinnamon UI, settings and storage.
 *
 * Entries belong to a date. The ＋ button adds a new entry at the bottom of the selected day; entries can be
 * reordered (and moved to another day) by dragging their ≡ grip.
 *
 * Every desklet instance (desklet_id) uses its own settings file (managed by Cinnamon) and its own
 * data file: ~/.local/share/weekly-planner-desklet/<desklet_id>.json
 */

const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const Cinnamon = imports.gi.Cinnamon;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const ModalDialog = imports.ui.modalDialog;

const DATA_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'weekly-planner-desklet']);

/* Colors offered by the color picker in the entry dialog. */
const PALETTE = ['#e5534b', '#e67e22', '#e0a030', '#f1c40f', '#6ab04c', '#3fb0a0', '#4f9dde', '#2c6fbb',
    '#8e6ad8', '#d9609a', '#a0522d', '#7f8c9a', '#2c3e50', '#16a085', '#c0392b', '#95a5a6'];

/* Color names that older versions accepted as text (only used when migrating old data files). */
const COLOR_NAMES = {
    blue: '#4f9dde', mavi: '#4f9dde', red: '#e5534b', 'kırmızı': '#e5534b', kirmizi: '#e5534b',
    yellow: '#e0a030', 'sarı': '#e0a030', sari: '#e0a030', purple: '#8e6ad8', mor: '#8e6ad8',
    teal: '#3fb0a0', turkuaz: '#3fb0a0', gray: '#7f8c9a', grey: '#7f8c9a', gri: '#7f8c9a',
    pink: '#d9609a', pembe: '#d9609a', green: '#6ab04c', 'yeşil': '#6ab04c', yesil: '#6ab04c',
    orange: '#e67e22', turuncu: '#e67e22', navy: '#2c3e50', lacivert: '#2c3e50'
};

/* ------------------------------------------------------------------ */
/* Translations (English is the default; Turkish is selectable)        */
/* ------------------------------------------------------------------ */

const I18N = {
    en: {
        dayFirst: false,
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        monthsS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        daysS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        shortDate: function (d) { return pad(d.getMonth() + 1) + '/' + pad(d.getDate()); },
        today: 'Today',
        menuWPlus: 'Width +60', menuWMinus: 'Width −60', menuHPlus: 'Height +60', menuHMinus: 'Height −60',
        menuGoto: 'Go to this week',
        renderErr: 'Display error (see the log).',
        allHidden: 'All days are hidden.\nEnable some in Configure → Entries.',
        cancel: 'Cancel', save: 'Save', del: 'Delete',
        newEntry: 'New entry', editEntry: 'Edit entry',
        fTitle: 'Title', fNotes: 'Notes', fColor: 'Color', fOptions: 'Type',
        hintTitle: 'Title', hintNotes: 'Description / notes (optional)',
        colorDefault: 'Default', toDo: 'To-do', important: '★ Important',
        errTitle: 'Title is required.',
        delEntry: 'Delete entry',
        confirmDel: function (t) { return 'Delete “' + t + '”?'; },
        invalidDate: 'Invalid date — use YYYY-MM-DD',
        editingWeek: 'Editing',
        maxReached: function (n) { return 'Max ' + n + ' entries per day reached.'; }
    },
    tr: {
        dayFirst: true,
        months: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
        monthsS: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
        days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'],
        daysS: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
        shortDate: function (d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1); },
        today: 'Bugün',
        menuWPlus: 'Genişlik +60', menuWMinus: 'Genişlik −60', menuHPlus: 'Yükseklik +60', menuHMinus: 'Yükseklik −60',
        menuGoto: 'Bu haftaya git',
        renderErr: 'Görüntüleme hatası (günlüğe bakın).',
        allHidden: 'Tüm günler gizli.\nYapılandır → Entries bölümünden açın.',
        cancel: 'İptal', save: 'Kaydet', del: 'Sil',
        newEntry: 'Yeni kayıt', editEntry: 'Kaydı düzenle',
        fTitle: 'Başlık', fNotes: 'Not', fColor: 'Renk', fOptions: 'Tür',
        hintTitle: 'Başlık', hintNotes: 'Açıklama / not (isteğe bağlı)',
        colorDefault: 'Varsayılan', toDo: 'Yapılacak', important: '★ Önemli',
        errTitle: 'Başlık gerekli.',
        delEntry: 'Kaydı sil',
        confirmDel: function (t) { return '“' + t + '” silinsin mi?'; },
        invalidDate: 'Geçersiz tarih — YYYY-AA-GG kullanın',
        editingWeek: 'Düzenlenen',
        maxReached: function (n) { return 'Günde en fazla ' + n + ' kayıt eklenebilir.'; }
    }
};

/* ------------------------------------------------------------------ */
/* Date / color helpers                                                */
/* ------------------------------------------------------------------ */

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseIso(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], 12); // noon: avoids DST shifts
    return iso(d) === s ? d : null;
}
function addDays(d, n) { const r = new Date(d.getTime()); r.setDate(r.getDate() + n); return r; }
function wd(d) { return (d.getDay() + 6) % 7; } // Monday = 0
function mondayOf(d) { return addDays(d, -wd(d)); }
function today() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); }
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function trunc(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function parseColor(c) {
    let m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(c || '');
    if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || '');
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1];
    return [128, 128, 128, 1];
}
function rgba(c, a) {
    const p = parseColor(c);
    return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + (a === undefined ? p[3] : a) + ')';
}
/* Color column text (name, #rgb, #rrggbb, rgb()/rgba()) -> usable color string, or null. */
function resolveColor(s) {
    s = String(s === undefined || s === null ? '' : s).trim().toLowerCase();
    if (!s) return null;
    if (COLOR_NAMES[s]) return COLOR_NAMES[s];
    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
    if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/.test(s)) return s;
    return null;
}
/* Color text (name, #rgb, #rrggbb, rgb()/rgba()) -> usable color string, or null. */
function resolveColor(s) {
    s = String(s === undefined || s === null ? '' : s).trim().toLowerCase();
    if (!s) return null;
    if (COLOR_NAMES[s]) return COLOR_NAMES[s];
    const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
    if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/.test(s)) return s;
    return null;
}
function lum(p) {
    const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
}
/* Falls back to black/white when the chosen color is unreadable on the background. */
function readable(fg, bg) {
    const a = lum(parseColor(fg)), b = lum(parseColor(bg));
    const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (r >= 3.2) return fg;
    return b > 0.4 ? 'rgb(20,20,24)' : 'rgb(245,245,250)';
}

function formatRange(s, fmt, lang) {
    const lg = I18N[lang] || I18N.en;
    const e = addDays(s, 6);
    const sy = s.getFullYear(), ey = e.getFullYear(), sm = s.getMonth(), em = e.getMonth();
    const sd = s.getDate(), ed = e.getDate();
    if (fmt === 'numeric') {
        return lg.dayFirst
            ? pad(sd) + '.' + pad(sm + 1) + '.' + sy + ' – ' + pad(ed) + '.' + pad(em + 1) + '.' + ey
            : pad(sm + 1) + '/' + pad(sd) + '/' + sy + ' – ' + pad(em + 1) + '/' + pad(ed) + '/' + ey;
    }
    const names = fmt === 'short' ? lg.monthsS : lg.months;
    if (lg.dayFirst) {
        if (sy === ey && sm === em) return sd + '–' + ed + ' ' + names[em] + ' ' + ey;
        if (sy === ey) return sd + ' ' + names[sm] + ' – ' + ed + ' ' + names[em] + ' ' + ey;
        return sd + ' ' + names[sm] + ' ' + sy + ' – ' + ed + ' ' + names[em] + ' ' + ey;
    }
    if (sy === ey && sm === em) return names[em] + ' ' + sd + '–' + ed + ', ' + ey;
    if (sy === ey) return names[sm] + ' ' + sd + ' – ' + names[em] + ' ' + ed + ', ' + ey;
    return names[sm] + ' ' + sd + ', ' + sy + ' – ' + names[em] + ' ' + ed + ', ' + ey;
}

function longDate(d, lang) {
    const lg = I18N[lang] || I18N.en;
    return lg.days[wd(d)] + ' · ' + (lg.dayFirst
        ? d.getDate() + ' ' + lg.months[d.getMonth()] + ' ' + d.getFullYear()
        : lg.months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear());
}

/* ------------------------------------------------------------------ */
/* Model: entries per date                                             */
/* ------------------------------------------------------------------ */
/*
 * data = {
 *   version: 3,
 *   ui: { weekOffset, selected },          // selected: ISO date of the day that the ＋ button adds to (or null)
 *   days: { "<YYYY-MM-DD>": [ entry, ... ] }   // the array order is the display order
 * }
 * entry = { id, title, notes, color ('' = default / '#rrggbb'), important, todo, done }
 */
const Model = {
    defaults: function () {
        return { version: 3, ui: { weekOffset: 0, selected: null, editWeek: null }, weekly: [[], [], [], [], [], [], []], days: {} };
    },
    emptyWeek: function () { return [[], [], [], [], [], [], []]; },

    toBool: function (v) { return v === true || v === 'true' || v === 1; },
    str: function (v) { return v === undefined || v === null ? '' : String(v); },

    cleanEntry: function (it) {
        if (!it || typeof it !== 'object') return null;
        const title = Model.str(it.title).trim().slice(0, 200);
        if (!title) return null;
        return {
            id: typeof it.id === 'string' && it.id ? it.id : newId(),
            title: title,
            notes: Model.str(it.notes).trim().slice(0, 2000),
            color: resolveColor(it.color) || '',
            important: Model.toBool(it.important),
            todo: Model.toBool(it.todo),
            done: Model.toBool(it.done)
        };
    },

    push: function (d, date, e) {
        (d.days[date] || (d.days[date] = [])).push(e);
    },

    /*
     * Data files of versions 1 and 2 (weekly rules / weekly lists / per-week lists) -> version 3.
     * Weekly entries no longer exist, so they are copied onto the dates of a window around today.
     */
    migrateOld: function (raw) {
        const d = Model.defaults();
        const occ = raw.occ && typeof raw.occ === 'object' ? raw.occ : {};
        const doneOn = function (id, date) { const x = occ[id + '|' + date]; return !!(x && typeof x === 'object' && x.done); };
        const lo = addDays(mondayOf(today()), -56), hi = addDays(mondayOf(today()), 364);
        const put = function (date, src, over, done) {
            const e = Model.cleanEntry(Object.assign({}, src, over || {}, {
                id: newId(), todo: src.todo === undefined ? true : src.todo, done: done
            }));
            if (e) Model.push(d, date, e);
        };
        const spread = function (src, weekday, from, to, skip) {
            for (let t = addDays(lo, weekday); t <= hi; t = addDays(t, 7)) {
                const date = iso(t);
                if ((from && date < from) || (to && date > to) || (skip && skip.indexOf(date) >= 0)) continue;
                put(date, src, null, doneOn(src.id, date));
            }
        };
        if (raw.version === 2) {
            (Array.isArray(raw.weekly) ? raw.weekly : []).forEach(function (list, i) {
                (Array.isArray(list) ? list : []).forEach(function (e) {
                    if (e && typeof e === 'object') spread(e, i, e.from, e.to, e.skipDates);
                });
            });
            Object.keys(raw.weeks && typeof raw.weeks === 'object' ? raw.weeks : {}).sort().forEach(function (mon) {
                const m = parseIso(mon);
                if (!m || !Array.isArray(raw.weeks[mon])) return;
                raw.weeks[mon].forEach(function (list, i) {
                    (Array.isArray(list) ? list : []).forEach(function (e) {
                        if (!e || typeof e !== 'object' || i > 6) return;
                        const date = iso(addDays(m, i));
                        put(date, e, null, doneOn(e.id, date));
                    });
                });
            });
        } else {
            (Array.isArray(raw.items) ? raw.items : []).forEach(function (it) {
                if (!it || typeof it.id !== 'string' || typeof it.title !== 'string') return;
                if (it.kind === 'once' && parseIso(it.date)) {
                    put(it.date, it, null, doneOn(it.id, it.date));
                } else if (it.kind === 'weekly' && it.weekday >= 0 && it.weekday <= 6 && parseIso(it.startDate)) {
                    const skip = [];
                    Object.keys(occ).forEach(function (k) {
                        if (k.indexOf(it.id + '|') !== 0) return;
                        const date = k.slice(it.id.length + 1), x = occ[k];
                        if (!x || typeof x !== 'object' || !parseIso(date)) return;
                        if (x.skip || x.over) skip.push(date);
                        if (x.over && !x.skip) put(date, it, x.over, !!x.done);
                    });
                    spread(it, it.weekday | 0, it.startDate, parseIso(it.endDate) ? it.endDate : null, skip);
                }
            });
        }
        return d;
    },

    /* Defensive normalization against corrupt or missing data. */
    normalize: function (raw) {
        if (!raw || typeof raw !== 'object') return Model.defaults();
        let d;
        if (raw.version === 3) {
            d = Model.defaults();
            if (raw.days && typeof raw.days === 'object') {
                Object.keys(raw.days).forEach(function (k) {
                    if (!parseIso(k) || !Array.isArray(raw.days[k])) return;
                    const list = raw.days[k].map(Model.cleanEntry).filter(Boolean);
                    if (list.length) d.days[k] = list;
                });
            }
        } else {
            d = Model.migrateOld(raw);
        }
        const ui = raw.ui && typeof raw.ui === 'object' ? raw.ui : {};
        if (typeof ui.weekOffset === 'number' && isFinite(ui.weekOffset)) {
            d.ui.weekOffset = Math.max(-5000, Math.min(5000, Math.round(ui.weekOffset)));
        }
        if (raw.version === 3 && parseIso(ui.selected)) d.ui.selected = ui.selected;
        if (raw.version === 3 && parseIso(ui.editWeek) && wd(parseIso(ui.editWeek)) === 0) d.ui.editWeek = ui.editWeek;
        /* Restore weekly repeat lists. */
        if (raw.version === 3 && Array.isArray(raw.weekly)) {
            for (let i = 0; i < 7; i++) {
                if (Array.isArray(raw.weekly[i])) {
                    d.weekly[i] = raw.weekly[i].map(Model.cleanEntry).filter(Boolean);
                }
            }
        }
        return d;
    },

    /* The entries of the 7 days starting at `start` (a Monday).
     * Merges weekly-repeat entries (data.weekly[i]) with the date-specific ones. */
    week: function (data, start) {
        const dates = [], days = [];
        const weekly = Array.isArray(data.weekly) ? data.weekly : [];
        for (let i = 0; i < 7; i++) {
            const date = iso(addDays(start, i));
            dates.push(date);
            const dated = data.days[date] || [];
            const rep = (weekly[i] || []).map(function (e) { return Object.assign({}, e, { _weekly: true }); });
            days.push(rep.concat(dated));
        }
        return { dates: dates, days: days };
    },

    find: function (data, id) {
        const dates = Object.keys(data.days);
        for (let k = 0; k < dates.length; k++) {
            const list = data.days[dates[k]];
            for (let i = 0; i < list.length; i++) {
                if (list[i].id === id) return { date: dates[k], index: i, entry: list[i] };
            }
        }
        return null;
    },

    /* Adds a new entry at the bottom of the day. */
    add: function (data, date, fields) {
        const e = Model.cleanEntry(Object.assign({}, fields, { id: newId(), done: false }));
        if (e) Model.push(data, date, e);
        return e;
    },

    update: function (data, e, fields) {
        const n = Model.cleanEntry(Object.assign({}, e, fields, { id: e.id }));
        if (n) Object.assign(e, n);
    },

    remove: function (data, id) {
        const f = Model.find(data, id);
        if (!f) return;
        data.days[f.date].splice(f.index, 1);
        if (!data.days[f.date].length) delete data.days[f.date];
    },

    toggleDone: function (e) { e.done = !e.done; },

    /*
     * Moves an entry to `toDate` so that it ends up at position `toIndex` of that day's list
     * (counted without the entry itself). Returns true when the order actually changed.
     */
    move: function (data, id, toDate, toIndex) {
        const f = Model.find(data, id);
        if (!f) return false;
        data.days[f.date].splice(f.index, 1);
        if (!data.days[f.date].length) delete data.days[f.date];
        const dst = data.days[toDate] || (data.days[toDate] = []);
        const i = Math.max(0, Math.min(dst.length, toIndex));
        dst.splice(i, 0, f.entry);
        return !(f.date === toDate && i === f.index);
    },

    /* ---- Settings list helpers ---- */

    /* A row from the settings list widget -> normalized entry fields (no id/done). */
    rowToFields: function (row) {
        row = row && typeof row === 'object' ? row : {};
        return {
            title: Model.str(row.title).trim().slice(0, 200) || 'Untitled',
            notes: Model.str(row.notes).trim().slice(0, 2000),
            todo: Model.toBool(row.todo),
            important: Model.toBool(row.important),
            color: resolveColor(Model.str(row.color)) || ''
        };
    },
    fieldsToRow: function (e) { return Model.rowToFields(e); },

    /* Returns all entries for a given weekday index (0=Mon) and monday ISO string.
     * monday === null  -> weekly-repeat virtual list stored in data.weekly[i]
     * monday !== null  -> entries of that specific date (addDays(monday, i)) */
    dayList: function (data, monday, i) {
        if (monday === null) {
            /* weekly repeat: use a virtual list stored in data.weekly */
            if (!data.weekly) data.weekly = [[], [], [], [], [], [], []];
            return data.weekly[i];
        }
        const date = iso(addDays(parseIso(monday), i));
        return data.days[date] || [];
    },

    /* Serialisation key for change detection. */
    rowsKey: function (rows) {
        return JSON.stringify((Array.isArray(rows) ? rows : []).map(Model.rowToFields));
    },

    /*
     * Reconcile old list with new rows, preserving entry ids and done state.
     * Returns a new array of entry objects.
     */
    reconcile: function (oldList, rows) {
        const clean = (Array.isArray(rows) ? rows : []).map(Model.rowToFields);
        const used = oldList.map(function () { return false; });
        const match = clean.map(function () { return -1; });
        clean.forEach(function (r, i) {
            for (let j = 0; j < oldList.length; j++) {
                if (!used[j] && oldList[j].title === r.title) { used[j] = true; match[i] = j; break; }
            }
        });
        const free = [];
        used.forEach(function (u, j) { if (!u) free.push(j); });
        clean.forEach(function (r, i) { if (match[i] < 0 && free.length) match[i] = free.shift(); });
        return clean.map(function (r, i) {
            return match[i] >= 0 ? Object.assign({}, oldList[match[i]], r) : Object.assign({ id: newId(), done: false }, r);
        });
    },

    /* Apply rows from a settings list widget into the data model.
     * monday === null  -> weekly-repeat list (data.weekly[i])
     * monday !== null  -> specific date (data.days[date])
     * Returns true when something changed. */
    applyRows: function (data, monday, i, rows) {
        const cur = Model.dayList(data, monday, i);
        const nxt = Model.reconcile(cur, rows);
        if (JSON.stringify(cur) === JSON.stringify(nxt)) return false;
        if (monday === null) {
            /* weekly repeat: store in data.weekly */
            if (!data.weekly) data.weekly = [[], [], [], [], [], [], []];
            data.weekly[i] = nxt;
        } else {
            const date = iso(addDays(parseIso(monday), i));
            if (nxt.length) data.days[date] = nxt;
            else delete data.days[date];
        }
        return true;
    }
};

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

function chipStyle(on, color, swatch) {
    if (swatch) {
        return 'width:18px; height:18px; border-radius:9px; background-color:' + color +
            '; border:2px solid ' + (on ? '#ffffff' : 'rgba(255,255,255,0.15)') + ';';
    }
    return 'padding:3px 9px; border-radius:11px; color:#ffffff; border:1px solid ' +
        (color || 'rgba(255,255,255,0.35)') + '; background-color:' +
        (on ? (color ? rgba(color, 0.7) : 'rgba(255,255,255,0.28)') : 'rgba(255,255,255,0.06)') + ';';
}

/* Single choice. options: [{label, value, color?, swatch?}] */
function chipRow(options, getVal, setVal, perRow) {
    const box = new St.BoxLayout({ vertical: true, style: 'spacing:4px;' });
    const btns = [];
    const refresh = function () {
        btns.forEach(function (b) { b.btn.style = chipStyle(getVal() === b.value, b.color, b.swatch); });
    };
    let row = null;
    options.forEach(function (o, i) {
        if (i % perRow === 0) { row = new St.BoxLayout({ style: 'spacing:4px;' }); box.add_actor(row); }
        const btn = new St.Button({ label: o.swatch ? '' : o.label, reactive: true, can_focus: true });
        btn.connect('clicked', function () { setVal(o.value); refresh(); });
        btns.push({ btn: btn, value: o.value, color: o.color, swatch: !!o.swatch });
        row.add_actor(btn);
    });
    refresh();
    return box;
}

/* On/off chip. */
function toggleChip(label, getVal, setVal, color) {
    const btn = new St.Button({ label: label, reactive: true, can_focus: true });
    const refresh = function () { btn.style = chipStyle(!!getVal(), color, false); };
    btn.connect('clicked', function () { setVal(!getVal()); refresh(); });
    refresh();
    return btn;
}

function field(title, widget) {
    const b = new St.BoxLayout({ vertical: true, style: 'spacing:3px; padding-top:7px;' });
    b.add_actor(new St.Label({ text: title, style: 'font-size:11px; opacity:170;' }));
    b.add_actor(widget);
    return b;
}

/* x_fill/y_fill don't exist in some Cinnamon versions; passing them to the constructor would crash loading, so they are set here and failures are ignored. */
function fillActor(a) {
    try { a.x_fill = true; a.y_fill = true; } catch (e) { /* ignore */ }
}

function mkEntry(text, hint, width) {
    return new St.Entry({ text: text || '', hint_text: hint || '', can_focus: true, style: 'min-width:' + (width || 280) + 'px;' });
}

/* ------------------------------------------------------------------ */
/* Desklet                                                             */
/* ------------------------------------------------------------------ */

const CFG_KEYS = ['layoutMode', 'compact', 'highlightToday', 'doneStyle', 'width', 'height', 'fontSize',
    'bgColor', 'textColor', 'accentColor', 'dayHeaderColor', 'borderColor', 'importantColor',
    'opacity', 'borderWidth', 'borderRadius', 'dateFormat', 'headerStyle', 'uiScale', 'language',
    'showDay0', 'showDay1', 'showDay2', 'showDay3', 'showDay4', 'showDay5', 'showDay6',
    'showNotes', 'showCheckbox', 'showStar',
    'entryCols', 'entryRows', 'maxEntriesPerDay'];

/* Settings list widgets: [kind, weekday index, settings key].
 * 'weekly' = repeat every week (data.weekly[i]), 'week' = specific week being edited (data.days[date]). */
const LIST_KEYS = [];
for (let i = 0; i < 7; i++) {
    LIST_KEYS.push(['weekly', i, 'weeklyItems' + i]);
    LIST_KEYS.push(['week', i, 'weekItems' + i]);
}

function PlannerDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

PlannerDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
        this.instanceId = desklet_id;
        this._saveTimer = null;
        this._cfgIdle = null;
        this._dayTimer = null;
        this._dialog = null;
        this._layout = [];
        this._drag = null;
        this._dragTimer = null;
        this._rs = null;
        this._rsId = null;
        this._rsTimer = null;
        this._rsGrab = false;
        this._suppressUntil = 0;
        try {
            this._setup(metadata, desklet_id);
        } catch (e) {
            // Don't leave a bare "!" on load failure: log the cause and show it on the desktop.
            global.logError('[weekly-planner] startup error: ' + e + '\n' + (e && e.stack ? e.stack : ''));
            try {
                this.setContent(new St.Label({ text: 'Weekly Planner failed to start:\n' + e,
                    style: 'color:#ff7b72; padding:8px; background-color:rgba(0,0,0,0.6);' }));
            } catch (e2) { /* ignore */ }
        }
    },

    _setup: function (metadata, desklet_id) {
        this.settings = new Settings.DeskletSettings(this, metadata.uuid, desklet_id);
        CFG_KEYS.forEach(function (k) {
            this.settings.bindProperty(Settings.BindingDirection.IN, k, 'cfg_' + k, this._onCfgChanged.bind(this));
        }, this);
        LIST_KEYS.forEach(function (k) {
            this.settings.bindProperty(Settings.BindingDirection.IN, k[2], 'cfg_' + k[2], function () {
                this._onListChanged(k[0], k[1]);
            }.bind(this));
        }, this);

        this._loadData();
        if (!this.data.ui.editWeek) this.data.ui.editWeek = iso(mondayOf(today()));
        this._buildUi();
        this._applyTheme();
        this._render();
        this._setupMenu();
        this._pushLists();
        this._updateWeekFields();
        this._todayStr = iso(today());
        this._dayTimer = Mainloop.timeout_add_seconds(60, this._checkDay.bind(this));
    },

    /* ---------------- storage ---------------- */

    _dataPath: function () { return GLib.build_filenamev([DATA_DIR, this.instanceId + '.json']); },

    _loadData: function () {
        const path = this._dataPath();
        const tryRead = function (p) {
            if (!GLib.file_test(p, GLib.FileTest.EXISTS)) return undefined;
            try { return JSON.parse(Cinnamon.get_file_contents_utf8_sync(p)); } catch (e) { return null; }
        };
        let raw = tryRead(path);
        if (raw === null) { // corrupt file: move it aside, try the backup
            try {
                Gio.File.new_for_path(path).move(Gio.File.new_for_path(path + '.corrupt-' + Date.now()),
                    Gio.FileCopyFlags.OVERWRITE, null, null);
            } catch (e) { global.logError('[weekly-planner] could not move corrupt file: ' + e); }
            raw = tryRead(path + '~');
        }
        if (raw && raw.version !== 3) { // older format: keep a copy of the original, then convert
            try {
                Gio.File.new_for_path(path).copy(Gio.File.new_for_path(path + '.pre-v3'),
                    Gio.FileCopyFlags.OVERWRITE, null, null);
            } catch (e) { global.logError('[weekly-planner] could not back up the old data file: ' + e); }
        }
        this.data = Model.normalize(raw || null);
        if (raw && raw.version !== 3) this._saveNow();
    },

    _scheduleSave: function () {
        if (this._saveTimer) return;
        this._saveTimer = Mainloop.timeout_add(400, function () {
            this._saveTimer = null;
            this._saveNow();
            return false;
        }.bind(this));
    },

    _saveNow: function () {
        try {
            GLib.mkdir_with_parents(DATA_DIR, 493); // 0755
            const f = Gio.File.new_for_path(this._dataPath());
            // replace_contents: temp file + rename (atomic); make_backup=true -> "<file>~" backup
            f.replace_contents(JSON.stringify(this.data), null, true, Gio.FileCreateFlags.NONE, null);
        } catch (e) {
            global.logError('[weekly-planner] save error: ' + e);
        }
    },

    _changed: function () {
        this._scheduleSave();
        this._render();
    },

    /* ---------------- entry lists (Configure → Entries) ---------------- */

    _getValue: function (key) {
        try { return this.settings.getValue(key); } catch (e) { return undefined; }
    },
    _setValue: function (key, value) {
        try { this.settings.setValue(key, value); } catch (e) { global.logError('[weekly-planner] could not set ' + key + ': ' + e); }
    },

    _editMonday: function () { return parseIso(this.data.ui.editWeek) || mondayOf(today()); },

    /* A list in the settings window changed: fold it into the model. */
    _onListChanged: function (kind, i) {
        if (Date.now() < this._suppressUntil) return; // echo of our own _pushLists
        try {
            const key = (kind === 'weekly' ? 'weeklyItems' : 'weekItems') + i;
            let rows = this._getValue(key);
            const maxPer = +this.cfg_maxEntriesPerDay || 0;
            if (maxPer > 0 && Array.isArray(rows) && rows.length > maxPer) {
                rows = rows.slice(0, maxPer);
                this._setValue(key, rows);
                try {
                    const Main = imports.ui.main;
                    Main.notify('Weekly Planner', this._t('maxReached')(maxPer));
                } catch (ne) { /* ignore */ }
            }
            const monday = kind === 'weekly' ? null : iso(this._editMonday());
            if (Model.applyRows(this.data, monday, i, rows)) this._changed();
        } catch (e) {
            global.logError('[weekly-planner] list sync error: ' + e);
        }
    },

    /* Reads every list from the settings (used before navigating to another week). */
    _syncAllLists: function () {
        const mon = iso(this._editMonday());
        let any = false;
        LIST_KEYS.forEach(function (k) {
            const rows = this._getValue(k[2]);
            if (rows === undefined) return;
            if (Model.applyRows(this.data, k[0] === 'weekly' ? null : mon, k[1], rows)) any = true;
        }, this);
        if (any) this._changed();
    },

    /* Model -> settings lists. */
    _pushLists: function () {
        this._suppressUntil = Date.now() + 700;
        const mon = iso(this._editMonday());
        LIST_KEYS.forEach(function (k) {
            const rows = Model.dayList(this.data, k[0] === 'weekly' ? null : mon, k[1]).map(Model.fieldsToRow);
            if (Model.rowsKey(this._getValue(k[2])) !== Model.rowsKey(rows)) this._setValue(k[2], rows);
        }, this);
    },

    _updateWeekFields: function () {
        const mon = this._editMonday();
        const info = this._t('editingWeek') + ': ' + formatRange(mon, 'long', this.cfg_language);
        if (this._getValue('weekDate') !== iso(mon)) this._setValue('weekDate', iso(mon));
        if (this._getValue('weekInfo') !== info) this._setValue('weekInfo', info);
    },

    _setEditWeek: function (monday) {
        this._syncAllLists();
        this.data.ui.editWeek = iso(monday);
        // also show the edited week on the desklet
        this.data.ui.weekOffset = Math.max(-5000, Math.min(5000,
            Math.round((monday.getTime() - mondayOf(today()).getTime()) / (7 * 86400000))));
        this._pushLists();
        this._updateWeekFields();
        this._changed();
    },

    /* Callbacks invoked by buttons in Configure → Entries. */
    onWeekPrev: function () { this._setEditWeek(addDays(this._editMonday(), -7)); },
    onWeekNext: function () { this._setEditWeek(addDays(this._editMonday(), 7)); },
    onWeekToday: function () { this._setEditWeek(mondayOf(today())); },
    onWeekGo: function () {
        const d = parseIso(String(this._getValue('weekDate') || '').trim());
        if (!d) { this._setValue('weekInfo', this._t('invalidDate')); return; }
        this._setEditWeek(mondayOf(d));
    },

    /* ---------------- settings / theme ---------------- */

    _onCfgChanged: function () {
        if (this._cfgIdle) return;
        this._cfgIdle = Mainloop.idle_add(function () {
            this._cfgIdle = null;
            this._applyTheme();
            this._render();
            return false;
        }.bind(this));
    },

    _applyTheme: function () {
        const a = Math.max(0.05, Math.min(1, this.cfg_opacity / 100));
        const bg = this.cfg_bgColor;
        const t = this._theme = {
            bg: rgba(bg, a),
            text: readable(this.cfg_textColor, bg),
            head: readable(this.cfg_dayHeaderColor, bg),
            accent: this.cfg_accentColor,
            border: rgba(this.cfg_borderColor, a),
            imp: this.cfg_importantColor,
            k: Math.max(0.5, Math.min(3, (+this.cfg_uiScale || 100) / 100))
        };
        t.fs = Math.round(this.cfg_fontSize * t.k * 10) / 10; // scaled font size
        this._root.set_size(this.cfg_width, this.cfg_height);
        this._root.style = 'background-color:' + t.bg + '; border:' + this.cfg_borderWidth + 'px solid ' + t.border +
            '; border-radius:' + this.cfg_borderRadius + 'px; padding:' + this._px(8) + 'px; color:' + t.text + '; font-size:' + t.fs + 'px;';
        const navStyle = 'color:' + t.text + '; padding:' + this._px(2) + 'px ' + this._px(8) + 'px; border-radius:' + this._px(6) + 'px; font-size:' + Math.round(t.fs * 1.25) + 'px;';
        [this._btnPrev, this._btnNext, this._btnToday, this._btnAdd].forEach(function (b) { b.style = navStyle; });
        this._title.style = 'font-weight:bold; color:' + t.text + '; font-size:' + Math.round(t.fs * 1.1) + 'px;';
        this._head.style = 'spacing:' + this._px(4) + 'px; padding-bottom:' + this._px(6) + 'px;';
        (this._handleList || []).forEach(function (h) { h(false); });
        this._btnToday.set_label(this._t('today'));
        (this._menuItems || []).forEach(function (m) {
            try { m[1].label.set_text(this._t(m[0])); } catch (e) { /* ignore */ }
        }, this);
    },

    /* Current UI language table / string lookup. */
    _L: function () { return I18N[this.cfg_language] || I18N.en; },
    _t: function (key) { const v = this._L()[key]; return v === undefined ? I18N.en[key] : v; },

    /* UI scale (%): scales fixed pixel values. */
    _px: function (n) {
        const k = Math.max(0.5, Math.min(3, (+this.cfg_uiScale || 100) / 100));
        return Math.max(1, Math.round(n * k));
    },

    _setupMenu: function () {
        const self = this;
        const bump = function (key, delta, min, max) {
            const v = Math.max(min, Math.min(max, self['cfg_' + key] + delta));
            try { self.settings.setValue(key, v); } catch (e) { /* ignore */ }
            self['cfg_' + key] = v;
            self._onCfgChanged();
        };
        this._menuItems = [];
        const add = function (key, fn) { self._menuItems.push([key, self._menu.addAction(self._t(key), fn)]); };
        try {
            add('menuWPlus', function () { bump('width', 60, 240, 2400); });
            add('menuWMinus', function () { bump('width', -60, 240, 2400); });
            add('menuHPlus', function () { bump('height', 60, 160, 1600); });
            add('menuHMinus', function () { bump('height', -60, 160, 1600); });
            add('menuGoto', function () { self._gotoWeek(0); });
        } catch (e) {
            global.logError('[weekly-planner] could not add menu items: ' + e);
        }
    },

    _checkDay: function () {
        const s = iso(today());
        if (s !== this._todayStr) { this._todayStr = s; this._render(); }
        return true;
    },

    /* ---------------- skeleton ---------------- */

    _buildUi: function () {
        this._root = new St.BoxLayout({ vertical: true });
        const head = this._head = new St.BoxLayout({ style: 'spacing:4px; padding-bottom:6px;' });
        const mk = function (label, cb) {
            const b = new St.Button({ label: label, reactive: true, can_focus: false, style_class: 'wp-nav' });
            b.connect('clicked', cb);
            return b;
        };
        this._btnPrev = mk('‹', function () { this._shiftWeek(-1); }.bind(this));
        this._btnNext = mk('›', function () { this._shiftWeek(1); }.bind(this));
        this._btnToday = mk('Today', function () { this._gotoWeek(0); }.bind(this));
        this._btnAdd = mk('＋', function () { this._openEditor(null, this._targetDate()); }.bind(this));
        this._title = new St.Label({ text: '', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        head.add_actor(this._btnPrev);
        head.add_actor(this._title);
        head.add_actor(this._btnNext);
        head.add_actor(this._btnToday);
        head.add_actor(this._btnAdd);
        this._root.add_actor(head);

        // middle section: scroll area + right-edge handle
        const mid = new St.BoxLayout({ x_expand: true, y_expand: true });
        this._scroll = new St.ScrollView({ x_expand: true, y_expand: true });
        this._scroll.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);
        this._body = new St.BoxLayout({ vertical: true });
        this._scroll.add_actor(this._body);
        mid.add_actor(this._scroll);
        mid.add_actor(this._makeHandle('r'));
        this._root.add_actor(mid);

        // bottom section: bottom-edge handle + bottom-right corner handle
        const bottom = new St.BoxLayout({ x_expand: true });
        const hb = this._makeHandle('b');
        hb.x_expand = true;
        bottom.add_actor(hb);
        bottom.add_actor(this._makeHandle('c'));
        this._root.add_actor(bottom);

        this.setContent(this._root);
    },

    /* ---------------- drag-to-resize ---------------- */

    /* kind: 'r' right edge (width), 'b' bottom edge (height), 'c' bottom-right corner (both) */
    _makeHandle: function (kind) {
        const glyph = kind === 'r' ? '⋮' : (kind === 'b' ? '⋯' : '◢');
        const idle = kind === 'c' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
        const hover = 'rgba(255,255,255,0.5)';
        const h = new St.Bin({ reactive: true, track_hover: true, can_focus: false });
        const lbl = new St.Label({ text: glyph, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        const self = this;
        const paint = function (on) {
            const q = self._px.bind(self);
            const size = kind === 'r' ? 'width:' + q(10) + 'px; margin-left:' + q(2) + 'px;' :
                kind === 'b' ? 'height:' + q(10) + 'px; margin-top:' + q(2) + 'px;' :
                    'width:' + q(16) + 'px; height:' + q(10) + 'px; margin-top:' + q(2) + 'px;';
            h.style = size + ' border-radius:3px; background-color:' + (on ? 'rgba(255,255,255,0.12)' : 'transparent') + ';';
            lbl.style = 'font-size:' + q(8) + 'px; padding:0; color:' + (on ? hover : idle) + ';';
        };
        (this._handleList = this._handleList || []).push(paint);
        paint(false);
        h.set_child(lbl);
        h.connect('notify::hover', function () { if (!this._rs) paint(h.hover); }.bind(this));
        h.connect('button-press-event', function (actor, event) {
            if (event.get_button() !== 1) return false;
            this._startResize(kind, event);
            return true; // consume the event so the desklet itself isn't dragged
        }.bind(this));
        return h;
    },

    _startResize: function (kind, event) {
        if (this._rs) return;
        const c = event.get_coords();
        this._rs = { kind: kind, x: c[0], y: c[1], w: this.cfg_width, h: this.cfg_height };
        // So no events are missed when the pointer leaves the desklet (e.g. over other windows):
        //  1) grab the pointer, 2) listen for button release on the stage,
        //  3) read the real position/button state from global.get_pointer() on a timer.
        try { Clutter.grab_pointer(this._root); this._rsGrab = true; } catch (e) { this._rsGrab = false; }
        this._rsId = global.stage.connect('captured-event', this._onResizeEvent.bind(this));
        this._rsTimer = Mainloop.timeout_add(30, this._resizeTick.bind(this));
    },

    _applyResizePointer: function (px, py) {
        const rs = this._rs;
        if (rs.kind === 'r' || rs.kind === 'c')
            this.cfg_width = Math.max(240, Math.min(2400, Math.round(rs.w + px - rs.x)));
        if (rs.kind === 'b' || rs.kind === 'c')
            this.cfg_height = Math.max(160, Math.min(1600, Math.round(rs.h + py - rs.y)));
        this._onCfgChanged();
    },

    _resizeTick: function () {
        if (!this._rs) { this._rsTimer = null; return false; }
        try {
            const p = global.get_pointer(); // [x, y, modifiers]
            if (!(p[2] & Clutter.ModifierType.BUTTON1_MASK)) { this._rsTimer = null; this._endResize(true); return false; }
            this._applyResizePointer(p[0], p[1]);
        } catch (e) { /* ignore */ }
        return true;
    },

    _onResizeEvent: function (actor, event) {
        if (!this._rs) return false;
        const type = event.type();
        if (type === Clutter.EventType.MOTION) {
            const c = event.get_coords();
            this._applyResizePointer(c[0], c[1]);
            return true;
        }
        if (type === Clutter.EventType.BUTTON_RELEASE) {
            this._endResize(true);
            return true;
        }
        return false;
    },

    _endResize: function (save) {
        if (this._rsTimer) { Mainloop.source_remove(this._rsTimer); this._rsTimer = null; }
        if (this._rsId) { try { global.stage.disconnect(this._rsId); } catch (e) { /* ignore */ } this._rsId = null; }
        if (this._rsGrab) { try { Clutter.ungrab_pointer(); } catch (e) { /* ignore */ } this._rsGrab = false; }
        const was = !!this._rs;
        this._rs = null;
        if (save && was) {
            try {
                this.settings.setValue('width', this.cfg_width);
                this.settings.setValue('height', this.cfg_height);
            } catch (e) { global.logError('[weekly-planner] could not save size: ' + e); }
            this._onCfgChanged();
        }
    },

    /* ---------------- week navigation / selected day ---------------- */

    _weekStart: function () { return addDays(mondayOf(today()), 7 * this.data.ui.weekOffset); },
    _shiftWeek: function (n) { this.data.ui.weekOffset += n; this._changed(); },
    _gotoWeek: function (off) { this.data.ui.weekOffset = off; this._changed(); },
    /* Indices (0 = Monday) of the days that are not hidden in the settings. */
    _visibleDays: function () {
        const r = [];
        for (let i = 0; i < 7; i++) if (this['cfg_showDay' + i] !== false) r.push(i);
        return r;
    },

    /* Index (0..6) of the day of the shown week that the ＋ button adds to. */
    _targetIndex: function () {
        const s = this._weekStart();
        const inWeek = function (d) {
            if (!d) return -1;
            const diff = Math.round((d.getTime() - s.getTime()) / 86400000);
            return diff >= 0 && diff < 7 ? diff : -1;
        };
        const sel = parseIso(this.data.ui.selected);
        let i = inWeek(sel);
        if (i < 0) i = inWeek(today());
        if (i < 0) i = sel ? wd(sel) : 0;
        const vis = this._visibleDays();
        if (vis.length && vis.indexOf(i) < 0) i = vis[0]; // that day is hidden: use the first visible day
        return i;
    },
    _targetDate: function () { return iso(addDays(this._weekStart(), this._targetIndex())); },

    _selectDay: function (date) {
        this.data.ui.selected = date;
        this._changed();
    },

    /* ---------------- rendering ---------------- */

    _render: function () {
        try {
            this._todayStr = iso(today());
            const start = this._weekStart();
            this._title.set_text(formatRange(start, this.cfg_dateFormat, this.cfg_language));
            const week = Model.week(this.data, start);
            this._layout = [];
            this._body.destroy_all_children();
            if (this.cfg_layoutMode === 'rows') this._renderRows(week); else this._renderCols(week);
        } catch (e) {
            global.logError('[weekly-planner] render error: ' + e);
            try {
                this._body.destroy_all_children();
                this._body.add_actor(new St.Label({ text: this._t('renderErr') }));
            } catch (e2) { /* ignore */ }
        }
    },

    _dayButton: function (date, isToday, isTarget) {
        const t = this._theme;
        const btn = new St.Button({ style_class: 'wp-day', reactive: true, can_focus: false, y_expand: true });
        fillActor(btn);
        const tint = isToday && this.cfg_highlightToday;
        const border = isTarget ? this._px(2) + 'px solid ' + rgba(t.accent, 0.95)
            : (tint ? '1px solid ' + rgba(t.accent, 0.7) : '1px solid ' + rgba(this.cfg_borderColor, 0.35));
        btn.style = (tint ? 'background-color:' + rgba(t.accent, 0.16) + '; ' : '') + 'border:' + border + ';';
        btn.connect('clicked', function () { this._selectDay(date); }.bind(this));
        return btn;
    },

    _dayHeader: function (i, date, isToday, horizontalRow) {
        const t = this._theme, d = parseIso(date), lg = this._L();
        const style = this.cfg_headerStyle;
        let name = '', sub = '';
        if (style === 'full') { name = lg.days[i]; sub = lg.dayFirst ? d.getDate() + ' ' + lg.monthsS[d.getMonth()] : lg.monthsS[d.getMonth()] + ' ' + d.getDate(); }
        else if (style === 'short') { name = lg.daysS[i]; sub = '' + d.getDate(); }
        else if (style === 'name') { name = lg.days[i]; }
        else { name = lg.daysS[i]; sub = lg.shortDate(d); }
        const color = (isToday && this.cfg_highlightToday) ? readable(t.accent, this.cfg_bgColor) : t.head;
        const box = new St.BoxLayout({ vertical: true, style: 'padding-bottom:3px;' });
        const l1 = new St.Label({ text: name, style: 'font-weight:bold; color:' + color + ';' });
        box.add_actor(l1);
        if (sub) box.add_actor(new St.Label({ text: sub, style: 'color:' + color + '; font-size:' + Math.round(t.fs * 0.85) + 'px; opacity:200;' }));
        if (horizontalRow) box.set_width(Math.round(t.fs * 7));
        return box;
    },

    _renderCols: function (week) {
        // inner padding (16) + border + right handle (12) + vertical scrollbar allowance (22)
        const pad2 = this._px(16) + 2 * this.cfg_borderWidth + this._px(12) + this._px(22);
        const gap = this._px(4);
        const vis = this._visibleDays();
        if (!vis.length) { this._body.add_actor(new St.Label({ text: this._t('allHidden') })); return; }
        const colW = Math.max(this._px(70), Math.floor((this.cfg_width - pad2 - (vis.length - 1) * gap) / vis.length));
        const cols = new St.BoxLayout({ style: 'spacing:' + gap + 'px;' });
        const todayStr = this._todayStr, target = this._targetIndex();
        const nCols = Math.max(1, +this.cfg_entryCols || 1); // entry sub-columns within each day column
        const sp = this.cfg_compact ? this._px(2) : this._px(4);
        for (let k = 0; k < vis.length; k++) {
            const i = vis[k];
            const date = week.dates[i];
            const btn = this._dayButton(date, date === todayStr, i === target);
            btn.set_width(colW);
            const rec = { date: date, box: btn, items: [] };
            this._layout.push(rec);
            const col = new St.BoxLayout({ vertical: true, style: 'spacing:' + sp + 'px;' });
            col.add_actor(this._dayHeader(i, date, date === todayStr, false));
            if (nCols <= 1) {
                week.days[i].forEach(function (e) { col.add_actor(this._makeItem(e, date, rec)); }, this);
            } else {
                /* multi-column entry grid: nCols entries side by side, then wrap */
                let rowBox = null;
                week.days[i].forEach(function (e, idx) {
                    if (idx % nCols === 0) {
                        rowBox = new St.BoxLayout({ style: 'spacing:' + sp + 'px;' });
                        col.add_actor(rowBox);
                    }
                    const item = this._makeItem(e, date, rec);
                    item.x_expand = true;
                    rowBox.add_actor(item);
                }, this);
            }
            btn.set_child(col);
            cols.add_actor(btn);
        }
        this._body.add_actor(cols);
    },

    _renderRows: function (week) {
        const vis = this._visibleDays();
        if (!vis.length) { this._body.add_actor(new St.Label({ text: this._t('allHidden') })); return; }
        const rows = new St.BoxLayout({ vertical: true, style: 'spacing:4px;' });
        const todayStr = this._todayStr, target = this._targetIndex();
        const nRows = +this.cfg_entryRows || 0; // 0 = stacked (1 per line), 1 = all side-by-side, 2..4 = max rows
        const sp = this.cfg_compact ? this._px(2) : this._px(4);
        for (let k = 0; k < vis.length; k++) {
            const i = vis[k];
            const date = week.dates[i];
            const btn = this._dayButton(date, date === todayStr, i === target);
            const rec = { date: date, box: btn, items: [] };
            this._layout.push(rec);
            const row = new St.BoxLayout({ style: 'spacing:8px;' });
            row.add_actor(this._dayHeader(i, date, date === todayStr, true));
            const entries = week.days[i] || [];
            if (nRows === 0) {
                /* Stacked vertically: each entry on its own line */
                const list = new St.BoxLayout({ vertical: true, x_expand: true, style: 'spacing:' + sp + 'px;' });
                entries.forEach(function (e) { list.add_actor(this._makeItem(e, date, rec)); }, this);
                row.add_actor(list);
            } else if (nRows === 1) {
                /* Side-by-side in 1 single horizontal row */
                const list = new St.BoxLayout({ x_expand: true, style: 'spacing:' + sp + 'px;' });
                entries.forEach(function (e) {
                    const item = this._makeItem(e, date, rec);
                    item.x_expand = true;
                    list.add_actor(item);
                }, this);
                row.add_actor(list);
            } else {
                /* Multi-row: wrap into at most nRows rows */
                const grid = new St.BoxLayout({ vertical: true, x_expand: true, style: 'spacing:' + sp + 'px;' });
                const numCols = Math.max(1, Math.ceil(entries.length / nRows));
                for (let r = 0; r < nRows; r++) {
                    const slice = entries.slice(r * numCols, (r + 1) * numCols);
                    if (!slice.length && r > 0) break;
                    const rowBox = new St.BoxLayout({ x_expand: true, style: 'spacing:' + sp + 'px;' });
                    slice.forEach(function (e) {
                        const item = this._makeItem(e, date, rec);
                        item.x_expand = true;
                        rowBox.add_actor(item);
                    }, this);
                    grid.add_actor(rowBox);
                }
                row.add_actor(grid);
            }
            btn.set_child(row);
            rows.add_actor(btn);
        }
        this._body.add_actor(rows);
    },

    _makeItem: function (e, date, rec) {
        const t = this._theme, compact = !!this.cfg_compact;
        const color = e.color || t.accent;
        const ds = this.cfg_doneStyle;
        const todo = !!e.todo, done = todo && e.done;
        const btn = new St.Button({ reactive: true, can_focus: false, x_expand: true });
        fillActor(btn);
        const edge = e.important ? t.imp : color;
        btn.style = 'border-left:' + this._px(3) + 'px solid ' + edge + '; border-radius:4px; background-color:' +
            rgba(color, e.important ? 0.30 : 0.17) + '; padding:' + (compact ? this._px(1) + 'px ' + this._px(4) + 'px' : this._px(4) + 'px ' + this._px(6) + 'px') + ';' +
            (e.important ? ' border-top:1px solid ' + rgba(t.imp, 0.6) + '; border-bottom:1px solid ' + rgba(t.imp, 0.6) + ';' : '');
        if (this._drag && this._drag.id === e.id) btn.opacity = 110;
        else if (done && (ds === 'dim' || ds === 'both')) btn.opacity = 120;

        const row = new St.BoxLayout({ style: 'spacing:4px;' });

        // drag grip: pressing it starts a drag (the press is consumed so the entry is not clicked / the desklet not dragged)
        const grip = new St.Bin({ reactive: true, track_hover: true, can_focus: false, y_align: Clutter.ActorAlign.CENTER });
        grip.set_child(new St.Label({ text: '≡', style: 'padding:0 2px; opacity:150; color:' + t.text + ';' }));
        grip.connect('button-press-event', function (actor, event) {
            if (event.get_button() !== 1) return false;
            this._startDrag(e.id);
            return true;
        }.bind(this));
        row.add_actor(grip);

        if (todo && this.cfg_showCheckbox !== false) {
            const chk = new St.Button({ label: done ? '☑' : '☐', reactive: true, can_focus: false });
            chk.style = 'padding:0 2px; color:' + t.text + ';';
            chk.connect('clicked', function () {
                Model.toggleDone(e);
                this._changed();
            }.bind(this));
            row.add_actor(chk);
        }

        const col = new St.BoxLayout({ vertical: true, x_expand: true });
        const strike = done && (ds === 'strike' || ds === 'both');
        const title = new St.Label({
            text: (e.important && this.cfg_showStar !== false ? '★ ' : '') + trunc(e.title, compact ? 60 : 120),
            style: (e.important ? 'font-weight:bold; ' : '') + (strike ? 'text-decoration:line-through; ' : '')
        });
        const ct = title.clutter_text;
        if (compact) { ct.set_line_wrap(false); ct.set_ellipsize(Pango.EllipsizeMode.END); }
        else { ct.set_line_wrap(true); ct.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR); ct.set_ellipsize(Pango.EllipsizeMode.NONE); }
        col.add_actor(title);

        if (!compact && e.notes && this.cfg_showNotes !== false) {
            const first = trunc(e.notes.split('\n')[0], 70);
            const nl = new St.Label({ text: first, style: 'font-size:' + Math.round(t.fs * 0.85) + 'px; opacity:200;' });
            nl.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            col.add_actor(nl);
        }
        row.add_actor(col);
        btn.set_child(row);
        btn.connect('clicked', function () { this._openEditor(e, date); }.bind(this));
        rec.items.push({ id: e.id, actor: btn });
        return btn;
    },

    /* ---------------- drag to reorder ---------------- */

    _startDrag: function (id) {
        if (this._drag) return;
        this._drag = { id: id };
        // Follow the real pointer position / button state on a timer (works even when the pointer leaves the desklet).
        this._dragTimer = Mainloop.timeout_add(30, this._dragTick.bind(this));
        this._render(); // dims the dragged entry
    },

    _dragTick: function () {
        if (!this._drag) { this._dragTimer = null; return false; }
        try {
            const p = global.get_pointer(); // [x, y, modifiers]
            if (!(p[2] & Clutter.ModifierType.BUTTON1_MASK)) { this._dragTimer = null; this._endDrag(); return false; }
            this._dragTo(p[0], p[1]);
        } catch (e) { global.logError('[weekly-planner] drag error: ' + e); }
        return true;
    },

    /* Moves the dragged entry to the day / position under the pointer (live). */
    _dragTo: function (px, py) {
        const id = this._drag.id;
        let rec = null;
        for (let k = 0; k < this._layout.length && !rec; k++) {
            const r = this._layout[k];
            const pos = r.box.get_transformed_position(), size = r.box.get_transformed_size();
            if (px >= pos[0] && px <= pos[0] + size[0] && py >= pos[1] && py <= pos[1] + size[1]) rec = r;
        }
        if (!rec) return;
        let idx = 0;
        rec.items.forEach(function (it) {
            if (it.id === id) return;
            const pos = it.actor.get_transformed_position(), size = it.actor.get_transformed_size();
            if (pos[1] + size[1] / 2 < py) idx++;
        });
        const maxPer = +this.cfg_maxEntriesPerDay || 0;
        if (maxPer > 0) {
            const f = Model.find(this.data, id);
            if (f && f.date !== rec.date) {
                const dt = parseIso(rec.date);
                const weekday = dt ? wd(dt) : -1;
                const weeklyCount = (weekday >= 0 && this.data.weekly && this.data.weekly[weekday]) ? this.data.weekly[weekday].length : 0;
                if (((this.data.days[rec.date] || []).length + weeklyCount) >= maxPer) return;
            }
        }
        if (Model.move(this.data, id, rec.date, idx)) {
            this.data.ui.selected = rec.date;
            this._scheduleSave();
            this._render();
        }
    },

    _endDrag: function () {
        if (this._dragTimer) { Mainloop.source_remove(this._dragTimer); this._dragTimer = null; }
        const was = !!this._drag;
        this._drag = null;
        if (was) this._changed();
    },

    /* ---------------- dialogs ---------------- */

    _later: function (fn) {
        // short delay so a new ModalDialog isn't opened while another one is closing
        Mainloop.timeout_add(220, function () { try { fn(); } catch (e) { global.logError('[weekly-planner] ' + e); } return false; });
    },

    _newDialog: function (title) {
        const dlg = new ModalDialog.ModalDialog({ styleClass: 'wp-dialog' });
        dlg.contentLayout.add_actor(new St.Label({ text: title, style: 'font-weight:bold; font-size:15px; padding-bottom:4px;' }));
        return dlg;
    },

    /* Click handler wrapper: a failure is logged instead of silently doing nothing. */
    _openEditor: function (e, dateStr) {
        try { this._openEditorImpl(e, dateStr); } catch (err) {
            global.logError('[weekly-planner] could not open the editor: ' + err + '\n' + (err && err.stack ? err.stack : ''));
        }
    },

    /* e = entry (edit) or null (new entry at the bottom of dateStr) */
    _openEditorImpl: function (e, dateStr) {
        /* Max-entries guard: only checked when adding a NEW entry */
        if (!e) {
            const maxPer = +this.cfg_maxEntriesPerDay || 0;
            if (maxPer > 0) {
                const dt = parseIso(dateStr);
                const weekday = dt ? wd(dt) : -1;
                const weeklyCount = (weekday >= 0 && this.data.weekly && this.data.weekly[weekday]) ? this.data.weekly[weekday].length : 0;
                const cur = (this.data.days[dateStr] || []).length + weeklyCount;
                if (cur >= maxPer) {
                    const dlg = this._newDialog(this._t('maxReached')(maxPer));
                    dlg.setButtons([{ label: 'OK', action: function () { dlg.close(); }, key: Clutter.KEY_Escape }]);
                    dlg.open();
                    return;
                }
            }
        }
        const self = this;
        const st = { color: e ? e.color : '', important: e ? !!e.important : false, todo: e ? !!e.todo : false };
        const heading = (e ? this._t('editEntry') : this._t('newEntry')) + ' — ' + longDate(parseIso(dateStr), this.cfg_language);
        const dlg = this._newDialog(heading);
        const L = dlg.contentLayout;

        const titleE = mkEntry(e ? e.title : '', this._t('hintTitle'));
        L.add_actor(field(this._t('fTitle'), titleE));

        const notesE = mkEntry(e ? e.notes : '', this._t('hintNotes'));
        notesE.clutter_text.set_single_line_mode(false);
        notesE.clutter_text.set_activatable(false);
        notesE.clutter_text.set_line_wrap(true);
        notesE.style = 'min-width:280px; min-height:48px;';
        L.add_actor(field(this._t('fNotes'), notesE));

        // color picker: "default" chip + palette swatches
        const colOpts = [{ label: this._t('colorDefault'), value: '' }].concat(PALETTE.map(function (c) {
            return { label: '', value: c, color: c, swatch: true };
        }));
        L.add_actor(field(this._t('fColor'), chipRow(colOpts, function () { return st.color; }, function (v) { st.color = v; }, 9)));

        const opts = new St.BoxLayout({ style: 'spacing:6px;' });
        opts.add_actor(toggleChip(this._t('toDo'), function () { return st.todo; }, function (v) { st.todo = v; }, null));
        opts.add_actor(toggleChip(this._t('important'), function () { return st.important; }, function (v) { st.important = v; }, this._theme.imp));
        L.add_actor(field(this._t('fOptions'), opts));

        const errL = new St.Label({ text: '', style: 'color:#ff7b72; padding-top:6px;' });
        L.add_actor(errL);

        const onSave = function () {
            const title = titleE.get_text().trim();
            if (!title) { errL.set_text(self._t('errTitle')); return; }
            const fields = { title: title, notes: notesE.get_text().trim(), color: st.color, important: st.important, todo: st.todo };
            dlg.close();
            if (e) Model.update(self.data, e, fields); else Model.add(self.data, dateStr, fields);
            self.data.ui.selected = dateStr;
            self._changed();
        };

        const buttons = [];
        if (e) buttons.push({ label: this._t('del'), action: function () { dlg.close(); self._later(function () { self._confirmDelete(e); }); } });
        buttons.push({ label: this._t('cancel'), action: function () { dlg.close(); }, key: Clutter.KEY_Escape });
        buttons.push({ label: this._t('save'), action: onSave });
        dlg.setButtons(buttons);
        dlg.open();
        try { dlg.setInitialKeyFocus(titleE); } catch (err) { /* not available in older versions */ }
    },

    _confirmDelete: function (e) {
        const self = this;
        const dlg = this._newDialog(this._t('delEntry'));
        const lbl = new St.Label({ text: this._t('confirmDel')(trunc(e.title, 50)), style: 'padding:6px 0; max-width:360px;' });
        lbl.clutter_text.set_line_wrap(true);
        dlg.contentLayout.add_actor(lbl);
        dlg.setButtons([
            { label: this._t('del'), action: function () { dlg.close(); Model.remove(self.data, e.id); self._changed(); } },
            { label: this._t('cancel'), action: function () { dlg.close(); }, key: Clutter.KEY_Escape }
        ]);
        dlg.open();
    },

    /* ---------------- lifecycle ---------------- */

    on_desklet_removed: function () {
        this._endResize(false);
        this._drag = null;
        if (this._dragTimer) { Mainloop.source_remove(this._dragTimer); this._dragTimer = null; }
        if (this._dayTimer) { Mainloop.source_remove(this._dayTimer); this._dayTimer = null; }
        if (this._cfgIdle) { Mainloop.source_remove(this._cfgIdle); this._cfgIdle = null; }
        if (this._saveTimer) { Mainloop.source_remove(this._saveTimer); this._saveTimer = null; }
        this._saveNow(); // flush pending changes; the data file is intentionally left in place (so nothing is lost on reload)
        try { this.settings.finalize(); } catch (e) { /* ignore */ }
    }
};

function main(metadata, desklet_id) {
    return new PlannerDesklet(metadata, desklet_id);
}