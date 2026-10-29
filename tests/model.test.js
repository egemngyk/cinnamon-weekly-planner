global.imports = new Proxy({}, { get: function () { return new Proxy(function(){}, { get: function(){ return new Proxy(function(){}, {get:function(){return function(){}}}); } }); } });
global.global = { logError: console.error };
const assert = require('assert');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../weekly-planner@egemngyk/desklet.js'), 'utf8') +
    '\nmodule.exports = { Model, iso, parseIso, addDays, mondayOf, formatRange, readable };';
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const M = mod.exports;
const { Model, parseIso, addDays, iso, formatRange } = M;
const wk = d => parseIso(d); // Monday dates
const titles = (data, mon) => Model.occurrences(data, wk(mon)).days.map(l => l.map(o => o.f.title + (o.done ? '✓' : '')).join(','));

let d = Model.defaults();
// Nov 2, 2026 = Monday
assert.strictEqual(parseIso('2026-11-02').getDay(), 1);
Model.create(d, {title:'Math',notes:'',color:null,important:false,due:''}, '2026-11-02', true);
Model.create(d, {title:'History exam',notes:'',color:null,important:true,due:''}, '2026-11-04', false);
Model.create(d, {title:'Homework due',notes:'',color:null,important:false,due:''}, '2026-11-10', false);

assert.deepStrictEqual(titles(d,'2026-11-02'), ['Math','','History exam','','','','']);
assert.deepStrictEqual(titles(d,'2026-11-09'), ['Math','Homework due','','','','','']);
assert.deepStrictEqual(titles(d,'2026-10-26'), ['','','','','','','']);   // nothing before the start date
assert.deepStrictEqual(titles(d,'2027-03-01')[0], 'Math');            // uzak gelecek
const mat = d.items[0];

// done: only the relevant week
let o = Model.occurrences(d, wk('2026-11-09')).days[0][0];
Model.toggleDone(d, o);
assert.strictEqual(titles(d,'2026-11-09')[0], 'Math✓');
assert.strictEqual(titles(d,'2026-11-02')[0], 'Math');
assert.strictEqual(titles(d,'2026-11-16')[0], 'Math');
Model.toggleDone(d, Model.occurrences(d, wk('2026-11-09')).days[0][0]);
assert.strictEqual(Object.keys(d.occ).length, 0);

// 'this' edit
o = Model.occurrences(d, wk('2026-11-09')).days[0][0];
Model.edit(d, o, Object.assign({}, o.f, {title:'Math (extra class)'}), '2026-11-09', true, 'this');
assert.strictEqual(titles(d,'2026-11-09')[0], 'Math (extra class)');
assert.strictEqual(titles(d,'2026-11-02')[0], 'Math');
assert.strictEqual(titles(d,'2026-11-16')[0], 'Math');

// moving to another day with 'this' -> skip + one-off
o = Model.occurrences(d, wk('2026-11-16')).days[0][0];
Model.edit(d, o, o.f, '2026-11-18', true, 'this');
assert.strictEqual(titles(d,'2026-11-16')[0], '');
assert.strictEqual(titles(d,'2026-11-16')[2], 'Math');
assert.strictEqual(titles(d,'2026-11-23')[0], 'Math');

// 'future' split: change title and notes from Nov 23 on
o = Model.occurrences(d, wk('2026-11-23')).days[0][0];
Model.edit(d, o, Object.assign({}, o.f, {title:'Math II', notes:'yeni not'}), '2026-11-23', true, 'future');
assert.strictEqual(titles(d,'2026-11-09')[0], 'Math (extra class)');
assert.strictEqual(titles(d,'2026-11-02')[0], 'Math');
assert.strictEqual(titles(d,'2026-11-23')[0], 'Math II');
assert.strictEqual(titles(d,'2027-01-04')[0], 'Math II');
assert.strictEqual(mat.endDate, '2026-11-22');

