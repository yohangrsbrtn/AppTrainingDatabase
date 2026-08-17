// ── Mon programme (client) — 100% Supabase ───────────────────────────
// UX identique à la PWA : sélecteur (semaine + séance) → vue séance avec sets.

const BLOC_LABELS = { metabolique: 'Métabolique', mecanique: 'Mécanique', force: 'Force' };

let _pcClientProgramme = null; // null | 'error' | objet programme
let _pcSemaine         = 1;
let _pcSeanceId        = null; // id de la séance sélectionnée
let _pcBlocId          = null; // bloc actuellement sélectionné
let _pcLogs            = {}; // `${exerciceId}|${semaine}|${serie}` → log
const _pcSaveQueues    = {}; // même clé → Promise (sérialise les saves par série)
let _pcSubPage         = 'selector'; // 'selector' | 'seance'
let _pcObjectifs       = null; // { steps_cible, seances_cible, cardio_consigne } assignés par le coach
let _pcNotesCoach      = []; // [{ nom, note }] pour la modale bulle coach

// ── Exercices équivalents (créés par le client quand une machine manque) ──
// Un seul équivalent par exercice prévu (UNIQUE côté DB). Mêmes séries/reps/
// repos/tempo cibles que l'exercice prévu (jamais dupliqués, juste réaffichés) —
// seuls le nom et les logs de charge sont propres à l'équivalent.
let _pcEquivalents     = {}; // `${client_programme_exercice_id}` → { id, nom, exercice_id }
let _pcEquivLogs       = {}; // `${equivalentId}|${semaine}|${serie}` → log
const _pcEquivSaveQueues = {};
let _pcExercicesLib    = null; // cache bibliothèque exercices (lazy)
let _pcEquivCibleId    = null; // exercice prévu ciblé par la modale de création en cours

// ── Auto-édition du programme (réservée client par client, voir auto_edition_programme) ──
// Contrairement aux logs (sauvegarde immédiate par série), chaque action ici
// (remplacer/ajouter/supprimer/réordonner) écrit directement en base sans
// bouton "Enregistrer" séparé — même logique que la création d'équivalent
// ci-dessus, juste étendue au contenu de la séance elle-même.
let _pcEditMode        = false;
let _pcExoPickerMode   = null; // {type:'remplacer', exId} | {type:'ajouter', seanceId, ordreInsertion}
function _pcAutoEdition() { return !!(S.data.profil && S.data.profil.auto_edition_programme); }
function pcToggleEdition() { _pcEditMode = !_pcEditMode; setPage('programme-client'); }

// ── Chargement ─────────────────────────────────────────────────────────

async function _chargerObjectifsClient() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/client_profils?client_id=eq.${encodeURIComponent(S.client)}&select=steps_cible,seances_cible,cardio_consigne`,
      { headers: supaHeaders() }
    );
    const arr = res.ok ? await res.json() : [];
    _pcObjectifs = arr[0] || null;
  } catch(e) { _pcObjectifs = null; }
}

// deepLink { semaine, seanceId } (optionnel) : ouvre directement la séance ciblée au lieu du
// sélecteur — utilisé par la notification "Repos terminé" (voir pcDemarrerChrono) pour ramener
// le client exactement là où il a lancé son chrono, quels que soient semaine/séance déjà en
// mémoire ou déjà validés (le client peut re-remplir une séance déjà faite, on ne se base donc
// JAMAIS sur un statut "complet/incomplet" pour choisir où réouvrir — seulement sur ce qui était
// réellement affiché au moment du clic sur "Lancer").
async function loadProgrammeClient(deepLink) {
  _pcSubPage = 'selector';
  setPage('programme-client-loading');
  try {
    const [, res] = await Promise.all([
      _chargerObjectifsClient(),
      fetch(
        `${SUPABASE_URL}/rest/v1/client_programmes?client_id=eq.${encodeURIComponent(S.client)}&actif=eq.true&brouillon=eq.false&order=created_at.desc&limit=1`,
        { headers: supaHeaders() }
      )
    ]);
    if (!res.ok) throw new Error('supabase_' + res.status);
    const rows = await res.json();
    if (!rows.length) {
      // Aucun programme publié — un programme actif encore en brouillon (coach en train de le
      // préparer) donne un message d'attente distinct du "rien du tout" générique.
      let brouillonEnAttente = false;
      try {
        const resB = await fetch(
          `${SUPABASE_URL}/rest/v1/client_programmes?client_id=eq.${encodeURIComponent(S.client)}&actif=eq.true&brouillon=eq.true&select=id&limit=1`,
          { headers: supaHeaders() }
        );
        brouillonEnAttente = resB.ok && (await resB.json()).length > 0;
      } catch(e) {}
      _pcClientProgramme = brouillonEnAttente ? 'brouillon' : null;
      setPage('programme-client');
      return;
    }
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
    // Retrouve le BLOC qui contient la séance ciblée — peut différer du bloc_actif_id du coach
    // si celui-ci a changé de bloc actif entre-temps ; sans ce garde-fou, le bloc "par défaut"
    // écraserait _pcBlocId juste après et la séance ciblée ne serait plus trouvable dedans.
    if (deepLink && deepLink.seanceId != null) {
      const blocCible = blocs.find(b => (b.client_programme_seances || []).some(s => s.id === deepLink.seanceId));
      if (blocCible) {
        _pcBlocId = blocCible.id;
        _pcSeanceId = deepLink.seanceId;
        _pcSemaine = deepLink.semaine || 1;
        _pcSubPage = 'seance';
      }
    }
    if (!_pcSemaine) _pcSemaine = 1;
    // Sélection du bloc : bloc_actif_id défini par le coach, sinon premier bloc
    const defaultBlocId = cp.bloc_actif_id || (blocs[0]?.id ?? null);
    if (!_pcBlocId || !blocs.find(b => b.id === _pcBlocId)) _pcBlocId = defaultBlocId;
    // Sélection par défaut : première séance du bloc sélectionné
    const firstSeance = _pcSeancesForBloc(_pcBlocId)[0];
    if (!_pcSeanceId && firstSeance) _pcSeanceId = firstSeance.id;
    const exoIds = _pcAllSeances().flatMap(s => (s.client_programme_exercices || []).map(ex => ex.id));
    await Promise.all([chargerLogsProgramme(), _pcChargerEquivalents(exoIds)]);
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

function _pcSeancesForBloc(blocId) {
  const bloc = (_pcClientProgramme?.blocs || []).find(b => b.id === blocId);
  return (bloc?.client_programme_seances || []).map(s => Object.assign({}, s, { _blocType: bloc.type }));
}

function _pcSemainesForBloc(blocId) {
  const bloc = (_pcClientProgramme?.blocs || []).find(b => b.id === blocId);
  if (!bloc) return 1;
  if (bloc.nombre_semaines) return bloc.nombre_semaines;
  // Fallback : dériver depuis les logs existants
  const exoIds = new Set((bloc.client_programme_seances || [])
    .flatMap(s => (s.client_programme_exercices || []).map(ex => ex.id)));
  let maxSem = 1;
  Object.keys(_pcLogs).forEach(k => {
    const parts = k.split('|');
    if (exoIds.has(parseInt(parts[0]))) maxSem = Math.max(maxSem, parseInt(parts[1]));
  });
  return maxSem;
}

function _pcBlocLabel(bloc) {
  if (!bloc) return 'Bloc';
  return BLOC_LABELS[bloc.type] || ('Bloc ' + ((_pcClientProgramme?.blocs || []).indexOf(bloc) + 1));
}

const PC_BLOC_COLOR = { metabolique: '#1D9E75', mecanique: '#378ADD', force: '#D85A30' };

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

async function _pcChargerEquivalents(exoIds) {
  _pcEquivalents = {};
  _pcEquivLogs = {};
  if (!exoIds.length) return;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/client_programme_exercices_equivalents?programme_exercice_id=in.(${exoIds.join(',')})`,
    { headers: supaHeaders() }
  );
  const rows = res.ok ? await res.json() : [];
  rows.forEach(r => { _pcEquivalents[r.programme_exercice_id] = r; });
  const eqIds = rows.map(r => r.id);
  if (!eqIds.length) return;
  const resLogs = await fetch(
    `${SUPABASE_URL}/rest/v1/client_programme_logs_equivalents?equivalent_id=in.(${eqIds.join(',')})`,
    { headers: supaHeaders() }
  );
  if (!resLogs.ok) return;
  (await resLogs.json()).forEach(l => { _pcEquivLogs[l.equivalent_id + '|' + l.semaine + '|' + l.numero_serie] = l; });
}

