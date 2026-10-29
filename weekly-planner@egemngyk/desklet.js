/* Weekly Planner — Cinnamon desklet
 *
 * Architecture:
 *  - Model: pure data logic with no GI dependency (testable with node).
 *  - PlannerDesklet: Cinnamon UI, settings and storage.
 *
 * Entries are NOT added from the desklet itself. They are edited in Configure → Entries
 * (one list per weekday, in "repeat every week" mode or for one specific week). The data file is the
 * source of truth; the lists in the settings window are an editing view that is kept in sync with it.
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

const DATA_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'weekly-planner-desklet']);

/* Names accepted in the "Color" column of the entry lists (English and Turkish). */
const COLOR_NAMES = {
    blue: '#4f9dde', mavi: '#4f9dde',
    red: '#e5534b', 'kırmızı': '#e5534b', kirmizi: '#e5534b',
    yellow: '#e0a030', 'sarı': '#e0a030', sari: '#e0a030',
    purple: '#8e6ad8', mor: '#8e6ad8',
    teal: '#3fb0a0', turkuaz: '#3fb0a0',
    gray: '#7f8c9a', grey: '#7f8c9a', gri: '#7f8c9a',
    pink: '#d9609a', pembe: '#d9609a',
    green: '#6ab04c', 'yeşil': '#6ab04c', yesil: '#6ab04c',
    orange: '#e67e22', turuncu: '#e67e22',
    navy: '#2c3e50', lacivert: '#2c3e50'
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
        dueLabel: function (d, mon) { return 'due ' + mon + ' ' + d; },
        today: 'Today',
        menuWPlus: 'Width +60', menuWMinus: 'Width −60', menuHPlus: 'Height +60', menuHMinus: 'Height −60',
        menuGoto: 'Go to this week',
        renderErr: 'Display error (see the log).',
        allHidden: 'All days are hidden.\nEnable some in Configure → Entries.',
        invalidDate: 'Invalid date — use YYYY-MM-DD',
        editingWeek: 'Editing'
    },
    tr: {
        dayFirst: true,
        months: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
        monthsS: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
        days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'],
        daysS: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
        shortDate: function (d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1); },
        dueLabel: function (d, mon) { return 'teslim ' + d + ' ' + mon; },
        today: 'Bugün',
        menuWPlus: 'Genişlik +60', menuWMinus: 'Genişlik −60', menuHPlus: 'Yükseklik +60', menuHMinus: 'Yükseklik −60',
        menuGoto: 'Bu haftaya git',
        renderErr: 'Görüntüleme hatası (günlüğe bakın).',
        allHidden: 'Tüm günler gizli.\nYapılandır → Entries bölümünden açın.',
        invalidDate: 'Geçersiz tarih — YYYY-AA-GG kullanın',
        editingWeek: 'Düzenlenen'
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

/* ------------------------------------------------------------------ */
/* Model: weekly entries, per-week entries and done state              */
/* ------------------------------------------------------------------ */
/*
 * data = {
 *   version: 2,
 *   ui: { weekOffset, editWeek },          // editWeek: Monday (ISO) of the week edited in Configure → Entries
 *   weekly: [ [entry...] x 7 ],            // repeat every week; index 0 = Monday
 *   weeks: { "<Monday ISO>": [ [entry...] x 7 ] },   // entries of one specific week only
 *   occ: { "<entryId>|<YYYY-MM-DD>": { done: true } }   // done state belongs to that date's occurrence
 * }
 * entry = { id, title, notes, color, important, todo, due, [from, to, skipDates] }   (from/to/skipDates only come from migration)
 */
