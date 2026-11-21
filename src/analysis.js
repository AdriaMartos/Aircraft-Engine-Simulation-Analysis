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
    src: {},                                       // fuente de cada dato, por clave
    hm: HM_DEF(), hpcD: HPC_DEF(), hptD: HPT_DEF(), od: OD_DEF()   // opciones de los pasos 3–6
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


  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const mfp = (g, M) => Math.sqrt(g) * M * Math.pow(1 + (g - 1) / 2 * M * M, -(g + 1) / (2 * (g - 1)));
  const machFromPtP = (g, r) => Math.sqrt(Math.max(0, 2 / (g - 1) * (Math.pow(r, (g - 1) / g) - 1)));
  // Mach en la garganta de una tobera (bloqueada si la relación de presiones supera la crítica)
  const throatM = (g, ptp) => ptp >= Math.pow((g + 1) / 2, g / (g - 1)) ? 1 : machFromPtP(g, ptp);

  /* ---------- Paso 3: mapas de calor π_LPC × π_HPC ----------
     Escenario i: ṁ_core y η_HPC fijos (los del punto de diseño).
     Escenario ii: ṁ_c,25 y η_HPC siguen la línea de operación del mapa para cada π_HPC. */
  const HM_DEF = () => ({ lpcMin: 1.2, lpcMax: 6, hpcMin: null, hpcMax: null, n: 31 });
  function heatmap(A, o, M) {
    M = M || HPC_MAP; o = Object.assign(HM_DEF(), o || {});
    const dp = designPoint(A, M); if (!dp.ok) return { ok: false, error: dp.error };
    const pr = map.piRange(M);
    const hMin = o.hpcMin != null ? o.hpcMin : pr[0], hMax = o.hpcMax != null ? o.hpcMax : pr[1];
    const n = Math.max(5, Math.min(61, Math.round(o.n)));
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) { xs.push(o.lpcMin + (o.lpcMax - o.lpcMin) * i / (n - 1)); ys.push(hMin + (hMax - hMin) * i / (n - 1)); }
    const base = dp.derive.input, mcoreD = dp.derive.mcore;
    const grids = {};
    for (const sc of ['i', 'ii']) {
      const cells = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const pl = xs[i], ph = ys[j];
        const inp = JSON.parse(JSON.stringify(base));
        inp.design.pilpc = pl; inp.design.pihpc = ph;
        let eta = A.hpc.eta, mcore = mcoreD, mc = null;
        if (sc === 'ii') { mc = map.mcFromPi(ph, M); eta = map.etaFromMc(mc, M); }
        inp.comp.etaHPC = eta;
        inp.size = { mdot0: 1, M2: 0.5 };
        const r = E.solve(inp);
        const c = { i, j, pl, ph, opr: A.pif * pl * ph, eta, ok: r.ok };
        if (r.ok) {
          if (sc === 'ii') mcore = mc * (r.Pt25 / A.ref.P) / Math.sqrt(r.Tt25 / A.ref.T);
          const m0 = (1 + A.alpha) * mcore;
          Object.assign(c, { mcore, m0, F: r.Fsp * m0, Fsp: r.Fsp, tsfc: r.tsfc, etaT: r.etaT, etaP: r.etaP, etaO: r.etaO, undef: r.dek <= 0 || r.Fsp <= 0 });
        } else c.error = r.error;
        cells.push(c);
      }
      grids[sc] = cells;
    }
    return { ok: true, xs, ys, n, grids, design: { pl: dp.derive.pilpc, ph: A.hpc.pi, F: dp.res.size.F, tsfc: dp.res.tsfc, etaT: dp.res.etaT, etaP: dp.res.etaP, etaO: dp.res.etaO, Fsp: dp.res.Fsp }, opts: o };
  }

  /* ---------- Paso 4: compresor de alta con etapas repetidas (repeating-row, repeating-stage) ---------- */
  const HPC_DEF = () => ({ M1: 0.5, a1: 30, D: 0.5, sigma: 1, ec: null, rm: 0.30 });
  // α₂ en función de α₁, D y σ (eq. 3.39)
  function alpha2(a1, D, s) {
    const c = Math.cos(a1 * D2R), G = (2 * s + Math.sin(a1 * D2R)) / c;
    const ca2 = (2 * s * (1 - D) * G + Math.sqrt(G * G + 1 - 4 * s * s * (1 - D) * (1 - D))) / (G * G + 1);
    return Math.acos(Math.min(1, ca2)) * R2D;
  }
  // Curvas de la figura de diseño: ωr/V₁, π_cs(M₁) y α₂ frente a α₁
  function hpcChart(a1, M1, D, s, ec, g) {
    const a2 = alpha2(a1, D, s), c1 = Math.cos(a1 * D2R), c2 = Math.cos(a2 * D2R);
    const tcs = 1 + (g - 1) * M1 * M1 / (1 + (g - 1) / 2 * M1 * M1) * (c1 * c1 / (c2 * c2) - 1);
    return { a2, tcs, pcs: Math.pow(tcs, g * ec / (g - 1)), wrV: c1 * (Math.tan(a1 * D2R) + Math.tan(a2 * D2R)) };
  }
  function hpcDesign(A, o, M) {
    o = Object.assign(HPC_DEF(), o || {});
    const dp = designPoint(A, M); if (!dp.ok) return { ok: false, error: dp.error };
    const r = dp.res, g = A.gas.gc, cp = A.gas.cpc, R = (g - 1) / g * cp, eps = (g - 1) / g;
    const out = { ok: true, warnings: [], o };
    const S = sheet();
    S.sec('in', 'Datos del compresor de alta', 'Vienen del punto de diseño (pasos 1 y 2). El diseño de etapas usa la eficiencia politrópica, que vale lo mismo para una etapa que para todo el compresor (eq. 3.43).');
    S.data('Tt1', 'Temperatura total a la entrada (2.5)', 'T_{t25}', r.Tt25, 'K');
    S.data('Pt1', 'Presión total a la entrada (2.5)', 'P_{t25}', r.Pt25, 'Pa');
    S.data('Tt3', 'Temperatura total a la salida (3)', 'T_{t3}', r.Tt3, 'K');
    S.data('pic', 'Relación de presiones del HPC', 'π_{HPC}', r.pihpc, '');
    S.data('tc', 'Relación de temperaturas del HPC', 'τ_{HPC}', r.thpc, '');
    const ecEq = eps * Math.log(r.pihpc) / Math.log(r.thpc);
    const ec = o.ec > 0 ? o.ec : ecEq;
    S.st('ec', 'Eficiencia politrópica equivalente', 'e_{c} = ((γ−1)/γ)·ln π_{HPC}/ln τ_{HPC}', '(' + num(g) + '−1)/' + num(g) + '·ln $pic$/ln $tc$', ecEq, '', { note: o.ec > 0 ? 'Se usa el valor fijado a mano: e_c = ' + num(o.ec) + '.' : 'Eq. 3.26: misma η_HPC del mapa expresada como politrópica.' });
    V_set(S, 'ecu', ec);
    S.sec('tri', 'Triángulos de velocidades de la etapa', 'Etapa de filas repetidas: α₁ = β₂ = α₃ y β₁ = α₂ = β₃, velocidad axial constante y radio medio constante. Elegidos: M₁ = ' + num(o.M1) + ', α₁ = ' + num(o.a1) + '°, D = ' + num(o.D) + ', σ = ' + num(o.sigma) + '.');
    S.data('M1', 'Mach absoluto a la entrada del rotor', 'M_{1}', o.M1, '');
    S.data('a1', 'Ángulo absoluto a la entrada', 'α_{1}', o.a1, '°');
    const c1 = Math.cos(o.a1 * D2R);
    const G = S.st('G', 'Parámetro auxiliar', 'Γ = (2σ + sin α_{1})/cos α_{1}', '(2·' + num(o.sigma) + ' + sin $a1$°)/cos $a1$°', (2 * o.sigma + Math.sin(o.a1 * D2R)) / c1, '');
    const a2 = S.st('a2', 'Ángulo absoluto a la salida del rotor', 'cos α_{2} = [2σ(1−D)Γ + √(Γ^{2}+1−4σ^{2}(1−D)^{2})]/(Γ^{2}+1)', '[2·' + num(o.sigma) + '·(1−' + num(o.D) + ')·$G$ + √($G$^{2}+1−4·' + num(o.sigma) + '^{2}·(1−' + num(o.D) + ')^{2})]/($G$^{2}+1)', alpha2(o.a1, o.D, o.sigma), '°', { note: 'Eq. 3.39' });
    const T1 = S.st('T1', 'Temperatura estática a la entrada', 'T_{1} = T_{t25}/(1 + (γ−1)/2·M_{1}^{2})', '$Tt1$/(1 + (' + num(g) + '−1)/2·$M1$^{2})', r.Tt25 / (1 + (g - 1) / 2 * o.M1 * o.M1), 'K');
    const a_1 = Math.sqrt(g * R * T1);
    const V1 = S.st('V1', 'Velocidad absoluta a la entrada', 'V_{1} = M_{1}·√(γ·R·T_{1})', '$M1$·√(' + num(g) + '·' + num(R) + '·$T1$)', o.M1 * a_1, 'm/s');
    const u = S.st('u', 'Velocidad axial (constante)', 'u = V_{1}·cos α_{1}', '$V1$·cos $a1$°', V1 * c1, 'm/s');
    const v1 = S.st('v1', 'Componente tangencial a la entrada', 'v_{1} = u·tan α_{1}', '$u$·tan $a1$°', u * Math.tan(o.a1 * D2R), 'm/s');
    const v2 = S.st('v2', 'Componente tangencial a la salida del rotor', 'v_{2} = u·tan α_{2}', '$u$·tan $a2$°', u * Math.tan(a2 * D2R), 'm/s');
    const U = S.st('U', 'Velocidad de pala en el radio medio', 'U = ωr = v_{1} + v_{2}', '$v1$ + $v2$', v1 + v2, 'm/s', { note: 'Eq. 3.37 (fila repetida). Equivale a ωr/V₁ = cos α₁(tan α₁ + tan α₂), eq. 3.45.' });
    const V2 = S.st('V2', 'Velocidad absoluta a la salida del rotor', 'V_{2} = u/cos α_{2}', '$u$/cos $a2$°', u / Math.cos(a2 * D2R), 'm/s');
    S.st('V1R', 'Velocidad relativa a la entrada del rotor', 'V_{1R} = V_{2} (simetría)', '$V2$', V2, 'm/s');
    S.st('V2R', 'Velocidad relativa a la salida del rotor', 'V_{2R} = V_{1} (simetría)', '$V1$', V1, 'm/s');
    const M1R = S.st('M1R', 'Mach relativo a la entrada del rotor', 'M_{1R} = V_{1R}/a_{1}', '$V2$/' + num(a_1), V2 / a_1, '');
    const Psi = S.st('Psi', 'Coeficiente de carga', 'Ψ = (tan α_{2} − tan α_{1})/(tan α_{1} + tan α_{2})', '(tan $a2$° − tan $a1$°)/(tan $a1$° + tan $a2$°)', (Math.tan(a2 * D2R) - Math.tan(o.a1 * D2R)) / (Math.tan(o.a1 * D2R) + Math.tan(a2 * D2R)), '', { note: 'Eq. 3.46' });
    const Phi = S.st('Phi', 'Coeficiente de flujo', 'Φ = 1/(tan α_{1} + tan α_{2})', '1/(tan $a1$° + tan $a2$°)', 1 / (Math.tan(o.a1 * D2R) + Math.tan(a2 * D2R)), '');
    S.data('Rc', 'Grado de reacción', 'R_{c}', 0.5, '', '0,5 (exacto en etapas de filas repetidas)');
    S.sec('st', 'Etapa y número de etapas', 'Cada etapa repetida sube la misma T_t (eq. 3.40); las etapas necesarias salen de dividir el salto total entre el de una etapa (eq. 3.50).');
    const tcs = S.st('tcs', 'Relación de temperaturas de la primera etapa', 'τ_{cs} = 1 + (γ−1)M_{1}^{2}/(1+(γ−1)/2·M_{1}^{2})·(cos^{2}α_{1}/cos^{2}α_{2} − 1)', '1 + (' + num(g) + '−1)·$M1$^{2}/(1+(' + num(g) + '−1)/2·$M1$^{2})·(cos^{2}$a1$°/cos^{2}$a2$° − 1)', 1 + (g - 1) * o.M1 * o.M1 / (1 + (g - 1) / 2 * o.M1 * o.M1) * (c1 * c1 / Math.pow(Math.cos(a2 * D2R), 2) - 1), '', { note: 'Eq. 3.41' });
    const pcs = S.st('pcs', 'Relación de presiones de la primera etapa', 'π_{cs} = τ_{cs}^{γ·e_{c}/(γ−1)}', '$tcs$^{' + num(g) + '·' + num(ec) + '/(' + num(g) + '−1)}', Math.pow(tcs, g * ec / (g - 1)), '');
    S.st('ecs', 'Eficiencia isentrópica de la etapa', 'η_{cs} = (π_{cs}^{(γ−1)/γ} − 1)/(τ_{cs} − 1)', '($pcs$^{(' + num(g) + '−1)/' + num(g) + '} − 1)/($tcs$ − 1)', (Math.pow(pcs, eps) - 1) / (tcs - 1), '');
    const dTs = S.st('dTs', 'Salto de temperatura por etapa', 'ΔT_{t,etapa} = (V_{2}^{2} − V_{1}^{2})/c_{p}', '($V2$^{2} − $V1$^{2})/' + num(cp), (V2 * V2 - V1 * V1) / cp, 'K');
    const dT = S.st('dT', 'Salto de temperatura del HPC', 'ΔT_{t,HPC} = T_{t3} − T_{t25}', '$Tt3$ − $Tt1$', r.Tt3 - r.Tt25, 'K');
    const ns = S.st('ns', 'Número de etapas (exacto)', 'n_{s} = ΔT_{t,HPC}/ΔT_{t,etapa}', '$dT$/$dTs$', dT / dTs, '');
    const N = Math.max(1, Math.ceil(ns - 1e-6));
    S.data('N', 'Número de etapas (entero)', 'N', N, '', String(N) + ' (se redondea hacia arriba)');
    const dTr = S.st('dTr', 'Salto real por etapa con N etapas', 'ΔT_{t} = ΔT_{t,HPC}/N', '$dT$/' + N, dT / N, 'K', { note: 'Con N entero cada etapa trabaja un poco por debajo de su capacidad (' + num(100 * (dT / N) / dTs) + ' %).' });
    // tabla de etapas
    const stages = []; let Tt = r.Tt25, Pt = r.Pt25;
    for (let k = 1; k <= N; k++) {
      const To = Tt + dTr, tk = To / Tt, pk = Math.pow(tk, g * ec / (g - 1));
      stages.push({ k, Tin: Tt, Tout: To, tau: tk, pi: pk, Pin: Pt, Pout: Pt * pk });
      Tt = To; Pt *= pk;
    }
    const piTot = Pt / r.Pt25;
    S.sec('ar', 'Velocidad de giro y alturas de álabe', 'Con un radio medio supuesto se obtiene el régimen de giro; las áreas salen del parámetro de flujo másico con A⊥ = A·cos α (eq. 2.7).');
    S.data('rm', 'Radio medio (supuesto)', 'r_{m}', o.rm, 'm');
    const w = S.st('w', 'Velocidad angular', 'ω = U/r_{m}', '$U$/$rm$', U / o.rm, 'rad/s', { alt: num(U / o.rm * 60 / (2 * Math.PI)) + ' rpm' });
    const mcore = dp.derive.mcore;
    S.data('mcore', 'Caudal del núcleo', 'ṁ_{core}', mcore, 'kg/s');
    const Ain = S.st('Ain', 'Área anular a la entrada', 'A_{1} = ṁ·√(R·T_{t25})/(cos α_{1}·P_{t25}·MFP(M_{1}))', '$mcore$·√(' + num(R) + '·$Tt1$)/(cos $a1$°·$Pt1$·' + num(mfp(g, o.M1)) + ')', mcore * Math.sqrt(R * r.Tt25) / (c1 * r.Pt25 * mfp(g, o.M1)), 'm²');
    const T3s = r.Tt3 - V1 * V1 / (2 * cp), M3 = V1 / Math.sqrt(g * R * T3s);
    S.st('M3', 'Mach a la salida del compresor', 'M_{3} = V_{1}/√(γ·R·(T_{t3} − V_{1}^{2}/(2c_{p})))', '$V1$/√(' + num(g) + '·' + num(R) + '·($Tt3$ − $V1$^{2}/(2·' + num(cp) + ')))', M3, '', { note: 'Eq. 3.44: la velocidad se repite pero el sonido es más rápido, así que M baja.' });
    const Aout = S.st('Aout', 'Área anular a la salida', 'A_{3} = ṁ·√(R·T_{t3})/(cos α_{1}·P_{t3}·MFP(M_{3}))', '$mcore$·√(' + num(R) + '·$Tt3$)/(cos $a1$°·' + num(r.Pt3) + '·' + num(mfp(g, M3)) + ')', mcore * Math.sqrt(R * r.Tt3) / (c1 * r.Pt3 * mfp(g, M3)), 'm²');
    S.st('hin', 'Altura de álabe a la entrada', 'h_{1} = A_{1}/(2π·r_{m})', '$Ain$/(2π·$rm$)', Ain / (2 * Math.PI * o.rm), 'm');
    S.st('hout', 'Altura de álabe a la salida', 'h_{3} = A_{3}/(2π·r_{m})', '$Aout$/(2π·$rm$)', Aout / (2 * Math.PI * o.rm), 'm');
    if (o.M1 < 0.4 || o.M1 > 0.6) out.warnings.push('M₁ fuera del intervalo recomendado (0,4–0,6).');
    if (M1R > 1) out.warnings.push('M₁R = ' + M1R.toFixed(2) + ' > 1: rotor transónico a la entrada.');
    if (o.a1 > 45) out.warnings.push('α₁ alto: los álabes guía de entrada tendrían que girar mucho el flujo.');
    if (U > 500) out.warnings.push('U = ' + U.toFixed(0) + ' m/s: velocidad de pala muy alta para un compresor.');
    if (Math.abs(piTot / r.pihpc - 1) > 1e-6) out.warnings.push('Con e_c fijado a mano, las N etapas dan π = ' + piTot.toFixed(3) + ' en vez de π_HPC = ' + r.pihpc.toFixed(3) + '.');
    Object.assign(out, { sheet: S.secs, dp, g, R, cp, ec, ecEq, a1: o.a1, a2, M1: o.M1, T1, V1, V2, u, v1, v2, U, M1R, Psi, Phi, tcs, pcs, dTs, dT, ns, N, dTr, stages, piTot, w, rpm: U / o.rm * 60 / (2 * Math.PI), Ain, Aout, M3, rm: o.rm });
    return out;
  }
  function V_set(S, k, v) { S.V[k] = v; }

  /* ---------- Paso 5: turbina de alta de una etapa, velocidad axial constante, salida sin giro ---------- */
  const HPT_DEF = () => ({ Psi: 1.6, Phi: 0.65 });
  function hptDesign(A, o, hpc, M) {
    o = Object.assign(HPT_DEF(), o || {});
    const dp = designPoint(A, M); if (!dp.ok) return { ok: false, error: dp.error };
    const r = dp.res, g = A.gas.gt, cp = A.gas.cpt, R = (g - 1) / g * cp;
    const out = { ok: true, warnings: [], o };
    const S = sheet();
    S.sec('in', 'Datos de la turbina de alta', 'El salto de temperatura sale del balance de potencias del eje de alta (paso 2). Se eligen el coeficiente de carga Ψ y el de flujo Φ; la velocidad de pala sale de Ψ.');
    S.data('Tt4', 'Temperatura total a la entrada (4)', 'T_{t4}', r.Tt4, 'K');
    S.data('Tt45', 'Temperatura total a la salida (4.5)', 'T_{t45}', r.Tt45, 'K');
    S.data('Pt4', 'Presión total a la entrada', 'P_{t4}', r.Pt4, 'Pa');
    S.data('Psi', 'Coeficiente de carga (elegido)', 'Ψ', o.Psi, '');
    S.data('Phi', 'Coeficiente de flujo (elegido)', 'Φ', o.Phi, '');
    const dT = S.st('dT', 'Salto de temperatura de la etapa', 'ΔT_{t} = T_{t4} − T_{t45}', '$Tt4$ − $Tt45$', r.Tt4 - r.Tt45, 'K');
    const U = S.st('U', 'Velocidad de pala necesaria', 'U = √(c_{pt}·ΔT_{t}/Ψ)', '√(' + num(cp) + '·$dT$/$Psi$)', Math.sqrt(cp * dT / o.Psi), 'm/s', { note: 'Definición de Ψ = c_p·ΔT_t/U² (eq. 4.41).' });
    const Rt = S.st('Rt', 'Grado de reacción', 'R_{t} = 1 − Ψ/2', '1 − $Psi$/2', 1 - o.Psi / 2, '', { note: 'Eq. 4.31: con salida sin giro (α₃ = 0), carga y reacción van ligadas.' });
    S.sec('tri', 'Triángulos de velocidades', 'Convenio de la turbina: v₂ positivo en el sentido de U, v₃ positivo en sentido contrario. v₂R = v₂ − U, v₃R = v₃ + U.');
    const u = S.st('u', 'Velocidad axial (constante)', 'u = Φ·U', '$Phi$·$U$', o.Phi * U, 'm/s');
    const v2 = S.st('v2', 'Componente tangencial a la salida del estator', 'v_{2} = Ψ·U (con v_{3} = 0)', '$Psi$·$U$', o.Psi * U, 'm/s');
    const a2 = S.st('a2', 'Ángulo absoluto a la salida del estator', 'α_{2} = atan(v_{2}/u)', 'atan($v2$/$u$)', Math.atan(v2 / u) * R2D, '°');
    const V2 = S.st('V2', 'Velocidad absoluta a la salida del estator', 'V_{2} = √(u^{2} + v_{2}^{2})', '√($u$^{2} + $v2$^{2})', Math.hypot(u, v2), 'm/s');
    const b2 = S.st('b2', 'Ángulo relativo a la entrada del rotor', 'β_{2} = atan((v_{2} − U)/u)', 'atan(($v2$ − $U$)/$u$)', Math.atan((v2 - U) / u) * R2D, '°');
    const V2R = S.st('V2R', 'Velocidad relativa a la entrada del rotor', 'V_{2R} = √(u^{2} + (v_{2} − U)^{2})', '√($u$^{2} + ($v2$ − $U$)^{2})', Math.hypot(u, v2 - U), 'm/s');
    const b3 = S.st('b3', 'Ángulo relativo a la salida del rotor', 'β_{3} = atan(U/u)', 'atan($U$/$u$)', Math.atan(U / u) * R2D, '°');
    const V3R = S.st('V3R', 'Velocidad relativa a la salida del rotor', 'V_{3R} = √(u^{2} + U^{2})', '√($u$^{2} + $U$^{2})', Math.hypot(u, U), 'm/s');
    S.st('V3', 'Velocidad absoluta a la salida', 'V_{3} = u (α_{3} = 0)', '$u$', u, 'm/s');
    S.st('eps', 'Deflexión del rotor', 'ε = β_{2} + β_{3}', '$b2$ + $b3$', b2 + b3, '°');
    S.st('PsiPhi', 'Ψ/Φ (eje de la figura de diseño)', 'Ψ/Φ = tan β_{2} + tan β_{3}', 'tan $b2$° + tan $b3$°', o.Psi / o.Phi, '');
    S.st('RtPhi', 'R_t/Φ (eje de la figura de diseño)', 'R_{t}/Φ = (tan β_{3} − tan β_{2})/2', '(tan $b3$° − tan $b2$°)/2', Rt / o.Phi, '');
    S.sec('th', 'Ciclo de la etapa', 'El estator no da trabajo (T_t se conserva); el rotor baja T_t hasta T_t45. Las estáticas salen de restar la energía cinética.');
    const T2 = S.st('T2', 'Temperatura estática a la salida del estator', 'T_{2} = T_{t4} − V_{2}^{2}/(2c_{pt})', '$Tt4$ − $V2$^{2}/(2·' + num(cp) + ')', r.Tt4 - V2 * V2 / (2 * cp), 'K');
    const M2 = S.st('M2', 'Mach a la salida del estator', 'M_{2} = V_{2}/√(γ_{t}·R·T_{2})', '$V2$/√(' + num(g) + '·' + num(R) + '·$T2$)', V2 / Math.sqrt(g * R * T2), '');
    S.st('M2R', 'Mach relativo a la entrada del rotor', 'M_{2R} = V_{2R}/√(γ_{t}·R·T_{2})', '$V2R$/√(' + num(g) + '·' + num(R) + '·$T2$)', V2R / Math.sqrt(g * R * T2), '');
    const T3 = S.st('T3', 'Temperatura estática a la salida', 'T_{3} = T_{t45} − u^{2}/(2c_{pt})', '$Tt45$ − $u$^{2}/(2·' + num(cp) + ')', r.Tt45 - u * u / (2 * cp), 'K');
    S.st('M3', 'Mach a la salida', 'M_{3} = u/√(γ_{t}·R·T_{3})', '$u$/√(' + num(g) + '·' + num(R) + '·$T3$)', u / Math.sqrt(g * R * T3), '');
    const M3R = S.st('M3R', 'Mach relativo a la salida del rotor', 'M_{3R} = V_{3R}/√(γ_{t}·R·T_{3})', '$V3R$/√(' + num(g) + '·' + num(R) + '·$T3$)', V3R / Math.sqrt(g * R * T3), '');
    S.data('pts', 'Relación de presiones de la etapa', 'π_{tH}', r.pith, '');
    S.data('tts', 'Relación de temperaturas de la etapa', 'τ_{tH}', r.tth, '');
    S.st('ets', 'Eficiencia isentrópica de la etapa', 'η_{ts} = (1 − τ_{tH})/(1 − π_{tH}^{(γ_{t}−1)/γ_{t}})', '(1 − $tts$)/(1 − $pts$^{(' + num(g) + '−1)/' + num(g) + '})', (1 - r.tth) / (1 - Math.pow(r.pith, (g - 1) / g)), '');
    // eje común con el HPC
    let rmH = null, ratio = null;
    if (hpc && hpc.ok) {
      S.sec('ax', 'Mismo eje que el compresor de alta', 'La HPT gira a la misma ω que el HPC; para dar la U necesaria su radio medio tiene que ser r = U/ω.');
      S.data('w', 'Velocidad angular del eje de alta (paso 4)', 'ω', hpc.w, 'rad/s', num(hpc.w) + ' rad/s (' + num(hpc.rpm) + ' rpm)');
      rmH = S.st('rmH', 'Radio medio de la turbina', 'r_{m,HPT} = U/ω', '$U$/$w$', U / hpc.w, 'm');
      S.data('rmC', 'Radio medio del compresor (paso 4)', 'r_{m,HPC}', hpc.rm, 'm');
      ratio = S.st('ratio', 'Relación de radios', 'r_{m,HPT}/r_{m,HPC}', '$rmH$/$rmC$', rmH / hpc.rm, '');
      const m4 = dp.derive.mcore * (1 + r.f);
      S.data('m4', 'Caudal de gas', 'ṁ_{4}', m4, 'kg/s');
      const A2 = S.st('A2', 'Área a la salida del estator', 'A_{2} = ṁ_{4}·√(R·T_{t4})/(cos α_{2}·P_{t4}·MFP(M_{2}))', '$m4$·√(' + num(R) + '·$Tt4$)/(cos $a2$°·$Pt4$·' + num(mfp(g, Math.min(M2, 1))) + ')', m4 * Math.sqrt(R * r.Tt4) / (Math.cos(a2 * D2R) * r.Pt4 * mfp(g, Math.min(M2, 1))), 'm²', { note: M2 > 1 ? 'Con M₂ > 1 se usa la garganta (M = 1), que es la que fija el caudal.' : '' });
      S.st('h2', 'Altura de álabe', 'h = A_{2}/(2π·r_{m,HPT})', '$A2$/(2π·$rmH$)', A2 / (2 * Math.PI * rmH), 'm');
    }
    if (a2 > 70) out.warnings.push('α₂ = ' + a2.toFixed(1) + '° > 70°: pérdidas inaceptables en el estator. Baja Ψ o sube Φ.');
    if (M2 <= 1) out.warnings.push('M₂ = ' + M2.toFixed(2) + ' ≤ 1: el estator no está bloqueado y no fijaría el caudal del motor.');
    if (M3R >= 0.9) out.warnings.push('M₃R = ' + M3R.toFixed(2) + ' ≥ 0,9: rotor demasiado cerca de sónico a la salida.');
    if (Rt < 0) out.warnings.push('R_t < 0 (Ψ > 2): reacción negativa, la etapa estaría sobrecargada. Hace falta más U (más radio o régimen) o una segunda etapa.');
    if (ratio && ratio > 1.8) out.warnings.push('La turbina necesita un radio ' + ratio.toFixed(2) + ' veces el del compresor: es mucho. Baja Ψ o acepta una segunda etapa.');
    Object.assign(out, { sheet: S.secs, dp, g, cp, R, dT, U, Rt, u, v2, a2, V2, b2, V2R, b3, V3R, V3: u, T2, M2, T3, M3R, rmH, ratio, Psi: o.Psi, Phi: o.Phi, eps: b2 + b3 });
    return out;
  }

  /* ---------- Paso 6: fuera de diseño (método del tema 7) ----------
     Turbinas de alta y baja con entrada bloqueada (τ_tH constante), toberas con garganta,
     reparto de potencia fan/LPC constante, α variable a partir de los caudales; iteración. */
  const OD_DEF = () => ({ h: 0, M0: 0, dTt4: 100, Tt4: null });
  function offDesign(A, o, M) {
    o = Object.assign(OD_DEF(), o || {});
    const dp = designPoint(A, M); if (!dp.ok) return { ok: false, error: dp.error };
    const d = dp.res, inp = dp.derive.input, c = inp.comp, g = inp.gas;
    const gc = g.gc, gt = g.gt, cpc = g.cpc, cpt = g.cpt, epsC = (gc - 1) / gc;
    const a = E.isa(o.h), T0 = a.T, P0 = a.P, M0 = o.M0;
    const Tt4 = o.Tt4 > 0 ? o.Tt4 : d.Tt4 + o.dTt4;
    // constantes de diseño
    const KP = A.alpha * (d.tf - 1) / (d.tf * d.tlpc - 1);                // reparto de potencia fan secundario / núcleo
    const M8D = throatM(gt, d.Pt9 / d.P0), M18D = throatM(gc, d.Pt19 / d.P0);
    const nL = gt / ((gt - 1) * c.et) - 0.5;
    const C9 = Math.pow(d.ttl, nL) * mfp(gt, M8D);                         // π_tL·MFP(M8)/√τ_tL = cte
    const mcD = dp.derive.mcore;
    const r19D = d.Pt19 / d.Pt4, t19D = d.Tt4 / d.Tt13;
    // iteración
    const tr = 1 + (gc - 1) / 2 * M0 * M0, pr = Math.pow(tr, gc / (gc - 1));
    const etar = M0 <= 1 ? 1 : 1 - 0.075 * Math.pow(M0 - 1, 1.35), pid = c.pidmax * etar;
    const Tt2 = T0 * tr, Pt2 = P0 * pr * pid;
    let ttl = d.ttl, al = A.alpha, f = d.f, it = 0, err = 1, st = null;
    const hist = [];
    for (; it < 400 && err > 1e-11; it++) {
      const Tt45 = Tt4 * d.tth;
      const X = 1 + c.etam * (1 + f) * cpt * Tt45 * (1 - ttl) / ((1 + KP) * cpc * Tt2);   // τ_f·τ_LPC
      const tf = 1 + KP * (X - 1) / al, tl = X / tf;
      if (!(tf > 1 && tl >= 0.999)) return { ok: false, error: 'La iteración fuera de diseño no converge: el reparto entre fan y LPC deja de tener sentido con estos datos (τ_f = ' + tf.toFixed(3) + ', τ_LPC = ' + tl.toFixed(3) + ').' };
      const pf = Math.pow(tf, gc * c.ef / (gc - 1)), pl = Math.pow(tl, gc * c.ec / (gc - 1));
      const Tt25 = Tt2 * X, Pt25 = Pt2 * pf * pl;
      const th = 1 + c.etam * (1 + f) * cpt * Tt4 * (1 - d.tth) / (cpc * Tt25);
      const ph = Math.pow(1 + c.etaHPC * (th - 1), 1 / epsC);
      const Tt3 = Tt25 * th, Pt3 = Pt25 * ph;
      if (!(Tt4 > Tt3)) return { ok: false, error: 'T_t4 no supera T_t3 fuera de diseño: sube T_t4.' };
      f = (cpt * Tt4 - cpc * Tt3) / (c.etab * inp.gas.hPR - cpt * Tt4);
      const Pt4 = Pt3 * c.pib, Pt9 = Pt4 * d.pith * Math.pow(ttl, gt / ((gt - 1) * c.et)) * c.pin;
      if (!(Pt9 > P0)) return { ok: false, error: 'Fuera de diseño la presión a la salida del núcleo no supera la ambiente.' };
      const M8 = throatM(gt, Pt9 / P0);
      const ttlN = Math.pow(C9 / mfp(gt, M8), 1 / nL);
      const Tt13 = Tt2 * tf, Pt19 = Pt2 * pf * c.pifn;
      if (!(Pt19 > P0)) return { ok: false, error: 'Fuera de diseño la presión a la salida del fan no supera la ambiente.' };
      const M18 = throatM(gc, Pt19 / P0);
      const alN = A.alpha * (Pt19 / Pt4) / r19D * Math.sqrt((Tt4 / Tt13) / t19D) * mfp(gc, M18) / mfp(gc, M18D);
      err = Math.abs(ttlN - ttl) + Math.abs(alN - al) / al;
      ttl += 0.6 * (ttlN - ttl); al += 0.6 * (alN - al);
      st = { X, tf, tl, pf, pl, th, ph, Tt25, Pt25, Tt3, Pt3, Pt4, Pt9, Pt19, Tt13, M8, M18, f };
      if (it < 60) hist.push({ it: it + 1, ttl, al, tf, err });
    }
    if (err > 1e-8) return { ok: false, error: 'La iteración fuera de diseño no ha convergido.' };
    const mcore = mcD * (st.Pt4 / d.Pt4) * Math.sqrt(d.Tt4 / Tt4) * (1 + d.f) / (1 + st.f);
    const m0 = (1 + al) * mcore;
    const nz = Object.assign({}, inp.nozzle); if (nz.kindCore === 'cd') nz.p0p9 = 1; if (nz.kindFan === 'cd') nz.p0p19 = 1;
    const sol = E.solve(Object.assign({}, inp, { flight: { T0, P0, M0 }, design: { spools: 'two', pif: st.pf, pilpc: st.pl, pihpc: st.ph, alpha: al, Tt4 }, nozzle: nz, size: { mdot0: m0, M2: 0.5 } }));
    if (!sol.ok) return { ok: false, error: sol.error };
    const mc25 = mcore * Math.sqrt(st.Tt25 / A.ref.T) / (st.Pt25 / A.ref.P);
    // hoja de cálculo con el estado convergido
    const S = sheet();
    S.sec('hy', 'Hipótesis del fuera de diseño', 'Turbinas con entrada bloqueada (τ_tH constante), toberas con garganta de área fija, eficiencias constantes y reparto de potencia fan/LPC constante. Incógnitas: τ_f, τ_LPC, τ_tL, α y los Mach de las toberas; se parte de los valores de diseño y se itera.');
    S.data('h', 'Altitud', 'h', o.h, 'm'); S.data('M0', 'Mach de vuelo', 'M_{0}', M0, '');
    S.data('T0', 'Temperatura ambiente', 'T_{0}', T0, 'K'); S.data('P0', 'Presión ambiente', 'P_{0}', P0, 'Pa');
    S.data('Tt4', 'Temperatura de entrada a turbina (supuesta)', 'T_{t4}', Tt4, 'K');
    S.data('tth', 'τ de la turbina de alta (= diseño)', 'τ_{tH}', d.tth, '');
    S.data('KP', 'Reparto de potencia (diseño)', "K' = α(τ_{f}−1)/(τ_{f}τ_{LPC}−1)", KP, '');
    S.data('C9', 'Constante de la tobera del núcleo (diseño)', 'π_{tL}·MFP(M_{8})/√τ_{tL}', C9, '');
    S.sec('cv', 'Estado convergido', 'Valores tras ' + it + ' iteraciones (error < 10⁻¹¹).');
    S.data('ttl', 'τ de la turbina de baja', 'τ_{tL}', ttl, ''); S.data('al', 'Relación de derivación', 'α', al, '');
    S.data('tf', 'Relación de temperaturas del fan', 'τ_{f}', st.tf, ''); S.data('pf', 'π del fan', 'π_{f}', st.pf, '');
    S.data('tl', 'Relación de temperaturas del LPC', 'τ_{LPC}', st.tl, ''); S.data('pl', 'π del LPC', 'π_{LPC}', st.pl, '');
    S.data('th', 'Relación de temperaturas del HPC', 'τ_{HPC}', st.th, ''); S.data('ph', 'π del HPC', 'π_{HPC}', st.ph, '');
    S.data('f', 'Relación combustible/aire', 'f', st.f, '');
    S.data('M8', 'Mach en la garganta del núcleo', 'M_{8}', st.M8, ''); S.data('M18', 'Mach en la garganta del fan', 'M_{18}', st.M18, '');
    S.sec('mf', 'Caudal', 'La turbina de alta bloqueada fija el caudal del núcleo: ṁ(1+f)·√T_t4/P_t4 = cte.');
    S.data('mcD', 'Caudal del núcleo de diseño', 'ṁ_{core,D}', mcD, 'kg/s');
    S.data('Pt4', 'P_t4 fuera de diseño', 'P_{t4}', st.Pt4, 'Pa'); S.data('Pt4D', 'P_t4 de diseño', 'P_{t4,D}', d.Pt4, 'Pa'); S.data('Tt4D', 'T_t4 de diseño', 'T_{t4,D}', d.Tt4, 'K');
    S.st('mcore', 'Caudal del núcleo', 'ṁ_{core} = ṁ_{core,D}·(P_{t4}/P_{t4,D})·√(T_{t4,D}/T_{t4})·(1+f_{D})/(1+f)', '$mcD$·($Pt4$/$Pt4D$)·√($Tt4D$/$Tt4$)·(1+' + num(d.f) + ')/(1+$f$)', mcore, 'kg/s');
    S.st('m0', 'Caudal total', 'ṁ_{0} = (1+α)·ṁ_{core}', '(1+$al$)·$mcore$', m0, 'kg/s');
    S.st('mc25', 'Caudal corregido en el HPC', 'ṁ_{c,25} = ṁ_{core}·√θ_{25}/δ_{25}', '$mcore$·√(' + num(st.Tt25) + '/' + num(A.ref.T) + ')/(' + num(st.Pt25) + '/' + num(A.ref.P) + ')', mc25, 'kg/s', { note: 'Punto de funcionamiento del HPC: compáralo con la línea de operación del mapa.' });
    return { ok: true, sheet: S.secs, res: sol, dp, it, hist, ttl, alpha: al, st, mcore, m0, mc25, Tt4, T0, P0, M0, h: o.h, o };
  }

  return { HPC_MAP, map, DEFAULT, derive, designPoint, lerp, mfp, alpha2, hpcChart, heatmap, HM_DEF, hpcDesign, HPC_DEF, hptDesign, HPT_DEF, offDesign, OD_DEF };
})();
if (typeof module !== 'undefined') module.exports = Analysis;
