/* Memoria de cálculo: reconstruye, paso a paso, todo lo que hace Engine.solve.
   Cada paso lleva su fórmula, la sustitución numérica y el resultado. El resultado se
   RECALCULA aquí a partir de los operandos que se muestran (no se copia del solver) y se
   compara con el solver (campo `chk`): si algún paso no coincide, la hoja lo señala.

   Marcado de las fórmulas: _{x} subíndice, ^{x} superíndice, $clave$ = valor numérico. */
const Calcs = (function () {
  function num(x) {
    if (x === null || x === undefined || !isFinite(x)) return '–';
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e6) {
      const e = Math.floor(Math.log10(a)), m = Number((x / Math.pow(10, e)).toPrecision(5));
      return String(m).replace('.', ',') + '·10^{' + e + '}';
    }
    const sig = Math.max(5, Math.floor(Math.log10(a)) + 1);
    return String(Number(x.toPrecision(sig))).replace('.', ',');
  }
  function html(s) {
    let o = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if ((ch === '_' || ch === '^') && s[i + 1] === '{') {
        let dep = 1, j = i + 2;
        while (j < s.length && dep) { if (s[j] === '{') dep++; else if (s[j] === '}') dep--; j++; }
        const inner = html(s.slice(i + 2, j - 1));
        o += ch === '_' ? '<sub>' + inner + '</sub>' : '<sup>' + inner + '</sup>';
        i = j - 1;
      } else o += ch;
    }
    return o;
  }
  function text(s) {
    let o = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if ((ch === '_' || ch === '^') && s[i + 1] === '{') {
        let dep = 1, j = i + 2;
        while (j < s.length && dep) { if (s[j] === '{') dep++; else if (s[j] === '}') dep--; j++; }
        const raw = s.slice(i + 2, j - 1), inner = text(raw);
        if (ch === '_') o += '_' + inner;
        else o += raw === '2' ? '²' : raw === '3' ? '³' : raw === '4' ? '⁴' : '^(' + inner + ')';
        i = j - 1;
      } else o += ch;
    }
    return o;
  }
  const mfp = (g, M) => Math.sqrt(g) * M * Math.pow(1 + (g - 1) / 2 * M * M, -(g + 1) / (2 * (g - 1)));
  const machFromPtP = (g, r) => Math.sqrt(Math.max(0, 2 / (g - 1) * (Math.pow(r, (g - 1) / g) - 1)));

  function build(R) {
    const I = R.inp, g = I.gas, d = I.design, c = I.comp, nz = I.nozzle, fl = I.flight;
    const isFan = R.isFan, two = R.two;
    const V = {}, secs = [];
    let cur = null, nchk = 0, nok = 0, worst = 0;
    const neg = x => x < 0 ? '(−' + num(-x) + ')' : num(x);
    const fill = s => s.replace(/\$(\w+)\$/g, (m, k) => { if (!(k in V)) throw new Error('Calcs: falta ' + k); return neg(V[k]); });
    const sec = (id, title, intro) => { cur = { id, title, intro: intro || '', steps: [] }; secs.push(cur); };
    const data = (k, name, sym, val, unit, disp) => {
      V[k] = val;
      cur.steps.push({ k, name, sym, val, unit: unit || '', data: true, shown: disp !== undefined ? disp : num(val) });
    };
    /* Paso calculado: name, fórmula, sustitución, valor recalculado, unidad, valor del solver */
    const st = (k, name, sym, sub, val, unit, chk, o) => {
      o = o || {};
      const sc = o.scale || 1;
      const s = { k, name, sym, sub: sub ? fill(sub) : '', val, shown: num(val * sc), unit: unit || '', chk, i: o.i, note: o.note, alt: o.alt };
      V[k] = val;
      if (chk !== undefined && chk !== null) {
        nchk++;
        s.err = Math.abs(val - chk) / Math.max(Math.abs(chk), 1e-12);
        if (s.err < 1e-9) nok++;
        worst = Math.max(worst, s.err);
      }
      cur.steps.push(s);
      return s;
    };
    const kpa = o => Object.assign({ alt: null }, o);
    const pst = (k, name, sym, sub, val, chk, o) => st(k, name, sym, sub, val, 'Pa', chk, Object.assign({ alt: num(val / 1000) + ' kPa' }, o || {}));

    /* ---------- 0. Datos ---------- */
    sec('in', 'Datos de entrada', 'Valores con los que se calcula todo lo demás (los que fija el panel izquierdo, más la atmósfera ISA a la altitud elegida).');
    data('T0', 'Temperatura ambiente', 'T_{0}', fl.T0, 'K');
    data('P0', 'Presión ambiente', 'P_{0}', fl.P0, 'Pa');
    data('M0', 'Mach de vuelo', 'M_{0}', fl.M0, '');
    data('gc', 'Relación de calores específicos, aire frío', 'γ_{c}', g.gc, '');
    data('cpc', 'Calor específico, aire frío', 'c_{pc}', g.cpc, 'J/(kg·K)');
    data('gt', 'Relación de calores específicos, gas caliente', 'γ_{t}', g.gt, '');
    data('cpt', 'Calor específico, gas caliente', 'c_{pt}', g.cpt, 'J/(kg·K)');
    data('hPR', 'Poder calorífico del combustible', 'h_{PR}', g.hPR, 'J/kg', num(g.hPR / 1e6) + ' MJ/kg');
    data('Tt4', 'Temperatura total a la entrada de la turbina', 'T_{t4}', d.Tt4, 'K');
    if (isFan) data('alpha', 'Relación de derivación', 'α', d.alpha, '');
    V.alpha = isFan ? d.alpha : 0;
    if (isFan) data('pif', 'Relación de presiones del fan', 'π_{f}', d.pif, ''); else V.pif = 1;
    if (two) {
      data('pilpc', 'Relación de presiones del compresor de baja', 'π_{LPC}', d.pilpc, '');
      data('pihpc', 'Relación de presiones del compresor de alta', 'π_{HPC}', d.pihpc, '');
    } else data('pic', 'Relación de presiones del compresor (2→3)', 'π_{c}', d.pic, '');
    data('pidmax', 'Recuperación máxima de la toma', 'π_{d máx}', c.pidmax, '');
    data('pib', 'Recuperación de presión de la cámara', 'π_{b}', c.pib, '');
    data('pin', 'Recuperación de presión de la tobera del núcleo', 'π_{n}', c.pin, '');
    if (isFan) data('pifn', 'Recuperación de presión de la tobera del fan', 'π_{fn}', c.pifn, '');
    data('ec', 'Eficiencia politrópica de los compresores', 'e_{c}', c.ec, '');
    if (two && c.etaHPC > 0) data('etaHPC', 'Eficiencia isentrópica del compresor de alta', 'η_{HPC}', c.etaHPC, '');
    if (isFan) data('ef', 'Eficiencia politrópica del fan', 'e_{f}', c.ef, '');
    data('et', 'Eficiencia politrópica de las turbinas', 'e_{t}', c.et, '');
    data('etab', 'Rendimiento de la cámara de combustión', 'η_{b}', c.etab, '');
    data('etam', 'Rendimiento mecánico', 'η_{m}', c.etam, '');
    const coreCD = nz.kindCore === 'cd', fanCD = isFan && nz.kindFan === 'cd';
    data('p0p9', coreCD ? 'Adaptación de la tobera del núcleo (P₀/P₉)' : 'Tobera del núcleo convergente', 'P_{0}/P_{9}', coreCD ? nz.p0p9 : 1, '', coreCD ? undefined : 'convergente: P₉ se calcula');
    if (isFan) data('p0p19', fanCD ? 'Adaptación de la tobera del fan (P₀/P₁₉)' : 'Tobera del fan convergente', 'P_{0}/P_{19}', fanCD ? nz.p0p19 : 1, '', fanCD ? undefined : 'convergente: P₁₉ se calcula');
    if (R.size) data('m0', 'Caudal de aire de entrada', 'ṁ_{0}', R.size.m0, 'kg/s');

    /* ---------- 1. Flujo libre y toma ---------- */
    sec('fl', 'Flujo libre y toma de aire (estaciones 0 y 2)', 'Condiciones de remanso del aire que llega al motor y pérdida de la toma.');
    st('Rc', 'Constante del gas, aire frío', 'R_{c} = (γ_{c}−1)/γ_{c}·c_{pc}', '($gc$−1)/$gc$·$cpc$', (V.gc - 1) / V.gc * V.cpc, 'J/(kg·K)', R.Rc);
    st('Rt', 'Constante del gas, gas caliente', 'R_{t} = (γ_{t}−1)/γ_{t}·c_{pt}', '($gt$−1)/$gt$·$cpt$', (V.gt - 1) / V.gt * V.cpt, 'J/(kg·K)', R.Rt);
    st('a0', 'Velocidad del sonido', 'a_{0} = √(γ_{c}·R_{c}·T_{0})', '√($gc$·$Rc$·$T0$)', Math.sqrt(V.gc * V.Rc * V.T0), 'm/s', R.a0);
    st('v0', 'Velocidad de vuelo', 'v_{0} = M_{0}·a_{0}', '$M0$·$a0$', V.M0 * V.a0, 'm/s', R.v0);
    st('tr', 'Relación de temperaturas de remanso', 'τ_{r} = 1 + (γ_{c}−1)/2·M_{0}^{2}', '1 + ($gc$−1)/2·$M0$^{2}', 1 + (V.gc - 1) / 2 * V.M0 * V.M0, '', R.tr);
    st('pr', 'Relación de presiones de remanso', 'π_{r} = τ_{r}^{γ_{c}/(γ_{c}−1)}', '$tr$^{$gc$/($gc$−1)}', Math.pow(V.tr, V.gc / (V.gc - 1)), '', R.pr);
    const M0 = V.M0;
    const etar = M0 <= 1 ? 1 : (M0 < 5 ? 1 - 0.075 * Math.pow(M0 - 1, 1.35) : 800 / (Math.pow(M0, 4) + 935));
    st('etar', 'Recuperación por ondas de choque en la toma', M0 <= 1 ? 'η_{r} = 1  (M_{0} ≤ 1)' : (M0 < 5 ? 'η_{r} = 1 − 0,075·(M_{0}−1)^{1,35}  (1 < M_{0} < 5)' : 'η_{r} = 800/(M_{0}^{4} + 935)  (M_{0} ≥ 5)'),
      M0 <= 1 ? '' : (M0 < 5 ? '1 − 0,075·($M0$−1)^{1,35}' : '800/($M0$^{4} + 935)'), etar, '', R.etar);
    st('pid', 'Recuperación de presión de la toma', 'π_{d} = π_{d máx}·η_{r}', '$pidmax$·$etar$', V.pidmax * V.etar, '', R.pid, { i: 'cm_d' });
    st('Tt0', 'Temperatura total, estación 0', 'T_{t0} = T_{0}·τ_{r}', '$T0$·$tr$', V.T0 * V.tr, 'K', R.Tt0);
    pst('Pt0', 'Presión total, estación 0', 'P_{t0} = P_{0}·π_{r}', '$P0$·$pr$', V.P0 * V.pr, R.Pt0);
    st('Tt2', 'Temperatura total, estación 2 (toma adiabática)', 'T_{t2} = T_{t0}', '$Tt0$', V.Tt0, 'K', R.Tt2);
    pst('Pt2', 'Presión total, estación 2', 'P_{t2} = P_{t0}·π_{d}', '$Pt0$·$pid$', V.Pt0 * V.pid, R.Pt2);

    /* ---------- 2. Compresión ---------- */
    sec('co', 'Compresión', 'Cada compresor se describe con su relación de presiones y su eficiencia politrópica: τ = π^((γ−1)/(γ·e)).');
    const epsC = (V.gc - 1) / V.gc;
    if (isFan) {
      st('tf', 'Relación de temperaturas del fan', 'τ_{f} = π_{f}^{(γ_{c}−1)/(γ_{c}·e_{f})}', '$pif$^{($gc$−1)/($gc$·$ef$)}', Math.pow(V.pif, epsC / V.ef), '', R.tf, { i: 'cm_f' });
    } else V.tf = 1;
    if (two) {
      st('tlpc', 'Relación de temperaturas del compresor de baja', 'τ_{LPC} = π_{LPC}^{(γ_{c}−1)/(γ_{c}·e_{c})}', '$pilpc$^{($gc$−1)/($gc$·$ec$)}', Math.pow(V.pilpc, epsC / V.ec), '', R.tlpc, { i: 'cm_lpc' });
      if (c.etaHPC > 0) {
        V.etaHPC = c.etaHPC;
        st('thpc', 'Relación de temperaturas del compresor de alta (con su eficiencia isentrópica)', 'τ_{HPC} = 1 + (π_{HPC}^{(γ_{c}−1)/γ_{c}} − 1)/η_{HPC}', '1 + ($pihpc$^{($gc$−1)/$gc$} − 1)/$etaHPC$', 1 + (Math.pow(V.pihpc, epsC) - 1) / V.etaHPC, '', R.thpc, { i: 'cm_hpc', note: 'Eq. 3.25: se usa η_HPC isentrópica, la que da el mapa del compresor.' });
      } else
      st('thpc', 'Relación de temperaturas del compresor de alta', 'τ_{HPC} = π_{HPC}^{(γ_{c}−1)/(γ_{c}·e_{c})}', '$pihpc$^{($gc$−1)/($gc$·$ec$)}', Math.pow(V.pihpc, epsC / V.ec), '', R.thpc, { i: 'cm_hpc' });
      st('pic', 'Relación de presiones total (2→3)', isFan ? 'π_{c} = π_{f}·π_{LPC}·π_{HPC}' : 'π_{c} = π_{LPC}·π_{HPC}', isFan ? '$pif$·$pilpc$·$pihpc$' : '$pilpc$·$pihpc$', V.pif * V.pilpc * V.pihpc, '', R.pic, { i: 'cm_tc' });
      st('tc', 'Relación de temperaturas total (2→3)', isFan ? 'τ_{c} = τ_{f}·τ_{LPC}·τ_{HPC}' : 'τ_{c} = τ_{LPC}·τ_{HPC}', isFan ? '$tf$·$tlpc$·$thpc$' : '$tlpc$·$thpc$', V.tf * V.tlpc * V.thpc, '', R.tc, { i: 'cm_tc' });
    } else {
      st('tc', 'Relación de temperaturas del compresor', 'τ_{c} = π_{c}^{(γ_{c}−1)/(γ_{c}·e_{c})}', '$pic$^{($gc$−1)/($gc$·$ec$)}', Math.pow(V.pic, epsC / V.ec), '', R.tc, { i: 'cm_c' });
    }
    if (isFan) {
      st('Tt13', 'Temperatura total, estación 13 (salida del fan)', 'T_{t13} = T_{t2}·τ_{f}', '$Tt2$·$tf$', V.Tt2 * V.tf, 'K', R.Tt13);
      pst('Pt13', 'Presión total, estación 13', 'P_{t13} = P_{t2}·π_{f}', '$Pt2$·$pif$', V.Pt2 * V.pif, R.Pt13);
    } else V.Tt13 = V.Tt2 * V.tf;
    if (two) {
      st('Tt25', 'Temperatura total, estación 2.5 (salida del compresor de baja)', 'T_{t25} = T_{t13}·τ_{LPC}', '$Tt13$·$tlpc$', V.Tt13 * V.tlpc, 'K', R.Tt25);
      pst('Pt25', 'Presión total, estación 2.5', 'P_{t25} = P_{t13}·π_{LPC}', (isFan ? '$Pt13$' : '$Pt2$') + '·$pilpc$', (isFan ? V.Pt13 : V.Pt2) * V.pilpc, R.Pt25);
    }
    st('Tt3', 'Temperatura total, estación 3 (salida del compresor)', 'T_{t3} = T_{t2}·τ_{c}', '$Tt2$·$tc$', V.Tt2 * V.tc, 'K', R.Tt3);
    pst('Pt3', 'Presión total, estación 3', 'P_{t3} = P_{t2}·π_{c}', '$Pt2$·$pic$', V.Pt2 * V.pic, R.Pt3);

    /* ---------- 3. Cámara de combustión ---------- */
    sec('cb', 'Cámara de combustión (estación 4)', 'Balance de energía de la cámara: el combustible aporta h_PR·η_b por kg quemado y el gas sale a Tt4.');
    st('tl', 'Parámetro de temperatura de la turbina', 'τ_{λ} = c_{pt}·T_{t4}/(c_{pc}·T_{0})', '$cpt$·$Tt4$/($cpc$·$T0$)', V.cpt * V.Tt4 / (V.cpc * V.T0), '', R.tl, { i: 'cm_b' });
    const fv = (V.tl - V.tr * V.tc) / (V.etab * V.hPR / (V.cpc * V.T0) - V.tl);
    st('f', 'Relación combustible/aire del núcleo', 'f = (τ_{λ} − τ_{r}·τ_{c}) / (η_{b}·h_{PR}/(c_{pc}·T_{0}) − τ_{λ})', '($tl$ − $tr$·$tc$) / ($etab$·$hPR$/($cpc$·$T0$) − $tl$)', fv, '', R.f, { i: 'cm_b' });
    pst('Pt4', 'Presión total, estación 4', 'P_{t4} = P_{t3}·π_{b}', '$Pt3$·$pib$', V.Pt3 * V.pib, R.Pt4);

    /* ---------- 4. Turbinas ---------- */
    sec('tu', 'Turbinas: balance de potencias (estaciones 4, 4.5 y 5)', 'Las turbinas extraen justo la potencia que absorben el fan y los compresores (con el rendimiento mecánico η_m). De ahí sale τ_t.');
    const kk = 1 / (V.etam * (1 + V.f));
    if (two) {
      const tth = 1 - kk * (V.tr / V.tl) * V.tf * V.tlpc * (V.thpc - 1);
      st('tth', 'Relación de temperaturas de la turbina de alta', isFan ? 'τ_{tH} = 1 − 1/(η_{m}(1+f))·(τ_{r}/τ_{λ})·τ_{f}·τ_{LPC}·(τ_{HPC}−1)' : 'τ_{tH} = 1 − 1/(η_{m}(1+f))·(τ_{r}/τ_{λ})·τ_{LPC}·(τ_{HPC}−1)',
        isFan ? '1 − 1/($etam$·(1+$f$))·($tr$/$tl$)·$tf$·$tlpc$·($thpc$−1)' : '1 − 1/($etam$·(1+$f$))·($tr$/$tl$)·$tlpc$·($thpc$−1)', tth, '', R.tth, { i: 'cm_hpt', note: 'Eq. 6.10: la turbina de alta mueve solo el compresor de alta.' });
      const ttl = 1 - kk * (V.tr / (V.tl * V.tth)) * ((1 + V.alpha) * (V.tf - 1) + V.tf * (V.tlpc - 1));
      st('ttl', 'Relación de temperaturas de la turbina de baja', isFan ? 'τ_{tL} = 1 − 1/(η_{m}(1+f))·τ_{r}/(τ_{λ}·τ_{tH})·((1+α)(τ_{f}−1) + τ_{f}(τ_{LPC}−1))' : 'τ_{tL} = 1 − 1/(η_{m}(1+f))·τ_{r}/(τ_{λ}·τ_{tH})·(τ_{LPC}−1)',
        isFan ? '1 − 1/($etam$·(1+$f$))·$tr$/($tl$·$tth$)·((1+$alpha$)($tf$−1) + $tf$($tlpc$−1))' : '1 − 1/($etam$·(1+$f$))·$tr$/($tl$·$tth$)·($tlpc$−1)', ttl, '', R.ttl, { i: 'cm_lpt', note: 'Eq. 6.11: la turbina de baja mueve el fan (todo el caudal) y el compresor de baja.' });
      st('tt', 'Relación de temperaturas de la turbina total', 'τ_{t} = τ_{tH}·τ_{tL}', '$tth$·$ttl$', V.tth * V.ttl, '', R.tt, { i: 'cm_t' });
    } else {
      const tt = 1 - kk * (V.tr / V.tl) * ((V.tc - 1) + V.alpha * (V.tf - 1));
      st('tt', 'Relación de temperaturas de la turbina', isFan ? 'τ_{t} = 1 − 1/(η_{m}(1+f))·(τ_{r}/τ_{λ})·((τ_{c}−1) + α(τ_{f}−1))' : 'τ_{t} = 1 − 1/(η_{m}(1+f))·(τ_{r}/τ_{λ})·(τ_{c}−1)',
        isFan ? '1 − 1/($etam$·(1+$f$))·($tr$/$tl$)·(($tc$−1) + $alpha$($tf$−1))' : '1 − 1/($etam$·(1+$f$))·($tr$/$tl$)·($tc$−1)', tt, '', R.tt, { i: 'cm_t', note: 'Eq. 6.5.' });
    }
    const epsT = (V.gt - 1) / V.gt;
    if (two) {
      st('pith', 'Relación de presiones de la turbina de alta', 'π_{tH} = τ_{tH}^{γ_{t}/((γ_{t}−1)·e_{t})}', '$tth$^{$gt$/(($gt$−1)·$et$)}', Math.pow(V.tth, 1 / (epsT * V.et)), '', R.pith);
      st('pitl', 'Relación de presiones de la turbina de baja', 'π_{tL} = τ_{tL}^{γ_{t}/((γ_{t}−1)·e_{t})}', '$ttl$^{$gt$/(($gt$−1)·$et$)}', Math.pow(V.ttl, 1 / (epsT * V.et)), '', R.pitl);
    }
    st('pit', 'Relación de presiones de la turbina total', 'π_{t} = τ_{t}^{γ_{t}/((γ_{t}−1)·e_{t})}', '$tt$^{$gt$/(($gt$−1)·$et$)}', Math.pow(V.tt, 1 / (epsT * V.et)), '', R.pit, { i: 'cm_t' });
    if (two) {
      st('Tt45', 'Temperatura total, estación 4.5 (entre turbinas)', 'T_{t45} = T_{t4}·τ_{tH}', '$Tt4$·$tth$', V.Tt4 * V.tth, 'K', R.Tt45);
      pst('Pt45', 'Presión total, estación 4.5', 'P_{t45} = P_{t4}·π_{tH}', '$Pt4$·$pith$', V.Pt4 * V.pith, R.Pt45);
    }
    st('Tt5', 'Temperatura total, estación 5 (salida de la turbina)', 'T_{t5} = T_{t4}·τ_{t}', '$Tt4$·$tt$', V.Tt4 * V.tt, 'K', R.Tt5);
    pst('Pt5', 'Presión total, estación 5', 'P_{t5} = P_{t4}·π_{t}', '$Pt4$·$pit$', V.Pt4 * V.pit, R.Pt5);
    pst('Pt9', 'Presión total, estación 9 (entrada de la tobera)', 'P_{t9} = P_{t5}·π_{n}', '$Pt5$·$pin$', V.Pt5 * V.pin, R.Pt9);

    /* ---------- 5. Toberas ---------- */
    sec('nz', 'Toberas', 'Expansión hasta la presión de salida. Convergente-divergente (adaptada): se da P₀/P₉. Convergente: se comprueba si se bloquea (M = 1).');
    function nozzleSteps(p, label, gam, Rg, Tt, PtKey, p0pKey, kindCD, ref, sk) {
      const Pt = V[PtKey];
      if (kindCD) {
        pst('P' + p, 'Presión estática de salida' + label, 'P_{' + p + '} = P_{0}/(P_{0}/P_{' + p + '})', '$P0$/$' + p0pKey + '$', V.P0 / V[p0pKey], ref.P);
        st('r' + p, 'Relación de presiones de la tobera' + label, 'P_{t' + p + '}/P_{' + p + '}', '$' + PtKey + '$/$P' + p + '$', Pt / V['P' + p], '', ref.PtoverP);
        st('M' + p, 'Mach de salida' + label, 'M_{' + p + '} = √(2/(' + gam + '−1)·((P_{t' + p + '}/P_{' + p + '})^{(' + gam + '−1)/' + gam + '} − 1))',
          '√(2/($' + (gam === 'γ_{t}' ? 'gt' : 'gc') + '$−1)·($r' + p + '$^{($' + (gam === 'γ_{t}' ? 'gt' : 'gc') + '$−1)/$' + (gam === 'γ_{t}' ? 'gt' : 'gc') + '$} − 1))',
          machFromPtP(gam === 'γ_{t}' ? V.gt : V.gc, V['r' + p]), '', ref.M, { i: sk });
      } else {
        const gv = gam === 'γ_{t}' ? V.gt : V.gc, gk = gam === 'γ_{t}' ? 'gt' : 'gc';
        const rr = Pt / V.P0, crit = Math.pow((gv + 1) / 2, gv / (gv - 1));
        st('q' + p, 'Relación de presiones disponible' + label, 'P_{t' + p + '}/P_{0}', '$' + PtKey + '$/$P0$', rr, '', null);
        st('k' + p, 'Relación de presiones crítica' + label, '(P_{t}/P)_{crít} = ((γ+1)/2)^{γ/(γ−1)}', '(($' + gk + '$+1)/2)^{$' + gk + '$/($' + gk + '$−1)}', crit, '', null);
        const choked = rr >= crit;
        st('M' + p, 'Mach de salida' + label, choked ? 'M_{' + p + '} = 1  (P_{t}/P_{0} ≥ crítica: tobera bloqueada)' : 'M_{' + p + '} = √(2/(γ−1)·((P_{t' + p + '}/P_{0})^{(γ−1)/γ} − 1))',
          choked ? 'P_{t' + p + '}/P_{0} = $q' + p + '$ ≥ $k' + p + '$ → M = 1' : '√(2/($' + gk + '$−1)·($q' + p + '$^{($' + gk + '$−1)/$' + gk + '$} − 1))',
          choked ? 1 : machFromPtP(gv, rr), '', ref.M, { i: sk });
        pst('P' + p, 'Presión estática de salida' + label, choked ? 'P_{' + p + '} = P_{t' + p + '}/(P_{t}/P)_{crít}' : 'P_{' + p + '} = P_{0}  (sale a la presión ambiente)',
          choked ? '$' + PtKey + '$/$k' + p + '$' : '$P0$', choked ? Pt / crit : V.P0, ref.P);
      }
      st('T' + p, 'Temperatura estática de salida' + label, 'T_{' + p + '} = T_{t}/(1 + (γ−1)/2·M_{' + p + '}^{2})', '$' + Tt + '$/(1 + ($' + (gam === 'γ_{t}' ? 'gt' : 'gc') + '$−1)/2·$M' + p + '$^{2})', V[Tt] / (1 + ((gam === 'γ_{t}' ? V.gt : V.gc) - 1) / 2 * V['M' + p] * V['M' + p]), 'K', ref.T);
      const gg = gam === 'γ_{t}' ? 'gt' : 'gc', RR = gam === 'γ_{t}' ? 'Rt' : 'Rc';
      st('v' + p, 'Velocidad de salida' + label, 'v_{' + p + '} = M_{' + p + '}·√(γ·R·T_{' + p + '})', '$M' + p + '$·√($' + gg + '$·$' + RR + '$·$T' + p + '$)', V['M' + p] * Math.sqrt(V[gg] * V[RR] * V['T' + p]), 'm/s', ref.v);
    }
    nozzleSteps('9', ' del núcleo', 'γ_{t}', 'Rt', 'Tt5', 'Pt9', 'p0p9', coreCD, { P: R.core.P9, PtoverP: R.core.Pt9overP9, M: R.core.M, T: R.core.T9, v: R.core.v9 }, 'st_9');
    st('Fcore', 'Empuje específico del núcleo', 'F_{núcleo}/ṁ_{c} = (1+f)·v_{9} − v_{0} + (1+f)·R_{t}·T_{9}/v_{9}·(1 − P_{0}/P_{9})',
      '(1+$f$)·$v9$ − $v0$ + (1+$f$)·$Rt$·$T9$/$v9$·(1 − $P0$/$P9$)', (1 + V.f) * V.v9 - V.v0 + (1 + V.f) * V.Rt * V.T9 / V.v9 * (1 - V.P0 / V.P9), 'N·s/kg de aire del núcleo', R.Fcore,
      { note: 'Empuje por cantidad de movimiento más el término de presión (tobera no adaptada).' });
    if (isFan) {
      pst('Pt19', 'Presión total, estación 19 (entrada de la tobera del fan)', 'P_{t19} = P_{t13}·π_{fn}', '$Pt13$·$pifn$', V.Pt13 * V.pifn, R.Pt19);
      nozzleSteps('19', ' del fan', 'γ_{c}', 'Rc', 'Tt13', 'Pt19', 'p0p19', fanCD, { P: R.fan.P19, PtoverP: R.fan.Pt19overP19, M: R.fan.M, T: R.fan.T19, v: R.fan.v19 }, 'st_19');
      st('Fsec', 'Empuje específico del fan', 'F_{fan}/ṁ_{s} = v_{19} − v_{0} + R_{c}·T_{19}/v_{19}·(1 − P_{0}/P_{19})',
        '$v19$ − $v0$ + $Rc$·$T19$/$v19$·(1 − $P0$/$P19$)', V.v19 - V.v0 + V.Rc * V.T19 / V.v19 * (1 - V.P0 / V.P19), 'N·s/kg de aire del bypass', R.Fsec);
    } else { V.v19 = 0; }

    /* ---------- 6. Prestaciones ---------- */
    sec('pf', 'Prestaciones', 'Por kg/s de aire total que entra en el motor.');
    st('Fsp', 'Empuje específico', isFan ? 'F/ṁ_{0} = (F_{núcleo}/ṁ_{c} + α·F_{fan}/ṁ_{s})/(1+α)' : 'F/ṁ_{0} = F_{núcleo}/ṁ_{c}',
      isFan ? '($Fcore$ + $alpha$·$Fsec$)/(1+$alpha$)' : '$Fcore$', isFan ? V.Fcore / (1 + V.alpha) + V.alpha / (1 + V.alpha) * V.Fsec : V.Fcore, 'N·s/kg', R.Fsp, { i: 'Fsp' });
    const tsfc = V.f / ((1 + V.alpha) * V.Fsp);
    st('tsfc', 'Consumo específico (TSFC)', isFan ? 'TSFC = f / ((1+α)·F/ṁ_{0})' : 'TSFC = f / (F/ṁ_{0})', isFan ? '$f$ / ((1+$alpha$)·$Fsp$)' : '$f$ / $Fsp$', tsfc, 'mg/(N·s)', R.tsfc, { scale: 1e6, i: 'tsfc', alt: num(tsfc * 3.6e6) + ' kg/(kN·h)' });
    const dek = 0.5 * ((1 + V.f) / (1 + V.alpha) * V.v9 * V.v9 + V.alpha / (1 + V.alpha) * V.v19 * V.v19 - V.v0 * V.v0);
    st('dek', 'Aumento de energía cinética por kg de aire', isFan ? 'Δe_{k} = ½·((1+f)/(1+α)·v_{9}^{2} + α/(1+α)·v_{19}^{2} − v_{0}^{2})' : 'Δe_{k} = ½·((1+f)·v_{9}^{2} − v_{0}^{2})',
      isFan ? '½·((1+$f$)/(1+$alpha$)·$v9$^{2} + $alpha$/(1+$alpha$)·$v19$^{2} − $v0$^{2})' : '½·((1+$f$)·$v9$^{2} − $v0$^{2})', dek, 'J/kg', R.dek);
    const undefEta = V.dek <= 0 || V.Fsp <= 0;
    if (undefEta) cur.steps[cur.steps.length - 1].note = 'Δe_k ≤ 0 o F ≤ 0: η_T, η_P y η_O se calculan por completitud, pero con estas definiciones no tienen sentido físico.';
    st('etaT', 'Rendimiento térmico', 'η_{T} = (1+α)·Δe_{k}/(f·h_{PR})', '(1+$alpha$)·$dek$/($f$·$hPR$)', (1 + V.alpha) * V.dek / (V.f * V.hPR), '%', R.etaT, { scale: 100, i: 'etaT' });
    st('etaP', 'Rendimiento propulsivo', 'η_{P} = v_{0}·F/Δe_{k}', '$v0$·$Fsp$/$dek$', V.v0 * V.Fsp / V.dek, '%', R.etaP, { scale: 100, i: 'etaP' });
    st('etaO', 'Rendimiento global', 'η_{O} = η_{T}·η_{P}', '$etaT$·$etaP$', V.etaT * V.etaP, '%', R.etaO, { scale: 100, i: 'etaO' });
    if (isFan) st('FR', 'Cociente de empujes específicos núcleo/fan', 'F_{R} = F_{núcleo}/F_{fan}', '$Fcore$/$Fsec$', V.Fcore / V.Fsec, '', R.FR);

    /* ---------- 7. Dimensionado ---------- */
    if (R.size) {
      const s = R.size;
      sec('dz', 'Caudales y dimensionado', 'Con el caudal de entrada se reparten los flujos y se calcula el área de cada estación con el parámetro de flujo másico MFP (eq. 11.4): A = ṁ·√(R·Tt)/(MFP·Pt).');
      st('mc', 'Caudal del núcleo', isFan ? 'ṁ_{c} = ṁ_{0}/(1+α)' : 'ṁ_{c} = ṁ_{0}', isFan ? '$m0$/(1+$alpha$)' : '$m0$', V.m0 / (1 + V.alpha), 'kg/s', s.mc);
      st('ms', 'Caudal del bypass', 'ṁ_{s} = ṁ_{0} − ṁ_{c}', '$m0$ − $mc$', V.m0 - V.mc, 'kg/s', s.ms);
      st('mf', 'Caudal de combustible', 'ṁ_{f} = f·ṁ_{c}', '$f$·$mc$', V.f * V.mc, 'kg/s', s.mf);
      st('m9', 'Caudal de gas por la turbina', 'ṁ_{9} = (1+f)·ṁ_{c}', '(1+$f$)·$mc$', (1 + V.f) * V.mc, 'kg/s', (1 + R.f) * s.mc);
      st('F', 'Empuje total', 'F = (F/ṁ_{0})·ṁ_{0}', '$Fsp$·$m0$', V.Fsp * V.m0, 'N', s.F, { i: 'F', alt: num(V.Fsp * V.m0 / 1000) + ' kN' });
      const area = (key, name, sym, mdot, Rk, Tk, Pk, gk, M, chk, info, mname) => {
        V['Mach_' + key] = M;
        st('mfp' + key, 'Parámetro de flujo másico, ' + name, 'MFP(M) = √γ·M·(1+(γ−1)/2·M^{2})^{−(γ+1)/(2(γ−1))}',
          '√$' + gk + '$·$Mach_' + key + '$·(1+($' + gk + '$−1)/2·$Mach_' + key + '$^{2})^{−($' + gk + '$+1)/(2($' + gk + '$−1))}', mfp(V[gk], M), '', null, { note: 'M = ' + num(M) });
        st('A' + key, 'Área, ' + name, 'A_{' + sym + '} = ṁ·√(R·T_{t})/(MFP·P_{t})', '$' + mdot + '$·√($' + Rk + '$·$' + Tk + '$)/($mfp' + key + '$·$' + Pk + '$)', V[mdot] * Math.sqrt(V[Rk] * V[Tk]) / (V['mfp' + key] * V[Pk]), 'm²', chk, { i: info });
      };
      if (R.M0 > 0.01) area('0', 'captura (estación 0)', '0', 'm0', 'Rc', 'Tt0', 'Pt0', 'gc', V.M0, s.A0, 'sz_0');
      area('2', 'entrada del fan (estación 2)', '2', 'm0', 'Rc', 'Tt2', 'Pt2', 'gc', s.M2, s.A2, 'sz_2');
      area('in', 'entrada del núcleo', 'in', 'mc', 'Rc', two && isFan ? 'Tt13' : 'Tt2', two && isFan ? 'Pt13' : 'Pt2', 'gc', 0.5, s.Ain, null);
      area('3', 'salida del compresor (estación 3)', '3', 'mc', 'Rc', 'Tt3', 'Pt3', 'gc', s.M3, s.A3, 'sz_3');
      area('4', 'salida de la cámara (estación 4)', '4', 'm9', 'Rt', 'Tt4', 'Pt4', 'gt', s.M4, s.A4, 'sz_4');
      area('5', 'salida de la turbina (estación 5)', '5', 'm9', 'Rt', 'Tt5', 'Pt5', 'gt', s.M5, s.A5, 'sz_5');
      area('9', 'tobera del núcleo (estación 9)', '9', 'm9', 'Rt', 'Tt5', 'Pt9', 'gt', V.M9, s.A9, 'sz_9');
      if (isFan) area('19', 'tobera del fan (estación 19)', '19', 'ms', 'Rc', 'Tt13', 'Pt19', 'gc', V.M19, s.A19, 'sz_19');
    }
    return { sections: secs, nchk, nok, worst, V };
  }

  /* Texto plano de la hoja, para copiar o descargar */
  function toText(res, head) {
    const L = [];
    if (head) L.push(head, '');
    res.sections.forEach(sc => {
      L.push('== ' + sc.title.toUpperCase() + ' ==');
      sc.steps.forEach(s => {
        if (s.data) { L.push(text(s.name) + ': ' + text(s.sym) + ' = ' + text(s.shown) + (s.unit && !s.shown.includes(s.unit) ? ' ' + s.unit : '')); return; }
        L.push(text(s.name));
        L.push('   ' + text(s.sym));
        if (s.sub) L.push('   = ' + text(s.sub));
        L.push('   = ' + text(s.shown) + (s.unit ? ' ' + text(s.unit) : '') + (s.alt ? '  (' + s.alt + ')' : ''));
      });
      L.push('');
    });
    return L.join('\n');
  }
  return { build, html, text, toText, num };
})();
if (typeof module !== 'undefined') module.exports = Calcs;
