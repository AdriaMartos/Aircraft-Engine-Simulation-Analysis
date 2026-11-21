// Comprobaciones del modelo fuera de diseño y de la simulación de misión
global.Engine = require('../src/engine.js');
const Mission = require('../src/mission.js');
let fails = 0;
const check = (name, cond, info) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); if (!cond) fails++; };

const inp = {
  arch: 'turbofan', flight: { T0: 216.65, P0: 22632, M0: 0.78 },
  gas: { gc: 1.4, cpc: 1004.8, gt: 1.33, cpt: 1155.6, hPR: 42.8e6 },
  design: { spools: 'two', pif: 1.5, pilpc: 1.8, pihpc: 14.5, alpha: 11, Tt4: 1700 },
  comp: { pidmax: .995, pib: .95, pin: .995, pifn: .995, ec: .9, ef: .89, et: .89, etab: .999, etam: .995 },
  nozzle: { kindCore: 'cd', p0p9: 1, kindFan: 'cd', p0p19: 1 }, size: { mdot0: 420, M2: .5 }
};
const od = Engine.makeOffDesign(inp);
const d = od.design, r0 = od.at(216.65, 22632, 0.78, 1700);
check('fuera de diseño = diseño (empuje)', Math.abs(r0.F - d.size.F) / d.size.F < 1e-9);
check('fuera de diseño = diseño (TSFC)', Math.abs(r0.tsfc - d.tsfc) / d.tsfc < 1e-9);
check('fuera de diseño = diseño (caudal)', Math.abs(r0.mdot0 - 420) < 1e-6);
check('τ de turbinas constantes', Math.abs(r0.tth - d.tth) < 1e-9 && Math.abs(r0.ttl - d.ttl) < 1e-9);
const a0 = Engine.isa(0), sls = od.at(a0.T, a0.P, 0, 2000);
check('empuje estático a nivel del mar plausible (250–450 kN)', sls.ok && sls.F > 250e3 && sls.F < 450e3, (sls.F / 1000).toFixed(0) + ' kN');
const lo = od.at(216.65, 22632, 0.78, 1500), hi = od.at(216.65, 22632, 0.78, 1900);
check('el empuje crece con Tt4', lo.F < r0.F && r0.F < hi.F);

const ac = { m0: 0, S: 440, CD0: 0.0165, k: 0.042, Mcrit: 0.76, nEng: 2 };
ac.m0 = Math.round(Mission.autoMass(od, ac, 11000, 0.78) / 500) * 500;
const eng = { Tt4climb: 1900, Tt4cruise: 1850, idleFrac: 0.05 };
const ms = { mode: 'auto', range: 5000, h0: 450, hEnd: 450, casClimb: 150, casDesc: 144, Mmax: 0.85, Mfix: 0, hMin: 6000, hMax: 13000, rocMax: 15, rocMin: 1.5, cruiseClimb: false };
const r = Mission.simulate({ od, ac, eng, ms });
check('misión ideal completa', r.ok);
check('alcance dentro de ±1 %', Math.abs(r.sum.dist - 5000) < 50, r.sum.dist.toFixed(0) + ' km');
check('combustible 30–60 t en 5000 km', r.sum.fuel > 30e3 && r.sum.fuel < 60e3, (r.sum.fuel / 1000).toFixed(1) + ' t');
const cr = r.pts.filter(p => p.phase === 'crucero');
check('en crucero empuje = resistencia', cr.every(p => Math.abs(p.T - p.D) / p.D < 0.01));
check('la masa baja de forma monótona', r.pts.every((p, i) => !i || p.W <= r.pts[i - 1].W + 1e-6));
ms.cruiseClimb = true;
const rc = Mission.simulate({ od, ac, eng, ms });
check('cruise-climb sube de altitud en crucero', rc.ok && rc.pts.filter(p => p.phase === 'crucero').slice(-1)[0].h > rc.pts.filter(p => p.phase === 'crucero')[0].h);
ms.mode = 'manual'; ms.manualRating = 'cruise';
ms.waypoints = [{ x: 0, h: 450, M: .4 }, { x: 500, h: 9000, M: .7 }, { x: 2800, h: 9000, M: .7 }, { x: 3000, h: 450, M: .3 }];
const rm = Mission.simulate({ od, ac, eng, ms });
check('perfil manual calculado', rm.ok && rm.sum.dist > 2900);
ms.waypoints = [{ x: 0, h: 450, M: .4 }, { x: 20, h: 11000, M: .78 }, { x: 3000, h: 11000, M: .78 }];
const rs = Mission.simulate({ od, ac, eng, ms });
check('un ascenso imposible se avisa', rs.warnings.some(w => w.includes('más empuje')));
console.log(fails ? `\n${fails} comprobaciones fallidas` : '\nTodo correcto');
process.exit(fails ? 1 : 0);
