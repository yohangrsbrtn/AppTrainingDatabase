// ── Diète page ────────────────────────────────────────────────────────

let _dSubPage = 'list'; // 'list' | 'detail' | 'menus' | 'journal'
let _dDietes  = [];
let _dDetail  = null;
let _dNom     = '';

// ── Mes menus (aliments base coach + communauté, combinés en recettes perso) ──
let _dMenus      = null; // null = jamais chargé
let _dMenuVue    = 'liste'; // 'liste' | 'creation'
let _dMenuDraft  = null; // { nom, aliments: [] } en cours de construction

// ── Mon journal (jours perso, jusqu'à 7 repas, chacun = repas coach ou menu) ──
// Chaque jour peut avoir une "diète cible" (Type='cible' dans JournalDiete) : les repas du
// jour sont alors affichés en emplacements fixes "Repas 1"…"Repas N" (N = nb de repas de la
// diète cible), chacun avec la cible de macros du repas correspondant — pour faire des
// équivalences. Sans cible, 7 emplacements génériques sans cible affichée.
let _dJournal             = null; // null = jamais chargé, sinon liste brute de slots (incl. la ligne 'cible')
let _dJournalDateOuverte  = '';   // date (dd/MM/yyyy) du jour ouvert, '' = liste des jours
let _dJournalCibleEtape   = null; // null | 'choix' — sélection de la diète cible du jour
let _dJournalSlotEnEdition= null; // 1-7 : numéro du "Repas N" en cours de remplissage
let _dJournalAjoutEtape   = null; // null | 'choix' | 'coach-dietes' | 'coach-repas' | 'menu' | 'compose'
let _dJournalDieteChoisie = null; // { ligne, col, nom, repas } — diète en cours de parcours (choix d'un repas coach)
let _dDieteDetailCache    = {};   // "ligne|col" -> détail chargerDieteParPosition (résolution cible + slots coach)

// ── Modale de recherche/ajout/création d'aliment (alimente _dMenuDraft) ──────
let _dBaseAliments          = null;
let _dAjoutEtape            = 'recherche'; // 'recherche' | 'quantite' | 'creation' | 'scan'
let _dAjoutSelection        = null;
let _dModifIndex            = null; // index dans _dMenuDraft.aliments en cours de modification (null = ajout d'un nouvel aliment)
let _dCreationNomPrerempli  = '';
let _dCreationPrefill       = null; // {kcal100,prot100,glu100,sucres100,fibres100,lip100,ags100} posé par un scan avec match Open Food Facts
let _dCreationCodeBarre     = null; // code-barres scanné en attente de rattachement au prochain aliment créé
let _dScanInstance          = null; // instance Html5Qrcode active (pour pouvoir l'arrêter proprement)
let _dScanLibPromise        = null; // promesse de chargement du script CDN html5-qrcode (chargé une seule fois)
let _dScanTraitementEnCours = false; // verrou anti double-décodage pendant le traitement d'un scan (match local ou fetch OFF)

// Garde-fou anti double-tap : un bouton "Créer"/"Ajouter"/"Enregistrer" tapé deux fois
// rapidement (avant la fin de l'appel réseau précédent) créait autant de lignes en
// double côté serveur (bug réel constaté sur la création d'aliment). Tous les boutons
// d'action de cette page passent par _guardAction(fn, this) au lieu d'appeler la fonction
// directement, pour n'exécuter qu'un seul appel à la fois — et pour griser visuellement
// le bouton tapé le temps de l'appel réseau (les gens re-tapent sinon, pensant que ça n'a
// pas marché). `this` dans un attribut onclick pointe l'élément cliqué, d'où l'appel
// _guardAction(fn, this) plutôt qu'un simple _guardAction(fn).
let _dActionEnCours = false;
async function _guardAction(fn, btn) {
  if (_dActionEnCours) return;
  _dActionEnCours = true;
  let htmlOriginal = null;
  if (btn) {
    htmlOriginal = btn.innerHTML;
    btn.style.opacity = '0.55';
    btn.style.pointerEvents = 'none';
    btn.innerHTML = '<span class="spin" style="width:15px;height:15px;border-width:2px;vertical-align:middle;"></span>';
  }
  try {
    await fn();
  } finally {
    _dActionEnCours = false;
    // Si l'action a réussi, setPage() a déjà remplacé tout le DOM (ce bouton n'existe
    // plus) — ne restaurer que si l'élément est toujours présent (cas d'erreur/annulation).
    if (btn && htmlOriginal !== null && document.body.contains(btn)) {
      btn.innerHTML = htmlOriginal;
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    }
  }
}

async function loadDiete() {
  if (_pf.diete) {
    _dDietes  = _pf.diete;
    _pf.diete = null;
    _dSubPage = 'list';
    setPage('diete');
    schedulerPrechargement();
    return;
  }
  setPage('diete-loading');
  try {
    _dDietes  = await api('listerDietes');
    _dSubPage = 'list';
    setPage('diete');
    schedulerPrechargement();
  } catch(e) { setPage('home'); }
}

async function ouvrirDiete(ligne, col, nom) {
  _dNom = nom;
  setPage('diete-loading');
  try {
    _dDetail = await api('chargerDieteParPosition', { ligneTitre: ligne, colTitre: col });
    _dSubPage = 'detail';
    setPage('diete');
  } catch(e) { setPage('diete'); }
}

async function switchDieteTab(tab) {
  _dSubPage = tab;
  if (tab === 'menus') _dMenuVue = 'liste';
  if (tab === 'journal') _dJournalAjoutEtape = null;
  const chargerMenus   = (tab === 'menus' || tab === 'journal') && _dMenus === null;
  const chargerJournal = tab === 'journal' && _dJournal === null;
  if (chargerMenus || chargerJournal) {
    setPage('diete-loading');
    // En parallèle (plus rapide) — et surtout, en cas d'échec réseau on laisse _dMenus/_dJournal
    // à null plutôt que de les remplacer par [] : un [] silencieux se rend exactement comme
    // "vraiment vide" (écran "Aucun jour enregistré"/"Aucun menu créé"), ce qui pouvait laisser
    // croire que rien n'avait été enregistré et pousser à recréer une entrée en double. null
    // déclenche à la place un écran "Erreur de chargement" avec un vrai bouton Réessayer.
    const taches = [];
    if (chargerMenus)   taches.push(api('listerMenus').then(r => { _dMenus = r; }).catch(() => { _dMenus = null; }));
    if (chargerJournal) taches.push(api('listerJournal').then(r => { _dJournal = r; }).catch(() => { _dJournal = null; }));
    await Promise.all(taches);
  }
  setPage('diete');
}

// ── Render ────────────────────────────────────────────────────────────

function renderDietePage() {
  if (S.page === 'diete-loading') {
    return `<div id="app">${renderHeader('Ma Diète','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('diete')}</div>`;
  }
  if (_dSubPage === 'detail' && _dDetail) return renderDieteDetail();
  if (_dSubPage === 'menus') return renderDieteMenus();
  if (_dSubPage === 'journal') return renderDieteJournal();
  return renderDieteList();
}

function renderDieteTabs(actif) {
  const tabs = [['list','Diètes'], ['menus','Mes menus'], ['journal','Mon journal']];
  return `<div style="display:flex;gap:6px;padding:0 16px 12px;">
    ${tabs.map(([key,label]) => `
      <button onclick="switchDieteTab('${key}')" style="flex:1;padding:9px 4px;border-radius:10px;border:1px solid ${actif===key?'#a78bfa':'var(--border)'};background:${actif===key?'#a78bfa22':'transparent'};color:${actif===key?'#a78bfa':'var(--muted)'};font-size:12px;font-weight:700;cursor:pointer;">${label}</button>`).join('')}
  </div>`;
}

function renderDieteList() {
  const body = (!_dDietes || _dDietes.length === 0)
    ? `<div class="empty"><div class="empty-icon">🥗</div><div class="empty-text">Aucune diète trouvée.</div></div>`
    : _dDietes.map(d => `
      <div class="diete-item" onclick="ouvrirDiete(${d.ligne}, ${d.col}, '${(d.nom||'').replace(/'/g,"\\'")}')">
        <div class="diete-bar"></div>
        <span style="padding-left:8px;font-size:15px;font-weight:700;">${esc(d.nom)}</span>
        <div class="diete-arrow">›</div>
      </div>`).join('');

  return `<div id="app">
    ${renderHeader('Ma Diète', '', false)}
    ${renderDieteTabs('list')}
    <div class="page">${body}</div>
    ${renderNavBar('diete')}
  </div>`;
}

// Totaux par (repas, équivalence) — recalculés à chaque swipe pour mettre à
// jour les totaux du haut sans re-render complet. _dCurrentOpt[i] = index de
// l'équivalence actuellement affichée pour le repas i (0 = repas de base).
let _dOptionTotals = [];
let _dCurrentOpt   = [];

function _sommeAliments(aliments) {
  let cals = 0, prot = 0, glu = 0, lip = 0;
  (aliments || []).forEach(a => {
    cals += a.cals != null ? a.cals : (a.kcal || 0);
    prot += a.prot || 0;
    glu  += a.glu  || 0; lip  += a.lip  || 0;
  });
  return { cals, prot, glu, lip };
}

