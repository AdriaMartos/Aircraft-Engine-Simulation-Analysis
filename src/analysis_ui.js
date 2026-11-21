/* ================= Modo «Analizar un motor» =================
   Se inserta dentro del script principal (usa $, fmt, ib, INFO, S, R, update, toInput, Calcs, Engine, getP, setP). */
const AN_KEY = 'aesa-analisis-v1';
let AN = null, AN_STEP = 1, AN_SUB = 'res', MODE = 'ex';
function anLoad() {
  try { const t = localStorage.getItem(AN_KEY); if (t) { const o = JSON.parse(t); AN = anMerge(Analysis.DEFAULT(), o); return; } } catch (e) { }
  AN = Analysis.DEFAULT();
}
function anMerge(base, o) {
  for (const k in o) { if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && base[k] && typeof base[k] === 'object') anMerge(base[k], o[k]); else if (k in base || k === 'src') base[k] = o[k]; }
  return base;
}
function anSave() { try { localStorage.setItem(AN_KEY, JSON.stringify(AN)); } catch (e) { } }

/* ---------- Pasos ---------- */
const AN_STEPS = [
  { n: 1, t: 'Datos del motor', s: 'Crucero, ciclo, eficiencias y mapa del HPC' },
  { n: 2, t: 'Punto de diseño', s: 'Ciclo resuelto: F, TSFC y rendimientos' },
  { n: 3, t: 'Mapas de calor', s: 'π_LPC × π_HPC, dos escenarios' },
  { n: 4, t: 'Compresor de alta', s: 'Etapas repetidas y triángulos' },
  { n: 5, t: 'Turbina de alta', s: 'Una etapa y triángulos' },
  { n: 6, t: 'Fuera de diseño', s: 'Nivel del mar, estático' },
  { n: 7, t: 'Resumen', s: 'Tablas de datos y resultados' }
];

/* ---------- Campos del paso 1 ----------
   [ruta, etiqueta, unidad, min, max, paso, escala (valor mostrado = guardado·escala), clave de ayuda] */
const ANF = {
  flight: [['h0', 'Altitud de crucero h₀', 'm', 1000, 15000, 1, 1, 'an_h0'], ['M0', 'Mach de crucero M₀', '', 0.3, 0.95, 0.01, 1, 'an_M0']],
  cycle: [['alpha', 'Relación de derivación α', '', 0.5, 20, 0.01, 1, 'alpha'], ['OPR', 'Relación de compresión global OPR', '', 5, 70, 0.1, 1, 'an_OPR'], ['pif', 'π del fan π_f', '', 1.1, 3, 0.01, 1, 'pif']],
  burner: [['Tt4', 'Temperatura de entrada a turbina T_t4', 'K', 1000, 2200, 1, 1, 'Tt4'], ['fuel', 'Poder calorífico h_PR', 'MJ/kg', 10, 125, 0.01, 1, 'hPR'], ['eff.etab', 'Rendimiento de combustión η_b', '', 0.7, 1, 0.001, 1, 'etab'], ['eff.pib', 'Recuperación de presión de la cámara π_b', '', 0.7, 1, 0.001, 1, 'pib']],
  eff: [['eff.pidmax', 'Recuperación de la toma π_d máx', '', 0.7, 1, 0.001, 1, 'pidmax'], ['eff.ef', 'Eficiencia politrópica del fan e_f', '', 0.7, 1, 0.001, 1, 'ef'], ['eff.ec', 'Eficiencia politrópica del LPC e_LPC', '', 0.7, 1, 0.001, 1, 'an_eLPC'], ['eff.et', 'Eficiencia politrópica de las turbinas e_t', '', 0.7, 1, 0.001, 1, 'et'], ['eff.etam', 'Rendimiento mecánico η_m', '', 0.7, 1, 0.001, 1, 'etam'], ['eff.pin', 'Recuperación de la tobera del núcleo π_n', '', 0.7, 1, 0.001, 1, 'pin'], ['eff.pifn', 'Recuperación de la tobera del fan π_fn', '', 0.7, 1, 0.001, 1, 'pifn']],
  gas: [['gas.gc', 'γ aire frío', '', 1.2, 1.5, 0.001, 1, 'gc'], ['gas.cpc', 'c_p aire frío', 'J/(kg·K)', 900, 1300, 0.1, 1, 'cpc'], ['gas.gt', 'γ gas caliente', '', 1.2, 1.45, 0.001, 1, 'gt'], ['gas.cpt', 'c_p gas caliente', 'J/(kg·K)', 1000, 1500, 0.1, 1, 'cpt']],
  map: [['hpc.mc', 'Caudal corregido del HPC ṁ_c,25', 'kg/s', 3, 25, 0.01, 1, 'an_mc'], ['hpc.pi', 'π del HPC π_HPC', '', 1.2, 9, 0.001, 1, 'an_piHPC'], ['hpc.eta', 'Eficiencia isentrópica del HPC η_HPC', '', 0.5, 1, 0.001, 1, 'an_etaHPC'], ['ref.T', 'Temperatura de referencia T_ref', 'K', 200, 400, 0.01, 1, 'an_ref'], ['ref.P', 'Presión de referencia P_ref', 'Pa', 50000, 150000, 1, 1, 'an_ref']]
};
const anSub = s => s.replace(/_([A-Za-z0-9,]+)/g, '<sub>$1</sub>');
function anField(f) {
  const v = getP(AN, f[0]) * f[6], src = (AN.src || {})[f[0]] || '';
  return `<div class="an-f"><label for="anf_${f[0]}">${anSub(f[1])}${f[2] ? ` <span class="u">[${f[2]}]</span>` : ''}${f[7] && INFO[f[7]] ? ib(f[7]) : ''}</label>
    <input type="number" id="anf_${f[0]}" data-an="${f[0]}" min="${f[3]}" max="${f[4]}" step="${f[5]}" value="${+(+v).toFixed(6)}" inputmode="decimal">
    <input type="text" class="src" data-src="${f[0]}" value="${String(src).replace(/"/g, '&quot;')}" placeholder="Fuente o supuesto" aria-label="Fuente de ${f[1]}"></div>`;
}
const anFields = list => list.map(anField).join('');

