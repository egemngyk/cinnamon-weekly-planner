global.imports = new Proxy({}, { get: function () { return new Proxy(function(){}, { get: function(){ return new Proxy(function(){}, {get:function(){return function(){}}}); } }); } });
global.global = { logError: console.error };
const assert = require('assert');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../weekly-planner@egemngyk');
const code = fs.readFileSync(path.join(dir, 'desklet.js'), 'utf8');
const src = code + '\nmodule.exports = { Model, iso, parseIso, addDays, mondayOf, today, formatRange, longDate, readable, resolveColor, PALETTE };';
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const { Model, parseIso, addDays, iso, mondayOf, today, formatRange, longDate, resolveColor, PALETTE } = mod.exports;
const wk = d => parseIso(d);
const f = (title, extra) => Object.assign({ title: title, notes: '', color: '', important: false, todo: false }, extra || {});
const day = (data, date) => (data.days[date] || []).map(e => e.title + (e.done ? '✓' : ''));
const week = (data, mon) => Model.week(data, wk(mon)).days.map(l => l.map(e => e.title).join(','));

assert.strictEqual(parseIso('2026-11-02').getDay(), 1); // Monday

/* ---- add: always at the bottom of the day ---- */
let d = Model.defaults();
const a = Model.add(d, '2026-11-02', f('A'));
const b = Model.add(d, '2026-11-02', f('B', { todo: true, important: true, color: '#e5534b' }));
const c = Model.add(d, '2026-11-02', f('C'));
Model.add(d, '2026-11-04', f('Exam'));
assert.deepStrictEqual(day(d, '2026-11-02'), ['A', 'B', 'C']);
assert.deepStrictEqual(week(d, '2026-11-02'), ['A,B,C', '', 'Exam', '', '', '', '']);
assert.deepStrictEqual(week(d, '2026-11-09'), ['', '', '', '', '', '', '']);  // entries belong to a date, nothing repeats
assert.deepStrictEqual(week(d, '2026-10-26'), ['', '', '', '', '', '', '']);
assert.strictEqual(Model.add(d, '2026-11-02', f('   ')), null);                // empty title is rejected
assert.strictEqual(b.todo, true); assert.strictEqual(b.important, true); assert.strictEqual(b.color, '#e5534b');
assert.ok(a.id && a.id !== b.id && b.id !== c.id);

/* ---- done / update / remove ---- */
Model.toggleDone(b);
assert.deepStrictEqual(day(d, '2026-11-02'), ['A', 'B✓', 'C']);
Model.toggleDone(b);
assert.strictEqual(b.done, false);
Model.update(d, c, f('C2', { color: '#4f9dde', important: true }));
assert.strictEqual(c.title, 'C2'); assert.strictEqual(c.color, '#4f9dde'); assert.strictEqual(c.id, d.days['2026-11-02'][2].id);
Model.update(d, c, f('', {}));                                                    // invalid update is ignored
assert.strictEqual(c.title, 'C2');
Model.remove(d, a.id);
assert.deepStrictEqual(day(d, '2026-11-02'), ['B', 'C2']);
Model.remove(d, 'nope');
Model.remove(d, d.days['2026-11-04'][0].id);
assert.deepStrictEqual(Object.keys(d.days), ['2026-11-02']);                      // empty days are dropped

/* ---- drag & drop ordering ---- */
d = Model.defaults();
['A', 'B', 'C', 'D'].forEach(t => Model.add(d, '2026-11-02', f(t)));
const id = t => d.days['2026-11-02'].find(e => e.title === t).id;
assert.strictEqual(Model.move(d, id('A'), '2026-11-02', 0), false);               // dropped where it was
assert.strictEqual(Model.move(d, id('A'), '2026-11-02', 2), true);                // A after C (others = B,C,D)
assert.deepStrictEqual(day(d, '2026-11-02'), ['B', 'C', 'A', 'D']);
assert.strictEqual(Model.move(d, id('D'), '2026-11-02', 0), true);
assert.deepStrictEqual(day(d, '2026-11-02'), ['D', 'B', 'C', 'A']);
assert.strictEqual(Model.move(d, id('D'), '2026-11-02', 99), true);               // clamped to the end
assert.deepStrictEqual(day(d, '2026-11-02'), ['B', 'C', 'A', 'D']);
assert.strictEqual(Model.move(d, id('D'), '2026-11-02', -5), true);               // clamped to the start
assert.deepStrictEqual(day(d, '2026-11-02'), ['D', 'B', 'C', 'A']);
const idB = id('B');
assert.strictEqual(Model.move(d, idB, '2026-11-05', 0), true);                    // to another day
assert.deepStrictEqual(day(d, '2026-11-02'), ['D', 'C', 'A']);
assert.deepStrictEqual(day(d, '2026-11-05'), ['B']);
assert.strictEqual(d.days['2026-11-05'][0].id, idB);                              // same entry (id kept)
Model.toggleDone(d.days['2026-11-05'][0]);
Model.move(d, idB, '2026-11-02', 1);
assert.deepStrictEqual(day(d, '2026-11-02'), ['D', 'B✓', 'C', 'A']);              // state moves with the entry
assert.deepStrictEqual(Object.keys(d.days), ['2026-11-02']);
assert.strictEqual(Model.move(d, 'nope', '2026-11-02', 0), false);