function _recalcDieteTotal() {
  let tCals = 0, tProt = 0, tGlu = 0, tLip = 0;
  _dOptionTotals.forEach((options, i) => {
    const t = options[_dCurrentOpt[i] || 0] || options[0];
    if (!t) return;
    tCals += t.cals; tProt += t.prot; tGlu += t.glu; tLip += t.lip;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = Math.round(v); };
  set('dTotKcal', tCals); set('dTotProt', tProt); set('dTotGlu', tGlu); set('dTotLip', tLip);
}

function renderDieteDetail() {
  const data = _dDetail;
  _dOptionTotals = [];
  _dCurrentOpt = [];

  let repasHtml = '';
  (data.repas || []).forEach((r, idx) => {
    const options = [r].concat(r.equivalences || []);
    const hasOpts = options.length > 1;

    _dOptionTotals[idx] = options.map(opt => _sommeAliments(opt.aliments));
    _dCurrentOpt[idx] = 0;

    repasHtml += `<div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px;">
        <div style="font-size:15px;font-weight:600;">${esc(r.nom)}</div>
        ${hasOpts ? `<div id="dDots_${idx}" style="font-size:11px;font-weight:600;color:var(--muted);white-space:nowrap;">1 / ${options.length}</div>` : ''}
      </div>`;

    if (hasOpts) {
      repasHtml += `<div id="dSlider_${idx}" style="display:flex;overflow-x:scroll;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;gap:0;">`;
      options.forEach((opt, oIdx) => {
        repasHtml += `<div style="min-width:100%;scroll-snap-align:start;box-sizing:border-box;">
          ${oIdx > 0 ? `<div style="font-size:11px;color:#a78bfa;font-weight:600;margin-bottom:8px;">≡ ${esc(opt.nom)}</div>` : ''}
          ${rendreCorpsRepas(opt)}
        </div>`;
      });
      repasHtml += `</div>`;
    } else {
      repasHtml += rendreCorpsRepas(options[0]);
    }

    repasHtml += `</div>`;
  });

  const t0 = _dOptionTotals.reduce((acc, options) => {
    const t = options[0];
    acc.cals += t.cals; acc.prot += t.prot; acc.glu += t.glu; acc.lip += t.lip;
    return acc;
  }, { cals: 0, prot: 0, glu: 0, lip: 0 });

  return `<div id="app">
    ${renderHeader(esc(_dNom), 'Ma Diète', false)}
    <div id="dStickyMacros" style="position:sticky;top:0;z-index:90;background:var(--bg);padding:10px 16px;box-shadow:0 8px 12px -6px rgba(0,0,0,.4);">
      <div class="card" style="display:flex;justify-content:space-around;text-align:center;padding:14px 8px;margin-bottom:0;">
        <div><div style="font-size:20px;font-weight:700;" id="dTotKcal">${Math.round(t0.cals)}</div><div class="macro-label">KCAL</div></div>
        <div><div style="font-size:20px;font-weight:700;color:#378ADD;" id="dTotProt">${Math.round(t0.prot)}</div><div class="macro-label">PROT</div></div>
        <div><div style="font-size:20px;font-weight:700;color:var(--green);" id="dTotGlu">${Math.round(t0.glu)}</div><div class="macro-label">GLU</div></div>
        <div><div style="font-size:20px;font-weight:700;color:#D85A30;" id="dTotLip">${Math.round(t0.lip)}</div><div class="macro-label">LIP</div></div>
      </div>
    </div>
    <div class="page">
      <button class="btn-secondary" onclick="loadDiete()" style="margin-bottom:12px;">← Retour</button>
      ${repasHtml}
    </div>
    ${renderNavBar('diete')}
  </div>`;
}

function rendreCorpsRepas(r) {
  let sCals = 0, sProt = 0, sGlu = 0, sLip = 0;
  (r.aliments || []).forEach(a => {
    const cals = a.cals != null ? a.cals : (a.kcal || 0);
    sCals += cals; sProt += a.prot || 0;
    sGlu  += a.glu  || 0; sLip += a.lip || 0;
  });

  const aliments = (r.aliments || []).map(a => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
      <div style="font-size:14px;">${esc(a.nom)}${a.modifie ? `<span style="display:inline-block;font-size:8px;font-weight:700;color:#f59e0b;background:#f59e0b18;border:1px solid #f59e0b44;border-radius:3px;padding:1px 4px;margin-left:5px;vertical-align:middle;">modifié</span>` : ''}</div>
      <div style="font-size:13px;color:var(--muted);white-space:nowrap;margin-left:10px;">${a.qte != null ? a.qte : Math.round(a.quantite||0)}${a.unite ? ' ' + a.unite : 'g'}</div>
    </div>`).join('');

  return `${aliments}
    <div style="display:flex;justify-content:space-around;text-align:center;margin-top:10px;padding-top:10px;border-top:1px solid #378ADD;">
      <div><span style="font-size:14px;font-weight:600;">${Math.round(sCals)}</span><div class="macro-label">KCAL</div></div>
      <div><span style="font-size:14px;font-weight:600;color:#378ADD;">${Math.round(sProt)}</span><div class="macro-label">PROT</div></div>
      <div><span style="font-size:14px;font-weight:600;color:var(--green);">${Math.round(sGlu)}</span><div class="macro-label">GLU</div></div>
      <div><span style="font-size:14px;font-weight:600;color:#D85A30;">${Math.round(sLip)}</span><div class="macro-label">LIP</div></div>
    </div>`;
}

// ── Onglet "Mes menus" ───────────────────────────────────────────────────────

// Affiché quand un fetch échoue (switchDieteTab laisse _dMenus/_dJournal à null dans ce cas,
// au lieu de [] silencieusement) — jamais confondre "erreur réseau" avec "vraiment vide", sinon
// on laisse croire qu'il n'y a rien alors que les données sont peut-être bien là côté serveur,
// ce qui pousse les gens à recréer une entrée en double.
function renderDieteErreurChargement(tab) {
  return `<div id="app">
    ${renderHeader('Ma Diète', '', false)}
    ${renderDieteTabs(tab)}
    <div class="page">
      <div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">Erreur de chargement. Vérifie ta connexion.</div></div>
      <button onclick="_guardAction(() => switchDieteTab('${tab}'), this)" style="width:100%;padding:14px;background:linear-gradient(135deg,#a78bfa,#6d3fd6);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Réessayer</button>
    </div>
    ${renderNavBar('diete')}
  </div>`;
}

function renderDieteMenus() {
  if (_dMenuVue === 'creation' && _dMenuDraft) return renderDieteMenuCreation();
  if (_dMenus === null) return renderDieteErreurChargement('menus');
  const menus = _dMenus || [];
  const cards = menus.map(m => {
    const s = _sommeAliments(m.aliments);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="font-size:15px;font-weight:700;">${esc(m.nom)}</div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button onclick="ouvrirModificationMenu('${m.menuId}')" style="background:transparent;border:none;color:#8892a4;font-size:15px;cursor:pointer;line-height:1;padding:2px 4px;">✎</button>
          <button onclick="_guardAction(() => supprimerMenuClient('${m.menuId}'), this)" style="background:transparent;border:none;color:#8892a4;font-size:16px;cursor:pointer;line-height:1;">✕</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin:4px 0 10px;">${m.aliments.length} aliment${m.aliments.length>1?'s':''}</div>
      <div style="display:flex;justify-content:space-around;text-align:center;padding-top:10px;border-top:1px solid var(--border);">
        <div><span style="font-size:14px;font-weight:600;">${Math.round(s.cals)}</span><div class="macro-label">KCAL</div></div>
        <div><span style="font-size:14px;font-weight:600;color:#378ADD;">${Math.round(s.prot)}</span><div class="macro-label">PROT</div></div>
        <div><span style="font-size:14px;font-weight:600;color:var(--green);">${Math.round(s.glu)}</span><div class="macro-label">GLU</div></div>
        <div><span style="font-size:14px;font-weight:600;color:#D85A30;">${Math.round(s.lip)}</span><div class="macro-label">LIP</div></div>
      </div>
    </div>`;
  }).join('');

  return `<div id="app">
    ${renderHeader('Ma Diète', '', false)}
    ${renderDieteTabs('menus')}
    <div class="page">
      ${menus.length ? cards : '<div class="empty"><div class="empty-icon">🍽️</div><div class="empty-text">Aucun menu créé pour l\'instant.</div></div>'}
      <button onclick="ouvrirCreationMenu()" style="width:100%;margin-top:${menus.length?'4px':'0'};padding:14px;background:linear-gradient(135deg,#a78bfa,#6d3fd6);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">+ Créer un menu</button>
    </div>
    ${renderNavBar('diete')}
  </div>`;
}

async function supprimerMenuClient(menuId) {
  try {
    await api('supprimerMenu', { menuId });
    _dMenus = await api('listerMenus');
    setPage('diete');
  } catch(e) {}
}

function ouvrirCreationMenu() {
  _dMenuDraft = { nom: '', aliments: [], cible: { cals: null, prot: null, glu: null, lip: null }, menuIdEdition: null };
  _dMenuVue = 'creation';
  setPage('diete');
}

