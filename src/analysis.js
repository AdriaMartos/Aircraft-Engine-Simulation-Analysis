/* Análisis de un motor real paso a paso.
   - Mapa del compresor de alta (HPC) digitalizado: punto de diseño, línea de operación y
     eficiencia isentrópica a lo largo de la línea.
   - Datos del motor → entrada del solver: π_LPC a partir del OPR y caudal a partir del caudal
     corregido del mapa en la estación 2.5.
   Depende de Engine (src/engine.js). */
const Analysis = (function () {
  const E = (typeof Engine !== 'undefined') ? Engine : require('./engine.js');

  /* ---------- Mapa del HPC ----------
     Digitalizado de la figura del mapa (ejes calibrados con la rejilla, error < 0,02 en π y en ṁ).
     ṁ_c,25 = ṁ_25·√θ_25/δ_25 con θ = T_t/T_ref y δ = P_t/P_ref. */
  const HPC_MAP = {
    ref: { T: 288.15, P: 101325 },
    design: { mc: 20.0, pi: 6.59, eta: 0.85 },
    line: { k: 0.3574, b: -0.5656, mcMin: 5.89, mcMax: 20.89 },   // π = k·ṁc + b
    // eficiencia isentrópica en los cruces de la línea de operación con las isolíneas del mapa
    eta: [[5.89, 0.69], [6.50, 0.70], [7.70, 0.75], [10.15, 0.80], [11.57, 0.82], [12.37, 0.83], [13.27, 0.84],
          [15.17, 0.85], [20.03, 0.85], [20.30, 0.84], [20.57, 0.83], [20.84, 0.82], [20.89, 0.818]]
  };
  const lerp = (tab, x) => {
    if (x <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    return tab[tab.length - 1][1];
  };
  const map = {
    piFromMc: (m, M) => (M || HPC_MAP).line.k * m + (M || HPC_MAP).line.b,
    mcFromPi: (p, M) => (p - (M || HPC_MAP).line.b) / (M || HPC_MAP).line.k,
    etaFromMc: (m, M) => lerp((M || HPC_MAP).eta, m),
    piRange: M => { M = M || HPC_MAP; return [map.piFromMc(M.line.mcMin, M), map.piFromMc(M.line.mcMax, M)]; }
  };

  /* ---------- Motor de ejemplo (valores genéricos: hay que sustituirlos por los del motor elegido) ---------- */
  const DEFAULT = () => ({
    name: 'Motor de ejemplo', notes: '',
    h0: 10668, M0: 0.78,
    alpha: 5, OPR: 32, pif: 1.6, Tt4: 1600,
    fuel: 42.8,                                   // h_PR [MJ/kg]
    gas: { gc: 1.4, cpc: 1004.8, gt: 1.33, cpt: 1155.6 },
    eff: { pidmax: 0.995, ef: 0.89, ec: 0.90, et: 0.89, pib: 0.95, etab: 0.999, etam: 0.995, pin: 0.995, pifn: 0.995 },
    hpc: { mc: HPC_MAP.design.mc, pi: HPC_MAP.design.pi, eta: HPC_MAP.design.eta },
    ref: { T: HPC_MAP.ref.T, P: HPC_MAP.ref.P },
    nozzle: { kindCore: 'cd', p0p9: 1, kindFan: 'cd', p0p19: 1 },
    src: {}                                        // fuente de cada dato, por clave
  });

  /* Hoja de cálculo mínima con el mismo formato que Calcs: pasos {name, sym, sub, shown, unit} */
  const num = x => (typeof Calcs !== 'undefined' ? Calcs.num(x) : String(Number(Number(x).toPrecision(5))).replace('.', ','));
  function sheet() {
    const V = {}, secs = [];
    let cur = null;
    const neg = x => x < 0 ? '(−' + num(-x) + ')' : num(x);
    const fill = s => s.replace(/\$(\w+)\$/g, (m, k) => neg(V[k]));
    return {
      V, secs,
      sec(id, title, intro) { cur = { id, title, intro: intro || '', steps: [] }; secs.push(cur); },
      data(k, name, sym, val, unit, shown) { V[k] = val; cur.steps.push({ k, name, sym, val, unit: unit || '', data: true, shown: shown || num(val) }); },
      st(k, name, sym, sub, val, unit, o) { o = o || {}; V[k] = val; cur.steps.push({ k, name, sym, sub: fill(sub), val, unit: unit || '', shown: num(val * (o.scale || 1)), note: o.note, alt: o.alt, i: o.i }); return val; }
    };
  }

  /* ---------- Paso 1: datos del motor → entrada del solver ---------- */
  function derive(A, M) {
    M = M || HPC_MAP;
    const out = { ok: true, warnings: [], errors: [] };
    const a = E.isa(A.h0), g = A.gas, eff = A.eff;
    const epsC = (g.gc - 1) / g.gc;
    const S = sheet();
    S.sec('atm', 'Condición de diseño', 'Atmósfera estándar (ISA) a la altitud de crucero elegida.');
    S.data('h0', 'Altitud de crucero', 'h_{0}', A.h0, 'm');
    S.data('M0', 'Mach de crucero', 'M_{0}', A.M0, '');
    S.data('T0', 'Temperatura ambiente (ISA)', 'T_{0}', a.T, 'K');
    S.data('P0', 'Presión ambiente (ISA)', 'P_{0}', a.P, 'Pa');

    S.sec('pr', 'Relaciones de compresión', 'El π del HPC sale del punto de diseño del mapa; el del LPC se ajusta para que el producto dé el OPR del motor.');
    S.data('OPR', 'Relación de compresión global', 'OPR', A.OPR, '');
    S.data('pif', 'Relación de presiones del fan', 'π_{f}', A.pif, '');
    S.data('pihpc', 'Relación de presiones del HPC (mapa)', 'π_{HPC}', A.hpc.pi, '');
    const pilpc = S.st('pilpc', 'Relación de presiones del LPC', 'π_{LPC} = OPR/(π_{f}·π_{HPC})', '$OPR$/($pif$·$pihpc$)', A.OPR / (A.pif * A.hpc.pi), '');
    if (!(pilpc >= 1)) out.errors.push('π_LPC = ' + pilpc.toFixed(3) + ' < 1: el OPR es demasiado bajo para este π_f y este π_HPC. Sube el OPR o baja π_f.');
    else if (pilpc < 1.1) out.warnings.push('π_LPC casi 1: el compresor de baja apenas comprime. Revisa el OPR y π_f.');
    const pr = map.piRange(M);
    if (A.hpc.pi < pr[0] - 1e-6 || A.hpc.pi > pr[1] + 1e-6) out.warnings.push('π_HPC fuera del rango de la línea de operación del mapa (' + pr[0].toFixed(2) + '–' + pr[1].toFixed(2) + ').');

    S.sec('mf', 'Caudal a partir del mapa del HPC', 'El mapa da el caudal corregido a la entrada del HPC (estación 2.5). Con T_t y P_t en 2.5 se pasa a caudal real del núcleo, y con α al caudal total.');
    const tr = 1 + (g.gc - 1) / 2 * A.M0 * A.M0;
    S.st('tr', 'Relación de temperaturas de remanso', 'τ_{r} = 1 + (γ_{c}−1)/2·M_{0}^{2}', '1 + (' + num(g.gc) + '−1)/2·$M0$^{2}', tr, '');
    const prr = Math.pow(tr, g.gc / (g.gc - 1));
    S.st('pr', 'Relación de presiones de remanso', 'π_{r} = τ_{r}^{γ_{c}/(γ_{c}−1)}', '$tr$^{' + num(g.gc) + '/(' + num(g.gc) + '−1)}', prr, '');
    const etar = A.M0 <= 1 ? 1 : 1 - 0.075 * Math.pow(A.M0 - 1, 1.35);
    const pid = eff.pidmax * etar;
    S.data('pid', 'Recuperación de la toma', 'π_{d}', pid, '');
    const tf = Math.pow(A.pif, epsC / eff.ef), tl = Math.pow(Math.max(pilpc, 1), epsC / eff.ec);
    S.st('tf', 'Relación de temperaturas del fan', 'τ_{f} = π_{f}^{(γ_{c}−1)/(γ_{c}·e_{f})}', '$pif$^{(' + num(g.gc) + '−1)/(' + num(g.gc) + '·' + num(eff.ef) + ')}', tf, '');
    S.st('tlpc', 'Relación de temperaturas del LPC', 'τ_{LPC} = π_{LPC}^{(γ_{c}−1)/(γ_{c}·e_{c})}', '$pilpc$^{(' + num(g.gc) + '−1)/(' + num(g.gc) + '·' + num(eff.ec) + ')}', tl, '');
    const Tt25 = S.st('Tt25', 'Temperatura total a la entrada del HPC', 'T_{t25} = T_{0}·τ_{r}·τ_{f}·τ_{LPC}', '$T0$·$tr$·$tf$·$tlpc$', a.T * tr * tf * tl, 'K');
    const Pt25 = S.st('Pt25', 'Presión total a la entrada del HPC', 'P_{t25} = P_{0}·π_{r}·π_{d}·π_{f}·π_{LPC}', '$P0$·$pr$·$pid$·$pif$·$pilpc$', a.P * prr * pid * A.pif * Math.max(pilpc, 1), 'Pa', { alt: num(a.P * prr * pid * A.pif * Math.max(pilpc, 1) / 1000) + ' kPa' });
    S.data('Tref', 'Temperatura de referencia', 'T_{ref}', A.ref.T, 'K');
    S.data('Pref', 'Presión de referencia', 'P_{ref}', A.ref.P, 'Pa');
    const th = S.st('th', 'Temperatura corregida', 'θ_{25} = T_{t25}/T_{ref}', '$Tt25$/$Tref$', Tt25 / A.ref.T, '');
    const de = S.st('de', 'Presión corregida', 'δ_{25} = P_{t25}/P_{ref}', '$Pt25$/$Pref$', Pt25 / A.ref.P, '');
    S.data('mc', 'Caudal corregido del HPC (mapa)', 'ṁ_{c,25}', A.hpc.mc, 'kg/s');
    const mcore = S.st('mcore', 'Caudal real del núcleo', 'ṁ_{core} = ṁ_{c,25}·δ_{25}/√θ_{25}', '$mc$·$de$/√$th$', A.hpc.mc * de / Math.sqrt(th), 'kg/s');
    S.data('alpha', 'Relación de derivación', 'α', A.alpha, '');
    const m0 = S.st('m0', 'Caudal total de aire', 'ṁ_{0} = (1+α)·ṁ_{core}', '(1+$alpha$)·$mcore$', (1 + A.alpha) * mcore, 'kg/s');

    const input = {
      arch: 'turbofan',
      flight: { T0: a.T, P0: a.P, M0: A.M0 },
      gas: { gc: g.gc, cpc: g.cpc, gt: g.gt, cpt: g.cpt, hPR: A.fuel * 1e6 },
      design: { spools: 'two', pif: A.pif, pilpc: pilpc, pihpc: A.hpc.pi, alpha: A.alpha, Tt4: A.Tt4 },
      comp: Object.assign({}, eff, { etaHPC: A.hpc.eta }),
      nozzle: Object.assign({}, A.nozzle),
      size: { mdot0: m0, M2: 0.5 }
    };
    Object.assign(out, { input, sheet: S.secs, T0: a.T, P0: a.P, pilpc, Tt25, Pt25, theta25: th, delta25: de, mcore, m0 });
    if (out.errors.length) out.ok = false;
    return out;
  }

  /* ---------- Paso 2: punto de diseño ---------- */
  function designPoint(A, M) {
    const d = derive(A, M);
    if (!d.ok) return { ok: false, derive: d, error: d.errors[0] };
    const r = E.solve(d.input);
    return { ok: r.ok, derive: d, res: r, error: r.ok ? null : r.error };
  }

  return { HPC_MAP, map, DEFAULT, derive, designPoint, lerp };
})();
if (typeof module !== 'undefined') module.exports = Analysis;
