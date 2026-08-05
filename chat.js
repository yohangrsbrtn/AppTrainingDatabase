// ── Chat commun (client) — un seul salon, tous les clients + le coach ──────
// Temps réel via Supabase Realtime (sbAuth.channel, index.html). Pas de
// messages privés : tout le monde voit tout, décision explicite du coach.
//
// Affichage : panneau latéral flottant (pas une page goTo/setPage) ouvert
// par-dessus la page en cours, déclenché par un bouton flottant déplaçable
// (drag) et masquable (appui long). Le bouton flottant est ré-injecté dans
// le DOM à chaque changement de page par setPage() (index.html), comme les
// bannières coachRetourBanner/coachConsoleBanner — nécessaire car la plupart
// des pages remplacent entièrement document.body.innerHTML. S'il a été
// masqué, seul le bouton "Chat" du header accueil (_chatOuvrirDepuisHeader,
// appelé via goTo('chat')) le fait réapparaître.

let _chatMessages = [];
let _chatProfils = {};  // client_id -> { prenom, nom, pseudo, photo_url }
let _chatReactions = {}; // message_id -> { emoji: Set(client_id) }
const _CHAT_REACT_EMOJIS = ['👍','❤️','😂','😮','😢','🙏'];
let _chatChannel = null;
let _chatLoaded = false;
let _chatOuvert = false;
let _chatNonLus = 0;
let _chatNonLusInitDone = false;

const _CHAT_FAB_POS_KEY    = 'at_chat_fab_pos';
const _CHAT_FAB_HIDDEN_KEY = 'at_chat_fab_hidden';

// ── Non-lus — personnalisé par utilisateur (id du dernier message lu stocké
// par client_id, localStorage) ─────────────────────────────────────────────
function _chatLastReadKey() { return 'at_chat_dernier_lu_' + (S.client || ''); }

// Calcule le nombre de messages non lus au démarrage (pas seulement ceux reçus
// pendant que l'app est ouverte, cf. _chatSubscribe) : compare le dernier id lu
// stocké pour CE client à ceux réellement en base, en excluant ses propres
// messages. Premier lancement jamais pour ce client sur cet appareil : pas de
// rattrapage rétroactif sur tout l'historique existant (marqué "à jour" direct),
// sinon un client qui découvre le chat des semaines après son lancement se
// prendrait un gros chiffre d'un coup pour de vieux messages qu'il n'a jamais eu
// l'occasion de manquer.
async function _chatInitNonLus() {
  const key = _chatLastReadKey();
  let dernierLu = localStorage.getItem(key);
  try {
    if (dernierLu === null) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages?order=id.desc&limit=1&select=id`, { headers: supaHeaders() });
      const arr = res.ok ? await res.json() : [];
      dernierLu = String((arr[0] && arr[0].id) || 0);
      localStorage.setItem(key, dernierLu);
      _chatNonLus = 0;
    } else {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages?id=gt.${dernierLu}&client_id=neq.${encodeURIComponent(S.client)}&select=id`, { headers: supaHeaders() });
      const arr = res.ok ? await res.json() : [];
      _chatNonLus = arr.length;
    }
  } catch(e) { _chatNonLus = 0; }
  _chatUpdateFabBadge();
}

// Marque tous les messages actuellement chargés comme lus pour CE client.
function _chatMarquerToutLu() {
  if (!_chatMessages.length) return;
  const maxId = Math.max(..._chatMessages.map(m => m.id));
  localStorage.setItem(_chatLastReadKey(), String(maxId));
  _chatSyncLectureServeur(maxId);
}

