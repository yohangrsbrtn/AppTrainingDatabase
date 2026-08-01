// ── Journal d'entraînement personnel (client) ──────────────────────────
// Séparé du système "programme" assigné par le coach (client_programmes/
// _blocs/_seances/_exercices) — bibliothèque perso de séances que le client
// crée lui-même + logs par date réelle. Même principe que Mes menus/Mon
// journal côté diète (diete.js). Réservé pour l'instant à yohanp côté UI
// (voir tpAccesAutorise()) — schéma : sql/2026-08-01_training_perso.sql.

function tpAccesAutorise() { return S.client === 'yohanp' || S.client === 'yohan'; }

let _tpSeances = null;       // liste des séances perso (avec exercices imbriqués)
let _tpSubPage = 'liste';    // 'liste' | 'editeur' | 'seance'
let _tpSeanceEnEdition = null; // { id, nom, bloc, date_debut, exercices:[{nom,series,reps,repos,tempo,rir,notes}] }
let _tpSeanceId = null;      // séance perso ouverte en mode "log"
let _tpDate = null;          // date affichée pour le log (YYYY-MM-DD)
let _tpLogs = {};            // `${exercicePersoId}|${date}|${serie}` → log
let _tpDatesRecentes = [];   // dates loggées pour la séance ouverte (pour navigation rapide)
const _tpSaveQueues = {};

