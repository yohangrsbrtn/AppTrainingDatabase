// ── Mensurations page ─────────────────────────────────────────────────

window._mensCharts = window._mensCharts || {};

const _M_COLS   = ['fessiers','cuisses','mollets','poitrine','epaules','bras'];
const _M_COLORS = ['#f59e0b','#a78bfa','#3ecf8e','#f97316','#4f8ef7','#e05c5c'];
const _M_LABELS = ['Fessiers','Cuisses','Mollets','Poitrine','Épaules','Bras'];
let _mChart2Keys = new Set(['fessiers']);

let _mSubPage  = 'historique'; // 'historique' | 'autres-mens' | 'saisie-list' | 'saisie-form'
let _mReleves  = [];
let _mEntrees  = [];
let _mFormData = null;
let _mDateDebut = '';
let _mDateFin   = '';

// ── Load ──────────────────────────────────────────────────────────────

async function loadMensurations() { return loadMensurationsSupabase(); }

async function loadMensurationsSupabase() {
  setPage('mens-loading');
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/mensurations?client_id=eq.${encodeURIComponent(S.client)}&order=date.asc&select=id,date,poids,mesure,phase,fessiers,cuisses,mollets,poitrine,epaules,bras`,
      { headers: supaHeaders() }
    );
    const data = res.ok ? await res.json() : [];
    _mReleves = data.map(r => ({
      date:     r.date,
      poids:    r.poids,
      taille:   r.mesure,
      fessiers: r.fessiers,
      cuisses:  r.cuisses,
      mollets:  r.mollets,
      poitrine: r.poitrine,
      epaules:  r.epaules,
      bras:     r.bras,
      phase:    r.phase || ''
    }));
    _mSubPage = 'historique';
    try {
      _mDateDebut = localStorage.getItem('mensDateDebut') || '';
      _mDateFin   = localStorage.getItem('mensDateFin')   || isoDate(new Date());
    } catch(e) {}
    setPage('mensurations');
  } catch(e) { loadHomeSupabase(); }
}

async function loadSaisieMensurations() { return loadSaisieMensurationsSupabase(); }

function loadSaisieMensurationsSupabase() {
  // Pour Supabase : on utilise directement _mReleves comme liste de saisies
  _mSubPage = 'saisie-list';
  setPage('mensurations');
}

async function creerSaisieMensuration() { return creerSaisieMensurationSupabase(); }

function creerSaisieMensurationSupabase() {
  const dateVal = document.getElementById('nouvelleDateMens').value;
  if (!dateVal) return;
  const existant = _mReleves.find(r => r.date === dateVal);
  ouvrirSaisieMensurationSupabase(existant ? existant.date : dateVal, existant);
}

function ouvrirSaisieMensurationSupabase(dateISO) {
  const e = _mReleves.find(r => r.date === dateISO);
  _mFormData = {
    date:     dateISO,
    poids:    e ? e.poids    : null,
    taille:   e ? e.taille   : null,
    fessiers: e ? e.fessiers : null,
    cuisses:  e ? e.cuisses  : null,
    mollets:  e ? e.mollets  : null,
    poitrine: e ? e.poitrine : null,
    epaules:  e ? e.epaules  : null,
    bras:     e ? e.bras     : null,
    phase:    e ? e.phase    : ''
  };
  _mSubPage = 'saisie-form';
  setPage('mensurations');
}

// ── Render ────────────────────────────────────────────────────────────

function renderMensurationsPage() {
  if (S.page === 'mens-loading') {
    return `<div id="app">${renderHeader('Mes Mensurations','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('mensurations')}</div>`;
  }
  if (_mSubPage === 'autres-mens') return renderAutresMens();
  if (_mSubPage === 'saisie-list') return renderSaisieList();
  if (_mSubPage === 'saisie-form') return renderSaisieForm();
  return renderHistorique();
}

function _mAfficherDate(dateStr) {
  // Convertit ISO (YYYY-MM-DD) → DD/MM/YYYY pour affichage
  if (!dateStr) return '—';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return dateStr;
}

function renderHistorique() {
  const releves = filtrerReleves(_mReleves, _mDateDebut, _mDateFin);

  const poidsVals  = releves.map(r => r.poids);
  const tailleVals = releves.map(r => r.taille);
  const poidsPts   = poidsVals.filter(v => v !== null && v !== '' && !isNaN(v)).map(Number);
  const taillePts  = tailleVals.filter(v => v !== null && v !== '' && !isNaN(v)).map(Number);

  const poidsActuel  = poidsPts.length ? poidsPts[poidsPts.length - 1] : null;
  const poidsDebut   = poidsPts.length ? poidsPts[0] : null;
  const varPoids     = poidsActuel !== null ? (poidsActuel - poidsDebut).toFixed(1) : null;

  const tailleActuel = taillePts.length ? taillePts[taillePts.length - 1] : null;
  const tailleDebut  = taillePts.length ? taillePts[0] : null;
  const varTaille    = tailleActuel !== null ? (tailleActuel - tailleDebut).toFixed(1) : null;

  const statsHtml = (poidsActuel !== null || tailleActuel !== null) ? `
    <div style="display:flex;gap:12px;margin-bottom:12px;">
      ${poidsActuel !== null ? `<div class="card" style="flex:1;text-align:center;margin-bottom:0;">
        <div class="field-label">POIDS</div>
        <div style="font-size:24px;font-weight:700;margin:4px 0;">${poidsActuel} kg</div>
        <div style="font-size:13px;color:${varPoids >= 0 ? 'var(--green)' : '#D85A30'};">${varPoids >= 0 ? '+' : ''}${varPoids} kg</div>
      </div>` : ''}
      ${tailleActuel !== null ? `<div class="card" style="flex:1;text-align:center;margin-bottom:0;">
        <div class="field-label">TOUR DE TAILLE</div>
        <div style="font-size:24px;font-weight:700;margin:4px 0;">${tailleActuel} cm</div>
        <div style="font-size:13px;color:${varTaille <= 0 ? 'var(--green)' : '#D85A30'};">${varTaille >= 0 ? '+' : ''}${varTaille} cm</div>
      </div>` : ''}
    </div>
    ${(poidsPts.length >= 2 || taillePts.length >= 2) ? `<div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-muted);">Poids &amp; Tour de taille</div>${_buildMensChart('m_c1', releves, ['poids','taille'], ['#378ADD','#D85A30'], ['Poids (kg)','Tour de taille (cm)'], '')}</div>` : ''}
  ` : '';

  const _cm = v => v!=null&&v!==''&&!isNaN(v) ? v+' cm' : null;
  const histRows = releves.length ? releves.slice().reverse().map(r => {
    const extras = [
      r.taille  ? 'Taille ' + _cm(r.taille)   : null,
      r.fessiers? 'Fess. ' + _cm(r.fessiers)  : null,
      r.cuisses ? 'Cuiss. '+ _cm(r.cuisses)   : null,
      r.mollets ? 'Moll. ' + _cm(r.mollets)   : null,
      r.poitrine? 'Poit. ' + _cm(r.poitrine)  : null,
      r.epaules ? 'Ép. '   + _cm(r.epaules)   : null,
      r.bras    ? 'Bras '  + _cm(r.bras)      : null,
    ].filter(Boolean);
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;">
        <div style="font-size:13px;color:var(--muted);">${_mAfficherDate(r.date)}${r.phase ? ' · ' + r.phase : ''}</div>
        <div style="font-size:13px;font-weight:600;">${r.poids ? r.poids + ' kg' : '—'}</div>
      </div>
      ${extras.length ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${extras.join(' · ')}</div>` : ''}
    </div>`;
  }).join('')
    : '<div style="font-size:13px;color:var(--muted);text-align:center;padding:12px;">Aucune donnée sur cette période</div>';

  return `<div id="app">
    ${renderHeader('Mes Mensurations', 'Ma progression', false)}
    <div class="page">
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button onclick="goTo('home')" style="flex:1;background:#2d3142;color:#e8eaf0;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;">← Accueil</button>
        <button onclick="loadSaisieMensurations()" style="flex:1;background:linear-gradient(135deg,#378ADD,#2260a8);color:#fff;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;">Saisir mensurations</button>
      </div>
      <button onclick="_mSubPage='autres-mens';setPage('mensurations');" style="width:100%;background:#2d3142;color:#e8eaf0;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:12px;">📏 Autres mensurations →</button>

      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;">
        <div style="flex:1;min-width:0;overflow:hidden;">
          <div style="font-size:10px;color:#8892a4;text-transform:uppercase;margin-bottom:4px;">Depuis</div>
          <input type="date" id="mensDateDebut" value="${_mDateDebut}"
            style="box-sizing:border-box;display:block;width:0;min-width:100%;padding:5px 2px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;"
            onchange="onMensFiltre()">
        </div>
        <div style="flex:1;min-width:0;overflow:hidden;">
          <div style="font-size:10px;color:#8892a4;text-transform:uppercase;margin-bottom:4px;">Jusqu'au</div>
          <input type="date" id="mensDateFin" value="${_mDateFin}"
            style="box-sizing:border-box;display:block;width:0;min-width:100%;padding:5px 2px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;"
            onchange="onMensFiltre()">
        </div>
        <button onclick="onMensTout()" id="btnToutePeriode"
          style="flex:0 0 auto;white-space:nowrap;box-sizing:border-box;background:#2d3142;border:none;border-radius:8px;color:${_mDateDebut ? '#8892a4' : '#378ADD'};padding:9px 10px;font-size:12px;font-weight:600;cursor:pointer;">
          Toute la période
        </button>
      </div>

      ${statsHtml}
      <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:10px;">Historique</div>${histRows}</div>
    </div>
    ${renderNavBar('mensurations')}
  </div>`;
}

function renderSaisieList() { return renderSaisieListSupabase(); }

function renderSaisieListSupabase() {
  const today = isoDate(new Date());
  const rows = _mReleves.slice().reverse().map(r => `
    <div class="list-item" onclick="ouvrirSaisieMensurationSupabase('${r.date}')">
      <div class="list-text">
        <div class="list-title">${_mAfficherDate(r.date)}</div>
        <div class="list-sub">${r.poids ? r.poids + ' kg' : 'Poids non renseigné'}${r.taille ? ' · ' + r.taille + ' cm' : ''}</div>
      </div>
      <div class="list-arrow">›</div>
    </div>`).join('');

  return `<div id="app">
    ${renderHeader('Mensurations', 'Saisir', false)}
    <div class="page">
      <div class="card">
        <div style="font-size:14px;font-weight:600;margin-bottom:10px;">Nouvelle saisie</div>
        <input type="date" id="nouvelleDateMens" value="${today}"
          class="bilan-input" style="margin-bottom:10px;font-size:16px;">
        <button class="btn-blue" onclick="creerSaisieMensurationSupabase()" style="width:100%;">+ Créer cette saisie</button>
      </div>
      ${_mReleves.length ? `<div class="section-title" style="color:var(--muted);">Saisies existantes</div><div class="card">${rows}</div>` : ''}
      <button class="btn-secondary" onclick="loadMensurations()">← Retour</button>
    </div>
    ${renderNavBar('mensurations')}
  </div>`;
}

function renderSaisieForm() { return renderSaisieFormSupabase(); }

function renderSaisieFormSupabase() {
  const d = _mFormData;
  if (!d) return renderSaisieListSupabase();

  const numInput = (label, field, unit) => {
    const val = d[field] !== null && d[field] !== undefined ? d[field] : '';
    return `<div style="margin-bottom:12px;">
      <div class="field-label">${label} (${unit})</div>
      <input type="number" inputmode="decimal" step="0.1" value="${val}" placeholder="—"
        class="bilan-input" style="font-size:16px;"
        onchange="sauverMensurationSupa('${field}', parseFloat(this.value)||null)">
    </div>`;
  };

  return `<div id="app">
    ${renderHeader('Mensurations', _mAfficherDate(d.date), false)}
    <div class="page">
      <div class="card">
        ${numInput('POIDS', 'poids', 'kg')}
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--muted);">Mensurations (cm)</div>
        ${numInput('Tour de taille', 'taille', 'cm')}
        ${numInput('Fessiers', 'fessiers', 'cm')}
        ${numInput('Cuisses', 'cuisses', 'cm')}
        ${numInput('Mollets', 'mollets', 'cm')}
        ${numInput('Poitrine', 'poitrine', 'cm')}
        ${numInput('Épaules', 'epaules', 'cm')}
        ${numInput('Bras', 'bras', 'cm')}
      </div>
      <button class="btn-secondary" onclick="loadSaisieMensurationsSupabase()">← Toutes les saisies</button>
    </div>
    ${renderNavBar('mensurations')}
  </div>`;
}

// ── Interactions ──────────────────────────────────────────────────────

function onMensFiltre() {
  _mDateDebut = document.getElementById('mensDateDebut').value;
  _mDateFin   = document.getElementById('mensDateFin').value;
  try { localStorage.setItem('mensDateDebut', _mDateDebut); localStorage.setItem('mensDateFin', _mDateFin); } catch(e) {}
  setPage('mensurations');
}

function onMensTout() {
  _mDateDebut = '';
  try { localStorage.setItem('mensDateDebut', ''); } catch(e) {}
  setPage('mensurations');
}

async function sauverMensurationSupa(field, value) {
  if (!_mFormData || !_mFormData.date) return;
  _mFormData[field] = value;
  const f = _mFormData;
  const nn = v => v !== null && v !== undefined ? v : null;
  const body = {
    client_id: S.client,
    date:     f.date,
    poids:    nn(f.poids),
    mesure:   nn(f.taille),
    fessiers: nn(f.fessiers),
    cuisses:  nn(f.cuisses),
    mollets:  nn(f.mollets),
    poitrine: nn(f.poitrine),
    epaules:  nn(f.epaules),
    bras:     nn(f.bras),
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/mensurations?on_conflict=client_id,date`, {
      method: 'POST',
      headers: supaHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }),
      body: JSON.stringify(body)
    });
    if (!res.ok) return;
    const updated = { ...body, taille: f.taille, phase: f.phase || '' };
    const idx = _mReleves.findIndex(r => r.date === f.date);
    if (idx >= 0) _mReleves[idx] = updated;
    else { _mReleves.push(updated); _mReleves.sort((a, b) => a.date.localeCompare(b.date)); }
  } catch(e) {}
}