// Copie serveur de "dernier message lu" (table chat_lecture) — le localStorage seul
// ne suffit pas pour décider d'envoyer un push : ça doit marcher app fermée. Upsert
// fire-and-forget, ne bloque jamais l'UI si ça échoue (juste un push en retard).
let _chatSyncLectureDerniereMaj = 0;
function _chatSyncLectureServeur(maxId) {
  if (!S.client || maxId <= _chatSyncLectureDerniereMaj) return;
  _chatSyncLectureDerniereMaj = maxId;
  fetch(`${SUPABASE_URL}/rest/v1/chat_lecture?on_conflict=client_id`, {
    method: 'POST', headers: supaHeaders({ Prefer: 'return=minimal,resolution=merge-duplicates' }),
    body: JSON.stringify({ client_id: S.client, dernier_lu_id: maxId, updated_at: new Date().toISOString() })
  }).catch(() => {});
}

// ── Bouton flottant ──────────────────────────────────────────────────────

function _chatEnsureFab() {
  if (!S.client) return;
  // Souscription + calcul initial des non-lus AVANT le check "masqué" : le badge du
  // bouton chat du header doit fonctionner même si le bouton flottant est masqué/
  // désactivé (Paramètres) — ce sont deux affichages distincts du même compteur.
  _chatSubscribe();
  if (!_chatNonLusInitDone) { _chatNonLusInitDone = true; _chatInitNonLus(); }
  if (localStorage.getItem(_CHAT_FAB_HIDDEN_KEY) === '1') {
    const ex = document.getElementById('chatFab');
    if (ex) ex.remove();
    return;
  }
  if (document.getElementById('chatFab')) { _chatUpdateFabBadge(); return; }

  let pos = null;
  try { pos = JSON.parse(localStorage.getItem(_CHAT_FAB_POS_KEY) || 'null'); } catch(e) {}

  // Style "léger" — même logique que les boutons de notation non cliqués du bilan
  // (_styleNoteBtn/bilan.js) : fond teinté très transparent + bordure discrète dans la
  // même couleur, pas de aplat plein ni d'ombre marquée.
  const _CHAT_FAB_COLOR = '#f0a500';
  const fab = document.createElement('div');
  fab.id = 'chatFab';
  fab.style.cssText = `position:fixed;right:${pos ? pos.right + 'px' : '16px'};bottom:${pos ? pos.bottom + 'px' : 'calc(88px + env(safe-area-inset-bottom))'};width:50px;height:50px;border-radius:50%;background:${_CHAT_FAB_COLOR}22;border:1px solid ${_CHAT_FAB_COLOR}55;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:8500;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;`;
  fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 17 17" fill="none"><path d="M1.5 8.2c0-3.4 3.1-6.2 7-6.2s7 2.8 7 6.2-3.1 6.2-7 6.2c-.9 0-1.8-.15-2.6-.44L2.2 15.2l.9-3C2 11.1 1.5 9.7 1.5 8.2z" stroke="${_CHAT_FAB_COLOR}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div id="chatFabBadge" style="display:none;position:absolute;top:-3px;right:-3px;min-width:17px;height:17px;padding:0 4px;background:#e05c5c;border-radius:9px;color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center;box-shadow:0 0 0 2px #0f1117;"></div>`;
  document.body.appendChild(fab);
  _chatBindFabDrag(fab);
  _chatUpdateFabBadge();
  _chatWatchModals();
}

// Masque le bouton flottant tant qu'une fenêtre plein écran (Paramètres...) est ouverte
// par-dessus — sinon il reste visible au-dessus du fond assombri, son z-index élevé
// n'ayant aucune raison de céder devant celui de ces panneaux. Un MutationObserver plutôt
// que d'accrocher chaque bouton de fermeture individuellement (backdrop, croix, swipe,
// déconnexion...) : settingsPanel peut se fermer par plusieurs chemins différents.
const _CHAT_MODALS_QUI_MASQUENT = ['settingsPanel'];
let _chatModalObserver = null;
function _chatWatchModals() {
  if (_chatModalObserver) return;
  _chatModalObserver = new MutationObserver(() => {
    const fab = document.getElementById('chatFab');
    if (!fab) return;
    const modalOuverte = _CHAT_MODALS_QUI_MASQUENT.some(id => document.getElementById(id));
    if (modalOuverte) fab.style.display = 'none';
    else if (!_chatOuvert) fab.style.display = 'flex';
  });
  _chatModalObserver.observe(document.body, { childList: true });
}

// Pointer events (touch + souris unifiés) SEULEMENT pour détecter le déplacement (drag)
// et l'appui long — l'ouverture du panneau, elle, passe par l'événement natif `click`
// (voir plus bas), pas par notre propre déduction pointerdown/pointerup. Un tap rapide
// pouvait auparavant échouer à ouvrir le panneau si le navigateur annulait la séquence
// pointer (pointercancel) au profit du tap "natif" — ce qui arrive plus facilement quand
// le bouton flottant chevauche une brique cliquable en dessous (bug vécu, 2026-08-05) —
// puisque `dragging` retombait à false sans jamais appeler `_chatTogglePanel()`. `click`
// est garanti par le navigateur pour tout tap sans déplacement significatif, quel que
// soit le sort de la séquence pointer sous-jacente.
function _chatBindFabDrag(fab) {
  let dragging = false, moved = false, startX = 0, startY = 0, startRight = 0, startBottom = 0, longPressTimer = null;

  fab.addEventListener('pointerdown', e => {
    try { fab.setPointerCapture(e.pointerId); } catch(err) {}
    dragging = true; moved = false;
    startX = e.clientX; startY = e.clientY;
    const rect = fab.getBoundingClientRect();
    startRight = window.innerWidth - rect.right;
    startBottom = window.innerHeight - rect.bottom;
    longPressTimer = setTimeout(() => { if (dragging && !moved) { moved = true; _chatMasquerFab(); } }, 550);
  });
  fab.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) { moved = true; clearTimeout(longPressTimer); }
    if (moved) {
      const right  = Math.max(4, Math.min(window.innerWidth  - 56, startRight  - dx));
      const bottom = Math.max(4, Math.min(window.innerHeight - 56, startBottom - dy));
      fab.style.right = right + 'px';
      fab.style.bottom = bottom + 'px';
    }
  });
  const finirGeste = () => {
    clearTimeout(longPressTimer);
    if (dragging && moved && fab.style.right) {
      localStorage.setItem(_CHAT_FAB_POS_KEY, JSON.stringify({ right: parseFloat(fab.style.right), bottom: parseFloat(fab.style.bottom) }));
    }
    dragging = false;
  };
  fab.addEventListener('pointerup', finirGeste);
  fab.addEventListener('pointercancel', finirGeste);
  fab.addEventListener('click', () => {
    // `moved` vient d'être mis à jour par pointerup/pointercancel juste avant (même tick) :
    // un drag ou un appui long (déjà traité par _chatMasquerFab) ne doit pas EN PLUS ouvrir
    // le panneau au clic qui suit.
    if (moved) return;
    _chatTogglePanel();
  });
}

function _chatMasquerFab() {
  localStorage.setItem(_CHAT_FAB_HIDDEN_KEY, '1');
  const fab = document.getElementById('chatFab');
  if (fab) fab.remove();
  if (_chatOuvert) _chatFermerPanel();
  if (typeof showToast === 'function') showToast('Chat masqué — réaffichable depuis le bouton 💬 de l\'accueil', '#2d3142');
}

// Appelé par goTo('chat') → bouton chat du header accueil : fait réapparaître
// le bouton flottant s'il avait été masqué, ET ouvre directement le panneau.
function _chatOuvrirDepuisHeader() {
  localStorage.removeItem(_CHAT_FAB_HIDDEN_KEY);
  _chatEnsureFab();
  _chatTogglePanel(true);
}

// Met à jour les DEUX affichages du compteur de non-lus — bouton flottant ET bouton
// du header accueil (renderCarteHeader/index.html) — toujours ensemble, jamais l'un
// sans l'autre, pour qu'ils restent cohérents en toutes circonstances.
function _chatUpdateFabBadge() {
  const badge = document.getElementById('chatFabBadge');
  if (badge) {
    if (_chatNonLus > 0) { badge.style.display = 'flex'; badge.textContent = _chatNonLus > 9 ? '9+' : String(_chatNonLus); }
    else badge.style.display = 'none';
  }
  if (typeof _majCarteHeader === 'function') _majCarteHeader();
}

// ── Panneau latéral ──────────────────────────────────────────────────────

function _chatTogglePanel(forceOpen) {
  if (_chatOuvert) { if (!forceOpen) _chatFermerPanel(); return; }
  _chatOuvert = true;
  _chatNonLus = 0;
  _chatUpdateFabBadge();
  _chatRenderPanel();
  if (!_chatLoaded) _chatCharger();
  else { _chatRenderMessages(); setTimeout(_chatScrollBas, 30); _chatMarquerToutLu(); }
}

function _chatFermerPanel() {
  _chatOuvert = false;
  const overlay = document.getElementById('chatOverlay');
  const panel = document.getElementById('chatPanel');
  const fab = document.getElementById('chatFab');
  if (panel) panel.style.transform = 'translateX(100%)';
  if (overlay) overlay.style.opacity = '0';
  if (fab) fab.style.display = 'flex';
  setTimeout(() => { const el = document.getElementById('chatOverlay'); if (el) el.remove(); }, 250);
}

function _chatRenderPanel() {
  const fab = document.getElementById('chatFab');
  if (fab) fab.style.display = 'none';
  if (document.getElementById('chatOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'chatOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;opacity:0;transition:opacity .25s;';
  overlay.addEventListener('click', e => { if (e.target === overlay) _chatFermerPanel(); });
  overlay.innerHTML = `<div id="chatPanel" class="sheet-body" style="position:absolute;top:0;right:0;height:100%;width:min(380px,88vw);background:#12141e;box-shadow:-8px 0 30px rgba(0,0,0,.5);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .28s ease;overscroll-behavior:contain;">
    <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;padding-top:calc(14px + env(safe-area-inset-top));border-bottom:1px solid #232838;">
      <div>
        <div style="font-size:15px;font-weight:700;color:#e8eaf0;display:flex;align-items:center;gap:6px;"><svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M1.5 8.2c0-3.4 3.1-6.2 7-6.2s7 2.8 7 6.2-3.1 6.2-7 6.2c-.9 0-1.8-.15-2.6-.44L2.2 15.2l.9-3C2 11.1 1.5 9.7 1.5 8.2z" stroke="#e8eaf0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Chat</div>
        <div style="font-size:11px;color:#8892a4;">Tout le monde peut se parler ici</div>
      </div>
      <button onclick="_chatFermerPanel()" style="width:32px;height:32px;background:#1e2235;border:none;border-radius:9px;color:#8892a4;font-size:16px;cursor:pointer;">✕</button>
    </div>
    <div id="chatMessages" style="flex:1;overflow-y:auto;padding:14px 16px;overscroll-behavior:contain;">
      <div style="text-align:center;padding:40px 0;"><div class="spin" style="margin:0 auto;"></div></div>
    </div>
    <div style="flex-shrink:0;display:flex;gap:8px;padding:10px 12px;padding-bottom:calc(10px + env(safe-area-inset-bottom));border-top:1px solid #232838;background:#161923;">
      <input id="chatInput" type="text" placeholder="Écris un message…" autocomplete="off"
        style="flex:1;padding:11px 14px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:20px;font-size:16px;"
        onkeydown="if(event.key==='Enter'){event.preventDefault();envoyerMessageChat();}">
      <button onclick="envoyerMessageChat()" style="width:42px;height:42px;flex-shrink:0;background:#4f6ef7;border:none;border-radius:50%;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">➤</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  _chatBindLongPress(document.getElementById('chatMessages'));
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    const panel = document.getElementById('chatPanel');
    if (panel) panel.style.transform = 'translateX(0)';
  });
}

