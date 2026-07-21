// ── Recettes page ─────────────────────────────────────────────────────

let _rSubPage = 'list'; // 'list' | 'detail'
let _rList    = [];
let _rDetail  = null;
let _rNom     = '';

async function loadRecettes() {
  setPage('recettes-loading');
  try {
    _rList    = await api('listerRecettes');
    _rSubPage = 'list';
    setPage('recettes');
  } catch(e) { setPage('home'); }
}

async function ouvrirRecette(fileId, nom) {
  _rNom = nom;
  setPage('recettes-loading');
  try {
    _rDetail  = await api('chargerRecette', { fileId });
    _rSubPage = 'detail';
    setPage('recettes');
  } catch(e) { setPage('recettes'); }
}

// ── Render ────────────────────────────────────────────────────────────

function renderRecettesPage() {
  if (S.page === 'recettes-loading') {
    return `<div id="app">${renderHeader('Recettes','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('recettes')}</div>`;
  }
  if (_rSubPage === 'detail' && _rDetail) return renderRecetteDetail();
  return renderRecetteList();
}

function renderRecetteList() {
  if (!_rList || _rList.length === 0) {
    return `<div id="app">
      ${renderHeader('Recettes', '', false)}
      <div class="page"><div class="empty"><div class="empty-icon">🍽️</div><div class="empty-text">Aucune recette disponible.</div></div></div>
      ${renderNavBar('recettes')}
    </div>`;
  }

  const rows = _rList.map(r => `
    <div onclick="ouvrirRecette('${r.id}','${(r.nom||'').replace(/'/g,"\\'")}') "
      style="background:#1a1d29;border-radius:12px;display:flex;align-items:center;gap:14px;margin-bottom:8px;cursor:pointer;border-left:3px solid #f97316;padding:14px 14px 14px 14px;-webkit-tap-highlight-color:transparent;"
      ontouchstart="this.style.opacity='.75'" ontouchend="this.style.opacity='1'">
      <div style="font-size:26px;flex-shrink:0;">🍽️</div>
      <div style="flex:1;min-width:0;font-size:14px;font-weight:600;color:#e8eaf0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.nom)}</div>
      <div style="font-size:18px;color:#f97316;flex-shrink:0;">›</div>
    </div>`).join('');

  return `<div id="app">
    ${renderHeader('Recettes', '', false)}
    <div class="page">
      <div style="font-size:11px;color:#8892a4;margin-bottom:14px;">${_rList.length} recette${_rList.length > 1 ? 's' : ''} disponible${_rList.length > 1 ? 's' : ''}</div>
      ${rows}
    </div>
    ${renderNavBar('recettes')}
  </div>`;
}

function renderRecetteDetail() {
  const data = _rDetail;
  let html = '';
  let inList = false;

  (data.elements || []).forEach(el => {
    if (el.type === 'li') {
      if (!inList) { html += '<div style="background:#0f1117;border-radius:10px;padding:12px 16px;margin-bottom:10px;"><ul style="margin:0;padding-left:18px;">'; inList = true; }
      html += `<li style="color:#c8d0e0;font-size:14px;margin-bottom:7px;line-height:1.6;padding-left:${(el.indent||0)*12}px;">${el.text}</li>`;
    } else {
      if (inList) { html += '</ul></div>'; inList = false; }
      if      (el.type === 'h1') html += `<div style="font-size:17px;font-weight:700;color:#f97316;margin:20px 0 10px;padding-bottom:8px;border-bottom:1px solid #f9731633;">${el.text}</div>`;
      else if (el.type === 'h2') html += `<div style="font-size:15px;font-weight:700;margin:16px 0 8px;">${el.text}</div>`;
      else if (el.type === 'h3') html += `<div style="font-size:12px;font-weight:700;color:#f97316cc;margin:12px 0 6px;text-transform:uppercase;letter-spacing:1px;">${el.text}</div>`;
      else if (el.type === 'p')  html += `<div style="font-size:14px;color:#c8d0e0;line-height:1.7;margin-bottom:8px;">${el.text}</div>`;
      else if (el.type === 'br') html += '<div style="height:6px;"></div>';
    }
  });
  if (inList) html += '</ul></div>';

  return `<div id="app">
    ${renderHeader(esc(_rNom || data.nom || 'Recette'), '', false)}
    <div class="page">
      <button class="btn-secondary" onclick="loadRecettes()" style="margin-bottom:16px;">← Toutes les recettes</button>
      <div style="font-size:20px;font-weight:700;color:#f97316;margin-bottom:18px;line-height:1.3;">${esc(data.nom||_rNom)}</div>
      ${html}
    </div>
    ${renderNavBar('recettes')}
  </div>`;
}
