// La memoria de cálculo recalcula cada paso a partir de sus operandos: debe coincidir con el solver
const E = require('../src/engine.js'); const C = require('../src/calcs.js');
let fails = 0, steps = 0, cases = 0;
const base = {
  gas: { gc: 1.4, cpc: 1004.8, gt: 1.33, cpt: 1155.6, hPR: 42.8e6 },
  comp: { pidmax: .995, pib: .95, pin: .995, pifn: .995, ec: .9, ef: .89, et: .89, etab: .999, etam: .995 }
};
const mk = (o) => Object.assign({ size: { mdot0: 420, M2: .5 } }, base, o);
const list = [];
for (const M0 of [0, 0.3, 0.78, 1.0, 2.0]) for (const kind of ['cd', 'conv']) {
  list.push(mk({ arch: 'turbojet', flight: { T0: 216.65, P0: 22632, M0 }, design: { spools: 'single', pic: 12, Tt4: 1700 }, nozzle: { kindCore: kind, p0p9: 0.8 } }));
  list.push(mk({ arch: 'turbojet', flight: { T0: 216.65, P0: 22632, M0 }, design: { spools: 'two', pilpc: 3, pihpc: 5, Tt4: 1800 }, nozzle: { kindCore: kind, p0p9: 0.8 } }));
  if (M0 <= 1) {
    list.push(mk({ arch: 'turbofan', flight: { T0: 216.65, P0: 22632, M0 }, design: { spools: 'single', pic: 30, pif: 1.7, alpha: 8, Tt4: 1650 }, nozzle: { kindCore: kind, p0p9: 0.9, kindFan: kind, p0p19: 0.9 } }));
    list.push(mk({ arch: 'turbofan', flight: { T0: 216.65, P0: 22632, M0 }, design: { spools: 'two', pif: 1.5, pilpc: 1.8, pihpc: 14.5, alpha: 11, Tt4: 1700 }, nozzle: { kindCore: kind, p0p9: 1, kindFan: kind, p0p19: 1 } }));
  }
}
// puntos fuera de diseño
const od = E.makeOffDesign(list.find(x => x.arch === 'turbofan' && x.design.spools === 'two' && x.flight.M0 === 0.78 && x.nozzle.kindCore === 'cd'));
for (const [T, P, M, Tt4] of [[288.15, 101325, 0, 1900], [216.65, 22632, 0.78, 1600], [250, 50000, 0.5, 1800]]) list.push(null, [T, P, M, Tt4]);
const rs = [];
for (const i of list) { if (i === null) continue; if (Array.isArray(i)) { const r = od.at(i[0], i[1], i[2], i[3], true); if (r.ok) rs.push(['off ' + i.join('/'), r]); } else { const r = E.solve(i); if (r.ok) rs.push([i.arch + ' ' + i.design.spools + ' M' + i.flight.M0 + ' ' + i.nozzle.kindCore, r]); } }
for (const [name, r] of rs) {
  const res = C.build(r); cases++; steps += res.nchk;
  const ok = res.nok === res.nchk && res.nchk > 20;
  if (!ok) { fails++; console.log('FAIL', name, res.nok + '/' + res.nchk, 'peor error', res.worst, res.sections.flatMap(s => s.steps).filter(s => s.err > 1e-9).map(s => s.k)); }
  const txt = C.toText(res, 'x'); if (/undefined|NaN/.test(txt) || /undefined|NaN/.test(JSON.stringify(res.sections.map(s => s.steps.map(t => [t.sym, t.sub, t.shown]))))) { fails++; console.log('FAIL texto', name); }
}
console.log(`${cases} casos, ${steps} pasos comprobados contra el solver`);
console.log(fails ? fails + ' casos con error' : 'Todo correcto');
process.exit(fails ? 1 : 0);
