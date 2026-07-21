// ── Mensurations page ─────────────────────────────────────────────────

let _mSubPage  = 'historique'; // 'historique' | 'saisie-list' | 'saisie-form'
let _mReleves  = [];
let _mEntrees  = [];
let _mFormData = null;
let _mDateDebut = '';
let _mDateFin   = '';

async function loadMensurations() {
  if (_pf.mens) {
    _mReleves = _pf.mens;
    _pf.mens  = null;
    _mSubPage = 'historique';
    try {
      _mDateDebut = localStorage.getItem('mensDateDebut') || '';
      const today = new Date();
      _mDateFin = localStorage.getItem('mensDateFin') || isoDate(today);
    } catch(e) {}
    setPage('mensurations');
    schedulerPrechargement();
    return;
  }
  setPage('mens-loading');
  try {
    _mReleves = await api('chargerMensurations');
    _mSubPage = 'historique';
    try {
      _mDateDebut = localStorage.getItem('mensDateDebut') || '';
      const today = new Date();
      _mDateFin = localStorage.getItem('mensDateFin') || isoDate(today);
    } catch(e) {}
    setPage('mensurations');
    schedulerPrechargement();
  } catch(e) { setPage('home'); }
}

async function loadSaisieMensurations() {
  setPage('mens-loading');
  try {
    _mEntrees = await api('listerSaisiesMensurations');
    _mSubPage = 'saisie-list';
    setPage('mensurations');
  } catch(e) { setPage('mensurations'); }
}

async function creerSaisieMensuration() {
  const dateVal = document.getElementById('nouvelleDateMens').value;
  if (!dateVal) return;
  const dateFR = dateVal.split('-').reverse().join('/');
  const existante = _mEntrees.find(e => e.date === dateFR);
  if (existante) { ouvrirSaisieMensuration(existante.ligne); return; }
  setPage('mens-loading');
  try {
    const ligne = await api('nouvelleSaisieMensuration', { dateStr: dateVal });
    ouvrirSaisieMensuration(ligne);
  } catch(e) { setPage('mensurations'); }
}

async function ouvrirSaisieMensuration(ligne) {
  setPage('mens-loading');
  try {
    _mFormData = await api('chargerSaisieMensuration', { ligne });
    _mSubPage  = 'saisie-form';
    setPage('mensurations');
  } catch(e) { setPage('mensurations'); }
}

// ── Render ────────────────────────────────────────────────────────────

function renderMensurationsPage() {
  if (S.page === 'mens-loading') {
    return `<div id="app">${renderHeader('Mes Mensurations','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('mensurations')}</div>`;
  }
  if (_mSubPage === 'saisie-list') return renderSaisieList();
  if (_mSubPage === 'saisie-form') return renderSaisieForm();
  return renderHistorique();
}

