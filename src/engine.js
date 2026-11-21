/* Motor de cálculo 1D de ciclo para turbojet y turbofán de escape separado.
   Análisis de ciclo on-design (ref. Mattingly, "Elements of Propulsion"):
   §3 componentes, §4 prestaciones, §5 turbojet, §6.1 turbofán separado, §11 dimensionado. */
const Engine = (function () {
  const G0 = 9.80665;

  function isa(h) {
    const T0 = 288.15, P0 = 101325, L = 0.0065, R = 287.053;
    if (h <= 11000) { const T = T0 - L * h; return { T, P: P0 * Math.pow(T / T0, G0 / (L * R)) }; }
    const T11 = 216.65, P11 = P0 * Math.pow(T11 / T0, G0 / (L * R));
    const h2 = Math.min(h, 20000);
    return { T: T11, P: P11 * Math.exp(-G0 * (h2 - 11000) / (R * T11)) };
  }

  // Parámetro de flujo másico adimensional, eq. 1.22
  function mfp(g, M) { return Math.sqrt(g) * M * Math.pow(1 + (g - 1) / 2 * M * M, -(g + 1) / (2 * (g - 1))); }
  function machFromPtP(g, r) { return Math.sqrt(Math.max(0, 2 / (g - 1) * (Math.pow(r, (g - 1) / g) - 1))); }

  // Tobera: kind 'cd' (P0/P9 dado) o 'conv' (hipótesis y comprobación de bloqueo, §3.10)
  function nozzle(g, PtOverP0, P0overP9, kind) {
    if (kind === 'cd') {
      const r = P0overP9 * PtOverP0;
      return { M: machFromPtP(g, r), P9overP0: 1 / P0overP9, PtOverP9: r, choked: false };
    }
    const crit = Math.pow((g + 1) / 2, g / (g - 1));
    if (PtOverP0 >= crit) return { M: 1, P9overP0: PtOverP0 / crit, PtOverP9: crit, choked: true };
    return { M: machFromPtP(g, PtOverP0), P9overP0: 1, PtOverP9: PtOverP0, choked: false };
  }

  function solve(inp) {
    const o = { ok: true, warnings: [] };
    const { gc, cpc, gt, cpt, hPR } = inp.gas;
    const d = inp.design, c = inp.comp, n = inp.nozzle, fl = inp.flight;
    const isFan = inp.arch === 'turbofan';
    const alpha = isFan ? d.alpha : 0;
    const Rc = (gc - 1) / gc * cpc, Rt = (gt - 1) / gt * cpt;
    const T0 = fl.T0, P0 = fl.P0, M0 = fl.M0;
    const a0 = Math.sqrt(gc * Rc * T0), v0 = a0 * M0;
    const epsC = (gc - 1) / gc, epsT = (gt - 1) / gt;

    // Flujo libre y toma
    const tr = 1 + (gc - 1) / 2 * M0 * M0;
    const pr = Math.pow(tr, gc / (gc - 1));
    const etar = M0 <= 1 ? 1 : (M0 < 5 ? 1 - 0.075 * Math.pow(M0 - 1, 1.35) : 800 / (Math.pow(M0, 4) + 935));
    const pid = c.pidmax * etar;

    // Compresión
    const two = d.spools === 'two';
    const pif = isFan ? d.pif : 1;
    const tf = isFan ? Math.pow(pif, epsC / c.ef) : 1;
    let pic, tc, tlpc = 1, thpc = 1, pilpc = 1, pihpc = 1;
    if (two) {
      pilpc = d.pilpc; pihpc = d.pihpc;
      tlpc = Math.pow(pilpc, epsC / c.ec);
      // HPC: eficiencia isentrópica η_HPC si se da (eq. 3.25), si no, la politrópica e_c (eq. 3.24)
      thpc = c.etaHPC > 0 ? 1 + (Math.pow(pihpc, epsC) - 1) / c.etaHPC : Math.pow(pihpc, epsC / c.ec);
      pic = pif * pilpc * pihpc; tc = tf * tlpc * thpc;
    } else {
      pic = d.pic; tc = Math.pow(pic, epsC / c.ec);
    }

    // La cámara debe calentar: Tt4 > Tt3 (con c_pt > c_pc la eq. 3.19 podría dar f > 0 aunque Tt4 < Tt3)
    const Tt3chk = T0 * tr * tc;
    if (!(d.Tt4 > Tt3chk)) return { ok: false, error: 'Tt4 (' + d.Tt4.toFixed(0) + ' K) no supera la temperatura de salida del compresor Tt3 (' + Tt3chk.toFixed(0) + ' K): la cámara no puede calentar. Sube Tt4 o baja la compresión o el Mach.', warnings: [] };

    // Combustor, eq. 3.19
    const tl = cpt * d.Tt4 / (cpc * T0);
    const f = (tl - tr * tc) / (c.etab * hPR / (cpc * T0) - tl);
    if (!(f > 0)) { return { ok: false, error: 'Tt4 demasiado baja para esta compresión: no hay aporte de combustible (f ≤ 0).' }; }

    // Turbinas: balance de potencias
    let tth = 1, ttl = 1, tt, pith = 1, pitl = 1;
    if (two) {
      tth = 1 - (1 / (c.etam * (1 + f))) * (tr / tl) * tf * tlpc * (thpc - 1);
      ttl = 1 - (1 / (c.etam * (1 + f))) * (tr / (tl * tth)) * ((1 + alpha) * (tf - 1) + tf * (tlpc - 1));
      tt = tth * ttl;
    } else {
      tt = 1 - (1 / (c.etam * (1 + f))) * (tr / tl) * ((tc - 1) + alpha * (tf - 1));
    }
    if (!(tt > 0.2) || (two && !(tth > 0.2 && ttl > 0.2))) {
      return { ok: false, error: 'Las turbinas no pueden mover compresor y fan con esta Tt4: sube Tt4 o baja π_c, π_f o α.' };
    }
    const pit = Math.pow(tt, gt / (epsT * c.et * gt)); // τ^(γ/((γ-1) e))
    if (two) { pith = Math.pow(tth, 1 / (epsT * c.et)); pitl = Math.pow(ttl, 1 / (epsT * c.et)); }

    // Temperaturas y presiones totales
    const Tt0 = T0 * tr, Tt2 = Tt0, Tt13 = Tt2 * tf;
    const Tt25 = two ? Tt13 * tlpc : null, Tt3 = Tt2 * tc, Tt4 = d.Tt4;
    const Tt45 = two ? Tt4 * tth : null, Tt5 = Tt4 * tt;
    const Pt0 = P0 * pr, Pt2 = Pt0 * pid, Pt13 = Pt2 * pif;
    const Pt25 = two ? Pt13 * pilpc : null, Pt3 = Pt2 * pic, Pt4 = Pt3 * c.pib;
    const Pt45 = two ? Pt4 * pith : null, Pt5 = Pt4 * pit, Pt9 = Pt5 * c.pin;

    // Viabilidad de las toberas: la presión total debe superar la de descarga
    const rc = n.kindCore === 'cd' ? n.p0p9 * Pt9 / P0 : Pt9 / P0;
    if (!(rc > 1.0001)) return { ok: false, error: 'La presión total a la salida del núcleo (' + (Pt9 / 1000).toFixed(1) + ' kPa) no supera la de descarga: la turbina extrae demasiado para este α y esta altitud. Reduce α o π del fan, o sube Tt4 o el Mach.', warnings: [] };
    if (isFan) {
      const rf = n.kindFan === 'cd' ? n.p0p19 * Pt13 * c.pifn / P0 : Pt13 * c.pifn / P0;
      if (!(rf > 1.0001)) return { ok: false, error: 'La presión total a la salida del fan no supera la de descarga: sube π del fan o el Mach de vuelo.', warnings: [] };
    }

    // Tobera del núcleo
    const nc = nozzle(gt, Pt9 / P0, n.p0p9, n.kindCore);
    const T9 = Tt5 / (1 + (gt - 1) / 2 * nc.M * nc.M);
    const v9 = nc.M * Math.sqrt(gt * Rt * T9);
    const P9 = P0 * nc.P9overP0;
    const Fcore = (1 + f) * v9 - v0 + (1 + f) * Rt * T9 / v9 * (1 - P0 / P9); // por kg/s de núcleo

    // Tobera del fan
    let nf = null, T19 = null, v19 = 0, P19 = null, Pt19 = null, Fsec = 0;
    if (isFan) {
      Pt19 = Pt13 * c.pifn;
      nf = nozzle(gc, Pt19 / P0, n.p0p19, n.kindFan);
      T19 = Tt13 / (1 + (gc - 1) / 2 * nf.M * nf.M);
      v19 = nf.M * Math.sqrt(gc * Rc * T19);
      P19 = P0 * nf.P9overP0;
      Fsec = v19 - v0 + Rc * T19 / v19 * (1 - P0 / P19); // por kg/s de bypass
    }

    // Prestaciones (por kg/s de aire total)
    const Fsp = Fcore / (1 + alpha) + alpha / (1 + alpha) * Fsec;
    const tsfc = f / ((1 + alpha) * Fsp);
    const dek = 0.5 * ((1 + f) / (1 + alpha) * v9 * v9 + alpha / (1 + alpha) * v19 * v19 - v0 * v0);
    const etaT = (1 + alpha) * dek / (f * hPR);
    const etaP = v0 * Fsp / dek;
    const etaO = etaT * etaP;
    const FR = isFan ? Fcore / Fsec : null;

    if (Fsp <= 0) o.warnings.push('Empuje específico ≤ 0: el motor no genera empuje con estos parámetros (TSFC y rendimientos no tienen sentido).');
    else if (dek <= 0) o.warnings.push('Δe_k ≤ 0: la energía cinética del chorro no supera la del aire de entrada (toberas muy subexpandidas o fan lento). η_T, η_P y η_O no están definidos.');
    if (isFan && Fsec < 0 && Fsp > 0) o.warnings.push('El fan da empuje negativo (chorro frío más lento que el vuelo): sube π del fan o baja el Mach.');
    if (Fcore < 0 && Fsp > 0) o.warnings.push('El núcleo da empuje negativo: la turbina extrae casi toda la energía del gas (α o π del fan demasiado altos para esta Tt4).');
    if (nc.choked) o.warnings.push('Tobera del núcleo bloqueada (M9 = 1).');
    if (nf && nf.choked) o.warnings.push('Tobera del fan bloqueada (M19 = 1).');
    if (etaP > 1) o.warnings.push('η_P > 100 %: toberas no adaptadas. El empuje por presión (P₉−P₀)A₉ cuenta en F pero no en ΔEk (con esta definición de η_P).');
    if (d.Tt4 > 2000) o.warnings.push('Tt4 por encima del límite de materiales de la Tabla 3.3 (2000 K).');

    Object.assign(o, {
      alpha, f, a0, v0, Rc, Rt, tr, pr, etar, pid, tf, tc, tl, tt, tth, ttl, pit, pith, pitl, pic, pif, pilpc, pihpc, tlpc, thpc,
      Tt0, Tt2, Tt13, Tt25, Tt3, Tt4, Tt45, Tt5, Pt0, Pt2, Pt13, Pt25, Pt3, Pt4, Pt45, Pt5, Pt9, Pt19,
      core: { M: nc.M, T9, v9, P9, choked: nc.choked, Pt9overP9: nc.PtOverP9 },
      fan: isFan ? { M: nf.M, T19, v19, P19, choked: nf.choked, Pt19overP19: nf.PtOverP9 } : null,
      Fcore, Fsec, Fsp, tsfc, etaT, etaP, etaO, FR, dek,
      isFan, two, T0, P0, M0, inp
    });

    // Dimensionado (§11) si se da el caudal de entrada
    if (inp.size && inp.size.mdot0 > 0) {
      const m0 = inp.size.mdot0, mc = m0 / (1 + alpha), ms = m0 - mc;
      const A = (m, R, Tt, Pt, g, M) => m * Math.sqrt(R * Tt) / (mfp(g, M) * Pt);
      const M2 = inp.size.M2, M3 = 0.30, M4 = 0.25, M5 = 0.45;
      const m9 = (1 + f) * mc;
      o.size = {
        m0, mc, ms, mf: f * mc, F: Fsp * m0,
        A0: M0 > 0.01 ? A(m0, Rc, Tt0, Pt0, gc, M0) : null,
        A2: A(m0, Rc, Tt2, Pt2, gc, M2),
        Ain: A(mc, Rc, two && isFan ? Tt13 : Tt2, two && isFan ? Pt13 : Pt2, gc, 0.5),
        A3: A(mc, Rc, Tt3, Pt3, gc, M3),
        A4: A(m9, Rt, Tt4, Pt4, gt, M4),
        A5: A(m9, Rt, Tt5, Pt5, gt, M5),
        A9: A(m9, Rt, Tt5, Pt9, gt, nc.M),
        A19: isFan ? A(ms, Rc, Tt13, Pt19, gc, nf.M) : null,
        M2, M3, M4, M5
      };
    }
    return o;
  }

  /* Modelo fuera de diseño simplificado (turbinas con tobera bloqueada, eficiencias constantes, α constante).
     Con τ_t de cada turbina constante, el balance de potencias fija cuánto comprime cada compresor para una
     Tt4 y un M0 dados, y el caudal sale de la condición de bloqueo de la turbina de alta: ṁ4·√Tt4/Pt4 = cte.
     Es una aproximación de curso (no usa mapas de compresor). */
  function makeOffDesign(dInp) {
    const D = solve(Object.assign({}, dInp, { size: { mdot0: 1, M2: 0.5 } }));
    if (!D.ok) return { ok: false, error: D.error };
    const full = solve(dInp);
    const two = D.two, isFan = D.isFan, alpha = D.alpha;
    const c = dInp.comp, gas = dInp.gas, epsC = (gas.gc - 1) / gas.gc;
    const mcD = full.size.mc;
    const K = (1 + D.f) * mcD * Math.sqrt(D.Tt4) / D.Pt4;
    const kap = two ? (isFan ? (D.tlpc - 1) / (D.tf - 1) : 0) : (isFan ? (D.tf - 1) / (D.tc - 1) : 0);

    function at(T0, P0, M0, Tt4, full) {
      const tr = 1 + (gas.gc - 1) / 2 * M0 * M0;
      const tl = gas.cpt * Tt4 / (gas.cpc * T0);
      const hk = c.etab * gas.hPR / (gas.cpc * T0);
      let f = D.f, tf = 1, tc = 1, tlpc = 1, thpc = 1;
      for (let it = 0; it < 6; it++) {
        const base = c.etam * (1 + f) * tl / tr;
        if (two) {
          const RA = (1 - D.tth) * base, RB = (1 - D.ttl) * base * D.tth;
          if (isFan) {
            const b = 1 + alpha + kap, disc = b * b + 4 * kap * RB;
            const u = (-b + Math.sqrt(disc)) / (2 * kap);
            tf = 1 + u; tlpc = 1 + kap * u;
          } else { tlpc = 1 + RB; tf = 1; }
          thpc = 1 + RA / (tf * tlpc);
          tc = tf * tlpc * thpc;
        } else {
          const RS = (1 - D.tt) * base;
          tc = 1 + RS / (1 + alpha * kap);
          tf = isFan ? 1 + kap * (tc - 1) : 1;
        }
        f = (tl - tr * tc) / (hk - tl);
        if (!(f > 0)) return { ok: false, error: 'Tt4 demasiado baja: sin aporte de combustible.' };
      }
      const pi = (t, e) => Math.pow(t, e / epsC);
      const des = Object.assign({}, dInp.design, { Tt4 });
      if (two) { des.pif = isFan ? pi(tf, c.ef) : 1; des.pilpc = pi(tlpc, c.ec); des.pihpc = c.etaHPC > 0 ? Math.pow(1 + c.etaHPC * (thpc - 1), 1 / epsC) : pi(thpc, c.ec); }
      else { des.pic = pi(tc, c.ec); des.pif = isFan ? pi(tf, c.ef) : 1; }
      const nz = Object.assign({}, dInp.nozzle);
      if (nz.kindCore === 'cd') nz.p0p9 = 1;
      if (nz.kindFan === 'cd') nz.p0p19 = 1;
      const r = solve(Object.assign({}, dInp, { flight: { T0, P0, M0 }, design: des, nozzle: nz, size: { mdot0: 1, M2: 0.5 } }));
      if (!r.ok) return r;
      const mdotc = K * r.Pt4 / Math.sqrt(Tt4) / (1 + r.f), mdot0 = (1 + alpha) * mdotc;
      r.mdot0 = mdot0; r.mdotc = mdotc; r.mdotf = r.f * mdotc; r.F = r.Fsp * mdot0;
      r.offDesign = true;
      if (full) {
        const r2 = solve(Object.assign({}, dInp, { flight: { T0, P0, M0 }, design: des, nozzle: nz, size: { mdot0, M2: 0.5 } }));
        Object.assign(r2, { mdot0, mdotc, mdotf: r.mdotf, F: r.F, offDesign: true });
        return r2;
      }
      return r;
    }
    return { ok: true, design: full, at, K };
  }

  return { solve, isa, mfp, nozzle, makeOffDesign };
})();
if (typeof module !== 'undefined') module.exports = Engine;
