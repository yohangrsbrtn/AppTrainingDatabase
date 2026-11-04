// ── Séance libre : on crée la séance au fil de l'eau à la salle, on valide les séries, puis on la termine ──
// Brouillon gardé en local (rien de perdu sans réseau) ; enregistré en base seulement à « Terminer ».
// Terminer = séance du jour comptée (même mécanique que pcValiderSeance) + entrée dans l'historique.
// Tables : sql/2026-11-04_seances_libres.sql
let _slSub = 'seance'; // 'seance' | 'historique'
let _slHisto = null, _slOuverte = null;
const _slKey = () => 'at_sl_draft_' + (S.client || '');
function _slIso() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _slDraft() { try { return JSON.parse(localStorage.getItem(_slKey()) || 'null'); } catch (e) { return null; } }
function _slSave(d) { try { if (d) localStorage.setItem(_slKey(), JSON.stringify(d)); else localStorage.removeItem(_slKey()); } catch (e) {} }
function _slAccesAutorise() { return typeof _nvAutorise === 'function' && _nvAutorise(); }

function slOuvrir() {
  if (!_slDraft()) _slSave({ nom: '', date: _slIso(), debut: Date.now(), exos: [] });
  _slSub = 'seance'; setPage('seance-libre');
}
function slRetour() { setPage('programme-client'); }

function renderSeanceLibrePage() {
  return _slSub === 'historique' ? _slRenderHisto() : _slRenderSeance();
}
function _slRenderSeance() {
  const d = _slDraft() || { nom: '', exos: [] };
  let nbOk = 0, tonnage = 0;
  const exos = d.exos.map((ex, i) => {
    const sets = ex.series.map((s, j) => {
      if (s.ok) { nbOk++; tonnage += (parseFloat(s.charge) || 0) * (parseFloat(s.reps) || 0); }
      return `<div class="set-row${s.ok ? ' valide' : ''}">
        <span class="set-num">S${j + 1}</span>
        <input class="set-input" type="text" inputmode="decimal" placeholder="Rep" value="${esc(s.reps == null ? '' : String(s.reps))}" onchange="slChamp(${i},${j},'reps',this.value)">
        <input class="set-input" type="text" inputmode="decimal" placeholder="Kg" value="${esc(s.charge == null ? '' : String(s.charge))}" onchange="slChamp(${i},${j},'charge',this.value)">
        <input class="set-input" type="text" inputmode="decimal" placeholder="RIR" value="${esc(s.rir == null ? '' : String(s.rir))}" onchange="slChamp(${i},${j},'rir',this.value)">
        <button class="set-ok" onclick="slValiderSerie(${i},${j})" aria-label="Valider la série">✓</button>
      </div>`;
    }).join('');
    return `<div class="card" style="padding:10px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;"><div style="flex:1;font-size:14px;font-weight:600;">${i + 1}. ${esc(ex.nom)}</div>
        <button onclick="slSupprimerExo(${i})" style="background:none;border:none;color:#8892a4;font-size:16px;cursor:pointer;">🗑</button></div>
      <div style="margin-top:6px;">${sets}</div>
      <textarea rows="1" placeholder="Commentaire…" onchange="slComExo(${i},this.value)" style="width:100%;margin-top:4px;font-size:16px;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1117;color:var(--text);box-sizing:border-box;">${esc(ex.com || '')}</textarea>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn-secondary" style="flex:1;" onclick="slAjouterSerie(${i})">+ Série</button>
        ${ex.series.length > 1 ? `<button class="btn-secondary" style="flex:0 0 44px;" onclick="slRetirerSerie(${i})">−</button>` : ''}
      </div></div>`;
  }).join('');
  return `<div id="app"><div class="page">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-top:calc(env(safe-area-inset-top) + 14px);">
      <button class="btn-secondary" onclick="slRetour()" style="width:auto;padding:8px 12px;">←</button>
      <div style="flex:1;font-size:17px;font-weight:700;">Séance libre</div>
      <button class="btn-secondary" onclick="slOuvrirHisto()" style="width:auto;padding:8px 12px;">🗂 Historique</button>
    </div>
    <div class="card" style="padding:10px;margin-bottom:8px;">
      <input type="text" placeholder="Nom de la séance (ex : Push, Bras…)" value="${esc(d.nom || '')}" onchange="slNom(this.value)" style="width:100%;font-size:16px;padding:10px;border-radius:8px;border:1px solid var(--border);background:#0f1117;color:var(--text);">
      <div style="font-size:12px;color:var(--muted);margin-top:6px;">${nbOk} série${nbOk > 1 ? 's' : ''} validée${nbOk > 1 ? 's' : ''} · ${Math.round(tonnage)} kg soulevés</div>
    </div>
    ${exos}
    <textarea rows="2" placeholder="Commentaire sur la séance (ressenti, énergie…)" onchange="slComSeance(this.value)" style="width:100%;margin-bottom:8px;font-size:16px;padding:10px;border-radius:8px;border:1px solid var(--border);background:#0f1117;color:var(--text);box-sizing:border-box;">${esc(d.com || '')}</textarea>
    <button class="btn-secondary" style="width:100%;margin-bottom:8px;" onclick="slAjouterExo()">➕ Ajouter un exercice</button>
    <button class="btn-primary" id="slFinBtn" onclick="slTerminer()" ${nbOk ? '' : 'disabled'}>✅ Terminer la séance</button>
    <button onclick="slAbandonner()" style="width:100%;margin-top:8px;background:none;border:none;color:#8892a4;font-size:13px;cursor:pointer;">Abandonner cette séance</button>
  </div>${renderNavBar('training')}</div>`;
}

