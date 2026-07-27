// ── Mon programme (client) — 100% Supabase ───────────────────────────
// UX identique à la PWA : sélecteur (semaine + séance) → vue séance avec sets.

const BLOC_LABELS = { metabolique: 'Métabolique', mecanique: 'Mécanique', force: 'Force' };

let _pcClientProgramme = null; // null | 'error' | objet programme
let _pcSemaine         = 1;
let _pcSeanceId        = null; // id de la séance sélectionnée
let _pcLogs            = {}; // `${exerciceId}|${semaine}|${serie}` → log
const _pcSaveQueues    = {}; // même clé → Promise (sérialise les saves par série)
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

function _pcMusclePanelHtml(seance) {
  const muscles = {};
  (seance.client_programme_exercices || []).forEach(ex => {
    const g = ex.groupe_musculaire || ex.muscle || ex.groupe || null;
    if (!g) return;
    muscles[g] = (muscles[g] || 0) + (parseInt(ex.series) || 3);
  });
  const entries = Object.entries(muscles).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '';
  return `<div style="margin-bottom:10px;">
    <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Muscles</div>
    ${entries.map(([g, s]) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
      <span style="font-size:11px;color:var(--text);line-height:1.2;">${esc(g)}</span>
      <span style="font-size:11px;font-weight:700;color:var(--accent);margin-left:4px;">${s}S</span>
    </div>`).join('')}
  </div>`;
}

function _pcRenderChart(seance) {
  const totalSem = _pcTotalSemaines();
  if (totalSem < 2) return '';
  const exos   = (seance.client_programme_exercices || []).slice(0, 4);
  const colors = ['#378ADD', '#1D9E75', '#D85A30', '#a78bfa'];
  const W = 130, H = 60, PAD = 6;

  const series = exos.map((ex, ei) => {
    const data = [];
    for (let sem = 1; sem <= totalSem; sem++) {
      const charges = [];
      for (let s = 1; s <= (parseInt(ex.series) || 3); s++) {
        const log = _pcLogs[ex.id + '|' + sem + '|' + s];
        if (log?.charge) charges.push(parseFloat(log.charge));
      }
      data.push(charges.length ? Math.max(...charges) : null);
    }
    return { nom: ex.nom, data, color: colors[ei] };
  });

  const allVals = series.flatMap(s => s.data.filter(v => v != null));
  if (!allVals.length) return `<div style="font-size:10px;color:var(--muted);text-align:center;padding:8px 0;font-style:italic;">Aucun log</div>`;

  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const rangeV = maxV - minV || 1;
  const xOf = sem => PAD + (sem - 1) / (totalSem - 1) * (W - 2 * PAD);
  const yOf = v   => H - PAD - (v - minV) / rangeV * (H - 2 * PAD);

  let paths = '';
  series.forEach(s => {
    let d = '', last = null;
    s.data.forEach((v, i) => {
      if (v == null) { last = null; return; }
      const x = xOf(i + 1).toFixed(1), y = yOf(v).toFixed(1);
      d += last ? `L${x},${y}` : `M${x},${y}`;
      last = { x, y };
    });
    if (d) paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    s.data.forEach((v, i) => {
      if (v == null) return;
      paths += `<circle cx="${xOf(i+1).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="2" fill="${s.color}"/>`;
    });
  });

  const legend = series.filter(s => s.data.some(v => v != null)).map(s =>
    `<div style="display:flex;align-items:center;gap:3px;font-size:9px;color:var(--muted);line-height:1.2;">
      <div style="width:10px;height:2px;background:${s.color};border-radius:1px;flex-shrink:0;"></div>
      <span>${esc(s.nom.length > 12 ? s.nom.substring(0, 11) + '…' : s.nom)}</span>
    </div>`).join('');

  return `<div>
    <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">Progression charge</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible;">
      <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H-PAD}" stroke="#333" stroke-width="0.5"/>
      <line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD}" y2="${H-PAD}" stroke="#333" stroke-width="0.5"/>
      ${paths}
    </svg>
    <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">${legend}</div>
  </div>`;
}

