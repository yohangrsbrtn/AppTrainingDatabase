// ── Mon programme (client) — 100% Supabase ───────────────────────────
// UX identique à la PWA : sélecteur (semaine + séance) → vue séance avec sets.

const BLOC_LABELS = { metabolique: 'Métabolique', mecanique: 'Mécanique', force: 'Force' };

let _pcClientProgramme = null; // null | 'error' | objet programme
let _pcSemaine         = 1;
let _pcSeanceId        = null; // id de la séance sélectionnée
let _pcLogs            = {}; // `${exerciceId}|${semaine}|${serie}` → log
let _pcSubPage         = 'selector'; // 'selector' | 'seance'

// ── Chargement ─────────────────────────────────────────────────────────

async function loadProgrammeClient() {
  _pcSubPage = 'selector';
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
    // Sélection par défaut : première séance du premier bloc
    const firstSeance = _pcAllSeances()[0];
    if (!_pcSeanceId && firstSeance) _pcSeanceId = firstSeance.id;
    await chargerLogsProgramme();
    setPage('programme-client');
  } catch(e) {
    _pcClientProgramme = 'error';
    setPage('programme-client');
  }
}

function _pcAllSeances() {
  if (!_pcClientProgramme || _pcClientProgramme === 'error') return [];
  const out = [];
  (_pcClientProgramme.blocs || []).forEach(b =>
    (b.client_programme_seances || []).forEach(s => out.push(Object.assign({}, s, { _blocType: b.type })))
  );
  return out;
}

function _pcTotalSemaines() {
  if (!_pcClientProgramme || _pcClientProgramme === 'error') return 1;
  return (_pcClientProgramme.blocs || []).reduce((acc, b) => acc + (b.nombre_semaines || 1), 0) || 1;
}