// Réutilise le même écran que la création, pré-rempli — modifierMenu() (Code.js) conserve le
// même MenuId, donc les slots du journal qui référencent déjà ce menu restent valides.
function ouvrirModificationMenu(menuId) {
  const m = (_dMenus||[]).find(mm => mm.menuId === menuId);
  if (!m) return;
  _dMenuDraft = {
    nom: m.nom,
    aliments: m.aliments.map(a => ({ nom:a.nom, quantite:a.quantite, kcal:a.kcal, prot:a.prot, glu:a.glu, sucres:a.sucres, fibres:a.fibres, lip:a.lip, ags:a.ags })),
    cible: { cals: null, prot: null, glu: null, lip: null },
    menuIdEdition: menuId
  };
  _dMenuVue = 'creation';
  setPage('diete');
}

function annulerCreationMenu() {
  _dMenuDraft = null;
  _dMenuVue = 'liste';
  setPage('diete');
}

function retirerAlimentDraft(i) {
  _dMenuDraft.aliments.splice(i, 1);
  setPage('diete');
}

// ── Cible affichée pendant la construction d'un menu/repas ───────────────────
// Uniquement en LECTURE SEULE — jamais un champ de saisie. _dMenuDraft.cible n'est
// renseignée que lorsqu'elle provient réellement du repas correspondant de la diète cible du
// jour (voir ouvrirComposeJournal/ouvrirModificationSlotJournal) ; sans diète cible pour ce
// jour (ou depuis "Mes menus", sans lien avec un jour du journal), _dMenuDraft.cible reste à
// null sur tous les champs et cette section ne s'affiche simplement pas — pas de saisie
// manuelle possible en remplacement.
function _cibleActive(cible) {
  return !!cible && (cible.cals != null || cible.prot != null || cible.glu != null || cible.lip != null);
}

function _renderCibleAffichage() {
  if (!_cibleActive(_dMenuDraft.cible)) return '';
  return `<div id="dCibleComparaison" style="margin-bottom:14px;">${_renderComparaisonCible()}</div>`;
}

function _renderComparaisonCible() {
  const c = _dMenuDraft.cible;
  if (!_cibleActive(c)) return '';
  const s = _sommeAliments(_dMenuDraft.aliments);
  const val = (actuel, cible) => cible != null ? `${Math.round(actuel)}/${Math.round(cible)}` : `${Math.round(actuel)}`;
  return `<div style="font-size:12px;color:var(--muted);padding:10px;background:#0f1117;border-radius:10px;text-align:center;">
    Cible du repas : ${val(s.cals,c.cals)} kcal · ${val(s.prot,c.prot)}P · ${val(s.glu,c.glu)}G · ${val(s.lip,c.lip)}L
  </div>`;
}

function renderDieteMenuCreation() {
  const d = _dMenuDraft;
  const enEdition = !!d.menuIdEdition;
  const s = _sommeAliments(d.aliments);
  const lignes = d.aliments.map((a, i) => `
    <div onclick="ouvrirModifQuantiteDraft(${i})" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
      <div style="min-width:0;">
        <div style="font-size:14px;">${esc(a.nom)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:1px;">${a.quantite}g · ${Math.round(a.kcal)} kcal</div>
      </div>
      <button onclick="event.stopPropagation();retirerAlimentDraft(${i})" style="background:transparent;border:none;color:#8892a4;font-size:16px;padding:4px 8px;cursor:pointer;line-height:1;">✕</button>
    </div>`).join('');

  return `<div id="app">
    ${renderHeader(enEdition ? 'Modifier le menu' : 'Nouveau menu', '', false)}
    <div class="page">
      <button class="btn-secondary" onclick="annulerCreationMenu()" style="margin-bottom:12px;">← Annuler</button>
      <div class="card">
        <div style="font-size:11px;color:#8892a4;margin-bottom:6px;">NOM DU MENU</div>
        <input id="dMenuNom" type="text" value="${esc(d.nom)}" placeholder="ex: Mon petit-déj maison" oninput="_dMenuDraft.nom=this.value"
          style="width:100%;padding:12px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:10px;font-size:16px;box-sizing:border-box;margin-bottom:14px;">
        ${_renderCibleAffichage()}
        ${d.aliments.length ? lignes : '<div style="font-size:13px;color:var(--muted);text-align:center;padding:8px 0;">Aucun aliment ajouté. Tape sur un aliment ajouté pour changer sa quantité.</div>'}
        ${d.aliments.length ? `<div style="display:flex;justify-content:space-around;text-align:center;margin-top:10px;padding-top:10px;border-top:1px solid #a78bfa;">
          <div><span style="font-size:14px;font-weight:600;">${Math.round(s.cals)}</span><div class="macro-label">KCAL</div></div>
          <div><span style="font-size:14px;font-weight:600;color:#378ADD;">${Math.round(s.prot)}</span><div class="macro-label">PROT</div></div>
          <div><span style="font-size:14px;font-weight:600;color:var(--green);">${Math.round(s.glu)}</span><div class="macro-label">GLU</div></div>
          <div><span style="font-size:14px;font-weight:600;color:#D85A30;">${Math.round(s.lip)}</span><div class="macro-label">LIP</div></div>
        </div>` : ''}
        <button onclick="ouvrirAjoutAliment()" style="width:100%;margin-top:${d.aliments.length?'12px':'8px'};padding:12px;background:#2d3142;border:none;border-radius:10px;color:#a78bfa;font-size:14px;font-weight:700;cursor:pointer;">+ Ajouter un aliment</button>
      </div>
      <button onclick="_guardAction(confirmerCreationMenu, this)" style="width:100%;margin-top:12px;padding:14px;background:linear-gradient(135deg,#a78bfa,#6d3fd6);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">${enEdition ? 'Enregistrer les modifications' : 'Enregistrer le menu'}</button>
    </div>
    ${renderNavBar('diete')}
  </div>`;
}

