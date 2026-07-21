// ── Coach pages ────────────────────────────────────────────────────────

const COACH_PALETTE = ['#378ADD','#1D9E75','#E8A838','#C45BAA','#E05C3A','#7B61FF','#0ABFBC','#F0A500'];

function coachColor(clientId) {
  let h = 0;
  for (let i = 0; i < (clientId || '').length; i++) h = (h * 31 + clientId.charCodeAt(i)) & 0xff;
  return COACH_PALETTE[h % COACH_PALETTE.length];
}

function formatTsCoach(ts) {
  const jours = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
  const mois  = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const m = (ts+'').match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
  if (!m) return ts;
  const d = new Date(+m[3], +m[2]-1, +m[1]);
  return jours[d.getDay()] + ' ' + +m[1] + ' ' + mois[+m[2]-1] + ' à ' + m[4] + 'h' + m[5];
}

// ── Mes clients ───────────────────────────────────────────────────────

let _mesClients = null;
let _clientSelectionne = null; // { id, nom, niveau, ... }

async function loadMesClients() {
  showLoadingOverlay('Chargement…');
  try {
    const raw = await api('listerClientsAvecNiveaux');
    _mesClients = typeof raw === 'string' ? JSON.parse(raw) : raw;
    hideLoadingOverlay();
    setPage('mes-clients');
  } catch(e) { hideLoadingOverlay(); setPage('home'); }
}

// Comme en GAS (allerVersClient) : cliquer sur un client bascule directement
// en vue de ce client, pas de page intermédiaire.
function ouvrirClientDetail(clientId) {
  const c = (_mesClients || []).find(cl => cl.id === clientId) || { id: clientId, nom: clientId };
  _clientSelectionne = c;
  enterVueClient(clientId, null, 'mes-clients');
}

