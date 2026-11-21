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

// ---------- Paso 3: mapas de calor ----------
{
  const d = A.designPoint(eng).derive;
  const hm = A.heatmap(eng, { lpcMin: d.pilpc - 1, lpcMax: d.pilpc + 1, hpcMin: eng.hpc.pi - 0.3, hpcMax: eng.hpc.pi + 0.3, n: 5 });
  const ci = hm.grids.i[12], cii = hm.grids.ii[12];
  check('Mapa de calor (i): la celda central es exactamente el punto de diseño', close(ci.F, A.designPoint(eng).res.size.F, 1e-12));
  check('Mapa de calor (ii): la celda central está a < 0,5 % del diseño', Math.abs(cii.F / ci.F - 1) < 0.005, ((cii.F / ci.F - 1) * 100).toFixed(3) + ' %');
  const full = A.heatmap(eng);
  check('Mapa de calor (ii): menos π_HPC → menos caudal', full.grids.ii[0].mcore < full.grids.ii[full.n * (full.n - 1)].mcore);
}
// ---------- Paso 4: compresor de etapas repetidas ----------
{
  const c0 = A.hpcChart(0, 0.3, 0.5, 1, 0.9, 1.4);
  check('Figura de diseño del HPC: α₁ = 0 → α₂ = 36,87°, π_cs(M₁ 0,3) = 1,064, ωr/V₁ = 0,75', close(c0.a2, 36.8699, 1e-4) && close(c0.pcs, 1.0640, 1e-4) && close(c0.wrV, 0.75, 1e-9));
  const h = A.hpcDesign(eng);
  check('HPC: U = v₁ + v₂ (filas repetidas)', close(h.U, h.v1 + h.v2, 1e-12));
  check('HPC: ΔT_t por etapa = (V₂² − V₁²)/c_p = T_t1·(τ_cs − 1)', close(h.dTs, h.dp.res.Tt25 * (h.tcs - 1), 1e-9));
  check('HPC: el producto de las N etapas da π_HPC', close(h.piTot, h.dp.res.pihpc, 1e-9), `N = ${h.N}, π = ${h.piTot.toFixed(4)}`);
  check('HPC: Ψ = 1 − 2Φ·tan α₁ (reacción 0,5)', close(h.Psi, 1 - 2 * h.Phi * Math.tan(h.a1 * Math.PI / 180), 1e-9));
}
// ---------- Paso 5: turbina de una etapa ----------
{
  const h = A.hpcDesign(eng), t = A.hptDesign(eng, null, h);
  check('HPT: Euler c_p·ΔT_t = U·v₂ (salida sin giro)', close(t.cp * t.dT, t.U * t.v2, 1e-12));
  check('HPT: R_t = 1 − Ψ/2 y tan β₃ = 1/Φ', close(t.Rt, 1 - t.Psi / 2, 1e-12) && close(Math.tan(t.b3 * Math.PI / 180), 1 / t.Phi, 1e-12));
  check('HPT: mismo ω que el HPC (r = U/ω)', close(t.rmH * h.w, t.U, 1e-12));
  check('HPT por defecto cumple α₂ ≤ 70°, M₂ > 1 y M₃R < 0,9', t.a2 <= 70 && t.M2 > 1 && t.M3R < 0.9, t.warnings.join(' | '));
}
// ---------- Paso 6: fuera de diseño ----------
{
  const dd = A.designPoint(eng);
  const o1 = A.offDesign(eng, { h: eng.h0, M0: eng.M0, dTt4: 0 });
  check('Fuera de diseño en la condición de diseño = punto de diseño', o1.ok && close(o1.res.size.F, dd.res.size.F, 1e-9) && close(o1.alpha, eng.alpha, 1e-9));
  const o = A.offDesign(eng);
  check('Fuera de diseño a nivel del mar converge', o.ok && o.it < 400, o.ok ? `${o.it} iteraciones` : o.error);
  check('Fuera de diseño: τ_tH constante y τ_tL coherente con el solver', close(o.res.tth, dd.res.tth, 1e-9) && close(o.res.ttl, o.ttl, 1e-6));
  check('Fuera de diseño a nivel del mar: más empuje y menos TSFC que en crucero', o.res.size.F > 2 * dd.res.size.F && o.res.tsfc < dd.res.tsfc, `F ×${(o.res.size.F / dd.res.size.F).toFixed(2)}`);
  check('A M₀ = 0, η_P = 0', o.res.etaP === 0);
}

console.log(fails ? `\n${fails} comprobaciones fallidas` : '\nTodo correcto');
process.exit(fails ? 1 : 0);