function slComExo(i, v) { const d = _slDraft(); if (d) { d.exos[i].com = v.trim(); _slSave(d); } }
function slComSeance(v) { const d = _slDraft(); if (d) { d.com = v.trim(); _slSave(d); } }
function slNom(v) { const d = _slDraft(); if (d) { d.nom = v.trim(); _slSave(d); } }
function slChamp(i, j, f, v) {
  const d = _slDraft(); if (!d) return;
  const n = parseFloat(String(v).replace(',', '.'));
  d.exos[i].series[j][f] = isNaN(n) ? null : n; _slSave(d);
}
function slAjouterSerie(i) {
  const d = _slDraft(), ex = d.exos[i], l = ex.series[ex.series.length - 1] || {};
  ex.series.push({ charge: l.charge == null ? null : l.charge, reps: l.reps == null ? null : l.reps, rir: null, ok: false }); _slSave(d); setPage('seance-libre');
}
function slRetirerSerie(i) { const d = _slDraft(); d.exos[i].series.pop(); _slSave(d); setPage('seance-libre'); }
function slSupprimerExo(i) { if (!confirm('Retirer cet exercice ?')) return; const d = _slDraft(); d.exos.splice(i, 1); _slSave(d); setPage('seance-libre'); }
function slValiderSerie(i, j) {
  const d = _slDraft(), s = d.exos[i].series[j];
  if (!s.ok && (!(s.charge > 0) || !(s.reps > 0))) { showToast('Renseigne les reps et les kg avant de valider.', '#f0a500'); return; }
  s.ok = !s.ok; _slSave(d); setPage('seance-libre');
  if (s.ok) _slNiveaux(d, i, j);
}
// XP par muscle : compare les niveaux avec / sans cette série (séries déjà validées de la séance incluses)
async function _slNiveaux(d, i, j) {
  if (typeof _pcNvCharger !== 'function') return;
  const nv = await _pcNvCharger(); if (!nv) return;
  const sets = (sans) => { const r = []; d.exos.forEach((ex, a) => ex.series.forEach((x, b) => { if (x.ok && !(sans && a === i && b === j)) r.push({ exercice_id: ex.exId, exercice_nom: ex.nom, charge: x.charge, reps: x.reps, rir: x.rir, date: d.date }); })); return r; };
  nv.libresLive = sets(true); const avant = nvCalculer(nv, null, nv.poids, nv.sexe);
  nv.libresLive = sets(false); const apres = nvCalculer(nv, null, nv.poids, nv.sexe);
  nv.libresLive = []; _pcNvAnnoncer(avant, apres);
}
async function slAjouterExo() {
  if (typeof _pcChargerExercicesLib === 'function') await _pcChargerExercicesLib();
  const ov = document.createElement('div');
  ov.id = 'slPicker';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:flex-end;';
  ov.innerHTML = `<div style="background:#151a28;border-radius:20px 20px 0 0;width:100%;height:60vh;max-height:80vh;display:flex;flex-direction:column;margin:0 auto;max-width:520px;">
    <div style="padding:16px 20px 8px;font-size:16px;font-weight:700;color:#fff;">➕ Ajouter un exercice</div>
    <div style="padding:0 20px 10px;"><input id="slSearch" type="text" placeholder="Chercher un exercice…" oninput="_slFiltrer()" style="width:100%;font-size:16px;padding:11px 12px;border-radius:10px;border:1px solid #2d3142;background:#0f1117;color:#fff;"></div>
    <div id="slList" style="flex:1;overflow-y:auto;padding:0 20px 12px;"></div>
    <div style="padding:12px 20px calc(12px + env(safe-area-inset-bottom));"><button onclick="document.getElementById('slPicker').remove()" style="width:100%;padding:12px;background:#2d3142;border:none;border-radius:10px;color:#fff;font-size:14px;cursor:pointer;">Annuler</button></div></div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov); _slFiltrer();
  setTimeout(() => document.getElementById('slSearch')?.focus(), 100);
}
function _slFiltrer() {
  const q = (document.getElementById('slSearch')?.value || '').trim().toLowerCase(), list = document.getElementById('slList');
  if (!list) return;
  const items = (q ? (_pcExercicesLib || []).filter(e => e.nom.toLowerCase().includes(q)) : (_pcExercicesLib || [])).slice(0, 40);
  list.innerHTML = items.map(e => `<div onclick="slChoisirExo(${e.id})" style="padding:11px 12px;border-bottom:1px solid #1e2235;cursor:pointer;font-size:14px;color:#e8eaf0;">${esc(e.nom)}${e.groupe_musculaire ? `<span style="font-size:11px;color:#8892a4;margin-left:6px;">${esc(e.groupe_musculaire)}</span>` : ''}</div>`).join('')
    + (q ? `<div onclick="slChoisirExo(null)" style="padding:12px;font-size:13px;color:#378ADD;cursor:pointer;">➕ Utiliser « ${esc(q)} »</div>` : '');
}
function slChoisirExo(id) {
  const lib = id ? (_pcExercicesLib || []).find(e => e.id === id) : null;
  const nom = lib ? lib.nom : (document.getElementById('slSearch')?.value || '').trim();
  if (!nom) return;
  document.getElementById('slPicker')?.remove();
  const d = _slDraft();
  d.exos.push({ nom, exId: lib ? lib.id : null, series: [{ charge: null, reps: null, rir: null, ok: false }] });
  _slSave(d); setPage('seance-libre');
}
function slAbandonner() {
  if (!confirm('Abandonner cette séance ? Rien ne sera enregistré.')) return;
  _slSave(null); slRetour();
}

async function slTerminer() {
  const d = _slDraft(); if (!d) return;
  const btn = document.getElementById('slFinBtn'); if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const clientId = getClient();
    const nom = d.nom || ('Séance du ' + d.date.split('-').reverse().join('/'));
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_seances_libres`, { method: 'POST', headers: supaHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(Object.assign({ client_id: clientId, nom, date: d.date, duree_min: Math.max(1, Math.round((Date.now() - d.debut) / 60000)) }, d.com ? { commentaire: d.com } : {})) });
    if (!res.ok) throw new Error('enregistrement impossible (SQL exécuté ?)');
    const sid = (await res.json())[0].id;
    const rows = [];
    d.exos.forEach((ex, i) => ex.series.forEach((s, j) => { if (s.ok) rows.push(Object.assign({ seance_id: sid, exercice_id: ex.exId, exercice_nom: ex.nom, ordre_exo: i, numero_serie: j + 1, charge: s.charge, reps: s.reps, rir: s.rir, valide: true }, (ex.com && !rows.some(r => r.ordre_exo === i)) ? { commentaire: ex.com } : {})); }));
    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/client_seances_libres_series`, { method: 'POST', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(rows) });
    if (!r2.ok) throw new Error('séries non enregistrées');
    // Séance du jour comptée (une fois par jour) — mêmes règles que pcValiderSeance
    let xp = 0, msg = '';
    try {
      const { id, jours } = await _supaBilanNonEnvoye(clientId);
      const idx = _jourIdxAujourdhui(), j = jours[idx] || {};
      if (j.seance_validee) msg = 'Séance enregistrée (la séance du jour était déjà comptée).';
      else {
        jours[idx] = { ...j, training: true, seance_validee: true };
        if (await _supaPatchJoursBilan(id, jours)) xp = await _supaIncrementerXpTotal(clientId, XP_SEANCE_VALIDEE);
        else msg = 'Séance enregistrée, mais bilan déjà envoyé : non comptée dans le suivi hebdo.';
      }
    } catch (e) { msg = 'Séance enregistrée, comptage du jour impossible.'; }
    _slSave(null);
    if (typeof rafraichirProgressionEtDeblocages === 'function') rafraichirProgressionEtDeblocages();
    _slHisto = null; if (typeof _pcNvData !== 'undefined') _pcNvPromise = null;
    await slOuvrirHisto(); // le flash est ajouté APRÈS le changement de page (setPage remplace tout le body)
    if (msg) showToast(msg, '#f0a500'); else if (typeof _pcFlashSeanceValidee === 'function') _pcFlashSeanceValidee(xp);
  } catch (e) {
    showToast('Erreur : ' + e.message, '#c0392b');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Terminer la séance'; }
  }
}

async function slOuvrirHisto() {
  _slSub = 'historique'; _slOuverte = null; setPage('seance-libre');
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/client_seances_libres?client_id=eq.${encodeURIComponent(getClient())}&order=date.desc,id.desc&limit=100&select=*,client_seances_libres_series(*)`, { headers: supaHeaders() });
    _slHisto = r.ok ? await r.json() : [];
  } catch (e) { _slHisto = []; }
  if (_slSub === 'historique') setPage('seance-libre');
}
function slToggleHisto(id) { _slOuverte = _slOuverte === id ? null : id; setPage('seance-libre'); }
function slRetourSeance() { _slSub = 'seance'; if (!_slDraft()) slOuvrir(); else setPage('seance-libre'); }
// Nouvelle séance du jour pré-remplie avec les exercices, séries, reps et kg d'une séance passée (rien n'est validé)
function slRefaire(id) {
  const src = (_slHisto || []).find(x => x.id === id); if (!src) return;
  const cur = _slDraft();
  if (cur && cur.exos.length && !confirm('Tu as une séance en cours. La remplacer par celle-ci ?')) return;
  const parExo = {};
  (src.client_seances_libres_series || []).slice().sort((a, b) => a.ordre_exo - b.ordre_exo || a.numero_serie - b.numero_serie).forEach(x => {
    const e = (parExo[x.ordre_exo] = parExo[x.ordre_exo] || { nom: x.exercice_nom, exId: x.exercice_id, series: [] });
    e.series.push({ charge: x.charge, reps: x.reps, rir: x.rir, ok: false });
  });
  _slSave({ nom: src.nom, date: _slIso(), debut: Date.now(), exos: Object.values(parExo) });
  _slSub = 'seance'; setPage('seance-libre');
}
async function slSupprimerHisto(id) {
  if (!confirm('Supprimer cette séance de l\'historique ?')) return;
  await fetch(`${SUPABASE_URL}/rest/v1/client_seances_libres?id=eq.${id}`, { method: 'DELETE', headers: supaHeaders() });
  slOuvrirHisto();
}
function _slRenderHisto() {
  const liste = (_slHisto || []).map(s => {
    const ser = s.client_seances_libres_series || [];
    const ton = ser.reduce((a, x) => a + (x.charge || 0) * (x.reps || 0), 0);
    const nbExo = new Set(ser.map(x => x.ordre_exo)).size;
    let detail = '';
    if (_slOuverte === s.id) {
      const parExo = {};
      ser.sort((a, b) => a.ordre_exo - b.ordre_exo || a.numero_serie - b.numero_serie).forEach(x => (parExo[x.ordre_exo] = parExo[x.ordre_exo] || { nom: x.exercice_nom, l: [] }).l.push(x));
      detail = Object.values(parExo).map(e => `<div style="margin-top:8px;"><div style="font-size:13px;font-weight:600;">${esc(e.nom)}</div><div style="font-size:12px;color:var(--muted);">${e.l.map(x => `${x.reps || '?'}×${x.charge || '?'} kg`).join(' · ')}</div>${(e.l.find(x => x.commentaire) || {}).commentaire ? `<div style="font-size:12px;font-style:italic;margin-top:2px;">${esc(e.l.find(x => x.commentaire).commentaire)}</div>` : ''}</div>`).join('')
        + (s.commentaire ? `<div style="margin-top:10px;font-size:12px;font-style:italic;">${esc(s.commentaire)}</div>` : '')
        + `<button class="btn-primary" onclick="event.stopPropagation();slRefaire(${s.id})" style="margin-top:10px;">🔁 Refaire cette séance</button><button onclick="event.stopPropagation();slSupprimerHisto(${s.id})" style="margin-top:10px;background:none;border:none;color:#c0392b;font-size:12px;cursor:pointer;">Supprimer</button>`;
    }
    return `<div class="card" style="padding:10px;margin-bottom:8px;cursor:pointer;" onclick="slToggleHisto(${s.id})">
      <div style="display:flex;justify-content:space-between;gap:8px;"><div style="font-size:14px;font-weight:600;">${esc(s.nom)}</div><div style="font-size:12px;color:var(--muted);">${s.date.split('-').reverse().join('/')}</div></div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px;">${nbExo} exercice${nbExo > 1 ? 's' : ''} · ${ser.length} séries · ${Math.round(ton)} kg${s.duree_min ? ' · ' + s.duree_min + ' min' : ''}</div>${detail}</div>`;
  }).join('');
  return `<div id="app"><div class="page">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-top:calc(env(safe-area-inset-top) + 14px);">
      <button class="btn-secondary" onclick="slRetourSeance()" style="width:auto;padding:8px 12px;">←</button>
      <div style="flex:1;font-size:17px;font-weight:700;">Historique des séances</div></div>
    ${_slHisto === null ? '<div class="spinner" style="margin:30px auto;"></div>' : (liste || '<div style="text-align:center;color:var(--muted);padding:30px;">Aucune séance libre pour l\'instant.</div>')}
  </div>${renderNavBar('training')}</div>`;
}
