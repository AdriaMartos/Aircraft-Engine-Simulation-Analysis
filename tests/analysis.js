// Modo «Analizar un motor»: datos del motor → caudal desde el mapa del HPC → punto de diseño
global.Engine = require('../src/engine.js'); global.Calcs = require('../src/calcs.js');
const A = require('../src/analysis.js');
let fails = 0;
const check = (name, cond, info) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); if (!cond) fails++; };
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const M = A.HPC_MAP;
check('Punto de diseño del mapa sobre la línea de operación', close(A.map.piFromMc(M.design.mc), M.design.pi, 0.01), A.map.piFromMc(M.design.mc).toFixed(3));
check('η en el punto de diseño = 0,85', close(A.map.etaFromMc(M.design.mc), 0.85, 1e-9));
check('Inversa de la línea de operación', close(A.map.mcFromPi(A.map.piFromMc(12.3)), 12.3, 1e-12));
check('η a lo largo de la línea entre 0,69 y 0,85', [6, 9, 12, 15, 18, 20.5].every(m => { const e = A.map.etaFromMc(m); return e >= 0.69 && e <= 0.85; }));

const eng = A.DEFAULT();
const dp = A.designPoint(eng), d = dp.derive, r = dp.res;
check('Punto de diseño del motor de ejemplo resuelto', dp.ok, dp.error || '');
check('π_f·π_LPC·π_HPC = OPR', close(eng.pif * d.pilpc * eng.hpc.pi, eng.OPR, 1e-12));
check('T_t25 y P_t25 del paso 1 = las del solver', close(d.Tt25, r.Tt25, 1e-12) && close(d.Pt25, r.Pt25, 1e-12));
check('ṁ_c,25 recuperado a partir de ṁ_core', close(d.mcore * Math.sqrt(r.Tt25 / eng.ref.T) / (r.Pt25 / eng.ref.P), eng.hpc.mc, 1e-12));
check('ṁ₀ = (1+α)·ṁ_core y es el caudal del dimensionado', close(d.m0, (1 + eng.alpha) * d.mcore, 1e-12) && close(r.size.m0, d.m0, 1e-12));
check('El HPC usa η isentrópica del mapa (eq. 3.25)', close(r.thpc, 1 + (Math.pow(eng.hpc.pi, 0.4 / 1.4) - 1) / eng.hpc.eta, 1e-12));
const cb = Calcs.build(r);
check('Memoria de cálculo coincide con el solver', cb.nok === cb.nchk, cb.nok + '/' + cb.nchk);
check('Resultados de crucero plausibles', r.tsfc * 1e6 > 14 && r.tsfc * 1e6 < 25 && r.size.F > 10e3, `F = ${(r.size.F / 1000).toFixed(1)} kN, TSFC = ${(r.tsfc * 1e6).toFixed(2)} mg/(N·s)`);

const bad = A.DEFAULT(); bad.OPR = 8;
const db = A.derive(bad);
check('OPR demasiado bajo → error π_LPC < 1', !db.ok && db.errors[0].includes('π_LPC'));
const w = A.DEFAULT(); w.hpc.pi = 8;
check('π_HPC fuera de la línea de operación → aviso', A.derive(w).warnings.some(x => x.includes('fuera del rango')));
// En altitud el caudal real es menor que a nivel del mar para el mismo caudal corregido
const sl = A.DEFAULT(); sl.h0 = 1000; sl.M0 = 0.3;
check('Mismo ṁ_c: más caudal real a baja altitud', A.derive(sl).mcore > d.mcore);

console.log(fails ? `\n${fails} comprobaciones fallidas` : '\nTodo correcto');
process.exit(fails ? 1 : 0);