async function loadTrainingPerso() {
  setPage('training-perso-loading');
  try {
    const clientId = getClient();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/client_seances_perso?client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&select=*,client_exercices_perso(*)`,
      { headers: supaHeaders() }
    );
    _tpSeances = res.ok ? await res.json() : [];
    _tpSeances.forEach(s => (s.client_exercices_perso || []).sort((a, b) => (a.ordre || 0) - (b.ordre || 0)));
  } catch (e) { _tpSeances = []; }
  _tpSubPage = 'liste';
  setPage('training-perso');
}

function renderTrainingPersoLoading() {
  return `<div id="app"><div class="page" style="display:flex;align-items:center;justify-content:center;min-height:60vh;"><div class="spinner"></div></div></div>`;
}

function renderTrainingPersoPage() {
  if (_tpSubPage === 'editeur') return renderTpEditeur();
  if (_tpSubPage === 'seance')  return renderTpSeance();
  return renderTpListe();
}

// ── Liste ────────────────────────────────────────────────────────────
function renderTpListe() {
  const seances = _tpSeances || [];
  const groupes = {};
  const ordreGroupes = [];
  seances.forEach(s => {
    const key = s.bloc || '';
    if (!(key in groupes)) { groupes[key] = []; ordreGroupes.push(key); }
    groupes[key].push(s);
  });

  const cardSeance = s => {
    const nbExos = (s.client_exercices_perso || []).length;
    return `<div class="card" style="padding:12px 14px;margin-bottom:8px;cursor:pointer;" onclick="tpOuvrirSeance(${s.id})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;">${esc(s.nom)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${nbExos} exercice${nbExos > 1 ? 's' : ''}${s.date_debut ? ' · depuis ' + esc(s.date_debut.split('-').reverse().join('/')) : ''}</div>
        </div>
        <button onclick="event.stopPropagation();tpOuvrirEditer(${s.id})" style="background:transparent;border:none;color:var(--muted);font-size:15px;padding:2px 6px;cursor:pointer;">✏️</button>
        <button onclick="event.stopPropagation();tpSupprimerSeance(${s.id})" style="background:transparent;border:none;color:#e05555;font-size:15px;padding:2px 6px;cursor:pointer;">🗑</button>
      </div>
    </div>`;
  };

  const groupesHtml = ordreGroupes.map(key => `
    ${key ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:14px 0 6px;">${esc(key)}</div>` : ''}
    ${groupes[key].map(cardSeance).join('')}
  `).join('');

  return `<div id="app">
    ${renderHeader('Mes séances', "Journal d'entraînement perso", false)}
    <div class="page">
      <button class="btn-primary" onclick="tpOuvrirCreer()" style="margin-bottom:14px;width:100%;">+ Créer une séance</button>
      ${seances.length ? groupesHtml : `<div class="empty"><div class="empty-text">Aucune séance perso pour l'instant.<br>Crée-en une pour commencer à logger tes charges.</div></div>`}
      <button class="btn-secondary" onclick="loadProgrammeClient()" style="margin-top:16px;width:100%;">← Retour au programme</button>
    </div>
    ${renderNavBar('training')}
  </div>`;
}

// ── Éditeur (création / édition) ────────────────────────────────────────
function tpOuvrirCreer() {
  _tpSeanceEnEdition = { id: null, nom: '', bloc: '', date_debut: '', exercices: [{ nom: '', series: '', reps: '', repos: '', tempo: '', rir: '', notes: '' }] };
  _tpSubPage = 'editeur';
  setPage('training-perso');
}

function tpOuvrirEditer(id) {
  const s = (_tpSeances || []).find(x => x.id === id);
  if (!s) return;
  _tpSeanceEnEdition = {
    id: s.id, nom: s.nom, bloc: s.bloc || '', date_debut: s.date_debut || '',
    exercices: (s.client_exercices_perso || []).map(e => ({
      id: e.id, nom: e.nom, series: e.series || '', reps: e.reps || '', repos: e.repos || '', tempo: e.tempo || '', rir: e.rir || '', notes: e.notes || ''
    }))
  };
  if (!_tpSeanceEnEdition.exercices.length) _tpSeanceEnEdition.exercices.push({ nom: '', series: '', reps: '', repos: '', tempo: '', rir: '', notes: '' });
  _tpSubPage = 'editeur';
  setPage('training-perso');
}

function tpAnnulerEdition() { _tpSeanceEnEdition = null; _tpSubPage = 'liste'; setPage('training-perso'); }

function tpChangerChampSeance(champ, val) { if (_tpSeanceEnEdition) _tpSeanceEnEdition[champ] = val; }
function tpChangerChampExercice(idx, champ, val) { if (_tpSeanceEnEdition) _tpSeanceEnEdition.exercices[idx][champ] = val; }

function tpAjouterExercice() {
  _tpSeanceEnEdition.exercices.push({ nom: '', series: '', reps: '', repos: '', tempo: '', rir: '', notes: '' });
  setPage('training-perso');
}
function tpSupprimerExercice(idx) {
  _tpSeanceEnEdition.exercices.splice(idx, 1);
  if (!_tpSeanceEnEdition.exercices.length) _tpSeanceEnEdition.exercices.push({ nom: '', series: '', reps: '', repos: '', tempo: '', rir: '', notes: '' });
  setPage('training-perso');
}

function renderTpEditeur() {
  const e = _tpSeanceEnEdition;
  const exosHtml = e.exercices.map((ex, idx) => `
    <div class="card" style="padding:12px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:700;color:var(--muted);">Exercice ${idx + 1}</span>
        ${e.exercices.length > 1 ? `<button onclick="tpSupprimerExercice(${idx})" style="background:transparent;border:none;color:#e05555;font-size:13px;cursor:pointer;">Supprimer</button>` : ''}
      </div>
      <input class="bilan-input" type="text" placeholder="Nom de l'exercice" value="${esc(ex.nom)}" oninput="tpChangerChampExercice(${idx},'nom',this.value)" style="margin-bottom:6px;font-size:16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <input class="bilan-input" type="text" placeholder="Séries (ex: 4)" value="${esc(ex.series)}" oninput="tpChangerChampExercice(${idx},'series',this.value)" style="font-size:16px;">
        <input class="bilan-input" type="text" placeholder="Reps (ex: 8-12)" value="${esc(ex.reps)}" oninput="tpChangerChampExercice(${idx},'reps',this.value)" style="font-size:16px;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <input class="bilan-input" type="text" placeholder="Repos (ex: 90s)" value="${esc(ex.repos)}" oninput="tpChangerChampExercice(${idx},'repos',this.value)" style="font-size:16px;">
        <input class="bilan-input" type="text" placeholder="RIR" value="${esc(ex.rir)}" oninput="tpChangerChampExercice(${idx},'rir',this.value)" style="font-size:16px;">
      </div>
      <input class="bilan-input" type="text" placeholder="Note (facultatif)" value="${esc(ex.notes)}" oninput="tpChangerChampExercice(${idx},'notes',this.value)" style="font-size:16px;">
    </div>
  `).join('');

  return `<div id="app">
    ${renderHeader(e.id ? 'Éditer la séance' : 'Nouvelle séance', '', false)}
    <div class="page">
      <input class="bilan-input" type="text" placeholder="Nom de la séance (ex: Push A)" value="${esc(e.nom)}" oninput="tpChangerChampSeance('nom',this.value)" style="margin-bottom:8px;font-size:16px;font-weight:600;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;">
        <input class="bilan-input" type="text" placeholder="Bloc (facultatif, ex: Force Août)" value="${esc(e.bloc)}" oninput="tpChangerChampSeance('bloc',this.value)" style="font-size:16px;">
        <input class="bilan-input" type="date" value="${esc(e.date_debut)}" oninput="tpChangerChampSeance('date_debut',this.value)" style="font-size:16px;">
      </div>
      ${exosHtml}
      <button class="btn-secondary" onclick="tpAjouterExercice()" style="width:100%;margin-bottom:14px;">+ Ajouter un exercice</button>
      <button class="btn-primary" onclick="tpSauvegarderSeance()" style="width:100%;">Enregistrer</button>
      <button class="btn-secondary" onclick="tpAnnulerEdition()" style="margin-top:8px;width:100%;">Annuler</button>
    </div>
    ${renderNavBar('training')}
  </div>`;
}

async function tpSauvegarderSeance() {
  const e = _tpSeanceEnEdition;
  const nom = (e.nom || '').trim();
  if (!nom) { showToast('Le nom de la séance est obligatoire.', '#c0392b'); return; }
  const exercicesValides = e.exercices.filter(ex => (ex.nom || '').trim());
  try {
    const clientId = getClient();
    const body = { client_id: clientId, nom, bloc: (e.bloc || '').trim() || null, date_debut: e.date_debut || null };
    let seanceId = e.id;
    if (seanceId) {
      await fetch(`${SUPABASE_URL}/rest/v1/client_seances_perso?id=eq.${seanceId}`, { method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(body) });
      // Remplace tous les exercices existants — plus simple et sûr qu'un diff fin pour une petite liste.
      await fetch(`${SUPABASE_URL}/rest/v1/client_exercices_perso?seance_perso_id=eq.${seanceId}`, { method: 'DELETE', headers: supaHeaders() });
    } else {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/client_seances_perso`, { method: 'POST', headers: supaHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(body) });
      const rows = await res.json();
      seanceId = rows[0].id;
    }
    if (exercicesValides.length) {
      const payload = exercicesValides.map((ex, i) => ({
        seance_perso_id: seanceId, nom: ex.nom.trim(), ordre: i,
        series: ex.series ? parseInt(ex.series) || null : null,
        reps: ex.reps || null, repos: ex.repos || null, tempo: ex.tempo || null, rir: ex.rir || null, notes: ex.notes || null,
      }));
      await fetch(`${SUPABASE_URL}/rest/v1/client_exercices_perso`, { method: 'POST', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(payload) });
    }
    showToast('✅ Séance enregistrée', '#1D9E75');
    await loadTrainingPerso();
  } catch (err) { showToast('Erreur : ' + err.message, '#c0392b'); }
}

