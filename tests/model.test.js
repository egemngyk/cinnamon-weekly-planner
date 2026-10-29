global.imports = new Proxy({}, { get: function () { return new Proxy(function(){}, { get: function(){ return new Proxy(function(){}, {get:function(){return function(){}}}); } }); } });
global.global = { logError: console.error };
const assert = require('assert');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../weekly-planner@egemngyk/desklet.js'), 'utf8') +
    '\nmodule.exports = { Model, iso, parseIso, addDays, mondayOf, formatRange, readable, resolveColor };';
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const { Model, parseIso, addDays, iso, formatRange, resolveColor } = mod.exports;
const wk = d => parseIso(d); // Monday dates
const titles = (data, mon) => Model.occurrences(data, wk(mon)).days.map(l => l.map(o => o.f.title + (o.done ? '✓' : '')).join(','));
const row = (title, extra) => Object.assign({ title, notes: '', todo: false, important: false, color: '', due: '' }, extra || {});
const rowsOf = list => list.map(Model.fieldsToRow);

// Nov 2, 2026 = Monday
assert.strictEqual(parseIso('2026-11-02').getDay(), 1);

/* ---- weekly lists ---- */
let d = Model.defaults();
assert.ok(Model.applyRows(d, null, 0, [row('Math', { todo: true })]));
assert.ok(Model.applyRows(d, null, 2, [row('Gym'), row('Read', { important: true, color: 'red' })]));
assert.deepStrictEqual(titles(d, '2026-11-02'), ['Math', '', 'Gym,Read', '', '', '', '']);
assert.deepStrictEqual(titles(d, '2027-03-01').slice(0, 3), ['Math', '', 'Gym,Read']); // repeats forever, any week
assert.deepStrictEqual(titles(d, '2025-01-06').slice(0, 1), ['Math']);                 // and backwards
assert.strictEqual(Model.applyRows(d, null, 0, rowsOf(d.weekly[0])), false);          // unchanged rows -> no-op
const mathId = d.weekly[0][0].id;
assert.strictEqual(d.weekly[0][0].todo, true);

/* ---- specific week lists ---- */
assert.ok(Model.applyRows(d, '2026-11-09', 1, [row('Homework due', { due: '2026-11-10' })]));
assert.deepStrictEqual(titles(d, '2026-11-09'), ['Math', 'Homework due', 'Gym,Read', '', '', '', '']);
assert.deepStrictEqual(titles(d, '2026-11-02'), ['Math', '', 'Gym,Read', '', '', '', '']);   // other weeks untouched
assert.deepStrictEqual(titles(d, '2026-11-16'), ['Math', '', 'Gym,Read', '', '', '', '']);
assert.deepStrictEqual(Object.keys(d.weeks), ['2026-11-09']);
// emptying a week list removes the week bucket
assert.ok(Model.applyRows(d, '2026-11-09', 1, []));
assert.deepStrictEqual(Object.keys(d.weeks), []);
assert.strictEqual(Model.applyRows(d, '2026-11-09', 1, []), false);
assert.deepStrictEqual(Object.keys(d.weeks), []);

/* ---- done state ---- */
let o = Model.occurrences(d, wk('2026-11-09')).days[0][0];
Model.toggleDone(d, o);
assert.strictEqual(titles(d, '2026-11-09')[0], 'Math✓');
assert.strictEqual(titles(d, '2026-11-02')[0], 'Math');   // only that week's occurrence
assert.strictEqual(titles(d, '2026-11-16')[0], 'Math');
// rename keeps id and done state
assert.ok(Model.applyRows(d, null, 0, [row('Math II', { todo: true })]));
assert.strictEqual(d.weekly[0][0].id, mathId);
assert.strictEqual(titles(d, '2026-11-09')[0], 'Math II✓');
// editing another field keeps done state, reordering keeps ids
Model.applyRows(d, null, 2, [row('Read', { important: true, color: 'red' }), row('Gym')]);
assert.deepStrictEqual(titles(d, '2026-11-02')[2], 'Read,Gym');
const gym = d.weekly[2].find(e => e.title === 'Gym').id, read = d.weekly[2].find(e => e.title === 'Read').id;
Model.toggleDone(d, Model.occurrences(d, wk('2026-11-02')).days[2][1]);
Model.applyRows(d, null, 2, [row('Gym'), row('Read', { important: true, color: 'red' })]);
assert.strictEqual(d.weekly[2].find(e => e.title === 'Gym').id, gym);
assert.strictEqual(d.weekly[2].find(e => e.title === 'Read').id, read);
assert.strictEqual(titles(d, '2026-11-02')[2], 'Gym✓,Read');
// deleting an entry drops its done state
Model.applyRows(d, null, 2, [row('Read', { important: true, color: 'red' })]);
assert.ok(!Object.keys(d.occ).some(k => k.indexOf(gym + '|') === 0));
// adding an entry creates a new id, existing ones stay
Model.applyRows(d, null, 2, [row('Read', { important: true, color: 'red' }), row('New one')]);
assert.strictEqual(d.weekly[2][0].id, read);
assert.notStrictEqual(d.weekly[2][1].id, read);
// duplicate titles are matched in order
Model.applyRows(d, null, 4, [row('Dup'), row('Dup', { notes: 'second' })]);
const ids = d.weekly[4].map(e => e.id);
Model.applyRows(d, null, 4, [row('Dup'), row('Dup', { notes: 'second changed' })]);
assert.deepStrictEqual(d.weekly[4].map(e => e.id), ids);