/* ---- v3 normalize: round trip + corrupt data ---- */
const rt = Model.normalize(JSON.parse(JSON.stringify(d)));
assert.deepStrictEqual(rt.days, d.days);
const bad = Model.normalize({ version: 3, days: { '2026-13-45': [{ title: 'x' }], '2026-11-02': [{ title: 'ok', id: 'a', color: 'zzz', todo: 'true' }, { foo: 1 }, null], '2026-11-03': 'no', '2026-11-04': [] },
    ui: { weekOffset: 99999, selected: 'junk' } });
assert.deepStrictEqual(Object.keys(bad.days), ['2026-11-02']);
assert.strictEqual(bad.days['2026-11-02'].length, 1);
assert.strictEqual(bad.days['2026-11-02'][0].color, '');
assert.strictEqual(bad.days['2026-11-02'][0].todo, true);
assert.strictEqual(bad.ui.weekOffset, 5000);
assert.strictEqual(bad.ui.selected, null);
assert.strictEqual(Model.normalize({ version: 3, ui: { selected: '2026-11-03' } }).ui.selected, '2026-11-03');
assert.deepStrictEqual(Model.normalize(null).days, {});
assert.deepStrictEqual(Model.normalize('x').days, {});
assert.ok(!JSON.stringify(Model.normalize({ version: 3, days: { '2026-11-02': [Object.assign(f('t'), { due: '2026-11-04' })] } })).includes('due'));  // no due dates

/* ---- colors ---- */
assert.strictEqual(resolveColor('Blue'), '#4f9dde');
assert.strictEqual(resolveColor('#F80'), '#ff8800');
assert.strictEqual(resolveColor('nonsense'), null);
PALETTE.forEach(p => assert.strictEqual(resolveColor(p), p));

