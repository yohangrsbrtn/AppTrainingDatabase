// ── Training page ─────────────────────────────────────────────────────

let _tFeuilleActive   = null;
let _tSemaineActive   = null;
let _tLigneSeance     = null;
let _tNavData         = null;
let _tSeanceData      = null;
let _tColReps         = null;
let _tNotesCoach      = [];
let _tSubPage         = 'selector'; // 'selector' | 'seance'
let _tInfos           = null;
let _tFeuilles        = [];
let _tSemaines        = [];
let _tSeances         = [];

async function loadTraining() {
  if (_pf.tInfos !== null) {
    _tInfos    = _pf.tInfos;
    _tFeuilles = _pf.tFeuilles || [];
    _tFeuilleActive = _tFeuilles[0] || null;
    _tSubPage  = 'selector';
    _tSemaines = _pf.tSemaines || [];
    _tSeances  = _pf.tSeances  || [];
    if (!_tSemaineActive && _tSemaines.length) _tSemaineActive = _tSemaines[0];
    if (!_tLigneSeance   && _tSeances.length)  _tLigneSeance   = _tSeances[0].ligne;
    _pf.tInfos = null; _pf.tFeuilles = null; _pf.tSemaines = null; _pf.tSeances = null;
    setPage('training');
    schedulerPrechargement();
    return;
  }
  setPage('training-loading');
  try {
    const [infos, feuilles] = await Promise.all([
      api('chargerInfosActivite'),
      api('lireFeuillesActives')
    ]);
    _tInfos    = infos || {};
    _tFeuilles = Array.isArray(feuilles) ? feuilles : [feuilles].filter(Boolean);
    _tFeuilleActive = _tFeuilles[0] || null;
    _tSubPage = 'selector';
    if (_tFeuilleActive) await loadSeancesEtSemaines();
    else { setPage('training'); schedulerPrechargement(); }
  } catch(e) { setPage('home'); }
}

async function loadSeancesEtSemaines() {
  try {
    const [semaines, seances] = await Promise.all([
      api('listerSemaines', { nomFeuille: _tFeuilleActive }),
      api('listerSeances',  { nomFeuille: _tFeuilleActive })
    ]);
    _tSemaines = semaines || [];
    _tSeances  = seances  || [];
    if (!_tSemaineActive && _tSemaines.length) _tSemaineActive = _tSemaines[0];
    if (!_tLigneSeance   && _tSeances.length)  _tLigneSeance   = _tSeances[0].ligne;
    setPage('training');
    schedulerPrechargement();
  } catch(e) { setPage('training'); }
}

async function ouvrirSeance() {
  if (!_tFeuilleActive || !_tSemaineActive || !_tLigneSeance) return;
  setPage('training-loading');
  try {
    const [nav, seance] = await Promise.all([
      api('getNavigationData', { nomFeuille: _tFeuilleActive }),
      api('chargerSeance', { nomFeuille: _tFeuilleActive, ligneSeance: _tLigneSeance, semaine: _tSemaineActive })
    ]);
    _tNavData   = nav;
    _tSeanceData = seance;
    _tColReps   = seance.colReps;
    _tSubPage   = 'seance';
    setPage('training');
  } catch(e) { setPage('training'); }
}

// ── Render ────────────────────────────────────────────────────────────

function renderTrainingPage() {
  if (S.page === 'training-loading') {
    return `<div id="app">${renderHeader('Programme','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('training')}</div>`;
  }
  if (_tSubPage === 'seance' && _tSeanceData) return renderSeance();
  return renderTrainingSelector();
}