// ── Helpers ───────────────────────────────────────────────────────────

function filtrerReleves(releves, debut, fin) {
  let r = releves || [];
  if (debut) {
    const d0 = new Date(debut);
    r = r.filter(x => {
      const iso = _mToISO(x.date);
      return !iso || new Date(iso) >= d0;
    });
  }
  if (fin) {
    const d1 = new Date(fin);
    r = r.filter(x => {
      const iso = _mToISO(x.date);
      return !iso || new Date(iso) <= d1;
    });
  }
  return r;
}

function _mToISO(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr; // déjà ISO
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseDateFR(str) {
  const m = (str+'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(+m[3], +m[2]-1, +m[1]) : null;
}

function isoDate(d) {
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}

// _mChart2Keys : Set des mensurations actives — plusieurs pills peuvent être sélectionnées
// à la fois pour superposer leurs courbes sur le même graphique (_buildMensChart accepte
// déjà keys/colors/labels en tableaux).
function _renderMensChart2Section(releves) {
  const actives = _M_COLS.filter(k => _mChart2Keys.has(k));
  const pills = _M_COLS.map((k, i) => `<button onclick="_toggleMChart2('${k}')"
    style="padding:3px 11px;border-radius:99px;border:1px solid ${_mChart2Keys.has(k)?_M_COLORS[i]:'var(--border)'};background:${_mChart2Keys.has(k)?_M_COLORS[i]+'22':'transparent'};color:${_mChart2Keys.has(k)?_M_COLORS[i]:'var(--muted)'};font-size:11px;font-weight:${_mChart2Keys.has(k)?'700':'400'};cursor:pointer;transition:all .15s;">${_M_LABELS[i]}</button>`).join('');
  const colors = actives.map(k => _M_COLORS[_M_COLS.indexOf(k)]);
  const labels = actives.map(k => _M_LABELS[_M_COLS.indexOf(k)]);
  // _buildMensChart renvoie '' (silencieusement) si la/les colonnes actives n'ont pas assez
  // de valeurs numériques — même quand releves.length>=2, ex: le client n'a rempli que
  // "cuisses" et jamais "fessiers" (pill par défaut). Sans ce filet, la carte reste vide sans
  // aucun message.
  const chartHtml = (actives.length && releves.length >= 2)
    ? _buildMensChart('m_c2_' + actives.join('_'), releves, actives, colors, labels, ' cm')
    : '';
  const chart = chartHtml || '<div style="font-size:13px;color:var(--muted);text-align:center;padding:20px;">Pas assez de données pour ' + (actives.length ? actives.map(k=>_M_LABELS[_M_COLS.indexOf(k)]).join('/') : 'cette sélection') + '.</div>';
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">${pills}</div><div id="mensChart2">${chart}</div>
    <div style="font-size:13px;font-weight:600;margin:16px 0 8px;">Historique</div>
    <div id="mensChart2Histo">${_renderMensAutresHistorique(releves, actives)}</div>`;
}

function _renderMensAutresHistorique(releves, actives) {
  if (!actives.length) return '<div style="font-size:13px;color:var(--muted);text-align:center;padding:12px;">Sélectionne une mensuration.</div>';
  const rows = (releves || []).slice().reverse()
    .filter(r => actives.some(k => { const v = parseFloat(r[k]); return !isNaN(v) && v > 0; }));
  if (!rows.length) return '<div style="font-size:13px;color:var(--muted);text-align:center;padding:12px;">Aucune donnée pour cette sélection.</div>';
  return rows.map(r => {
    const vals = actives.map(k => {
      const v = parseFloat(r[k]);
      if (isNaN(v) || v <= 0) return null;
      const i = _M_COLS.indexOf(k);
      return `<span style="color:${_M_COLORS[i]};font-weight:600;">${_M_LABELS[i]} ${v} cm</span>`;
    }).filter(Boolean).join(' · ');
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;">
      <div style="font-size:13px;color:var(--muted);flex-shrink:0;">${_mAfficherDate(r.date)}</div>
      <div style="font-size:12px;text-align:right;">${vals}</div>
    </div>`;
  }).join('');
}