/* ---- migration of old files ---- */
const mon = mondayOf(today()), M0 = iso(mon), M1 = iso(addDays(mon, 7)), M2 = iso(addDays(mon, 14));
const mk = n => iso(addDays(mon, n));
// version 2: weekly lists, per-week lists, done state, skipped dates, hidden from/to
const v2 = {
    version: 2, ui: { weekOffset: 2, editWeek: M0 },
    weekly: [[{ id: 'm', title: 'Math', notes: 'n', color: 'red', important: false, todo: true, due: '2026-12-01' }], [], [{ id: 'g', title: 'Gym', todo: false, skipDates: [iso(addDays(mon, 16))] }], [], [], [], []],
    weeks: { [M1]: [[], [{ id: 'h', title: 'Homework', todo: true }], [], [], [], [], []] },
    occ: { ['m|' + M1]: { done: true }, ['h|' + iso(addDays(mon, 8))]: { done: true } }
};
const m2 = Model.normalize(v2);
assert.strictEqual(m2.version, 3);
assert.strictEqual(m2.ui.weekOffset, 2);
assert.ok(!('due' in m2.days[M0][0]));
assert.deepStrictEqual(day(m2, M0), ['Math']);
assert.deepStrictEqual(day(m2, M1), ['Math✓']);                                    // done state of the occurrence is kept
assert.deepStrictEqual(day(m2, iso(addDays(mon, 8))), ['Homework✓']);                // one-week entry on Tuesday of next week
assert.strictEqual(m2.days[M0][0].color, '#e5534b');                               // color names become hex
assert.ok(day(m2, iso(addDays(mon, 7 * 30))).includes('Math'));                    // repeats are copied ~a year ahead
assert.ok(!day(m2, iso(addDays(mon, 7 * 80))).includes('Math'));                   // ... but not forever
assert.ok(!day(m2, iso(addDays(mon, 16))).includes('Gym'));                        // skipped date stays skipped
assert.ok(day(m2, iso(addDays(mon, 2))).includes('Gym'));
// version 1: once + weekly rules with exceptions
const v1 = {
    version: 1, ui: { weekOffset: 3 },
    items: [
        { id: 'w1', kind: 'weekly', weekday: 0, startDate: M0, endDate: M2, title: 'Math', notes: '', color: null, important: false, due: '' },
        { id: 'o1', kind: 'once', date: mk(2), title: 'History exam', notes: '', color: null, important: true, due: '' },
        { id: 'bad', kind: 'once', date: '2026-13-45', title: 'x' }
    ],
    occ: { ['w1|' + M1]: { skip: true }, ['w1|' + M2]: { over: { title: 'Math (extra)', notes: '', color: null, important: false, due: '' }, done: true }, ['o1|' + mk(2)]: { done: true } }
};
const m1 = Model.normalize(v1);
assert.strictEqual(m1.version, 3);
assert.strictEqual(m1.ui.weekOffset, 3);
assert.deepStrictEqual(day(m1, M0), ['Math']);
assert.deepStrictEqual(day(m1, M1), []);                                           // skipped
assert.deepStrictEqual(day(m1, M2), ['Math (extra)✓']);                            // edited occurrence
assert.deepStrictEqual(day(m1, iso(addDays(mon, 21))), []);                        // endDate respected
assert.deepStrictEqual(day(m1, mk(2)), ['History exam✓']);
assert.strictEqual(m1.days[mk(2)][0].important, true);
assert.strictEqual(m1.days[M0][0].todo, true);
assert.strictEqual(m1.ui.selected, null);

/* ---- week range / long date format ---- */
assert.strictEqual(formatRange(wk('2026-11-02'), 'long'), 'November 2–8, 2026');
assert.strictEqual(formatRange(wk('2026-11-02'), 'short', 'en'), 'Nov 2–8, 2026');
assert.strictEqual(formatRange(wk('2026-09-28'), 'long', 'en'), 'September 28 – October 4, 2026');
assert.strictEqual(formatRange(wk('2026-12-28'), 'long', 'en'), 'December 28, 2026 – January 3, 2027');
assert.strictEqual(formatRange(wk('2026-11-02'), 'numeric', 'en'), '11/02/2026 – 11/08/2026');
assert.strictEqual(formatRange(wk('2026-11-02'), 'long', 'tr'), '2–8 Kasım 2026');
assert.strictEqual(formatRange(wk('2026-12-28'), 'long', 'tr'), '28 Aralık 2026 – 3 Ocak 2027');
assert.strictEqual(formatRange(wk('2026-11-02'), 'numeric', 'tr'), '02.11.2026 – 08.11.2026');
assert.strictEqual(longDate(wk('2026-11-02'), 'en'), 'Monday · November 2, 2026');
assert.strictEqual(longDate(wk('2026-11-02'), 'tr'), 'Pazartesi · 2 Kasım 2026');
assert.strictEqual(iso(addDays(wk('2026-03-23'), 7)), '2026-03-30');               // DST week

/* ---- settings schema is consistent with the code ---- */
const schema = JSON.parse(fs.readFileSync(path.join(dir, 'settings-schema.json'), 'utf8'));
const inLayout = new Set();
schema.layout.pages.forEach(p => schema.layout[p].sections.forEach(s => schema.layout[s].keys.forEach(k => inLayout.add(k))));
Object.keys(schema).forEach(k => { if (k !== 'layout') assert.ok(inLayout.has(k), 'key not in layout: ' + k); });
inLayout.forEach(k => assert.ok(schema[k], 'layout key missing in schema: ' + k));
assert.ok(!Object.keys(schema).some(k => /(?:^|\b)due(?:$|\b)|showDue/i.test(k)), 'leftover due-date keys in schema');
const cfg = /const CFG_KEYS = \[([\s\S]*?)\];/.exec(code)[1].match(/'(\w+)'/g).map(x => x.slice(1, -1));
cfg.forEach(k => assert.ok(schema[k], 'CFG key without schema entry: ' + k));
assert.ok(!/showDue|dueLabel|fDue|hintDue/.test(code), 'due date code left over');

console.log('ALL TESTS PASSED');