async function chargerLogsProgramme() {
  const ids = _pcAllSeances().flatMap(s => (s.client_programme_exercices || []).map(ex => ex.id));
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

// ── Rendu ──────────────────────────────────────────────────────────────

function renderProgrammeClientPage() {
  if (S.page === 'programme-client-loading') {
    return `<div id="app">${renderHeader('Programme','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('training')}</div>`;
  }
  if (_pcClientProgramme === 'error') {
    return `<div id="app">${renderHeader('Programme','',false)}<div class="page">
      <div class="empty"><div class="empty-text">Erreur de chargement.</div>
      <button class="btn-secondary" style="margin-top:12px;" onclick="loadProgrammeClient()">Réessayer</button></div>
    </div>${renderNavBar('training')}</div>`;
  }
  if (!_pcClientProgramme) {
    return `<div id="app">${renderHeader('Programme','',false)}<div class="page">
      <div class="empty"><div class="empty-text">Aucun programme assigné pour l'instant.</div></div>
    </div>${renderNavBar('training')}</div>`;
  }
  if (_pcSubPage === 'seance') return renderPcSeancePage();
  return renderPcSelectorPage();
}

function renderPcSelectorPage() {
  const cp = _pcClientProgramme;
  const allSeances  = _pcAllSeances();
  const totalSem    = _pcTotalSemaines();

  const optsSemaines = Array.from({ length: totalSem }, (_, i) => i + 1)
    .map(i => `<option value="${i}" ${i === _pcSemaine ? 'selected' : ''}>Semaine ${i}</option>`).join('');

  const optsSeances = allSeances.map(s => {
    const label = s.titre + (s._blocType ? ' — ' + (BLOC_LABELS[s._blocType] || s._blocType) : '');
    return `<option value="${s.id}" ${s.id === _pcSeanceId ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');

  const canGo = _pcSeanceId && allSeances.length > 0;

  return `<div id="app">
    ${renderHeader('Programme', '', false)}
    <div class="page">
      <div class="card">
        <div class="field-label">PROGRAMME</div>
        <div style="font-size:15px;font-weight:600;color:var(--accent);padding:6px 0;">${esc(cp.nom)}</div>
      </div>
      <div class="card">
        <div class="field-label">SEMAINE</div>
        <select class="t-select" style="font-size:16px;" onchange="pcChangerSemaine(this.value)">${optsSemaines}</select>
      </div>
      <div class="card">
        <div class="field-label">SÉANCE</div>
        <select class="t-select" style="font-size:16px;" onchange="pcChangerSeance(this.value)">${optsSeances || '<option>—</option>'}</select>
      </div>
      <button class="btn-primary" onclick="pcOuvrirSeance()" ${canGo ? '' : 'disabled'}>Commencer →</button>
    </div>
    ${renderNavBar('training')}
  </div>`;
}

function renderPcSeancePage() {
  const seance = _pcAllSeances().find(s => s.id === _pcSeanceId);
  if (!seance) { _pcSubPage = 'selector'; return renderPcSelectorPage(); }

  const totalSem   = _pcTotalSemaines();
  const allSeances = _pcAllSeances();

  const optsSemaines = Array.from({ length: totalSem }, (_, i) => i + 1)
    .map(i => `<option value="${i}" ${i === _pcSemaine ? 'selected' : ''}>Semaine ${i}</option>`).join('');
  const optsSeances = allSeances.map(s => `<option value="${s.id}" ${s.id === _pcSeanceId ? 'selected' : ''}>${esc(s.titre)}</option>`).join('');

  const exosHtml = (seance.client_programme_exercices || []).map((ex, idx) => {
    const nbSeries = ex.series || 1;
    let setsHtml = '';
    for (let s = 1; s <= nbSeries; s++) {
      const log = _pcLogs[ex.id + '|' + _pcSemaine + '|' + s] || {};
      const prevLog = _pcLogs[ex.id + '|' + (_pcSemaine - 1) + '|' + s];
      let refPrec = '';
      if (prevLog && (prevLog.charge || prevLog.reps || prevLog.rir)) {
        const parts = [];
        if (prevLog.reps)   parts.push(prevLog.reps + ' reps');
        if (prevLog.charge) parts.push(prevLog.charge + ' kg');
        if (prevLog.rir)    parts.push('RIR ' + prevLog.rir);
        refPrec = `<div style="font-size:11px;color:#5a6172;margin-bottom:2px;padding-left:38px;">Sem ${_pcSemaine - 1} : ${parts.join(' · ')}</div>`;
      }
      setsHtml += refPrec + `<div class="set-row">
        <span class="set-num">S${s}</span>
        <input class="set-input" type="text" inputmode="decimal" placeholder="Reps"   value="${log.reps   != null ? log.reps   : ''}" onchange="pcSauverLog(${ex.id},${s},'reps',this.value)">
        <input class="set-input" type="text" inputmode="decimal" placeholder="Charge" value="${log.charge != null ? log.charge : ''}" onchange="pcSauverLog(${ex.id},${s},'charge',this.value)">
        <input class="set-input" type="text" inputmode="decimal" placeholder="RIR"    value="${esc(log.rir || '')}"                   onchange="pcSauverLog(${ex.id},${s},'rir',this.value)">
      </div>`;
    }
    const commentaireLog = _pcLogs[ex.id + '|' + _pcSemaine + '|1'] || {};
    const cible = [
      ex.series ? ex.series + ' séries' : '',
      ex.reps   ? '× ' + ex.reps        : '',
      ex.repos  ? '· repos ' + ex.repos : '',
      ex.tempo  ? '· tempo ' + ex.tempo : '',
      ex.rir    ? '· RIR ' + ex.rir     : ''
    ].filter(Boolean).join(' ');

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div style="flex:1;">
          <div style="font-size:16px;font-weight:600;">${idx + 1}. ${esc(ex.nom)}</div>
          ${cible ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">${cible}</div>` : ''}
        </div>
        ${ex.repos ? `<button class="chrono-btn" onclick="pcLancerChrono('${esc(ex.repos)}')">⏱ ${esc(ex.repos)}</button>` : ''}
      </div>
      ${setsHtml}
      <div style="margin-top:10px;">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Note</div>
        <textarea class="bilan-input" rows="1" placeholder="Ajouter une note…"
          onchange="pcSauverCommentaire(${ex.id},this.value)"
          style="margin-top:4px;font-size:16px;">${esc(commentaireLog.commentaire || '')}</textarea>
      </div>
    </div>`;
  }).join('') || `<div class="empty"><div class="empty-text">Aucun exercice dans cette séance.</div></div>`;

  return `<div id="app">
    ${renderHeader(esc(seance.titre), 'Semaine ' + _pcSemaine, false)}
    <div class="page">
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <select class="t-select" style="flex:1;font-size:16px;" onchange="pcChangerSeanceNav(this.value)">${optsSeances}</select>
        <select class="t-select" style="flex:1;font-size:16px;" onchange="pcChangerSemaineNav(this.value)">${optsSemaines}</select>
      </div>
      ${exosHtml}
      <button class="btn-secondary" onclick="pcRetourSelector()" style="margin-top:8px;">← Retour</button>
    </div>
    <div id="pcChronoOverlay" style="display:none;"></div>
    ${renderNavBar('training')}
  </div>`;
}

// ── Interactions ────────────────────────────────────────────────────────

function pcChangerSemaine(val) { _pcSemaine = parseInt(val) || 1; setPage('programme-client'); }
function pcChangerSeance(val)  { _pcSeanceId = parseInt(val) || val; setPage('programme-client'); }

async function pcOuvrirSeance() {
  if (!_pcSeanceId) return;
  _pcSubPage = 'seance';
  setPage('programme-client');
}

function pcRetourSelector() {
  _pcSubPage = 'selector';
  setPage('programme-client');
}

function pcChangerSemaineNav(val) {
  _pcSemaine = parseInt(val) || 1;
  setPage('programme-client');
}

function pcChangerSeanceNav(val) {
  _pcSeanceId = parseInt(val) || val;
  setPage('programme-client');
}

async function pcSauverLog(exerciceId, serie, field, value) {
  const key = exerciceId + '|' + _pcSemaine + '|' + serie;
  const current = _pcLogs[key] || {
    client_programme_exercice_id: exerciceId,
    semaine: _pcSemaine,
    numero_serie: serie,
    charge: null, reps: null, rir: null, commentaire: null
  };
  const parsed = field === 'charge' ? (parseFloat(value) || null)
    : field === 'reps'   ? (parseInt(value)   || null)
    : (value || null);
  const updated = Object.assign({}, current, { [field]: parsed });
  delete updated.id; delete updated.updated_at;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/client_programme_logs?on_conflict=client_programme_exercice_id,semaine,numero_serie`,
      { method: 'POST', headers: supaHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }), body: JSON.stringify(updated) }
    );
    if (!res.ok) throw new Error('supabase_' + res.status);
    _pcLogs[key] = (await res.json())[0];
  } catch(e) { alert('Erreur de sauvegarde : ' + e.message); }
}