/* ---------- Render general ---------- */
function setMode(m) {
  MODE = m;
  $('#segMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === m));
  $('#exView').hidden = m !== 'ex'; $('#anView').hidden = m !== 'an';
  if (m === 'an') renderAnalysis();
  try { localStorage.setItem(AN_KEY + '-mode', m); } catch (e) { }
}
function renderAnalysis() {
  const nav = $('#anNav');
  nav.innerHTML = AN_STEPS.map(s => `<button type="button" data-s="${s.n}" aria-current="${s.n === AN_STEP ? 'step' : 'false'}"${s.soon ? ' class="soon"' : ''}><span class="k">${s.n}</span><span class="t">${s.t}${s.soon ? ' <em>próximamente</em>' : ''}<small>${anSub(s.s)}</small></span></button>`).join('') +
    `<div class="an-io"><input type="text" id="anName" value="${String(AN.name).replace(/"/g, '&quot;')}" aria-label="Nombre del motor" placeholder="Nombre del motor">
     <button type="button" class="btn" id="anExport">Guardar archivo</button><label class="btn" for="anImport">Cargar archivo</label><input type="file" id="anImport" accept=".json,application/json" hidden>
     <button type="button" class="btn" id="anReset">Empezar de cero</button>
     <p class="note">Se guarda solo en este navegador. Usa «Guardar archivo» para pasarlo a otra persona.</p></div>`;
  nav.querySelectorAll('button[data-s]').forEach(b => b.addEventListener('click', () => { AN_STEP = +b.dataset.s; renderAnalysis(); $('#anMain').scrollIntoView({ block: 'nearest' }); }));
  $('#anName').addEventListener('input', e => { AN.name = e.target.value; anSave(); });
  $('#anExport').addEventListener('click', () => anSaveFile((AN.name || 'motor').replace(/[^\wáéíóúñ-]+/gi, '_') + '.json', JSON.stringify(AN, null, 2), 'application/json'));
  $('#anImport').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { try { AN = anMerge(Analysis.DEFAULT(), JSON.parse(t)); anSave(); renderAnalysis(); } catch (err) { alertChip('No se ha podido leer el archivo: ' + err.message); } });
  });
  $('#anReset').addEventListener('click', () => { if (!confirmReset()) return; AN = Analysis.DEFAULT(); anSave(); AN_STEP = 1; renderAnalysis(); });
  const main = $('#anMain');
  const V = { 1: [anStep1, anInit1], 2: [anStep2, anInit2], 3: [anStep3, anInit3], 4: [anStep4, anInit4], 5: [anStep5, anInit5], 6: [anStep6, anInit6], 7: [anStep7, anInit7] }[AN_STEP];
  main.innerHTML = V[0]();
  V[1]();
}
let resetArm = 0;
function confirmReset() { const b = $('#anReset'); if (Date.now() - resetArm < 4000) return true; resetArm = Date.now(); b.textContent = 'Pulsa otra vez para borrar'; setTimeout(() => { if (b.isConnected) b.textContent = 'Empezar de cero'; }, 4000); return false; }
function alertChip(msg) { const m = $('#anMain'); m.insertAdjacentHTML('afterbegin', `<div class="alerts"><span class="chip bad">${msg}</span></div>`); }
async function anSaveFile(name, data, type) {
  try { if (window.claude && window.claude.use) { const dn = await window.claude.use('downloads'); if (dn && dn.save) { await dn.save({ filename: name, data }); return; } } } catch (e) { }
  const b = new Blob([data], { type: type + ';charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function anLearn(html, open) { return `<details class="an-learn"${open ? ' open' : ''}><summary>Qué se hace en este paso y por qué</summary><div>${html}</div></details>`; }

/* ---------- Paso 1 ---------- */
function anStep1() {
  const fuelOpts = [['', 'Personalizado'], ['42.8', 'Queroseno · 42,8'], ['43.15', 'Jet A-1 · 43,15']].map(o => `<option value="${o[0]}"${+o[0] === AN.fuel ? ' selected' : ''}>${o[1]}</option>`).join('');
  const noz = (k, lab) => `<div class="an-f"><label>${lab}</label><select data-an-sel="nozzle.${k}"><option value="cd"${AN.nozzle[k] === 'cd' ? ' selected' : ''}>Convergente-divergente</option><option value="conv"${AN.nozzle[k] === 'conv' ? ' selected' : ''}>Convergente</option></select><span></span></div>`;
  return `<h2 class="an-h">1 · Datos del motor</h2>
  ${anLearn(`<p>Analizar un motor real empieza por fijar su <b>punto de diseño</b>: una condición de vuelo (normalmente el crucero) y los parámetros que definen el ciclo. Con ellos, el ciclo on-design da empuje, consumo y rendimientos.</p>
   <ul><li><b>Datos públicos</b>: α, OPR y a veces π<sub>f</sub> aparecen en hojas técnicas y bases de datos de certificación. El crucero (h₀, M₀) es el del avión que lo usa.</li>
   <li><b>Datos que hay que estimar</b>: T<sub>t4</sub> casi nunca es pública, y las eficiencias tampoco. Se toman de los niveles tecnológicos actuales y se justifican. Anota cada fuente o supuesto en la columna de la derecha.</li>
   <li><b>El compresor de alta sale de su mapa.</b> El punto de diseño del mapa da π<sub>HPC</sub>, la eficiencia isentrópica η<sub>HPC</sub> y el <b>caudal corregido</b> ṁ<sub>c,25</sub>. El LPC se ajusta para cerrar el OPR: ${eq('π<sub>LPC</sub> = OPR/(π<sub>f</sub>·π<sub>HPC</sub>)')}.</li>
   <li><b>Caudal corregido.</b> Es el caudal que pasaría por el compresor con T<sub>t</sub> y P<sub>t</sub> de referencia: ${eq('ṁ<sub>c</sub> = ṁ·√θ/δ')}, con θ = T<sub>t</sub>/T<sub>ref</sub> y δ = P<sub>t</sub>/P<sub>ref</sub>. El mapa no cambia con la altitud en variables corregidas, pero el caudal real sí: en crucero el aire es menos denso y ${eq('ṁ<sub>core</sub> = ṁ<sub>c,25</sub>·δ<sub>25</sub>/√θ<sub>25</sub>')} es mucho menor que a nivel del mar. Con α se llega al caudal total ${eq('ṁ₀ = (1+α)·ṁ<sub>core</sub>')}.</li>
   <li><b>Isentrópica o politrópica.</b> El mapa da η<sub>HPC</sub> isentrópica y se usa tal cual: ${eq('τ<sub>HPC</sub> = 1 + (π<sub>HPC</sub><sup>(γ−1)/γ</sup> − 1)/η<sub>HPC</sub>')}. Los demás componentes usan eficiencias politrópicas de la tabla de niveles tecnológicos.</li></ul>`, !anSeen(1))}
  <div class="an-cols">
    <section class="card an-card"><h3>Condición de diseño (crucero)</h3>${anFields(ANF.flight)}<p class="note" id="anAtm"></p></section>
    <section class="card an-card"><h3>Derivación y compresión</h3>${anFields(ANF.cycle)}
      <div class="an-ro"><span>π<sub>HPC</sub> (del mapa)</span><b id="anPiH"></b></div><div class="an-ro"><span>π<sub>LPC</sub> = OPR/(π<sub>f</sub>·π<sub>HPC</sub>)</span><b id="anPiL"></b></div></section>
    <section class="card an-card"><h3>Cámara y combustible</h3>${anFields(ANF.burner.slice(0, 1))}
      <div class="an-f"><label for="anFuel">Combustible</label><select id="anFuel">${fuelOpts}</select><span></span></div>${anFields(ANF.burner.slice(1))}</section>
    <section class="card an-card"><h3>Eficiencias y pérdidas</h3>
      <div class="an-tech">Rellenar con nivel tecnológico: <button type="button" class="btn" data-tech="3">N3</button><button type="button" class="btn" data-tech="4">N4 (actual)</button></div>${anFields(ANF.eff)}</section>
    <section class="card an-card an-wide"><h3>Mapa del compresor de alta (HPC)${ib('an_map')}</h3>
      <div class="an-map"><div><svg id="anMapSvg" viewBox="0 0 560 330" role="img" aria-label="Mapa del compresor de alta: línea de operación y punto de diseño"></svg><div class="an-legend"><span><i class="ln"></i>Línea de operación</span><span><i class="pt"></i>Punto de diseño del mapa</span><span><i class="pt us"></i>Valores en uso</span></div></div>
      <div>${anFields(ANF.map)}<button type="button" class="btn" id="anMapReset">Usar el punto de diseño del mapa</button>
      <p class="note">Mapa digitalizado: punto de diseño ṁ<sub>c,25</sub> = ${fmt(Analysis.HPC_MAP.design.mc, 1)} kg/s, π<sub>HPC</sub> = ${fmt(Analysis.HPC_MAP.design.pi, 2)}, η<sub>HPC</sub> ≈ ${fmt(Analysis.HPC_MAP.design.eta, 2)}. Comprueba la lectura sobre la figura original; si lees otro valor, cámbialo aquí.</p></div></div></section>
    <section class="card an-card"><h3>Toberas</h3>${noz('kindCore', 'Tobera del núcleo')}${AN.nozzle.kindCore === 'cd' ? anField(['nozzle.p0p9', 'P₀/P₉ núcleo', '', 0.2, 1, 0.01, 1, '']) : ''}${noz('kindFan', 'Tobera del fan')}${AN.nozzle.kindFan === 'cd' ? anField(['nozzle.p0p19', 'P₀/P₁₉ fan', '', 0.2, 1, 0.01, 1, '']) : ''}
      <p class="note">Con 1 (tobera adaptada) los rendimientos son comparables entre motores.</p></section>
    <section class="card an-card"><h3>Gas</h3>${anFields(ANF.gas)}</section>
  </div>
  <section class="card an-card an-out"><h3>Resultado de este paso</h3><div id="anLive"></div></section>
  <div class="an-next"><button type="button" class="btn primary" data-go="2">Siguiente: punto de diseño →</button></div>`;
}
function anSeen(n) { try { const k = AN_KEY + '-seen' + n, v = localStorage.getItem(k); localStorage.setItem(k, '1'); return !!v; } catch (e) { return false; } }
function anInit1() {
  const main = $('#anMain');
  main.querySelectorAll('input[data-an]').forEach(el => el.addEventListener('input', () => {
    const f = Object.values(ANF).flat().find(x => x[0] === el.dataset.an) || [el.dataset.an, '', '', +el.min, +el.max, 0, 1];
    const v = parseFloat(String(el.value).replace(',', '.')), ok = isFinite(v) && v >= f[3] && v <= f[4];
    el.classList.toggle('bad', !ok); if (!ok) return;
    setP(AN, el.dataset.an, v / f[6]);
    if (el.dataset.an === 'fuel') { const s = $('#anFuel'); if (s) s.value = [42.8, 43.15].includes(v) ? String(v) : ''; }
    anSave(); anLive();
  }));
  main.querySelectorAll('input[data-src]').forEach(el => el.addEventListener('input', () => { AN.src = AN.src || {}; AN.src[el.dataset.src] = el.value; anSave(); }));
  main.querySelectorAll('select[data-an-sel]').forEach(el => el.addEventListener('change', () => { setP(AN, el.dataset.anSel, el.value); anSave(); renderAnalysis(); }));
  $('#anFuel').addEventListener('change', e => { if (!e.target.value) return; AN.fuel = +e.target.value; anSave(); const i = $('#anf_fuel'); if (i) i.value = AN.fuel; anLive(); });
  main.querySelectorAll('[data-tech]').forEach(b => b.addEventListener('click', () => {
    const t = TECH[+b.dataset.tech]; ['pidmax', 'ef', 'ec', 'et', 'pib', 'etab', 'etam', 'pin', 'pifn'].forEach(k => AN.eff[k] = t[k]);
    anSave(); renderAnalysis();
  }));
  $('#anMapReset').addEventListener('click', () => { const d = Analysis.HPC_MAP.design; AN.hpc = { mc: d.mc, pi: d.pi, eta: d.eta }; AN.ref = Object.assign({}, Analysis.HPC_MAP.ref); anSave(); renderAnalysis(); });
  main.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { AN_STEP = +b.dataset.go; renderAnalysis(); window.scrollTo({ top: 0 }); }));
  anLive();
}
function anLive() {
  const d = Analysis.derive(AN);
  const atm = $('#anAtm'); if (atm) atm.innerHTML = `ISA: T₀ = ${fmt(d.T0, 2)} K, P₀ = ${fmt(d.P0 / 1000, 3)} kPa`;
  const pH = $('#anPiH'); if (pH) pH.textContent = fmt(AN.hpc.pi, 3);
  const pL = $('#anPiL'); if (pL) { pL.textContent = fmt(d.pilpc, 3); pL.className = d.pilpc < 1 ? 'bad' : ''; }
  anDrawMap();
  const el = $('#anLive'); if (!el) return;
  const chips = d.errors.map(e => `<span class="chip bad">${e}</span>`).concat(d.warnings.map(w => `<span class="chip warn">${w}</span>`));
  el.innerHTML = (chips.length ? `<div class="alerts">${chips.join('')}</div>` : '') +
    `<div class="tiles an-tiles">${anKpi('π_LPC', fmt(d.pilpc, 3), '')}${anKpi('T_t25', fmt(d.Tt25, 1), 'K')}${anKpi('P_t25', fmt(d.Pt25 / 1000, 2), 'kPa')}${anKpi('ṁ_core', fmt(d.mcore, 2), 'kg/s')}${anKpi('ṁ₀ total', fmt(d.m0, 1), 'kg/s')}</div>
    <details class="cl-sec"><summary>Cálculo del caudal paso a paso</summary>${anSheetHTML(d.sheet)}</details>`;
}
function anKpi(l, v, u) { return `<div class="card tile"><div class="l">${anSub(l)}</div><div class="big">${v}</div><div class="u">${u || '&nbsp;'}</div></div>`; }
function anSheetHTML(secs) {
  return secs.map(sc => `<div class="an-sheet"><h4>${sc.title}</h4>${sc.intro ? `<p class="intro">${sc.intro}</p>` : ''}` + sc.steps.map(s => {
    if (s.data) return `<div class="cl-row dt"><div class="nm">${Calcs.html(s.name)}</div><div class="fm">${Calcs.html(s.sym)}</div><div class="rs"><b>${Calcs.html(s.shown)}</b> <span class="u">${s.shown.includes(s.unit) ? '' : Calcs.html(s.unit)}</span></div></div>`;
    const bad = s.err !== undefined && s.err >= 1e-9;
    return `<div class="cl-row${bad ? ' bad' : ''}"><div class="nm">${Calcs.html(s.name)}${s.i && INFO[s.i] ? ib(s.i) : ''}</div><div class="fm">${Calcs.html(s.sym)}${s.sub ? `<span class="sb">= ${Calcs.html(s.sub)}</span>` : ''}${s.note ? `<span class="nt">${s.note}</span>` : ''}</div><div class="rs">= <b>${Calcs.html(s.shown)}</b> <span class="u">${Calcs.html(s.unit)}</span>${s.alt ? `<span class="al">${s.alt}</span>` : ''}</div></div>`;
  }).join('') + '</div>').join('');
}

/* Mapa del HPC en SVG */
function anDrawMap() {
  const svg = $('#anMapSvg'); if (!svg) return;
  const M = Analysis.HPC_MAP, W = 560, H = 330, L = 46, Rr = 14, T = 12, B = 40;
  const X = m => L + (m - 2.5) / 20 * (W - L - Rr), Y = p => T + (9 - p) / 8 * (H - T - B);
  let g = '';
  for (let m = 2.5; m <= 22.51; m += 2.5) g += `<line x1="${X(m)}" y1="${T}" x2="${X(m)}" y2="${H - B}" class="gr"/><text x="${X(m)}" y="${H - B + 15}" class="tk" text-anchor="middle">${fmt(m, m % 1 ? 1 : 0)}</text>`;
  for (let p = 1; p <= 9; p++) g += `<line x1="${L}" y1="${Y(p)}" x2="${W - Rr}" y2="${Y(p)}" class="gr"/><text x="${L - 6}" y="${Y(p) + 4}" class="tk" text-anchor="end">${p}</text>`;
  g += `<text x="${(L + W - Rr) / 2}" y="${H - 6}" class="ax" text-anchor="middle">ṁ corregido en 2.5 [kg/s]</text><text x="12" y="${(T + H - B) / 2}" class="ax" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">π HPC</text>`;
  const l = M.line, x0 = l.mcMin, x1 = l.mcMax;
  g += `<line x1="${X(x0)}" y1="${Y(map_pi(x0))}" x2="${X(x1)}" y2="${Y(map_pi(x1))}" class="ol"/>`;
  let lastX = -99, up = false;
  M.eta.forEach((e, i) => {
    if (i === 0 || i === M.eta.length - 1 || (i > 0 && M.eta[i - 1][1] === e[1])) return;
    const x = X(e[0]), y = Y(map_pi(e[0]));
    g += `<line x1="${x}" y1="${y - 5}" x2="${x}" y2="${y + 5}" class="et"/>`;
    if (e[0] > 19) return;                       // los cruces de la derecha van en la etiqueta conjunta
    up = x - lastX < 34 ? !up : false; lastX = x;
    g += up ? `<text x="${x - 4}" y="${y - 9}" class="tk" text-anchor="end">${fmt(e[1], 2)}</text>` : `<text x="${x + 3}" y="${y + 17}" class="tk">${fmt(e[1], 2)}</text>`;
  });

  const d = M.design;
  g += `<circle cx="${X(d.mc)}" cy="${Y(d.pi)}" r="6" class="dp"/>`;
  g += `<circle cx="${X(AN.hpc.mc)}" cy="${Y(AN.hpc.pi)}" r="4.5" class="us"/>`;
  g += `<text x="${X(9)}" y="${Y(8.3)}" class="tk">Marcas: η<tspan dy="3" font-size="8">HPC</tspan><tspan dy="-3"> en los cruces con las isolíneas</tspan></text>`;
  g += `<line id="anMapCx" class="cx" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><circle id="anMapCp" r="4" class="cp" visibility="hidden"/>`;
  svg.innerHTML = g;
  if (!svg._hov) {
    svg._hov = true;
    svg.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) * W / r.width;
      const m = 2.5 + (mx - L) / (W - L - Rr) * 20, tip = $('#tip');
      if (m < x0 || m > x1) { tip.hidden = true; svg.querySelector('#anMapCx').setAttribute('visibility', 'hidden'); svg.querySelector('#anMapCp').setAttribute('visibility', 'hidden'); return; }
      const p = map_pi(m), eta = Analysis.map.etaFromMc(m);
      const cx = svg.querySelector('#anMapCx'), cp = svg.querySelector('#anMapCp');
      cx.setAttribute('x1', X(m)); cx.setAttribute('x2', X(m)); cx.setAttribute('visibility', 'visible');
      cp.setAttribute('cx', X(m)); cp.setAttribute('cy', Y(p)); cp.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>Línea de operación</b><br>ṁ<sub>c,25</sub> = ${fmt(m, 2)} kg/s<br>π<sub>HPC</sub> = ${fmt(p, 3)}<br>η<sub>HPC</sub> ≈ ${fmt(eta, 3)}`;
      tip.hidden = false; placeTip(tip, e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { $('#tip').hidden = true; const a = svg.querySelector('#anMapCx'), b = svg.querySelector('#anMapCp'); if (a) a.setAttribute('visibility', 'hidden'); if (b) b.setAttribute('visibility', 'hidden'); });
  }
}
const map_pi = m => Analysis.map.piFromMc(m);

/* ---------- Paso 2 ---------- */
let AN_DP = null;
function anS() {   // estado tipo S del explorador para reutilizar las tablas existentes
  const i = AN_DP.derive.input;
  return Object.assign(JSON.parse(JSON.stringify(BASE)), {
    arch: 'turbofan', spools: 'two', alt: AN.h0, ov: null, M0: AN.M0, mdot0: AN_DP.derive.m0, tlMode: false,
    pif: AN.pif, pilpc: AN_DP.derive.pilpc, pihpc: AN.hpc.pi, alpha: AN.alpha, Tt4: AN.Tt4,
    kindCore: AN.nozzle.kindCore, p0p9: AN.nozzle.p0p9, kindFan: AN.nozzle.kindFan, p0p19: AN.nozzle.p0p19,
    gas: Object.assign({}, i.gas), tech: 0, etaHPC: AN.hpc.eta
  }, AN.eff);
}
function anWith(fn) { const sR = R, sS = S; R = AN_DP.res; S = anS(); try { return fn(); } finally { R = sR; S = sS; } }
function anStep2() {
  AN_DP = Analysis.designPoint(AN);
  const head = `<h2 class="an-h">2 · Punto de diseño</h2>
  ${anLearn(`<p>Con los datos del paso 1 se resuelve el ciclo completo en crucero, estación por estación: toma → fan → LPC → HPC → cámara → HPT → LPT → toberas. El balance de potencias de cada eje fija cuánto se expande cada turbina:</p>
   <ul><li>Eje de alta: la HPT mueve solo el HPC → ${eq('τ<sub>tH</sub> = 1 − τ<sub>r</sub>τ<sub>f</sub>τ<sub>LPC</sub>(τ<sub>HPC</sub>−1)/(η<sub>m</sub>(1+f)τ<sub>λ</sub>)')}</li>
   <li>Eje de baja: la LPT mueve el fan (todo el caudal) y el LPC → ${eq('τ<sub>tL</sub> = 1 − τ<sub>r</sub>[(1+α)(τ<sub>f</sub>−1) + τ<sub>f</sub>(τ<sub>LPC</sub>−1)]/(η<sub>m</sub>(1+f)τ<sub>λ</sub>τ<sub>tH</sub>)')}</li></ul>
   <p>Después las toberas dan las velocidades de salida, y de ahí F, TSFC y los rendimientos. Con el caudal ṁ₀ del paso 1 se pasa de valores específicos a valores totales.</p>
   <p><b>Cómo leer los resultados.</b> η<sub>T</sub> mide lo bien que el motor convierte el combustible en energía cinética, y crece con el OPR y con T<sub>t4</sub>. η<sub>P</sub> mide cuánto de esa energía se convierte en trabajo útil, y crece con α (chorro más lento). TSFC = v₀/(η<sub>O</sub>·h<sub>PR</sub>): a igual velocidad, consumir menos es lo mismo que tener mejor η<sub>O</sub>.</p>`, !anSeen(2))}`;
  if (!AN_DP.ok) return head + `<div class="alerts"><span class="chip bad">${AN_DP.error}</span></div><p class="note">Vuelve al paso 1 y corrige los datos.</p><div class="an-next"><button type="button" class="btn" data-go="1">← Datos del motor</button></div>`;
  const r = AN_DP.res, s = r.size;
  const warn = r.warnings.map(w => `<span class="chip warn">${w}</span>`).join('') || '<span class="chip ok">Ciclo consistente</span>';
  const subs = [['res', 'Resultados'], ['st', 'Estaciones'], ['cm', 'Componentes'], ['pw', 'Potencias'], ['ts', 'Ciclo T–s'], ['cl', 'Memoria de cálculo']];
  return head + `<div class="alerts">${warn}</div>
   <div class="tiles">${anKpi('Empuje F', fmt(s.F / 1000, 2), 'kN')}${anKpi('Empuje específico F/ṁ₀', fmt(r.Fsp, 1), 'N·s/kg')}${anKpi('TSFC', fmt(r.tsfc * 1e6, 2), 'mg/(N·s)')}${anKpi('η_T', fmt(r.etaT * 100, 1), '%')}${anKpi('η_P', fmt(r.etaP * 100, 1), '%')}${anKpi('η_O', fmt(r.etaO * 100, 1), '%')}</div>
   <section class="card" style="margin-top:12px"><div class="tablist" role="tablist" id="anTabs">${subs.map(x => `<button type="button" role="tab" data-t="${x[0]}" aria-selected="${x[0] === AN_SUB}">${x[1]}</button>`).join('')}</div><div class="panel" id="anPanel"></div></section>
   <div class="an-next"><button type="button" class="btn" data-go="1">← Datos del motor</button><button type="button" class="btn" id="anOpenEx">Abrir este motor en el explorador (animación, misión)</button></div>`;
}
function anInit2() {
  const main = $('#anMain');
  main.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { AN_STEP = +b.dataset.go; renderAnalysis(); window.scrollTo({ top: 0 }); }));
  if (!AN_DP || !AN_DP.ok) return;
  main.querySelectorAll('#anTabs button').forEach(b => b.addEventListener('click', () => { AN_SUB = b.dataset.t; main.querySelectorAll('#anTabs button').forEach(x => x.setAttribute('aria-selected', x === b)); anPanel2(); }));
  $('#anOpenEx').addEventListener('click', () => { S = anS(); REF = null; setMode('ex'); update(); window.scrollTo({ top: 0 }); });
  anPanel2();
}
function anPanel2() {
  const p = $('#anPanel'), r = AN_DP.res, d = AN_DP.derive;
  if (AN_SUB === 'res') {
    const rows = [['Empuje', 'F', fmt(r.size.F / 1000, 3), 'kN'], ['Empuje específico', 'F/ṁ₀', fmt(r.Fsp, 2), 'N·s/kg'], ['Consumo específico', 'TSFC', fmt(r.tsfc * 1e6, 3), 'mg/(N·s)'], ['', '', fmt(r.tsfc * 3.6e6, 4), 'kg/(kN·h)'],
      ['Rendimiento térmico', 'η_T', fmt(r.etaT * 100, 2), '%'], ['Rendimiento propulsivo', 'η_P', fmt(r.etaP * 100, 2), '%'], ['Rendimiento global', 'η_O', fmt(r.etaO * 100, 2), '%'],
      ['Relación combustible/aire', 'f', fmt(r.f, 5), ''], ['Caudal de aire total', 'ṁ₀', fmt(d.m0, 2), 'kg/s'], ['Caudal del núcleo', 'ṁ_core', fmt(d.mcore, 2), 'kg/s'], ['Caudal de combustible', 'ṁ_f', fmt(r.size.mf, 4), 'kg/s'],
      ['Cociente de empujes núcleo/fan', 'F_R', fmt(r.FR, 3), ''], ['Velocidad de salida del núcleo', 'v₉', fmt(r.core.v9, 1), 'm/s'], ['Velocidad de salida del fan', 'v₁₉', fmt(r.fan.v19, 1), 'm/s'], ['Velocidad de vuelo', 'v₀', fmt(r.v0, 1), 'm/s']];
    p.innerHTML = `<table><thead><tr><th style="text-align:left">Magnitud</th><th style="text-align:left">Símbolo</th><th>Valor</th><th style="text-align:left">Unidad</th></tr></thead><tbody>${rows.map(x => `<tr><td style="text-align:left">${x[0]}</td><td style="text-align:left">${anSub(x[1])}</td><td class="n">${x[2]}</td><td style="text-align:left;color:var(--muted)">${x[3]}</td></tr>`).join('')}</tbody></table>
     <p class="foot">Valores en el punto de diseño (crucero). Para pegarlos en otro sitio, usa «Copiar como texto» en la memoria de cálculo.</p>`;
  } else if (AN_SUB === 'st') p.innerHTML = anWith(tabStations);
  else if (AN_SUB === 'cm') p.innerHTML = anWith(tabComponents);
  else if (AN_SUB === 'pw') p.innerHTML = anWith(tabPower);
  else if (AN_SUB === 'ts') { p.innerHTML = anWith(tabTS).replace('id="tsCv"', 'id="anTsCv"'); anWith(() => drawTS(undefined, $('#anTsCv'))); }
  else if (AN_SUB === 'cl') {
    const cb = Calcs.build(r), all = { sections: d.sheet.concat(cb.sections) };
    p.innerHTML = `<div class="cl-bar"><span class="chip ${cb.nok === cb.nchk ? 'ok' : 'bad'}">${cb.nok}/${cb.nchk} pasos comprobados con el solver</span><span class="sp"></span><button type="button" class="btn" id="anClCopy">Copiar como texto</button><button type="button" class="btn" id="anClDl">Descargar .txt</button></div>
      <details class="cl-sec" open><summary>Datos del motor y caudal a partir del mapa</summary>${anSheetHTML(d.sheet)}</details>
      ${cb.sections.map(sc => `<details class="cl-sec" open><summary>${sc.title}</summary>${anSheetHTML([Object.assign({}, sc, { title: '' })])}</details>`).join('')}`;
    const txt = () => Calcs.toText(all, `${AN.name} · punto de diseño · h₀ = ${fmt(AN.h0, 0)} m, M₀ = ${fmt(AN.M0, 2)}`);
    $('#anClDl').addEventListener('click', () => anSaveFile('punto_de_diseno.txt', txt(), 'text/plain'));
    $('#anClCopy').addEventListener('click', e => { const b = e.target; try { navigator.clipboard.writeText(txt()).then(() => { b.textContent = 'Copiado ✓'; }, () => { b.textContent = 'Usa Descargar'; }); } catch (err) { b.textContent = 'Usa Descargar'; } setTimeout(() => { b.textContent = 'Copiar como texto'; }, 1800); });
  }
}

/* ---------- Pasos aún no construidos ---------- */
function anSoon(n) {
  const s = AN_STEPS.find(x => x.n === n);
  const txt = {
    3: 'Se recalcula el punto de diseño variando π_LPC y π_HPC y se pintan F, TSFC y los rendimientos como mapas de calor, con el punto de diseño marcado. Dos escenarios: (i) caudal del núcleo y η_HPC fijos; (ii) ambos siguen la línea de operación del mapa del HPC.',
    4: 'Diseño del compresor de alta como etapas repetidas: elección de M₁ y α₁, número de etapas, triángulos de velocidades dibujados y ciclo de la etapa.',
    5: 'Diseño de la turbina de alta de una etapa con velocidad axial constante y salida sin giro: elección de β₂, Ψ y Φ, triángulos de velocidades y ciclo de la etapa.',
    6: 'El mismo motor a nivel del mar y Mach 0: turbinas bloqueadas, α variable e iteración hasta cerrar el ciclo. F, TSFC y rendimientos al despegue.',
    7: 'Tabla con todos los datos del motor y sus fuentes, y tabla con los resultados de cada paso, lista para copiar.'
  }[n];
  return `<h2 class="an-h">${n} · ${s.t}</h2><div class="card an-card"><p>${anSub(txt)}</p><p class="note">Este paso está en construcción.</p></div>`;
}

/* ---------- Ayuda de los campos nuevos ---------- */
Object.assign(INFO, {
  an_h0: () => ['Altitud de crucero', `<p>Altitud del punto de diseño. Se usa la atmósfera estándar (ISA) para obtener T₀ y P₀. Los turbofanes civiles se diseñan para crucero, típicamente entre 10 y 12 km.</p>`],
  an_M0: () => ['Mach de crucero', `<p>Mach del punto de diseño. Los aviones comerciales cruzan entre M 0,76 y 0,85. Debe ser subsónico.</p>`],
  an_OPR: () => ['Relación de compresión global (OPR)', `<p>P<sub>t3</sub>/P<sub>t2</sub>: producto de las compresiones del fan (parte del núcleo), LPC y HPC. Es un dato que suelen publicar los fabricantes y las bases de datos de certificación (a veces al despegue, algo mayor que en crucero).</p><p>Aquí ${eq('π<sub>LPC</sub> = OPR/(π<sub>f</sub>·π<sub>HPC</sub>)')}.</p>`],
  an_eLPC: () => ['Eficiencia politrópica del LPC', `<p>Se usa la politrópica para el compresor de baja (tabla de niveles tecnológicos: 0,90 en tecnología actual). El HPC no la usa: tiene su eficiencia isentrópica del mapa.</p>`],
  an_mc: () => ['Caudal corregido del HPC', `<p>Caudal a la entrada del compresor de alta (estación 2.5) referido a condiciones de referencia: ${eq('ṁ<sub>c,25</sub> = ṁ<sub>25</sub>·√θ<sub>25</sub>/δ<sub>25</sub>')}. Se lee en el eje horizontal del mapa, en el punto de diseño.</p>`],
  an_piHPC: () => ['π del HPC', `<p>Relación de presiones del compresor de alta en el punto de diseño del mapa (eje vertical).</p>`],
  an_etaHPC: () => ['Eficiencia isentrópica del HPC', `<p>Se lee en las isolíneas de eficiencia del mapa, en el punto de diseño. Es isentrópica (no politrópica), y se usa con ${eq('τ<sub>HPC</sub> = 1 + (π<sub>HPC</sub><sup>(γ−1)/γ</sup> − 1)/η<sub>HPC</sub>')}.</p>`],
  an_ref: () => ['Condiciones de referencia', `<p>Condiciones con las que está corregido el mapa. Lo habitual es el nivel del mar estándar: T<sub>ref</sub> = 288,15 K y P<sub>ref</sub> = 101 325 Pa. Si tu mapa usa otras, cámbialas aquí.</p>`],
  an_map: () => ['Mapa del compresor de alta', `<p>La línea es la <b>línea de operación</b>: los puntos por los que pasa el compresor al cambiar el régimen del motor. Las marcas indican la eficiencia isentrópica η<sub>HPC</sub> donde la línea cruza cada isolínea del mapa original; entre marcas se interpola linealmente. El círculo grande es el punto de diseño del mapa; el pequeño, los valores que estás usando.</p><p>Pasa el cursor sobre la línea para leer ṁ<sub>c</sub>, π y η en cada punto.</p>`]
});

/* ================= Utilidades comunes de los pasos 3–7 ================= */
function anOptField(path, label, unit, min, max, step, info, scale) {
  scale = scale || 1;
  const v = getP(AN, path);
  return `<div class="an-f an-f2"><label for="anf_${path}">${anSub(label)}${unit ? ` <span class="u">[${unit}]</span>` : ''}${info && INFO[info] ? ib(info) : ''}</label>
    <input type="number" id="anf_${path}" data-opt="${path}" data-sc="${scale}" min="${min}" max="${max}" step="${step}" value="${v == null ? '' : +(+v * scale).toFixed(6)}" inputmode="decimal"></div>`;
}
let anTimer = 0;
function anBindOpts(cb) {
  $('#anMain').querySelectorAll('input[data-opt]').forEach(el => el.addEventListener('input', () => {
    const v = parseFloat(String(el.value).replace(',', '.')), ok = isFinite(v) && v >= +el.min && v <= +el.max;
    el.classList.toggle('bad', !ok); if (!ok) return;
    setP(AN, el.dataset.opt, v / (+el.dataset.sc || 1)); anSave();
    clearTimeout(anTimer); anTimer = setTimeout(cb, 120);
  }));
  $('#anMain').querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { AN_STEP = +b.dataset.go; renderAnalysis(); window.scrollTo({ top: 0 }); }));
}
const anNav = (prev, next, nextLabel) => `<div class="an-next">${prev ? `<button type="button" class="btn" data-go="${prev}">← Paso ${prev}</button>` : '<span></span>'}${next ? `<button type="button" class="btn primary" data-go="${next}">Siguiente: ${nextLabel} →</button>` : ''}</div>`;
const anChips = (w, okTxt) => `<div class="alerts">${w.length ? w.map(x => `<span class="chip warn">${x}</span>`).join('') : `<span class="chip ok">${okTxt || 'Sin avisos'}</span>`}</div>`;
const anErr = (msg, back) => `<div class="alerts"><span class="chip bad">${msg}</span></div><p class="note">Revisa los datos del paso ${back || 1}.</p>${anNav(back || 1)}`;
function anSheetBlock(secs, title, file) {
  return `<details class="cl-sec"><summary>${title || 'Cálculo paso a paso'}</summary><div class="cl-bar" style="margin:6px 12px"><span class="sp"></span><button type="button" class="btn" data-sheet-dl="${file}">Descargar .txt</button></div>${anSheetHTML(secs)}</details>`;
}
function anBindSheet(secs, head) {
  $('#anMain').querySelectorAll('[data-sheet-dl]').forEach(b => b.addEventListener('click', () => anSaveFile(b.dataset.sheetDl, Calcs.toText({ sections: secs }, `${AN.name} · ${head}`), 'text/plain')));
}
const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); };
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function anTip(e, html) { const tip = $('#tip'); tip.innerHTML = html; tip.hidden = false; placeTip(tip, e.clientX, e.clientY); }
const anTipHide = () => { $('#tip').hidden = true; };

/* Gráfica de líneas sencilla en SVG: series [{pts:[[x,y]], cls, label}] y puntos [{x,y,cls,label}] */
function anPlot(o) {
  const W = o.W || 520, H = o.H || 300, L = 52, Rr = o.Rr || 14, T = 14, B = 42;
  const X = x => L + (x - o.x0) / (o.x1 - o.x0) * (W - L - Rr), Y = y => T + (o.y1 - y) / (o.y1 - o.y0) * (H - T - B);
  let g = '';
  (o.xt || []).forEach(v => g += `<line x1="${X(v)}" y1="${T}" x2="${X(v)}" y2="${H - B}" class="gr"/><text x="${X(v)}" y="${H - B + 15}" class="tk" text-anchor="middle">${fmt(v, o.xd || 0)}</text>`);
  (o.yt || []).forEach(v => g += `<line x1="${L}" y1="${Y(v)}" x2="${W - Rr}" y2="${Y(v)}" class="gr"/><text x="${L - 6}" y="${Y(v) + 4}" class="tk" text-anchor="end">${fmt(v, o.yd || 0)}</text>`);
  g += `<text x="${(L + W - Rr) / 2}" y="${H - 6}" class="ax" text-anchor="middle">${o.xl}</text><text x="13" y="${(T + H - B) / 2}" class="ax" text-anchor="middle" transform="rotate(-90 13 ${(T + H - B) / 2})">${o.yl}</text>`;
  g += `<clipPath id="${o.id}c"><rect x="${L}" y="${T}" width="${W - L - Rr}" height="${H - T - B}"/></clipPath><g clip-path="url(#${o.id}c)">`;
  (o.series || []).forEach(s => {
    const d = s.pts.filter(p => isFinite(p[1])).map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
    g += `<path d="${d}" class="${s.cls || 'ln1'}" fill="none"/>`;
  });
  g += '</g>';
  (o.series || []).forEach(s => { if (!s.label) return; const p = s.lab || s.pts[s.pts.length - 1]; if (p[1] < o.y0 || p[1] > o.y1) return; g += `<text x="${X(p[0]) + (s.dx || 4)}" y="${Y(p[1]) + (s.dy || 4)}" class="tk sl" text-anchor="${s.anchor || 'start'}">${s.label}</text>`; });
  (o.points || []).forEach(p => g += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r || 5.5}" class="${p.cls || 'dp'}"/>${p.label ? `<text x="${X(p.x) + (p.ldx != null ? p.ldx : 9)}" y="${Y(p.y) + (p.ldy != null ? p.ldy : -8)}" class="tk lab" text-anchor="${p.anchor || 'start'}">${p.label}</text>` : ''}`);
  return `<svg viewBox="0 0 ${W} ${H}" class="an-plot" role="img" aria-label="${o.aria || ''}">${g}</svg>`;
}

