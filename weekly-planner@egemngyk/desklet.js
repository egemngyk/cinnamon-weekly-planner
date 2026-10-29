/* Haftalık Planlayıcı — Cinnamon desklet
 *
 * Mimari:
 *  - Model: GI'ya bağımlı olmayan saf veri/tekrar mantığı (node ile test edilebilir).
 *  - PlannerDesklet: Cinnamon arayüzü, ayarlar ve depolama.
 *
 * Her desklet örneği (desklet_id) kendi ayar dosyasını (Cinnamon yönetir) ve kendi
 * veri dosyasını kullanır: ~/.local/share/weekly-planner-desklet/<desklet_id>.json
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

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_S = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DAYS_S = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const PALETTE = ['#4f9dde', '#e5534b', '#e0a030', '#8e6ad8', '#3fb0a0', '#7f8c9a', '#d9609a', '#6ab04c', '#e67e22', '#2c3e50'];
const FIELDS = ['title', 'notes', 'color', 'important', 'due'];

/* ------------------------------------------------------------------ */
/* Tarih / renk yardımcıları                                           */
/* ------------------------------------------------------------------ */

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseIso(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], 12); // öğlen: DST kaymalarından korunur
    return iso(d) === s ? d : null;
}
function addDays(d, n) { const r = new Date(d.getTime()); r.setDate(r.getDate() + n); return r; }
function wd(d) { return (d.getDay() + 6) % 7; } // Pazartesi = 0
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
/* Seçilen renk arka planda okunmuyorsa siyah/beyaza düşer. */
function readable(fg, bg) {
    const a = lum(parseColor(fg)), b = lum(parseColor(bg));
    const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (r >= 3.2) return fg;
    return b > 0.4 ? 'rgb(20,20,24)' : 'rgb(245,245,250)';
}

function formatRange(s, fmt) {
    const e = addDays(s, 6);
    const sy = s.getFullYear(), ey = e.getFullYear(), sm = s.getMonth(), em = e.getMonth();
    if (fmt === 'numeric') {
        return pad(s.getDate()) + '.' + pad(sm + 1) + '.' + sy + ' – ' + pad(e.getDate()) + '.' + pad(em + 1) + '.' + ey;
    }
    const names = fmt === 'short' ? MONTHS_S : MONTHS;
    if (sy === ey && sm === em) return s.getDate() + '–' + e.getDate() + ' ' + names[em] + ' ' + ey;
    if (sy === ey) return s.getDate() + ' ' + names[sm] + ' – ' + e.getDate() + ' ' + names[em] + ' ' + ey;
    return s.getDate() + ' ' + names[sm] + ' ' + sy + ' – ' + e.getDate() + ' ' + names[em] + ' ' + ey;
}

