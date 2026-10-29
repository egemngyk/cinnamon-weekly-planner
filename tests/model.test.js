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
const wk = d => parseIso(d); // pazartesi tarihleri
const titles = (data, mon) => Model.occurrences(data, wk(mon)).days.map(l => l.map(o => o.f.title + (o.done ? '✓' : '')).join(','));

let d = Model.defaults();
// 2 Kasım 2026 = Pazartesi
assert.strictEqual(parseIso('2026-11-02').getDay(), 1);
Model.create(d, {title:'Matematik',notes:'',color:null,important:false,due:''}, '2026-11-02', true);
Model.create(d, {title:'Tarih sınavı',notes:'',color:null,important:true,due:''}, '2026-11-04', false);
Model.create(d, {title:'Ödev teslim',notes:'',color:null,important:false,due:''}, '2026-11-10', false);

assert.deepStrictEqual(titles(d,'2026-11-02'), ['Matematik','','Tarih sınavı','','','','']);
assert.deepStrictEqual(titles(d,'2026-11-09'), ['Matematik','Ödev teslim','','','','','']);
assert.deepStrictEqual(titles(d,'2026-10-26'), ['','','','','','','']);   // başlangıçtan önce yok
assert.deepStrictEqual(titles(d,'2027-03-01')[0], 'Matematik');            // uzak gelecek
const mat = d.items[0];

// done: yalnızca ilgili hafta
let o = Model.occurrences(d, wk('2026-11-09')).days[0][0];
Model.toggleDone(d, o);
assert.strictEqual(titles(d,'2026-11-09')[0], 'Matematik✓');
assert.strictEqual(titles(d,'2026-11-02')[0], 'Matematik');
assert.strictEqual(titles(d,'2026-11-16')[0], 'Matematik');
Model.toggleDone(d, Model.occurrences(d, wk('2026-11-09')).days[0][0]);
assert.strictEqual(Object.keys(d.occ).length, 0);

// 'this' düzenleme
o = Model.occurrences(d, wk('2026-11-09')).days[0][0];
Model.edit(d, o, Object.assign({}, o.f, {title:'Matematik (ek ders)'}), '2026-11-09', true, 'this');
assert.strictEqual(titles(d,'2026-11-09')[0], 'Matematik (ek ders)');
assert.strictEqual(titles(d,'2026-11-02')[0], 'Matematik');
assert.strictEqual(titles(d,'2026-11-16')[0], 'Matematik');

// 'this' ile başka güne taşıma -> atla + tek seferlik
o = Model.occurrences(d, wk('2026-11-16')).days[0][0];
Model.edit(d, o, o.f, '2026-11-18', true, 'this');
assert.strictEqual(titles(d,'2026-11-16')[0], '');
assert.strictEqual(titles(d,'2026-11-16')[2], 'Matematik');
assert.strictEqual(titles(d,'2026-11-23')[0], 'Matematik');

// 'future' bölme: 23 Kasım'dan itibaren saat ve başlık değişsin
o = Model.occurrences(d, wk('2026-11-23')).days[0][0];
Model.edit(d, o, Object.assign({}, o.f, {title:'Matematik II', notes:'yeni not'}), '2026-11-23', true, 'future');
assert.strictEqual(titles(d,'2026-11-09')[0], 'Matematik (ek ders)');
assert.strictEqual(titles(d,'2026-11-02')[0], 'Matematik');
assert.strictEqual(titles(d,'2026-11-23')[0], 'Matematik II');
assert.strictEqual(titles(d,'2027-01-04')[0], 'Matematik II');
assert.strictEqual(mat.endDate, '2026-11-22');

// 'future' ile gün değiştirme (Pzt -> Çar), önceki haftalar sabit
o = Model.occurrences(d, wk('2026-11-30')).days[0][0];
Model.edit(d, o, o.f, '2026-12-02', true, 'future');
assert.strictEqual(titles(d,'2026-11-23')[0], 'Matematik II');
assert.strictEqual(titles(d,'2026-11-30')[0], '');
assert.strictEqual(titles(d,'2026-11-30')[2], 'Matematik II');
assert.strictEqual(titles(d,'2026-12-07')[2], 'Matematik II');

// 'future' silme (sonlandır)
o = Model.occurrences(d, wk('2026-12-14')).days[2][0];
Model.remove(d, o, 'future');
assert.strictEqual(titles(d,'2026-12-07')[2], 'Matematik II');
assert.strictEqual(titles(d,'2026-12-14')[2], '');
assert.strictEqual(titles(d,'2027-02-01')[2], '');

// 'this' silme
o = Model.occurrences(d, wk('2026-12-07')).days[2][0];
Model.remove(d, o, 'this');
assert.strictEqual(titles(d,'2026-12-07')[2], '');
assert.strictEqual(titles(d,'2026-11-30')[2], 'Matematik II');

// once düzenleme: tarih taşıma + tamamlanma korunur
o = Model.occurrences(d, wk('2026-11-02')).days[2][0];
Model.toggleDone(d, o);
Model.edit(d, o, o.f, '2026-11-05', false, 'this');
assert.strictEqual(titles(d,'2026-11-02')[2], '');
assert.strictEqual(titles(d,'2026-11-02')[3], 'Tarih sınavı✓');

// once silme
o = Model.occurrences(d, wk('2026-11-09')).days[1].filter(x=>x.f.title==='Ödev teslim')[0];
Model.remove(d, o, 'this');
assert.ok(!d.items.some(i => i.title === 'Ödev teslim'));

// normalize: gidiş-dönüş + bozuk veri
const rt = Model.normalize(JSON.parse(JSON.stringify(d)));
assert.deepStrictEqual(rt.items.length, d.items.length);
const bad = Model.normalize({items:[{id:'x',title:'a',kind:'once',date:'2026-13-45'},{foo:1}], categories:'nope', occ:5, ui:{weekOffset:'x'}});
assert.strictEqual(bad.items.length, 0);
assert.strictEqual(Model.normalize(null).items.length, 0);

// tarih aralığı biçimi
assert.strictEqual(formatRange(wk('2026-11-02'),'long'), '2–8 Kasım 2026');
assert.strictEqual(formatRange(wk('2026-11-09'),'long'), '9–15 Kasım 2026');
assert.strictEqual(formatRange(wk('2026-09-28'),'long'), '28 Eylül – 4 Ekim 2026');
assert.strictEqual(formatRange(wk('2026-12-28'),'long'), '28 Aralık 2026 – 3 Ocak 2027');
assert.strictEqual(formatRange(wk('2026-11-02'),'numeric'), '02.11.2026 – 08.11.2026');
// DST haftası (Avrupa/İstanbul sabit, ABD değişir): hafta 7 gün, pazartesi başlar
assert.strictEqual(iso(addDays(wk('2026-03-23'),7)), '2026-03-30');
console.log('TÜM TESTLER GEÇTİ');