/* ---- row normalization ---- */
const f = Model.rowToFields({ title: '  ', notes: 5, todo: 'true', important: 'false', color: ' Red ', due: '2026-13-45' });
assert.deepStrictEqual(f, { title: 'Untitled', notes: '5', todo: true, important: false, color: 'Red', due: '' });
assert.strictEqual(Model.rowToFields(null).title, 'Untitled');

/* ---- colors ---- */
assert.strictEqual(resolveColor('Blue'), '#4f9dde');
assert.strictEqual(resolveColor('kırmızı'), '#e5534b');
assert.strictEqual(resolveColor('#F80'), '#ff8800');
assert.strictEqual(resolveColor('#12ab9f'), '#12ab9f');
assert.strictEqual(resolveColor('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
assert.strictEqual(resolveColor(''), null);
assert.strictEqual(resolveColor('nonsense'), null);

/* ---- normalize: v2 round trip + corrupt data ---- */
const rt = Model.normalize(JSON.parse(JSON.stringify(d)));
assert.deepStrictEqual(rt.weekly, d.weekly);
assert.deepStrictEqual(rt.occ, d.occ);
const bad = Model.normalize({ version: 2, weekly: 'x', weeks: { '2026-11-03': [[{ title: 'x', id: 'a' }]], nope: 1 }, occ: 5, ui: { weekOffset: 'x', editWeek: '2026-11-03' } });
assert.deepStrictEqual(bad.weekly, Model.emptyWeek());
assert.deepStrictEqual(bad.weeks, {});          // '2026-11-03' is a Tuesday, not a Monday
assert.strictEqual(bad.ui.editWeek, null);
assert.strictEqual(Model.normalize(null).weekly.length, 7);
assert.strictEqual(Model.normalize({ version: 2, ui: { editWeek: '2026-11-02', weekOffset: 99999 } }).ui.editWeek, '2026-11-02');
assert.strictEqual(Model.normalize({ version: 2, ui: { weekOffset: 99999 } }).ui.weekOffset, 5000);

/* ---- migration from version 1 ---- */
const v1 = {
    version: 1, ui: { weekOffset: 3 },
    items: [
        { id: 'w1', kind: 'weekly', weekday: 0, startDate: '2026-11-02', endDate: null, title: 'Math', notes: 'n', color: '#e5534b', important: false, due: '' },
        { id: 'o1', kind: 'once', date: '2026-11-04', title: 'History exam', notes: '', color: null, important: true, due: '2026-11-04' },
        { id: 'bad', kind: 'once', date: '2026-13-45', title: 'x' }
    ],
    occ: {
        'w1|2026-11-09': { done: true },
        'w1|2026-11-16': { skip: true },
        'w1|2026-11-23': { over: { title: 'Math (extra class)', notes: '', color: null, important: false, due: '' }, done: true },
        'o1|2026-11-04': { done: true }
    }
};
const m = Model.normalize(v1);
assert.strictEqual(m.version, 2);
assert.strictEqual(m.ui.weekOffset, 3);
assert.strictEqual(m.weekly[0].length, 1);
assert.strictEqual(m.weekly[0][0].todo, true);
assert.strictEqual(m.weekly[0][0].color, '#e5534b');
assert.deepStrictEqual(titles(m, '2026-10-26'), ['', '', '', '', '', '', '']);               // before the start date
assert.deepStrictEqual(titles(m, '2026-11-02'), ['Math', '', 'History exam✓', '', '', '', '']);
assert.deepStrictEqual(titles(m, '2026-11-09'), ['Math✓', '', '', '', '', '', '']);
assert.deepStrictEqual(titles(m, '2026-11-16'), ['', '', '', '', '', '', '']);               // skipped occurrence
assert.deepStrictEqual(titles(m, '2026-11-23'), ['Math (extra class)✓', '', '', '', '', '', '']); // edited occurrence
assert.deepStrictEqual(titles(m, '2026-11-30'), ['Math', '', '', '', '', '', '']);
// hidden migration fields survive list edits
Model.applyRows(m, null, 0, [row('Math', { todo: true, notes: 'changed' })]);
assert.strictEqual(m.weekly[0][0].from, '2026-11-02');
assert.deepStrictEqual(m.weekly[0][0].skipDates.sort(), ['2026-11-16', '2026-11-23']);
assert.deepStrictEqual(titles(m, '2026-10-26'), ['', '', '', '', '', '', '']);
// v2 round trip keeps them as well
assert.deepStrictEqual(Model.normalize(JSON.parse(JSON.stringify(m))).weekly, m.weekly);

/* ---- week range format — English (default) ---- */
assert.strictEqual(formatRange(wk('2026-11-02'), 'long'), 'November 2–8, 2026');
assert.strictEqual(formatRange(wk('2026-11-02'), 'long', 'en'), 'November 2–8, 2026');
assert.strictEqual(formatRange(wk('2026-11-02'), 'short', 'en'), 'Nov 2–8, 2026');
assert.strictEqual(formatRange(wk('2026-09-28'), 'long', 'en'), 'September 28 – October 4, 2026');
assert.strictEqual(formatRange(wk('2026-12-28'), 'long', 'en'), 'December 28, 2026 – January 3, 2027');
assert.strictEqual(formatRange(wk('2026-11-02'), 'numeric', 'en'), '11/02/2026 – 11/08/2026');
// week range format — Turkish
assert.strictEqual(formatRange(wk('2026-11-02'), 'long', 'tr'), '2–8 Kasım 2026');
assert.strictEqual(formatRange(wk('2026-11-09'), 'long', 'tr'), '9–15 Kasım 2026');
assert.strictEqual(formatRange(wk('2026-09-28'), 'long', 'tr'), '28 Eylül – 4 Ekim 2026');
assert.strictEqual(formatRange(wk('2026-12-28'), 'long', 'tr'), '28 Aralık 2026 – 3 Ocak 2027');
assert.strictEqual(formatRange(wk('2026-11-02'), 'numeric', 'tr'), '02.11.2026 – 08.11.2026');
// DST week: a week has 7 days, starts on Monday
assert.strictEqual(iso(addDays(wk('2026-03-23'), 7)), '2026-03-30');

/* ---- settings schema is consistent with the code ---- */
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../weekly-planner@egemngyk/settings-schema.json'), 'utf8'));
const inLayout = new Set();
schema.layout.pages.forEach(p => schema.layout[p].sections.forEach(s => schema.layout[s].keys.forEach(k => inLayout.add(k))));
Object.keys(schema).forEach(k => { if (k !== 'layout') assert.ok(inLayout.has(k), 'key not in layout: ' + k); });
inLayout.forEach(k => assert.ok(schema[k], 'layout key missing in schema: ' + k));
for (let i = 0; i < 7; i++) {
    assert.strictEqual(schema['weeklyItems' + i].type, 'list');
    assert.strictEqual(schema['weekItems' + i].type, 'list');
    assert.ok(typeof schema['showDay' + i].default === 'boolean');
}
['onWeekPrev', 'onWeekNext', 'onWeekToday', 'onWeekGo'].forEach(cb => {
    assert.ok(Object.keys(schema).some(k => schema[k].callback === cb), 'no button for ' + cb);
    assert.ok(new RegExp('\\b' + cb + ': function').test(fs.readFileSync(path.join(__dirname, '../weekly-planner@egemngyk/desklet.js'), 'utf8')), 'no method ' + cb);
});

console.log('ALL TESTS PASSED');