// ── Chargement + données ─────────────────────────────────────────────────

async function _chatCharger() {
  try {
    const [msgRes, profilRes, reactRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/chat_messages?order=created_at.asc&limit=200&select=id,client_id,texte,created_at`, { headers: supaHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/client_profils?select=client_id,prenom,nom,pseudo,photo_url`, { headers: supaHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/chat_reactions?select=message_id,client_id,emoji`, { headers: supaHeaders() }),
    ]);
    _chatMessages = msgRes.ok ? await msgRes.json() : [];
    const profils = profilRes.ok ? await profilRes.json() : [];
    _chatProfils = {};
    profils.forEach(p => { _chatProfils[p.client_id] = p; });
    _chatReactions = {};
    const reactions = reactRes.ok ? await reactRes.json() : [];
    reactions.forEach(r => {
      const map = _chatReactions[r.message_id] = _chatReactions[r.message_id] || {};
      (map[r.emoji] = map[r.emoji] || new Set()).add(r.client_id);
    });
    _chatLoaded = true;
    _chatRenderMessages();
    setTimeout(_chatScrollBas, 50);
    _chatMarquerToutLu();
  } catch(e) {
    const el = document.getElementById('chatMessages');
    if (el) el.innerHTML = `<div class="empty"><div class="empty-text">Erreur de chargement du chat</div></div>`;
  }
}

// Un seul canal réutilisé pour toute la session (souscrit dès que le bouton
// flottant existe, pas seulement à l'ouverture du panneau, pour que le badge
// de non-lus fonctionne même chat fermé) — le check _chatChannel évite
// d'empiler plusieurs abonnements (et donc des messages dupliqués).
function _chatSubscribe() {
  if (_chatChannel) return;
  _chatChannel = sbAuth.channel('chat_messages_realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
      _chatMessages.push(payload.new);
      if (_chatOuvert && document.getElementById('chatMessages')) {
        _chatAppendMessage(payload.new);
        _chatScrollBas();
        _chatMarquerToutLu(); // panneau ouvert = lu immédiatement, en direct
      } else if (payload.new.client_id !== S.client) {
        _chatNonLus++;
        _chatUpdateFabBadge();
      }
    })
    // Une suppression (coach modère un message, par ex.) doit disparaître en direct chez
    // tout le monde, sans devoir fermer/rouvrir le panneau — sinon un message resterait
    // affiché indéfiniment côté client tant qu'il ne recharge pas.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, payload => {
      const id = payload.old && payload.old.id;
      if (id == null) return;
      _chatMessages = _chatMessages.filter(m => m.id !== id);
      const el = document.querySelector(`#chatMessages [data-msg-id="${id}"]`);
      if (el) el.remove();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_reactions' }, payload => {
      const r = payload.new;
      const map = _chatReactions[r.message_id] = _chatReactions[r.message_id] || {};
      (map[r.emoji] = map[r.emoji] || new Set()).add(r.client_id);
      _chatUpdateReactionBar(r.message_id);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_reactions' }, payload => {
      const r = payload.old;
      if (!r) return;
      const map = _chatReactions[r.message_id];
      if (map && map[r.emoji]) map[r.emoji].delete(r.client_id);
      _chatUpdateReactionBar(r.message_id);
    })
    .subscribe();
}

// Même convention que le classement (renderTop5Home/renderClassement, index.html) :
// pseudo + "(Prénom N.)" entre parenthèses s'il existe, sinon "Prénom N." abrégé —
// le nom de famille complet ne doit JAMAIS apparaître nulle part dans l'app, y compris
// ici (bug vécu : sans pseudo, _nomAffichage(p).principal seul renvoie "Prénom Nom" en
// entier, jamais abrégé — cette fonction UNIQUEMENT n'appliquait pas l'abréviation
// appliquée partout ailleurs).
function _chatNomAffiche(clientId) {
  const p = _chatProfils[clientId];
  if (!p) return clientId;
  const { principal, secondaire } = _nomAffichage(p);
  if (secondaire) return `${principal} (${secondaire})`;
  const parts = principal.trim().split(' ');
  return parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '');
}