function renderTrainingSelector() {
  const infos = _tInfos || {};
  const hasCardio = infos.cardio && infos.cardio.trim() && infos.cardio !== '0';

  // Objectifs band
  let bandHtml = '';
  if (infos.seancesCibles || infos.stepsCibles || hasCardio) {
    bandHtml = `<div class="card" style="display:flex;justify-content:space-around;padding:12px 8px;margin-bottom:12px;">
      ${infos.seancesCibles ? `<div style="text-align:center;"><div style="font-size:14px;font-weight:700;color:var(--accent);">${infos.seancesCibles}</div><div style="font-size:10px;color:var(--muted);">séances/sem</div></div>` : ''}
      ${infos.stepsCibles ? `<div style="width:1px;background:var(--border);"></div><div style="text-align:center;"><div style="font-size:14px;font-weight:700;color:var(--green);">${infos.stepsCibles}</div><div style="font-size:10px;color:var(--muted);">pas/jour</div></div>` : ''}
      ${hasCardio ? `<div style="width:1px;background:var(--border);"></div><div style="text-align:center;"><div style="font-size:14px;font-weight:700;color:#f59e0b;">${infos.cardio}</div><div style="font-size:10px;color:var(--muted);">cardio</div></div>` : ''}
    </div>`;
  }

  const optsFeuilles = _tFeuilles.map(f => `<option value="${esc(f)}" ${f===_tFeuilleActive?'selected':''}>${esc(f)}</option>`).join('');
  const optsSemaines = _tSemaines.map(s => `<option value="${s}" ${s==_tSemaineActive?'selected':''}>Semaine ${s}</option>`).join('');
  const optsSeances  = _tSeances.map(s => `<option value="${s.ligne}" ${s.ligne==_tLigneSeance?'selected':''}>${esc(s.nom)}${s.type?' — '+esc(s.type):''}</option>`).join('');

  const canGo = _tFeuilleActive && _tSemaineActive && _tLigneSeance;

  return `<div id="app">
    ${renderHeader('Programme', '', false)}
    <div class="page">
      ${bandHtml}
      ${_tFeuilles.length > 1 ? `<div class="card">
        <div class="field-label">PROGRAMME</div>
        <select class="t-select" onchange="onChangeFeuille(this.value)">${optsFeuilles}</select>
      </div>` : `<div class="card">
        <div class="field-label">PROGRAMME</div>
        <div style="font-size:15px;font-weight:600;color:var(--accent);padding:6px 0;">${esc(_tFeuilleActive||'Aucun programme')}</div>
      </div>`}
      <div class="card">
        <div class="field-label">SEMAINE</div>
        <select class="t-select" onchange="onChangeSemaine(this.value)">${optsSemaines||'<option>—</option>'}</select>
      </div>
      <div class="card">
        <div class="field-label">SÉANCE</div>
        <select class="t-select" onchange="onChangeSeance(this.value)">${optsSeances||'<option>—</option>'}</select>
      </div>
      <button class="btn-primary" onclick="ouvrirSeance()" ${canGo?'':'disabled'}>Commencer →</button>
    </div>
    ${renderNavBar('training')}
  </div>`;
}