const Model = {
    emptyWeek: function () { return [[], [], [], [], [], [], []]; },

    defaults: function () {
        return { version: 2, ui: { weekOffset: 0, editWeek: null }, weekly: Model.emptyWeek(), weeks: {}, occ: {} };
    },

    toBool: function (v) { return v === true || v === 'true' || v === 1; },

    /* A row of the settings list (or any loose object) -> normalized entry fields. */
    rowToFields: function (row) {
        row = row && typeof row === 'object' ? row : {};
        const due = String(row.due === undefined || row.due === null ? '' : row.due).trim();
        return {
            title: String(row.title === undefined || row.title === null ? '' : row.title).trim().slice(0, 200) || 'Untitled',
            notes: String(row.notes === undefined || row.notes === null ? '' : row.notes).trim().slice(0, 2000),
            todo: Model.toBool(row.todo),
            important: Model.toBool(row.important),
            color: String(row.color === undefined || row.color === null ? '' : row.color).trim().slice(0, 40),
            due: parseIso(due) ? due : ''
        };
    },
    fieldsToRow: function (e) { return Model.rowToFields(e); },

    cleanEntry: function (it) {
        if (!it || typeof it !== 'object') return null;
        const e = Model.rowToFields(it);
        e.id = typeof it.id === 'string' && it.id ? it.id : newId();
        if (parseIso(it.from)) e.from = it.from;
        if (parseIso(it.to)) e.to = it.to;
        if (Array.isArray(it.skipDates)) {
            const s = it.skipDates.filter(function (x) { return !!parseIso(x); });
            if (s.length) e.skipDates = s;
        }
        return e;
    },

    cleanWeek: function (w) {
        const r = Model.emptyWeek();
        if (!Array.isArray(w)) return r;
        for (let i = 0; i < 7; i++) {
            if (Array.isArray(w[i])) r[i] = w[i].map(Model.cleanEntry).filter(Boolean);
        }
        return r;
    },

    putDated: function (d, e, dateStr) {
        const dt = parseIso(dateStr);
        const mon = iso(mondayOf(dt));
        if (!d.weeks[mon]) d.weeks[mon] = Model.emptyWeek();
        d.weeks[mon][wd(dt)].push(e);
    },

    /* Version 1 (items / occ with once + weekly rules) -> version 2. */
    migrate: function (raw) {
        const d = Model.defaults();
        const occ = raw.occ && typeof raw.occ === 'object' ? raw.occ : {};
        const base = function (it, over) {
            const src = Object.assign({}, it, over || {});
            const e = Model.rowToFields(src);
            e.todo = true; // every v1 entry had a completion checkbox
            e.id = it.id;
            return e;
        };
        (Array.isArray(raw.items) ? raw.items : []).forEach(function (it) {
            if (!it || typeof it.id !== 'string' || typeof it.title !== 'string') return;
            if (it.kind === 'once' && parseIso(it.date)) {
                Model.putDated(d, base(it), it.date);
                const x = occ[it.id + '|' + it.date];
                if (x && x.done) d.occ[it.id + '|' + it.date] = { done: true };
            } else if (it.kind === 'weekly' && it.weekday >= 0 && it.weekday <= 6 && parseIso(it.startDate)) {
                const e = base(it);
                e.from = it.startDate;
                if (parseIso(it.endDate)) e.to = it.endDate;
                d.weekly[it.weekday | 0].push(e);
                Object.keys(occ).forEach(function (k) {
                    if (k.indexOf(it.id + '|') !== 0) return;
                    const date = k.slice(it.id.length + 1), x = occ[k];
                    if (!x || typeof x !== 'object' || !parseIso(date)) return;
                    if (x.skip || x.over) {
                        e.skipDates = (e.skipDates || []).concat([date]);
                        if (x.over && !x.skip) { // an edited single occurrence becomes a one-week entry
                            const n = base(it, x.over);
                            n.id = newId();
                            Model.putDated(d, n, date);
                            if (x.done) d.occ[n.id + '|' + date] = { done: true };
                        }
                    } else if (x.done) {
                        d.occ[k] = { done: true };
                    }
                });
            }
        });
        return d;
    },

    /* Defensive normalization against corrupt or missing data. */
    normalize: function (raw) {
        if (!raw || typeof raw !== 'object') return Model.defaults();
        let d;
        if (raw.version === 2) {
            d = Model.defaults();
            d.weekly = Model.cleanWeek(raw.weekly);
            if (raw.weeks && typeof raw.weeks === 'object') {
                Object.keys(raw.weeks).forEach(function (k) {
                    const dt = parseIso(k);
                    if (!dt || wd(dt) !== 0) return;
                    const w = Model.cleanWeek(raw.weeks[k]);
                    if (w.some(function (l) { return l.length; })) d.weeks[k] = w;
                });
            }
            if (raw.occ && typeof raw.occ === 'object') {
                Object.keys(raw.occ).forEach(function (k) {
                    const x = raw.occ[k];
                    if (x && typeof x === 'object' && x.done) d.occ[k] = { done: true };
                });
            }
        } else {
            d = Model.migrate(raw);
        }
        if (raw.ui && typeof raw.ui.weekOffset === 'number' && isFinite(raw.ui.weekOffset)) {
            d.ui.weekOffset = Math.max(-5000, Math.min(5000, Math.round(raw.ui.weekOffset)));
        }
        if (raw.ui && parseIso(raw.ui.editWeek) && wd(parseIso(raw.ui.editWeek)) === 0) d.ui.editWeek = raw.ui.editWeek;
        return d;
    },

    occurrence: function (data, it, date) {
        const key = it.id + '|' + date;
        const x = data.occ[key];
        return { item: it, date: date, key: key, f: it, done: !!(x && x.done) };
    },

    /* Occurrences for the 7 days starting at `start` (a Monday): weekly entries first, then this week's own entries. */
    occurrences: function (data, start) {
        const dates = [], days = [];
        const wk = data.weeks[iso(start)];
        for (let i = 0; i < 7; i++) {
            const date = iso(addDays(start, i));
            dates.push(date);
            const list = [];
            data.weekly[i].forEach(function (it) {
                if (it.from && date < it.from) return;
                if (it.to && date > it.to) return;
                if (it.skipDates && it.skipDates.indexOf(date) >= 0) return;
                list.push(Model.occurrence(data, it, date));
            });
            if (wk) wk[i].forEach(function (it) { list.push(Model.occurrence(data, it, date)); });
            days.push(list);
        }
        return { dates: dates, days: days };
    },

    toggleDone: function (data, o) {
        if (data.occ[o.key]) delete data.occ[o.key]; else data.occ[o.key] = { done: true };
    },

    dropOcc: function (data, id) {
        const p = id + '|';
        Object.keys(data.occ).forEach(function (k) { if (k.indexOf(p) === 0) delete data.occ[k]; });
    },

    /*
     * Turns the rows of a settings list into entries. Rows are matched to the existing entries (so ids,
     * done state and hidden fields survive): first by identical title, then leftovers by position
     * (that is a renamed entry).
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
            return match[i] >= 0 ? Object.assign({}, oldList[match[i]], r) : Object.assign({ id: newId() }, r);
        });
    },

    setWeekDay: function (data, monday, i, list) {
        let w = data.weeks[monday];
        if (!w) {
            if (!list.length) return;
            w = data.weeks[monday] = Model.emptyWeek();
        }
        w[i] = list;
        if (w.every(function (l) { return !l.length; })) delete data.weeks[monday];
    },

    dayList: function (data, monday, i) {
        if (monday === null) return data.weekly[i];
        const w = data.weeks[monday];
        return w ? w[i] : [];
    },

    /* Applies the rows of one day list (monday === null: weekly list). Returns true when something changed. */
    applyRows: function (data, monday, i, rows) {
        const cur = Model.dayList(data, monday, i);
        const nxt = Model.reconcile(cur, rows);
        if (JSON.stringify(cur) === JSON.stringify(nxt)) return false;
        const keep = {};
        nxt.forEach(function (e) { keep[e.id] = true; });
        cur.forEach(function (e) { if (!keep[e.id]) Model.dropOcc(data, e.id); });
        if (monday === null) data.weekly[i] = nxt; else Model.setWeekDay(data, monday, i, nxt);
        return true;
    },

    rowsKey: function (rows) {
        return JSON.stringify((Array.isArray(rows) ? rows : []).map(Model.rowToFields));
    }
};

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