async function confirmerCreationMenu() {
  const nom = (document.getElementById('dMenuNom').value || '').trim();
  if (!nom) { showToast('Donne un nom au menu.', '#c0392b'); return; }
  if (!_dMenuDraft.aliments.length) { showToast('Ajoute au moins un aliment.', '#c0392b'); return; }
  try {
    if (_dMenuDraft.menuIdEdition) {
      await api('modifierMenu', { menuId: _dMenuDraft.menuIdEdition, nom, aliments: _dMenuDraft.aliments });
    } else {
      await api('creerMenu', { nom, aliments: _dMenuDraft.aliments });
    }
    _dMenus = await api('listerMenus');
    _dMenuDraft = null;
    _dMenuVue = 'liste';
    setPage('diete');
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

// ── Onglet "Mon journal" ─────────────────────────────────────────────────────

function _joursJournal() {
  const parDate = {};
  (_dJournal || []).filter(s => s.type !== 'cible').forEach(s => { (parDate[s.date] = parDate[s.date] || []).push(s); });
  const toKey = d => { const p = (d+'').split('/'); return p.length===3 ? p[2]+p[1].padStart(2,'0')+p[0].padStart(2,'0') : '0'; };
  return Object.keys(parDate).sort((a,b) => toKey(b).localeCompare(toKey(a))).map(date => ({ date, slots: parDate[date] }));
}

function renderDieteJournal() {
  if (_dJournalAjoutEtape === 'compose') return renderJournalCompose();
  if (_dJournalDateOuverte) return renderDieteJournalJour();
  if (_dJournal === null) return renderDieteErreurChargement('journal');
  const jours = _joursJournal();
  const rows = jours.map(j => `
    <div class="diete-item" onclick="ouvrirJourJournal('${j.date}')">
      <div class="diete-bar"></div>
      <span style="padding-left:8px;font-size:15px;font-weight:700;">${j.date}</span>
      <span style="margin-left:auto;margin-right:8px;font-size:12px;color:var(--muted);">${j.slots.length} repas</span>
      <div class="diete-arrow">›</div>
    </div>`).join('');

  return `<div id="app">
    ${renderHeader('Ma Diète', '', false)}
    ${renderDieteTabs('journal')}
    <div class="page">
      <div class="card" style="display:flex;gap:8px;align-items:center;">
        <input id="dJournalDatePicker" type="date" value="${isoDate(new Date())}" style="flex:1;padding:10px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:10px;font-size:16px;box-sizing:border-box;">
        <button onclick="ouvrirJourJournalDepuisPicker()" style="padding:10px 16px;background:linear-gradient(135deg,#a78bfa,#6d3fd6);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;">Ouvrir</button>
      </div>
      ${jours.length ? rows : '<div class="empty"><div class="empty-icon">📓</div><div class="empty-text">Aucun jour enregistré.</div></div>'}
    </div>
    ${renderNavBar('diete')}
  </div>`;
}

function ouvrirJourJournalDepuisPicker() {
  const el = document.getElementById('dJournalDatePicker');
  if (!el || !el.value) return;
  const [y,m,d] = el.value.split('-');
  ouvrirJourJournal(`${d}/${m}/${y}`);
}

async function ouvrirJourJournal(dateStr) {
  const slotsCoach = (_dJournal || []).filter(s => s.date === dateStr && s.type === 'coach');
  const cibleRow = (_dJournal || []).find(s => s.date === dateStr && s.type === 'cible');
  const refs = slotsCoach.map(s => s.ref.split('|').slice(0,2).join('|'));
  if (cibleRow) refs.push(cibleRow.ref);
  const aCharger = [...new Set(refs)].map(ref => ref.split('|')).filter(([l,c]) => !_dDieteDetailCache[l+'|'+c]);
  if (aCharger.length) {
    setPage('diete-loading');
    await Promise.all(aCharger.map(([l,c]) => _resoudreDieteDetail(parseInt(l), parseInt(c))));
  }
  _dJournalDateOuverte = dateStr;
  _dJournalAjoutEtape = null;
  _dJournalSlotEnEdition = null;
  _dJournalCibleEtape = null;
  setPage('diete');
}

function fermerJourJournal() {
  _dJournalDateOuverte = '';
  setPage('diete');
}

async function _resoudreDieteDetail(ligne, col) {
  const key = ligne + '|' + col;
  if (_dDieteDetailCache[key]) return _dDieteDetailCache[key];
  const d = await api('chargerDieteParPosition', { ligneTitre: ligne, colTitre: col });
  _dDieteDetailCache[key] = d;
  return d;
}

function _resoudreSlot(s) {
  if (s.type === 'menu') {
    const m = (_dMenus || []).find(mm => mm.menuId === s.ref);
    return m ? m.aliments : [];
  }
  const [ligne, col, idx] = s.ref.split('|');
  const detail = _dDieteDetailCache[ligne+'|'+col];
  const repas = detail && detail.repas && detail.repas[parseInt(idx)];
  return repas ? repas.aliments : [];
}

// Diète cible du jour actuellement ouvert, résolue (repas + macros) — ou null si aucune.
function _cibleJournalActuelle() {
  const row = (_dJournal || []).find(s => s.date === _dJournalDateOuverte && s.type === 'cible');
  if (!row) return null;
  const [l, c] = row.ref.split('|');
  const detail = _dDieteDetailCache[l+'|'+c];
  return { ligne: parseInt(l), col: parseInt(c), nom: row.label, ligneCibleRow: row.ligne, repas: (detail && detail.repas) || [] };
}

function renderDieteJournalJour() {
  const date = _dJournalDateOuverte;
  const cible = _cibleJournalActuelle();
  const slotsReels = (_dJournal || []).filter(s => s.date === date && s.type !== 'cible');
  const dernierSlotRempli = slotsReels.reduce((m,s) => Math.max(m, s.slot), 0);
  const nbSlots = Math.max(cible ? cible.repas.length : 0, dernierSlotRempli, cible ? 0 : 7);
  const nbSlotsAffiches = Math.min(7, Math.max(nbSlots, 1));

  let total = { cals:0, prot:0, glu:0, lip:0 };
  let totalCible = { cals:0, prot:0, glu:0, lip:0 };
  let cards = '';
  for (let i = 1; i <= nbSlotsAffiches; i++) {
    const slotReel = slotsReels.find(s => s.slot === i);
    const repasCible = cible ? cible.repas[i-1] : null;
    if (repasCible) {
      const sc = _sommeAliments(repasCible.aliments);
      totalCible.cals += sc.cals; totalCible.prot += sc.prot; totalCible.glu += sc.glu; totalCible.lip += sc.lip;
    }
    if (slotReel) {
      const som = _sommeAliments(_resoudreSlot(slotReel));
      total.cals += som.cals; total.prot += som.prot; total.glu += som.glu; total.lip += som.lip;
    }
    cards += renderRepasSlotCard(i, slotReel, repasCible);
  }

  return `<div id="app">
    ${renderHeader(date, 'Mon journal', false)}
    <div id="dStickyMacros" style="position:sticky;top:0;z-index:90;background:var(--bg);padding:10px 16px;box-shadow:0 8px 12px -6px rgba(0,0,0,.4);">
      <div class="card" style="text-align:center;padding:14px 8px;margin-bottom:0;">
        <div style="display:flex;justify-content:space-around;">
          <div><div style="font-size:20px;font-weight:700;">${Math.round(total.cals)}</div><div class="macro-label">KCAL</div></div>
          <div><div style="font-size:20px;font-weight:700;color:#378ADD;">${Math.round(total.prot)}</div><div class="macro-label">PROT</div></div>
          <div><div style="font-size:20px;font-weight:700;color:var(--green);">${Math.round(total.glu)}</div><div class="macro-label">GLU</div></div>
          <div><div style="font-size:20px;font-weight:700;color:#D85A30;">${Math.round(total.lip)}</div><div class="macro-label">LIP</div></div>
        </div>
        ${cible ? `<div style="font-size:11px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">Cible (${esc(cible.nom)}) : ${Math.round(totalCible.cals)} kcal · ${Math.round(totalCible.prot)}P · ${Math.round(totalCible.glu)}G · ${Math.round(totalCible.lip)}L</div>` : ''}
      </div>
    </div>
    <div class="page">
      <button class="btn-secondary" onclick="fermerJourJournal()" style="margin-bottom:12px;">← Retour</button>
      ${renderDieteCibleSelecteur(cible)}
      ${cards}
    </div>
    ${renderNavBar('diete')}
  </div>`;
}

function renderDieteCibleSelecteur(cible) {
  if (_dJournalCibleEtape === 'choix') {
    const rows = (_dDietes||[]).map(d => `
      <div class="diete-item" onclick="_guardAction(() => choisirDieteCible(${d.ligne},${d.col},'${(d.nom||'').replace(/'/g,"\\'")}'), this)">
        <div class="diete-bar"></div><span style="padding-left:8px;font-size:14px;font-weight:600;">${esc(d.nom)}</span><div class="diete-arrow">›</div>
      </div>`).join('');
    return `<div class="card">
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">Quelle diète cible pour ce jour ?</div>
      ${rows || '<div style="font-size:13px;color:var(--muted);">Aucune diète trouvée.</div>'}
      <button onclick="_dJournalCibleEtape=null;setPage('diete')" style="width:100%;margin-top:10px;padding:10px;background:transparent;border:none;color:#8892a4;font-size:13px;cursor:pointer;">Annuler</button>
    </div>`;
  }
  return `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
    <div style="min-width:0;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600;">Diète cible</div>
      <div style="font-size:14px;font-weight:700;margin-top:2px;">${cible ? esc(cible.nom) : 'Aucune sélectionnée'}</div>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0;">
      <button onclick="_dJournalCibleEtape='choix';setPage('diete')" style="padding:8px 14px;background:#2d3142;border:none;border-radius:8px;color:#a78bfa;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">${cible ? 'Changer' : 'Choisir'}</button>
      ${cible ? `<button onclick="_guardAction(retirerDieteCible, this)" style="background:transparent;border:none;color:#8892a4;font-size:16px;cursor:pointer;line-height:1;">✕</button>` : ''}
    </div>
  </div>`;
}

async function choisirDieteCible(ligne, col, nom) {
  setPage('diete-loading');
  try {
    await _resoudreDieteDetail(ligne, col);
    await api('definirDieteCibleJournal', { date: _dJournalDateOuverte, ligneTitre: ligne, colTitre: col, nom });
    _dJournal = await api('listerJournal');
  } catch(e) {}
  _dJournalCibleEtape = null;
  setPage('diete');
}

async function retirerDieteCible() {
  const cible = _cibleJournalActuelle();
  if (!cible) return;
  try {
    await api('supprimerSlotJournal', { ligne: cible.ligneCibleRow });
    _dJournal = await api('listerJournal');
  } catch(e) {}
  setPage('diete');
}

function renderRepasSlotCard(slotNum, slotReel, repasCible) {
  const cibleLigne = repasCible ? (() => {
    const sc = _sommeAliments(repasCible.aliments);
    return `<div style="font-size:11px;color:var(--muted);margin-top:4px;">Cible : ${Math.round(sc.cals)} kcal · ${Math.round(sc.prot)}P · ${Math.round(sc.glu)}G · ${Math.round(sc.lip)}L</div>`;
  })() : '';

  if (_dJournalSlotEnEdition === slotNum && _dJournalAjoutEtape) {
    return `<div class="card">
      <div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;margin-bottom:2px;">Repas ${slotNum}</div>
      ${cibleLigne}
      <div style="margin-top:10px;">${renderJournalChoixSource()}</div>
    </div>`;
  }

  if (slotReel) {
    const aliments = _resoudreSlot(slotReel);
    const modifiable = slotReel.type === 'menu'; // un repas du coach n'est jamais éditable, seul le sien
    return `<div class="card"${modifiable ? ` onclick="ouvrirModificationSlotJournal(${slotNum})" style="cursor:pointer;"` : ''}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <div>
          <div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;">Repas ${slotNum}${modifiable ? ' · appuyer pour modifier' : ''}</div>
          <div style="font-size:15px;font-weight:700;margin-top:2px;">${esc(slotReel.label)}</div>
          ${cibleLigne}
        </div>
        <button onclick="event.stopPropagation();_guardAction(() => supprimerSlotJournalClient(${slotReel.ligne}), this)" style="background:transparent;border:none;color:#8892a4;font-size:16px;cursor:pointer;line-height:1;">✕</button>
      </div>
      ${rendreCorpsRepas({ aliments })}
    </div>`;
  }

  return `<div class="card">
    <div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;">Repas ${slotNum}</div>
    ${cibleLigne}
    <button onclick="_dJournalSlotEnEdition=${slotNum};_dJournalAjoutEtape='choix';setPage('diete')" style="width:100%;margin-top:10px;padding:12px;background:#2d3142;border:none;border-radius:10px;color:#a78bfa;font-size:14px;font-weight:700;cursor:pointer;">+ Choisir ce repas</button>
  </div>`;
}

function annulerChoixSlotJournal() {
  _dJournalAjoutEtape = null;
  _dJournalSlotEnEdition = null;
  _dJournalDieteChoisie = null;
  setPage('diete');
}

function renderJournalChoixSource() {
  if (_dJournalAjoutEtape === 'choix') {
    return `
      <button onclick="_dJournalAjoutEtape='coach-dietes';setPage('diete')" style="width:100%;padding:12px;background:#161b2e;border:none;border-radius:10px;color:#e8eaf0;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;">📋 Un repas de ma diète</button>
      <button onclick="_dJournalAjoutEtape='menu';setPage('diete')" style="width:100%;padding:12px;background:#161b2e;border:none;border-radius:10px;color:#e8eaf0;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;">🍽️ Un de mes menus</button>
      <button onclick="ouvrirComposeJournal()" style="width:100%;padding:12px;background:#161b2e;border:none;border-radius:10px;color:#e8eaf0;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;">🥗 Composer avec des aliments</button>
      <button onclick="annulerChoixSlotJournal()" style="width:100%;padding:10px;background:transparent;border:none;color:#8892a4;font-size:13px;cursor:pointer;">Annuler</button>`;
  }
  if (_dJournalAjoutEtape === 'coach-dietes') {
    const rows = (_dDietes||[]).map(d => `
      <div class="diete-item" onclick="_guardAction(() => choisirDieteJournal(${d.ligne},${d.col},'${(d.nom||'').replace(/'/g,"\\'")}'), this)">
        <div class="diete-bar"></div><span style="padding-left:8px;font-size:14px;font-weight:600;">${esc(d.nom)}</span><div class="diete-arrow">›</div>
      </div>`).join('');
    return `
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">Depuis quelle diète ?</div>
      ${rows || '<div style="font-size:13px;color:var(--muted);">Aucune diète trouvée.</div>'}
      <button onclick="_dJournalAjoutEtape='choix';setPage('diete')" style="width:100%;margin-top:10px;padding:10px;background:transparent;border:none;color:#8892a4;font-size:13px;cursor:pointer;">‹ Retour</button>`;
  }
  if (_dJournalAjoutEtape === 'coach-repas') {
    const dc = _dJournalDieteChoisie;
    const repasList = (dc && dc.repas) || [];
    const rows = repasList.map((r, idx) => `
      <div class="diete-item" onclick="_guardAction(() => ajouterSlotCoach(${idx}), this)">
        <div class="diete-bar"></div><span style="padding-left:8px;font-size:14px;font-weight:600;">${esc(r.nom)}</span><div class="diete-arrow">›</div>
      </div>`).join('');
    return `
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">${esc(dc ? dc.nom : '')} — quel repas ?</div>
      ${rows || '<div style="font-size:13px;color:var(--muted);">Aucun repas trouvé.</div>'}
      <button onclick="_dJournalAjoutEtape='coach-dietes';setPage('diete')" style="width:100%;margin-top:10px;padding:10px;background:transparent;border:none;color:#8892a4;font-size:13px;cursor:pointer;">‹ Retour</button>`;
  }
  if (_dJournalAjoutEtape === 'menu') {
    const rows = (_dMenus||[]).map(m => `
      <div class="diete-item" onclick="_guardAction(() => ajouterSlotMenu('${m.menuId}'), this)">
        <div class="diete-bar"></div><span style="padding-left:8px;font-size:14px;font-weight:600;">${esc(m.nom)}</span><div class="diete-arrow">›</div>
      </div>`).join('');
    return `
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">Quel menu ?</div>
      ${rows || '<div style="font-size:13px;color:var(--muted);">Aucun menu créé. Va dans "Mes menus" pour en créer un.</div>'}
      <button onclick="_dJournalAjoutEtape='choix';setPage('diete')" style="width:100%;margin-top:10px;padding:10px;background:transparent;border:none;color:#8892a4;font-size:13px;cursor:pointer;">‹ Retour</button>`;
  }
  return '';
}

// Compose un repas à la volée pour un slot du journal (plusieurs aliments de la
// base coach+communauté, ajoutés un par un) sans passer par la création préalable
// d'un menu dans la bibliothèque. Réutilise creerMenu() en coulisses (même stockage
// que "Mes menus", auto-nommé si le client ne donne pas de nom) pour ne pas dupliquer
// la logique de résolution des slots — seul le nom par défaut change.
function ouvrirComposeJournal() {
  // Pré-remplit la cible depuis le repas correspondant de la diète cible du jour (si
  // définie) — évite d'avoir à la re-taper à la main alors qu'elle est déjà connue.
  let cible = { cals: null, prot: null, glu: null, lip: null };
  const cibleJour = _cibleJournalActuelle();
  if (cibleJour && _dJournalSlotEnEdition) {
    const repasCible = cibleJour.repas[_dJournalSlotEnEdition - 1];
    if (repasCible) {
      const sc = _sommeAliments(repasCible.aliments);
      cible = { cals: Math.round(sc.cals), prot: Math.round(sc.prot), glu: Math.round(sc.glu), lip: Math.round(sc.lip) };
    }
  }
  _dMenuDraft = { nom: '', aliments: [], cible, menuIdEdition: null };
  _dJournalAjoutEtape = 'compose';
  setPage('diete');
}

// Rouvre un repas déjà rempli (type 'menu' uniquement — un repas du coach n'est jamais
// modifiable, seule sa suppression est possible) pour changer ses aliments/dosages. Réutilise
// l'écran "Composer" avec _dMenuDraft.menuIdEdition renseigné ; confirmerComposeJournal()
// bascule alors sur modifierMenu() au lieu de creerMenu().
function ouvrirModificationSlotJournal(slotNum) {
  const slotReel = (_dJournal||[]).find(s => s.date === _dJournalDateOuverte && s.slot === slotNum && s.type === 'menu');
  if (!slotReel) return;
  const m = (_dMenus||[]).find(mm => mm.menuId === slotReel.ref);
  if (!m) return;
  let cible = { cals: null, prot: null, glu: null, lip: null };
  const cibleJour = _cibleJournalActuelle();
  if (cibleJour) {
    const repasCible = cibleJour.repas[slotNum - 1];
    if (repasCible) {
      const sc = _sommeAliments(repasCible.aliments);
      cible = { cals: Math.round(sc.cals), prot: Math.round(sc.prot), glu: Math.round(sc.glu), lip: Math.round(sc.lip) };
    }
  }
  _dMenuDraft = {
    nom: m.nom,
    aliments: m.aliments.map(a => ({ nom:a.nom, quantite:a.quantite, kcal:a.kcal, prot:a.prot, glu:a.glu, sucres:a.sucres, fibres:a.fibres, lip:a.lip, ags:a.ags })),
    cible, menuIdEdition: m.menuId
  };
  _dJournalSlotEnEdition = slotNum;
  _dJournalAjoutEtape = 'compose';
  setPage('diete');
}

function annulerComposeJournal() {
  const enEdition = !!(_dMenuDraft && _dMenuDraft.menuIdEdition);
  _dMenuDraft = null;
  _dJournalAjoutEtape = enEdition ? null : 'choix';
  if (enEdition) _dJournalSlotEnEdition = null;
  setPage('diete');
}

function renderJournalCompose() {
  const d = _dMenuDraft;
  const enEdition = !!d.menuIdEdition;
  const s = _sommeAliments(d.aliments);
  const lignes = d.aliments.map((a, i) => `
    <div onclick="ouvrirModifQuantiteDraft(${i})" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
      <div style="min-width:0;">
        <div style="font-size:14px;">${esc(a.nom)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:1px;">${a.quantite}g · ${Math.round(a.kcal)} kcal</div>
      </div>
      <button onclick="event.stopPropagation();retirerAlimentDraft(${i})" style="background:transparent;border:none;color:#8892a4;font-size:16px;padding:4px 8px;cursor:pointer;line-height:1;">✕</button>
    </div>`).join('');

  return `<div id="app">
    ${renderHeader(enEdition ? 'Modifier le repas' : 'Composer un repas', _dJournalDateOuverte, false)}
    <div class="page">
      <button class="btn-secondary" onclick="annulerComposeJournal()" style="margin-bottom:12px;">← Annuler</button>
      <div class="card">
        <div style="font-size:11px;color:#8892a4;margin-bottom:6px;">NOM DU REPAS (optionnel)</div>
        <input id="dComposeNom" type="text" value="${esc(d.nom)}" placeholder="ex: Repas libre" oninput="_dMenuDraft.nom=this.value"
          style="width:100%;padding:12px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:10px;font-size:16px;box-sizing:border-box;margin-bottom:14px;">
        ${_renderCibleAffichage()}
        ${d.aliments.length ? lignes : '<div style="font-size:13px;color:var(--muted);text-align:center;padding:8px 0;">Aucun aliment ajouté. Tape sur un aliment ajouté pour changer sa quantité.</div>'}
        ${d.aliments.length ? `<div style="display:flex;justify-content:space-around;text-align:center;margin-top:10px;padding-top:10px;border-top:1px solid #a78bfa;">
          <div><span style="font-size:14px;font-weight:600;">${Math.round(s.cals)}</span><div class="macro-label">KCAL</div></div>
          <div><span style="font-size:14px;font-weight:600;color:#378ADD;">${Math.round(s.prot)}</span><div class="macro-label">PROT</div></div>
          <div><span style="font-size:14px;font-weight:600;color:var(--green);">${Math.round(s.glu)}</span><div class="macro-label">GLU</div></div>
          <div><span style="font-size:14px;font-weight:600;color:#D85A30;">${Math.round(s.lip)}</span><div class="macro-label">LIP</div></div>
        </div>` : ''}
        <button onclick="ouvrirAjoutAliment()" style="width:100%;margin-top:${d.aliments.length?'12px':'8px'};padding:12px;background:#2d3142;border:none;border-radius:10px;color:#a78bfa;font-size:14px;font-weight:700;cursor:pointer;">+ Ajouter un aliment</button>
      </div>
      <button onclick="_guardAction(confirmerComposeJournal, this)" style="width:100%;margin-top:12px;padding:14px;background:linear-gradient(135deg,#a78bfa,#6d3fd6);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">${enEdition ? 'Enregistrer les modifications' : 'Ajouter au journal'}</button>
    </div>
    ${renderNavBar('diete')}
  </div>`;
}

async function confirmerComposeJournal() {
  if (!_dMenuDraft.aliments.length) { showToast('Ajoute au moins un aliment.', '#c0392b'); return; }
  const slot = _dJournalSlotEnEdition;
  const nom = (document.getElementById('dComposeNom').value || '').trim() || ('Repas ' + slot + ' du ' + _dJournalDateOuverte);
  try {
    if (_dMenuDraft.menuIdEdition) {
      const res = await api('modifierMenu', { menuId: _dMenuDraft.menuIdEdition, nom, aliments: _dMenuDraft.aliments });
      if (!res || !res.ok) { showToast('Erreur lors de la modification.', '#c0392b'); return; }
      // Le Label affiché dans le journal est une copie figée au moment de l'ajout — si le nom
      // a changé, on rafraîchit la ligne du slot (slot explicite désormais, donc sûr de
      // supprimer/réinsérer sans perdre sa position).
      const slotActuel = (_dJournal||[]).find(s => s.date === _dJournalDateOuverte && s.slot === slot && s.type === 'menu');
      if (slotActuel && slotActuel.label !== nom) {
        await api('supprimerSlotJournal', { ligne: slotActuel.ligne });
        await api('ajouterSlotJournal', { date: _dJournalDateOuverte, slot, type: 'menu', ref: _dMenuDraft.menuIdEdition, label: nom });
      }
    } else {
      const res = await api('creerMenu', { nom, aliments: _dMenuDraft.aliments });
      if (!res || !res.ok) { showToast('Erreur lors de la création.', '#c0392b'); return; }
      const res2 = await api('ajouterSlotJournal', { date: _dJournalDateOuverte, slot, type: 'menu', ref: res.menuId, label: nom });
      if (!res2 || !res2.ok) { showToast(res2 && res2.erreur === 'slot_deja_rempli' ? 'Ce repas est déjà rempli.' : 'Erreur.', '#c0392b'); return; }
    }
    _dMenus = await api('listerMenus');
    _dJournal = await api('listerJournal');
    _dMenuDraft = null;
    _dJournalAjoutEtape = null;
    _dJournalSlotEnEdition = null;
    setPage('diete');
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function choisirDieteJournal(ligne, col, nom) {
  setPage('diete-loading');
  try {
    const detail = await _resoudreDieteDetail(ligne, col);
    _dJournalDieteChoisie = { ligne, col, nom, repas: detail.repas || [] };
    _dJournalAjoutEtape = 'coach-repas';
  } catch(e) {}
  setPage('diete');
}

async function ajouterSlotCoach(idx) {
  const dc = _dJournalDieteChoisie;
  const r = dc && dc.repas[idx];
  if (!r) return;
  const ref = dc.ligne + '|' + dc.col + '|' + idx;
  const label = r.nom + ' · ' + dc.nom;
  const slot = _dJournalSlotEnEdition;
  try {
    const res = await api('ajouterSlotJournal', { date: _dJournalDateOuverte, slot, type: 'coach', ref, label });
    if (!res || !res.ok) { showToast(res && res.erreur === 'slot_deja_rempli' ? 'Ce repas est déjà rempli.' : 'Erreur.', '#c0392b'); return; }
    _dJournal = await api('listerJournal');
    _dJournalAjoutEtape = null;
    _dJournalSlotEnEdition = null;
    _dJournalDieteChoisie = null;
    setPage('diete');
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function ajouterSlotMenu(menuId) {
  const m = (_dMenus||[]).find(mm => mm.menuId === menuId);
  if (!m) return;
  const slot = _dJournalSlotEnEdition;
  try {
    const res = await api('ajouterSlotJournal', { date: _dJournalDateOuverte, slot, type: 'menu', ref: menuId, label: m.nom });
    if (!res || !res.ok) { showToast(res && res.erreur === 'slot_deja_rempli' ? 'Ce repas est déjà rempli.' : 'Erreur.', '#c0392b'); return; }
    _dJournal = await api('listerJournal');
    _dJournalAjoutEtape = null;
    _dJournalSlotEnEdition = null;
    setPage('diete');
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function supprimerSlotJournalClient(ligne) {
  try {
    await api('supprimerSlotJournal', { ligne });
    _dJournal = await api('listerJournal');
    setPage('diete');
  } catch(e) {}
}

// ── Modale de recherche/ajout/création d'aliment (alimente _dMenuDraft) ──────

async function ouvrirAjoutAliment() {
  _dAjoutEtape = 'recherche';
  _dAjoutSelection = null;
  _dModifIndex = null;
  if (!_dBaseAliments) {
    _afficherModalAjout(true);
    try { _dBaseAliments = await api('chargerBaseAliments'); } catch(e) { _dBaseAliments = { coach: [], communaute: [] }; }
  }
  _afficherModalAjout(false);
}

function _tousLesAliments() {
  const b = _dBaseAliments || { coach: [], communaute: [] };
  return (b.coach || []).concat(b.communaute || []);
}

function _rechercherAlimentsLocal(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const matches = _tousLesAliments().filter(a => a.nom.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const aStarts = a.nom.toLowerCase().startsWith(q), bStarts = b.nom.toLowerCase().startsWith(q);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return a.nom.localeCompare(b.nom, 'fr');
  });
  return matches.slice(0, 20);
}

function onRechercheAlimentInput(val) {
  const cont = document.getElementById('dAjoutResultats');
  if (cont) cont.innerHTML = renderResultatsAliments(val);
}

function renderResultatsAliments(query) {
  const q = (query || '').trim();
  if (!q) return '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px 0;">Tape le nom d\'un aliment…</div>';
  const results = _rechercherAlimentsLocal(q);
  const rowsHtml = results.map(a => {
    const badge = a.source === 'coach'
      ? '<span style="font-size:9px;font-weight:700;color:#378ADD;background:#378ADD18;border:1px solid #378ADD44;border-radius:4px;padding:1px 5px;">🧑‍🍳 base</span>'
      : `<span style="font-size:9px;font-weight:700;color:#a78bfa;background:#a78bfa18;border:1px solid #a78bfa44;border-radius:4px;padding:1px 5px;">👥 communauté${a.valide ? '' : ' · non validé'}</span>`;
    return `<div onclick="selectionnerAliment('${a.nom.replace(/'/g,"\\'")}','${a.source}')" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;">
      <div style="min-width:0;">
        <div style="font-size:14px;">${esc(a.nom)}</div>
        <div style="margin-top:3px;">${badge}</div>
      </div>
      <div style="font-size:12px;color:var(--muted);white-space:nowrap;margin-left:10px;">${Math.round(a.kcal*100)} kcal/100g</div>
    </div>`;
  }).join('');
  const creerBtn = `<button onclick="_dCreationPrefill=null;_dCreationCodeBarre=null;ouvrirCreationAliment('${q.replace(/'/g,"\\'")}')" style="width:100%;margin-top:10px;padding:10px;background:#2d3142;border:none;border-radius:8px;color:#a78bfa;font-size:13px;font-weight:600;cursor:pointer;">+ Créer "${esc(q)}" comme nouvel aliment</button>`;
  if (results.length === 0) {
    return `<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px 0;">Aucun résultat.</div>${creerBtn}`;
  }
  return rowsHtml + creerBtn;
}

function selectionnerAliment(nom, source) {
  const found = _tousLesAliments().find(a => a.nom === nom && a.source === source);
  if (!found) return;
  _dAjoutSelection = found;
  _dModifIndex = null;
  _dAjoutEtape = 'quantite';
  _afficherModalAjout(false);
}

// Ouvre la modale de quantité pré-remplie sur un aliment déjà présent dans le brouillon (menu
// ou repas en cours de construction), pour changer son dosage sans le retirer/re-chercher.
// Les valeurs par gramme sont reconstituées en divisant les totaux stockés par la quantité —
// le brouillon ne garde que les totaux, pas le prix au gramme d'origine, mais la division
// reste exacte (pas d'arrondi accumulé, la quantité d'origine est toujours > 0).
function ouvrirModifQuantiteDraft(index) {
  const item = _dMenuDraft.aliments[index];
  if (!item) return;
  const q = item.quantite;
  _dAjoutSelection = {
    nom: item.nom, kcal: item.kcal/q, prot: item.prot/q, glu: item.glu/q,
    sucres: item.sucres/q, fibres: item.fibres/q, lip: item.lip/q, ags: item.ags/q
  };
  _dModifIndex = index;
  _dAjoutEtape = 'quantite';
  _afficherModalAjout(false);
}

function renderModalAjoutQuantite() {
  const a = _dAjoutSelection;
  const enEdition = _dModifIndex != null;
  const qteInitiale = enEdition ? _dMenuDraft.aliments[_dModifIndex].quantite : '';
  const aDetail = a.sucres !== null; // base coach = pas de détail sucres/fibres/AGS
  return `
    <div style="font-size:11px;font-weight:600;color:#555e7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${enEdition ? 'Modifier' : 'Ajouter'}</div>
    <div style="font-size:18px;font-weight:700;color:#f0f2ff;margin-bottom:16px;">${esc(a.nom)}</div>
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;color:#8892a4;margin-bottom:6px;">QUANTITÉ (g)</div>
      <input id="dAjoutQte" type="text" inputmode="numeric" placeholder="ex: 100" value="${qteInitiale}" oninput="_majPreviewAjout()"
        style="width:100%;padding:12px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:10px;font-size:16px;box-sizing:border-box;">
    </div>
    <div id="dAjoutPreview" style="display:flex;justify-content:space-around;text-align:center;padding:12px 0;background:#0f1117;border-radius:10px;">
      <div><span style="font-size:14px;font-weight:600;">0</span><div class="macro-label">KCAL</div></div>
      <div><span style="font-size:14px;font-weight:600;color:#378ADD;">0</span><div class="macro-label">PROT</div></div>
      <div><span style="font-size:14px;font-weight:600;color:var(--green);">0</span><div class="macro-label">GLU</div></div>
      <div><span style="font-size:14px;font-weight:600;color:#D85A30;">0</span><div class="macro-label">LIP</div></div>
    </div>
    <div id="dAjoutPreviewDetail" style="font-size:11px;color:var(--muted);text-align:center;margin:8px 0 20px;">${aDetail ? 'dont sucres <span id="dPrevSucres">0</span>g · fibres <span id="dPrevFibres">0</span>g · dont AGS <span id="dPrevAgs">0</span>g' : ''}</div>
    <button onclick="_guardAction(confirmerAjoutAliment, this)" style="width:100%;padding:14px;background:linear-gradient(135deg,#a78bfa,#6d3fd6);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">${enEdition ? 'Enregistrer' : 'Ajouter'}</button>
    ${enEdition ? `<button onclick="_guardAction(supprimerAlimentDraftDepuisModal, this)" style="width:100%;margin-top:8px;padding:12px;background:transparent;border:none;color:#e05252;font-size:14px;cursor:pointer;">Supprimer cet aliment</button>` : ''}
    <button onclick="_dAjoutEtape='recherche';_dModifIndex=null;_afficherModalAjout(false);" style="width:100%;margin-top:8px;padding:12px;background:#2d3142;border:none;border-radius:12px;color:#8892a4;font-size:14px;cursor:pointer;">‹ Retour</button>`;
}

function _majPreviewAjout() {
  const a = _dAjoutSelection;
  const prev = document.getElementById('dAjoutPreview');
  if (!prev || !a) return;
  const qte = parseFloat((document.getElementById('dAjoutQte')||{}).value) || 0;
  const vals = [Math.round(a.kcal*qte), Math.round(a.prot*qte), Math.round(a.glu*qte), Math.round(a.lip*qte)];
  prev.querySelectorAll('span').forEach((s, i) => { s.textContent = vals[i]; });
  if (a.sucres !== null) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = Math.round(v*qte); };
    set('dPrevSucres', a.sucres); set('dPrevFibres', a.fibres); set('dPrevAgs', a.ags);
  }
}

function confirmerAjoutAliment() {
  const a = _dAjoutSelection;
  const qte = parseFloat((document.getElementById('dAjoutQte')||{}).value) || 0;
  if (!a || qte <= 0 || !_dMenuDraft) return;
  const item = {
    nom: a.nom, quantite: qte, kcal: a.kcal*qte, prot: a.prot*qte, glu: a.glu*qte,
    sucres: (a.sucres||0)*qte, fibres: (a.fibres||0)*qte, lip: a.lip*qte, ags: (a.ags||0)*qte
  };
  if (_dModifIndex != null) { _dMenuDraft.aliments[_dModifIndex] = item; _dModifIndex = null; }
  else { _dMenuDraft.aliments.push(item); }
  const modal = document.getElementById('modalAjoutAliment');
  if (modal) modal.remove();
  setPage('diete');
}

function supprimerAlimentDraftDepuisModal() {
  if (_dModifIndex != null) { _dMenuDraft.aliments.splice(_dModifIndex, 1); _dModifIndex = null; }
  const modal = document.getElementById('modalAjoutAliment');
  if (modal) modal.remove();
  setPage('diete');
}

// ── Scan code-barres (Open Food Facts) ────────────────────────────────────────
// Lib de décodage caméra chargée en lazy (CDN, comme Firebase déjà chargé ailleurs) —
// iOS Safari n'a pas de BarcodeDetector natif. Si le code-barres correspond déjà à un
// aliment de la base (coach ou communauté, via son champ codeBarre), on saute directement
// à la sélection ; sinon on interroge Open Food Facts (CORS ouvert, pas de proxy GAS) pour
// préremplir le formulaire de création existant — pas d'import en masse, la base communauté
// grossit organiquement au fil des scans confirmés par les clients.
async function ouvrirScanCodeBarre() {
  _dAjoutEtape = 'scan';
  _dScanTraitementEnCours = false;
  _afficherModalAjout(false);
  try {
    await _chargerLibScan();
    _demarrerScan();
  } catch(e) {
    showToast('Scanner indisponible.', '#c0392b');
    _dAjoutEtape = 'recherche';
    _afficherModalAjout(false);
  }
}

function _chargerLibScan() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (_dScanLibPromise) return _dScanLibPromise;
  _dScanLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.onload = () => resolve();
    s.onerror = () => { _dScanLibPromise = null; reject(new Error('lib_scan_indisponible')); };
    document.head.appendChild(s);
  });
  return _dScanLibPromise;
}

function renderModalAjoutScan() {
  return `
    <div style="font-size:11px;font-weight:600;color:#555e7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Scanner un code-barres</div>
    <div id="dScanViewport" style="width:100%;border-radius:12px;overflow:hidden;background:#000;min-height:260px;"></div>
    <div style="font-size:12px;color:var(--muted);text-align:center;margin:12px 0;">Vise le code-barres du produit.</div>
    <button onclick="_dAjoutEtape='recherche';_afficherModalAjout(false);" style="width:100%;padding:12px;background:#2d3142;border:none;border-radius:12px;color:#8892a4;font-size:14px;cursor:pointer;">Annuler</button>`;
}

function _demarrerScan() {
  if (_dAjoutEtape !== 'scan') return; // l'utilisateur a déjà quitté l'écran pendant le chargement de la lib
  const el = document.getElementById('dScanViewport');
  if (!el || !window.Html5Qrcode) return;
  _dScanInstance = new Html5Qrcode('dScanViewport');
  const formats = [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E];
  _dScanInstance.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 160 }, formatsToSupport: formats }, onScanSuccess)
    .catch(() => {
      showToast('Impossible d\'accéder à la caméra.', '#c0392b');
      _dAjoutEtape = 'recherche';
      _afficherModalAjout(false);
    });
}