// changing the weekday with 'future' (Mon -> Wed), earlier weeks stay unchanged
o = Model.occurrences(d, wk('2026-11-30')).days[0][0];
Model.edit(d, o, o.f, '2026-12-02', true, 'future');
assert.strictEqual(titles(d,'2026-11-23')[0], 'Math II');
assert.strictEqual(titles(d,'2026-11-30')[0], '');
assert.strictEqual(titles(d,'2026-11-30')[2], 'Math II');
assert.strictEqual(titles(d,'2026-12-07')[2], 'Math II');

// 'future' delete (end the series)
o = Model.occurrences(d, wk('2026-12-14')).days[2][0];
Model.remove(d, o, 'future');
assert.strictEqual(titles(d,'2026-12-07')[2], 'Math II');
assert.strictEqual(titles(d,'2026-12-14')[2], '');
assert.strictEqual(titles(d,'2027-02-01')[2], '');

// 'this' silme
o = Model.occurrences(d, wk('2026-12-07')).days[2][0];
Model.remove(d, o, 'this');
assert.strictEqual(titles(d,'2026-12-07')[2], '');
assert.strictEqual(titles(d,'2026-11-30')[2], 'Math II');

// editing a one-off: moving the date keeps the done state
o = Model.occurrences(d, wk('2026-11-02')).days[2][0];
Model.toggleDone(d, o);
Model.edit(d, o, o.f, '2026-11-05', false, 'this');
assert.strictEqual(titles(d,'2026-11-02')[2], '');
assert.strictEqual(titles(d,'2026-11-02')[3], 'History exam✓');

// once silme
o = Model.occurrences(d, wk('2026-11-09')).days[1].filter(x=>x.f.title==='Homework due')[0];
Model.remove(d, o, 'this');
assert.ok(!d.items.some(i => i.title === 'Homework due'));

// normalize: round trip + corrupt data
const rt = Model.normalize(JSON.parse(JSON.stringify(d)));
assert.deepStrictEqual(rt.items.length, d.items.length);
const bad = Model.normalize({items:[{id:'x',title:'a',kind:'once',date:'2026-13-45'},{foo:1}], categories:'nope', occ:5, ui:{weekOffset:'x'}});
assert.strictEqual(bad.items.length, 0);
assert.strictEqual(Model.normalize(null).items.length, 0);

// week range format — English (default)
assert.strictEqual(formatRange(wk('2026-11-02'),'long'), 'November 2–8, 2026');
assert.strictEqual(formatRange(wk('2026-11-02'),'long','en'), 'November 2–8, 2026');
assert.strictEqual(formatRange(wk('2026-11-02'),'short','en'), 'Nov 2–8, 2026');
assert.strictEqual(formatRange(wk('2026-09-28'),'long','en'), 'September 28 – October 4, 2026');
assert.strictEqual(formatRange(wk('2026-12-28'),'long','en'), 'December 28, 2026 – January 3, 2027');
assert.strictEqual(formatRange(wk('2026-11-02'),'numeric','en'), '11/02/2026 – 11/08/2026');
// week range format — Turkish
assert.strictEqual(formatRange(wk('2026-11-02'),'long','tr'), '2–8 Kasım 2026');
assert.strictEqual(formatRange(wk('2026-11-09'),'long','tr'), '9–15 Kasım 2026');
assert.strictEqual(formatRange(wk('2026-09-28'),'long','tr'), '28 Eylül – 4 Ekim 2026');
assert.strictEqual(formatRange(wk('2026-12-28'),'long','tr'), '28 Aralık 2026 – 3 Ocak 2027');
assert.strictEqual(formatRange(wk('2026-11-02'),'numeric','tr'), '02.11.2026 – 08.11.2026');
// DST week (Europe/Istanbul is fixed, the US changes): a week has 7 days, starts on Monday
assert.strictEqual(iso(addDays(wk('2026-03-23'),7)), '2026-03-30');
console.log('ALL TESTS PASSED');