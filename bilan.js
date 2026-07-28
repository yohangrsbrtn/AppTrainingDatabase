// ── Bilan page ────────────────────────────────────────────────────────

let _bilanData  = null;
let _bilanNotes = {};
let _prevMeta   = null;
let _bilanMode  = 'current'; // 'current' | 'previous' | 'history-list' | 'history-detail'
let _bilanId    = null; // Supabase only

// ── Chargement ────────────────────────────────────────────────────────

function _appliquerBilan(data) {
  _prevMeta  = data.prevLigneTitre ? {
    ligneTitre:   data.prevLigneTitre,
    semaineLabel: data.prevSemaineLabel,
    dejaValide:   data.prevDejaValide,
    targetSunday: data.prevTargetSunday
  } : null;
  _bilanMode = 'current';
  _bilanData = data;
}

async function loadBilan() {
  if (isSupabase()) { await _supaLoadBilan(); return; }
  if (_pf.bilan) {
    _appliquerBilan(_pf.bilan);
    _pf.bilan = null;
    setPage('bilan');
    schedulerPrechargement();
    return;
  }
  setPage('bilan-loading');
  try {
    const data = await apiEtendreBilan('chargerBilan');
    _appliquerBilan(data);
    setPage('bilan');
    schedulerPrechargement();
  } catch(e) { setPage('home'); }
}

