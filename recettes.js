// ── Recettes page ─────────────────────────────────────────────────────

let _rSubPage = 'list'; // 'list' | 'detail'
let _rList    = [];
let _rDetail  = null;
let _rNom     = '';

async function loadRecettes() {
  setPage('recettes-loading');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/recettes?order=nom.asc`, { headers: supaHeaders() });
    _rList = res.ok ? await res.json() : [];
    _rSubPage = 'list';
    setPage('recettes');
  } catch(e) { loadHomeSupabase(); }
}

async function ouvrirRecette(id, nom) {
  _rNom = nom;
  _rDetail  = _rList.find(r => r.id == id) || null;
  _rSubPage = 'detail';
  setPage('recettes');
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
  if (!_rList || !_rList.length) {
    return `<div id="app">
      ${renderHeader('Recettes', '', false)}
      <div class="page"><div class="empty"><div class="empty-icon">🍽️</div><div class="empty-text">Aucune recette disponible.</div></div></div>
      ${renderNavBar('recettes')}
    </div>`;
  }

  const rows = _rList.map(r => {
    const emoji = r.emoji || '🍽️';
    const id    = r.id;
    const nom   = r.nom || '';
    const meta  = [
      r.categorie    ? r.categorie                        : '',
      r.temps_prep_min ? r.temps_prep_min + ' min'       : '',
      r.portions     ? r.portions + ' portion' + (r.portions > 1 ? 's' : '') : ''
    ].filter(Boolean).join(' · ');
    const macros = (r.kcal_par_portion)
      ? `<div style="font-size:11px;color:#8892a4;margin-top:3px;">${Math.round(r.kcal_par_portion)} kcal · P ${Math.round(r.prot_par_portion||0)}g · G ${Math.round(r.glu_par_portion||0)}g · L ${Math.round(r.lip_par_portion||0)}g <span style="opacity:.7;">/portion</span></div>`
      : '';
    return `
    <div onclick="ouvrirRecette(${id},'${nom.replace(/'/g,"\\'")}')"
      style="background:#1a1d29;border-radius:12px;display:flex;align-items:center;gap:14px;margin-bottom:8px;cursor:pointer;border-left:3px solid #f97316;padding:14px;-webkit-tap-highlight-color:transparent;"
      ontouchstart="this.style.opacity='.75'" ontouchend="this.style.opacity='1'">
      <div style="font-size:26px;flex-shrink:0;">${emoji}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:#e8eaf0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(nom)}</div>
        ${meta   ? `<div style="font-size:11px;color:#8892a4;margin-top:2px;">${esc(meta)}</div>` : ''}
        ${macros}
      </div>
      <div style="font-size:18px;color:#f97316;flex-shrink:0;">›</div>
    </div>`;
  }).join('');

  return `<div id="app">
    ${renderHeader('Recettes', '', false)}
    <div class="page">
      <div style="font-size:11px;color:#8892a4;margin-bottom:14px;">${_rList.length} recette${_rList.length > 1 ? 's' : ''}</div>
      ${rows}
    </div>
    ${renderNavBar('recettes')}
  </div>`;
}

function renderRecetteDetail() {
  return renderRecetteDetailSupabase(_rDetail);
}

function renderRecetteDetailSupabase(r) {
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : (typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : []);
  const etapes      = Array.isArray(r.etapes)      ? r.etapes      : (typeof r.etapes === 'string'      ? JSON.parse(r.etapes)      : []);

  const macrosHtml = r.kcal_par_portion ? `
    <div style="font-size:11px;color:#8892a4;text-align:center;margin-bottom:6px;">Valeurs pour 1 portion</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#0f1117;border-radius:10px;padding:12px;margin-bottom:16px;text-align:center;">
      <div><div style="font-size:15px;font-weight:700;color:#f97316;">${Math.round(r.kcal_par_portion)}</div><div style="font-size:10px;color:#8892a4;text-transform:uppercase;">kcal</div></div>
      <div><div style="font-size:15px;font-weight:700;">${Math.round(r.prot_par_portion||0)}g</div><div style="font-size:10px;color:#8892a4;text-transform:uppercase;">prot</div></div>
      <div><div style="font-size:15px;font-weight:700;">${Math.round(r.glu_par_portion||0)}g</div><div style="font-size:10px;color:#8892a4;text-transform:uppercase;">gluc</div></div>
      <div><div style="font-size:15px;font-weight:700;">${Math.round(r.lip_par_portion||0)}g</div><div style="font-size:10px;color:#8892a4;text-transform:uppercase;">lip</div></div>
    </div>` : '';

  const ingredHtml = ingredients.length ? `
    <div style="font-size:13px;font-weight:700;color:#f97316cc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Ingrédients${r.portions ? ' (pour ' + r.portions + ' portion' + (r.portions>1?'s':'') + ')' : ''}</div>
    <div style="background:#0f1117;border-radius:10px;padding:12px 16px;margin-bottom:16px;">
      <ul style="margin:0;padding-left:18px;">
        ${ingredients.map(ing => {
          const nom = typeof ing === 'string' ? ing : (ing.nom || '');
          const qte = typeof ing === 'object' && ing.quantite ? ' — ' + ing.quantite : '';
          return `<li style="color:#c8d0e0;font-size:14px;margin-bottom:7px;line-height:1.6;">${esc(nom)}${esc(qte)}</li>`;
        }).join('')}
      </ul>
    </div>` : '';

  const etapesHtml = etapes.length ? `
    <div style="font-size:13px;font-weight:700;color:#f97316cc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Préparation</div>
    ${etapes.map((e, i) => {
      const texte = typeof e === 'string' ? e : (e.texte || '');
      return `<div style="display:flex;gap:12px;margin-bottom:12px;">
        <div style="width:24px;height:24px;border-radius:50%;background:#f97316;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</div>
        <div style="font-size:14px;color:#c8d0e0;line-height:1.7;padding-top:2px;">${esc(texte)}</div>
      </div>`;
    }).join('')}` : '';

  const meta = [
    r.categorie       ? r.categorie                                        : '',
    r.temps_prep_min  ? r.temps_prep_min + ' min'                          : '',
    r.portions        ? r.portions + ' portion' + (r.portions>1?'s':'')   : ''
  ].filter(Boolean).join(' · ');

  return `<div id="app">
    ${renderHeader(esc(r.nom || 'Recette'), '', false)}
    <div class="page">
      <button class="btn-secondary" onclick="loadRecettes()" style="margin-bottom:16px;">← Toutes les recettes</button>
      <div style="text-align:center;font-size:48px;margin-bottom:8px;">${r.emoji || '🍽️'}</div>
      <div style="font-size:20px;font-weight:700;color:#f97316;margin-bottom:${meta?'6':'18'}px;line-height:1.3;text-align:center;">${esc(r.nom)}</div>
      ${meta ? `<div style="font-size:12px;color:#8892a4;text-align:center;margin-bottom:16px;">${esc(meta)}</div>` : ''}
      ${r.description ? `<div style="font-size:14px;color:#c8d0e0;line-height:1.7;margin-bottom:16px;">${esc(r.description)}</div>` : ''}
      ${macrosHtml}
      ${ingredHtml}
      ${etapesHtml}
    </div>
    ${renderNavBar('recettes')}
  </div>`;
}
