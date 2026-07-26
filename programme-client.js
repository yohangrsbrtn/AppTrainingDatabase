// ── Mon programme (client) — 100% Supabase, lecture seule ───────────────
// Le client peut voir son programme et logger ses charges/reps/RIR.
// Il ne peut pas modifier la structure du programme (ajout/suppression de séances ou exercices).

const SUPABASE_URL = 'https://sfacjbwiczwkcjpwneyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYWNqYndpY3p3a2NqcHduZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjgzNTAsImV4cCI6MjEwMDIwNDM1MH0.mrjPbOuQROMihzxZWrUNbncQIos0jK2VexpQDoRZXzY';
function supaHeaders(extra){
  return Object.assign({ apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, extra || {});
}

const BLOC_LABELS = { metabolique: 'Métabolique', mecanique: 'Mécanique', force: 'Force' };

let _pcClientProgramme = null; // null=pas chargé, 'error', ou l'objet programme
let _pcSemaine = 1;
let _pcLogs = {}; // clé `${exerciceId}|${semaine}|${serie}` -> ligne de log

async function loadProgrammeClient(){
  setPage('programme-client-loading');
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/client_programmes?client_id=eq.${encodeURIComponent(S.client)}&actif=eq.true&order=created_at.desc&limit=1`,
      { headers: supaHeaders() }
    );
    if (!res.ok) throw new Error('supabase_' + res.status);
    const rows = await res.json();
    if (!rows.length) { _pcClientProgramme = null; setPage('programme-client'); return; }
    const cp = rows[0];
    const resArbo = await fetch(
      `${SUPABASE_URL}/rest/v1/client_programme_blocs?client_programme_id=eq.${cp.id}&order=ordre.asc` +
      `&select=*,client_programme_seances(*,client_programme_exercices(*))` +
      `&client_programme_seances.order=ordre.asc&client_programme_seances.client_programme_exercices.order=ordre.asc`,
      { headers: supaHeaders() }
    );
    if (!resArbo.ok) throw new Error('supabase_' + resArbo.status);
    const blocs = await resArbo.json();
    _pcClientProgramme = Object.assign({}, cp, { blocs });
    if (!_pcSemaine) _pcSemaine = 1;
    await chargerLogsProgramme();
    setPage('programme-client');
  } catch(e) {
    _pcClientProgramme = 'error';
    setPage('programme-client');
  }
}

async function chargerLogsProgramme(){
  const ids = [];
  (_pcClientProgramme.blocs||[]).forEach(b =>
    (b.client_programme_seances||[]).forEach(s =>
      (s.client_programme_exercices||[]).forEach(ex => ids.push(ex.id))
    )
  );
  _pcLogs = {};
  if (!ids.length) return;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/client_programme_logs?client_programme_exercice_id=in.(${ids.join(',')})`,
    { headers: supaHeaders() }
  );
  if (!res.ok) return;
  const rows = await res.json();
  rows.forEach(l => { _pcLogs[l.client_programme_exercice_id + '|' + l.semaine + '|' + l.numero_serie] = l; });
}

// ── Rendu ─────────────────────────────────────────────────────────────────