async function loadBilanPrecedent() {
  if (isSupabase()) { await _supaLoadBilanPrecedent(); return; }
  if (!_prevMeta) return;
  setPage('bilan-loading');
  try {
    const data = await api('chargerBilanParLigne', { ligneTitre: _prevMeta.ligneTitre });
    data.semaineLabel = _prevMeta.semaineLabel;
    data.dejaValide   = _prevMeta.dejaValide;
    data.targetSunday = _prevMeta.targetSunday;
    _bilanData = data;
    _bilanMode = 'previous';
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

async function loadHistoriqueBilans() {
  if (isSupabase()) { await _supaLoadHistorique(); return; }
  setPage('bilan-loading');
  try {
    S.data.historiqueBilans = await api('chargerHistoriqueBilans');
    _bilanMode = 'history-list';
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

async function loadBilanHistorique(ligneTitre) {
  setPage('bilan-loading');
  try {
    _bilanData = await api('chargerBilanParLigne', { ligneTitre });
    _bilanMode = 'history-detail';
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

// ── Supabase : chargement ─────────────────────────────────────────────

async function _supaLoadBilan() {
  setPage('bilan-loading');
  try {
    const clientId = getClient();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bilans?client_id=eq.${clientId}&envoye_coach=eq.false&order=created_at.desc&limit=1`,
      { headers: supaHeaders() }
    );
    const arr = await res.json();
    if (arr && arr.length > 0) {
      _bilanData = _normaliserBilanSupa(arr[0]);
      _bilanId   = arr[0].id;
    } else {
      _bilanData = await _supaCreerNouveauBilan(clientId);
      _bilanId   = _bilanData.id;
    }
    // Chercher le bilan précédent (dernier envoyé)
    const prevRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bilans?client_id=eq.${clientId}&envoye_coach=eq.true&order=created_at.desc&limit=1`,
      { headers: supaHeaders() }
    );
    const prevArr = await prevRes.json();
    _prevMeta = (prevArr && prevArr.length > 0) ? { id: prevArr[0].id, semaineLabel: prevArr[0].semaine_label } : null;
    _bilanMode = 'current';
    setPage('bilan');
  } catch(e) { setPage('home'); }
}

async function _supaLoadBilanPrecedent() {
  if (!_prevMeta) return;
  setPage('bilan-loading');
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bilans?id=eq.${_prevMeta.id}`,
      { headers: supaHeaders() }
    );
    const arr = await res.json();
    if (arr && arr.length > 0) {
      _bilanData = _normaliserBilanSupa(arr[0]);
      _bilanId   = arr[0].id;
      _bilanMode = 'previous';
    }
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

async function _supaLoadHistorique() {
  setPage('bilan-loading');
  try {
    const clientId = getClient();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bilans?client_id=eq.${clientId}&envoye_coach=eq.true&order=created_at.desc`,
      { headers: supaHeaders() }
    );
    S.data.historiqueBilans = (await res.json()).map(row => ({
      id:           row.id,
      semaine:      row.semaine_label,
      date:         row.date_validation || row.created_at,
      dejaEnvoye:   true,
    }));
    _bilanMode = 'history-list';
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

async function _supaLoadBilanHistoriqueById(id) {
  setPage('bilan-loading');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${id}`, { headers: supaHeaders() });
    const arr = await res.json();
    if (arr && arr.length > 0) {
      _bilanData = _normaliserBilanSupa(arr[0]);
      _bilanId   = arr[0].id;
      _bilanMode = 'history-detail';
    }
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

// ── Supabase : normalisation ──────────────────────────────────────────

const _JOURS_NOMS = ['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];

function _normaliserBilanSupa(row) {
  const jours = _JOURS_NOMS.map((nom, idx) => {
    const j = (row.jours || [])[idx] || {};
    return { idx, nom: j.nom || nom, poids: j.poids ?? '', eau: j.eau ?? '', steps: j.steps ?? '', diete: !!j.diete, training: !!j.training, cardio: !!j.cardio };
  });
  const repas = (row.repas_eval || []).map((r, idx) => ({
    idx, num: r.num || (idx + 1), adhesion: r.adhesion || 0, digestion: r.digestion || 0, appetit: r.appetit || 0,
  }));
  return {
    id:                 row.id,
    semaineLabel:       row.semaine_label || 'Semaine en cours',
    jours,
    repas,
    commentaireAlim:    row.commentaire_alim    || '',
    commentaireJour:    row.commentaire_jour    || '',
    commentaireActivite:row.commentaire_activite|| '',
    dejaValide:         !!row.date_validation,
    dateValidation:     row.date_validation,
    dejaEnvoye:         !!row.envoye_coach,
    seancesObjectif:    0,
  };
}

async function _supaCreerNouveauBilan(clientId) {
  let nbRepas = 4;
  try {
    const dietes = await fetch(
      `${SUPABASE_URL}/rest/v1/client_dietes?client_id=eq.${clientId}&actif=eq.true&limit=1`,
      { headers: supaHeaders() }
    ).then(r => r.json());
    if (dietes && dietes.length > 0) {
      const nom = encodeURIComponent(dietes[0].nom);
      const tmpl = await fetch(
        `${SUPABASE_URL}/rest/v1/diete_templates?nom=eq.${nom}&select=repas(id,variante_index)&order=id.desc&limit=1`,
        { headers: supaHeaders() }
      ).then(r => r.json());
      if (tmpl && tmpl.length > 0) {
        const n = (tmpl[0].repas || []).filter(r => r.variante_index === 0).length;
        if (n > 0) nbRepas = n;
      }
    }
  } catch(e) {}

  const jours    = _JOURS_NOMS.map(nom => ({ nom, poids: null, eau: null, steps: null, diete: false, training: false, cardio: false }));
  const repasEval = Array.from({ length: nbRepas }, (_, i) => ({ num: i + 1, adhesion: 0, digestion: 0, appetit: 0 }));
  const body = {
    client_id:    clientId,
    semaine_label: _supaGetSemaineLabel(),
    jours,
    repas_eval:   repasEval,
    envoye_coach: false,
    coach_traite: false,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bilans`, {
    method: 'POST',
    headers: supaHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const arr = await res.json();
  const row = Array.isArray(arr) ? arr[0] : arr;
  return _normaliserBilanSupa(row);
}

function _supaGetSemaineLabel() {
  const now  = new Date();
  const day  = now.getDay();
  const diff = (day === 0) ? -6 : 1 - day;
  const lun  = new Date(now); lun.setDate(now.getDate() + diff);
  const dim  = new Date(lun); dim.setDate(lun.getDate() + 6);
  const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const fmt  = d => d.getDate() + ' ' + MOIS[d.getMonth()];
  return 'Du ' + fmt(lun) + ' au ' + fmt(dim);
}

// ── Supabase : sauvegarde ─────────────────────────────────────────────

async function _supaUpdateBilan(patch) {
  if (!_bilanId) return;
  await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${_bilanId}`, {
    method: 'PATCH',
    headers: supaHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
}

function sauverJourBilanSupa(jourIdx, field, value) {
  if (!_bilanData) return;
  _bilanData.jours[jourIdx][field] = value;
  _supaUpdateBilan({ jours: _bilanData.jours.map(j => ({ nom: j.nom, poids: j.poids || null, eau: j.eau || null, steps: j.steps || null, diete: j.diete, training: j.training, cardio: j.cardio })) }).catch(() => {});
}

function toggleJourBilanSupa(jourIdx, field, elemId) {
  if (!_bilanData) return;
  const el     = document.getElementById(elemId);
  const newVal = el.dataset.val !== 'true';
  el.dataset.val     = String(newVal);
  el.style.background = newVal ? '#1D9E75' : '#2d3142';
  const label = el.textContent.replace('✓', '').trim();
  el.textContent = (newVal ? '✓ ' : '') + label;
  sauverJourBilanSupa(jourIdx, field, newVal);
}

function noterRepasSupa(repasIdx, field, valeur, groupeId) {
  if (!_bilanData) return;
  _bilanData.repas[repasIdx][field] = valeur;
  _bilanNotes[groupeId] = valeur;
  const palette = _paletteNote(groupeId);
  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById(groupeId + '_' + i);
    if (btn) btn.style.cssText = 'flex:1;padding:8px 0;' + _styleNoteBtn(i, valeur, palette) + 'border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;';
  }
  _supaUpdateBilan({ repas_eval: _bilanData.repas.map(r => ({ num: r.num, adhesion: r.adhesion, digestion: r.digestion, appetit: r.appetit })) }).catch(() => {});
}

function sauverCommentaireBilanSupa(field, value) {
  if (!_bilanData) return;
  if (field === 'commentaire_alim')     _bilanData.commentaireAlim     = value;
  if (field === 'commentaire_jour')     _bilanData.commentaireJour     = value;
  if (field === 'commentaire_activite') _bilanData.commentaireActivite = value;
  _supaUpdateBilan({ [field]: value }).catch(() => {});
}

// ── Render ────────────────────────────────────────────────────────────

function renderBilanPage() {
  if (S.page === 'bilan-loading') {
    return `<div id="app">${renderHeader('Bilan','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('bilan')}</div>`;
  }
  if (isSupabase()) {
    if (_bilanMode === 'history-list')   return _renderHistoriqueListSupa();
    if (_bilanMode === 'history-detail') return _renderBilanDetailSupa(_bilanData, true);
    if (_bilanMode === 'previous')       return _renderBilanDetailSupa(_bilanData, false, true);
    if (!_bilanData) return `<div id="app">${renderHeader('Bilan','',false)}<div class="page"><div class="empty"><div class="empty-icon">📊</div><div class="empty-text">Aucun bilan disponible</div></div></div>${renderNavBar('bilan')}</div>`;
    return _renderBilanDetailSupa(_bilanData, false, false);
  }
  // GAS
  if (_bilanMode === 'history-list')   return renderHistoriqueList();
  if (_bilanMode === 'history-detail') return renderBilanDetail(_bilanData, true);
  if (_bilanMode === 'previous')       return renderBilanDetail(_bilanData, false, true);
  if (!_bilanData) return `<div id="app">${renderHeader('Bilan','',false)}<div class="page"><div class="empty"><div class="empty-icon">📊</div><div class="empty-text">Aucun bilan disponible</div></div></div>${renderNavBar('bilan')}</div>`;
  if (_bilanData.complet) return renderBilanComplet();
  return renderBilanDetail(_bilanData, false, false);
}

// ── Render Supabase ───────────────────────────────────────────────────

function _bilanWeekRange(dateStr) {
  if (!dateStr) return 'Bilan';
  const mois = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const daysFromMon = (d.getDay() + 6) % 7;
  const lundi = new Date(d); lundi.setDate(d.getDate() - daysFromMon);
  const dim   = new Date(lundi); dim.setDate(lundi.getDate() + 6);
  return `${lundi.getDate()} ${mois[lundi.getMonth()]} → ${dim.getDate()} ${mois[dim.getMonth()]}`;
}

function _renderHistoriqueListSupa() {
  const hist = S.data.historiqueBilans || [];
  const rows = hist.length === 0
    ? `<div class="empty"><div class="empty-text">Aucun bilan envoyé pour l'instant.</div></div>`
    : hist.map(b => `
      <div class="list-item" onclick="_supaLoadBilanHistoriqueById(${b.id})">
        <div class="list-icon">📋</div>
        <div class="list-text" style="flex:1;min-width:0;">
          <div class="list-title">${_bilanWeekRange(b.date)}</div>
        </div>
        <span style="font-size:11px;color:#1D9E75;font-weight:600;white-space:nowrap;flex-shrink:0;">✅ Envoyé</span>
        <div class="list-arrow">›</div>
      </div>`).join('');

  return `<div id="app">
    ${renderHeader('Historique', '', false)}
    <div class="page">
      <div class="card">${rows}</div>
      <button class="btn-secondary" onclick="loadBilan()">← Bilan en cours</button>
    </div>
    ${renderNavBar('bilan')}
  </div>`;
}

function _renderBilanDetailSupa(data, modeHistorique, isSemainePrecedente) {
  _bilanData  = data;
  _bilanNotes = {};
  (data.repas || []).forEach((r, idx) => {
    if (r.adhesion > 0) _bilanNotes['r'+idx+'_adh'] = r.adhesion;
    if (r.digestion > 0) _bilanNotes['r'+idx+'_dig'] = r.digestion;
    if (r.appetit > 0)  _bilanNotes['r'+idx+'_app'] = r.appetit;
  });

  const subtitle = isSemainePrecedente ? 'Semaine précédente' : (data.semaineLabel || 'Semaine en cours');
  let html = '';

  if (data.dejaEnvoye) {
    html += `<div class="bilan-banner">Bilan envoyé au coach — toujours modifiable</div>`;
  }
  if (isSemainePrecedente) {
    html += `<button class="btn-secondary" onclick="loadBilan()">← Semaine en cours</button>`;
  } else if (!modeHistorique) {
    html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()">📅 Historique des bilans</button>`;
  }

  // ── Alimentation
  html += `<div class="section-title" style="color:#378ADD;">🍽️ Alimentation</div>`;
  (data.repas || []).forEach((r) => {
    const ri  = r.idx;
    html += `<div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">Repas N°${r.num}</div>
      <div class="field-label">ADHÉSION</div>
      ${_renderNotesSupa(ri, 'adhesion', 'r'+ri+'_adh', r.adhesion)}
      <div class="field-label" style="margin-top:8px;">DIGESTION</div>
      ${_renderNotesSupa(ri, 'digestion', 'r'+ri+'_dig', r.digestion)}
      <div class="field-label" style="margin-top:8px;">APPÉTIT</div>
      <div style="font-size:10px;color:var(--muted);margin:1px 0 4px;">1 = très faim · 5 = repu, difficile de finir l'assiette</div>
      ${_renderNotesSupa(ri, 'appetit', 'r'+ri+'_app', r.appetit)}
    </div>`;
  });
  html += `<div class="card">
    <div class="field-label">COMMENTAIRE ALIMENTATION</div>
    <textarea class="bilan-textarea" placeholder="Commentaire global..."
      onchange="sauverCommentaireBilanSupa('commentaire_alim', this.value)"
    >${esc(data.commentaireAlim)}</textarea>
  </div>`;

  // ── Semaine
  html += `<div class="section-title" style="color:#1D9E75;">📅 Semaine</div>`;
  (data.jours || []).forEach(j => {
    html += `<div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">${j.nom}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div>
          <div class="field-label">POIDS (kg)</div>
          <input class="bilan-input" type="text" inputmode="decimal" value="${fmtFR(j.poids)}" placeholder="—"
            onchange="sauverJourBilanSupa(${j.idx}, 'poids', parsePoids(this.value))">
        </div>
        <div>
          <div class="field-label">EAU (L)</div>
          <input class="bilan-input" type="text" inputmode="decimal" value="${fmtFR(j.eau)}" placeholder="—"
            onchange="sauverJourBilanSupa(${j.idx}, 'eau', parseEau(this.value))">
        </div>
        <div>
          <div class="field-label">STEPS</div>
          <input class="bilan-input" id="step_${j.idx}" type="text" inputmode="numeric" value="${fmtFR(j.steps)}" placeholder="0"
            onchange="sauverJourBilanSupa(${j.idx}, 'steps', parseSteps(this.value))">
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        ${_renderToggleSupa(j.idx, 'diete',    'tog_diet_'+j.idx,   j.diete,    'Diète')}
        ${_renderToggleSupa(j.idx, 'training', 'tog_train_'+j.idx,  j.training, 'Training')}
        ${_renderToggleSupa(j.idx, 'cardio',   'tog_cardio_'+j.idx, j.cardio,   'Cardio')}
      </div>
    </div>`;
  });

  html += `<div class="card">
    <div class="field-label">COMMENTAIRE SEMAINE</div>
    <textarea class="bilan-textarea" placeholder="Commentaire global..."
      onchange="sauverCommentaireBilanSupa('commentaire_jour', this.value)"
    >${esc(data.commentaireJour)}</textarea>
    <div class="field-label" style="margin-top:10px;">COMMENTAIRE ACTIVITÉ</div>
    <textarea class="bilan-textarea" placeholder="Commentaire activité..."
      onchange="sauverCommentaireBilanSupa('commentaire_activite', this.value)"
    >${esc(data.commentaireActivite)}</textarea>
  </div>`;

  // ── Boutons bas
  if (modeHistorique) {
    html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()">📅 Historique des bilans</button>`;
  } else {
    const deja = !!data.dejaEnvoye;
    html += `<button id="btn-envoyer" onclick="_doEnvoyerBilanSupa(this)"
      ${deja ? 'disabled' : ''}
      class="${deja ? 'btn-disabled' : 'btn-blue'}" style="width:100%;margin-top:4px;">
      ${deja ? '✅ Envoyé au coach' : '📤 Envoyer au coach'}
    </button>`;
    html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()" style="margin-top:8px;">📅 Historique des bilans</button>`;
    if (isSemainePrecedente) {
      html += `<button class="btn-secondary" onclick="loadBilan()" style="margin-top:8px;">← Semaine en cours</button>`;
    }
  }

  return `<div id="app">
    ${renderHeader('Bilan', subtitle, false)}
    <div class="page">${html}</div>
    ${renderNavBar('bilan')}
  </div>`;
}

function _renderNotesSupa(repasIdx, field, groupeId, valActuelle) {
  const palette = _paletteNote(groupeId);
  let h = `<div style="display:flex;gap:4px;margin:3px 0;">`;
  for (let i = 1; i <= 5; i++) {
    h += `<button id="${groupeId}_${i}" onclick="noterRepasSupa(${repasIdx},'${field}',${i},'${groupeId}')"
      style="flex:1;padding:8px 0;${_styleNoteBtn(i, valActuelle, palette)}border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">${i}</button>`;
  }
  return h + '</div>';
}

function _renderToggleSupa(jourIdx, field, elemId, val, label) {
  const on = val === true;
  return `<button id="${elemId}" data-val="${on}" onclick="toggleJourBilanSupa(${jourIdx},'${field}','${elemId}')"
    style="flex:1;padding:10px 6px;background:${on?'#1D9E75':'#2d3142'};border:none;border-radius:8px;color:#e8eaf0;font-size:12px;font-weight:600;cursor:pointer;">
    ${on?'✓ ':''}${label}</button>`;
}

// ── Supabase : envoi ──────────────────────────────────────────────────

async function _doEnvoyerBilanSupa(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  try {
    _ouvrirRecapBilanSupa();
    if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer au coach'; }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer au coach'; }
    showToast('Erreur : ' + e.message, '#c0392b');
  }
}

function _ouvrirRecapBilanSupa() {
  const data = _bilanData;
  if (!data) { _validerEtEnvoyerSupa(); return; }

  let joursOk = 0, joursTraining = 0, totalSteps = 0;
  (data.jours || []).forEach(j => {
    const btnD = document.getElementById('tog_diet_'  + j.idx);
    const btnT = document.getElementById('tog_train_' + j.idx);
    const inp  = document.getElementById('step_'      + j.idx);
    if (btnD && btnD.dataset.val === 'true') joursOk++;
    if (btnT && btnT.dataset.val === 'true') joursTraining++;
    if (inp) { const v = parseSteps(inp.value); if (v && Number(v) > 0) totalSteps += Number(v); }
  });
  const avgSteps = totalSteps > 0 ? Math.round(totalSteps / 7) : 0;
  const hasNote  = _bilanNotes && Object.values(_bilanNotes).some(v => v > 0);
  const fmtNum   = n => n >= 1000 ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : Math.round(n).toString();
  const statRow  = (label, val, color) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #2d3142;"><span style="font-size:14px;color:#8892a4;">${label}</span><span style="font-size:15px;font-weight:700;color:${color};">${val}</span></div>`;
  const dietColor = joursOk >= 6 ? '#1D9E75' : joursOk >= 4 ? '#f0a500' : '#e05555';
  const trainColor = joursTraining >= 3 ? '#1D9E75' : '#f0a500';
  const statsHtml  = (avgSteps > 0 ? statRow('Moyenne steps/jour', fmtNum(avgSteps), '#e8eaf0') : '')
    + statRow('Diète tenue', joursOk + '/7', dietColor)
    + statRow('Séances training', String(joursTraining), trainColor);
  const noteWarn = !hasNote
    ? `<div style="background:#332200;border:1px solid #f0a500;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:13px;color:#f0c040;text-align:left;">⚠️ Aucune note repas renseignée. Tu as oublié de noter adhésion, digestion et appétit ?</div>`
    : '';

  const modal = document.createElement('div');
  modal.id = 'recap-bilan-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.3s;';
  modal.innerHTML = `<div style="background:#1a1d29;border-radius:20px;padding:28px 22px;text-align:center;max-width:320px;width:88%;box-shadow:0 20px 60px rgba(0,0,0,0.5);transform:scale(0.85);transition:transform 0.3s;">
    <div style="font-size:19px;font-weight:700;color:#e8eaf0;margin-bottom:3px;">Récap de ta semaine</div>
    <div style="font-size:12px;color:#8892a4;margin-bottom:16px;">${esc(data.semaineLabel || '')}</div>
    <div style="background:#0f1117;border-radius:12px;padding:4px 14px;margin-bottom:10px;">${statsHtml}</div>
    ${noteWarn}
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button onclick="document.getElementById('recap-bilan-modal').remove();" style="flex:1;background:#2d3142;margin:0;padding:12px;font-size:14px;border:none;border-radius:10px;color:#e8eaf0;cursor:pointer;">Modifier</button>
      <button onclick="_validerEtEnvoyerSupa();document.getElementById('recap-bilan-modal').remove();" style="flex:1;background:linear-gradient(135deg,#1D9E75,#167a5a);margin:0;padding:12px;font-size:14px;font-weight:700;border:none;border-radius:10px;color:#fff;cursor:pointer;">Envoyer au coach ✓</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => {
    modal.style.opacity = '1';
    modal.querySelector('div').style.transform = 'scale(1)';
  });
}

async function _validerEtEnvoyerSupa() {
  setPage('bilan-loading');
  try {
    const today = new Date().toISOString().split('T')[0];
    await _supaUpdateBilan({ envoye_coach: true, date_validation: today });
    if (_bilanData) { _bilanData.dejaEnvoye = true; _bilanData.dateValidation = today; }
    // Afficher overlay XP simplifié
    await loadBilan();
    _afficherXPValidationSupa();
  } catch(e) {
    showToast('Erreur : ' + e.message, '#c0392b');
    setPage('bilan');
  }
}

function _afficherXPValidationSupa() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.3s;';
  overlay.innerHTML = `<div style="background:#1a1d29;border-radius:20px;padding:36px 28px;text-align:center;max-width:300px;width:85%;box-shadow:0 20px 60px rgba(0,0,0,0.5);transform:scale(0.85);transition:transform 0.3s;">
    <div style="font-size:52px;margin-bottom:10px;">🏆</div>
    <div style="font-size:22px;font-weight:700;color:#e8eaf0;margin-bottom:4px;">Bilan envoyé !</div>
    <div style="font-size:13px;color:#8892a4;margin-bottom:24px;">Bravo pour cette semaine !</div>
    <button id="_xpOverlayBtn" style="background:linear-gradient(135deg,#1D9E75,#167a5a);width:100%;margin:0;padding:14px;border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Retour à l'accueil</button>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('_xpOverlayBtn').addEventListener('click', () => {
    overlay.remove();
    loadHome();
  });
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.querySelector('div').style.transform = 'scale(1)';
  });
}

// ── Render GAS ────────────────────────────────────────────────────────

function renderBilanComplet() {
  return `<div id="app">
    ${renderHeader('Bilan', '', false)}
    <div class="page">
      <div class="card" style="text-align:center;padding:32px;">
        <div style="font-size:40px;margin-bottom:12px;">✅</div>
        <div style="font-size:16px;font-weight:700;">Tous les bilans sont à jour !</div>
      </div>
      <button class="btn-secondary" onclick="loadHistoriqueBilans()">📅 Historique des bilans</button>
    </div>
    ${renderNavBar('bilan')}
  </div>`;
}

function renderHistoriqueList() {
  const hist = S.data.historiqueBilans || [];
  const rows = hist.length === 0
    ? `<div class="empty"><div class="empty-text">Aucun bilan clôturé pour l'instant.</div></div>`
    : hist.map(b => {
        const btnEnvoyer = !b.dejaEnvoye
          ? `<button onclick="event.stopPropagation();envoyerDepuisHistorique(${b.ligneTitre}, this)" style="background:linear-gradient(135deg,#378ADD,#1a5ba0);color:#fff;border:none;font-size:12px;padding:6px 12px;border-radius:8px;margin:0;white-space:nowrap;cursor:pointer;flex-shrink:0;">📤 Envoyer</button>`
          : `<span style="font-size:11px;color:#1D9E75;font-weight:600;white-space:nowrap;flex-shrink:0;">✅ Envoyé</span>`;
        return `
      <div class="list-item" onclick="loadBilanHistorique(${b.ligneTitre})">
        <div class="list-icon">📋</div>
        <div class="list-text" style="flex:1;min-width:0;">
          <div class="list-title">${_bilanWeekRange(b.date)}</div>
        </div>
        ${btnEnvoyer}
        <div class="list-arrow">›</div>
      </div>`;
      }).join('');

  return `<div id="app">
    ${renderHeader('Historique', '', false)}
    <div class="page">
      <div class="card">${rows}</div>
      <button class="btn-secondary" onclick="loadBilan()">← Bilan en cours</button>
    </div>
    ${renderNavBar('bilan')}
  </div>`;
}

async function envoyerDepuisHistorique(ligneTitre, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi...'; }
  const finaliser = async () => {
    try {
      const res = await api('envoyerBilanAuCoach', { ligneTitre });
      const hist = S.data.historiqueBilans || [];
      const item = hist.find(b => b.ligneTitre === ligneTitre);
      if (item) item.dejaEnvoye = true;
      const bonus = res && res.bonusPonctualite > 0;
      showToast(bonus ? '📤 Bilan envoyé au coach ! +20 XP ⏱️' : '📤 Bilan envoyé au coach !', bonus ? null : '#1a5ba0');
      setPage('bilan');
      if (bonus) setTimeout(() => rafraichirProgressionEtDeblocages(), 300);
    } catch(e) {
      if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer'; }
      showToast('Erreur : ' + e.message, '#c0392b');
    }
  };
  try {
    const retard = await api('verifierRetardBilan').catch(() => null);
    if (retard && retard.enRetard) {
      if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer'; }
      afficherAlerteRetardBilan(finaliser);
      return;
    }
    await finaliser();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer'; }
    showToast('Erreur : ' + e.message, '#c0392b');
  }
}

function renderBilanDetail(data, modeHistorique, isSemainePrecedente) {
  _bilanData  = data;
  _bilanNotes = {};
  (data.repas || []).forEach((r, idx) => {
    if (r.adhesion > 0) _bilanNotes['r'+idx+'_adh'] = r.adhesion;
    if (r.digestion > 0) _bilanNotes['r'+idx+'_dig'] = r.digestion;
    if (r.appetit > 0)  _bilanNotes['r'+idx+'_app'] = r.appetit;
  });

  const subtitle = isSemainePrecedente
    ? 'Semaine précédente'
    : (data.semaineLabel || 'Semaine en cours');

  let html = '';

  if (data.dejaValide && data.dateValidation) {
    const label   = modeHistorique ? 'Validé le' : 'Bilan clôturé le';
    const suffixe = modeHistorique ? 'modifiable, mais ne peut pas être revalidé' : 'modifiable, mais ne peut pas être reclôturé';
    html += `<div class="bilan-banner">${label} <strong>${formatDateBilanFR(data.dateValidation)}</strong> — ${suffixe}</div>`;
  }
  if (isSemainePrecedente) {
    html += `<button class="btn-secondary" onclick="loadBilan()">← Semaine en cours</button>`;
  } else if (!modeHistorique) {
    html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()">📅 Historique des bilans</button>`;
  }

  html += `<div class="section-title" style="color:#378ADD;">🍽️ Alimentation</div>`;
  (data.repas || []).forEach((r, idx) => {
    html += `<div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">Repas N°${r.num}</div>
      <div class="field-label">ADHÉSION</div>
      ${renderNotes(r.ligne, 6, 'r'+idx+'_adh', r.adhesion)}
      <div class="field-label" style="margin-top:8px;">DIGESTION</div>
      ${renderNotes(r.ligne, 7, 'r'+idx+'_dig', r.digestion)}
      <div class="field-label" style="margin-top:8px;">APPÉTIT</div>
      <div style="font-size:10px;color:var(--muted);margin:1px 0 4px;">1 = très faim · 5 = repu, difficile de finir l'assiette</div>
      ${renderNotes(r.ligne, 8, 'r'+idx+'_app', r.appetit)}
    </div>`;
  });
  html += `<div class="card">
    <div class="field-label">COMMENTAIRE ALIMENTATION</div>
    <textarea class="bilan-textarea" placeholder="Commentaire global..."
      onchange="sauverBilan(${data.ligneTitre + 2}, 9, this.value)"
    >${esc(data.commentaireAlim)}</textarea>
  </div>`;

  html += `<div class="section-title" style="color:#1D9E75;">📅 Semaine</div>`;
  (data.jours || []).forEach(j => {
    html += `<div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">${j.nom}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div>
          <div class="field-label">POIDS (kg)</div>
          <input class="bilan-input" type="text" inputmode="decimal" value="${fmtFR(j.poids)}" placeholder="—"
            onchange="sauverBilan(${j.ligne}, 12, parsePoids(this.value))">
        </div>
        <div>
          <div class="field-label">EAU (L)</div>
          <input class="bilan-input" type="text" inputmode="decimal" value="${fmtFR(j.eau)}" placeholder="—"
            onchange="sauverBilan(${j.ligne}, 13, parseEau(this.value))">
        </div>
        <div>
          <div class="field-label">STEPS</div>
          <input class="bilan-input" id="step_${j.ligne}" type="text" inputmode="numeric" value="${fmtFR(j.steps)}" placeholder="0"
            onchange="sauverStepsBilan(${j.ligne}, this.value)">
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        ${renderToggle(j.ligne, 14, 'tog_diet_'+j.ligne, j.diete, 'Diète')}
        ${renderToggle(j.ligne, 18, 'tog_train_'+j.ligne, j.training, 'Training')}
        ${renderToggle(j.ligne, 19, 'tog_cardio_'+j.ligne, j.cardio, 'Cardio')}
      </div>
    </div>`;
  });

  const ligneComJour = (data.jours && data.jours.length > 0) ? data.jours[0].ligne : data.ligneTitre + 2;
  html += `<div class="card">
    <div class="field-label">COMMENTAIRE SEMAINE</div>
    <textarea class="bilan-textarea" placeholder="Commentaire global..."
      onchange="sauverBilan(${ligneComJour}, 15, this.value)"
    >${esc(data.commentaireJour)}</textarea>
    <div class="field-label" style="margin-top:10px;">COMMENTAIRE ACTIVITÉ</div>
    <textarea class="bilan-textarea" placeholder="Commentaire activité..."
      onchange="sauverBilan(${ligneComJour}, 20, this.value)"
    >${esc(data.commentaireActivite)}</textarea>
  </div>`;

  if (modeHistorique) {
    html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()">📅 Historique des bilans</button>`;
  } else {
    const deja = !!data.dejaEnvoye;
    html += `<button id="btn-envoyer" onclick="doEnvoyerBilanAuCoach(${data.ligneTitre}, this)"
      ${deja ? 'disabled' : ''}
      class="${deja ? 'btn-disabled' : 'btn-blue'}" style="width:100%;margin-top:4px;">
      ${deja ? '✅ Envoyé au coach' : '📤 Envoyer au coach'}
    </button>`;
    html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()" style="margin-top:8px;">📅 Historique des bilans</button>`;
    if (isSemainePrecedente) {
      html += `<button class="btn-secondary" onclick="loadBilan()" style="margin-top:8px;">← Semaine en cours</button>`;
    }
  }

  return `<div id="app">
    ${renderHeader('Bilan', subtitle, false)}
    <div class="page">${html}</div>
    ${renderNavBar('bilan')}
  </div>`;
}

// ── Composants GAS ────────────────────────────────────────────────────

const NOTES_PALETTE_QUALITE = ['#e05c5c', '#f0a500', '#eab308', '#8bc34a', '#1D9E75'];

function _paletteNote(groupeId) {
  return (groupeId.endsWith('_adh') || groupeId.endsWith('_dig')) ? NOTES_PALETTE_QUALITE : null;
}

function _styleNoteBtn(i, valeur, palette) {
  const active = valeur === i;
  if (!palette) return `background:${active ? '#378ADD' : '#2d3142'};color:#e8eaf0;border:none;`;
  const c = palette[i - 1];
  return active
    ? `background:${c};color:#fff;border:none;`
    : `background:${c}22;color:${c};border:1px solid ${c}55;`;
}

function renderNotes(ligne, col, groupeId, valActuelle) {
  const palette = _paletteNote(groupeId);
  let h = `<div style="display:flex;gap:4px;margin:3px 0;">`;
  for (let i = 1; i <= 5; i++) {
    h += `<button id="${groupeId}_${i}" onclick="noterRepas(${ligne},${col},${i},'${groupeId}')"
      style="flex:1;padding:8px 0;${_styleNoteBtn(i, valActuelle, palette)}border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">${i}</button>`;
  }
  return h + '</div>';
}

function renderToggle(ligne, col, elemId, val, label) {
  const on = val === true;
  return `<button id="${elemId}" data-val="${on}" onclick="toggleBilan(${ligne},${col},'${elemId}')"
    style="flex:1;padding:10px 6px;background:${on?'#1D9E75':'#2d3142'};border:none;border-radius:8px;color:#e8eaf0;font-size:12px;font-weight:600;cursor:pointer;">
    ${on?'✓ ':''}${label}</button>`;
}

// ── Interactions GAS ──────────────────────────────────────────────────

function noterRepas(ligne, col, valeur, groupeId) {
  sauverBilan(ligne, col, valeur);
  _bilanNotes[groupeId] = valeur;
  const palette = _paletteNote(groupeId);
  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById(groupeId + '_' + i);
    if (btn) btn.style.cssText = 'flex:1;padding:8px 0;' + _styleNoteBtn(i, valeur, palette) + 'border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;';
  }
}

function toggleBilan(ligne, col, elemId) {
  const el = document.getElementById(elemId);
  const newVal = el.dataset.val !== 'true';
  el.dataset.val = String(newVal);
  el.style.background = newVal ? '#1D9E75' : '#2d3142';
  const label = el.textContent.replace('✓', '').trim();
  el.textContent = (newVal ? '✓ ' : '') + label;
  sauverBilan(ligne, col, newVal);
}

function sauverBilan(ligne, col, valeur) {
  api('enregistrerValeur', { nomFeuille: 'Bilan', ligne, colonne: col, valeur }).catch(() => {});
}

function sauverStepsBilan(ligne, val) {
  const v = parseSteps(val);
  api('enregistrerValeur', { nomFeuille: 'Bilan', ligne, colonne: 17, valeur: v }).catch(() => {});
}

async function doEnvoyerBilanAuCoach(ligneTitre, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  try {
    const retard = await api('verifierRetardBilan').catch(() => null);
    if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer au coach'; }
    if (retard && retard.enRetard) {
      afficherAlerteRetardBilan(() => ouvrirRecapBilan(ligneTitre));
      return;
    }
    ouvrirRecapBilan(ligneTitre);
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer au coach'; }
    showToast('Erreur : ' + e.message, '#c0392b');
  }
}

function afficherAlerteRetardBilan(onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML = `<div style="background:linear-gradient(135deg,#f59e0b,#b45309);color:#fff;padding:28px 24px;border-radius:18px;font-size:15px;font-weight:600;text-align:center;max-width:340px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.5);">
    <div style="font-size:36px;margin-bottom:12px;">😅</div>
    <div style="font-size:16px;font-weight:700;margin-bottom:10px;">T'es à la bourre !</div>
    <div style="font-size:14px;font-weight:400;line-height:1.5;margin-bottom:20px;">Ton coach va peut-être traiter ton bilan... ou peut-être pas 😜</div>
    <button id="_retardOkBtn" style="background:#fff;color:#b45309;font-weight:700;font-size:15px;padding:12px 32px;border-radius:10px;margin:0;border:none;cursor:pointer;">OK</button>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('_retardOkBtn').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
}

function ouvrirRecapBilan(ligneTitre) {
  const data = _bilanData;
  if (!data) { validerEtEnvoyerConfirme(ligneTitre); return; }

  let joursOk = 0, totalSteps = 0, joursTraining = 0;
  (data.jours || []).forEach(j => {
    const btn = document.getElementById('tog_diet_' + j.ligne);
    if (btn && btn.dataset.val === 'true') joursOk++;
  });
  (data.jours || []).forEach(j => {
    const inp = document.getElementById('step_' + j.ligne);
    const v = inp ? parseSteps(inp.value) : null;
    if (v !== '' && v != null && !isNaN(Number(v)) && Number(v) > 0) totalSteps += Number(v);
  });
  (data.jours || []).forEach(j => {
    const btn = document.getElementById('tog_train_' + j.ligne);
    if (btn && btn.dataset.val === 'true') joursTraining++;
  });
  const seancesObjectif = data.seancesObjectif || 0;
  const hasNote = _bilanNotes && Object.values(_bilanNotes).some(v => v > 0);
  const avgSteps = totalSteps > 0 ? Math.round(totalSteps / 7) : 0;
  const fmtNum = n => n >= 1000 ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : Math.round(n).toString();
  const statRow = (label, val, color) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #2d3142;"><span style="font-size:14px;color:#8892a4;">${label}</span><span style="font-size:15px;font-weight:700;color:${color};">${val}</span></div>`;
  const dietColor = joursOk >= 6 ? '#1D9E75' : joursOk >= 4 ? '#f0a500' : '#e05555';
  const trainLabel = seancesObjectif > 0 ? joursTraining + '/' + seancesObjectif : joursTraining + '';
  const trainColor = seancesObjectif > 0 ? (joursTraining >= seancesObjectif ? '#1D9E75' : joursTraining >= Math.ceil(seancesObjectif/2) ? '#f0a500' : '#e05555') : (joursTraining >= 3 ? '#1D9E75' : '#f0a500');
  const statsHtml = (avgSteps > 0 ? statRow('Moyenne steps/jour', fmtNum(avgSteps), '#e8eaf0') : '')
    + statRow('Diète tenue', joursOk + '/7', dietColor)
    + (seancesObjectif > 0 ? statRow('Séances training', trainLabel, trainColor) : '');
  const noteWarn = !hasNote ? `<div style="background:#332200;border:1px solid #f0a500;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:13px;color:#f0c040;text-align:left;">⚠️ Aucune note repas renseignée. Tu as oublié de noter adhésion, digestion et appétit ?</div>` : '';

  const modal = document.createElement('div');
  modal.id = 'recap-bilan-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.3s;';
  modal.innerHTML = `<div style="background:#1a1d29;border-radius:20px;padding:28px 22px;text-align:center;max-width:320px;width:88%;box-shadow:0 20px 60px rgba(0,0,0,0.5);transform:scale(0.85);transition:transform 0.3s;">
    <div style="font-size:19px;font-weight:700;color:#e8eaf0;margin-bottom:3px;">Récap de ta semaine</div>
    <div style="font-size:12px;color:#8892a4;margin-bottom:16px;">${esc(data.semaine || '')}</div>
    <div style="background:#0f1117;border-radius:12px;padding:4px 14px;margin-bottom:10px;">${statsHtml}</div>
    ${noteWarn}
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button onclick="document.getElementById('recap-bilan-modal').remove();" style="flex:1;background:#2d3142;margin:0;padding:12px;font-size:14px;border:none;border-radius:10px;color:#e8eaf0;cursor:pointer;">Modifier</button>
      <button onclick="validerEtEnvoyerConfirme(${ligneTitre});document.getElementById('recap-bilan-modal').remove();" style="flex:1;background:linear-gradient(135deg,#1D9E75,#167a5a);margin:0;padding:12px;font-size:14px;font-weight:700;border:none;border-radius:10px;color:#fff;cursor:pointer;">Envoyer au coach ✓</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => {
    modal.style.opacity = '1';
    modal.querySelector('div').style.transform = 'scale(1)';
  });
}

async function validerEtEnvoyerConfirme(ligneTitre) {
  setPage('bilan-loading');
  try {
    const raw = await api('validerEtEnvoyerBilan', { ligneTitre, targetSunday: _bilanData?.targetSunday || null });
    const result = typeof raw === 'string' ? JSON.parse(raw) : (raw || { xp: 50 });
    await loadBilan();
    if ((result.nouveauNiveau || result.bonusPonctualite > 0) && typeof rafraichirProgressionEtDeblocages === 'function') {
      rafraichirProgressionEtDeblocages();
    }
    if (!(typeof modeSimplifieActif === 'function' && modeSimplifieActif())) afficherXPValidation(result);
    else showToast('📤 Bilan envoyé au coach !', '#1a5ba0');
  } catch(e) {
    showToast('Erreur : ' + e.message, '#c0392b');
    setPage('bilan');
  }
}

function afficherXPValidation(result) {
  const xp = (result.xp || 50) + (result.bonusPonctualite || 0);
  const rows = [['Bilan de la semaine 🔒', result.xpBase || 50]];
  if (result.bonusDiete > 0)       rows.push(['Diète 7/7 ✅', result.bonusDiete]);
  if (result.bonusSeances > 0)     rows.push(['Objectif séances ✅', result.bonusSeances]);
  if (result.bonusSteps > 0)       rows.push(['Bonus steps 👟', result.bonusSteps]);
  if (result.bonusStreak > 0)      rows.push(['Streak bilans 🔥', result.bonusStreak]);
  if (result.bonusPonctualite > 0) rows.push(['Envoyé à temps ⏱️', result.bonusPonctualite]);
  const bonusHtml = rows.map(r =>
    `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #2d3142;">
      <span style="font-size:13px;color:#8892a4;">${r[0]}</span>
      <span style="font-size:13px;font-weight:600;color:#e8eaf0;">+${r[1]} XP</span>
    </div>`
  ).join('');
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.3s;';
  overlay.innerHTML = `<div style="background:#1a1d29;border-radius:20px;padding:36px 28px;text-align:center;max-width:300px;width:85%;box-shadow:0 20px 60px rgba(0,0,0,0.5);transform:scale(0.85);transition:transform 0.3s;">
    <div style="font-size:52px;margin-bottom:10px;">🏆</div>
    <div style="font-size:22px;font-weight:700;color:#e8eaf0;margin-bottom:4px;">Bilan envoyé !</div>
    <div style="font-size:13px;color:#8892a4;margin-bottom:18px;">Bravo pour cette semaine !</div>
    <div style="background:#0f1117;border-radius:12px;padding:4px 16px 8px;margin-bottom:16px;text-align:left;">
      ${bonusHtml}
      <div style="display:flex;justify-content:space-between;padding:10px 0 2px;">
        <span style="font-size:15px;font-weight:700;color:#e8eaf0;">Total gagné</span>
        <span style="font-size:20px;font-weight:800;color:#f0a500;">+${xp} XP ⭐</span>
      </div>
    </div>
    <button id="_xpOverlayBtn" style="background:linear-gradient(135deg,#1D9E75,#167a5a);width:100%;margin:0;padding:14px;border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Retour à l'accueil</button>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('_xpOverlayBtn').addEventListener('click', () => {
    overlay.remove();
    loadHome();
  });
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.querySelector('div').style.transform = 'scale(1)';
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatDateBilanFR(dateStr) {
  if (!dateStr) return '';
  const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const mois  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const m = (dateStr + '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const d = new Date(+m[3], +m[2]-1, +m[1]);
    return jours[d.getDay()] + ' ' + +m[1] + ' ' + mois[+m[2]-1] + ' ' + +m[3];
  }
  const d = new Date(dateStr);
  if (!isNaN(d)) return jours[d.getDay()] + ' ' + d.getDate() + ' ' + mois[d.getMonth()] + ' ' + d.getFullYear();
  return dateStr;
}

function fmtFR(val) { return (val == null || val === '') ? '' : (val + '').replace('.', ','); }
function parseSteps(val) {
  if (!val) return '';
  const s = (val+'').trim().replace(/\s/g,'');
  if (/[.,]/.test(s)) return '';
  const n = parseInt(s, 10);
  return isNaN(n) || n <= 0 ? '' : n;
}
function parseEau(val) {
  if (!val) return '';
  const n = parseFloat((val+'').trim().replace(/[~≈≃\s]/g,'').replace(',','.'));
  return isNaN(n) ? '' : n;
}
function parsePoids(val) {
  if (!val) return '';
  const n = parseFloat((val+'').trim().replace(',','.'));
  return isNaN(n) ? '' : n;
}
function esc(s) { return (s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showToast(msg, bg) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:${bg||'linear-gradient(135deg,#1a5ba0,#1D9E75)'};color:#fff;padding:13px 22px;border-radius:14px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 18px rgba(0,0,0,.4);text-align:center;max-width:82vw;opacity:1;transition:opacity .5s;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 2500);
}