async function onScanSuccess(codeBarre) {
  if (_dAjoutEtape !== 'scan' || _dScanTraitementEnCours) return; // ignore un 2e décodage pendant qu'on traite déjà le premier
  _dScanTraitementEnCours = true;
  _arreterScan();
  const local = _tousLesAliments().find(a => a.codeBarre === codeBarre);
  if (local) { _dScanTraitementEnCours = false; selectionnerAliment(local.nom, local.source); return; }
  _afficherModalAjout(true);
  try {
    const res = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(codeBarre) + '.json?fields=product_name,nutriments');
    const data = await res.json();
    if (data && data.status === 1 && data.product) {
      const n = data.product.nutriments || {};
      _dCreationPrefill = {
        kcal100:   Math.round((n['energy-kcal_100g'] || 0) * 10) / 10,
        prot100:   Math.round((n['proteins_100g'] || 0) * 10) / 10,
        glu100:    Math.round((n['carbohydrates_100g'] || 0) * 10) / 10,
        sucres100: Math.round((n['sugars_100g'] || 0) * 10) / 10,
        fibres100: Math.round((n['fiber_100g'] || 0) * 10) / 10,
        lip100:    Math.round((n['fat_100g'] || 0) * 10) / 10,
        ags100:    Math.round((n['saturated-fat_100g'] || 0) * 10) / 10
      };
      _dCreationCodeBarre = codeBarre;
      ouvrirCreationAliment(data.product.product_name || '');
    } else {
      _dCreationPrefill = null;
      _dCreationCodeBarre = codeBarre;
      showToast('Produit non trouvé, tu peux le créer manuellement.', '#e0a030');
      ouvrirCreationAliment('');
    }
  } catch(e) {
    _dCreationPrefill = null;
    _dCreationCodeBarre = codeBarre;
    showToast('Erreur réseau, tu peux créer l\'aliment manuellement.', '#c0392b');
    ouvrirCreationAliment('');
  } finally {
    _dScanTraitementEnCours = false;
  }
}