function renderSeance() {
  const data = _tSeanceData;
  const nav  = _tNavData;

  const optsSemaines = (nav.semaines||[]).map(s => `<option value="${s}" ${s==_tSemaineActive?'selected':''}>Semaine ${s}</option>`).join('');
  const optsSeances  = (nav.seances||[]).map(s => `<option value="${s.ligne}" ${s.ligne==_tLigneSeance?'selected':''}>${esc(s.nom)}${s.type?' — '+esc(s.type):''}</option>`).join('');

  let exosHtml = '';
  (data.exercices || []).forEach((exo, idx) => {
    let setsHtml = '';
    (exo.sets || []).forEach(set => {
      let refPrec = '';
      if (set.chargePrec || set.repsPrec || set.rirPrec) {
        const parts = [];
        if (set.repsPrec) parts.push(set.repsPrec + ' reps');
        if (set.chargePrec) parts.push(set.chargePrec + ' kg');
        if (set.rirPrec) parts.push('RIR ' + set.rirPrec);
        refPrec = `<div style="font-size:11px;color:#5a6172;margin-bottom:2px;padding-left:38px;">Sem ${set.semainePrec} : ${parts.join(' · ')}</div>`;
      }
      setsHtml += refPrec + `<div class="set-row">
        <span class="set-num">S${set.serie}</span>
        <input class="set-input" type="text" inputmode="decimal" placeholder="Reps"   value="${esc(set.reps||'')}"   onchange="sauverT(${set.ligne}, ${data.colReps},   this.value)">
        <input class="set-input" type="text" inputmode="decimal" placeholder="Charge" value="${esc(set.charge||'')}" onchange="sauverT(${set.ligne}, ${data.colCharge}, this.value)">
        <input class="set-input" type="text" inputmode="decimal" placeholder="RIR"    value="${esc(set.rir||'')}"    onchange="sauverT(${set.ligne}, ${data.colRir},    this.value)">
      </div>`;
    });

    exosHtml += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div style="flex:1;">
          <div style="font-size:16px;font-weight:600;">${exo.num}. ${esc(exo.nom)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
            <div style="font-size:12px;color:var(--muted);">${exo.series} séries × ${exo.repsCible||'?'} reps</div>
            ${exo.noteCoach ? `<button onclick="afficherNoteCoach(${idx})" style="background:#4f8ef722;border:1px solid #4f8ef755;border-radius:50%;width:26px;height:26px;padding:0;font-size:15px;cursor:pointer;line-height:26px;text-align:center;">💬</button>` : ''}
          </div>
        </div>
        ${exo.repos ? `<button class="chrono-btn" onclick="lancerChrono(&quot;${(exo.repos||'').replace(/'/g,'@')}&quot;)">⏱️ ${esc(exo.repos)}</button>` : ''}
      </div>
      ${setsHtml}
      ${exo.notePrec ? `<div style="margin-top:12px;padding:10px;background:#0f1117;border-radius:6px;border-left:3px solid #5a6172;">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">📋 Note semaine précédente</div>
        <div style="font-size:13px;color:#b4b8c4;">${esc(exo.notePrec)}</div>
      </div>` : ''}
      <div style="margin-top:10px;">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">✏️ Note cette semaine</div>
        <textarea class="bilan-textarea" style="background:#fff;color:#1a1d29;" placeholder="Ajouter une note..."
          onchange="sauverT(${exo.ligneNote}, ${exo.colNote}, this.value)">${esc(exo.note||'')}</textarea>
      </div>
    </div>`;
  });

  _tNotesCoach = (data.exercices||[]).map(e => ({ nom: e.nom, note: e.noteCoach||'' }));

  return `<div id="app">
    ${renderHeader(data.typeSeance||data.nomSeance||'Séance', `${data.nomSeance||''} · Semaine ${data.semaine||''}`, false)}
    <div class="page">
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <select class="t-select" style="flex:1;" onchange="onChangeSeanceNav(this.value)">${optsSeances}</select>
        <select class="t-select" style="flex:1;" onchange="onChangeSemaineNav(this.value)">${optsSemaines}</select>
      </div>
      ${exosHtml}
      <button class="btn-green" onclick="validerSeance()" style="width:100%;margin-top:4px;">✅ Séance validée !</button>
      <button class="btn-secondary" onclick="retourSelector()" style="margin-top:8px;">← Retour</button>
    </div>
    ${renderNavBar('training')}
  </div>`;
}

// ── Interactions ──────────────────────────────────────────────────────

async function onChangeFeuille(val) {
  _tFeuilleActive = val;
  _tSemaineActive = null;
  _tLigneSeance   = null;
  setPage('training-loading');
  await loadSeancesEtSemaines();
}

function onChangeSemaine(val) { _tSemaineActive = val; setPage('training'); }
function onChangeSeance(val)  { _tLigneSeance   = val; setPage('training'); }

async function onChangeSemaineNav(val) {
  _tSemaineActive = val;
  setPage('training-loading');
  try {
    _tSeanceData = await api('chargerSeance', { nomFeuille: _tFeuilleActive, ligneSeance: _tLigneSeance, semaine: _tSemaineActive });
    _tSubPage = 'seance';
    setPage('training');
  } catch(e) { setPage('training'); }
}

async function onChangeSeanceNav(val) {
  _tLigneSeance = val;
  setPage('training-loading');
  try {
    _tSeanceData = await api('chargerSeance', { nomFeuille: _tFeuilleActive, ligneSeance: _tLigneSeance, semaine: _tSemaineActive });
    _tSubPage = 'seance';
    setPage('training');
  } catch(e) { setPage('training'); }
}

function retourSelector() {
  _tSubPage = 'selector';
  setPage('training');
}

function sauverT(ligne, colonne, valeur) {
  api('enregistrerValeur', { nomFeuille: _tFeuilleActive, ligne, colonne, valeur }).catch(() => {});
}

async function validerSeance() {
  try {
    // verifierEtCocherTraining délègue à chargerJourneeEnCours côté serveur pour
    // trouver la ligne du jour (etendreBilan) — passe par le même verrou que le
    // reste (chargerBilan/chargerJourneeEnCours) pour éviter tout conflit.
    const check = await apiEtendreBilan('verifierEtCocherTraining');
    if (check && check.dejaValide) {
      afficherOverlay('⚠️', 'Séance déjà validée', 'Tu as déjà validé une séance aujourd\'hui. Reviens demain !', false);
      return;
    }
  } catch(e) {}
  _effectuerValidation();
}

function _effectuerValidation() {
  const today   = new Date();
  const dateStr = pad(today.getDate())+'/'+pad(today.getMonth()+1)+'/'+today.getFullYear();
  const ligneDate   = parseInt(_tLigneSeance) + 2;
  const colonneDate = parseInt(_tColReps) + 1;
  sauverT(ligneDate, colonneDate, dateStr);

  // XP de la séance (équivalent du logActivite(...,'seance',...) du GAS officiel,
  // absent jusqu'ici côté PWA — la validation d'une séance ne donnait aucune XP).
  const seanceNav = (_tNavData && _tNavData.seances || []).find(s => s.ligne == _tLigneSeance);
  const nomSeance  = (_tSeanceData && (_tSeanceData.typeSeance || _tSeanceData.nomSeance)) || (seanceNav && seanceNav.nom) || '';
  const programme  = _tFeuilleActive + (nomSeance ? '|' + nomSeance : '');
  api('validerSeanceActivite', { programme, semaine: _tSemaineActive }).catch(() => {});

  afficherOverlay('🏆', 'Séance validée !', 'Toutes tes données ont été enregistrées. Beau boulot !', true);
  setTimeout(() => rafraichirProgressionEtDeblocages(), 600);
}

function afficherOverlay(icon, titre, message, fermerSurBouton) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity .3s;';
  overlay.innerHTML = `<div style="background:#1a1d29;border-radius:20px;padding:40px 32px;text-align:center;max-width:300px;width:85%;transform:scale(.85);transition:transform .3s;">
    <div style="font-size:64px;margin-bottom:16px;">${icon}</div>
    <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:8px;">${titre}</div>
    <div style="font-size:14px;color:var(--muted);margin-bottom:28px;">${message}</div>
    <button onclick="${fermerSurBouton ? 'this.closest(\'[style*=fixed]\').remove()' : 'this.closest(\'[style*=fixed]\').remove()'}" style="background:${fermerSurBouton?'linear-gradient(135deg,#1D9E75,#167a5a)':'#2d3142'};width:100%;border:none;border-radius:10px;color:#fff;padding:14px;font-size:14px;font-weight:600;cursor:pointer;">OK</button>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; overlay.querySelector('div').style.transform = 'scale(1)'; });
}

function afficherNoteCoach(idx) {
  const exo = _tNotesCoach[idx];
  if (!exo || !exo.note) return;
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
  modal.innerHTML = `<div style="background:#1a1d29;border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5);">
    <div style="font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">💬 Note du coach</div>
    <div style="font-size:15px;font-weight:600;margin-bottom:12px;">${esc(exo.nom)}</div>
    <div style="font-size:14px;color:#b4b8c4;line-height:1.6;white-space:pre-wrap;">${esc(exo.note)}</div>
    <button onclick="this.closest('div[style*=fixed]').remove()" style="margin-top:20px;width:100%;padding:12px;background:#2d3142;border:none;border-radius:10px;color:var(--text);font-size:14px;font-weight:600;cursor:pointer;">Fermer</button>
  </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}


function pad(n) { return ('0' + n).slice(-2); }

// ── Chrono ────────────────────────────────────────────────────────────
let _chronoInterval = null;
let _tempsChrono = 90;
let _audioCtx = null;

function lancerChrono(repos) {
  repos = (repos + '').replace(/@/g, "'");
  let totalSec = 0;
  const match = repos.match(/(\d+)'?\s*(\d+)?/);
  if (match) {
    const min = parseInt(match[1]) || 0;
    const sec = parseInt(match[2]) || 0;
    totalSec = min * 60 + sec;
  }
  if (totalSec === 0) totalSec = 90;
  _tempsChrono = totalSec;
  _afficherReglageChrono();
}

function _afficherReglageChrono() {
  let overlay = document.getElementById('chronoOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'chronoOverlay';
    document.body.appendChild(overlay);
  }
  const m = Math.floor(_tempsChrono / 60);
  const s = _tempsChrono % 60;
  overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a1d29;color:white;padding:24px 20px;text-align:center;z-index:2000;border-top:2px solid #378ADD;';
  overlay.innerHTML = `
    <div style="font-size:13px;color:#8892a4;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.05em;">Temps de repos</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:20px;">
      <button onclick="ajusterChrono(-15)" style="width:48px;height:48px;border-radius:50%;background:#2d3142;color:white;border:none;font-size:20px;cursor:pointer;">−</button>
      <div style="font-size:42px;font-weight:700;min-width:140px;">${m}:${s.toString().padStart(2,'0')}</div>
      <button onclick="ajusterChrono(15)" style="width:48px;height:48px;border-radius:50%;background:#2d3142;color:white;border:none;font-size:20px;cursor:pointer;">+</button>
    </div>
    <div style="display:flex;gap:10px;">
      <button onclick="demarrerChrono()" style="flex:1;padding:14px;background:#378ADD;color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">▶ Lancer</button>
      <button onclick="stopChrono()" style="padding:14px 20px;background:#2d3142;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">✕</button>
    </div>
  `;
  overlay.style.display = 'block';
}

function ajusterChrono(delta) {
  _tempsChrono = Math.max(0, _tempsChrono + delta);
  _afficherReglageChrono();
}

function demarrerChrono() {
  if (_chronoInterval) clearInterval(_chronoInterval);
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const oscUnlock = _audioCtx.createOscillator();
    const gainUnlock = _audioCtx.createGain();
    gainUnlock.gain.value = 0.001;
    oscUnlock.connect(gainUnlock);
    gainUnlock.connect(_audioCtx.destination);
    oscUnlock.start();
    oscUnlock.stop(_audioCtx.currentTime + 0.05);
    const debutBips = _audioCtx.currentTime + _tempsChrono;
    for (let i = 0; i < 4; i++) {
      const osc = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.connect(gain);
      gain.connect(_audioCtx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      const t = debutBips + i * 0.22;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.setValueAtTime(0, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  } catch(e) {}
  const overlay = document.getElementById('chronoOverlay');
  let restant = _tempsChrono;
  const tick = () => {
    const m = Math.floor(restant / 60);
    const s = restant % 60;
    overlay.style.background = '#378ADD';
    overlay.innerHTML = `
      <div style="font-size:48px;font-weight:700;">${m}:${s.toString().padStart(2,'0')}</div>
      <div style="font-size:14px;margin-top:8px;cursor:pointer;opacity:0.8;" onclick="stopChrono()">Arrêter ✕</div>
    `;
    if (restant <= 0) {
      clearInterval(_chronoInterval);
      overlay.style.background = '#1D9E75';
      overlay.innerHTML = `
        <div style="font-size:32px;font-weight:700;">✅ Repos terminé !</div>
        <div style="font-size:14px;margin-top:8px;cursor:pointer;opacity:0.8;" onclick="stopChrono()">Fermer ✕</div>
      `;
      if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
    }
    restant--;
  };
  tick();
  _chronoInterval = setInterval(tick, 1000);
}

function stopChrono() {
  if (_chronoInterval) clearInterval(_chronoInterval);
  const overlay = document.getElementById('chronoOverlay');
  if (overlay) overlay.style.display = 'none';
}
