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
  { n: 3, t: 'Mapas de calor', s: 'π_LPC × π_HPC, dos escenarios', soon: true },
  { n: 4, t: 'Compresor de alta', s: 'Etapas repetidas y triángulos', soon: true },
  { n: 5, t: 'Turbina de alta', s: 'Una etapa y triángulos', soon: true },
  { n: 6, t: 'Fuera de diseño', s: 'Nivel del mar, estático', soon: true },
  { n: 7, t: 'Resumen', s: 'Tablas de datos y resultados', soon: true }
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
  main.innerHTML = AN_STEP === 1 ? anStep1() : AN_STEP === 2 ? anStep2() : anSoon(AN_STEP);
  if (AN_STEP === 1) anInit1();
  if (AN_STEP === 2) anInit2();
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