/* Triángulos de velocidades: cada triángulo = {title, vecs:[{x,y,lab,cls}], U:[p,q]} en m/s; eje x axial, eje y tangencial */
function anTriangles(tris, opt) {
  opt = opt || {};
  const W = 560, H = opt.H || 300, pad = 34, colW = (W - pad) / tris.length;
  const all = tris.flatMap(t => t.vecs.map(v => [v.x, v.y]).concat(t.U ? t.U.map(p => [p.x, p.y]) : []));
  const xmax = Math.max(...all.map(p => p[0])), ymin = Math.min(0, ...all.map(p => p[1])), ymax = Math.max(0, ...all.map(p => p[1]));
  const sc = Math.min((colW - 190) / xmax, (H - 96) / ((ymax - ymin) || 1));
  const sgn = opt.down ? 1 : -1;                     // tangencial hacia arriba (compresor) o hacia abajo (turbina)
  const OY = opt.down ? 62 - ymin * sc : 62 + ymax * sc;
  let g = `<defs>${['a1', 'a2', 'a3'].map((id, i) => `<marker id="ar_${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk${i + 1}"/></marker>`).join('')}</defs>`;
  tris.forEach((t, k) => {
    const ox = pad + k * colW;
    const P = v => [ox + v.x * sc, OY + sgn * v.y * sc];
    g += `<text x="${ox}" y="18" class="ax">${t.title}</text>`;
    g += `<line x1="${ox - 6}" y1="${OY}" x2="${ox + xmax * sc + 10}" y2="${OY}" class="gr"/>`;
    t.vecs.forEach(v => { const p = P(v); g += `<line x1="${ox}" y1="${OY}" x2="${p[0]}" y2="${p[1]}" class="vc ${v.cls}" marker-end="url(#ar_${v.cls === 'v1' ? 'a1' : v.cls === 'v2' ? 'a2' : 'a3'})"/><text x="${p[0] + 6}" y="${p[1] + (v.dy || 4)}" class="tk vl">${v.lab}</text>`; });
    if (t.U) { const p = P(t.U[0]), q = P(t.U[1]); g += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" class="vc v3" marker-end="url(#ar_a3)"/><text x="${(p[0] + q[0]) / 2 + 6}" y="${(p[1] + q[1]) / 2}" class="tk vl">U</text>`; }
    (t.notes || []).forEach((n, i) => g += `<text x="${ox}" y="${34 + i * 14}" class="tk">${n}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="an-plot an-tri" role="img" aria-label="Triángulos de velocidades">${g}</svg><div class="an-legend"><span><i class="ln" style="background:var(--s1)"></i>Velocidad absoluta</span><span><i class="ln" style="background:var(--s2)"></i>Velocidad relativa</span><span><i class="ln" style="background:var(--ink)"></i>Velocidad de pala U</span></div>`;
}

/* ================= Paso 3 · Mapas de calor ================= */
const HM_METRICS = [['F', 'Empuje F', v => v / 1000, 'kN', 1], ['tsfc', 'TSFC', v => v * 1e6, 'mg/(N·s)', 2], ['etaT', 'η térmico', v => v * 100, '%', 1], ['etaP', 'η propulsivo', v => v * 100, '%', 1], ['etaO', 'η global', v => v * 100, '%', 1], ['Fsp', 'Empuje específico F/ṁ₀', v => v, 'N·s/kg', 1], ['m0', 'Caudal total ṁ₀', v => v, 'kg/s', 1]];
let AN_HM = null, AN_HMK = 'F', AN_HMSAME = false;
const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
function seqColor(t) { const r = isDark() ? SEQ.slice().reverse() : SEQ; t = Math.max(0, Math.min(1, t)) * (r.length - 1); const i = Math.min(r.length - 2, Math.floor(t)), f = t - i; const h = s => [1, 3, 5].map(k => parseInt(s.substr(k, 2), 16)); const a = h(r[i]), b = h(r[i + 1]); return 'rgb(' + a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(',') + ')'; }
function anStep3() {
  const o = AN.hm, pr = Analysis.map.piRange();
  const head = `<h2 class="an-h">3 · Mapas de calor</h2>
  ${anLearn(`<p>Se repite el cálculo del punto de diseño en una rejilla de valores de <b>π<sub>LPC</sub></b> (eje horizontal) y <b>π<sub>HPC</sub></b> (eje vertical), manteniendo el resto de datos del motor (vuelo, α, π<sub>f</sub>, T<sub>t4</sub>, eficiencias). El color da el valor de la magnitud elegida y el círculo marca el punto de diseño.</p>
   <ul><li><b>Escenario i:</b> el caudal real del núcleo ṁ<sub>core</sub> y la eficiencia η<sub>HPC</sub> se quedan en sus valores de diseño. Solo cambia el ciclo: es el estudio paramétrico «clásico».</li>
   <li><b>Escenario ii:</b> el compresor de alta se mueve por su <b>línea de operación</b>. Para cada π<sub>HPC</sub> el mapa da el caudal corregido ṁ<sub>c,25</sub> y la eficiencia η<sub>HPC</sub>; el caudal real sale de ${eq('ṁ<sub>core</sub> = ṁ<sub>c,25</sub>·δ<sub>25</sub>/√θ<sub>25</sub>')}, que también depende de π<sub>LPC</sub> (cambia P<sub>t25</sub> y T<sub>t25</sub>). Por eso aquí el empuje cae mucho al bajar π<sub>HPC</sub>: el compresor traga menos aire.</li></ul>
   <p>π<sub>HPC</sub> solo se varía dentro de la línea de operación del mapa (${fmt(pr[0], 2)}–${fmt(pr[1], 2)}). El rango de π<sub>LPC</sub> lo eliges tú; vigila que el OPR resultante (π<sub>f</sub>·π<sub>LPC</sub>·π<sub>HPC</sub>) sea razonable. Las celdas rayadas son combinaciones en las que el ciclo no tiene solución.</p>`, !anSeen(3))}`;
  return head + `<section class="card an-card"><div class="an-hmctl">
     <div class="an-f an-f2 an-wsel"><label for="anHmK">Magnitud</label><select id="anHmK">${HM_METRICS.map(m => `<option value="${m[0]}"${m[0] === AN_HMK ? ' selected' : ''}>${m[1]} [${m[3]}]</option>`).join('')}</select></div>
     ${anOptField('hm.lpcMin', 'π_LPC mínimo', '', 1, 20, 0.1)}${anOptField('hm.lpcMax', 'π_LPC máximo', '', 1.1, 30, 0.1)}
     ${anOptField('hm.n', 'Puntos por eje', '', 5, 61, 1)}
     <div class="an-f an-f2"><label><input type="checkbox" id="anHmSame"${AN_HMSAME ? ' checked' : ''}> Misma escala de color en los dos mapas</label><span></span></div>
    </div><p class="note">π<sub>HPC</sub> entre ${fmt(pr[0], 3)} y ${fmt(pr[1], 3)} (límites de la línea de operación). Supuesto por defecto para π<sub>LPC</sub>: 1,2–6.</p></section>
   <div id="anHmOut"></div>${anNav(2, 4, 'compresor de alta')}`;
}
function anInit3() {
  anBindOpts(anHmRender);
  $('#anHmK').addEventListener('change', e => { AN_HMK = e.target.value; anHmDraw(); });
  $('#anHmSame').addEventListener('change', e => { AN_HMSAME = e.target.checked; anHmDraw(); });
  anHmRender();
}
function anHmRender() {
  if (AN.hm.lpcMax <= AN.hm.lpcMin) { $('#anHmOut').innerHTML = '<div class="alerts"><span class="chip bad">π_LPC máximo debe ser mayor que el mínimo.</span></div>'; return; }
  AN_HM = Analysis.heatmap(AN, AN.hm);
  anHmDraw();
}
function anHmDraw() {
  const out = $('#anHmOut'); if (!out) return;
  const H = AN_HM; if (!H.ok) { out.innerHTML = anErr(H.error, 1); return; }
  const m = HM_METRICS.find(x => x[0] === AN_HMK), val = c => c.ok && !c.undef ? m[2](c[m[0]]) : null;
  const rng = list => { const v = list.flatMap(s => H.grids[s].map(val)).filter(x => x != null && isFinite(x)); return [Math.min(...v), Math.max(...v)]; };
  const RG = AN_HMSAME ? { i: rng(['i', 'ii']), ii: rng(['i', 'ii']) } : { i: rng(['i']), ii: rng(['ii']) };
  const dv = m[2](H.design[m[0]] != null ? H.design[m[0]] : NaN);
  const one = (sc, title) => {
    const [vmin, vmax] = RG[sc];
    const W = 470, Hh = 380, L = 54, Rr = 12, T = 12, B = 44, n = H.n;
    const cw = (W - L - Rr) / n, ch = (Hh - T - B) / n;
    const X = x => L + (x - H.xs[0]) / (H.xs[n - 1] - H.xs[0]) * (W - L - Rr - cw) + cw / 2, Y = y => T + (H.ys[n - 1] - y) / (H.ys[n - 1] - H.ys[0]) * (Hh - T - B - ch) + ch / 2;
    let g = `<defs><pattern id="hatch${sc}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hbg"/><line x1="0" y1="0" x2="0" y2="6" class="hln"/></pattern></defs>`;
    H.grids[sc].forEach(c => { const v = val(c); g += `<rect x="${(X(c.pl) - cw / 2).toFixed(1)}" y="${(Y(c.ph) - ch / 2).toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(ch + 0.6).toFixed(1)}" fill="${v == null ? `url(#hatch${sc})` : seqColor((v - vmin) / ((vmax - vmin) || 1))}"/>`; });
    const xt = niceTicks(H.xs[0], H.xs[n - 1], 6), yt = niceTicks(H.ys[0], H.ys[n - 1], 6);
    xt.forEach(v => g += `<text x="${X(v)}" y="${Hh - B + 16}" class="tk" text-anchor="middle">${fmt(v, v % 1 ? 1 : 0)}</text>`);
    yt.forEach(v => g += `<text x="${L - 6}" y="${Y(v) + 4}" class="tk" text-anchor="end">${fmt(v, v % 1 ? 1 : 0)}</text>`);
    g += `<text x="${(L + W - Rr) / 2}" y="${Hh - 8}" class="ax" text-anchor="middle">π LPC</text><text x="14" y="${(T + Hh - B) / 2}" class="ax" text-anchor="middle" transform="rotate(-90 14 ${(T + Hh - B) / 2})">π HPC</text>`;
    const dx = X(H.design.pl), dy = Y(H.design.ph);
    if (H.design.pl >= H.xs[0] && H.design.pl <= H.xs[n - 1]) g += `<circle cx="${dx}" cy="${dy}" r="7" class="hmdp"/><circle cx="${dx}" cy="${dy}" r="2" class="hmdp2"/>`;
    g += `<rect id="hmHl${sc}" width="${cw}" height="${ch}" class="hmhl" visibility="hidden"/>`;
    const leg = `<div class="an-cbar"><span class="num">${fmt(vmin, m[4])}</span><span class="bar" style="background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map(seqColor).join(',')})"></span><span class="num">${fmt(vmax, m[4])} ${m[3]}</span></div>`;
    return `<div class="an-hm"><h4>${title}</h4>${leg}<svg viewBox="0 0 ${W} ${Hh}" data-sc="${sc}" role="img" aria-label="Mapa de calor de ${m[1]}, ${title}">${g}</svg></div>`;
  };
  const leg = `<p class="note" style="margin:0 0 6px">${AN_HMSAME ? 'Misma escala de color en los dos mapas.' : 'Cada mapa tiene su propia escala de color (marca la casilla de arriba para compararlos con la misma).'} Más oscuro = valor mayor · ◯ punto de diseño (${fmt(dv, m[4])} ${m[3]}) · rayado: sin solución · pasa el cursor para ver cada celda.</p>`;
  out.innerHTML = `<section class="card an-card"><h3>${m[1]} [${m[3]}]</h3>${leg}<div class="an-hms">${one('i', 'Escenario i · ṁ<sub>core</sub> y η<sub>HPC</sub> fijos')}${one('ii', 'Escenario ii · sobre la línea de operación')}</div>
    <div class="cl-bar"><span class="sp"></span><button type="button" class="btn" id="anHmCsv">Descargar datos (.csv)</button></div></section>`;
  out.querySelectorAll('svg[data-sc]').forEach(svg => {
    const sc = svg.dataset.sc, n = H.n, W = 470, Hh = 380, L = 54, Rr = 12, T = 12, B = 44, cw = (W - L - Rr) / n, ch = (Hh - T - B) / n;
    svg.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) * W / r.width, my = (e.clientY - r.top) * Hh / r.height;
      const i = Math.floor((mx - L) / cw), j = n - 1 - Math.floor((my - T) / ch);
      const hl = svg.querySelector('#hmHl' + sc);
      if (i < 0 || j < 0 || i >= n || j >= n) { anTipHide(); hl.setAttribute('visibility', 'hidden'); return; }
      const c = H.grids[sc][j * n + i];
      hl.setAttribute('x', L + i * cw); hl.setAttribute('y', T + (n - 1 - j) * ch); hl.setAttribute('visibility', 'visible');
      anTip(e, `<b>π<sub>LPC</sub> = ${fmt(c.pl, 2)} · π<sub>HPC</sub> = ${fmt(c.ph, 2)}</b><br>OPR = ${fmt(c.opr, 1)} · η<sub>HPC</sub> = ${fmt(c.eta, 3)}<br>` +
        (c.ok ? `${m[1]}: <b>${c.undef && m[0] !== 'F' && m[0] !== 'm0' ? 'no definido' : fmt(m[2](c[m[0]]), m[4]) + ' ' + m[3]}</b><br>ṁ<sub>core</sub> = ${fmt(c.mcore, 2)} kg/s · F = ${fmt(c.F / 1000, 1)} kN<br>TSFC = ${fmt(c.tsfc * 1e6, 2)} mg/(N·s)` : `<span class="bad">${c.error}</span>`));
    });
    svg.addEventListener('pointerleave', () => { anTipHide(); const hl = svg.querySelector('#hmHl' + sc); if (hl) hl.setAttribute('visibility', 'hidden'); });
  });
  $('#anHmCsv').addEventListener('click', () => {
    const rows = ['escenario;pi_LPC;pi_HPC;OPR;eta_HPC;m_core_kg_s;m0_kg_s;F_kN;Fsp_Ns_kg;TSFC_mg_Ns;etaT;etaP;etaO'];
    ['i', 'ii'].forEach(s => H.grids[s].forEach(c => rows.push([s, c.pl, c.ph, c.opr, c.eta].concat(c.ok ? [c.mcore, c.m0, c.F / 1000, c.Fsp, c.tsfc * 1e6, c.etaT, c.etaP, c.etaO] : ['', '', '', '', '', '', '', '']).map(x => typeof x === 'number' ? String(+x.toPrecision(6)).replace('.', ',') : x).join(';'))));
    anSaveFile('mapas_de_calor.csv', rows.join('\n'), 'text/csv');
  });
}

/* ================= Paso 4 · Compresor de alta ================= */
let AN_HPC = null;
function anStep4() {
  AN_HPC = Analysis.hpcDesign(AN, AN.hpcD);
  const head = `<h2 class="an-h">4 · Compresor de alta</h2>
  ${anLearn(`<p>El HPC se diseña como un apilamiento de <b>etapas repetidas</b> (<i>repeating-row, repeating-stage</i>): cada etapa (rotor + estátor) devuelve el flujo con la misma velocidad y el mismo ángulo con los que entró, así que se puede repetir tantas veces como haga falta. Con filas repetidas α₁ = β₂ y β₁ = α₂, y la reacción es exactamente 0,5.</p>
   <ul><li><b>Se eligen</b> el Mach de entrada M₁ (0,4–0,6 recomendado) y el ángulo de entrada α₁ (lo fijan los álabes guía de entrada). D = 0,5 (factor de difusión) y σ = 1 (solidez) son los de la figura de diseño.</li>
   <li>Con D, σ y α₁ queda fijado α₂ (eq. 3.39). Con M₁ sale la velocidad V₁, y de ahí todo el triángulo y la velocidad de pala ${eq('U = ωr = v₁ + v₂')}.</li>
   <li>El salto de temperatura por etapa es ${eq('ΔT<sub>t</sub> = (V₂² − V₁²)/c<sub>p</sub>')}, igual en todas las etapas, y el número de etapas es ${eq('n = ΔT<sub>t,HPC</sub>/ΔT<sub>t,etapa</sub>')}, redondeado hacia arriba.</li>
   <li>La relación de presiones de cada etapa usa la eficiencia <b>politrópica</b> (vale lo mismo para la etapa que para el compresor). Por defecto se usa la equivalente a la η<sub>HPC</sub> del mapa, para que las etapas den exactamente el π<sub>HPC</sub> del ciclo. Como ΔT<sub>t</sub> es igual en todas pero T<sub>t</sub> crece, π de cada etapa va bajando.</li>
   <li>El radio medio no lo fija el ciclo: es un supuesto que da el régimen de giro (ω = U/r<sub>m</sub>) y las alturas de álabe.</li></ul>`, !anSeen(4))}`;
  const ctl = `<section class="card an-card"><h3>Parámetros elegidos</h3><div class="an-hmctl">
    ${anOptField('hpcD.M1', 'M₁ (Mach de entrada)', '', 0.2, 0.8, 0.01, 'an_M1')}${anOptField('hpcD.a1', 'α₁ (ángulo de entrada)', '°', 0, 70, 0.5, 'an_a1')}
    ${anOptField('hpcD.D', 'D (factor de difusión)', '', 0.3, 0.65, 0.01)}${anOptField('hpcD.sigma', 'σ (solidez)', '', 0.5, 2, 0.01)}
    ${anOptField('hpcD.rm', 'r_m (radio medio, supuesto)', 'm', 0.05, 1.5, 0.005)}
    <div class="an-f an-f2"><label><input type="checkbox" id="anEcAuto"${AN.hpcD.ec > 0 ? '' : ' checked'}> e<sub>c</sub> equivalente a la η<sub>HPC</sub> del mapa</label>${anOptField('hpcD.ec', 'e_c fijada a mano', '', 0.7, 1, 0.001).replace('<div class="an-f an-f2">', '<div class="an-f an-f2" id="anEcBox"' + (AN.hpcD.ec > 0 ? '' : ' hidden') + '>')}</div>
   </div><p class="note">Valores por defecto genéricos: M₁ = 0,5, α₁ = 30°, D = 0,5, σ = 1, r<sub>m</sub> = 0,30 m.</p></section>`;
  if (!AN_HPC.ok) return head + ctl + anErr(AN_HPC.error, 1);
  const h = AN_HPC;
  const kpis = `<div class="tiles">${anKpi('Etapas N', String(h.N), `exacto ${fmt(h.ns, 2)}`)}${anKpi('π primera etapa', fmt(h.pcs, 3), '')}${anKpi('α₂', fmt(h.a2, 1), '°')}${anKpi('U (radio medio)', fmt(h.U, 0), 'm/s')}${anKpi('Régimen', fmt(h.rpm, 0), 'rpm')}${anKpi('M₁R', fmt(h.M1R, 3), '')}${anKpi('Ψ', fmt(h.Psi, 3), 'carga')}${anKpi('Φ', fmt(h.Phi, 3), 'flujo')}</div>`;
  const tri = anTriangles([
    { title: 'Entrada del rotor (1)', vecs: [{ x: h.u, y: h.v1, lab: `V₁ = ${fmt(h.V1, 0)} m/s, α₁ = ${fmt(h.a1, 1)}°`, cls: 'v1' }, { x: h.u, y: -h.v2, lab: `V₁R = ${fmt(h.V2, 0)} m/s, β₁ = ${fmt(h.a2, 1)}°`, cls: 'v2', dy: 14 }], U: [{ x: h.u, y: -h.v2 }, { x: h.u, y: h.v1 }], notes: [`u = ${fmt(h.u, 1)} m/s · U = ${fmt(h.U, 1)} m/s`] },
    { title: 'Salida del rotor (2)', vecs: [{ x: h.u, y: h.v2, lab: `V₂ = ${fmt(h.V2, 0)} m/s, α₂ = ${fmt(h.a2, 1)}°`, cls: 'v1' }, { x: h.u, y: -h.v1, lab: `V₂R = ${fmt(h.V1, 0)} m/s, β₂ = ${fmt(h.a1, 1)}°`, cls: 'v2', dy: 14 }], U: [{ x: h.u, y: -h.v1 }, { x: h.u, y: h.v2 }], notes: [`v₁ = ${fmt(h.v1, 1)} · v₂ = ${fmt(h.v2, 1)} m/s`] }
  ], { H: 360 });
  // figura de diseño reproducida
  const g = h.g, ec = h.ec, D = AN.hpcD.D, s = AN.hpcD.sigma, al = []; for (let a = 0; a <= 70; a += 1) al.push(a);
  const Ms = [0.3, 0.4, 0.5, 0.6, 0.7];
  const series = Ms.map((M, k) => ({ pts: al.map(a => [a, Analysis.hpcChart(a, M, D, s, ec, g).pcs]), cls: 'ln1 sq' + k, label: 'M₁ ' + fmt(M, 1) })).concat([{ pts: al.map(a => [a, Analysis.hpcChart(a, 0.5, D, s, ec, g).wrV]), cls: 'ln2', label: 'ωr/V₁', lab: [52, Analysis.hpcChart(52, .5, D, s, ec, g).wrV], dx: 6, dy: 12 }]);
  const chartA = anPlot({ id: 'anF2a', Rr: 58, x0: 0, x1: 70, y0: 0.8, y1: 2.6, xt: [0, 10, 20, 30, 40, 50, 60, 70], yt: [0.8, 1.2, 1.6, 2, 2.4], yd: 1, xl: 'α₁ [°]', yl: 'π de etapa · ωr/V₁', series, points: [{ x: h.a1, y: h.pcs, label: 'diseño' }, { x: h.a1, y: h.U / h.V1, cls: 'dp2' }], aria: 'π de etapa y ωr/V₁ frente a α₁' });
  const chartB = anPlot({ id: 'anF2b', W: 300, x0: 0, x1: 70, y0: 0, y1: 90, xt: [0, 20, 40, 60], yt: [0, 30, 60, 90], xl: 'α₁ [°]', yl: 'α₂ [°]', series: [{ pts: al.map(a => [a, Analysis.alpha2(a, D, s)]), cls: 'ln2' }], points: [{ x: h.a1, y: h.a2 }], aria: 'α₂ frente a α₁' });
  const rows = h.stages.map(st => `<tr><td>${st.k}</td><td class="n">${fmt(st.Tin, 1)}</td><td class="n">${fmt(st.Tout, 1)}</td><td class="n">${fmt(st.tau, 4)}</td><td class="n">${fmt(st.pi, 4)}</td><td class="n">${fmt(st.Pin / 1000, 1)}</td><td class="n">${fmt(st.Pout / 1000, 1)}</td></tr>`).join('');
  return head + ctl + anChips(h.warnings, 'Diseño dentro de los límites habituales') + kpis +
    `<div class="an-stack"><section class="card an-card"><h3>Triángulos de velocidades (todas las etapas)</h3>${tri}<p class="note">Eje horizontal: dirección axial; eje vertical: dirección de giro. Por simetría, el triángulo de entrada al rotor es el de salida dado la vuelta.</p></section>
     <section class="card an-card"><h3>Figura de diseño de la etapa</h3><p class="note" style="margin-top:0">D = ${fmt(D, 2)}, σ = ${fmt(s, 2)}, e<sub>c</sub> = ${fmt(ec, 3)}. Izquierda: π de etapa para cada M₁ (azules) y ωr/V₁ (discontinua). Derecha: α₂.</p><div class="an-2plots">${chartA}${chartB}</div><p class="note">Curvas recalculadas con las eqs. 3.39–3.45. Con D = 0,5, σ = 1 y e<sub>c</sub> = 0,9 coinciden con la figura del enunciado. Círculo: punto elegido.</p></section></div>
    <section class="card an-card"><h3>Etapa a etapa</h3><div><table><thead><tr><th>Etapa</th><th>T<sub>t</sub> entrada [K]</th><th>T<sub>t</sub> salida [K]</th><th>τ etapa</th><th>π etapa</th><th>P<sub>t</sub> entrada [kPa]</th><th>P<sub>t</sub> salida [kPa]</th></tr></thead><tbody>${rows}</tbody></table></div>
     <p class="note">π total de las ${h.N} etapas: ${fmt(h.piTot, 4)} (π<sub>HPC</sub> del ciclo: ${fmt(h.dp.res.pihpc, 4)}). Área a la entrada ${fmt(h.Ain, 4)} m², a la salida ${fmt(h.Aout, 4)} m².</p></section>
    ${anSheetBlock(h.sheet, 'Cálculo paso a paso del compresor', 'compresor_de_alta.txt')}${anNav(3, 5, 'turbina de alta')}`;
}
function anInit4() {
  anBindOpts(() => { const y = scrollY; renderAnalysis(); scrollTo(0, y); });
  const cb = $('#anEcAuto');
  if (cb) cb.addEventListener('change', () => { AN.hpcD.ec = cb.checked ? null : (AN_HPC && AN_HPC.ok ? +AN_HPC.ecEq.toFixed(3) : 0.9); anSave(); const y = scrollY; renderAnalysis(); scrollTo(0, y); });
  if (AN_HPC && AN_HPC.ok) anBindSheet(AN_HPC.sheet, 'compresor de alta');
}

/* ================= Paso 5 · Turbina de alta ================= */
let AN_HPT = null;
function anStep5() {
  const hpc = Analysis.hpcDesign(AN, AN.hpcD);
  AN_HPT = Analysis.hptDesign(AN, AN.hptD, hpc);
  const head = `<h2 class="an-h">5 · Turbina de alta</h2>
  ${anLearn(`<p>La HPT se diseña como <b>una sola etapa</b> (estátor + rotor) con <b>velocidad axial constante</b> y <b>salida sin giro</b> (α₃ = 0). Tiene que extraer el salto de temperatura que pide el compresor de alta: ${eq('ΔT<sub>t</sub> = T<sub>t4</sub> − T<sub>t45</sub>')}.</p>
   <ul><li><b>Se eligen</b> el coeficiente de carga ${eq('Ψ = c<sub>p</sub>ΔT<sub>t</sub>/U²')} y el de flujo ${eq('Φ = u/U')}. Con Ψ fijado, la velocidad de pala necesaria es U = √(c<sub>p</sub>ΔT<sub>t</sub>/Ψ).</li>
   <li>Con salida sin giro, carga y reacción van juntas: ${eq('R<sub>t</sub> = 1 − Ψ/2')} (eq. 4.31). Más Ψ significa menos etapas pero peor rendimiento; Ψ > 2 daría reacción negativa.</li>
   <li>Triángulos: ${eq('v₂ = ΨU')}, ${eq('tan β₂ = (v₂ − U)/u')}, ${eq('tan β₃ = U/u')}. La figura de diseño da la deflexión ε = β₂ + β₃ en función de β₂, con curvas de Ψ/Φ y de R<sub>t</sub>/Φ.</li>
   <li><b>Comprobaciones de diseño:</b> α₂ ≤ 70° (si no, pérdidas inaceptables), M₂ > 1 (el estátor de la primera etapa está bloqueado y fija el caudal del motor) y M₃R < 0,9.</li>
   <li>Va en el mismo eje que el HPC, así que gira a la misma ω (paso 4): su radio medio tiene que ser r = U/ω.</li></ul>`, !anSeen(5))}`;
  const ctl = `<section class="card an-card"><h3>Parámetros elegidos</h3><div class="an-hmctl">${anOptField('hptD.Psi', 'Ψ (coeficiente de carga)', '', 0.5, 3, 0.01, 'an_Psi')}${anOptField('hptD.Phi', 'Φ (coeficiente de flujo)', '', 0.2, 1.5, 0.01, 'an_Phi')}</div>
   <p class="note">Valores por defecto genéricos: Ψ = 1,6 (R<sub>t</sub> = 0,2) y Φ = 0,65, que cumplen las tres comprobaciones con el motor de ejemplo.</p></section>`;
  if (!AN_HPT.ok) return head + ctl + anErr(AN_HPT.error, 1);
  const t = AN_HPT;
  const chk = (ok, txt) => `<li class="${ok ? 'okc' : 'badc'}"><span aria-hidden="true">${ok ? '✓' : '✗'}</span> ${txt}</li>`;
  const checks = `<ul class="an-checks">${chk(t.a2 <= 70, `α₂ = ${fmt(t.a2, 1)}° ≤ 70°`)}${chk(t.M2 > 1, `M₂ = ${fmt(t.M2, 3)} > 1 (estátor bloqueado)`)}${chk(t.M3R < 0.9, `M₃R = ${fmt(t.M3R, 3)} < 0,9`)}${chk(t.Rt >= 0, `R<sub>t</sub> = ${fmt(t.Rt, 3)} ≥ 0`)}</ul>`;
  const kpis = `<div class="tiles">${anKpi('ΔT_t', fmt(t.dT, 1), 'K')}${anKpi('U necesaria', fmt(t.U, 0), 'm/s')}${anKpi('R_t', fmt(t.Rt, 3), '')}${anKpi('α₂', fmt(t.a2, 1), '°')}${anKpi('β₂', fmt(t.b2, 1), '°')}${anKpi('β₃', fmt(t.b3, 1), '°')}${t.rmH ? anKpi('r_m,HPT', fmt(t.rmH, 3), `m (${fmt(t.ratio, 2)}× el del HPC)`) : ''}</div>`;
  const tri = anTriangles([
    { title: 'Salida del estátor / entrada al rotor (2)', vecs: [{ x: t.u, y: t.v2, lab: `V₂ = ${fmt(t.V2, 0)} m/s, α₂ = ${fmt(t.a2, 1)}°`, cls: 'v1' }, { x: t.u, y: t.v2 - t.U, lab: `V₂R = ${fmt(t.V2R, 0)} m/s, β₂ = ${fmt(t.b2, 1)}°`, cls: 'v2', dy: -6 }], U: [{ x: t.u, y: t.v2 - t.U }, { x: t.u, y: t.v2 }], notes: [`u = ${fmt(t.u, 1)} m/s · v₂ = ${fmt(t.v2, 1)} m/s`] },
    { title: 'Salida del rotor (3)', vecs: [{ x: t.u, y: 0, lab: `V₃ = ${fmt(t.u, 0)} m/s, α₃ = 0°`, cls: 'v1', dy: -6 }, { x: t.u, y: -t.U, lab: `V₃R = ${fmt(t.V3R, 0)} m/s, β₃ = ${fmt(t.b3, 1)}°`, cls: 'v2' }], U: [{ x: t.u, y: -t.U }, { x: t.u, y: 0 }], notes: [`U = ${fmt(t.U, 1)} m/s`] }
  ], { down: true, H: 340 });
  const b = []; for (let x = 0; x <= 60; x += 0.5) b.push(x);
  const PP = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4], RR = [0, 0.2, 0.5, 1, 1.5];
  const LP = [0.5, 1, 1.5, 2, 3, 4], LR = [0, 0.5, 1.5];
  const series = PP.map(k => ({ pts: b.map(x => [x, x + Math.atan(k - Math.tan(x * Math.PI / 180)) * 180 / Math.PI]), cls: 'ln4', label: LP.includes(k) ? 'Ψ/Φ ' + fmt(k, k % 1 ? 1 : 0) : '', lab: [2, 2 + Math.atan(k - Math.tan(2 * Math.PI / 180)) * 180 / Math.PI], dx: 2, dy: -3 }))
    .concat(RR.map(k => ({ pts: b.map(x => [x, x + Math.atan(2 * k + Math.tan(x * Math.PI / 180)) * 180 / Math.PI]), cls: 'ln3', label: LR.includes(k) ? 'R/Φ ' + fmt(k, 1) : '', lab: [58, 58 + Math.atan(2 * k + Math.tan(58 * Math.PI / 180)) * 180 / Math.PI], anchor: 'end', dx: -2, dy: -4 })));
  const fig = anPlot({ id: 'anF3', W: 560, H: 380, x0: 0, x1: 60, y0: 20, y1: 140, xt: [0, 10, 20, 30, 40, 50, 60], yt: [20, 40, 60, 80, 100, 120, 140], xl: 'β₂ [°]', yl: 'ε = β₂ + β₃ [°]', series, points: [{ x: t.b2, y: t.eps, label: 'diseño' }], aria: 'Figura de diseño de la turbina' });
  return head + ctl + `<section class="card an-card"><h3>Comprobaciones</h3>${checks}</section>` + kpis +
    `<div class="an-stack"><section class="card an-card"><h3>Triángulos de velocidades</h3>${tri}<p class="note">Eje horizontal: dirección axial; eje vertical: dirección de giro (U hacia abajo, como en los apuntes).</p></section>
     <section class="card an-card"><h3>Figura de diseño de la turbina</h3>${fig}<div class="an-legend"><span><i class="ln" style="background:var(--s4)"></i>Ψ/Φ constante</span><span><i class="ln dash" style="border-color:var(--s3)"></i>R<sub>t</sub>/Φ constante</span><span><i class="pt"></i>Punto de diseño (Ψ/Φ = ${fmt(t.Psi / t.Phi, 2)}, R<sub>t</sub>/Φ = ${fmt(t.Rt / t.Phi, 2)})</span></div></section></div>
    ${anSheetBlock(t.sheet, 'Cálculo paso a paso de la turbina', 'turbina_de_alta.txt')}${anNav(4, 6, 'fuera de diseño')}`;
}
function anInit5() { anBindOpts(() => { const y = scrollY; renderAnalysis(); scrollTo(0, y); }); if (AN_HPT && AN_HPT.ok) anBindSheet(AN_HPT.sheet, 'turbina de alta'); }

/* ================= Paso 6 · Fuera de diseño ================= */
let AN_OD = null;
function anStep6() {
  const dp = Analysis.designPoint(AN);
  if (dp.ok && !(AN.od.Tt4 > 0)) AN.od.Tt4 = Math.round(dp.res.Tt4 + 100);
  AN_OD = Analysis.offDesign(AN, AN.od);
  const head = `<h2 class="an-h">6 · Fuera de diseño</h2>
  ${anLearn(`<p>El motor ya está «construido»: sus áreas, sus turbinas y sus toberas son las del punto de diseño. Ahora se calcula cómo funciona en otra condición, por defecto <b>a nivel del mar y parado (M₀ = 0)</b>, como al despegue. Ya no se eligen π ni α: salen del propio motor.</p>
   <ul><li><b>Turbinas bloqueadas:</b> la HPT tiene la entrada bloqueada y su τ<sub>tH</sub> se queda como en diseño. El caudal del núcleo lo fija ${eq('ṁ(1+f)√T<sub>t4</sub>/P<sub>t4</sub> = cte')}.</li>
   <li><b>Toberas de área fija:</b> la de núcleo fija τ<sub>tL</sub> con ${eq('π<sub>tL</sub>·MFP(M₈)/√τ<sub>tL</sub> = cte')}; la del fan, junto con la del núcleo, fija la <b>relación de derivación</b>: ${eq('α = α<sub>D</sub>·(P<sub>t19</sub>/P<sub>t4</sub>)/(P<sub>t19</sub>/P<sub>t4</sub>)<sub>D</sub>·√[(T<sub>t4</sub>/T<sub>t19</sub>)/(T<sub>t4</sub>/T<sub>t19</sub>)<sub>D</sub>]·MFP(M₁₉)/MFP<sub>D</sub>')}.</li>
   <li><b>Fan y LPC en el mismo eje:</b> se supone que la potencia se reparte entre fan secundario y núcleo en la misma proporción que en diseño (cierre «constant power split» de los apuntes).</li>
   <li><b>Iteración:</b> las incógnitas son τ<sub>f</sub>, τ<sub>LPC</sub>, τ<sub>tL</sub>, α y los Mach de las toberas. Se parte de los valores de diseño y se repite hasta que no cambian.</li>
   <li>T<sub>t4</sub> en esta condición es un <b>supuesto</b>: al despegue suele ser mayor que en crucero. Por defecto, la de diseño + 100 K.</li>
   <li>A M₀ = 0 la velocidad de vuelo es nula: η<sub>P</sub> y η<sub>O</sub> valen 0 por definición, aunque el motor dé mucho empuje.</li></ul>`, !anSeen(6))}`;
  const ctl = `<section class="card an-card"><h3>Condición fuera de diseño</h3><div class="an-hmctl">${anOptField('od.h', 'Altitud', 'm', 0, 15000, 1)}${anOptField('od.M0', 'Mach', '', 0, 0.95, 0.01)}${anOptField('od.Tt4', 'T_t4 en esta condición (supuesto)', 'K', 1000, 2200, 1, 'an_odTt4')}</div>
   <button type="button" class="btn" id="anOdReset">Restablecer: nivel del mar, M₀ = 0, T<sub>t4</sub> de diseño + 100 K</button></section>`;
  if (!dp.ok) return head + ctl + anErr(dp.error, 1);
  if (!AN_OD.ok) return head + ctl + anErr(AN_OD.error, 1);
  const o = AN_OD, r = o.res, d = dp.res, dm = dp.derive;
  const row = (n, a, b, dec, u, noRatio) => `<tr><td style="text-align:left">${anSub(n)}</td><td class="n">${fmt(a, dec)}</td><td class="n">${isFinite(b) ? fmt(b, dec) : '–'}</td><td class="n">${!noRatio && isFinite(a) && isFinite(b) && a !== 0 && b !== 0 ? '×' + fmt(b / a, 2) : '–'}</td><td style="text-align:left;color:var(--muted)">${u}</td></tr>`;
  const und = r.dek <= 0 || r.Fsp <= 0;
  const tbl = `<table><thead><tr><th style="text-align:left">Magnitud</th><th>Diseño (crucero)</th><th>Fuera de diseño</th><th>Relación</th><th style="text-align:left">Unidad</th></tr></thead><tbody>
    ${row('Altitud', AN.h0, o.h, 0, 'm', 1)}${row('Mach de vuelo', AN.M0, o.M0, 2, '', 1)}${row('T_t4', d.Tt4, o.Tt4, 0, 'K')}
    ${row('Empuje F', d.size.F / 1000, r.size.F / 1000, 2, 'kN')}${row('Empuje específico F/ṁ₀', d.Fsp, r.Fsp, 1, 'N·s/kg')}${row('TSFC', d.tsfc * 1e6, r.tsfc * 1e6, 2, 'mg/(N·s)')}
    ${row('η térmico', d.etaT * 100, und ? NaN : r.etaT * 100, 1, '%')}${row('η propulsivo', d.etaP * 100, r.etaP * 100, 1, '%')}${row('η global', d.etaO * 100, r.etaO * 100, 1, '%')}
    ${row('Caudal total ṁ₀', dm.m0, o.m0, 1, 'kg/s')}${row('Caudal del núcleo', dm.mcore, o.mcore, 2, 'kg/s')}${row('Relación de derivación α', AN.alpha, o.alpha, 3, '')}
    ${row('π fan', d.pif, o.st.pf, 3, '')}${row('π LPC', d.pilpc, o.st.pl, 3, '')}${row('π HPC', d.pihpc, o.st.ph, 3, '')}${row('OPR', d.pic, r.pic, 2, '')}${row('Relación combustible/aire f', d.f, r.f, 5, '')}${row('Caudal de combustible', d.size.mf, r.size.mf, 4, 'kg/s')}
    ${row('ṁ corregido en el HPC', AN.hpc.mc, o.mc25, 2, 'kg/s')}</tbody></table>`;
  const kpis = `<div class="tiles">${anKpi('Empuje F', fmt(r.size.F / 1000, 1), 'kN')}${anKpi('TSFC', fmt(r.tsfc * 1e6, 2), 'mg/(N·s)')}${anKpi('η_T', und ? '–' : fmt(r.etaT * 100, 1), '%')}${anKpi('η_P', fmt(r.etaP * 100, 1), o.M0 === 0 ? '% (M₀ = 0)' : '%')}${anKpi('η_O', fmt(r.etaO * 100, 1), '%')}${anKpi('α', fmt(o.alpha, 3), `diseño ${fmt(AN.alpha, 2)}`)}</div>`;
  const M = Analysis.HPC_MAP, lp = [M.line.mcMin, M.line.mcMax];
  const mapc = anPlot({ id: 'anOdMap', W: 520, H: 300, x0: 2.5, x1: 22.5, y0: 1, y1: 9, xt: [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5], xd: 1, yt: [1, 3, 5, 7, 9], xl: 'ṁ corregido en 2.5 [kg/s]', yl: 'π HPC', series: [{ pts: lp.map(m => [m, Analysis.map.piFromMc(m)]), cls: 'ln1', label: 'línea de operación', lab: [8, Analysis.map.piFromMc(8)], dx: -4, dy: -10, anchor: 'end' }], points: [{ x: AN.hpc.mc, y: AN.hpc.pi, label: 'diseño', ldx: -10, ldy: -10, anchor: 'end' }, { x: o.mc25, y: o.st.ph, cls: 'dp2', label: 'fuera de diseño', ldx: 6, ldy: 18 }], aria: 'Punto de funcionamiento del HPC en el mapa' });
  const conv = `<table><thead><tr><th>Iteración</th><th>τ<sub>tL</sub></th><th>α</th><th>τ<sub>f</sub></th><th>Error</th></tr></thead><tbody>${o.hist.slice(0, 12).map(h => `<tr><td>${h.it}</td><td class="n">${fmt(h.ttl, 5)}</td><td class="n">${fmt(h.al, 4)}</td><td class="n">${fmt(h.tf, 5)}</td><td class="n">${h.err.toExponential(1).replace('.', ',')}</td></tr>`).join('')}</tbody></table>`;
  const warn = r.warnings.slice(); const dev = Math.abs(o.st.ph - Analysis.map.piFromMc(o.mc25));
  if (dev > 0.4) warn.push('El punto del HPC queda a ' + dev.toFixed(2) + ' de π de la línea de operación del mapa: el modelo simplificado no fuerza el mapa, compáralo en el informe.');
  return head + ctl + anChips(warn, 'Convergido en ' + o.it + ' iteraciones') + kpis +
    `<section class="card an-card"><h3>Diseño frente a fuera de diseño</h3>${tbl}</section>
     <div class="an-cols"><section class="card an-card"><h3>Compresor de alta en su mapa</h3>${mapc}<p class="note">El modelo no usa el mapa para calcular; este gráfico sirve para comprobar que el punto fuera de diseño cae cerca de la línea de operación.</p></section>
     <section class="card an-card"><h3>Convergencia</h3>${conv}</section></div>
    ${anSheetBlock(o.sheet.concat(Calcs.build(r).sections), 'Cálculo paso a paso (iteración y ciclo resultante)', 'fuera_de_diseno.txt')}${anNav(5, 7, 'resumen')}`;
}
function anInit6() {
  anBindOpts(() => { const y = scrollY; renderAnalysis(); scrollTo(0, y); });
  $('#anOdReset').addEventListener('click', () => { AN.od = Analysis.OD_DEF(); anSave(); renderAnalysis(); });
  if (AN_OD && AN_OD.ok) anBindSheet(AN_OD.sheet.concat(Calcs.build(AN_OD.res).sections), 'fuera de diseño');
}

/* ================= Paso 7 · Resumen ================= */
function anSummaryTables() {
  const dp = Analysis.designPoint(AN), T = [];
  const src = k => (AN.src || {})[k] || '';
  const d1 = [['Altitud de crucero h₀', AN.h0, 'm', 'h0'], ['Mach de crucero M₀', AN.M0, '', 'M0'], ['Relación de derivación α', AN.alpha, '', 'alpha'], ['OPR', AN.OPR, '', 'OPR'], ['π fan', AN.pif, '', 'pif'],
    ['π HPC (mapa)', AN.hpc.pi, '', 'hpc.pi'], ['π LPC = OPR/(π_f·π_HPC)', dp.derive.pilpc, '', ''], ['η HPC isentrópica (mapa)', AN.hpc.eta, '', 'hpc.eta'], ['ṁ corregido HPC (mapa)', AN.hpc.mc, 'kg/s', 'hpc.mc'],
    ['Caudal del núcleo', dp.derive.mcore, 'kg/s', ''], ['Caudal total ṁ₀', dp.derive.m0, 'kg/s', ''], ['T_t4', AN.Tt4, 'K', 'Tt4'], ['h_PR', AN.fuel, 'MJ/kg', 'fuel'],
    ['π_d máx', AN.eff.pidmax, '', 'eff.pidmax'], ['e_f', AN.eff.ef, '', 'eff.ef'], ['e_LPC', AN.eff.ec, '', 'eff.ec'], ['e_t', AN.eff.et, '', 'eff.et'], ['π_b', AN.eff.pib, '', 'eff.pib'], ['η_b', AN.eff.etab, '', 'eff.etab'], ['η_m', AN.eff.etam, '', 'eff.etam'], ['π_n', AN.eff.pin, '', 'eff.pin'], ['π_fn', AN.eff.pifn, '', 'eff.pifn'],
    ['γ_c / c_pc', fmt(AN.gas.gc, 3) + ' / ' + fmt(AN.gas.cpc, 1), 'J/(kg·K)', 'gas.cpc'], ['γ_t / c_pt', fmt(AN.gas.gt, 3) + ' / ' + fmt(AN.gas.cpt, 1), 'J/(kg·K)', 'gas.cpt']];
  T.push({ id: 'datos', title: 'Datos del motor y fuentes', head: ['Parámetro', 'Valor', 'Unidad', 'Fuente o supuesto'], rows: d1.map(x => [x[0], typeof x[1] === 'number' ? fmt(x[1], Math.abs(x[1]) < 10 ? 4 : 1) : x[1], x[2], x[3] ? src(x[3]) : 'calculado']) });
  if (dp.ok) {
    const od = Analysis.offDesign(AN, AN.od), r = dp.res, o = od.ok ? od.res : null;
    const R = (n, a, b, dec, u) => [n, fmt(a, dec), o ? fmt(b, dec) : '–', u];
    T.push({ id: 'res', title: 'Resultados: punto de diseño y fuera de diseño', head: ['Magnitud', 'Diseño (crucero)', o ? `Fuera de diseño (h = ${fmt(od.h, 0)} m, M₀ = ${fmt(od.M0, 2)})` : 'Fuera de diseño', 'Unidad'],
      rows: [R('T_t4', r.Tt4, od.Tt4, 0, 'K'), R('Empuje F', r.size.F / 1000, o && o.size.F / 1000, 2, 'kN'), R('Empuje específico', r.Fsp, o && o.Fsp, 1, 'N·s/kg'), R('TSFC', r.tsfc * 1e6, o && o.tsfc * 1e6, 2, 'mg/(N·s)'),
        R('η_T', r.etaT * 100, o && o.etaT * 100, 1, '%'), R('η_P', r.etaP * 100, o && o.etaP * 100, 1, '%'), R('η_O', r.etaO * 100, o && o.etaO * 100, 1, '%'), R('ṁ₀', dp.derive.m0, od.m0, 1, 'kg/s'), R('α', AN.alpha, od.alpha, 3, ''), R('OPR', r.pic, o && o.pic, 2, '')] });
    const h = Analysis.hpcDesign(AN, AN.hpcD);
    if (h.ok) T.push({ id: 'hpc', title: 'Compresor de alta', head: ['Magnitud', 'Valor', 'Unidad'], rows: [['M₁ (elegido)', fmt(h.M1, 2), ''], ['α₁ (elegido)', fmt(h.a1, 1), '°'], ['α₂', fmt(h.a2, 2), '°'], ['V₁', fmt(h.V1, 1), 'm/s'], ['u', fmt(h.u, 1), 'm/s'], ['U', fmt(h.U, 1), 'm/s'], ['M₁R', fmt(h.M1R, 3), ''], ['Ψ', fmt(h.Psi, 3), ''], ['Φ', fmt(h.Phi, 3), ''], ['Reacción', '0,5', ''], ['π primera etapa', fmt(h.pcs, 4), ''], ['ΔT_t por etapa', fmt(h.dTr, 2), 'K'], ['Número de etapas', String(h.N), ''], ['e_c', fmt(h.ec, 4), ''], ['r_m (supuesto)', fmt(h.rm, 3), 'm'], ['Régimen', fmt(h.rpm, 0), 'rpm']] });
    const t = Analysis.hptDesign(AN, AN.hptD, h);
    if (t.ok) T.push({ id: 'hpt', title: 'Turbina de alta', head: ['Magnitud', 'Valor', 'Unidad'], rows: [['Ψ (elegido)', fmt(t.Psi, 3), ''], ['Φ (elegido)', fmt(t.Phi, 3), ''], ['ΔT_t', fmt(t.dT, 1), 'K'], ['U', fmt(t.U, 1), 'm/s'], ['R_t', fmt(t.Rt, 3), ''], ['α₂', fmt(t.a2, 2), '°'], ['β₂', fmt(t.b2, 2), '°'], ['β₃', fmt(t.b3, 2), '°'], ['M₂', fmt(t.M2, 3), ''], ['M₃R', fmt(t.M3R, 3), ''], ['r_m', t.rmH ? fmt(t.rmH, 3) : '–', 'm']] });
  }
  return T;
}
function anStep7() {
  const T = anSummaryTables();
  return `<h2 class="an-h">7 · Resumen</h2>
  ${anLearn(`<p>Todas las tablas del análisis en un sitio: los datos del motor con su fuente (lo que anotaste en el paso 1) y los resultados de cada paso con los parámetros que se eligieron. Con «Copiar tablas» se copian separadas por tabuladores, de modo que al pegarlas en un procesador de textos o una hoja de cálculo quedan como tablas.</p>`, !anSeen(7))}
  <div class="cl-bar"><span class="sp"></span><button type="button" class="btn" id="anSumCopy">Copiar tablas</button><button type="button" class="btn" id="anSumCsv">Descargar .csv</button></div>
  ${T.map(t => `<section class="card an-card"><h3>${t.title}</h3><div class="tscroll" style="max-height:none"><table><thead><tr>${t.head.map((h, i) => `<th style="text-align:${(t.id === 'res' ? (i === 1 || i === 2) : i === 1) ? 'right' : 'left'}">${h}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((c, i) => `<td style="text-align:${(t.id === 'res' ? (i === 1 || i === 2) : i === 1) ? 'right' : 'left'}"${i === 3 && t.id === 'datos' && !c ? ' class="miss"' : ''}>${i === 3 && t.id === 'datos' && !c ? 'sin fuente' : anSub(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('')}
  <p class="note">«sin fuente»: falta anotar de dónde sale el dato (paso 1).</p>${anNav(6)}`;
}
function anInit7() {
  anBindOpts(() => { });
  const T = anSummaryTables();
  const tsv = () => T.map(t => [t.title, t.head.join('\t')].concat(t.rows.map(r => r.join('\t'))).join('\n')).join('\n\n');
  $('#anSumCopy').addEventListener('click', e => { const b = e.target; try { navigator.clipboard.writeText(tsv()).then(() => b.textContent = 'Copiado ✓', () => b.textContent = 'Usa Descargar'); } catch (err) { b.textContent = 'Usa Descargar'; } setTimeout(() => b.textContent = 'Copiar tablas', 1800); });
  $('#anSumCsv').addEventListener('click', () => anSaveFile('resumen_' + (AN.name || 'motor').replace(/[^\wáéíóúñ-]+/gi, '_') + '.csv', T.map(t => [t.title, t.head.join(';')].concat(t.rows.map(r => r.join(';'))).join('\n')).join('\n\n'), 'text/csv'));
}

Object.assign(INFO, {
  an_M1: () => ['Mach de entrada M₁', `<p>Mach absoluto a la entrada de cada etapa. Más M₁ da más presión por etapa (menos etapas), pero acerca el rotor a condiciones transónicas. Recomendado entre 0,4 y 0,6.</p>`],
  an_a1: () => ['Ángulo de entrada α₁', `<p>Ángulo del flujo absoluto a la entrada de la etapa, medido desde la dirección axial. En la primera etapa lo fijan los álabes guía de entrada (IGV). Un α₁ alto exige más velocidad de pala (ωr/V₁ crece mucho) y gira menos el flujo.</p>`],
  an_Psi: () => ['Coeficiente de carga Ψ', `<p>${eq('Ψ = c<sub>p</sub>ΔT<sub>t</sub>/U²')}: trabajo de la etapa relativo a la velocidad de pala. Con salida sin giro, ${eq('R<sub>t</sub> = 1 − Ψ/2')}. Ψ alto: menos etapas, peor rendimiento; Ψ > 2 da reacción negativa.</p>`],
  an_Phi: () => ['Coeficiente de flujo Φ', `<p>${eq('Φ = u/U')}: velocidad axial relativa a la de pala. Junto con Ψ fija los ángulos: tan α₂ = Ψ/Φ, tan β₃ = 1/Φ.</p>`],
  an_odTt4: () => ['T_t4 fuera de diseño', `<p>Temperatura de entrada a turbina en la condición calculada. Es una decisión de control del motor (un supuesto): al despegue suele ser la máxima. Por defecto, la de diseño + 100 K.</p>`]
});