async function tpSupprimerSeance(id) {
  if (!confirm('Supprimer cette séance et tout son historique de charges ?')) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/client_seances_perso?id=eq.${id}`, { method: 'DELETE', headers: supaHeaders() });
    await loadTrainingPerso();
  } catch (e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

// ── Séance (log par date) ────────────────────────────────────────────
function _tpIsoToday() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function tpOuvrirSeance(id) {
  _tpSeanceId = id;
  _tpDate = _tpIsoToday();
  _tpSubPage = 'seance';
  setPage('training-perso');
  await tpChargerLogsPourDate();
  await tpChargerDatesRecentes();
  setPage('training-perso');
}

async function tpChargerLogsPourDate() {
  const seance = (_tpSeances || []).find(s => s.id === _tpSeanceId);
  if (!seance) return;
  const exoIds = (seance.client_exercices_perso || []).map(e => e.id);
  if (!exoIds.length) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/client_logs_perso?exercice_perso_id=in.(${exoIds.join(',')})&date=eq.${_tpDate}`,
      { headers: supaHeaders() }
    );
    const rows = res.ok ? await res.json() : [];
    rows.forEach(l => { _tpLogs[l.exercice_perso_id + '|' + l.date + '|' + l.numero_serie] = l; });
  } catch (e) {}
}