// Choisit comme pill par défaut la première mensuration qui a réellement au moins 2 valeurs
// numériques, plutôt que de figer 'fessiers' même quand le client n'a jamais rempli ce champ.
function _mChart2KeyParDefaut(releves) {
  for (const k of _M_COLS) {
    const n = (releves||[]).filter(r => { const v = parseFloat(r[k]); return !isNaN(v) && v > 0; }).length;
    if (n >= 2) return k;
  }
  return _M_COLS[0];
}

function _mChart2ADesDonnees(k, releves) {
  return (releves||[]).filter(r => { const v = parseFloat(r[k]); return !isNaN(v) && v > 0; }).length >= 2;
}

function renderAutresMens() {
  // Si la sélection actuelle (par défaut 'fessiers') n'a aucune donnée exploitable alors
  // qu'une autre mensuration en a, bascule automatiquement dessus plutôt que d'afficher
  // une carte vide sans explication.
  if (![..._mChart2Keys].some(k => _mChart2ADesDonnees(k, _mReleves))) {
    _mChart2Keys = new Set([_mChart2KeyParDefaut(_mReleves)]);
  }
  return `<div id="app">
    ${renderHeader('Autres mensurations', 'Mensurations', false)}
    <div class="page">
      <button onclick="_mSubPage='historique';setPage('mensurations');" style="width:100%;background:#2d3142;color:#e8eaf0;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:12px;">← Retour</button>
      <div class="card" id="mensChart2Wrap">${_renderMensChart2Section(_mReleves)}</div>
    </div>
    ${renderNavBar('mensurations')}
  </div>`;
}

