// Casos críticos: cada error y aviso documentado en el README debe aparecer cuando toca
const E = require('../src/engine.js'); global.Engine = E;
const M = require('../src/mission.js');
let fails = 0;
const check = (name, cond, info) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); if (!cond) fails++; };
const base = () => ({
  arch: 'turbofan', flight: { T0: 216.65, P0: 22632, M0: 0.78 },
  gas: { gc: 1.4, cpc: 1004.8, gt: 1.33, cpt: 1155.6, hPR: 42.8e6 },
  design: { spools: 'two', pic: 30, pif: 1.5, pilpc: 1.8, pihpc: 14.5, alpha: 11, Tt4: 1700 },
  comp: { pidmax: .995, pib: .95, pin: .995, pifn: .995, ec: .9, ef: .89, et: .89, etab: .999, etam: .995 },
  nozzle: { kindCore: 'cd', p0p9: 1, kindFan: 'cd', p0p19: 1 }, size: { mdot0: 420, M2: .5 }
});
const run = f => { const i = base(); f(i); return E.solve(i); };
const sls = i => { const a = E.isa(0); i.flight = { T0: a.T, P0: a.P, M0: 0 }; };
const has = (r, s) => (r.error || '').includes(s) || (r.warnings || []).some(w => w.includes(s));

// --- errores (el ciclo no se calcula) ---
let r = run(i => { i.design.Tt4 = 1000; i.design.pihpc = 30; i.design.pilpc = 4; });
check('Tt4 ≤ Tt3 → error «no supera la temperatura de salida del compresor»', !r.ok && has(r, 'no supera la temperatura de salida del compresor'), r.error);
r = run(i => { i.design.Tt4 = 1250; i.design.alpha = 16; i.design.pif = 2.2; });
check('Turbina insuficiente → error «Las turbinas no pueden mover»', !r.ok && has(r, 'Las turbinas no pueden mover'), r.error);
r = run(i => { sls(i); i.design.alpha = 12; i.design.pif = 1.5; i.design.Tt4 = 1600; });
check('Pt9 ≤ P0 → error «presión total a la salida del núcleo»', !r.ok && has(r, 'salida del núcleo'), r.error);
r = run(i => { sls(i); i.design.pif = 1.1; i.design.alpha = 3; i.comp.pifn = .85; i.comp.pidmax = .9; });
check('Pt19 ≤ P0 → error «salida del fan no supera»', !r.ok && has(r, 'salida del fan no supera'), r.error);

// --- avisos (el ciclo se calcula) ---
r = run(i => { i.nozzle.kindCore = 'conv'; i.nozzle.kindFan = 'conv'; });
check('Tobera convergente bloqueada → aviso', r.ok && has(r, 'bloqueada'));
r = run(i => { i.nozzle.p0p9 = .6; i.nozzle.p0p19 = .6; });
check('η_P > 100 % con tobera no adaptada → aviso', r.ok && r.etaP > 1 && has(r, 'η_P > 100'), (r.etaP * 100).toFixed(1) + ' %');
r = run(i => { i.design.Tt4 = 2050; });
check('Tt4 > 2000 K → aviso de materiales', r.ok && has(r, '2000 K'));
r = run(i => { i.flight.M0 = .9; i.design.pif = 1.1; i.comp.pifn = .85; i.design.alpha = 8; });
check('Fan más lento que el vuelo → aviso de empuje negativo del fan', r.ok && r.Fsec < 0 && has(r, 'fan da empuje negativo'), 'F_fan = ' + r.Fsec.toFixed(1));
r = run(i => { i.nozzle.p0p9 = .5; i.nozzle.p0p19 = .5; });
check('Δe_k ≤ 0 con F > 0 → aviso (rendimientos no definidos)', r.ok && r.dek <= 0 && r.Fsp > 0 && has(r, 'Δe_k ≤ 0'), 'Δe_k = ' + r.dek.toFixed(0) + ' J/kg');
r = run(i => { sls(i); i.design.alpha = 6; i.design.pif = 1.6; });
check('Mach 0: η_P = η_O = 0 sin errores', r.ok && r.etaP === 0 && r.etaO === 0 && r.tsfc > 0);

// --- misión ---
const od = E.makeOffDesign(base());
const eng = { Tt4climb: 1900, Tt4cruise: 1850, idleFrac: .05 };
const ms = { mode: 'auto', range: 5000, h0: 450, hEnd: 450, casClimb: 150, casDesc: 144, Mmax: .85, Mfix: 0, hMin: 6000, hMax: 13000, rocMax: 15, rocMin: 1.5, cruiseClimb: false };
const ac = { m0: 0, S: 440, CD0: .0165, k: .042, Mcrit: .76, nEng: 2 };
let m = M.simulate({ od, ac, eng, ms });
check('Masa 0 → error «Masa inicial no válida»', !m.ok && m.warnings[0].includes('Masa inicial no válida'));
ac.m0 = 900000;
m = M.simulate({ od, ac, eng, ms });
check('Avión demasiado pesado → «No hay ninguna combinación…» o techo', !m.ok || m.warnings.some(w => /Techo|limitado/.test(w)), (m.warnings[0] || '').slice(0, 60));
ac.m0 = 250000; ac.CD0 = .026; ms.range = 14000;
m = M.simulate({ od, ac, eng, ms });
check('Alcance enorme → error o aviso de fracción de combustible', (!m.ok && m.warnings[0].includes('masa inicial en combustible')) || (m.ok && m.warnings.some(w => w.includes('% de la masa inicial'))), (m.warnings[0] || '').slice(0, 70));

console.log(fails ? `\n${fails} comprobaciones fallidas` : '\nTodo correcto');
process.exit(fails ? 1 : 0);