/* ------------------------------------------------------------------ */
/* Model: tekrar kuralları ve istisnalar                               */
/* ------------------------------------------------------------------ */
/*
 * data = {
 *   version: 1,
 *   ui: { weekOffset },
 *   items: [
 *     {id, kind:'once',   date,                       ...FIELDS},
 *     {id, kind:'weekly', weekday, startDate, endDate, ...FIELDS}   // endDate: dahil, null = süresiz
 *   ],
 *   occ: { "<itemId>|<YYYY-MM-DD>": { done?, skip?, over?: {...FIELDS} } }   // tekrar başına istisna
 * }
 * Tamamlanma durumu, atlama ve değişiklik "kural"a değil o tarihteki örneğe bağlıdır.
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

    /* Bozuk/eksik veriye karşı koruyucu normalizasyon. */
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

    /* Bir kaydın belirli bir tarihteki örneği (istisnalar uygulanmış). */
    occurrence: function (data, it, date) {
        const key = it.id + '|' + date;
        const x = data.occ[key] || {};
        if (x.skip) return null;
        const f = Object.assign({}, it);
        if (x.over) Object.assign(f, x.over);
        return { item: it, date: date, key: key, f: f, done: !!x.done };
    },

    /* start (pazartesi) ile başlayan 7 günün örnekleri. */
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

    /* scope: 'this' (yalnızca bu örnek) | 'future' (bu ve sonraki haftalar) — yalnızca haftalık kayıtlar için. */
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
        // --- haftalık kayıt ---
        if (scope === 'this') {
            if (repeat && date === o.date) {
                const x = data.occ[o.key] || {};
                x.over = f;
                data.occ[o.key] = x;
            } else {
                // bu örnek başka güne taşındı / tekrar kapatıldı: örneği atla, tek seferlik kayıt oluştur
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
        // cut tarihinden sonraki istisnaları yeni seriye taşı (gün değiştiyse at)
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
/* Arayüz yardımcıları                                                  */
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

function mkEntry(text, hint, width) {
    return new St.Entry({ text: text || '', hint_text: hint || '', can_focus: true, style: 'min-width:' + (width || 280) + 'px;' });
}

/* ------------------------------------------------------------------ */
/* Desklet                                                              */
/* ------------------------------------------------------------------ */

const CFG_KEYS = ['layoutMode', 'compact', 'highlightToday', 'doneStyle', 'width', 'height', 'fontSize',
    'bgColor', 'textColor', 'accentColor', 'dayHeaderColor', 'borderColor', 'importantColor',
    'opacity', 'borderWidth', 'borderRadius', 'dateFormat', 'headerStyle'];

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

    /* ---------------- depolama ---------------- */

    _dataPath: function () { return GLib.build_filenamev([DATA_DIR, this.instanceId + '.json']); },

    _loadData: function () {
        const path = this._dataPath();
        const tryRead = function (p) {
            if (!GLib.file_test(p, GLib.FileTest.EXISTS)) return undefined;
            try { return JSON.parse(Cinnamon.get_file_contents_utf8_sync(p)); } catch (e) { return null; }
        };
        let raw = tryRead(path);
        if (raw === null) { // bozuk dosya: kenara al, yedeği dene
            try {
                Gio.File.new_for_path(path).move(Gio.File.new_for_path(path + '.corrupt-' + Date.now()),
                    Gio.FileCopyFlags.OVERWRITE, null, null);
            } catch (e) { global.logError('[weekly-planner] bozuk dosya taşınamadı: ' + e); }
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
            // replace_contents: geçici dosya + rename (atomik); make_backup=true -> "<dosya>~" yedeği
            f.replace_contents(JSON.stringify(this.data), null, true, Gio.FileCreateFlags.NONE, null);
        } catch (e) {
            global.logError('[weekly-planner] kayıt hatası: ' + e);
        }
    },

    _changed: function () {
        this._scheduleSave();
        this._render();
    },

    /* ---------------- ayarlar / tema ---------------- */

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
            fs: this.cfg_fontSize
        };
        this._root.set_size(this.cfg_width, this.cfg_height);
        this._root.style = 'background-color:' + t.bg + '; border:' + this.cfg_borderWidth + 'px solid ' + t.border +
            '; border-radius:' + this.cfg_borderRadius + 'px; padding:8px; color:' + t.text + '; font-size:' + t.fs + 'px;';
        const navStyle = 'color:' + t.text + '; padding:2px 8px; border-radius:6px; font-size:' + Math.round(t.fs * 1.25) + 'px;';
        [this._btnPrev, this._btnNext, this._btnToday, this._btnAdd].forEach(function (b) { b.style = navStyle; });
        this._title.style = 'font-weight:bold; color:' + t.text + '; font-size:' + Math.round(t.fs * 1.1) + 'px;';
    },

    _setupMenu: function () {
        const self = this;
        const bump = function (key, delta, min, max) {
            const v = Math.max(min, Math.min(max, self['cfg_' + key] + delta));
            try { self.settings.setValue(key, v); } catch (e) { /* yut */ }
            self['cfg_' + key] = v;
            self._onCfgChanged();
        };
        try {
            this._menu.addAction('Genişlik +60', function () { bump('width', 60, 240, 2400); });
            this._menu.addAction('Genişlik −60', function () { bump('width', -60, 240, 2400); });
            this._menu.addAction('Yükseklik +60', function () { bump('height', 60, 160, 1600); });
            this._menu.addAction('Yükseklik −60', function () { bump('height', -60, 160, 1600); });
            this._menu.addAction('Bu haftaya git', function () { self._gotoWeek(0); });
        } catch (e) {
            global.logError('[weekly-planner] menü eklenemedi: ' + e);
        }
    },

    _checkDay: function () {
        const s = iso(today());
        if (s !== this._todayStr) { this._todayStr = s; this._render(); }
        return true;
    },

    /* ---------------- iskelet ---------------- */

    _buildUi: function () {
        this._root = new St.BoxLayout({ vertical: true });
        const head = new St.BoxLayout({ style: 'spacing:4px; padding-bottom:6px;' });
        const mk = function (label, cb) {
            const b = new St.Button({ label: label, reactive: true, can_focus: false, style_class: 'wp-nav' });
            b.connect('clicked', cb);
            return b;
        };
        this._btnPrev = mk('‹', function () { this._shiftWeek(-1); }.bind(this));
        this._btnNext = mk('›', function () { this._shiftWeek(1); }.bind(this));
        this._btnToday = mk('Bugün', function () { this._gotoWeek(0); }.bind(this));
        this._btnAdd = mk('＋', function () { this._openEditor(null, this._defaultNewDate()); }.bind(this));
        this._title = new St.Label({ text: '', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        head.add_actor(this._btnPrev);
        head.add_actor(this._title);
        head.add_actor(this._btnNext);
        head.add_actor(this._btnToday);
        head.add_actor(this._btnAdd);
        this._root.add_actor(head);

        this._scroll = new St.ScrollView({ x_expand: true, y_expand: true });
        this._scroll.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);
        this._body = new St.BoxLayout({ vertical: true });
        this._scroll.add_actor(this._body);
        this._root.add_actor(this._scroll);
        this.setContent(this._root);
    },

    _weekStart: function () { return addDays(mondayOf(today()), 7 * this.data.ui.weekOffset); },
    _shiftWeek: function (n) { this.data.ui.weekOffset += n; this._changed(); },
    _gotoWeek: function (off) { this.data.ui.weekOffset = off; this._changed(); },
    _defaultNewDate: function () {
        const s = this._weekStart(), t = today();
        const diff = Math.round((t.getTime() - s.getTime()) / 86400000);
        return iso(diff >= 0 && diff < 7 ? t : s);
    },

    /* ---------------- çizim ---------------- */

    _render: function () {
        try {
            this._todayStr = iso(today());
            const start = this._weekStart();
            this._title.set_text(formatRange(start, this.cfg_dateFormat));
            const occ = Model.occurrences(this.data, start);
            this._body.destroy_all_children();
            if (this.cfg_layoutMode === 'rows') this._renderRows(occ); else this._renderCols(occ);
        } catch (e) {
            global.logError('[weekly-planner] çizim hatası: ' + e);
            try {
                this._body.destroy_all_children();
                this._body.add_actor(new St.Label({ text: 'Görüntüleme hatası (günlüğe bakın).' }));
            } catch (e2) { /* yut */ }
        }
    },

    _dayButton: function (date, isToday) {
        const t = this._theme;
        const btn = new St.Button({ style_class: 'wp-day', reactive: true, can_focus: false, x_fill: true, y_fill: true, y_expand: true });
        btn.style = isToday && this.cfg_highlightToday
            ? 'background-color:' + rgba(t.accent, 0.16) + '; border:1px solid ' + rgba(t.accent, 0.7) + ';'
            : 'border:1px solid ' + rgba(this.cfg_borderColor, 0.35) + ';';
        btn.connect('clicked', function () { this._openEditor(null, date); }.bind(this));
        return btn;
    },

    _dayHeader: function (i, date, isToday, horizontalRow) {
        const t = this._theme, d = parseIso(date);
        const style = this.cfg_headerStyle;
        let name = '', sub = '';
        if (style === 'full') { name = DAYS[i]; sub = d.getDate() + ' ' + MONTHS_S[d.getMonth()]; }
        else if (style === 'short') { name = DAYS_S[i]; sub = '' + d.getDate(); }
        else if (style === 'name') { name = DAYS[i]; }
        else { name = DAYS_S[i]; sub = pad(d.getDate()) + '.' + pad(d.getMonth() + 1); }
        const color = (isToday && this.cfg_highlightToday) ? readable(t.accent, this.cfg_bgColor) : t.head;
        const box = new St.BoxLayout({ vertical: true, style: 'padding-bottom:3px;' });
        const l1 = new St.Label({ text: name, style: 'font-weight:bold; color:' + color + ';' });
        box.add_actor(l1);
        if (sub) box.add_actor(new St.Label({ text: sub, style: 'color:' + color + '; font-size:' + Math.round(t.fs * 0.85) + 'px; opacity:200;' }));
        if (horizontalRow) box.set_width(Math.round(t.fs * 7));
        return box;
    },

    _renderCols: function (occ) {
        const pad2 = 16 + 2 * this.cfg_borderWidth + 16; // iç dolgu + kaydırma çubuğu payı
        const gap = 4;
        const colW = Math.max(96, Math.floor((this.cfg_width - pad2 - 6 * gap) / 7));
        const cols = new St.BoxLayout({ style: 'spacing:' + gap + 'px;' });
        const todayStr = this._todayStr;
        for (let i = 0; i < 7; i++) {
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
        const rows = new St.BoxLayout({ vertical: true, style: 'spacing:4px;' });
        const todayStr = this._todayStr;
        for (let i = 0; i < 7; i++) {
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
        const btn = new St.Button({ reactive: true, can_focus: false, x_fill: true, x_expand: true });
        const edge = f.important ? t.imp : color;
        btn.style = 'border-left:3px solid ' + edge + '; border-radius:4px; background-color:' +
            rgba(color, f.important ? 0.30 : 0.17) + '; padding:' + (compact ? '1px 4px' : '4px 6px') + ';' +
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
        if (f.due) { const d = parseIso(f.due); if (d) meta.push('teslim ' + d.getDate() + ' ' + MONTHS_S[d.getMonth()]); }
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

    /* ---------------- diyaloglar ---------------- */

    _later: function (fn) {
        // bir ModalDialog kapanırken hemen yenisini açmamak için kısa gecikme
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
        buttons.push({ label: 'Vazgeç', action: function () { dlg.close(); }, key: Clutter.KEY_Escape });
        dlg.setButtons(buttons);
        dlg.open();
    },

    /* o = örnek (düzenleme) veya null (yeni); dateStr = yeni kayıt için tarih */
    _openEditor: function (o, dateStr) {
        const self = this;
        const f = o ? o.f : { title: '', notes: '', color: null, important: false, due: '' };
        const st = {
            repeat: o ? o.item.kind === 'weekly' : false,
            color: f.color || null,
            important: !!f.important
        };
        const dlg = this._newDialog(o ? 'Kaydı düzenle' : 'Yeni kayıt');
        const L = dlg.contentLayout;

        const titleE = mkEntry(f.title, 'Başlık');
        L.add_actor(field('Başlık', titleE));

        const notesE = mkEntry(f.notes, 'Açıklama / not (isteğe bağlı)');
        notesE.clutter_text.set_single_line_mode(false);
        notesE.clutter_text.set_activatable(false);
        notesE.clutter_text.set_line_wrap(true);
        notesE.style = 'min-width:280px; min-height:48px;';
        L.add_actor(field('Not', notesE));

        const colOpts = [{ label: 'Varsayılan', value: null }].concat(PALETTE.map(function (c) {
            return { label: '', value: c, color: c, swatch: true };
        }));
        L.add_actor(field('Renk', chipRow(colOpts, function () { return st.color; }, function (v) { st.color = v; }, 6)));

        // tarih
        const dateBox = new St.BoxLayout({ style: 'spacing:6px;' });
        const dateE = mkEntry(o ? o.date : dateStr, 'YYYY-AA-GG', 130);
        const wdL = new St.Label({ text: '', y_align: Clutter.ActorAlign.CENTER, style: 'min-width:80px;' });
        const refreshWd = function () {
            const d = parseIso(dateE.get_text().trim());
            wdL.set_text(d ? DAYS[wd(d)] : 'Geçersiz tarih');
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
        L.add_actor(field('Tarih', dateBox));

        L.add_actor(field('Tekrar', chipRow([
            { label: 'Yalnızca seçilen tarih', value: false },
            { label: 'Her hafta tekrarla', value: true }
        ], function () { return st.repeat; }, function (v) { st.repeat = v; }, 2)));

        const dueE = mkEntry(f.due, 'YYYY-AA-GG (isteğe bağlı)', 180);
        L.add_actor(field('Bitiş / teslim tarihi', dueE));

        L.add_actor(field('Önem', chipRow([
            { label: 'Normal', value: false },
            { label: '★ Önemli', value: true, color: this._theme.imp }
        ], function () { return st.important; }, function (v) { st.important = v; }, 2)));

        const errL = new St.Label({ text: '', style: 'color:#ff7b72; padding-top:6px;' });
        L.add_actor(errL);

        const onSave = function () {
            const err = function (m) { errL.set_text(m); };
            const title = titleE.get_text().trim();
            if (!title) return err('Başlık gerekli.');
            const date = dateE.get_text().trim();
            if (!parseIso(date)) return err('Tarih YYYY-AA-GG biçiminde olmalı.');
            const due = dueE.get_text().trim();
            if (due && !parseIso(due)) return err('Teslim tarihi YYYY-AA-GG biçiminde olmalı.');
            const fields = {
                title: title.slice(0, 200), notes: notesE.get_text().trim().slice(0, 2000),
                color: st.color, important: st.important, due: due
            };
            dlg.close();
            self._later(function () { self._commitEdit(o, fields, date, st.repeat); });
        };

        const buttons = [];
        if (o) buttons.push({ label: 'Sil', action: function () { dlg.close(); self._later(function () { self._confirmDelete(o); }); } });
        buttons.push({ label: 'İptal', action: function () { dlg.close(); }, key: Clutter.KEY_Escape });
        buttons.push({ label: 'Kaydet', action: onSave });
        dlg.setButtons(buttons);
        dlg.open();
        try { dlg.setInitialKeyFocus(titleE); } catch (e) { /* eski sürümlerde yok */ }
    },

    _commitEdit: function (o, fields, date, repeat) {
        const self = this;
        if (!o) {
            Model.create(this.data, fields, date, repeat);
            this._changed();
            return;
        }
        if (o.item.kind === 'weekly') {
            this._choose('Haftalık kayıt', 'Bu değişiklik nereye uygulansın?', [
                { label: 'Yalnızca bu hafta', run: function () { Model.edit(self.data, o, fields, date, repeat, 'this'); self._changed(); } },
                { label: 'Bu ve sonraki haftalar', run: function () { Model.edit(self.data, o, fields, date, repeat, 'future'); self._changed(); } }
            ]);
        } else {
            Model.edit(this.data, o, fields, date, repeat, 'this');
            this._changed();
        }
    },

    _confirmDelete: function (o) {
        const self = this;
        if (o.item.kind === 'weekly') {
            this._choose('Haftalık kaydı sil', '“' + trunc(o.f.title, 50) + '” için ne yapılsın?', [
                { label: 'Yalnızca bu haftayı sil', run: function () { Model.remove(self.data, o, 'this'); self._changed(); } },
                { label: 'Bu haftadan itibaren sonlandır', run: function () { Model.remove(self.data, o, 'future'); self._changed(); } }
            ]);
        } else {
            this._choose('Kaydı sil', '“' + trunc(o.f.title, 50) + '” silinsin mi?', [
                { label: 'Sil', run: function () { Model.remove(self.data, o, 'this'); self._changed(); } }
            ]);
        }
    },

    /* ---------------- yaşam döngüsü ---------------- */

    on_desklet_removed: function () {
        if (this._dayTimer) { Mainloop.source_remove(this._dayTimer); this._dayTimer = null; }
        if (this._cfgIdle) { Mainloop.source_remove(this._cfgIdle); this._cfgIdle = null; }
        if (this._saveTimer) { Mainloop.source_remove(this._saveTimer); this._saveTimer = null; }
        this._saveNow(); // bekleyen değişikliği yaz; veri dosyasına bilerek dokunulmaz (yeniden yüklemede kayıp olmasın)
        try { this.settings.finalize(); } catch (e) { /* yut */ }
    }
};

function main(metadata, desklet_id) {
    return new PlannerDesklet(metadata, desklet_id);
}