function _toggleMChart2(key) {
  _mChart2Keys = new Set([key]);
  const el = document.getElementById('mensChart2Wrap');
  if (el) el.innerHTML = _renderMensChart2Section(_mReleves);
}

function _buildMensChart(id, rows, keys, colors, labels, unit) {
  const W=560,H=180,PL=44,PR=14,PT=16,PB=34,cw=W-PL-PR,ch=H-PT-PB;
  const allVals=keys.flatMap(k=>rows.map(r=>parseFloat(r[k])).filter(v=>!isNaN(v)&&v>0));
  if(allVals.length<2) return '';
  const rng=Math.max(...allVals)-Math.min(...allVals), pad=rng<2?1:Math.ceil(rng*0.1);
  const yMin=Math.floor(Math.min(...allVals)-pad), yMax=Math.ceil(Math.max(...allVals)+pad);
  const n=rows.length;
  const xS=i=>+(PL+(i/(n-1||1))*cw).toFixed(2);
  const yS=v=>+(PT+ch-((v-yMin)/((yMax-yMin)||1))*ch).toFixed(2);
  const xs=rows.map((_,i)=>xS(i));
  window._mensCharts[id]={rows,keys,colors,labels,xs,W,H,PL,PT,ch,unit:unit||''};
  const defs=keys.map((k,ki)=>`<linearGradient id="${id}_g${ki}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${colors[ki]}" stop-opacity="0.18"/>
    <stop offset="100%" stop-color="${colors[ki]}" stop-opacity="0"/>
  </linearGradient>`).join('');
  const yGrid=[0.25,0.5,0.75].map(f=>{const v=yMin+f*(yMax-yMin);
    return `<line x1="${PL}" y1="${yS(v)}" x2="${PL+cw}" y2="${yS(v)}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3 3"/>
      <text x="${PL-5}" y="${+(yS(v)+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">${Math.round(v)}</text>`;
  }).join('');
  const maxL=Math.min(6,n), stepL=Math.floor((n-1)/(maxL-1||1));
  const xLabels=Array.from({length:maxL},(_,i)=>{
    const idx=i===maxL-1?n-1:i*stepL, d=(rows[idx].date||'').split('-');
    return `<text x="${xs[idx]}" y="${H-4}" text-anchor="middle" font-size="9" fill="var(--muted)">${d.length===3?d[2]+'/'+d[1]:''}</text>`;
  }).join('');
  const areas=keys.map((k,ki)=>{
    const pts=rows.map((r,i)=>{const v=parseFloat(r[k]);return isNaN(v)||v<=0?null:[xs[i],yS(v)];}).filter(Boolean);
    if(pts.length<2) return '';
    return `<path d="${pts.map((p,i)=>(i===0?'M':'L')+p[0]+','+p[1]).join(' ')} L${pts[pts.length-1][0]},${PT+ch} L${pts[0][0]},${PT+ch} Z" fill="url(#${id}_g${ki})"/>`;
  }).join('');
  const lines=keys.map((k,ki)=>{
    const pts=rows.map((r,i)=>{const v=parseFloat(r[k]);return isNaN(v)||v<=0?null:xs[i]+','+yS(v);}).filter(Boolean);
    return pts.length>=2?`<polyline points="${pts.join(' ')}" fill="none" stroke="${colors[ki]}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>`:'';
  }).join('');
  const dots=keys.map((k,ki)=>rows.map((r,i)=>{const v=parseFloat(r[k]);
    return isNaN(v)||v<=0?'':`<circle id="${id}_d${ki}_${i}" cx="${xs[i]}" cy="${yS(v)}" r="1.8" fill="${colors[ki]}" stroke="var(--bg2)" stroke-width="1.2"/>`;
  }).join('')).join('');
  const axes=`<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+ch}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${PL}" y1="${PT+ch}" x2="${PL+cw}" y2="${PT+ch}" stroke="var(--border)" stroke-width="1"/>`;
  const vline=`<line id="${id}_vl" x1="${xs[0]}" y1="${PT}" x2="${xs[0]}" y2="${PT+ch}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 2" opacity="0.5" display="none"/>`;
  const ov=`<rect x="${PL}" y="${PT}" width="${cw}" height="${ch}" fill="transparent" onmousemove="_mensHover(event,'${id}')" onmouseleave="_mensHoverOut('${id}')"/>`;
  const tip=`<div id="${id}_tip" style="display:none;position:absolute;top:10px;left:10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:11px;color:var(--text);pointer-events:none;z-index:10;box-shadow:0 2px 10px rgba(0,0,0,.3);white-space:nowrap;"></div>`;
  const legend=`<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--muted);margin-top:8px;margin-bottom:4px;">
    ${keys.map((k,i)=>`<span><span style="color:${colors[i]};margin-right:3px;">●</span>${labels[i]}</span>`).join('')}
  </div>`;
  return `<div style="position:relative;">${tip}<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible;" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${axes}${yGrid}${xLabels}${areas}${lines}${dots}${vline}${ov}</svg></div>${legend}`;
}

