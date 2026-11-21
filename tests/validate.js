const E = require('../src/engine.js');

const tj = {
  arch: 'turbojet',
  flight: { T0: 216.69, P0: 19400, M0: 2.0 },
  gas: { gc: 1.4, cpc: 1004, gt: 1.3, cpt: 1239, hPR: 42.8e6 },
  design: { spools: 'single', pic: 10, Tt4: 1800 },
  comp: { pidmax: 0.95, pib: 0.94, pin: 0.96, ec: 0.9, ef: 0.9, et: 0.9, etab: 0.98, etam: 0.99, pifn: 1 },
  nozzle: { kindCore: 'cd', p0p9: 0.5 }
};
const tf = {
  arch: 'turbofan',
  flight: { T0: 216.69, P0: 19400, M0: 0.8 },
  gas: { gc: 1.4, cpc: 1004.8, gt: 1.33, cpt: 1155.6, hPR: 42.8e6 },
  design: { spools: 'single', pic: 36, pif: 1.7, alpha: 8, Tt4: 1666.67 },
  comp: { pidmax: 0.99, pib: 0.96, pin: 0.99, pifn: 0.99, ec: 0.9, ef: 0.89, et: 0.89, etab: 0.99, etam: 0.99 },
  nozzle: { kindCore: 'cd', p0p9: 0.9, kindFan: 'cd', p0p19: 0.9 }
};

let fails = 0, total = 0;
function row(name, got, ref, tol) {
  const err = Math.abs(got - ref) / Math.abs(ref);
  total++; if (!(err < tol)) fails++;
  console.log(`${err < tol ? 'OK  ' : 'FAIL'} ${name.padEnd(12)} calc=${got.toFixed(4)} apunte=${ref} (${(err * 100).toFixed(2)}%)`);
}

let r = E.solve(tj);
console.log('--- Turbojet (Tabla 5.2) ---');
row('tau_r', r.tr, 1.8, 0.002); row('pi_r', r.pr, 7.8245, 0.002);
row('pi_d', r.pid, 0.8788, 0.002); row('tau_c', r.tc, 2.0771, 0.002);
row('tau_lambda', r.tl, 10.2506, 0.002); row('f', r.f, 0.03567, 0.01);
row('tau_t', r.tt, 0.8155, 0.005); row('pi_t', r.pit, 0.3746, 0.01);
row('M9', r.core.M, 2.253, 0.01);
row('F/m0', r.Fsp, 807.1, 0.01); row('TSFC mg/s/N', r.tsfc * 1e6, 44.20, 0.01);
row('eta_T %', r.etaT * 100, 41.93, 0.01); row('eta_P %', r.etaP * 100, 74.38, 0.01); row('eta_O %', r.etaO * 100, 31.19, 0.01);

r = E.solve(tf);
console.log('--- Turbofán (Tabla 6.2) ---');
row('tau_f', r.tf, 1.1857, 0.002); row('tau_c', r.tc, 3.1192, 0.003);
row('tau_lambda', r.tl, 8.8459, 0.002); row('f', r.f, 0.02868, 0.01);
row('tau_t', r.tt, 0.5487, 0.005); row('pi_t', r.pit, 0.0660, 0.02);
row('M9', r.core.M, 1.393, 0.01); row('M19', r.fan.M, 1.154, 0.01);
row('F/m0', r.Fsp, 176.75, 0.01); row('TSFC mg/s/N', r.tsfc * 1e6, 18.03, 0.01);
row('FR', r.FR, 3.986, 0.01);
row('eta_T %', r.etaT * 100, 40.98, 0.01); row('eta_P %', r.etaP * 100, 74.67, 0.01); row('eta_O %', r.etaO * 100, 30.60, 0.01);
console.log('Tt3', r.Tt3.toFixed(2), '(apunte 762.45)  Tt5', r.Tt5.toFixed(2), '(914.32)  Pt3 bar', (r.Pt3 / 1e5).toFixed(3), '(10.548)  Pt5', (r.Pt5 / 1e5).toFixed(3), '(0.668)');

// Modo dos ejes: la descomposición debe dar el mismo tau_t total que el eje único con los mismos tau
const two = JSON.parse(JSON.stringify(tf));
two.design = { spools: 'two', pif: 1.7, pilpc: 2.0, pihpc: 36 / (1.7 * 2.0), alpha: 8, Tt4: 1666.67 };
const r2 = E.solve(two);
console.log('--- Dos ejes ---', r2.ok, 'tau_t', r2.tt.toFixed(4), 'tth', r2.tth.toFixed(4), 'ttl', r2.ttl.toFixed(4), 'F/m0', r2.Fsp.toFixed(2));

// Caso límite y dimensionado
const bad = JSON.parse(JSON.stringify(tf)); bad.design.Tt4 = 900;
console.log('Tt4 baja ->', E.solve(bad).error || 'sin error');
const sz = JSON.parse(JSON.stringify(tf)); sz.size = { mdot0: 400, M2: 0.5 };
const rs = E.solve(sz).size;
console.log('Dimensionado m0=400:', Object.fromEntries(Object.entries(rs).map(([k, v]) => [k, v && +v.toFixed(3)])));
console.log('ISA 11 km', E.isa(11000), 'ISA 12 km', E.isa(12000));

console.log(fails ? `\n${fails} de ${total} comprobaciones fuera de tolerancia` : `\nTodo correcto (${total} comprobaciones contra el apunte)`);
process.exit(fails ? 1 : 0);