async function _pcChargerExercicesLib() {
  if (_pcExercicesLib) return _pcExercicesLib;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/exercices?select=id,nom,groupe_musculaire&order=nom.asc`, { headers: supaHeaders() });
    _pcExercicesLib = res.ok ? await res.json() : [];
  } catch(e) { _pcExercicesLib = []; }
  return _pcExercicesLib;
}

async function pcOuvrirCreerEquivalent(exerciceId) {
  _pcEquivCibleId = exerciceId;
  await _pcChargerExercicesLib();
  const overlay = document.createElement('div');
  overlay.id = 'pcEquivOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:flex-end;';
  overlay.innerHTML = `
    <div class="sheet-body" style="background:#151a28;border-radius:20px 20px 0 0;width:100%;max-height:80vh;display:flex;flex-direction:column;margin:0 auto;max-width:520px;">
      <div class="sheet-handle" style="width:36px;height:4px;background:#2d3142;border-radius:2px;margin:10px auto 0;flex-shrink:0;"></div>
      <div style="padding:14px 20px 4px;font-size:16px;font-weight:700;color:#fff;">🔁 Exercice équivalent</div>
      <div style="padding:0 20px 10px;font-size:12px;color:#8892a4;">Même nombre de séries, reps, repos et tempo que l'exercice prévu — seul le nom change.</div>
      <div style="padding:0 20px 10px;">
        <input id="pcEquivSearch" type="text" placeholder="Chercher ou saisir un nom…" oninput="_pcFiltrerEquivLib()" style="width:100%;font-size:16px;padding:11px 12px;border-radius:10px;border:1px solid #2d3142;background:#0f1117;color:#fff;">
      </div>
      <div id="pcEquivList" style="flex:1;overflow-y:auto;padding:0 20px 12px;"></div>
      <div style="padding:12px 20px calc(12px + env(safe-area-inset-bottom));display:flex;gap:8px;">
        <button onclick="document.getElementById('pcEquivOverlay').remove()" style="flex:1;padding:12px;background:#2d3142;border:none;border-radius:10px;color:#fff;font-size:14px;cursor:pointer;">Annuler</button>
        <button onclick="pcCreerEquivalent(null,null)" style="flex:1;padding:12px;background:#378ADD;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Utiliser ce nom</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  attacherSwipeFermeture(overlay);
  _pcFiltrerEquivLib();
  setTimeout(() => document.getElementById('pcEquivSearch')?.focus(), 100);
}

function _pcFiltrerEquivLib() {
  const q = (document.getElementById('pcEquivSearch')?.value || '').trim().toLowerCase();
  const list = document.getElementById('pcEquivList');
  if (!list) return;
  const items = !q ? [] : (_pcExercicesLib || []).filter(e => e.nom.toLowerCase().includes(q)).slice(0, 30);
  list.innerHTML = items.map(e => `
    <div onclick="pcSelectionnerEquivLib(${e.id}, '${esc(e.nom).replace(/'/g, "\\'")}')" style="padding:11px 12px;border-bottom:1px solid #1e2235;cursor:pointer;font-size:14px;color:#e8eaf0;">
      ${esc(e.nom)}${e.groupe_musculaire ? `<span style="font-size:11px;color:#8892a4;margin-left:6px;">${esc(e.groupe_musculaire)}</span>` : ''}
    </div>`).join('') || (q ? `<div style="padding:12px 0;font-size:12px;color:#5a6172;">Aucun résultat dans la bibliothèque — clique "Utiliser ce nom" pour créer un nom libre.</div>` : '');
}

function pcSelectionnerEquivLib(exerciceLibId, nom) {
  pcCreerEquivalent(exerciceLibId, nom);
}

async function pcCreerEquivalent(exerciceLibId, nomLib) {
  const nomSaisi = (document.getElementById('pcEquivSearch')?.value || '').trim();
  const nom = nomLib || nomSaisi;
  if (!nom) return;
  const cibleId = _pcEquivCibleId;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_programme_exercices_equivalents`, {
      method: 'POST', headers: supaHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ programme_exercice_id: cibleId, nom, exercice_id: exerciceLibId || null })
    });
    if (!res.ok) throw new Error('supabase_' + res.status);
    const row = (await res.json())[0];
    _pcEquivalents[cibleId] = row;
    document.getElementById('pcEquivOverlay')?.remove();
    setPage('programme-client');
    await _pcPropagerEquivalentAutresBlocs(cibleId, nom, exerciceLibId || null);
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

// Les blocs (Métabolique/Mécanique/Force…) dupliquent les mêmes séances/
// exercices pour chaque phase du programme — le même exercice "prévu" existe
// donc en plusieurs exemplaires (un client_programme_exercice distinct par
// bloc). Créer un équivalent dans un bloc doit se propager aux autres
// exemplaires du même exercice (même nom, ou même exercice_id si la
// bibliothèque coach est utilisée) pour que le client n'ait pas à recréer le
// même équivalent une fois arrivé dans le bloc suivant.
async function _pcPropagerEquivalentAutresBlocs(cibleId, nom, exerciceLibId) {
  const toutesExos = _pcAllSeances().flatMap(s => s.client_programme_exercices || []);
  const source = toutesExos.find(e => e.id === cibleId);
  if (!source) return;
  const nomNorm = (source.nom || '').trim().toLowerCase();
  const autres = toutesExos.filter(e =>
    e.id !== cibleId &&
    !_pcEquivalents[e.id] &&
    ((source.exercice_id && e.exercice_id === source.exercice_id) || (e.nom || '').trim().toLowerCase() === nomNorm)
  );
  if (!autres.length) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_programme_exercices_equivalents`, {
      method: 'POST', headers: supaHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(autres.map(e => ({ programme_exercice_id: e.id, nom, exercice_id: exerciceLibId || null })))
    });
    if (res.ok) (await res.json()).forEach(row => { _pcEquivalents[row.programme_exercice_id] = row; });
  } catch(e) {}
}

// Bouton flèche (en plus du swipe natif, peu visible pour certains clients —
// signalé comme "on ne voit rien, on voit juste un 1 sur 2") pour naviguer
// entre l'exercice prévu et son équivalent.
function pcEquivSliderAller(exId, direction) {
  const slider = document.getElementById(`pcEquivSlider_${exId}`);
  if (!slider) return;
  const w = slider.clientWidth || 1;
  const cur = Math.round(slider.scrollLeft / w);
  const next = Math.max(0, Math.min(1, cur + direction));
  slider.scrollTo({ left: next * w, behavior: 'smooth' });
}

