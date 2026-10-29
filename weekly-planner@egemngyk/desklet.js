/* Weekly Planner — Cinnamon desklet
 *
 * Architecture:
 *  - Model: pure data/recurrence logic with no GI dependency (testable with node).
 *  - PlannerDesklet: Cinnamon UI, settings and storage.
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

const PALETTE = ['#4f9dde', '#e5534b', '#e0a030', '#8e6ad8', '#3fb0a0', '#7f8c9a', '#d9609a', '#6ab04c', '#e67e22', '#2c3e50'];
const FIELDS = ['title', 'notes', 'color', 'important', 'due'];

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
        allHidden: 'All days are hidden.\nEnable some in Configure → Visible days.',
        cancel: 'Cancel', save: 'Save', del: 'Delete',
        newEntry: 'New entry', editEntry: 'Edit entry',
        fTitle: 'Title', fNotes: 'Notes', fColor: 'Color', fDate: 'Date', fRepeat: 'Repeat',
        fDue: 'End / due date', fPriority: 'Priority',
        hintTitle: 'Title', hintNotes: 'Description / notes (optional)',
        hintDate: 'YYYY-MM-DD', hintDue: 'YYYY-MM-DD (optional)',
        colorDefault: 'Default', invalidDate: 'Invalid date',
        repeatOnce: 'Selected date only', repeatWeekly: 'Repeat every week',
        normal: 'Normal', important: '★ Important',
        errTitle: 'Title is required.', errDate: 'Date must be in YYYY-MM-DD format.',
        errDue: 'Due date must be in YYYY-MM-DD format.',
        weeklyEntry: 'Weekly entry', applyWhere: 'Where should this change apply?',
        thisWeek: 'This week only', thisAndFuture: 'This and following weeks',
        delWeekly: 'Delete weekly entry', delThisWeek: 'Delete this week only', endFromNow: 'End from this week on',
        whatToDo: function (t) { return 'What should happen to “' + t + '”?'; },
        delEntry: 'Delete entry',
        confirmDel: function (t) { return 'Delete “' + t + '”?'; }
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
        allHidden: 'Tüm günler gizli.\nYapılandır → Visible days bölümünden açın.',
        cancel: 'İptal', save: 'Kaydet', del: 'Sil',
        newEntry: 'Yeni kayıt', editEntry: 'Kaydı düzenle',
        fTitle: 'Başlık', fNotes: 'Not', fColor: 'Renk', fDate: 'Tarih', fRepeat: 'Tekrar',
        fDue: 'Bitiş / teslim tarihi', fPriority: 'Önem',
        hintTitle: 'Başlık', hintNotes: 'Açıklama / not (isteğe bağlı)',
        hintDate: 'YYYY-AA-GG', hintDue: 'YYYY-AA-GG (isteğe bağlı)',
        colorDefault: 'Varsayılan', invalidDate: 'Geçersiz tarih',
        repeatOnce: 'Yalnızca seçilen tarih', repeatWeekly: 'Her hafta tekrarla',
        normal: 'Normal', important: '★ Önemli',
        errTitle: 'Başlık gerekli.', errDate: 'Tarih YYYY-AA-GG biçiminde olmalı.',
        errDue: 'Teslim tarihi YYYY-AA-GG biçiminde olmalı.',
        weeklyEntry: 'Haftalık kayıt', applyWhere: 'Bu değişiklik nereye uygulansın?',
        thisWeek: 'Yalnızca bu hafta', thisAndFuture: 'Bu ve sonraki haftalar',
        delWeekly: 'Haftalık kaydı sil', delThisWeek: 'Yalnızca bu haftayı sil', endFromNow: 'Bu haftadan itibaren sonlandır',
        whatToDo: function (t) { return '“' + t + '” için ne yapılsın?'; },
        delEntry: 'Kaydı sil',
        confirmDel: function (t) { return '“' + t + '” silinsin mi?'; }
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
/* Model: recurrence rules and exceptions                              */
/* ------------------------------------------------------------------ */
/*
 * data = {
 *   version: 1,
 *   ui: { weekOffset },
 *   items: [
 *     {id, kind:'once',   date,                       ...FIELDS},
 *     {id, kind:'weekly', weekday, startDate, endDate, ...FIELDS}   // endDate: inclusive, null = open-ended
 *   ],
 *   occ: { "<itemId>|<YYYY-MM-DD>": { done?, skip?, over?: {...FIELDS} } }   // per-occurrence exception
 * }
 * Done state, skips and overrides belong to the occurrence on that date, not to the rule.
 */