function _pcRightPanel(seance) {
  const musclesHtml = _pcMusclePanelHtml(seance);
  const chartHtml   = _pcRenderChart(seance);
  if (!musclesHtml && !chartHtml) return '';
  return `<div class="card" style="padding:10px;margin-bottom:0;margin-top:0;">
    ${musclesHtml}
    ${musclesHtml && chartHtml ? '<div style="height:1px;background:var(--border);margin:8px 0;"></div>' : ''}
    ${chartHtml}
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
    const nbSeries = parseInt(ex.series) || 3;
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
        <input class="set-input" type="text" inputmode="decimal" placeholder="Rep"    value="${log.reps   != null ? log.reps   : ''}" onchange="pcSauverLog(${ex.id},${s},'reps',this.value)"   style="padding:6px 2px;font-size:14px;">
        <input class="set-input" type="text" inputmode="decimal" placeholder="Kg"     value="${log.charge != null ? log.charge : ''}" onchange="pcSauverLog(${ex.id},${s},'charge',this.value)" style="padding:6px 2px;font-size:14px;">
        <input class="set-input" type="text" inputmode="decimal" placeholder="RIR"    value="${esc(log.rir || '')}"                   onchange="pcSauverLog(${ex.id},${s},'rir',this.value)"    style="padding:6px 2px;font-size:14px;">
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

    return `<div class="card" style="padding:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px;gap:6px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;line-height:1.3;">${idx + 1}. ${esc(ex.nom)}</div>
          ${cible ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${cible}</div>` : ''}
        </div>
        ${ex.repos ? `<button class="chrono-btn" style="font-size:11px;padding:5px 7px;" onclick="pcLancerChrono('${esc(ex.repos)}')">⏱</button>` : ''}
      </div>
      ${setsHtml}
      <textarea class="bilan-input" rows="1" placeholder="Note…"
        onchange="pcSauverCommentaire(${ex.id},this.value)"
        style="margin-top:6px;font-size:16px;">${esc(commentaireLog.commentaire || '')}</textarea>
    </div>`;
  }).join('') || `<div class="empty"><div class="empty-text">Aucun exercice dans cette séance.</div></div>`;

  const rightPanel = _pcRightPanel(seance);
  return `<div id="app">
    ${renderHeader(esc(seance.titre), 'Semaine ' + _pcSemaine, false)}
    <div class="page">
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <select class="t-select" style="flex:1;font-size:16px;" onchange="pcChangerSeanceNav(this.value)">${optsSeances}</select>
        <select class="t-select" style="flex:1;font-size:16px;" onchange="pcChangerSemaineNav(this.value)">${optsSemaines}</select>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="flex:1.5;min-width:0;">
          ${exosHtml}
          <button class="btn-secondary" onclick="pcRetourSelector()" style="margin-top:8px;width:100%;">← Retour</button>
        </div>
        ${rightPanel ? `<div style="flex:1;min-width:110px;max-width:155px;position:sticky;top:8px;">${rightPanel}</div>` : ''}
      </div>
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
  // Mise à jour optimiste avant le fetch pour que les appels rapides successifs
  // lisent toujours l'état le plus récent (évite race condition reps/charge)
  _pcLogs[key] = Object.assign({}, current, { [field]: parsed });

  // Sérialise les requêtes pour cette clé : chaque item lit l'état courant au moment
  // de son exécution, pas au moment de l'enqueue
  _pcSaveQueues[key] = (_pcSaveQueues[key] || Promise.resolve()).then(async () => {
    const log = _pcLogs[key];
    try {
      if (log.id) {
        // Enregistrement existant : PATCH sur un seul champ, aucun risque d'écraser les autres
        await fetch(
          `${SUPABASE_URL}/rest/v1/client_programme_logs?id=eq.${log.id}`,
          { method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ [field]: parsed }) }
        );
      } else {
        // Nouveau : POST avec tous les champs non-null accumulés jusqu'ici
        const l = _pcLogs[key];
        const body = { client_programme_exercice_id: exerciceId, semaine: _pcSemaine, numero_serie: serie };
        if (l.charge      != null) body.charge      = l.charge;
        if (l.reps        != null) body.reps        = l.reps;
        if (l.rir         != null) body.rir         = l.rir;
        if (l.commentaire != null) body.commentaire = l.commentaire;
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/client_programme_logs?on_conflict=client_programme_exercice_id,semaine,numero_serie`,
          { method: 'POST', headers: supaHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }), body: JSON.stringify(body) }
        );
        if (res.ok) {
          const rows = await res.json();
          // On récupère uniquement l'id pour les PATCH suivants ; on garde l'état optimiste
          if (rows[0]?.id) _pcLogs[key] = Object.assign({}, _pcLogs[key], { id: rows[0].id });
        }
      }
    } catch(e) { /* silencieux pour ne pas alerter à chaque frappe */ }
  });
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