function ouvrirCreationAliment(nomPrerempli) {
  _dCreationNomPrerempli = nomPrerempli || '';
  _dAjoutEtape = 'creation';
  _afficherModalAjout(false);
}

function renderModalAjoutCreation() {
  const pf = _dCreationPrefill || {};
  const v = n => (pf[n] != null ? pf[n] : '');
  return `
    <div style="font-size:11px;font-weight:600;color:#555e7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Nouvel aliment</div>
    <div style="font-size:13px;color:#8892a4;margin-bottom:16px;line-height:1.5;">Ajouté à la base communautaire, utilisable par tous — visible immédiatement mais marqué "non validé" jusqu'à ce que ton coach le confirme.${_dCreationCodeBarre ? ' Champs préremplis depuis Open Food Facts, à vérifier avant de valider.' : ''}</div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#8892a4;margin-bottom:6px;">NOM</div>
      <input id="dCreaNom" type="text" value="${esc(_dCreationNomPrerempli)}" placeholder="ex: Yaourt grec"
        style="width:100%;padding:12px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:10px;font-size:16px;box-sizing:border-box;">
    </div>
    <div style="font-size:11px;color:#8892a4;margin-bottom:6px;">POUR 100g</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <div><div style="font-size:10px;color:#8892a4;margin-bottom:4px;">Kcal</div><input id="dCreaKcal" type="text" inputmode="decimal" placeholder="0" value="${v('kcal100')}" style="width:100%;padding:10px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;box-sizing:border-box;"></div>
      <div><div style="font-size:10px;color:#8892a4;margin-bottom:4px;">Protéines (g)</div><input id="dCreaProt" type="text" inputmode="decimal" placeholder="0" value="${v('prot100')}" style="width:100%;padding:10px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;box-sizing:border-box;"></div>
      <div><div style="font-size:10px;color:#8892a4;margin-bottom:4px;">Glucides (g)</div><input id="dCreaGlu" type="text" inputmode="decimal" placeholder="0" value="${v('glu100')}" style="width:100%;padding:10px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;box-sizing:border-box;"></div>
      <div><div style="font-size:10px;color:#8892a4;margin-bottom:4px;">dont Sucres (g)</div><input id="dCreaSucres" type="text" inputmode="decimal" placeholder="0" value="${v('sucres100')}" style="width:100%;padding:10px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;box-sizing:border-box;"></div>
      <div><div style="font-size:10px;color:#8892a4;margin-bottom:4px;">Lipides (g)</div><input id="dCreaLip" type="text" inputmode="decimal" placeholder="0" value="${v('lip100')}" style="width:100%;padding:10px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;box-sizing:border-box;"></div>
      <div><div style="font-size:10px;color:#8892a4;margin-bottom:4px;">dont AGS (g)</div><input id="dCreaAgs" type="text" inputmode="decimal" placeholder="0" value="${v('ags100')}" style="width:100%;padding:10px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;box-sizing:border-box;"></div>
      <div style="grid-column:1 / -1;"><div style="font-size:10px;color:#8892a4;margin-bottom:4px;">Fibres (g)</div><input id="dCreaFibres" type="text" inputmode="decimal" placeholder="0" value="${v('fibres100')}" style="width:100%;padding:10px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:8px;font-size:16px;box-sizing:border-box;"></div>
    </div>
    <div style="font-size:11px;color:#555e7a;margin-bottom:12px;">Sucres, AGS et fibres sont optionnels.</div>
    <div id="dCreaErr" style="display:none;font-size:12px;color:#e05252;margin-bottom:12px;"></div>
    <button onclick="_guardAction(confirmerCreationAliment, this)" style="width:100%;padding:14px;background:linear-gradient(135deg,#a78bfa,#6d3fd6);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Créer et ajouter</button>
    <button onclick="_dCreationPrefill=null;_dCreationCodeBarre=null;_dAjoutEtape='recherche';_afficherModalAjout(false);" style="width:100%;margin-top:8px;padding:12px;background:#2d3142;border:none;border-radius:12px;color:#8892a4;font-size:14px;cursor:pointer;">‹ Retour</button>`;
}