const Model = {
    defaults: function () {
        return {
            version: 1,
            ui: { weekOffset: 0 },
            items: [],
            occ: {}
        };
    },

    pick: function (src) {
        const r = {};
        FIELDS.forEach(function (k) { r[k] = src[k]; });
        return r;
    },

    /* Defensive normalization against corrupt or missing data. */
    normalize: function (raw) {
        const d = Model.defaults();
        if (!raw || typeof raw !== 'object') return d;
        if (Array.isArray(raw.items)) {
            d.items = [];
            raw.items.forEach(function (it) {
                if (!it || typeof it.id !== 'string' || typeof it.title !== 'string') return;
                const base = {
                    id: it.id, title: it.title,
                    notes: typeof it.notes === 'string' ? it.notes : '',
                    color: typeof it.color === 'string' ? it.color : null,
                    important: !!it.important,
                    due: parseIso(it.due) ? it.due : ''
                };
                if (it.kind === 'once' && parseIso(it.date)) {
                    base.kind = 'once'; base.date = it.date;
                } else if (it.kind === 'weekly' && it.weekday >= 0 && it.weekday <= 6 && parseIso(it.startDate)) {
                    base.kind = 'weekly'; base.weekday = it.weekday | 0; base.startDate = it.startDate;
                    base.endDate = parseIso(it.endDate) ? it.endDate : null;
                } else return;
                d.items.push(base);
            });
        }
        if (raw.occ && typeof raw.occ === 'object') {
            Object.keys(raw.occ).forEach(function (k) {
                const x = raw.occ[k];
                if (x && typeof x === 'object') d.occ[k] = x;
            });
        }
        if (raw.ui && typeof raw.ui.weekOffset === 'number' && isFinite(raw.ui.weekOffset)) {
            d.ui.weekOffset = Math.max(-5000, Math.min(5000, Math.round(raw.ui.weekOffset)));
        }
        return d;
    },

    matches: function (it, date, weekdayIndex) {
        if (it.kind === 'once') return it.date === date;
        return it.weekday === weekdayIndex && date >= it.startDate && (!it.endDate || date <= it.endDate);
    },

    /* The occurrence of an item on a given date (exceptions applied). */
    occurrence: function (data, it, date) {
        const key = it.id + '|' + date;
        const x = data.occ[key] || {};
        if (x.skip) return null;
        const f = Object.assign({}, it);
        if (x.over) Object.assign(f, x.over);
        return { item: it, date: date, key: key, f: f, done: !!x.done };
    },

    /* Occurrences for the 7 days starting at `start` (a Monday). */
    occurrences: function (data, start) {
        const dates = [], days = [];
        for (let i = 0; i < 7; i++) { dates.push(iso(addDays(start, i))); days.push([]); }
        data.items.forEach(function (it) {
            for (let i = 0; i < 7; i++) {
                if (Model.matches(it, dates[i], i)) {
                    const o = Model.occurrence(data, it, dates[i]);
                    if (o) days[i].push(o);
                }
            }
        });
        return { dates: dates, days: days };
    },

    keysOf: function (data, id) {
        const p = id + '|';
        return Object.keys(data.occ).filter(function (k) { return k.indexOf(p) === 0; });
    },
    dropOcc: function (data, id, fromDate) {
        Model.keysOf(data, id).forEach(function (k) {
            if (!fromDate || k.slice(k.indexOf('|') + 1) >= fromDate) delete data.occ[k];
        });
    },
    removeItem: function (data, it) {
        data.items = data.items.filter(function (x) { return x.id !== it.id; });
        Model.dropOcc(data, it.id, null);
    },
    endSeriesBefore: function (data, it, date) {
        if (date <= it.startDate) { Model.removeItem(data, it); return; }
        it.endDate = iso(addDays(parseIso(date), -1));
        Model.dropOcc(data, it.id, date);
    },
    moveOcc: function (data, id, from, to) {
        if (from === to) return;
        const a = id + '|' + from;
        if (data.occ[a]) { data.occ[id + '|' + to] = data.occ[a]; delete data.occ[a]; }
    },

    create: function (data, fields, date, repeat) {
        const base = Model.pick(fields);
        base.id = newId();
        if (repeat) {
            base.kind = 'weekly'; base.weekday = wd(parseIso(date)); base.startDate = date; base.endDate = null;
        } else {
            base.kind = 'once'; base.date = date;
        }
        data.items.push(base);
        return base;
    },

    toggleDone: function (data, o) {
        const x = data.occ[o.key] || {};
        if (x.done) delete x.done; else x.done = true;
        if (Object.keys(x).length) data.occ[o.key] = x; else delete data.occ[o.key];
    },

    /* scope: 'this' (this occurrence only) | 'future' (this and following weeks) — weekly items only. */
    edit: function (data, o, fields, date, repeat, scope) {
        const it = o.item, f = Model.pick(fields);
        if (it.kind === 'once') {
            Object.assign(it, f);
            if (repeat) {
                it.kind = 'weekly'; it.weekday = wd(parseIso(date)); it.startDate = date; it.endDate = null;
                delete it.date;
            } else {
                it.date = date;
            }
            Model.moveOcc(data, it.id, o.date, date);
            return;
        }
        // --- weekly item ---
        if (scope === 'this') {
            if (repeat && date === o.date) {
                const x = data.occ[o.key] || {};
                x.over = f;
                data.occ[o.key] = x;
            } else {
                // this occurrence was moved to another day / repeat was turned off: skip it and create a one-off item
                const x = data.occ[o.key] || {};
                const wasDone = !!x.done;
                x.skip = true; delete x.over;
                data.occ[o.key] = x;
                const n = Model.create(data, f, date, false);
                if (wasDone) data.occ[n.id + '|' + date] = { done: true };
            }
            return;
        }
        // scope === 'future'
        if (!repeat) {
            Model.endSeriesBefore(data, it, o.date);
            Model.create(data, f, date, false);
            return;
        }
        const newWd = wd(parseIso(date));
        if (o.date <= it.startDate || date <= it.startDate) {
            const oldWd = it.weekday;
            Object.assign(it, f);
            it.weekday = newWd; it.startDate = date;
            if (oldWd !== newWd) Model.dropOcc(data, it.id, null);
            return;
        }
        const origEnd = it.endDate;
        const cut = o.date < date ? o.date : date;
        const oldWd = it.weekday;
        it.endDate = iso(addDays(parseIso(cut), -1));
        const n = Model.create(data, f, date, true);
        n.endDate = origEnd;
        // move exceptions on/after the cut date to the new series (drop them if the weekday changed)
        Model.keysOf(data, it.id).forEach(function (k) {
            const d = k.slice(k.indexOf('|') + 1);
            if (d >= cut) {
                if (newWd === oldWd) data.occ[n.id + '|' + d] = data.occ[k];
                delete data.occ[k];
            }
        });
    },

    remove: function (data, o, scope) {
        const it = o.item;
        if (it.kind === 'once') { Model.removeItem(data, it); return; }
        if (scope === 'this') {
            const x = data.occ[o.key] || {};
            x.skip = true; delete x.over;
            data.occ[o.key] = x;
        } else {
            Model.endSeriesBefore(data, it, o.date);
        }
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

/* options: [{label, value, color?, swatch?}] */
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
    'showDay0', 'showDay1', 'showDay2', 'showDay3', 'showDay4', 'showDay5', 'showDay6'];

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

        this._loadData();
        this._buildUi();
        this._applyTheme();
        this._render();
        this._setupMenu();
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
        this._btnAdd = mk('＋', function () { this._openEditor(null, this._defaultNewDate()); }.bind(this));
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

    /* ---------------- week navigation ---------------- */

    _weekStart: function () { return addDays(mondayOf(today()), 7 * this.data.ui.weekOffset); },
    _shiftWeek: function (n) { this.data.ui.weekOffset += n; this._changed(); },
    _gotoWeek: function (off) { this.data.ui.weekOffset = off; this._changed(); },
    /* Indices (0 = Monday) of the days that are not hidden in the settings. */
    _visibleDays: function () {
        const r = [];
        for (let i = 0; i < 7; i++) if (this['cfg_showDay' + i] !== false) r.push(i);
        return r;
    },
    _defaultNewDate: function () {
        const s = this._weekStart(), t = today();
        const vis = this._visibleDays();
        const diff = Math.round((t.getTime() - s.getTime()) / 86400000);
        let i = diff >= 0 && diff < 7 ? diff : 0;
        if (vis.length && vis.indexOf(i) < 0) i = vis[0]; // today is hidden: use the first visible day
        return iso(addDays(s, i));
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

    _dayButton: function (date, isToday) {
        const t = this._theme;
        const btn = new St.Button({ style_class: 'wp-day', reactive: true, can_focus: false, y_expand: true });
        fillActor(btn);
        btn.style = isToday && this.cfg_highlightToday
            ? 'background-color:' + rgba(t.accent, 0.16) + '; border:1px solid ' + rgba(t.accent, 0.7) + ';'
            : 'border:1px solid ' + rgba(this.cfg_borderColor, 0.35) + ';';
        btn.connect('clicked', function () { this._openEditor(null, date); }.bind(this));
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
            const btn = this._dayButton(date, date === todayStr);
            btn.set_width(colW);
            const col = new St.BoxLayout({ vertical: true, style: 'spacing:' + (this.cfg_compact ? 2 : 4) + 'px;' });
            col.add_actor(this._dayHeader(i, date, date === todayStr, false));
            occ.days[i].forEach(function (o) { col.add_actor(this._makeItem(o)); }, this);
            btn.set_child(col);
            cols.add_actor(btn);
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
            const btn = this._dayButton(date, date === todayStr);
            const row = new St.BoxLayout({ style: 'spacing:8px;' });
            row.add_actor(this._dayHeader(i, date, date === todayStr, true));
            const list = new St.BoxLayout({ vertical: true, x_expand: true, style: 'spacing:' + (this.cfg_compact ? 2 : 4) + 'px;' });
            occ.days[i].forEach(function (o) { list.add_actor(this._makeItem(o)); }, this);
            row.add_actor(list);
            btn.set_child(row);
            rows.add_actor(btn);
        }
        this._body.add_actor(rows);
    },

    _colorOf: function (f) {
        return f.color || this._theme.accent;
    },

    _makeItem: function (o) {
        const t = this._theme, f = o.f, compact = !!this.cfg_compact;
        const color = this._colorOf(f);
        const ds = this.cfg_doneStyle;
        const btn = new St.Button({ reactive: true, can_focus: false, x_expand: true });
        fillActor(btn);
        const edge = f.important ? t.imp : color;
        btn.style = 'border-left:' + this._px(3) + 'px solid ' + edge + '; border-radius:4px; background-color:' +
            rgba(color, f.important ? 0.30 : 0.17) + '; padding:' + (compact ? this._px(1) + 'px ' + this._px(4) + 'px' : this._px(4) + 'px ' + this._px(6) + 'px') + ';' +
            (f.important ? ' border-top:1px solid ' + rgba(t.imp, 0.6) + '; border-bottom:1px solid ' + rgba(t.imp, 0.6) + ';' : '');
        if (o.done && (ds === 'dim' || ds === 'both')) btn.opacity = 120;

        const row = new St.BoxLayout({ style: 'spacing:4px;' });
        const chk = new St.Button({ label: o.done ? '☑' : '☐', reactive: true, can_focus: false });
        chk.style = 'padding:0 2px; color:' + t.text + ';';
        chk.connect('clicked', function () {
            Model.toggleDone(this.data, o);
            this._changed();
        }.bind(this));
        row.add_actor(chk);

        const col = new St.BoxLayout({ vertical: true, x_expand: true });
        const strike = o.done && (ds === 'strike' || ds === 'both');
        const title = new St.Label({
            text: (f.important ? '★ ' : '') + trunc(f.title, compact ? 60 : 120),
            style: (f.important ? 'font-weight:bold; ' : '') + (strike ? 'text-decoration:line-through; ' : '')
        });
        const ct = title.clutter_text;
        if (compact) { ct.set_line_wrap(false); ct.set_ellipsize(Pango.EllipsizeMode.END); }
        else { ct.set_line_wrap(true); ct.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR); ct.set_ellipsize(Pango.EllipsizeMode.NONE); }
        col.add_actor(title);

        const small = 'font-size:' + Math.round(t.fs * 0.85) + 'px; opacity:200;';
        const meta = [];
        if (f.due) { const d = parseIso(f.due); if (d) meta.push(this._L().dueLabel(d.getDate(), this._L().monthsS[d.getMonth()])); }
        if (meta.length) {
            const ml = new St.Label({ text: meta.join(' · '), style: small });
            ml.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            col.add_actor(ml);
        }
        if (!compact && f.notes) {
            const first = trunc(f.notes.split('\n')[0], 70);
            const nl = new St.Label({ text: first, style: small });
            nl.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            col.add_actor(nl);
        }
        row.add_actor(col);
        btn.set_child(row);
        btn.connect('clicked', function () { this._openEditor(o, o.date); }.bind(this));
        return btn;
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

    _choose: function (title, message, options) {
        const dlg = this._newDialog(title);
        const lbl = new St.Label({ text: message, style: 'padding:6px 0; max-width:360px;' });
        lbl.clutter_text.set_line_wrap(true);
        dlg.contentLayout.add_actor(lbl);
        const buttons = options.map(function (o) {
            return { label: o.label, action: function () { dlg.close(); o.run(); } };
        });
        buttons.push({ label: this._t('cancel'), action: function () { dlg.close(); }, key: Clutter.KEY_Escape });
        dlg.setButtons(buttons);
        dlg.open();
    },

    /* o = occurrence (edit) or null (new); dateStr = date for a new entry */
    _openEditor: function (o, dateStr) {
        const self = this;
        const f = o ? o.f : { title: '', notes: '', color: null, important: false, due: '' };
        const st = {
            repeat: o ? o.item.kind === 'weekly' : false,
            color: f.color || null,
            important: !!f.important
        };
        const dlg = this._newDialog(o ? this._t('editEntry') : this._t('newEntry'));
        const L = dlg.contentLayout;

        const titleE = mkEntry(f.title, this._t('hintTitle'));
        L.add_actor(field(this._t('fTitle'), titleE));

        const notesE = mkEntry(f.notes, this._t('hintNotes'));
        notesE.clutter_text.set_single_line_mode(false);
        notesE.clutter_text.set_activatable(false);
        notesE.clutter_text.set_line_wrap(true);
        notesE.style = 'min-width:280px; min-height:48px;';
        L.add_actor(field(this._t('fNotes'), notesE));

        const colOpts = [{ label: this._t('colorDefault'), value: null }].concat(PALETTE.map(function (c) {
            return { label: '', value: c, color: c, swatch: true };
        }));
        L.add_actor(field(this._t('fColor'), chipRow(colOpts, function () { return st.color; }, function (v) { st.color = v; }, 6)));

        // date
        const dateBox = new St.BoxLayout({ style: 'spacing:6px;' });
        const dateE = mkEntry(o ? o.date : dateStr, this._t('hintDate'), 130);
        const wdL = new St.Label({ text: '', y_align: Clutter.ActorAlign.CENTER, style: 'min-width:80px;' });
        const refreshWd = function () {
            const d = parseIso(dateE.get_text().trim());
            wdL.set_text(d ? this._L().days[wd(d)] : this._t('invalidDate'));
        };
        const shift = function (n) {
            const d = parseIso(dateE.get_text().trim()) || parseIso(o ? o.date : dateStr);
            dateE.set_text(iso(addDays(d, n)));
            refreshWd();
        };
        const mkBtn = function (label, cb) {
            const b = new St.Button({ label: label, reactive: true, can_focus: true, style: chipStyle(false) });
            b.connect('clicked', cb);
            return b;
        };
        dateBox.add_actor(mkBtn('−', function () { shift(-1); }));
        dateBox.add_actor(dateE);
        dateBox.add_actor(mkBtn('+', function () { shift(1); }));
        dateBox.add_actor(wdL);
        dateE.clutter_text.connect('text-changed', refreshWd);
        refreshWd();
        L.add_actor(field(this._t('fDate'), dateBox));

        L.add_actor(field(this._t('fRepeat'), chipRow([
            { label: this._t('repeatOnce'), value: false },
            { label: this._t('repeatWeekly'), value: true }
        ], function () { return st.repeat; }, function (v) { st.repeat = v; }, 2)));

        const dueE = mkEntry(f.due, this._t('hintDue'), 180);
        L.add_actor(field(this._t('fDue'), dueE));

        L.add_actor(field(this._t('fPriority'), chipRow([
            { label: this._t('normal'), value: false },
            { label: this._t('important'), value: true, color: this._theme.imp }
        ], function () { return st.important; }, function (v) { st.important = v; }, 2)));

        const errL = new St.Label({ text: '', style: 'color:#ff7b72; padding-top:6px;' });
        L.add_actor(errL);

        const onSave = function () {
            const err = function (m) { errL.set_text(m); };
            const title = titleE.get_text().trim();
            if (!title) return err(self._t('errTitle'));
            const date = dateE.get_text().trim();
            if (!parseIso(date)) return err(self._t('errDate'));
            const due = dueE.get_text().trim();
            if (due && !parseIso(due)) return err(self._t('errDue'));
            const fields = {
                title: title.slice(0, 200), notes: notesE.get_text().trim().slice(0, 2000),
                color: st.color, important: st.important, due: due
            };
            dlg.close();
            self._later(function () { self._commitEdit(o, fields, date, st.repeat); });
        };

        const buttons = [];
        if (o) buttons.push({ label: self._t('del'), action: function () { dlg.close(); self._later(function () { self._confirmDelete(o); }); } });
        buttons.push({ label: self._t('cancel'), action: function () { dlg.close(); }, key: Clutter.KEY_Escape });
        buttons.push({ label: self._t('save'), action: onSave });
        dlg.setButtons(buttons);
        dlg.open();
        try { dlg.setInitialKeyFocus(titleE); } catch (e) { /* not available in older versions */ }
    },

    _commitEdit: function (o, fields, date, repeat) {
        const self = this;
        if (!o) {
            Model.create(this.data, fields, date, repeat);
            this._changed();
            return;
        }
        if (o.item.kind === 'weekly') {
            this._choose(this._t('weeklyEntry'), this._t('applyWhere'), [
                { label: self._t('thisWeek'), run: function () { Model.edit(self.data, o, fields, date, repeat, 'this'); self._changed(); } },
                { label: self._t('thisAndFuture'), run: function () { Model.edit(self.data, o, fields, date, repeat, 'future'); self._changed(); } }
            ]);
        } else {
            Model.edit(this.data, o, fields, date, repeat, 'this');
            this._changed();
        }
    },

    _confirmDelete: function (o) {
        const self = this;
        if (o.item.kind === 'weekly') {
            this._choose(this._t('delWeekly'), this._t('whatToDo')(trunc(o.f.title, 50)), [
                { label: self._t('delThisWeek'), run: function () { Model.remove(self.data, o, 'this'); self._changed(); } },
                { label: self._t('endFromNow'), run: function () { Model.remove(self.data, o, 'future'); self._changed(); } }
            ]);
        } else {
            this._choose(this._t('delEntry'), this._t('confirmDel')(trunc(o.f.title, 50)), [
                { label: self._t('del'), run: function () { Model.remove(self.data, o, 'this'); self._changed(); } }
            ]);
        }
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