async function pcSauverCommentaire(exerciceId, value) {
  await pcSauverLog(exerciceId, 1, 'commentaire', value);
}

// ── Chrono ─────────────────────────────────────────────────────────────

let _pcChronoInterval = null;
let _pcTemps = 90;
let _pcAudioCtx = null;

function pcLancerChrono(repos) {
  let totalSec = 0;
  const match = (repos + '').match(/(\d+)'?\s*(\d+)?/);
  if (match) { totalSec = (parseInt(match[1]) || 0) * 60 + (parseInt(match[2]) || 0); }
  if (!totalSec) totalSec = 90;
  _pcTemps = totalSec;
  _pcAfficherReglageChrono();
}

function _pcAfficherReglageChrono() {
  const overlay = document.getElementById('pcChronoOverlay');
  if (!overlay) return;
  const m = Math.floor(_pcTemps / 60), s = _pcTemps % 60;
  overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a1d29;color:white;padding:24px 20px;text-align:center;z-index:2000;border-top:2px solid #378ADD;display:block;';
  overlay.innerHTML = `
    <div style="font-size:13px;color:#8892a4;margin-bottom:16px;text-transform:uppercase;letter-spacing:.05em;">Temps de repos</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:20px;">
      <button onclick="pcAjusterChrono(-15)" style="width:48px;height:48px;border-radius:50%;background:#2d3142;color:white;border:none;font-size:20px;cursor:pointer;">−</button>
      <div style="font-size:42px;font-weight:700;min-width:140px;">${m}:${s.toString().padStart(2, '0')}</div>
      <button onclick="pcAjusterChrono(15)" style="width:48px;height:48px;border-radius:50%;background:#2d3142;color:white;border:none;font-size:20px;cursor:pointer;">+</button>
    </div>
    <div style="display:flex;gap:10px;">
      <button onclick="pcDemarrerChrono()" style="flex:1;padding:14px;background:#378ADD;color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">▶ Lancer</button>
      <button onclick="pcStopChrono()" style="padding:14px 20px;background:#2d3142;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">✕</button>
    </div>`;
}

function pcAjusterChrono(delta) { _pcTemps = Math.max(0, _pcTemps + delta); _pcAfficherReglageChrono(); }

function pcDemarrerChrono() {
  if (_pcChronoInterval) clearInterval(_pcChronoInterval);
  try {
    if (!_pcAudioCtx) _pcAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_pcAudioCtx.state === 'suspended') _pcAudioCtx.resume();
    const debut = _pcAudioCtx.currentTime + _pcTemps;
    for (let i = 0; i < 4; i++) {
      const osc = _pcAudioCtx.createOscillator(), gain = _pcAudioCtx.createGain();
      osc.connect(gain); gain.connect(_pcAudioCtx.destination);
      osc.frequency.value = 880; osc.type = 'sine';
      const t = debut + i * 0.22;
      gain.gain.setValueAtTime(0.3, t); gain.gain.setValueAtTime(0, t + 0.12);
      osc.start(t); osc.stop(t + 0.13);
    }
  } catch(e) {}
  const overlay = document.getElementById('pcChronoOverlay');
  let restant = _pcTemps;
  const tick = () => {
    const m = Math.floor(restant / 60), s = restant % 60;
    overlay.style.background = '#378ADD';
    overlay.innerHTML = `<div style="font-size:48px;font-weight:700;">${m}:${s.toString().padStart(2,'0')}</div>
      <div style="font-size:14px;margin-top:8px;cursor:pointer;opacity:.8;" onclick="pcStopChrono()">Arrêter ✕</div>`;
    if (restant <= 0) {
      clearInterval(_pcChronoInterval);
      overlay.style.background = '#1D9E75';
      overlay.innerHTML = `<div style="font-size:32px;font-weight:700;">✅ Repos terminé !</div>
        <div style="font-size:14px;margin-top:8px;cursor:pointer;opacity:.8;" onclick="pcStopChrono()">Fermer ✕</div>`;
      if (navigator.vibrate) navigator.vibrate([300,100,300,100,300]);
    }
    restant--;
  };
  tick();
  _pcChronoInterval = setInterval(tick, 1000);
}

function pcStopChrono() {
  if (_pcChronoInterval) clearInterval(_pcChronoInterval);
  const overlay = document.getElementById('pcChronoOverlay');
  if (overlay) overlay.style.display = 'none';
}