async function confirmerCreationAliment() {
  const val = id => parseFloat((document.getElementById(id).value||'').replace(',','.')) || 0;
  const nom = (document.getElementById('dCreaNom').value || '').trim();
  const kcal100   = val('dCreaKcal');
  const prot100   = val('dCreaProt');
  const glu100    = val('dCreaGlu');
  const sucres100 = val('dCreaSucres');
  const lip100    = val('dCreaLip');
  const ags100    = val('dCreaAgs');
  const fibres100 = val('dCreaFibres');
  const errEl = document.getElementById('dCreaErr');
  if (!nom) { errEl.textContent = 'Entre un nom.'; errEl.style.display = 'block'; return; }
  if (kcal100 <= 0) { errEl.textContent = 'Entre au moins les calories.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  try {
    const res = await api('ajouterAlimentCommunaute', {
      nom, kcal: kcal100/100, prot: prot100/100, glu: glu100/100,
      sucres: sucres100/100, fibres: fibres100/100, lip: lip100/100, ags: ags100/100,
      codeBarre: _dCreationCodeBarre || ''
    });
    if (!res || !res.ok) { errEl.textContent = 'Erreur lors de la création.'; errEl.style.display = 'block'; return; }
    if (_dBaseAliments) _dBaseAliments.communaute.push(res.aliment);
    _dAjoutSelection = res.aliment;
    _dAjoutEtape = 'quantite';
    _dCreationPrefill = null;
    _dCreationCodeBarre = null;
    _afficherModalAjout(false);
  } catch(e) { errEl.textContent = 'Erreur : ' + e.message; errEl.style.display = 'block'; }
}