function renderHistorique() {
  const releves = filtrerReleves(_mReleves, _mDateDebut, _mDateFin);

  const poidsVals = releves.map(r => r.poids);
  const tailleVals = releves.map(r => r.taille);
  const poidsPts  = poidsVals.filter(v => v !== null && v !== '' && !isNaN(v)).map(Number);
  const taillePts = tailleVals.filter(v => v !== null && v !== '' && !isNaN(v)).map(Number);

  const poidsActuel = poidsPts.length ? poidsPts[poidsPts.length - 1] : null;
  const poidsDebut  = poidsPts.length ? poidsPts[0] : null;
  const varPoids    = poidsActuel !== null ? (poidsActuel - poidsDebut).toFixed(1) : null;

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
    ${poidsPts.length >= 2 ? `<div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#378ADD;">Évolution du poids</div>${miniGraphe(poidsVals,'#378ADD',' kg')}</div>` : ''}
    ${taillePts.length >= 2 ? `<div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#D85A30;">Tour de taille</div>${miniGraphe(tailleVals,'#D85A30',' cm')}</div>` : ''}
  ` : '';

  const histRows = releves.length ? releves.slice().reverse().map(r => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="font-size:13px;color:var(--muted);">${r.date}${r.phase ? ' · ' + r.phase : ''}</div>
      <div style="font-size:13px;">${r.poids ? r.poids + ' kg' : '—'}${r.taille ? ' · ' + r.taille + ' cm' : ''}</div>
    </div>`).join('')
    : '<div style="font-size:13px;color:var(--muted);text-align:center;padding:12px;">Aucune donnée sur cette période</div>';

  return `<div id="app">
    ${renderHeader('Mes Mensurations', 'Ma progression', false)}
    <div class="page">
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button onclick="loadHome()" style="flex:1;background:#2d3142;color:#e8eaf0;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;">← Accueil</button>
        <button onclick="loadSaisieMensurations()" style="flex:1;background:linear-gradient(135deg,#378ADD,#2260a8);color:#fff;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;">Saisir mensurations</button>
      </div>

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

function renderSaisieList() {
  const today = isoDate(new Date());
  const rows = _mEntrees.map(e => `
    <div class="list-item" onclick="ouvrirSaisieMensuration(${e.ligne})">
      <div class="list-text">
        <div class="list-title">${e.date}</div>
        <div class="list-sub">${e.poids ? e.poids + ' kg' : 'Poids non renseigné'}</div>
      </div>
      <div class="list-arrow">›</div>
    </div>`).join('');

  return `<div id="app">
    ${renderHeader('Mensurations', 'Saisir', false)}
    <div class="page">
      <div class="card">
        <div style="font-size:14px;font-weight:600;margin-bottom:10px;">Nouvelle saisie</div>
        <input type="date" id="nouvelleDateMens" value="${today}"
          class="bilan-input" style="margin-bottom:10px;">
        <button class="btn-blue" onclick="creerSaisieMensuration()" style="width:100%;">+ Créer cette saisie</button>
      </div>
      ${_mEntrees.length ? `<div class="section-title" style="color:var(--muted);">Saisies existantes</div><div class="card">${rows}</div>` : ''}
      <button class="btn-secondary" onclick="loadMensurations()">← Retour</button>
    </div>
    ${renderNavBar('mensurations')}
  </div>`;
}

function renderSaisieForm() {
  const d = _mFormData;
  if (!d) return renderSaisieList();

  function champ(label, col, val, unite) {
    return `<div style="margin-bottom:12px;">
      <div class="field-label">${label}${unite ? ' (' + unite + ')' : ''}</div>
      <input type="text" inputmode="decimal" value="${fmtFR(val)}" placeholder="—" class="bilan-input"
        onchange="sauverMensuration(${d.ligne}, ${col}, parsePoids(this.value))">
    </div>`;
  }

  return `<div id="app">
    ${renderHeader('Mensurations', d.date || '', false)}
    <div class="page">
      <div class="card">
        <div class="field-label">DATE</div>
        <input type="date" value="${d.date ? d.date.split('/').reverse().join('-') : ''}" class="bilan-input" style="margin-bottom:0;"
          onchange="sauverDateMensuration(${d.ligne}, this.value)">
      </div>
      <div class="card">
        ${champ('Poids', 5, d.poids, 'kg')}
        ${champ('Tour de taille', 6, d.taille, 'cm')}
        ${champ('Fessiers', 7, d.fessiers, 'cm')}
        ${champ('Cuisses', 8, d.cuisses, 'cm')}
        ${champ('Mollets', 9, d.mollets, 'cm')}
        ${champ('Poitrine', 10, d.poitrine, 'cm')}
        ${champ('Épaules', 11, d.epaules, 'cm')}
        ${champ('Bras', 12, d.bras, 'cm')}
      </div>
      <button class="btn-secondary" onclick="loadSaisieMensurations()">← Toutes les saisies</button>
      <button class="btn-green" onclick="loadBilan()" style="margin-top:8px;">📋 Aller au bilan en cours</button>
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

function sauverMensuration(ligne, col, valeur) {
  api('enregistrerValeur', { nomFeuille: 'Mensurations', ligne, colonne: col, valeur }).catch(() => {});
}

function sauverDateMensuration(ligne, dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return;
  api('enregistrerValeur', { nomFeuille: 'Mensurations', ligne, colonne: 4, valeur: parts[2]+'/'+parts[1]+'/'+parts[0] }).catch(() => {});
}

// ── Helpers ───────────────────────────────────────────────────────────

function filtrerReleves(releves, debut, fin) {
  let r = releves || [];
  if (debut) { const d0 = new Date(debut); r = r.filter(x => { const d = parseDateFR(x.date); return !d || d >= d0; }); }
  if (fin)   { const d1 = new Date(fin);   r = r.filter(x => { const d = parseDateFR(x.date); return !d || d <= d1; }); }
  return r;
}

function parseDateFR(str) {
  const m = (str+'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(+m[3], +m[2]-1, +m[1]) : null;
}

function isoDate(d) {
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
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