async function pcSupprimerEquivalent(programmeExerciceId, equivalentId) {
  if (!confirm('Supprimer cet exercice équivalent ? Les charges loguées dessus seront perdues.')) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/client_programme_exercices_equivalents?id=eq.${equivalentId}`, { method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' }) });
    delete _pcEquivalents[programmeExerciceId];
    Object.keys(_pcEquivLogs).forEach(k => { if (k.startsWith(equivalentId + '|')) delete _pcEquivLogs[k]; });
    setPage('programme-client');
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

// ── Auto-édition — picker exercice (remplacer ou ajouter) ────────────────
async function pcOuvrirPickerExo(mode) {
  _pcExoPickerMode = mode;
  await _pcChargerExercicesLib();
  const overlay = document.createElement('div');
  overlay.id = 'pcExoPickerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:flex-end;';
  const titre = mode.type === 'remplacer' ? '🔁 Remplacer l\'exercice' : '➕ Ajouter un exercice';
  overlay.innerHTML = `
    <div class="sheet-body" style="background:#151a28;border-radius:20px 20px 0 0;width:100%;max-height:80vh;display:flex;flex-direction:column;margin:0 auto;max-width:520px;">
      <div class="sheet-handle" style="width:36px;height:4px;background:#2d3142;border-radius:2px;margin:10px auto 0;flex-shrink:0;"></div>
      <div style="padding:14px 20px 4px;font-size:16px;font-weight:700;color:#fff;">${titre}</div>
      <div style="padding:0 20px 10px;">
        <input id="pcExoPickerSearch" type="text" placeholder="Chercher un exercice…" oninput="_pcFiltrerExoPicker()" style="width:100%;font-size:16px;padding:11px 12px;border-radius:10px;border:1px solid #2d3142;background:#0f1117;color:#fff;">
      </div>
      <div id="pcExoPickerList" style="flex:1;overflow-y:auto;padding:0 20px 12px;"></div>
      <div style="padding:12px 20px calc(12px + env(safe-area-inset-bottom));">
        <button onclick="document.getElementById('pcExoPickerOverlay').remove()" style="width:100%;padding:12px;background:#2d3142;border:none;border-radius:10px;color:#fff;font-size:14px;cursor:pointer;">Annuler</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  attacherSwipeFermeture(overlay);
  _pcFiltrerExoPicker();
  setTimeout(() => document.getElementById('pcExoPickerSearch')?.focus(), 100);
}

function _pcFiltrerExoPicker() {
  const q = (document.getElementById('pcExoPickerSearch')?.value || '').trim().toLowerCase();
  const list = document.getElementById('pcExoPickerList');
  if (!list) return;
  const items = !q ? [] : (_pcExercicesLib || []).filter(e => e.nom.toLowerCase().includes(q)).slice(0, 30);
  list.innerHTML = items.map(e => `
    <div onclick="pcChoisirExoPicker(${e.id}, '${esc(e.nom).replace(/'/g, "\\'")}')" style="padding:11px 12px;border-bottom:1px solid #1e2235;cursor:pointer;font-size:14px;color:#e8eaf0;">
      ${esc(e.nom)}${e.groupe_musculaire ? `<span style="font-size:11px;color:#8892a4;margin-left:6px;">${esc(e.groupe_musculaire)}</span>` : ''}
    </div>`).join('') || (q ? `<div onclick="pcChoisirExoPicker(null, null)" style="padding:12px;font-size:13px;color:#378ADD;cursor:pointer;">➕ Utiliser « ${esc(q)} »</div>` : '');
}

async function pcChoisirExoPicker(exerciceLibId, nom) {
  const mode = _pcExoPickerMode;
  if (!mode) return;
  const nomFinal = nom || (document.getElementById('pcExoPickerSearch')?.value || '').trim();
  if (!nomFinal) return;
  document.getElementById('pcExoPickerOverlay')?.remove();
  if (mode.type === 'remplacer') await pcRemplacerExo(mode.exId, exerciceLibId || null, nomFinal);
  else await pcAjouterExoDansSeance(mode.seanceId, mode.ordreInsertion, exerciceLibId || null, nomFinal);
}