function _mensHover(evt, cid) {
  const d=window._mensCharts[cid]; if(!d) return;
  const svg=evt.currentTarget.closest('svg');
  const rect=svg.getBoundingClientRect();
  const mx=(evt.clientX-rect.left)*(d.W/rect.width);
  let ni=0, minDist=Infinity;
  d.xs.forEach((x,i)=>{const dist=Math.abs(x-mx);if(dist<minDist){minDist=dist;ni=i;}});
  const vl=document.getElementById(cid+'_vl');
  if(vl){vl.setAttribute('x1',d.xs[ni]);vl.setAttribute('x2',d.xs[ni]);vl.removeAttribute('display');}
  const row=d.rows[ni];
  const dateStr=(row.date||'').split('-').reverse().join('/');
  const vals=d.keys.map((k,ki)=>{
    const v=parseFloat(row[k]); if(isNaN(v)||v<=0) return '';
    return `<div style="margin-top:3px;"><span style="color:${d.colors[ki]};margin-right:4px;">●</span>${d.labels[ki]} : <strong>${v}</strong>${d.unit}</div>`;
  }).filter(Boolean).join('');
  const tip=document.getElementById(cid+'_tip');
  if(tip){
    tip.innerHTML=`<div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:3px;">${dateStr}</div>${vals}`;
    const xRatio=rect.width/d.W;
    let lx=d.xs[ni]*xRatio+14;
    if(lx+160>rect.width) lx=d.xs[ni]*xRatio-170;
    tip.style.left=lx+'px'; tip.style.display='block';
  }
}