// Arrête proprement la caméra si un scan est en cours — sans ça le flux vidéo reste actif
// en arrière-plan quand on quitte l'écran scan (bouton retour, sélection, fermeture modale).
function _arreterScan() {
  if (_dScanInstance) {
    const inst = _dScanInstance;
    _dScanInstance = null;
    try { inst.stop().then(() => { try { inst.clear(); } catch(e) {} }).catch(() => {}); } catch(e) {}
  }
}

function _afficherModalAjout(loading) {
  _arreterScan();
  const existant = document.getElementById('modalAjoutAliment');
  if (existant) existant.remove();
  const modal = document.createElement('div');
  modal.id = 'modalAjoutAliment';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:flex-end;';
  let contenu;
  if (loading) {
    contenu = '<div style="display:flex;justify-content:center;padding:40px 0;"><div class="spin"></div></div>';
  } else if (_dAjoutEtape === 'quantite') {
    contenu = renderModalAjoutQuantite();
  } else if (_dAjoutEtape === 'creation') {
    contenu = renderModalAjoutCreation();
  } else if (_dAjoutEtape === 'scan') {
    contenu = renderModalAjoutScan();
  } else {
    contenu = `
      <div style="font-size:11px;font-weight:600;color:#555e7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Ajouter un aliment</div>
      <input id="dAjoutRecherche" type="text" placeholder="Chercher un aliment…" oninput="onRechercheAlimentInput(this.value)"
        style="width:100%;padding:12px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:10px;font-size:16px;box-sizing:border-box;margin-bottom:4px;">
      <button onclick="ouvrirScanCodeBarre()" style="width:100%;margin-bottom:12px;padding:10px;background:#2d3142;border:none;border-radius:8px;color:#e8eaf0;font-size:13px;font-weight:600;cursor:pointer;">📷 Scanner un code-barres</button>
      <div id="dAjoutResultats" style="max-height:50vh;overflow-y:auto;">${renderResultatsAliments('')}</div>
      <button onclick="document.getElementById('modalAjoutAliment').remove();" style="width:100%;margin-top:12px;padding:12px;background:#2d3142;border:none;border-radius:12px;color:#8892a4;font-size:14px;cursor:pointer;">Fermer</button>`;
  }
  modal.innerHTML = `<div style="background:#1a1f35;border-radius:20px 20px 0 0;padding:24px 20px calc(32px + env(safe-area-inset-bottom));width:100%;max-width:500px;margin:0 auto;box-sizing:border-box;max-height:85vh;overflow-y:auto;">
    <div style="width:36px;height:4px;background:#2d3142;border-radius:2px;margin:0 auto 20px;"></div>
    ${contenu}
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) { _arreterScan(); modal.remove(); } });
  if (!loading && _dAjoutEtape === 'scan') _demarrerScan();
  if (!loading && _dAjoutEtape === 'quantite') _majPreviewAjout(); // initialise l'aperçu (utile surtout en édition, quantité déjà pré-remplie)
}

// Cale le bandeau de totaux (sticky) juste sous le header (sticky lui aussi,
// hauteur variable selon appareil/notch) pour qu'ils ne se chevauchent pas.
function initDieteStickyMacros() {
  const bar = document.getElementById('dStickyMacros');
  const header = document.querySelector('.header');
  if (!bar || !header) return;
  bar.style.top = header.offsetHeight + 'px';
}

function initDieteSliders(count) {
  for (let i = 0; i < count; i++) {
    const slider = document.getElementById('dSlider_' + i);
    const dots   = document.getElementById('dDots_'   + i);
    if (!slider || !dots) continue;
    const total = slider.children.length;
    const repasIdx = i;
    slider.addEventListener('scroll', function() {
      const idx = Math.round(slider.scrollLeft / slider.offsetWidth);
      dots.textContent = (idx + 1) + ' / ' + total;
      if (_dCurrentOpt[repasIdx] !== idx) {
        _dCurrentOpt[repasIdx] = idx;
        _recalcDieteTotal();
      }
    }, { passive: true });
  }
}