// Contenu (uniquement les pastilles de réactions déjà posées, s'il y en a) pour le
// message donné — utilisé au rendu initial de la bulle ET pour rafraîchir juste cette
// barre en direct (realtime, toggle optimiste) sans re-render de tout le fil. Pas de
// bouton "+" visible en permanence — discret comme une vraie app, le picker s'ouvre par
// appui long sur le message (voir _chatBindLongPress), refermable en touchant ailleurs.
function _chatReactionsBarHtml(messageId) {
  const map = _chatReactions[messageId] || {};
  return Object.keys(map).filter(e => map[e].size > 0).map(e => {
    const mine = map[e].has(S.client);
    return `<span onclick="_chatToggleReaction(${messageId},'${e}')" style="display:inline-flex;align-items:center;gap:3px;font-size:12px;padding:2px 7px;border-radius:10px;background:${mine ? '#4f6ef733' : '#1e223580'};border:1px solid ${mine ? '#4f6ef7' : '#2d3142'};cursor:pointer;">${e} ${map[e].size}</span>`;
  }).join('');
}

function _chatUpdateReactionBar(messageId) {
  const bar = document.getElementById('chatReact-' + messageId);
  if (bar) bar.innerHTML = _chatReactionsBarHtml(messageId);
}

// Un seul picker ouvert à la fois — ouvert par appui long sur une bulle (voir
// _chatBindLongPress), refermé sans réagir par un tap n'importe où ailleurs
// (_chatCloseAllPickers, écouteur global posé une seule fois plus bas).
function _chatOuvrirPicker(messageId) {
  document.querySelectorAll('[id^="chatPicker-"]').forEach(el => el.remove());
  const bar = document.getElementById('chatReact-' + messageId);
  if (!bar) return;
  const picker = document.createElement('div');
  picker.id = 'chatPicker-' + messageId;
  picker.style.cssText = 'display:flex;gap:8px;margin-top:5px;background:#1a1f30;border:1px solid #2d3142;border-radius:10px;padding:6px 9px;width:fit-content;';
  picker.innerHTML = _CHAT_REACT_EMOJIS.map(e =>
    `<span onclick="_chatToggleReaction(${messageId},'${e}');document.getElementById('chatPicker-${messageId}')?.remove();" style="font-size:17px;cursor:pointer;">${e}</span>`
  ).join('');
  picker.addEventListener('click', e => e.stopPropagation()); // évite que le tap sur un emoji remonte jusqu'à l'écouteur global de fermeture
  bar.insertAdjacentElement('afterend', picker);
}
function _chatCloseAllPickers() {
  document.querySelectorAll('[id^="chatPicker-"]').forEach(el => el.remove());
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('[id^="chatPicker-"]')) _chatCloseAllPickers();
});

