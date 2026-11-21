/* Simulación de misión (perfil vertical) con el motor fuera de diseño.
   Modelo de avión: polar parabólica con resistencia de onda; ISA; sin viento.
   El motor viene de Engine.makeOffDesign (turbinas bloqueadas, α constante, sin mapas de compresor). */
const Mission = (function () {
  const g0 = 9.80665, Rg = 287.053;
  const atm = h => { const a = Engine.isa(h); return { T: a.T, P: a.P, rho: a.P / (Rg * a.T), a: Math.sqrt(1.4 * Rg * a.T) }; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function machFromCAS(cas, h) {
    const P = atm(h).P, qc = 101325 * (Math.pow(1 + 0.2 * Math.pow(cas / 340.294, 2), 3.5) - 1);
    return Math.sqrt(5 * (Math.pow(qc / P + 1, 2 / 7) - 1));
  }
  // Programa de velocidad: CAS limitada a 250 kt por debajo de 10 000 ft y Mach máximo
  function speedM(h, s) {
    const cas = h < 3048 ? Math.min(s.cas, 128.6) : s.cas;
    return Math.min(machFromCAS(cas, h), s.mach);
  }
  function aero(ac, W, h, M, cosg) {
    const a = atm(h), V = M * a.a, q = 0.5 * a.rho * V * V;
    const CL = W * g0 * (cosg == null ? 1 : cosg) / (q * ac.S);
    const CDw = 20 * Math.pow(Math.max(0, M - ac.Mcrit), 4);
    const CD = ac.CD0 + ac.k * CL * CL + CDw;
    return { V, q, CL, CD, D: q * ac.S * CD, a };
  }

  /* Controlador del motor: empuje requerido por motor -> Tt4, empuje, consumo */
  function makeEngine(od, eng) {
    const at = (h, M, T) => { const a = atm(h); return od.at(a.T, a.P, M, T); };
    function maxThrust(h, M, Tt4) {
      const r = at(h, M, Tt4);
      return r.ok ? { F: r.F, mf: r.mdotf, Tt4, res: r } : { F: 0, mf: 0, Tt4, res: null, fail: true };
    }
    function forThrust(h, M, Treq, Tt4max) {
      const rHi = at(h, M, Tt4max);
      if (!rHi.ok) return { F: 0, mf: 0, Tt4: Tt4max, flag: 'fail', res: null };
      if (Treq >= rHi.F) return { F: rHi.F, mf: rHi.mdotf, Tt4: Tt4max, flag: 'max', res: rHi };
      const lo0 = 650;
      let Tb = lo0, rb = at(h, M, lo0);
      if (!rb.ok) {
        let l = lo0, u = Tt4max;
        for (let i = 0; i < 14; i++) { const m = (l + u) / 2; if (at(h, M, m).ok) u = m; else l = m; }
        Tb = u; rb = at(h, M, Tb);
      }
      if (Treq <= rb.F) {
        const Fi = Math.min(rb.F, Math.max(Treq, eng.idleFrac * rHi.F));
        return { F: Fi, mf: rb.mdotf * Math.pow(Fi / rb.F, 0.7), Tt4: Tb, flag: 'idle', res: rb };
      }
      let l = Tb, u = Tt4max, r = rb;
      for (let i = 0; i < 16; i++) {
        const m = (l + u) / 2; r = at(h, M, m);
        if (r.F < Treq) l = m; else u = m;
      }
      r = at(h, M, (l + u) / 2);
      return { F: r.F, mf: r.mdotf, Tt4: (l + u) / 2, flag: '', res: r };
    }
    return { maxThrust, forThrust, at };
  }

  function simulate(cfg) {
    const { od, ac, eng, ms } = cfg;
    const E = makeEngine(od, eng), nE = ac.nEng;
    const warnings = [];
    const warn = w => { if (!warnings.includes(w)) warnings.push(w); };
    const pts = [];
    const st = { t: 0, x: 0, h: ms.h0, W: ac.m0, fuel: 0 };

    function rec(phase, M, ae, e, gam, extra) {
      const a = ae.a;
      pts.push(Object.assign({
        phase, t: st.t, x: st.x / 1000, h: st.h, M, V: ae.V, W: st.W, CL: ae.CL, CD: ae.CD,
        D: ae.D, T: nE * e.F, Tt4: e.Tt4, mf: nE * e.mf, flag: e.flag || '', gam: gam * 180 / Math.PI,
        fuel: st.fuel, tsfc: e.F > 0 ? e.mf / e.F : 0
      }, extra || {}));
    }
    function advance(dt, V, sg, mf) {
      const cg = Math.sqrt(1 - sg * sg);
      st.t += dt; st.x += V * cg * dt; st.h += V * sg * dt; st.W -= mf * dt; st.fuel += mf * dt;
    }
    const dVdh = (h, s) => {
      const hl = Math.max(0, h - 50), hu = h + 50;
      return (speedM(hu, s) * atm(hu).a - speedM(hl, s) * atm(hl).a) / (hu - hl);
    };

    /* ----- ascenso a potencia máxima o con límite de régimen de ascenso ----- */
    function climb(hTop, s) {
      let guard = 0;
      while (st.h < hTop - 1 && guard++ < 3000) {
        const h = st.h, M = speedM(h, s), a = atm(h), V = M * a.a, dv = dVdh(h, s);
        const Fm = E.maxThrust(h, M, eng.Tt4climb);
        if (Fm.fail) { warn('El motor no tiene solución a esa altitud y velocidad en ascenso.'); return false; }
        const Tmax = nE * Fm.F, share = 1 + V * dv / g0;
        let sg = 0, ae = aero(ac, st.W, h, M, 1);
        for (let k = 0; k < 3; k++) { ae = aero(ac, st.W, h, M, Math.sqrt(1 - sg * sg)); sg = clamp((Tmax - ae.D) / (st.W * g0 * share), -0.3, 0.4); }
        if (sg < 0.002) { warn('Techo de ascenso: con la potencia máxima el avión no puede seguir subiendo.'); return false; }
        let e = { F: Fm.F, mf: Fm.mf, Tt4: eng.Tt4climb, flag: 'max' };
        const sgCap = ms.rocMax / V;
        if (sg > sgCap) {
          sg = sgCap; ae = aero(ac, st.W, h, M, Math.sqrt(1 - sg * sg));
          const Treq = (ae.D + st.W * g0 * sg * share) / nE;
          e = E.forThrust(h, M, Treq, eng.Tt4climb);
        }
        const dt = clamp((hTop - h) / (V * sg), 1, 15);
        rec('ascenso', M, ae, e, Math.asin(sg));
        advance(dt, V, sg, nE * e.mf);
      }
      return true;
    }

    /* ----- optimización del crucero (máximo alcance específico) ----- */
    function cruiseOpt(W, fixedM) {
      let best = null;
      const Ms = fixedM ? [fixedM] : []; if (!fixedM) for (let M = 0.62; M <= ms.Mmax + 1e-6; M += 0.02) Ms.push(M);
      for (const M of Ms) for (let h = ms.hMin; h <= ms.hMax + 1; h += 250) {
        const ae = aero(ac, W, h, M, 1), Fm = E.maxThrust(h, M, eng.Tt4cruise);
        if (Fm.fail || ae.D / nE > Fm.F) continue;
        // techo de servicio: con empuje de ascenso y el avión más pesado debe sobrar régimen de ascenso
        const Wc = W * 1.06, aeC = aero(ac, Wc, h, M, 1), Fc = E.maxThrust(h, M, eng.Tt4climb);
        if (Fc.fail || (nE * Fc.F - aeC.D) * aeC.V / (Wc * g0) < ms.rocMin) continue;
        const e = E.forThrust(h, M, ae.D / nE, eng.Tt4cruise);
        if (e.flag === 'fail' || e.flag === 'idle') continue;
        const sr = ae.V / (nE * e.mf);
        if (!best || sr > best.sr) best = { M, h, sr, Tt4: e.Tt4 };
      }
      return best;
    }

    /* ----- crucero hasta xEnd (m); con climbMode sigue la altitud óptima (cruise-climb) ----- */
    function cruise(M, xEnd, climbMode, trail) {
      let guard = 0;
      while (st.x < xEnd && guard++ < 5000) {
        const h = st.h;
        let rate = 0;
        if (climbMode) {
          if (guard % 5 === 1) { const o = cruiseOpt(st.W, M); if (o) trail.hOpt = Math.max(trail.hOpt || h, o.h); }
          if (trail.hOpt && trail.hOpt > h + 2) rate = Math.min(2.5, (trail.hOpt - h) / 120);
        }
        const a = atm(h), V = M * a.a;
        let sg = rate / V, ae = aero(ac, st.W, h, M, Math.sqrt(1 - sg * sg));
        let e = E.forThrust(h, M, (ae.D + st.W * g0 * sg) / nE, eng.Tt4cruise);
        if (e.flag === 'max' && sg > 0) { sg = 0; ae = aero(ac, st.W, h, M, 1); e = E.forThrust(h, M, ae.D / nE, eng.Tt4cruise); }
        if (e.flag === 'fail') { warn('El motor no tiene solución en crucero.'); return false; }
        if (e.flag === 'max') warn('Crucero limitado por empuje: la resistencia supera el empuje disponible con Tt4 máx. de crucero.');
        const dt = clamp((xEnd - st.x) / V, 1, 60);
        rec('crucero', M, ae, e, Math.asin(sg));
        advance(dt, V, sg, nE * e.mf);
      }
      return true;
    }

    /* ----- descenso a ralentí ----- */
    function descent(hEnd, s) {
      let guard = 0;
      while (st.h > hEnd + 1 && guard++ < 4000) {
        const h = st.h, M = speedM(h, s), a = atm(h), V = M * a.a, dv = dVdh(h, s);
        const share = 1 + V * dv / g0;
        let sg = -0.05, ae = aero(ac, st.W, h, M, 1), e;
        e = E.forThrust(h, M, 0, eng.Tt4cruise);
        if (e.flag === 'fail') { warn('El motor no tiene solución en descenso.'); return false; }
        for (let k = 0; k < 3; k++) { ae = aero(ac, st.W, h, M, Math.sqrt(1 - sg * sg)); sg = clamp((nE * e.F - ae.D) / (st.W * g0 * share), -0.3, -0.01); }
        const dt = clamp((h - hEnd) / (V * -sg), 1, 15);
        rec('descenso', M, ae, e, Math.asin(sg));
        advance(dt, V, sg, nE * e.mf);
      }
      return true;
    }

    /* ======================== modo automático ======================== */
    function runAuto() {
      const tgt = ms.range * 1000;
      let Wmid = 0.92 * ac.m0, opt = null, res = null;
      for (let it = 0; it < 3; it++) {
        opt = cruiseOpt(Wmid, ms.Mfix || 0);
        if (!opt) { warn('No hay ninguna combinación de altitud y Mach con la que el avión pueda cruzar con este motor. Revisa masa, Tt4 máx. de crucero o la resistencia.'); return null; }
        res = runFrom(opt, tgt);
        const cr = res.pts.filter(p => p.phase === 'crucero');
        if (!cr.length) break;
        const Wm = cr.reduce((a, p) => a + p.W, 0) / cr.length;
        if (Math.abs(Wm - Wmid) / Wmid < 0.01) break;
        Wmid = Wm;
      }
      res.opt = opt;
      return res;
    }
    function runFrom(opt, tgt) {
      pts.length = 0; Object.assign(st, { t: 0, x: 0, h: ms.h0, W: ac.m0, fuel: 0 });
      warnings.length = 0;
      const climbSched = { cas: ms.casClimb, mach: opt.M };
      const descSched = { cas: ms.casDesc, mach: opt.M };
      const hTop = ms.cruiseClimb ? ((cruiseOpt(0.97 * ac.m0, opt.M) || opt).h) : opt.h;
      climb(hTop, climbSched);
      const iClimb = pts.length;
      const xToc = st.x;
      let trail = {}, dDesc = Math.max(40e3, (opt.h - ms.hEnd) * 20);
      const stClimb = Object.assign({}, st);
      cruise(opt.M, tgt - 10e3, ms.cruiseClimb, trail);
      const iCruiseEnd = pts.length, stCruise = Object.assign({}, st);
      const cruisePts = pts.slice(iClimb);
      let out = null;
      for (let it = 0; it < 5; it++) {
        // restaurar el estado de crucero en x = tgt - dDesc
        pts.length = iClimb; for (const p of cruisePts) { if (p.x * 1000 <= tgt - dDesc) pts.push(p); else break; }
        const last = pts[pts.length - 1] || null;
        if (last) Object.assign(st, { t: last.t, x: last.x * 1000, h: last.h, W: last.W, fuel: last.fuel });
        else Object.assign(st, stClimb);
        const xTod = st.x, hTod = st.h, nPre = pts.length;
        descent(ms.hEnd, descSched);
        const dNew = st.x - xTod;
        out = { xTod, hTod, dDesc: dNew, nPre };
        if (Math.abs(dNew - dDesc) < 2e3) break;
        dDesc = dNew;
      }
      return { pts: pts.slice(), opt, xToc, tod: out, st: Object.assign({}, st), warnings: warnings.slice() };
    }

    /* ======================== modo manual ======================== */
    function runManual() {
      const wp = ms.waypoints.slice().sort((a, b) => a.x - b.x);
      if (wp.length < 2) { warn('Hacen falta al menos 2 puntos de ruta.'); return null; }
      Object.assign(st, { t: 0, x: wp[0].x * 1000, h: wp[0].h, W: ac.m0, fuel: 0 });
      const lim = [];
      for (let i = 0; i < wp.length - 1; i++) {
        const A = wp[i], B = wp[i + 1], L = (B.x - A.x) * 1000;
        if (L <= 0) continue;
        const dx = Math.max(500, Math.min(10000, L / 20)), n = Math.max(1, Math.round(L / dx));
        for (let k = 0; k < n; k++) {
          const u0 = k / n, u1 = (k + 1) / n;
          const h = A.h + (B.h - A.h) * u0, h1 = A.h + (B.h - A.h) * u1;
          const M = A.M + (B.M - A.M) * u0, M1 = A.M + (B.M - A.M) * u1;
          const ds = L / n, gam = Math.atan2(h1 - h, ds), sg = Math.sin(gam);
          const a = atm(h), a1 = atm(h1), V = M * a.a, V1 = M1 * a1.a;
          const dt = ds / Math.max(30, 0.5 * (V + V1));
          const ae = aero(ac, st.W, h, M, Math.cos(gam));
          const Treq = (ae.D + st.W * g0 * sg + st.W * (V1 - V) / dt) / nE;
          const Tmax = ms.manualRating === 'cruise' ? eng.Tt4cruise : eng.Tt4climb;
          const e = E.forThrust(h, M, Math.max(0, Treq), Tmax);
          if (e.flag === 'fail') { warn('El motor no tiene solución en el tramo ' + (i + 1) + '.'); return null; }
          if (e.flag === 'max' && Treq > e.F * 1.001) lim.push(i + 1);
          if (e.flag === 'idle' && Treq < 0) warn('Tramo ' + (i + 1) + ': el descenso pedido es más empinado que el de ralentí; haría falta resistencia extra (aerofrenos).');
          st.h = h;
          rec('manual', M, ae, e, gam, { seg: i + 1, short: e.flag === 'max' && Treq > e.F * 1.001 });
          advance(dt, 0.5 * (V + V1), sg, nE * e.mf);
          st.h = h1;
        }
      }
      for (const s of new Set(lim)) warn('Tramo ' + s + ': el perfil pedido exige más empuje del que da el motor con Tt4 máx. (el avión no lo podría volar).');
      return { pts: pts.slice(), st: Object.assign({}, st), warnings: warnings.slice() };
    }

    if (!(ac.m0 > 0)) return { ok: false, warnings: ['Masa inicial no válida (≤ 0). Si usas la masa automática, este motor no da empuje ni para la resistencia parásita del avión en el punto de diseño: sube ṁ₀ o Tt4, añade motores o reduce S o C_D0.'] };
    const out = ms.mode === 'manual' ? runManual() : runAuto();
    if (!out) return { ok: false, warnings };
    const p = out.pts, last = out.st;
    if (p.length < 2) return { ok: false, warnings: warnings.length ? warnings.concat(['No se ha podido calcular ningún tramo: el motor, tal como está diseñado, no funciona en las condiciones del inicio del vuelo (altitud y Mach bajos). Suele pasar con α alto y π del fan bajo; prueba otro punto de diseño.']) : ['No se ha podido calcular ningún tramo del vuelo.'] };
    if (last.W < 0.3 * ac.m0) return { ok: false, warnings: ['El vuelo necesitaría quemar ' + (100 * last.fuel / ac.m0).toFixed(0) + ' % de la masa inicial en combustible: imposible para un avión real (el máximo práctico ronda el 40–45 %). Reduce el alcance o la resistencia, o mejora el motor.'] };
    if (last.fuel > 0.45 * ac.m0) warnings.push('El combustible es el ' + (100 * last.fuel / ac.m0).toFixed(0) + ' % de la masa inicial: más de lo que cabe en un avión real (≈ 40–45 % como máximo).');
    out.ok = true; out.warnings = warnings.slice();
    out.sum = {
      fuel: last.fuel, time: last.t, dist: last.x / 1000, mEnd: last.W,
      climb: segSum(p, 'ascenso'), cruise: segSum(p, 'crucero'), descent: segSum(p, 'descenso'),
      maxF: Math.max(...p.map(q => q.T))
    };
    return out;
  }
  function segSum(p, ph) {
    const a = p.filter(q => q.phase === ph);
    if (!a.length) return null;
    const f0 = a[0].fuel, t0 = a[0].t, x0 = a[0].x, l = a[a.length - 1];
    const nxt = p[p.indexOf(l) + 1];
    return { fuel: (nxt ? nxt.fuel : l.fuel) - f0, time: (nxt ? nxt.t : l.t) - t0, dist: (nxt ? nxt.x : l.x) - x0 };
  }

  /* Masa con la que el motor sostiene el vuelo nivelado a Tt4 de diseño en el punto de diseño */
  function autoMass(od, ac, h, M) {
    const d = od.design, Fper = d.size.F, a = atm(h), V = M * a.a, q = 0.5 * a.rho * V * V;
    const D = ac.nEng * Fper, CD0w = ac.CD0 + 20 * Math.pow(Math.max(0, M - ac.Mcrit), 4);
    const x = (D - q * ac.S * CD0w) * q * ac.S / ac.k;
    return x > 0 ? Math.sqrt(x) / g0 / 0.92 : 0;
  }

  return { simulate, autoMass, atm, aero, speedM, machFromCAS };
})();
if (typeof module !== 'undefined') module.exports = Mission;