async function pcRemplacerExo(exId, exerciceLibId, nom) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_programme_exercices?id=eq.${exId}`, {
      method: 'PATCH', headers: supaHeaders(), body: JSON.stringify({ nom, exercice_id: exerciceLibId })
    });
    if (!res.ok) throw new Error('supabase_' + res.status);
    const seance = _pcAllSeances().find(s => (s.client_programme_exercices || []).some(e => e.id === exId));
    const ex = seance && seance.client_programme_exercices.find(e => e.id === exId);
    if (ex) { ex.nom = nom; ex.exercice_id = exerciceLibId; }
    setPage('programme-client');
  } catch (e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function pcAjouterExoDansSeance(seanceId, ordreInsertion, exerciceLibId, nom) {
  const seance = _pcAllSeances().find(s => s.id === seanceId);
  if (!seance) return;
  const exos = (seance.client_programme_exercices || []).slice().sort((a, b) => a.ordre - b.ordre);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_programme_exercices`, {
      method: 'POST', headers: supaHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ seance_id: seanceId, nom, exercice_id: exerciceLibId, ordre: ordreInsertion, series: 3, reps: '10-12', repos: "1'30", rir: '2-3' })
    });
    if (!res.ok) throw new Error('supabase_' + res.status);
    const nouvelle = (await res.json())[0];
    exos.splice(ordreInsertion, 0, nouvelle);
    await _pcRenumeroterExos(seance, exos);
  } catch (e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function _pcRenumeroterExos(seance, exosOrdonnes) {
  const updates = [];
  exosOrdonnes.forEach((ex, i) => {
    if (ex.ordre !== i) {
      ex.ordre = i;
      updates.push(fetch(`${SUPABASE_URL}/rest/v1/client_programme_exercices?id=eq.${ex.id}`, { method: 'PATCH', headers: supaHeaders(), body: JSON.stringify({ ordre: i }) }));
    }
  });
  await Promise.all(updates);
  seance.client_programme_exercices = exosOrdonnes;
  setPage('programme-client');
}

async function pcSupprimerExo(exId) {
  if (!confirm('Supprimer cet exercice de la séance ? Les charges loguées dessus seront perdues.')) return;
  const seance = _pcAllSeances().find(s => (s.client_programme_exercices || []).some(e => e.id === exId));
  if (!seance) return;
  try {
    const equiv = _pcEquivalents[exId];
    if (equiv) {
      await fetch(`${SUPABASE_URL}/rest/v1/client_programme_logs_equivalents?equivalent_id=eq.${equiv.id}`, { method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' }) });
      await fetch(`${SUPABASE_URL}/rest/v1/client_programme_exercices_equivalents?id=eq.${equiv.id}`, { method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' }) });
      delete _pcEquivalents[exId];
    }
    await fetch(`${SUPABASE_URL}/rest/v1/client_programme_logs?client_programme_exercice_id=eq.${exId}`, { method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' }) });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_programme_exercices?id=eq.${exId}`, { method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' }) });
    if (!res.ok) throw new Error('supabase_' + res.status);
    const exos = (seance.client_programme_exercices || []).filter(e => e.id !== exId);
    await _pcRenumeroterExos(seance, exos);
  } catch (e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function pcDeplacerExo(exId, direction) {
  const seance = _pcAllSeances().find(s => (s.client_programme_exercices || []).some(e => e.id === exId));
  if (!seance) return;
  const exos = (seance.client_programme_exercices || []).slice().sort((a, b) => a.ordre - b.ordre);
  const idx = exos.findIndex(e => e.id === exId);
  const cible = idx + direction;
  if (cible < 0 || cible >= exos.length) return;
  [exos[idx], exos[cible]] = [exos[cible], exos[idx]];
  await _pcRenumeroterExos(seance, exos);
}

// ── Auto-édition — réordonner les séances du bloc ─────────────────────────
async function pcDeplacerSeance(blocId, seanceId, direction) {
  const bloc = (_pcClientProgramme?.blocs || []).find(b => b.id === blocId);
  if (!bloc) return;
  const seances = (bloc.client_programme_seances || []).slice().sort((a, b) => a.ordre - b.ordre);
  const idx = seances.findIndex(s => s.id === seanceId);
  const cible = idx + direction;
  if (cible < 0 || cible >= seances.length) return;
  [seances[idx], seances[cible]] = [seances[cible], seances[idx]];
  const updates = [];
  seances.forEach((s, i) => {
    if (s.ordre !== i) {
      s.ordre = i;
      updates.push(fetch(`${SUPABASE_URL}/rest/v1/client_programme_seances?id=eq.${s.id}`, { method: 'PATCH', headers: supaHeaders(), body: JSON.stringify({ ordre: i }) }));
    }
  });
  await Promise.all(updates);
  bloc.client_programme_seances = seances;
  setPage('programme-client');
}

function pcOuvrirReorganiserSeances() {
  const overlay = document.createElement('div');
  overlay.id = 'pcReorderSeancesOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:flex-end;';
  overlay.innerHTML = `
    <div class="sheet-body" style="background:#151a28;border-radius:20px 20px 0 0;width:100%;max-height:80vh;display:flex;flex-direction:column;margin:0 auto;max-width:520px;">
      <div class="sheet-handle" style="width:36px;height:4px;background:#2d3142;border-radius:2px;margin:10px auto 0;flex-shrink:0;"></div>
      <div style="padding:14px 20px 4px;font-size:16px;font-weight:700;color:#fff;">↕️ Réorganiser mes séances</div>
      <div id="pcReorderSeancesList" style="flex:1;overflow-y:auto;padding:8px 20px 12px;"></div>
      <div style="padding:12px 20px calc(12px + env(safe-area-inset-bottom));">
        <button onclick="document.getElementById('pcReorderSeancesOverlay').remove()" style="width:100%;padding:12px;background:#378ADD;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Terminé</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  attacherSwipeFermeture(overlay);
  _pcRenderReorderSeancesList();
}

function _pcRenderReorderSeancesList() {
  const list = document.getElementById('pcReorderSeancesList');
  if (!list) return;
  const seances = _pcSeancesForBloc(_pcBlocId);
  list.innerHTML = seances.map((s, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #1e2235;">
      <div style="flex:1;font-size:14px;color:#e8eaf0;">${esc(s.titre)}</div>
      <button onclick="pcDeplacerSeanceUI(${s.id},-1)" ${i === 0 ? 'disabled' : ''} style="width:34px;height:34px;border-radius:8px;background:#2d3142;border:none;color:#fff;font-size:15px;cursor:pointer;${i === 0 ? 'opacity:.35;' : ''}">▲</button>
      <button onclick="pcDeplacerSeanceUI(${s.id},1)" ${i === seances.length - 1 ? 'disabled' : ''} style="width:34px;height:34px;border-radius:8px;background:#2d3142;border:none;color:#fff;font-size:15px;cursor:pointer;${i === seances.length - 1 ? 'opacity:.35;' : ''}">▼</button>
    </div>`).join('');
}

async function pcDeplacerSeanceUI(seanceId, direction) {
  await pcDeplacerSeance(_pcBlocId, seanceId, direction);
  _pcRenderReorderSeancesList();
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
  if (_pcClientProgramme === 'brouillon') {
    return `<div id="app">${renderHeader('Programme','',false)}<div class="page">
      <div class="empty"><div class="empty-text">🛠️ Ton coach prépare ton programme, reviens bientôt !</div></div>
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

function _renderPcObjectifsBand() {
  const o = _pcObjectifs;
  if (!o) return '';
  const items = [];
  if (o.seances_cible) items.push({ v: o.seances_cible, l: 'séances/sem' });
  if (o.steps_cible) items.push({ v: (o.steps_cible >= 1000 ? Math.round(o.steps_cible/100)/10 + 'k' : o.steps_cible), l: 'pas/jour' });
  if (!items.length && !o.cardio_consigne) return '';
  return `<div class="card" style="padding:12px 8px;margin-bottom:12px;">
    ${items.length ? `<div style="display:flex;justify-content:space-around;">
      ${items.map(it => `<div style="text-align:center;"><div style="font-size:16px;font-weight:700;color:var(--accent);">${it.v}</div><div style="font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">${it.l}</div></div>`).join('')}
    </div>` : ''}
    ${o.cardio_consigne ? `<div style="text-align:center;font-size:12px;color:#8892a4;${items.length?'margin-top:8px;padding-top:8px;border-top:1px solid var(--border);':''}">🏃 ${esc(o.cardio_consigne)}</div>` : ''}
  </div>`;
}

function renderPcSelectorPage() {
  const cp     = _pcClientProgramme;
  const blocs  = cp.blocs || [];
  const blocActifId = cp.bloc_actif_id || null;
  const blocSelectionne = blocs.find(b => b.id === _pcBlocId) || blocs[0];
  const seances    = _pcSeancesForBloc(_pcBlocId);
  const totalSem   = _pcSemainesForBloc(_pcBlocId);
  const isReadonly = blocActifId && _pcBlocId !== blocActifId;

  // Sélecteur de bloc — uniquement si multi-blocs
  let blocSelectorHtml = '';
  if (blocs.length > 1) {
    const pills = blocs.map(b => {
      const isSelected = b.id === _pcBlocId;
      const isActif    = b.id === blocActifId;
      const color      = PC_BLOC_COLOR[b.type] || '#666';
      const label      = _pcBlocLabel(b);
      return `<button onclick="pcChangerBloc(${b.id})" style="
        padding:8px 16px;border-radius:20px;cursor:pointer;font-size:13px;font-weight:${isSelected?'700':'500'};
        border:2px solid ${isSelected ? color : 'var(--border)'};
        background:${isSelected ? color + '22' : 'transparent'};
        color:${isSelected ? color : 'var(--text-muted)'};">
        ${esc(label)}${isActif ? ' ⭐' : ''}
      </button>`;
    }).join('');
    const notice = isReadonly
      ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">👁 Lecture seule — ce bloc n'est pas actif</div>`
      : '';
    blocSelectorHtml = `<div class="card">
      <div class="field-label">BLOC</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 0;">${pills}</div>
      ${notice}
    </div>`;
  }

  const optsSemaines = Array.from({ length: totalSem }, (_, i) => i + 1)
    .map(i => `<option value="${i}" ${i === _pcSemaine ? 'selected' : ''}>Semaine ${i}</option>`).join('');

  const optsSeances = seances.map(s =>
    `<option value="${s.id}" ${s.id === _pcSeanceId ? 'selected' : ''}>${esc(s.titre)}</option>`
  ).join('');

  const canGo = _pcSeanceId && seances.length > 0;

  return `<div id="app">
    ${renderHeader('Programme', '', false)}
    <div class="page">
      ${_renderPcObjectifsBand()}
      <div class="card">
        <div class="field-label">PROGRAMME</div>
        <div style="font-size:15px;font-weight:600;color:var(--accent);padding:6px 0;">${esc(cp.nom)}</div>
      </div>
      ${blocSelectorHtml}
      <div class="card">
        <div class="field-label">SEMAINE</div>
        <select class="t-select" style="font-size:16px;" onchange="pcChangerSemaine(this.value)">${optsSemaines}</select>
      </div>
      <div class="card">
        <div class="field-label">SÉANCE</div>
        <select class="t-select" style="font-size:16px;" onchange="pcChangerSeance(this.value)">${optsSeances || '<option>—</option>'}</select>
      </div>
      <button class="btn-primary" onclick="pcOuvrirSeance()" ${canGo ? '' : 'disabled'}>${isReadonly ? '👁 Voir la séance' : 'Commencer →'}</button>
      ${(_pcAutoEdition() && !isReadonly && seances.length > 1) ? `<button class="btn-secondary" onclick="pcOuvrirReorganiserSeances()" style="margin-top:8px;width:100%;">↕️ Réorganiser mes séances</button>` : ''}
      ${(typeof tpAccesAutorise === 'function' && tpAccesAutorise()) ? `<button class="btn-secondary" onclick="loadTrainingPerso()" style="margin-top:8px;width:100%;">📓 Mes séances perso</button>` : ''}
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
  return `<div style="margin-bottom:6px;">
    <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Muscles</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;">
      ${entries.map(([g, s]) => `<span style="font-size:11px;background:#1e2444;border:1px solid var(--border);border-radius:6px;padding:2px 8px;color:var(--text);"><strong style="color:var(--accent);">${s}S</strong> ${esc(g)}</span>`).join('')}
    </div>
  </div>`;
}

function _e1rm(charge, reps, rir) {
  const c = parseFloat(charge), r = parseInt(reps), ri = parseInt(rir) || 0;
  if (!c || !r) return null;
  const effectiveReps = r + ri;
  return c * (1 + effectiveReps / 30);
}

function _pcRenderChart(seance) {
  const totalSem = _pcSemainesForBloc(_pcBlocId);
  if (totalSem < 2) return '';
  const exos   = seance.client_programme_exercices || [];
  const colors = ['#378ADD', '#1D9E75', '#D85A30', '#a78bfa', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16'];
  const W = 300, H = 90, PAD = 10;

  const series = exos.map((ex, ei) => {
    const data = [];
    for (let sem = 1; sem <= totalSem; sem++) {
      const vals = [];
      for (let s = 1; s <= (parseInt(ex.series) || 3); s++) {
        const log = _pcLogs[ex.id + '|' + sem + '|' + s];
        if (log?.charge) {
          const v = _e1rm(log.charge, log.reps, log.rir);
          if (v) vals.push(v);
        }
      }
      data.push(vals.length ? Math.max(...vals) : null);
    }
    return { nom: ex.nom, data, color: colors[ei % colors.length] };
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
    `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:var(--muted);">
      <span style="display:inline-block;width:12px;height:2px;background:${s.color};border-radius:1px;"></span>
      ${esc(s.nom.length > 16 ? s.nom.substring(0, 15) + '…' : s.nom)}
    </span>`).join('');

  return `<div>
    <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">Progression charge</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible;">
      <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H-PAD}" stroke="#333" stroke-width="0.5"/>
      <line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD}" y2="${H-PAD}" stroke="#333" stroke-width="0.5"/>
      ${paths}
    </svg>
    <div style="display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;">${legend}</div>
  </div>`;
}

function _pcRightPanel(seance) {
  const musclesHtml = _pcMusclePanelHtml(seance);
  const chartHtml   = _pcRenderChart(seance);
  if (!musclesHtml && !chartHtml) return '';
  return `<div class="card" style="padding:12px;">
    ${chartHtml}
    ${musclesHtml && chartHtml ? '<div style="height:1px;background:var(--border);margin:8px 0;"></div>' : ''}
    ${musclesHtml}
  </div>`;
}

// Rendu des lignes de séries, factorisé pour être utilisé identiquement côté
// exercice prévu ET côté exercice équivalent (mêmes cibles, juste une source
// de logs et un handler de sauvegarde différents).
function _pcSetsHtml(nbSeries, semaine, getLog, getPrevLog, isReadonly, onchangeBuilder) {
  let html = '';
  for (let s = 1; s <= nbSeries; s++) {
    const log = getLog(s) || {};
    const prevLog = getPrevLog(s);
    let refPrec = '';
    if (prevLog && (prevLog.charge || prevLog.reps || prevLog.rir)) {
      const parts = [];
      if (prevLog.reps)   parts.push(prevLog.reps + ' reps');
      if (prevLog.charge) parts.push(prevLog.charge + ' kg');
      if (prevLog.rir)    parts.push('RIR ' + prevLog.rir);
      refPrec = `<div style="font-size:11px;color:#5a6172;margin-bottom:2px;padding-left:38px;">Sem ${semaine - 1} : ${parts.join(' · ')}</div>`;
    }
    const roAttr = isReadonly ? 'disabled style="opacity:.55;padding:6px 2px;"' : 'style="padding:6px 2px;"';
    html += refPrec + `<div class="set-row">
      <span class="set-num">S${s}</span>
      <input class="set-input" type="text" inputmode="decimal" placeholder="Rep"    value="${log.reps   != null ? log.reps   : ''}" ${isReadonly ? 'disabled' : `onchange="${onchangeBuilder(s,'reps')}"`}   ${roAttr}>
      <input class="set-input" type="text" inputmode="decimal" placeholder="Kg"     value="${log.charge != null ? log.charge : ''}" ${isReadonly ? 'disabled' : `onchange="${onchangeBuilder(s,'charge')}"`} ${roAttr}>
      <input class="set-input" type="text" inputmode="decimal" placeholder="RIR"    value="${esc(log.rir || '')}"                   ${isReadonly ? 'disabled' : `onchange="${onchangeBuilder(s,'rir')}"`}    ${roAttr}>
    </div>`;
  }
  return html;
}

function renderPcSeancePage() {
  const seance = _pcSeancesForBloc(_pcBlocId).find(s => s.id === _pcSeanceId)
    || _pcAllSeances().find(s => s.id === _pcSeanceId);
  if (!seance) { _pcSubPage = 'selector'; return renderPcSelectorPage(); }

  const cp          = _pcClientProgramme;
  const isReadonly  = !!(cp.bloc_actif_id && _pcBlocId !== cp.bloc_actif_id);
  const totalSem    = _pcSemainesForBloc(_pcBlocId);
  const blocSeances = _pcSeancesForBloc(_pcBlocId);

  const optsSemaines = Array.from({ length: totalSem }, (_, i) => i + 1)
    .map(i => `<option value="${i}" ${i === _pcSemaine ? 'selected' : ''}>Semaine ${i}</option>`).join('');
  const optsSeances = blocSeances.map(s => `<option value="${s.id}" ${s.id === _pcSeanceId ? 'selected' : ''}>${esc(s.titre)}</option>`).join('');

  const exercicesAvecEquiv = [];
  const exosHtml = (seance.client_programme_exercices || []).map((ex, idx) => {
    const nbSeries = parseInt(ex.series) || 3;
    const equiv = _pcEquivalents[ex.id];
    const setsHtml = _pcSetsHtml(nbSeries, _pcSemaine,
      s => _pcLogs[ex.id + '|' + _pcSemaine + '|' + s],
      s => _pcLogs[ex.id + '|' + (_pcSemaine - 1) + '|' + s],
      isReadonly,
      (s, field) => `pcSauverLog(${ex.id},${s},'${field}',this.value)`);
    const commentaireLog = _pcLogs[ex.id + '|' + _pcSemaine + '|1'] || {};
    const cibleLigne1 = [
      ex.series ? ex.series + ' séries' : '',
      ex.reps   ? '× ' + ex.reps        : ''
    ].filter(Boolean).join(' ');
    const cibleLigne2 = [
      ex.rir    ? 'RIR ' + ex.rir     : '',
      ex.repos  ? '⏱ ' + ex.repos    : '',
      ex.tempo  ? 'tempo ' + ex.tempo : ''
    ].filter(Boolean).join(' · ');

    _pcNotesCoach[idx] = { nom: ex.nom, note: ex.notes || '' };

    const panelPrevu = `${setsHtml}
      <textarea class="bilan-input" rows="3" placeholder="Note…"
        ${isReadonly ? 'disabled' : `onchange="pcSauverCommentaire(${ex.id},this.value)"`}
        style="margin-top:6px;font-size:16px;${isReadonly?'opacity:.55;':''}">${esc(commentaireLog.commentaire || '')}</textarea>
      ${!equiv && !isReadonly ? `<button onclick="pcOuvrirCreerEquivalent(${ex.id})" style="margin-top:8px;width:100%;background:transparent;border:1px dashed #378ADD66;border-radius:8px;padding:8px;color:#378ADD;font-size:12px;font-weight:600;cursor:pointer;">🔁 Exercice indisponible ? Créer un équivalent</button>` : ''}`;

    let bodyHtml;
    if (equiv) {
      exercicesAvecEquiv.push(ex.id);
      const setsHtmlEquiv = _pcSetsHtml(nbSeries, _pcSemaine,
        s => _pcEquivLogs[equiv.id + '|' + _pcSemaine + '|' + s],
        s => _pcEquivLogs[equiv.id + '|' + (_pcSemaine - 1) + '|' + s],
        isReadonly,
        (s, field) => `pcSauverLogEquivalent(${equiv.id},${s},'${field}',this.value)`);
      const equivCommentLog = _pcEquivLogs[equiv.id + '|' + _pcSemaine + '|1'] || {};
      bodyHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <button id="pcEquivPrev_${ex.id}" onclick="pcEquivSliderAller(${ex.id},-1)" style="width:30px;height:30px;border-radius:50%;background:#378ADD22;border:1px solid #378ADD55;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div id="pcEquivDots_${ex.id}" style="flex:1;text-align:center;font-size:11.5px;font-weight:700;color:var(--muted);">Exercice prévu</div>
          <button id="pcEquivNext_${ex.id}" onclick="pcEquivSliderAller(${ex.id},1)" style="width:30px;height:30px;border-radius:50%;background:#a78bfa22;border:1px solid #a78bfa55;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div id="pcEquivSlider_${ex.id}" style="display:flex;overflow-x:scroll;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;gap:0;">
          <div style="min-width:100%;scroll-snap-align:start;box-sizing:border-box;">${panelPrevu}</div>
          <div style="min-width:100%;scroll-snap-align:start;box-sizing:border-box;">
            <div style="font-size:11px;color:#a78bfa;font-weight:600;margin-bottom:8px;">≡ ${esc(equiv.nom)}</div>
            ${setsHtmlEquiv}
            <textarea class="bilan-input" rows="3" placeholder="Note…"
              ${isReadonly ? 'disabled' : `onchange="pcSauverCommentaireEquivalent(${equiv.id},this.value)"`}
              style="margin-top:6px;font-size:16px;${isReadonly?'opacity:.55;':''}">${esc(equivCommentLog.commentaire || '')}</textarea>
            ${!isReadonly ? `<button onclick="pcSupprimerEquivalent(${ex.id},${equiv.id})" style="margin-top:8px;width:100%;background:transparent;border:1px solid #e05c5c55;border-radius:8px;padding:8px;color:#e05c5c;font-size:12px;font-weight:600;cursor:pointer;">🗑 Supprimer cet exercice équivalent</button>` : ''}
          </div>
        </div>`;
    } else {
      bodyHtml = panelPrevu;
    }

    const editerActif = _pcEditMode && !isReadonly && _pcAutoEdition();
    const editToolbar = editerActif ? `
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button onclick="pcDeplacerExo(${ex.id},-1)" style="padding:7px 10px;background:#2d3142;border:none;border-radius:8px;color:#fff;font-size:13px;cursor:pointer;">▲</button>
        <button onclick="pcDeplacerExo(${ex.id},1)" style="padding:7px 10px;background:#2d3142;border:none;border-radius:8px;color:#fff;font-size:13px;cursor:pointer;">▼</button>
        <button onclick="pcOuvrirPickerExo({type:'remplacer',exId:${ex.id}})" style="flex:1;padding:7px;background:#378ADD22;border:1px solid #378ADD55;border-radius:8px;color:#378ADD;font-size:12px;font-weight:600;cursor:pointer;">🔁 Remplacer</button>
        <button onclick="pcSupprimerExo(${ex.id})" style="padding:7px 10px;background:#e05c5c22;border:1px solid #e05c5c55;border-radius:8px;color:#e05c5c;font-size:13px;cursor:pointer;">🗑</button>
      </div>` : '';

    return `<div class="card" style="padding:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px;gap:6px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:7px;">
            <div style="font-size:14px;font-weight:600;line-height:1.3;">${idx + 1}. ${esc(ex.nom)}</div>
            ${ex.notes ? `<button onclick="pcAfficherNoteCoach(${idx})" style="background:#4f8ef722;border:1px solid #4f8ef755;border-radius:50%;width:24px;height:24px;padding:0;font-size:13px;cursor:pointer;line-height:24px;text-align:center;flex-shrink:0;">💬</button>` : ''}
          </div>
          ${cibleLigne1 ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${cibleLigne1}</div>` : ''}
          ${cibleLigne2 ? `<div style="font-size:11px;color:#5a8aaa;margin-top:1px;">${cibleLigne2}</div>` : ''}
        </div>
        ${ex.repos ? `<button class="chrono-btn-trigger" data-repos="${esc(ex.repos).replace(/"/g,'&quot;')}" style="min-width:44px;min-height:44px;border-radius:10px;background:#2d3142;border:none;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;">⏱</button>` : ''}
      </div>
      ${bodyHtml}
      ${editToolbar}
    </div>`;
  });

  const editerActifGlobal = _pcEditMode && !isReadonly && _pcAutoEdition();
  const inserter = ordreInsertion => `<div style="display:flex;justify-content:center;margin:2px 0;">
    <button onclick="pcOuvrirPickerExo({type:'ajouter',seanceId:${seance.id},ordreInsertion:${ordreInsertion}})" style="width:32px;height:32px;border-radius:50%;background:#378ADD22;border:1px dashed #378ADD66;color:#378ADD;font-size:17px;line-height:1;cursor:pointer;">+</button>
  </div>`;
  let exosHtmlFinal;
  if (editerActifGlobal) {
    const blocks = [inserter(0)];
    exosHtml.forEach((block, i) => { blocks.push(block); blocks.push(inserter(i + 1)); });
    exosHtmlFinal = blocks.join('');
  } else {
    exosHtmlFinal = exosHtml.join('') || `<div class="empty"><div class="empty-text">Aucun exercice dans cette séance.</div></div>`;
  }

  setTimeout(() => {
    exercicesAvecEquiv.forEach(exId => {
      const slider = document.getElementById(`pcEquivSlider_${exId}`);
      const dots = document.getElementById(`pcEquivDots_${exId}`);
      if (!slider) return;
      const equiv = _pcEquivalents[exId];
      const prevBtn = document.getElementById(`pcEquivPrev_${exId}`);
      const nextBtn = document.getElementById(`pcEquivNext_${exId}`);
      const majLabel = () => {
        const optIdx = Math.min(1, Math.round(slider.scrollLeft / (slider.clientWidth || 1)));
        if (dots) {
          dots.textContent = optIdx === 0 ? 'Exercice prévu' : `≡ ${equiv ? equiv.nom : 'Équivalent'}`;
          dots.style.color = optIdx === 0 ? '#378ADD' : '#a78bfa';
        }
        // Rien avant le premier panneau, rien après le dernier — la flèche
        // correspondante disparaît plutôt que de rester cliquable dans le vide.
        if (prevBtn) prevBtn.style.visibility = optIdx === 0 ? 'hidden' : 'visible';
        if (nextBtn) nextBtn.style.visibility = optIdx === 1 ? 'hidden' : 'visible';
      };
      slider.addEventListener('scroll', majLabel, { passive: true });
      majLabel();
    });
  }, 150);

  const rightPanel = _pcRightPanel(seance);
  return `<div id="app">
    ${renderHeader(esc(seance.titre), 'Semaine ' + _pcSemaine, false)}
    <div class="page">
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <select class="t-select" style="flex:1;font-size:16px;" onchange="pcChangerSeanceNav(this.value)">${optsSeances}</select>
        <select class="t-select" style="flex:1;font-size:16px;" onchange="pcChangerSemaineNav(this.value)">${optsSemaines}</select>
      </div>
      ${isReadonly ? `<div style="font-size:12px;color:var(--text-muted);background:var(--surface-2);border-radius:8px;padding:8px 12px;margin-bottom:12px;">👁 Lecture seule — ce bloc n'est pas actif. Aucune saisie possible.</div>` : ''}
      ${(_pcAutoEdition() && !isReadonly) ? `<button class="btn-secondary" onclick="pcToggleEdition()" style="margin-bottom:12px;width:100%;">${_pcEditMode ? '✅ Terminer la modification' : '✏️ Modifier cette séance'}</button>` : ''}
      ${rightPanel ? `<div style="margin-bottom:12px;">${rightPanel}</div>` : ''}
      ${exosHtmlFinal}
      ${!isReadonly ? `<button id="pcValiderSeanceBtn" class="btn-primary" onclick="pcValiderSeance()" style="margin-top:8px;width:100%;">✅ Valider la séance</button>` : ''}
      <button class="btn-secondary" onclick="pcRetourSelector()" style="margin-top:8px;width:100%;">← Retour</button>
    </div>
    ${renderNavBar('training')}
  </div>`;
}

// ── Interactions ────────────────────────────────────────────────────────

function pcChangerSemaine(val) { _pcSemaine = parseInt(val) || 1; setPage('programme-client'); }
function pcChangerSeance(val)  { _pcSeanceId = parseInt(val) || val; setPage('programme-client'); }
function pcChangerBloc(blocId) {
  _pcBlocId  = blocId;
  _pcSemaine = 1;
  const firstSeance = _pcSeancesForBloc(blocId)[0];
  _pcSeanceId = firstSeance ? firstSeance.id : null;
  setPage('programme-client');
}

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

const XP_SEANCE_VALIDEE = 10;

// Valide la séance du jour : coche training=true dans le vrai bilan de la
// semaine en cours (comme verifierEtCocherTraining côté PWA) et crédite
// l'XP séance — une seule fois par jour, dédoublonné via
// jours[idx].seance_validee (pas un flag localStorage).
async function pcValiderSeance() {
  const btn = document.getElementById('pcValiderSeanceBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const clientId = getClient();
    const { id, jours } = await _supaBilanNonEnvoye(clientId);
    const idx = _jourIdxAujourdhui();
    const jourAuj = jours[idx] || {};
    if (jourAuj.seance_validee) {
      showToast('Tu as déjà validé une séance aujourd\'hui. Reviens demain !', '#f0a500');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Valider la séance'; }
      return;
    }
    jours[idx] = { ...jourAuj, training: true, seance_validee: true };
    await _supaPatchJoursBilan(id, jours);
    const xpGagne = await _supaIncrementerXpTotal(clientId, XP_SEANCE_VALIDEE);
    _pcFlashSeanceValidee(xpGagne);
    if (typeof rafraichirProgressionEtDeblocages === 'function') rafraichirProgressionEtDeblocages();
  } catch(e) {
    showToast('Erreur : ' + e.message, '#c0392b');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Valider la séance'; }
  }
}

function _pcFlashSeanceValidee(xpGagne) {
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1D9E75;color:#fff;padding:20px 32px;border-radius:18px;font-size:20px;font-weight:700;z-index:9999;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.4);pointer-events:none;';
  flash.innerHTML = '🏆 Séance validée !' + ((xpGagne && !(typeof modeSimplifieActif === 'function' && modeSimplifieActif())) ? `<div style="font-size:15px;margin-top:6px;">🎉 +${xpGagne} XP</div>` : '');
  document.body.appendChild(flash);
  setTimeout(() => { flash.style.transition = 'opacity .5s'; flash.style.opacity = '0'; setTimeout(() => flash.remove(), 500); }, 2200);
}

async function pcSauverLog(exerciceId, serie, field, value) {
  const key = exerciceId + '|' + _pcSemaine + '|' + serie;
  const current = _pcLogs[key] || {
    client_programme_exercice_id: exerciceId,
    semaine: _pcSemaine,
    numero_serie: serie,
    charge: null, reps: null, rir: null, commentaire: null
  };
  const parsed = field === 'charge' ? (parseFloat((value + '').replace(',', '.')) || null)
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

// Copie exacte du pattern anti-race-condition de pcSauverLog, juste vers la
// table dédiée aux exercices équivalents (clé equivalentId au lieu de exerciceId).
async function pcSauverLogEquivalent(equivalentId, serie, field, value) {
  const key = equivalentId + '|' + _pcSemaine + '|' + serie;
  const current = _pcEquivLogs[key] || {
    equivalent_id: equivalentId,
    semaine: _pcSemaine,
    numero_serie: serie,
    charge: null, reps: null, rir: null, commentaire: null
  };
  const parsed = field === 'charge' ? (parseFloat((value + '').replace(',', '.')) || null)
    : field === 'reps'   ? (parseInt(value)   || null)
    : (value || null);
  _pcEquivLogs[key] = Object.assign({}, current, { [field]: parsed });

  _pcEquivSaveQueues[key] = (_pcEquivSaveQueues[key] || Promise.resolve()).then(async () => {
    const log = _pcEquivLogs[key];
    try {
      if (log.id) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/client_programme_logs_equivalents?id=eq.${log.id}`,
          { method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ [field]: parsed }) }
        );
      } else {
        const l = _pcEquivLogs[key];
        const body = { equivalent_id: equivalentId, semaine: _pcSemaine, numero_serie: serie };
        if (l.charge      != null) body.charge      = l.charge;
        if (l.reps        != null) body.reps        = l.reps;
        if (l.rir         != null) body.rir         = l.rir;
        if (l.commentaire != null) body.commentaire = l.commentaire;
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/client_programme_logs_equivalents?on_conflict=equivalent_id,semaine,numero_serie`,
          { method: 'POST', headers: supaHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }), body: JSON.stringify(body) }
        );
        if (res.ok) {
          const rows = await res.json();
          if (rows[0]?.id) _pcEquivLogs[key] = Object.assign({}, _pcEquivLogs[key], { id: rows[0].id });
        }
      }
    } catch(e) {}
  });
}

async function pcSauverCommentaireEquivalent(equivalentId, value) {
  await pcSauverLogEquivalent(equivalentId, 1, 'commentaire', value);
}

function pcAfficherNoteCoach(idx) {
  const exo = _pcNotesCoach[idx];
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

// ── Chrono ─────────────────────────────────────────────────────────────
// Anti-drift : on mémorise l'heure de fin absolue (Date.now()) plutôt qu'un
// compteur décrémenté. Quand l'écran se déverrouille et que setInterval reprend,
// le prochain tick() recalcule le temps restant depuis l'horloge réelle → plus
// de décalage accumulé. visibilitychange force un tick immédiat au retour.
//
// L'overlay est attaché à document.body (pas au rendu de la page) pour survivre
// aux navigations et garantir son existence quelle que soit la page affichée.

function _pcGetOverlay() {
  let el = document.getElementById('pcChronoOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pcChronoOverlay';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

let _pcChronoInterval = null;
let _pcTemps = 90;           // secondes configurées (avant lancement)
let _pcEndTime = null;       // timestamp ms de fin (après lancement)
let _pcJobId = null;         // id timer_jobs pour annulation push
let _pcChronoDone = false;
let _pcAudioCtx = null;

// Délégation d'événement sur document : fonctionne pour tous les boutons
// chrono présents ou futurs (re-render de la page) sans avoir à re-bind.
// data-repos passe par un attribut HTML (pas un onclick inline) pour éviter
// tout risque de casse de syntaxe JS quand ex.repos contient une apostrophe
// (ex: "1'30" — bug vécu : le clic ne faisait rien, aucune erreur visible).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.chrono-btn-trigger');
  if (btn) pcLancerChrono(btn.dataset.repos || '');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _pcChronoInterval && _pcEndTime && !_pcChronoDone) {
    _pcTickChrono();
  }
});

function pcLancerChrono(repos) {
  let totalSec = 0;
  const match = (repos + '').match(/(\d+)'?\s*(\d+)?/);
  if (match) { totalSec = (parseInt(match[1]) || 0) * 60 + (parseInt(match[2]) || 0); }
  if (!totalSec) totalSec = 90;
  _pcTemps = totalSec;
  _pcAfficherReglageChrono();
}

function _pcAfficherReglageChrono() {
  const overlay = _pcGetOverlay();
  if (!overlay) return;
  const m = Math.floor(_pcTemps / 60), s = _pcTemps % 60;
  overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a1d29;color:white;padding:24px 20px;text-align:center;z-index:2000;border-top:2px solid #378ADD;display:block;';
  overlay.innerHTML = `
    <div style="font-size:13px;color:#8892a4;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em;">Temps de repos</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px;">
      <button onclick="pcAjusterChrono(-30)" style="padding:8px 12px;border-radius:20px;background:#2d3142;color:#8892a4;border:none;font-size:13px;cursor:pointer;">−30s</button>
      <button onclick="pcAjusterChrono(-15)" style="width:44px;height:44px;border-radius:50%;background:#2d3142;color:white;border:none;font-size:20px;cursor:pointer;">−</button>
      <div style="font-size:42px;font-weight:700;min-width:120px;">${m}:${s.toString().padStart(2, '0')}</div>
      <button onclick="pcAjusterChrono(15)" style="width:44px;height:44px;border-radius:50%;background:#2d3142;color:white;border:none;font-size:20px;cursor:pointer;">+</button>
      <button onclick="pcAjusterChrono(30)" style="padding:8px 12px;border-radius:20px;background:#2d3142;color:#8892a4;border:none;font-size:13px;cursor:pointer;">+30s</button>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">
      ${[60,90,120,180].map(v => `<button onclick="pcSetChrono(${v})" style="padding:6px 10px;border-radius:12px;background:${_pcTemps===v?'#378ADD':'#2d3142'};color:white;border:none;font-size:12px;cursor:pointer;">${v<60?v+'s':Math.floor(v/60)+'min'+(v%60?String(v%60).padStart(2,'0'):'')}</button>`).join('')}
    </div>
    <div style="display:flex;gap:10px;">
      <button onclick="pcDemarrerChrono()" style="flex:1;padding:14px;background:#378ADD;color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">▶ Lancer</button>
      <button onclick="pcStopChrono()" style="padding:14px 20px;background:#2d3142;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">✕</button>
    </div>`;
}

function pcAjusterChrono(delta) { _pcTemps = Math.max(5, _pcTemps + delta); _pcAfficherReglageChrono(); }
function pcSetChrono(sec) { _pcTemps = sec; _pcAfficherReglageChrono(); }

function _pcTickChrono() {
  const overlay = _pcGetOverlay();
  if (!overlay || _pcChronoDone) return;
  const restant = Math.max(0, Math.round((_pcEndTime - Date.now()) / 1000));
  const m = Math.floor(restant / 60), s = restant % 60;
  const urgent = restant <= 10 && restant > 0;
  overlay.style.background = urgent ? '#8B1A1A' : '#378ADD';
  overlay.innerHTML = `
    <div style="font-size:56px;font-weight:700;letter-spacing:-1px;">${m}:${s.toString().padStart(2,'0')}</div>
    <div style="font-size:14px;margin-top:10px;cursor:pointer;opacity:.7;" onclick="pcStopChrono()">Arrêter ✕</div>`;
  if (restant <= 0) {
    _pcChronoDone = true;
    clearInterval(_pcChronoInterval);
    _pcChronoInterval = null;
    overlay.style.background = '#1D9E75';
    overlay.innerHTML = `<div style="font-size:32px;font-weight:700;">✅ Repos terminé !</div>
      <div style="font-size:14px;margin-top:10px;cursor:pointer;opacity:.8;" onclick="pcStopChrono()">Fermer ✕</div>`;
    if (navigator.vibrate) navigator.vibrate([300,100,300,100,300]);
    _pcJouerBeepFin();
  }
}

// Joue le bip de fin IMMÉDIATEMENT (jamais pré-programmé longtemps à l'avance)
// — un AudioContext se fait suspendre par l'OS quand l'écran se verrouille ;
// des oscillateurs programmés minutes à l'avance via start(t) se retrouvent
// à sonner n'importe quand (souvent très en retard) une fois le contexte
// relancé au retour au premier plan. Ce tick n'est de toute façon exécuté que
// quand l'app est visible (foreground) ou vient de le redevenir
// (visibilitychange ci-dessous) — jamais pendant que l'écran est verrouillé,
// où seul le push serveur (voir pcDemarrerChrono) prend le relais.
function _pcJouerBeepFin() {
  try {
    if (!_pcAudioCtx) _pcAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_pcAudioCtx.state === 'suspended') _pcAudioCtx.resume();
    const debut = _pcAudioCtx.currentTime + 0.03;
    for (let i = 0; i < 5; i++) {
      const osc = _pcAudioCtx.createOscillator(), gain = _pcAudioCtx.createGain();
      osc.connect(gain); gain.connect(_pcAudioCtx.destination);
      osc.frequency.value = i < 3 ? 880 : 1047;
      osc.type = 'sine';
      const t = debut + i * 0.25;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.04);
      gain.gain.linearRampToValueAtTime(0, t + 0.18);
      osc.start(t); osc.stop(t + 0.2);
    }
  } catch(e) {}
}

async function pcDemarrerChrono() {
  if (_pcChronoInterval) clearInterval(_pcChronoInterval);
  _pcEndTime = Date.now() + _pcTemps * 1000;
  _pcChronoDone = false;

  // Planifier le push serveur (filet de sécurité si app fermée/écran verrouillé) —
  // appel direct à l'edge function avec delay_ms : elle attend elle-même exactement
  // ce délai côté serveur (EdgeRuntime.waitUntil) avant d'envoyer, précision à la
  // seconde. pg_cron sur cette instance n'exécute qu'à la minute près (le 6e champ
  // "secondes" est silencieusement ignoré), trop imprécis pour un repos court — voir
  // supabase/functions/send-push/index.ts. La fonction insère elle-même la ligne
  // timer_jobs (utilisée ici seulement pour l'annulation, cf. pcStopChrono) et renvoie
  // son id.
  _pcJobId = null;
  if (typeof S !== 'undefined' && S.client) {
    fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        client_id: S.client,
        title: '⏱ Repos terminé !',
        body: 'C\'est reparti 💪',
        urgent: true,
        delay_ms: _pcTemps * 1000,
        // Deep-link : ramène le client exactement sur la séance/semaine affichée au moment du
        // clic "Lancer" — pas une reconstitution a posteriori (ex: "première séance
        // incomplète"), qui serait fausse si le client re-remplit une séance déjà validée.
        page: 'training',
        semaine: _pcSemaine,
        seance_id: _pcSeanceId,
      })
    }).then(r => r.ok ? r.json() : null).then(j => { if (j && j.job_id != null) _pcJobId = j.job_id; }).catch(() => {});
  }

  // Le bip n'est plus pré-programmé ici (voir _pcJouerBeepFin) — seulement
  // "réveiller" l'AudioContext sous le geste utilisateur du clic "Lancer",
  // requis par les navigateurs pour autoriser l'audio plus tard.
  try {
    if (!_pcAudioCtx) _pcAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_pcAudioCtx.state === 'suspended') _pcAudioCtx.resume();
  } catch(e) {}

  _pcTickChrono();
  _pcChronoInterval = setInterval(_pcTickChrono, 500);
}

function pcStopChrono() {
  if (_pcChronoInterval) { clearInterval(_pcChronoInterval); _pcChronoInterval = null; }
  // Annuler le push serveur si le timer est stoppé manuellement
  if (_pcJobId) {
    fetch(`${SUPABASE_URL}/rest/v1/timer_jobs?id=eq.${_pcJobId}`, {
      method: 'PATCH',
      headers: supaHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ cancelled: true })
    }).catch(() => {});
    _pcJobId = null;
  }
  _pcEndTime = null;
  _pcChronoDone = false;
  const overlay = _pcGetOverlay();
  if (overlay) overlay.style.display = 'none';
}