/* x_fill/y_fill don't exist in some Cinnamon versions; passing them to the constructor would crash loading, so they are set here and failures are ignored. */
function fillActor(a) {
    try { a.x_fill = true; a.y_fill = true; } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Desklet                                                             */
/* ------------------------------------------------------------------ */

const CFG_KEYS = ['layoutMode', 'compact', 'highlightToday', 'doneStyle', 'width', 'height', 'fontSize',
    'bgColor', 'textColor', 'accentColor', 'dayHeaderColor', 'borderColor', 'importantColor',
    'opacity', 'borderWidth', 'borderRadius', 'dateFormat', 'headerStyle', 'uiScale', 'language',
    'showDay0', 'showDay1', 'showDay2', 'showDay3', 'showDay4', 'showDay5', 'showDay6',
    'showNotes', 'showDue', 'showCheckbox', 'showStar'];

/* Settings list widgets: [kind, weekday index, settings key]. 'weekly' = repeat every week, 'week' = the week being edited. */
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
        this._suppressUntil = 0;
        this._rs = null;
        this._rsId = null;
        this._rsTimer = null;
        this._rsGrab = false;
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
        this.data = Model.normalize(raw || null);
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
            const monday = kind === 'weekly' ? null : iso(this._editMonday());
            if (Model.applyRows(this.data, monday, i, this._getValue(key))) this._changed();
        } catch (e) {
            global.logError('[weekly-planner] list sync error: ' + e);
        }
    },

    /* Reads every list from the settings (used before navigating to another week, so nothing is lost). */
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
        // show the edited week on the desklet as well
        this.data.ui.weekOffset = Math.max(-5000, Math.min(5000,
            Math.round((monday.getTime() - mondayOf(today()).getTime()) / (7 * 86400000))));
        this._pushLists();
        this._updateWeekFields();
        this._changed();
    },

    /* Callbacks of the buttons in Configure → Entries (called by name from the settings window). */
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
        [this._btnPrev, this._btnNext, this._btnToday].forEach(function (b) { b.style = navStyle; });
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
        this._title = new St.Label({ text: '', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        head.add_actor(this._btnPrev);
        head.add_actor(this._title);
        head.add_actor(this._btnNext);
        head.add_actor(this._btnToday);
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

    /* ---------------- week navigation (display) ---------------- */

    _weekStart: function () { return addDays(mondayOf(today()), 7 * this.data.ui.weekOffset); },
    _shiftWeek: function (n) { this.data.ui.weekOffset += n; this._changed(); },
    _gotoWeek: function (off) { this.data.ui.weekOffset = off; this._changed(); },
    /* Indices (0 = Monday) of the days that are not hidden in the settings. */
    _visibleDays: function () {
        const r = [];
        for (let i = 0; i < 7; i++) if (this['cfg_showDay' + i] !== false) r.push(i);
        return r;
    },

    /* ---------------- rendering ---------------- */

    _render: function () {
        try {
            this._todayStr = iso(today());
            const start = this._weekStart();
            this._title.set_text(formatRange(start, this.cfg_dateFormat, this.cfg_language));
            const occ = Model.occurrences(this.data, start);
            this._body.destroy_all_children();
            if (this.cfg_layoutMode === 'rows') this._renderRows(occ); else this._renderCols(occ);
        } catch (e) {
            global.logError('[weekly-planner] render error: ' + e);
            try {
                this._body.destroy_all_children();
                this._body.add_actor(new St.Label({ text: this._t('renderErr') }));
            } catch (e2) { /* ignore */ }
        }
    },

    _dayBox: function (isToday) {
        const t = this._theme;
        const box = new St.Bin({ style_class: 'wp-day', y_expand: true });
        fillActor(box);
        box.style = isToday && this.cfg_highlightToday
            ? 'background-color:' + rgba(t.accent, 0.16) + '; border:1px solid ' + rgba(t.accent, 0.7) + ';'
            : 'border:1px solid ' + rgba(this.cfg_borderColor, 0.35) + ';';
        return box;
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

    _renderCols: function (occ) {
        // inner padding (16) + border + right handle (12) + vertical scrollbar allowance (22)
        const pad2 = this._px(16) + 2 * this.cfg_borderWidth + this._px(12) + this._px(22);
        const gap = this._px(4);
        // Columns shrink with the width; below 70 px they stop shrinking and horizontal scrolling (overflow) kicks in.
        const vis = this._visibleDays();
        if (!vis.length) { this._body.add_actor(new St.Label({ text: this._t('allHidden') })); return; }
        const colW = Math.max(this._px(70), Math.floor((this.cfg_width - pad2 - (vis.length - 1) * gap) / vis.length));
        const cols = new St.BoxLayout({ style: 'spacing:' + gap + 'px;' });
        const todayStr = this._todayStr;
        for (let k = 0; k < vis.length; k++) {
            const i = vis[k];
            const date = occ.dates[i];
            const box = this._dayBox(date === todayStr);
            box.set_width(colW);
            const col = new St.BoxLayout({ vertical: true, style: 'spacing:' + (this.cfg_compact ? 2 : 4) + 'px;' });
            col.add_actor(this._dayHeader(i, date, date === todayStr, false));
            occ.days[i].forEach(function (o) { col.add_actor(this._makeItem(o)); }, this);
            box.set_child(col);
            cols.add_actor(box);
        }
        this._body.add_actor(cols);
    },

    _renderRows: function (occ) {
        const vis = this._visibleDays();
        if (!vis.length) { this._body.add_actor(new St.Label({ text: this._t('allHidden') })); return; }
        const rows = new St.BoxLayout({ vertical: true, style: 'spacing:4px;' });
        const todayStr = this._todayStr;
        for (let k = 0; k < vis.length; k++) {
            const i = vis[k];
            const date = occ.dates[i];
            const box = this._dayBox(date === todayStr);
            const row = new St.BoxLayout({ style: 'spacing:8px;' });
            row.add_actor(this._dayHeader(i, date, date === todayStr, true));
            const list = new St.BoxLayout({ vertical: true, x_expand: true, style: 'spacing:' + (this.cfg_compact ? 2 : 4) + 'px;' });
            occ.days[i].forEach(function (o) { list.add_actor(this._makeItem(o)); }, this);
            row.add_actor(list);
            box.set_child(row);
            rows.add_actor(box);
        }
        this._body.add_actor(rows);
    },

    _colorOf: function (f) {
        return resolveColor(f.color) || this._theme.accent;
    },

    _makeItem: function (o) {
        const t = this._theme, f = o.f, compact = !!this.cfg_compact;
        const color = this._colorOf(f);
        const ds = this.cfg_doneStyle;
        const todo = !!f.todo;
        const done = todo && o.done;
        const box = new St.Bin({ x_expand: true });
        fillActor(box);
        const edge = f.important ? t.imp : color;
        box.style = 'border-left:' + this._px(3) + 'px solid ' + edge + '; border-radius:4px; background-color:' +
            rgba(color, f.important ? 0.30 : 0.17) + '; padding:' + (compact ? this._px(1) + 'px ' + this._px(4) + 'px' : this._px(4) + 'px ' + this._px(6) + 'px') + ';' +
            (f.important ? ' border-top:1px solid ' + rgba(t.imp, 0.6) + '; border-bottom:1px solid ' + rgba(t.imp, 0.6) + ';' : '');
        if (done && (ds === 'dim' || ds === 'both')) box.opacity = 120;

        const row = new St.BoxLayout({ style: 'spacing:4px;' });
        if (todo && this.cfg_showCheckbox !== false) {
            const chk = new St.Button({ label: done ? '☑' : '☐', reactive: true, can_focus: false });
            chk.style = 'padding:0 2px; color:' + t.text + ';';
            chk.connect('clicked', function () {
                Model.toggleDone(this.data, o);
                this._changed();
            }.bind(this));
            row.add_actor(chk);
        }

        const col = new St.BoxLayout({ vertical: true, x_expand: true });
        const strike = done && (ds === 'strike' || ds === 'both');
        const title = new St.Label({
            text: (f.important && this.cfg_showStar !== false ? '★ ' : '') + trunc(f.title, compact ? 60 : 120),
            style: (f.important ? 'font-weight:bold; ' : '') + (strike ? 'text-decoration:line-through; ' : '')
        });
        const ct = title.clutter_text;
        if (compact) { ct.set_line_wrap(false); ct.set_ellipsize(Pango.EllipsizeMode.END); }
        else { ct.set_line_wrap(true); ct.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR); ct.set_ellipsize(Pango.EllipsizeMode.NONE); }
        col.add_actor(title);

        const small = 'font-size:' + Math.round(t.fs * 0.85) + 'px; opacity:200;';
        const meta = [];
        if (f.due && this.cfg_showDue !== false) { const d = parseIso(f.due); if (d) meta.push(this._L().dueLabel(d.getDate(), this._L().monthsS[d.getMonth()])); }
        if (meta.length) {
            const ml = new St.Label({ text: meta.join(' · '), style: small });
            ml.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            col.add_actor(ml);
        }
        if (!compact && f.notes && this.cfg_showNotes !== false) {
            const first = trunc(f.notes.split('\n')[0], 70);
            const nl = new St.Label({ text: first, style: small });
            nl.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            col.add_actor(nl);
        }
        row.add_actor(col);
        box.set_child(row);
        return box;
    },

    /* ---------------- lifecycle ---------------- */

    on_desklet_removed: function () {
        this._endResize(false);
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