function _mensHoverOut(cid) {
  const vl=document.getElementById(cid+'_vl'); if(vl) vl.setAttribute('display','none');
  const tip=document.getElementById(cid+'_tip'); if(tip) tip.style.display='none';
}

function miniGraphe(valeurs, couleur, unite) {
  const pts = [];
  valeurs.forEach((v, i) => { if (v !== null && v !== '' && !isNaN(v)) pts.push({ i, v: parseFloat(v) }); });
  if (pts.length < 2) return '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px;">Pas assez de données</div>';
  const vals = pts.map(p => p.v);
  const min = Math.min(...vals), max = Math.max(...vals), range = (max - min) || 1;
  const W = 300, H = 80, pad = 12, n = valeurs.length;
  const px = i => pad + (n > 1 ? (i / (n-1)) : 0.5) * (W - 2*pad);
  const py = v => H - pad - ((v - min) / range) * (H - 2*pad);
  let d = '', circles = '';
  pts.forEach((p, k) => {
    d += (k === 0 ? 'M' : 'L') + px(p.i).toFixed(1) + ' ' + py(p.v).toFixed(1) + ' ';
    circles += `<circle cx="${px(p.i).toFixed(1)}" cy="${py(p.v).toFixed(1)}" r="3" fill="${couleur}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;">
    <path d="${d}" fill="none" stroke="${couleur}" stroke-width="2"/>${circles}
  </svg>
  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);">
    <span>${pts[0].v}${unite}</span><span>${pts[pts.length-1].v}${unite}</span>
  </div>`;
}