// Appui long (souris ou tactile, unifié via pointer events) sur une bulle de message —
// ouvre le picker de réaction. Un déplacement notable pendant l'appui annule (c'est un
// scroll, pas une intention de réagir). Délégation sur le conteneur : les bulles sont
// ajoutées/retirées dynamiquement, pas besoin de rebrancher un listener par message.
function _chatBindLongPress(container) {
  if (!container || container._longPressBound) return;
  container._longPressBound = true;
  let timer = null, startX = 0, startY = 0;
  const annuler = () => { clearTimeout(timer); timer = null; };
  container.addEventListener('pointerdown', e => {
    const bulle = e.target.closest('[data-msg-id]');
    if (!bulle) return;
    const id = Number(bulle.dataset.msgId);
    startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => { timer = null; if (navigator.vibrate) navigator.vibrate(12); _chatOuvrirPicker(id); }, 420);
  });
  container.addEventListener('pointermove', e => {
    if (timer && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) annuler();
  });
  container.addEventListener('pointerup', annuler);
  container.addEventListener('pointercancel', annuler);
}

// Toggle optimiste (mise à jour locale immédiate) + persistance Supabase — la mise à
// jour Realtime qui revient ensuite (y compris pour sa propre action) est idempotente
// sur un Set, donc pas de double-comptage.
async function _chatToggleReaction(messageId, emoji) {
  if (!S.client) return;
  const map = _chatReactions[messageId] = _chatReactions[messageId] || {};
  const set = map[emoji] = map[emoji] || new Set();
  const mine = set.has(S.client);
  if (mine) set.delete(S.client); else set.add(S.client);
  _chatUpdateReactionBar(messageId);
  try {
    if (mine) {
      await fetch(`${SUPABASE_URL}/rest/v1/chat_reactions?message_id=eq.${messageId}&client_id=eq.${encodeURIComponent(S.client)}&emoji=eq.${encodeURIComponent(emoji)}`, {
        method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' })
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/chat_reactions`, {
        method: 'POST', headers: supaHeaders({ Prefer: 'return=minimal,resolution=merge-duplicates' }),
        body: JSON.stringify({ message_id: messageId, client_id: S.client, emoji })
      });
    }
  } catch(e) {}
}

function _chatBulleHtml(m) {
  const moi = m.client_id === S.client;
  const p = _chatProfils[m.client_id] || {};
  const initiales = ((p.prenom ? p.prenom[0] : '') + (p.nom ? p.nom[0] : '')).toUpperCase() || '?';
  const heure = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  const reactBar = `<div id="chatReact-${m.id}" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:4px;">${_chatReactionsBarHtml(m.id)}</div>`;
  if (moi) {
    return `<div style="display:flex;justify-content:flex-end;margin-bottom:10px;" data-msg-id="${m.id}">
      <div style="max-width:78%;">
        <div style="background:linear-gradient(135deg,#4f6ef7,#3b5ce0);color:#fff;border-radius:14px 14px 3px 14px;padding:9px 13px;font-size:14px;line-height:1.4;word-break:break-word;">${esc(m.texte)}</div>
        <div style="font-size:10px;color:#555e7a;text-align:right;margin-top:2px;">${heure}</div>
        ${reactBar}
      </div>
    </div>`;
  }
  return `<div style="display:flex;align-items:flex-end;gap:8px;margin-bottom:10px;" data-msg-id="${m.id}">
    ${_avatarCircleHtml(p.photo_url, initiales, 26)}
    <div style="max-width:74%;">
      <div style="font-size:11px;color:#8892a4;margin-bottom:2px;">${esc(_chatNomAffiche(m.client_id))}</div>
      <div style="background:#1e2235;color:#e8eaf0;border-radius:14px 14px 14px 3px;padding:9px 13px;font-size:14px;line-height:1.4;word-break:break-word;">${esc(m.texte)}</div>
      <div style="font-size:10px;color:#555e7a;margin-top:2px;">${heure}</div>
      ${reactBar}
    </div>
  </div>`;
}

function _chatRenderMessages() {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  el.innerHTML = _chatMessages.length
    ? _chatMessages.map(_chatBulleHtml).join('')
    : `<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">Aucun message pour l'instant — lance la discussion !</div></div>`;
}

function _chatAppendMessage(m) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  el.insertAdjacentHTML('beforeend', _chatBulleHtml(m));
}

function _chatScrollBas() {
  const el = document.getElementById('chatMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

async function envoyerMessageChat() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const texte = input.value.trim();
  if (!texte) return;
  input.value = '';
  input.disabled = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
      method: 'POST', headers: supaHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ client_id: getClient(), texte })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    // Pas d'ajout optimiste : le message affiché arrive via le canal realtime
    // (évite tout risque de doublon si l'événement revient très vite).
  } catch(e) {
    input.value = texte;
    alert('Message non envoyé : ' + e.message);
  } finally {
    input.disabled = false;
    input.focus();
  }
}