async function tpChargerDatesRecentes() {
  const seance = (_tpSeances || []).find(s => s.id === _tpSeanceId);
  if (!seance) { _tpDatesRecentes = []; return; }
  const exoIds = (seance.client_exercices_perso || []).map(e => e.id);
  if (!exoIds.length) { _tpDatesRecentes = []; return; }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/client_logs_perso?exercice_perso_id=in.(${exoIds.join(',')})&select=date&order=date.desc&limit=200`,
      { headers: supaHeaders() }
    );
    const rows = res.ok ? await res.json() : [];
    _tpDatesRecentes = [...new Set(rows.map(r => r.date))].filter(d => d !== _tpDate).slice(0, 5);
  } catch (e) { _tpDatesRecentes = []; }
}

async function tpChangerDate(val) {
  _tpDate = val;
  await tpChargerLogsPourDate();
  await tpChargerDatesRecentes();
  setPage('training-perso');
}

function tpRetourListe() { _tpSeanceId = null; _tpSubPage = 'liste'; setPage('training-perso'); }

function renderTpSeance() {
  const seance = (_tpSeances || []).find(s => s.id === _tpSeanceId);
  if (!seance) { _tpSubPage = 'liste'; return renderTpListe(); }
  const dateFr = _tpDate.split('-').reverse().join('/');

  const exosHtml = (seance.client_exercices_perso || []).map((ex, idx) => {
    const nbSeries = parseInt(ex.series) || 3;
    let setsHtml = '';
    for (let s = 1; s <= nbSeries; s++) {
      const log = _tpLogs[ex.id + '|' + _tpDate + '|' + s] || {};
      setsHtml += `<div class="set-row">
        <span class="set-num">S${s}</span>
        <input class="set-input" type="text" inputmode="decimal" placeholder="Rep" value="${log.reps != null ? log.reps : ''}" onchange="tpSauverLog(${ex.id},${s},'reps',this.value)">
        <input class="set-input" type="text" inputmode="decimal" placeholder="Kg"  value="${log.charge != null ? log.charge : ''}" onchange="tpSauverLog(${ex.id},${s},'charge',this.value)">
        <input class="set-input" type="text" inputmode="decimal" placeholder="RIR" value="${esc(log.rir || '')}" onchange="tpSauverLog(${ex.id},${s},'rir',this.value)">
      </div>`;
    }
    const commentaireLog = _tpLogs[ex.id + '|' + _tpDate + '|1'] || {};
    const cibleLigne1 = [ex.series ? ex.series + ' séries' : '', ex.reps ? '× ' + ex.reps : ''].filter(Boolean).join(' ');
    const cibleLigne2 = [ex.rir ? 'RIR ' + ex.rir : '', ex.repos ? '⏱ ' + ex.repos : '', ex.tempo ? 'tempo ' + ex.tempo : ''].filter(Boolean).join(' · ');
    return `<div class="card" style="padding:10px;margin-bottom:8px;">
      <div style="font-size:14px;font-weight:600;line-height:1.3;">${idx + 1}. ${esc(ex.nom)}</div>
      ${cibleLigne1 ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${cibleLigne1}</div>` : ''}
      ${cibleLigne2 ? `<div style="font-size:11px;color:#5a8aaa;margin-top:1px;">${cibleLigne2}</div>` : ''}
      ${ex.notes ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;font-style:italic;">${esc(ex.notes)}</div>` : ''}
      <div style="margin-top:8px;">${setsHtml}</div>
      <textarea class="bilan-input" rows="2" placeholder="Note…" onchange="tpSauverLog(${ex.id},1,'commentaire',this.value)" style="margin-top:6px;font-size:16px;">${esc(commentaireLog.commentaire || '')}</textarea>
    </div>`;
  }).join('') || `<div class="empty"><div class="empty-text">Aucun exercice dans cette séance.</div></div>`;

  const datesRecentesHtml = _tpDatesRecentes.length
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
        ${_tpDatesRecentes.map(d => `<button onclick="tpChangerDate('${d}')" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;">${esc(d.split('-').reverse().join('/'))}</button>`).join('')}
      </div>` : '';

  return `<div id="app">
    ${renderHeader(esc(seance.nom), dateFr, false)}
    <div class="page">
      <input class="bilan-input" type="date" value="${esc(_tpDate)}" onchange="tpChangerDate(this.value)" style="margin-bottom:8px;font-size:16px;width:100%;">
      ${datesRecentesHtml}
      ${exosHtml}
      <button class="btn-secondary" onclick="tpRetourListe()" style="margin-top:8px;width:100%;">← Mes séances</button>
    </div>
    ${renderNavBar('training')}
  </div>`;
}

async function tpSauverLog(exercicePersoId, serie, field, value) {
  const key = exercicePersoId + '|' + _tpDate + '|' + serie;
  const current = _tpLogs[key] || { exercice_perso_id: exercicePersoId, date: _tpDate, numero_serie: serie, charge: null, reps: null, rir: null, commentaire: null };
  const parsed = field === 'charge' ? (parseFloat((value + '').replace(',', '.')) || null)
    : field === 'reps' ? (parseFloat((value + '').replace(',', '.')) || null)
    : field === 'rir'  ? (value || null)
    : (value || null);
  _tpLogs[key] = Object.assign({}, current, { [field]: parsed });

  _tpSaveQueues[key] = (_tpSaveQueues[key] || Promise.resolve()).then(async () => {
    const log = _tpLogs[key];
    try {
      if (log.id) {
        await fetch(`${SUPABASE_URL}/rest/v1/client_logs_perso?id=eq.${log.id}`, { method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ [field]: parsed }) });
      } else {
        const body = { exercice_perso_id: exercicePersoId, date: _tpDate, numero_serie: serie };
        if (log.charge != null) body.charge = log.charge;
        if (log.reps != null) body.reps = log.reps;
        if (log.rir != null) body.rir = log.rir;
        if (log.commentaire != null) body.commentaire = log.commentaire;
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/client_logs_perso?on_conflict=exercice_perso_id,date,numero_serie`,
          { method: 'POST', headers: supaHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }), body: JSON.stringify(body) }
        );
        if (res.ok) {
          const rows = await res.json();
          if (rows[0]?.id) _tpLogs[key] = Object.assign({}, _tpLogs[key], { id: rows[0].id });
        }
      }
    } catch (e) {}
  });
}
