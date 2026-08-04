// ── Chat commun (client) — un seul salon, tous les clients + le coach ──────
// Temps réel via Supabase Realtime (sbAuth.channel, index.html). Pas de
// messages privés : tout le monde voit tout, décision explicite du coach.

let _chatMessages = [];
let _chatProfils = {};  // client_id -> { prenom, nom, pseudo, photo_url }
let _chatChannel = null;
let _chatLoaded = false;

async function loadChat() {
  setPage('chat-loading');
  try {
    const [msgRes, profilRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/chat_messages?order=created_at.asc&limit=200&select=id,client_id,texte,created_at`, { headers: supaHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/client_profils?select=client_id,prenom,nom,pseudo,photo_url`, { headers: supaHeaders() }),
    ]);
    _chatMessages = msgRes.ok ? await msgRes.json() : [];
    const profils = profilRes.ok ? await profilRes.json() : [];
    _chatProfils = {};
    profils.forEach(p => { _chatProfils[p.client_id] = p; });
    _chatLoaded = true;
    setPage('chat');
    _chatSubscribe();
    setTimeout(_chatScrollBas, 50);
  } catch(e) {
    _chatLoaded = false;
    setPage('chat');
  }
}

// Un seul canal réutilisé pour toute la session — removeChannel avant de
// resouscrire évite d'empiler plusieurs abonnements (et donc des messages
// dupliqués à l'affichage) si le client revisite la page plusieurs fois.
function _chatSubscribe() {
  if (_chatChannel) { try { sbAuth.removeChannel(_chatChannel); } catch(e) {} }
  _chatChannel = sbAuth.channel('chat_messages_realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
      _chatMessages.push(payload.new);
      if (document.getElementById('chatMessages')) {
        _chatAppendMessage(payload.new);
        _chatScrollBas();
      }
    })
    .subscribe();
}

function _chatNomAffiche(clientId) {
  const p = _chatProfils[clientId];
  if (!p) return clientId;
  const { principal } = _nomAffichage(p);
  return principal;
}

function _chatBulleHtml(m) {
  const moi = m.client_id === S.client;
  const p = _chatProfils[m.client_id] || {};
  const initiales = ((p.prenom ? p.prenom[0] : '') + (p.nom ? p.nom[0] : '')).toUpperCase() || '?';
  const heure = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  if (moi) {
    return `<div style="display:flex;justify-content:flex-end;margin-bottom:10px;" data-msg-id="${m.id}">
      <div style="max-width:78%;">
        <div style="background:linear-gradient(135deg,#4f6ef7,#3b5ce0);color:#fff;border-radius:14px 14px 3px 14px;padding:9px 13px;font-size:14px;line-height:1.4;word-break:break-word;">${esc(m.texte)}</div>
        <div style="font-size:10px;color:#555e7a;text-align:right;margin-top:2px;">${heure}</div>
      </div>
    </div>`;
  }
  return `<div style="display:flex;align-items:flex-end;gap:8px;margin-bottom:10px;" data-msg-id="${m.id}">
    ${_avatarCircleHtml(p.photo_url, initiales, 26)}
    <div style="max-width:74%;">
      <div style="font-size:11px;color:#8892a4;margin-bottom:2px;">${esc(_chatNomAffiche(m.client_id))}</div>
      <div style="background:#1e2235;color:#e8eaf0;border-radius:14px 14px 14px 3px;padding:9px 13px;font-size:14px;line-height:1.4;word-break:break-word;">${esc(m.texte)}</div>
      <div style="font-size:10px;color:#555e7a;margin-top:2px;">${heure}</div>
    </div>
  </div>`;
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

function renderChatPage() {
  if (S.page === 'chat-loading') {
    return `<div id="app">${renderHeader('Chat','',false)}<div class="page" style="display:flex;align-items:center;justify-content:center;"><div class="spin"></div></div>${renderNavBar('chat')}</div>`;
  }
  const messagesHtml = _chatMessages.length
    ? _chatMessages.map(_chatBulleHtml).join('')
    : `<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">Aucun message pour l'instant — lance la discussion !</div></div>`;
  return `<div id="app" style="height:100dvh;">
    ${renderHeader('Chat', 'Tout le monde peut se parler ici', false)}
    <div id="chatMessages" style="flex:1;overflow-y:auto;padding:14px 16px;">${messagesHtml}</div>
    <div style="flex-shrink:0;display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--border);background:var(--bg2);margin-bottom:calc(64px + var(--safe-bottom));">
      <input id="chatInput" type="text" placeholder="Écris un message…" autocomplete="off"
        style="flex:1;padding:11px 14px;background:#0f1117;color:#e8eaf0;border:1px solid #2d3142;border-radius:20px;font-size:16px;"
        onkeydown="if(event.key==='Enter'){event.preventDefault();envoyerMessageChat();}">
      <button onclick="envoyerMessageChat()" style="width:42px;height:42px;flex-shrink:0;background:#4f6ef7;border:none;border-radius:50%;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">➤</button>
    </div>
    ${renderNavBar('chat')}
  </div>`;
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