function renderProgrammeClientPage(){
  if (S.page === 'programme-client-loading') {
    return `<div id="app">${renderHeader('Mon programme','',true)}<div class="page">${renderSpinner()}</div></div>`;
  }
  if (_pcClientProgramme === 'error') {
    return `<div id="app">${renderHeader('Mon programme','',true)}<div class="page">
      <div class="empty"><div class="empty-text">Erreur de chargement.</div>
      <button class="btn-secondary" style="margin-top:12px;" onclick="loadProgrammeClient()">Réessayer</button></div>
    </div></div>`;
  }
  if (!_pcClientProgramme) {
    return `<div id="app">${renderHeader('Mon programme','',true)}<div class="page">
      <div class="empty"><div class="empty-text">Aucun programme assigné pour l'instant.</div></div>
    </div></div>`;
  }
  const cp = _pcClientProgramme;
  const totalSemaines = cp.blocs.reduce((s,b) => s + (b.nombre_semaines || 1), 0) || 1;
  return `<div id="app">
    ${renderHeader('Mon programme', cp.nom, true)}
    <div class="page">
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <button class="btn-secondary" style="width:auto;padding:8px 14px;margin:0;" onclick="pcChangerSemaine(-1)">‹</button>
        <div style="text-align:center;">
          <div class="field-label" style="margin:0;">Semaine</div>
          <div style="font-size:18px;font-weight:700;">${_pcSemaine}${totalSemaines>1 ? ' / ' + totalSemaines : ''}</div>
        </div>
        <button class="btn-secondary" style="width:auto;padding:8px 14px;margin:0;" onclick="pcChangerSemaine(1)">›</button>
      </div>
      ${cp.blocs.map(bloc => `
        ${bloc.type ? `<div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 6px;">${esc(BLOC_LABELS[bloc.type] || bloc.type)}${bloc.nombre_semaines ? ' · ' + bloc.nombre_semaines + ' semaines' : ''}</div>` : ''}
        ${(bloc.client_programme_seances||[]).map(seance => renderPcSeance(seance)).join('')}
      `).join('') || `<div class="empty"><div class="empty-text">Ce programme n'a pas encore de séance.</div></div>`}
    </div>
  </div>`;
}

function renderPcSeance(seance){
  return `<div class="card">
    <div style="font-weight:700;font-size:14px;margin-bottom:10px;">${esc(seance.titre)}</div>
    ${(seance.client_programme_exercices||[]).map(ex => renderPcExercice(ex)).join('')
      || `<div class="empty-text" style="padding:8px 0;font-size:13px;color:var(--muted);">Aucun exercice dans cette séance.</div>`}
  </div>`;
}

function renderPcExercice(ex){
  const nbSeries = ex.series || 1;
  let rows = '';
  for (let s = 1; s <= nbSeries; s++) {
    const log = _pcLogs[ex.id + '|' + _pcSemaine + '|' + s] || {};
    rows += `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <span style="width:20px;font-size:11px;color:var(--muted);">#${s}</span>
        <input class="set-input" type="text" inputmode="decimal" placeholder="kg"
          value="${log.charge!=null?log.charge:''}"
          onchange="pcSauverLog(${ex.id},${s},'charge',this.value)">
        <input class="set-input" type="text" inputmode="numeric" placeholder="reps"
          value="${log.reps!=null?log.reps:''}"
          onchange="pcSauverLog(${ex.id},${s},'reps',this.value)">
        <input class="set-input" type="text" placeholder="RIR"
          value="${esc(log.rir||'')}"
          onchange="pcSauverLog(${ex.id},${s},'rir',this.value)"
          style="flex:0.6;">
      </div>`;
  }
  const commentaireLog = _pcLogs[ex.id + '|' + _pcSemaine + '|1'] || {};
  return `<div style="border-top:1px solid var(--border);padding:10px 0;">
    <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${esc(ex.nom)}</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">
      Cible : ${ex.series||'—'} × ${esc(ex.reps||'—')}${ex.repos?' · repos '+esc(ex.repos):''}${ex.tempo?' · tempo '+esc(ex.tempo):''}${ex.rir?' · RIR '+esc(ex.rir):''}
    </div>
    ${rows}
    <textarea class="bilan-input" rows="1" placeholder="Commentaire (optionnel)"
      onchange="pcSauverCommentaire(${ex.id},this.value)"
      style="margin-top:4px;font-size:16px;">${esc(commentaireLog.commentaire||'')}</textarea>
  </div>`;
}

// ── Interactions ───────────────────────────────────────────────────────────

function pcChangerSemaine(delta){
  _pcSemaine = Math.max(1, _pcSemaine + delta);
  setPage('programme-client');
}

async function pcSauverLog(exerciceId, serie, field, value){
  const key = exerciceId + '|' + _pcSemaine + '|' + serie;
  const current = _pcLogs[key] || {
    client_programme_exercice_id: exerciceId,
    semaine: _pcSemaine,
    numero_serie: serie,
    charge: null, reps: null, rir: null, commentaire: null
  };
  const parsed = field === 'charge' ? (parseFloat(value)||null)
    : field === 'reps' ? (parseInt(value)||null)
    : (value || null);
  const updated = Object.assign({}, current, { [field]: parsed });
  delete updated.id; delete updated.updated_at;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/client_programme_logs?on_conflict=client_programme_exercice_id,semaine,numero_serie`,
      { method:'POST', headers:supaHeaders({ Prefer:'return=representation,resolution=merge-duplicates' }), body:JSON.stringify(updated) }
    );
    if (!res.ok) throw new Error('supabase_' + res.status);
    _pcLogs[key] = (await res.json())[0];
  } catch(e) { alert('Erreur de sauvegarde : ' + e.message); }
}

async function pcSauverCommentaire(exerciceId, value){
  await pcSauverLog(exerciceId, 1, 'commentaire', value);
}