async function verrouilerClientCoach(clientId, clientNom, btn) {
  if (!confirm('🔒 Verrouiller la feuille de ' + clientNom + ' ?\n\nIls ne pourront plus modifier le Google Sheet directement. L\'app continuera de fonctionner normalement.')) return;
  showLoadingOverlay('Verrouillage en cours…');
  try {
    const res = await apiAs('verrouilerAccesClient', clientId);
    hideLoadingOverlay();
    if (!res || !res.ok) { showToast('Erreur : ' + (res && res.msg || 'inconnue'), '#c0392b'); return; }
    const c = (_mesClients || []).find(cl => cl.id === clientId);
    if (c) c.verrouile = true;
    setPage('mes-clients');
    showToast('🔒 Feuille verrouillée', '#1D9E75');
  } catch(e) { hideLoadingOverlay(); showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function deverrouilerClientCoach(clientId, clientNom, btn) {
  if (!confirm('🔓 Déverrouiller les feuilles de ' + clientNom + ' ?\n\nIls pourront à nouveau modifier leur Google Sheet directement.')) return;
  showLoadingOverlay('Déverrouillage en cours…');
  try {
    const res = await apiAs('deverrouilerAccesClient', clientId);
    hideLoadingOverlay();
    if (!res || !res.ok) { showToast('Erreur : ' + (res && res.msg || 'inconnue'), '#c0392b'); return; }
    const c = (_mesClients || []).find(cl => cl.id === clientId);
    if (c) c.verrouile = false;
    setPage('mes-clients');
    showToast('🔓 Feuilles déverrouillées', '#1D9E75');
  } catch(e) { hideLoadingOverlay(); showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function toggleChimieClientCoach(clientId, clientNom) {
  const c = (_mesClients || []).find(cl => cl.id === clientId);
  const nouvelEtat = !(c && c.chimieActif);
  showLoadingOverlay(nouvelEtat ? 'Activation…' : 'Désactivation…');
  try {
    const res = await apiAs('definirChimieActif', clientId, { actif: nouvelEtat });
    hideLoadingOverlay();
    if (!res || !res.ok) { showToast('Erreur : ' + (res && res.msg || 'inconnue'), '#c0392b'); return; }
    if (c) c.chimieActif = nouvelEtat;
    setPage('mes-clients');
    showToast(nouvelEtat ? '🧬 Protocole activé pour ' + clientNom : '🧬 Protocole désactivé pour ' + clientNom, '#1D9E75');
  } catch(e) { hideLoadingOverlay(); showToast('Erreur : ' + e.message, '#c0392b'); }
}

function renderMesClients() {
  const clients = (_mesClients || []).filter(c => c.id !== getClient());

  const rows = clients.map(c => {
    const tier = typeof niveauToTier === 'function' ? niveauToTier(c.niveau || 1) : 'debutant';
    const titreDef = (c.titreActif && typeof TITRES_DEF !== 'undefined') ? TITRES_DEF.find(t => t.id === c.titreActif) : null;
    const titreBadge = titreDef ? `<span style="display:inline-flex;align-items:center;gap:3px;background:linear-gradient(90deg,${titreDef.c2}cc,${titreDef.c1}99);border:1px solid ${titreDef.c1}55;border-radius:5px;padding:1px 6px 1px 4px;font-size:9px;font-weight:700;color:#f0f2ff;margin-left:7px;vertical-align:middle;">${titreDef.icon} ${titreDef.nom}</span>` : '';
    const connex = c.dernConnexion
      ? `<div style="font-size:10px;color:#555e7a;margin-top:3px;white-space:nowrap;">${esc(c.dernConnexion)}</div>`
      : `<div style="font-size:10px;color:#555e7a;margin-top:3px;">Jamais connecté</div>`;

    const lockBtn = c.verrouile
      ? `<button onclick="event.stopPropagation();deverrouilerClientCoach('${c.id}','${esc(c.nom)}',this)" style="width:30px;height:30px;background:#2d1a0e;border:1.5px solid #c0601a;border-radius:8px;font-size:14px;padding:0;margin:0;min-width:unset;cursor:pointer;flex-shrink:0;" title="Déverrouiller l'accès à la feuille">🔒</button>`
      : `<button onclick="event.stopPropagation();verrouilerClientCoach('${c.id}','${esc(c.nom)}',this)" style="width:30px;height:30px;background:#1e2235;border:1px solid #2d3142;border-radius:8px;font-size:14px;padding:0;margin:0;min-width:unset;cursor:pointer;flex-shrink:0;" title="Verrouiller l'accès à la feuille">🔒</button>`;

    const chimieBtn = `<button onclick="event.stopPropagation();toggleChimieClientCoach('${c.id}','${esc(c.nom)}')" style="width:30px;height:30px;background:${c.chimieActif ? '#2a1a3d' : '#1e2235'};border:1px solid ${c.chimieActif ? '#a78bfa' : '#2d3142'};border-radius:8px;font-size:14px;padding:0;margin:0;min-width:unset;cursor:pointer;flex-shrink:0;opacity:${c.chimieActif ? '1' : '.5'};" title="${c.chimieActif ? 'Désactiver' : 'Activer'} le protocole">🧬</button>`;

    return `<div onclick="ouvrirClientDetail('${c.id}')"
      class="card" style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;cursor:pointer;-webkit-tap-highlight-color:transparent;"
      ontouchstart="this.style.opacity='.75'" ontouchend="this.style.opacity='1'">
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:#f0f2ff;white-space:nowrap;">${esc(c.nom)}${titreBadge}</div>
        ${connex}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div style="font-size:11px;font-weight:700;color:#8892a4;">Niv.&nbsp;${c.niveau || 1}</div>
        ${typeof getBadgeSVG === 'function' ? getBadgeSVG(tier, 36, 'cl'+c.id) : ''}
        ${chimieBtn}
        ${lockBtn}
      </div>
    </div>`;
  });

  return `<div id="app">
    ${renderHeader('Mes clients', `${clients.length} client${clients.length > 1 ? 's' : ''}`, false)}
    <div class="page">
      ${rows.length ? rows.join('') : '<div class="empty"><div class="empty-icon">👥</div><div class="empty-text">Aucun client trouvé.</div></div>'}
      <button class="btn-secondary" onclick="loadHome()" style="margin-top:8px;">← Mon accueil</button>
    </div>
  </div>`;
}

// ── Coach home ────────────────────────────────────────────────────────

let _coachBilansCount = 0; // bilans à traiter (badge dans renderHome)

// ── Centre bilans ─────────────────────────────────────────────────────

let _centreBilansData = null;
let _coachBilanClientVu = null; // client dont on voit le bilan

async function loadCentreBilans() {
  showLoadingOverlay('Chargement…');
  try {
    _centreBilansData = await api('listerBilansCoach');
    _coachBilansCount = (_centreBilansData || []).filter(b => !b.coachTraite).length;
    hideLoadingOverlay();
    setPage('centre-bilans');
  } catch(e) { hideLoadingOverlay(); setPage('home'); }
}

async function marquerTraiteCoach(clientId, ts) {
  try {
    await apiAs('marquerBilanTraiteServeur', clientId, { ts });
    await loadCentreBilans();
    showToast('✓ Bilan marqué traité', '#1D9E75');
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

function renderCentreBilans() {
  const data = _centreBilansData || [];
  const aTraiter = data.filter(b => !b.coachTraite);
  const traites  = data.filter(b =>  b.coachTraite);

  if (data.length === 0) {
    return `<div id="app">
      ${renderHeader('Centre bilans', '', false)}
      <div class="page">
        <div class="empty">
          <div class="empty-text">Aucun bilan reçu pour l'instant.<br><span style="font-size:12px;color:#555e7a;margin-top:8px;display:block;">Les bilans envoyés par tes clients apparaîtront ici.</span></div>
        </div>
        <button class="btn-secondary" onclick="loadHome()">← Retour</button>
      </div>
    </div>`;
  }

  let html = '';

  // Stats
  html += `<div style="display:flex;gap:10px;margin-bottom:16px;">
    <div style="flex:1;background:#0d1a13;border:1px solid #1D9E7544;border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#1D9E75;">${aTraiter.length}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">À traiter</div>
    </div>
    <div style="flex:1;background:#161b2e;border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:var(--muted);">${traites.length}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">Traités</div>
    </div>
    <div style="flex:1;background:#161b2e;border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#f0f2ff;">${data.length}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">Total</div>
    </div>
  </div>`;

  // À traiter
  if (aTraiter.length > 0) {
    html += `<div class="section-title" style="color:#1D9E75;">📤 À traiter · ${aTraiter.length}</div>`;
    aTraiter.forEach(b => {
      const couleur = coachColor(b.client);
      html += `<div class="card" style="border-left:3px solid ${couleur};padding-left:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <div style="font-size:15px;font-weight:700;color:${couleur};">${esc(b.nom)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(b.semaine)}</div>
            <div style="font-size:11px;color:#555e7a;margin-top:3px;">Reçu ${formatTsCoach(b.ts)}</div>
          </div>
          <span style="font-size:10px;color:#8892a4;border:1px solid #2a305066;border-radius:4px;padding:2px 6px;">📋 Non traité</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button onclick="voirBilanClient('${b.client}','${esc(b.nom)}')"
            style="flex:1;background:#1e2444;border:1px solid var(--border);color:#c8d0e0;font-size:13px;padding:9px;margin:0;border-radius:8px;cursor:pointer;">
            👁 Bilan
          </button>
          <button onclick="voirMensurationsClient('${b.client}','${esc(b.nom)}')"
            style="flex:1;background:#1e2444;border:1px solid var(--border);color:#c8d0e0;font-size:13px;padding:9px;margin:0;border-radius:8px;cursor:pointer;">
            📏 Mensurations
          </button>
        </div>
        <button onclick="marquerTraiteCoach('${b.client}','${b.ts.replace(/'/g,"\\'")}')"
          style="width:100%;background:linear-gradient(135deg,#1D9E75,#167a5a);color:#fff;font-size:13px;padding:9px;margin:0;border-radius:8px;font-weight:600;border:none;cursor:pointer;">
          ✓ Marquer traité
        </button>
      </div>`;
    });
  } else {
    html += `<div style="background:#0d1a13;border:1px solid #1D9E7533;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">
      <div style="font-size:28px;margin-bottom:8px;">✅</div>
      <div style="font-size:14px;font-weight:600;color:#1D9E75;">Tout est traité !</div>
    </div>`;
  }

  // Traités
  if (traites.length > 0) {
    html += `<div class="section-title" style="color:var(--muted);">✓ Traités · ${traites.length}</div>`;
    traites.forEach(b => {
      const couleur = coachColor(b.client);
      html += `<div class="card" style="border-left:3px solid ${couleur}55;padding-left:14px;margin-bottom:8px;opacity:0.55;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:14px;font-weight:600;color:#8892a4;">${esc(b.nom)}</div>
            <div style="font-size:11px;color:#555e7a;margin-top:2px;">${esc(b.semaine)} · ${formatTsCoach(b.ts)}</div>
          </div>
          <span style="font-size:10px;color:#1D9E75;border:1px solid #1D9E7533;border-radius:4px;padding:2px 7px;white-space:nowrap;">✓ Traité</span>
        </div>
      </div>`;
    });
  }

  return `<div id="app">
    ${renderHeader('Centre bilans', '', false)}
    <div class="page">
      ${html}
      <button class="btn-secondary" onclick="loadCentreBilans()" style="margin-bottom:8px;">↻ Rafraîchir</button>
      <button class="btn-secondary" onclick="loadHome()">← Retour</button>
    </div>
  </div>`;
}

// ── Notifications ─────────────────────────────────────────────────────

let _notifData = null;
let _notifFiltre = null;

async function loadNotificationsCoach() {
  showLoadingOverlay('Chargement…');
  try {
    _notifData   = await api('chargerTousLesLogs');
    _notifFiltre = null;
    api('marquerNotifsLues').catch(() => {});
    S.data.notifsNonLues = 0;
    hideLoadingOverlay();
    setPage('notifications-coach');
  } catch(e) { hideLoadingOverlay(); setPage('home'); }
}

function renderNotificationsCoach() {
  const result = _notifData || { logs: [] };
  const allLogs = result.logs || [];
  const filtre = _notifFiltre;
  const liste = filtre ? allLogs.filter(l => l.client === filtre) : allLogs;

  // Clients uniques dans les logs pour les filtres
  const clientsVus = {};
  allLogs.forEach(l => { if (l.client) clientsVus[l.client] = l.nom || l.client; });

  let filtresHtml = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
    <button onclick="_notifFiltre=null;setPage('notifications-coach')"
      style="background:${!filtre?'#378ADD':'#2d3142'};color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">Tous</button>`;
  Object.entries(clientsVus).forEach(([cId, nom]) => {
    const col = coachColor(cId);
    filtresHtml += `<button onclick="_notifFiltre='${cId}';setPage('notifications-coach')"
      style="background:${filtre===cId?col:'#2d3142'};color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">${nom.split(' ')[0]}</button>`;
  });
  filtresHtml += `</div>`;

  let logsHtml = '';
  if (!liste || liste.length === 0) {
    logsHtml = '<div class="empty"><div class="empty-icon">🔔</div><div class="empty-text">Aucune activité sur les 7 derniers jours.</div></div>';
  } else {
    liste.forEach(l => {
      const couleur = coachColor(l.client);
      const isBilan = l.type === 'bilan';
      const progParts = (l.programme || '').split('|');
      const progNom = progParts[0];
      const nomSeance = progParts[1] || '';
      let ligne2, ligne3;
      if (isBilan) {
        ligne2 = '📋 Bilan clôturé';
        ligne3 = l.semaine ? 'Semaine ' + l.semaine : '';
      } else if (l.type === 'journee') {
        ligne2 = '✅ Journée validée';
        ligne3 = l.semaine || '';
      } else if (l.type === 'bilanEnvoye') {
        ligne2 = '📤 Bilan envoyé au coach';
        ligne3 = l.semaine ? 'Semaine ' + l.semaine : '';
      } else if (l.type === 'bonus_ponctualite') {
        ligne2 = '🎯 Bonus de ponctualité du bilan';
        ligne3 = l.semaine ? 'Semaine ' + l.semaine : '';
      } else if (l.type === 'bonus_streak') {
        ligne2 = '🔥 Bonus série de bilans';
        ligne3 = l.semaine ? 'Semaine ' + l.semaine : '';
      } else if (l.type === 'bonus_pas') {
        ligne2 = '🦶 Objectif pas atteint';
        ligne3 = l.semaine || '';
      } else {
        ligne2 = '✅ ' + (l.semaine ? 'S' + l.semaine : '') + (nomSeance ? ' · ' + nomSeance : ' · Séance validée');
        ligne3 = progNom;
      }
      const clickStyle = isBilan ? `cursor:pointer;` : '';
      const clickAttr  = isBilan ? `onclick="voirBilanClient('${l.client}','${esc(l.nom)}')"` : '';
      logsHtml += `<div class="card" ${clickAttr} style="border-left:3px solid ${couleur};padding-left:14px;margin-bottom:10px;${clickStyle}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="font-size:14px;font-weight:700;color:${couleur};">${esc(l.nom)}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${isBilan ? `<span style="font-size:10px;color:${couleur};border:1px solid ${couleur}44;border-radius:4px;padding:1px 5px;">Voir ›</span>` : ''}
            <div style="font-size:11px;color:#8892a4;">${formatTsCoach(l.ts)}</div>
          </div>
        </div>
        <div style="font-size:13px;color:#e8eaf0;margin-top:4px;">${ligne2}</div>
        ${ligne3 ? `<div style="font-size:12px;color:#8892a4;margin-top:2px;">${ligne3}</div>` : ''}
      </div>`;
    });
  }

  return `<div id="app">
    ${renderHeader('Notifications', '7 derniers jours', false)}
    <div class="page">
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button class="btn-secondary" onclick="loadHome()" style="margin:0;flex:1;">← Retour</button>
        <button class="btn-secondary" onclick="loadNotificationsCoach()" style="margin:0;flex:1;">↻ Rafraîchir</button>
      </div>
      ${filtresHtml}
      ${logsHtml}
      <button class="btn-secondary" onclick="loadNotificationsCoach()" style="margin-bottom:8px;">↻ Rafraîchir</button>
      <button class="btn-secondary" onclick="loadHome()">← Retour</button>
    </div>
  </div>`;
}

// ── Voir bilan / mensurations client (coach) ──────────────────────────
// Comme en GAS : le coach "devient" temporairement le client (vue client)
// pour voir/modifier son bilan ou ses mensurations avec exactement les
// mêmes pages, le même comportement, et les mêmes droits d'édition.
// "Retour coach" ramène à la page d'où on est parti (centre-bilans,
// notifications-coach, ou mes-clients).

function voirBilanClient(clientId, nom) {
  const retour = S.page;
  _clientSelectionne = { id: clientId, nom: nom || clientId };
  enterVueClient(clientId, async () => {
    // Comme en GAS (voirBilanDepuisNotif) : montre le DERNIER bilan clôturé/envoyé,
    // pas le bilan de la semaine en cours (pas encore validé)
    setPage('bilan-loading');
    try {
      const hist = await api('chargerHistoriqueBilans');
      if (!hist || hist.length === 0) {
        showToast('Aucun bilan clôturé pour ce client.', '#c0392b');
        exitVueClient();
        return;
      }
      await loadBilanHistorique(hist[0].ligneTitre);
    } catch(e) {
      showToast('Erreur : ' + e.message, '#c0392b');
      exitVueClient();
    }
  }, retour);
}

function voirMensurationsClient(clientId, nom) {
  const retour = S.page;
  _clientSelectionne = { id: clientId, nom: nom || clientId };
  enterVueClient(clientId, () => loadMensurations(), retour);
}

// ── Rapports de bugs (coach) ──────────────────────────────────────────

let _rapportsBugsData = null;

async function loadRapportsBugs() {
  showLoadingOverlay('Chargement…');
  try {
    _rapportsBugsData = await api('chargerRapportsBugs');
    hideLoadingOverlay();
    setPage('rapports-bugs');
    (_rapportsBugsData.bugs || []).filter(b => !b.lu).forEach(b => {
      api('marquerBugLu', { ligne: b.ligne }).catch(() => {});
    });
    S.data.bugsNonLus = 0;
  } catch(e) { hideLoadingOverlay(); setPage('home'); }
}

function renderRapportsBugs() {
  const bugs = (_rapportsBugsData && _rapportsBugsData.bugs) || [];

  let html = '';
  if (!bugs.length) {
    html = '<div class="empty"><div class="empty-icon">🐛</div><div class="empty-text">Aucun rapport pour l\'instant. 🎉</div></div>';
  } else {
    bugs.forEach(b => {
      const couleur = coachColor(b.client);
      const opacity = b.lu ? '0.6' : '1';
      html += `<div class="card" style="margin-bottom:10px;border-left:3px solid ${couleur};padding-left:14px;opacity:${opacity};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <div style="font-size:14px;font-weight:700;color:${couleur};">${esc(b.nom)} ${!b.lu ? '<span style="background:#e74c3c;color:#fff;font-size:10px;padding:2px 6px;border-radius:8px;margin-left:6px;">NEW</span>' : ''}</div>
          <div style="font-size:11px;color:#8892a4;">${formatTsCoach(b.ts)}</div>
        </div>
        <div style="font-size:13px;color:#e8eaf0;white-space:pre-wrap;">${esc(b.message)}</div>
      </div>`;
    });
  }

  return `<div id="app">
    ${renderHeader('Rapports de bugs', '', false)}
    <div class="page">
      ${html}
      <button class="btn-secondary" onclick="loadRapportsBugs()" style="margin-bottom:8px;">↻ Rafraîchir</button>
      <button class="btn-secondary" onclick="loadHome()">← Retour</button>
    </div>
  </div>`;
}

// ── Base alimentaire — modération des ajouts communautaires ─────────────
let _alimentsAValider = null;

async function loadAlimentsAValider() {
  showLoadingOverlay('Chargement…');
  try {
    _alimentsAValider = await api('listerAlimentsCommunauteAValider');
    hideLoadingOverlay();
    setPage('aliments-a-valider');
  } catch(e) { hideLoadingOverlay(); setPage('home'); }
}

function renderAlimentsAValider() {
  const liste = _alimentsAValider || [];
  let html = '';
  if (liste.length === 0) {
    html = '<div class="empty"><div class="empty-icon">🍎</div><div class="empty-text">Aucun ajout en attente de validation.</div></div>';
  } else {
    liste.forEach(a => {
      html += `<div class="card" style="border-left:3px solid #a78bfa;padding-left:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <div style="font-size:15px;font-weight:700;color:#e8eaf0;">${esc(a.nom)}</div>
            <div style="font-size:11px;color:#8892a4;margin-top:2px;">Ajouté par ${esc(a.ajoutePar)} · ${esc(a.date)}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-around;text-align:center;padding:10px 0;background:#0f1117;border-radius:8px;margin-bottom:6px;">
          <div><span style="font-size:13px;font-weight:600;">${Math.round(a.kcal*100)}</span><div class="macro-label">KCAL/100g</div></div>
          <div><span style="font-size:13px;font-weight:600;color:#378ADD;">${Math.round(a.prot*100)}</span><div class="macro-label">PROT</div></div>
          <div><span style="font-size:13px;font-weight:600;color:var(--green);">${Math.round(a.glu*100)}</span><div class="macro-label">GLU</div></div>
          <div><span style="font-size:13px;font-weight:600;color:#D85A30;">${Math.round(a.lip*100)}</span><div class="macro-label">LIP</div></div>
        </div>
        <div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:10px;">dont sucres ${Math.round((a.sucres||0)*100)}g · fibres ${Math.round((a.fibres||0)*100)}g · dont AGS ${Math.round((a.ags||0)*100)}g</div>
        <div style="display:flex;gap:8px;">
          <button onclick="validerAlimentCoachAction(${a.ligne})" style="flex:1;padding:10px;background:linear-gradient(135deg,#1D9E75,#167a5a);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">✓ Valider</button>
          <button onclick="supprimerAlimentCoachAction(${a.ligne})" style="flex:1;padding:10px;background:#2d3142;border:none;border-radius:8px;color:#e05c5c;font-size:13px;font-weight:700;cursor:pointer;">✕ Supprimer</button>
        </div>
      </div>`;
    });
  }

  return `<div id="app">
    ${renderHeader('Base alimentaire', liste.length ? liste.length + ' en attente' : '', false)}
    <div class="page">
      ${html}
      <button class="btn-secondary" onclick="loadHome()">← Retour</button>
    </div>
  </div>`;
}

async function validerAlimentCoachAction(ligne) {
  try {
    await api('validerAlimentCommunaute', { ligne });
    _alimentsAValider = (_alimentsAValider || []).filter(a => a.ligne !== ligne);
    setPage('aliments-a-valider');
    showToast('✓ Aliment validé', '#1D9E75');
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}

async function supprimerAlimentCoachAction(ligne) {
  try {
    await api('supprimerAlimentCommunaute', { ligne });
    // Supprimer une ligne décale les numéros de ligne suivants — refetch
    // plutôt que filtrer localement pour rester cohérent avec le serveur.
    _alimentsAValider = await api('listerAlimentsCommunauteAValider');
    setPage('aliments-a-valider');
    showToast('🗑️ Aliment supprimé', '#8892a4');
  } catch(e) { showToast('Erreur : ' + e.message, '#c0392b'); }
}
