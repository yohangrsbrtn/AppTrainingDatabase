// ── Protocole (fonctionnalité activable individuellement par client) ────
// Lecture seule : le coach saisit le cycle/les molécules ET les analyses de
// sang côté console, l'app se contente de relire ces données et de recalculer
// l'affichage à la volée (mêmes formules que "Générer le protocole" côté
// coach pour le cycle ; catégorisation partagée via api.js pour les analyses),
// sans jamais rien écrire.

let _protocoleData = null;
let _analysesData = null;
let _protocoleTab = 'cycle';
let _analysesExpanded = new Set();

async function loadProtocole() { await _supaLoadProtocole(); }

const _PROTOCOLE_MOIS = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
function _protocoleFmtDate(d) {
  const dt = new Date(d);
  return dt.getDate() + ' ' + _PROTOCOLE_MOIS[dt.getMonth()];
}

async function _supaLoadProtocole() {
  showLoadingOverlay('Chargement…');
  try {
    const clientId = getClient();
    const profilRes = await fetch(`${SUPABASE_URL}/rest/v1/client_profils?client_id=eq.${encodeURIComponent(clientId)}&select=chimie_actif`, { headers: supaHeaders() });
    const profilArr = profilRes.ok ? await profilRes.json() : [];
    const actif = !!(profilArr[0] && profilArr[0].chimie_actif);
    if (!actif) { _protocoleData = { hasProtocole: false }; _analysesData = { hasAnalyses: false }; hideLoadingOverlay(); setPage('protocole'); return; }

    const [res, analysesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/client_protocoles?client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=1&select=*,client_protocole_molecules(*)`, { headers: supaHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/client_analyses_sante?client_id=eq.${encodeURIComponent(clientId)}&order=date.asc&select=nom,valeur,unite,date,ref_min,ref_max`, { headers: supaHeaders() }),
    ]);
    const arr = res.ok ? await res.json() : [];
    const analysesRows = analysesRes.ok ? await analysesRes.json() : [];
    _analysesData = _protocoleFormaterAnalyses(analysesRows);

    if (!arr.length) { _protocoleData = { hasProtocole: false }; hideLoadingOverlay(); setPage('protocole'); return; }

    const row = arr[0];
    const molecules = (row.client_protocole_molecules || []).slice().sort((a,b)=>(a.ordre||0)-(b.ordre||0));
    const calc = _protocoleCalculer(row, molecules);

    _protocoleData = {
      hasProtocole: true,
      dateDebut: _protocoleFmtDate(row.date_debut),
      dureeSemaines: row.duree_semaines,
      objectif: row.objectif || '',
      molecules: calc.molecules.map(m => ({
        nom: m.nom, categorie: m.categorie,
        dosageHebdoMg: Math.round(m.dosageHebdoMg * 10) / 10,
        totalMg: Math.round(m.totalMg * 10) / 10,
        totalConverti: m.totalConverti, quantiteRequise: m.quantiteRequise,
      })),
      semaines: calc.semaines.map(s => ({ numero: s.numero, date: _protocoleFmtDate(s.date), statut: s.statut, doses: s.doses })),
    };
    hideLoadingOverlay();
    setPage('protocole');
  } catch(e) { hideLoadingOverlay(); loadHomeSupabase(); }
}

// Regroupe les lignes brutes (une ligne = un marqueur à une date) par nom de marqueur,
// dans la même forme que consommait l'ancien renderProtocoleAnalyses (GAS).
function _protocoleFormaterAnalyses(rows) {
  if (!rows || !rows.length) return { hasAnalyses: false, marqueurs: [] };
  const parNom = new Map();
  rows.forEach(r => {
    if (!parNom.has(r.nom)) parNom.set(r.nom, []);
    parNom.get(r.nom).push(r);
  });
  const marqueurs = [...parNom.entries()].map(([nom, hist]) => {
    hist.sort((a,b) => a.date.localeCompare(b.date));
    const derniere = hist[hist.length - 1];
    const st = statutAnalyse(derniere.valeur, derniere.ref_min, derniere.ref_max);
    return {
      nom, unite: derniere.unite || '',
      refMin: derniere.ref_min, refMax: derniere.ref_max,
      derniereValeur: derniere.valeur, derniereDate: _protocoleFmtDate(derniere.date),
      statut: st.code,
      historique: hist.map(h => ({ date: _protocoleFmtDate(h.date), valeur: h.valeur })),
    };
  });
  return { hasAnalyses: true, marqueurs };
}

function switchProtocoleTab(tab) { _protocoleTab = tab; setPage('protocole'); }

function toggleAnalyseMarqueur(nom) {
  if (_analysesExpanded.has(nom)) _analysesExpanded.delete(nom);
  else _analysesExpanded.add(nom);
  setPage('protocole');
}

function renderProtocolePage() {
  const d = _protocoleData || {};
  const a = _analysesData || {};

  const tabsHtml = `
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button onclick="switchProtocoleTab('cycle')" style="flex:1;background:${_protocoleTab === 'cycle' ? 'linear-gradient(135deg,#378ADD,#2260a8)' : '#2d3142'};color:${_protocoleTab === 'cycle' ? '#fff' : '#e8eaf0'};border:none;border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">Cycle</button>
      <button onclick="switchProtocoleTab('analyses')" style="flex:1;background:${_protocoleTab === 'analyses' ? 'linear-gradient(135deg,#378ADD,#2260a8)' : '#2d3142'};color:${_protocoleTab === 'analyses' ? '#fff' : '#e8eaf0'};border:none;border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">Analyses</button>
    </div>`;

  const body = _protocoleTab === 'analyses' ? renderProtocoleAnalyses(a) : renderProtocoleCycle(d);

  return `<div id="app">
    ${renderHeader('Protocole', _protocoleTab === 'cycle' && d.dureeSemaines ? d.dureeSemaines + ' semaines' : '', false)}
    <div class="page">
      ${tabsHtml}
      ${body}
      <button class="btn-secondary" onclick="goTo('home')" style="margin-top:8px;">← Accueil</button>
    </div>
    ${renderNavBar('home')}
  </div>`;
}

// Intitulé de section coloré mauve/rose flashy (Molécules, Planning,
// catégories d'analyses) — identité visuelle propre à Protocole, écho du
// motif ADN (losange en dégradé mauve→rose avec halo).
function sectionTitreProtocole(label) {
  return `<div style="margin:20px 0 8px;">
    <span style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#ad72e8;text-shadow:0 0 6px #a78bfa4d, 0 0 10px #e879f91f;">${esc(label)}</span>
  </div>`;
}

function renderProtocoleCycle(d) {
  if (!d.hasProtocole) {
    return `<div class="empty"><div class="empty-icon">🧬</div><div class="empty-text">Aucun protocole en cours pour l'instant.</div></div>`;
  }

  const catColor = c => c === 'Injectable' ? '#e05c5c' : c === 'Oral' ? '#4f8ef7' : '#a78bfa';

  const moleculesHtml = (d.molecules || []).map(m => `
    <div class="card" style="border-left:3px solid ${catColor(m.categorie)};padding-left:14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#e8eaf0;">${esc(m.nom)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${esc(m.categorie)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:15px;font-weight:700;color:${catColor(m.categorie)};">${m.dosageHebdoMg}&nbsp;mg<span style="font-size:10px;font-weight:600;color:var(--muted);">/sem</span></div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${esc(m.totalConverti || (m.totalMg + ' mg'))} sur le cycle</div>
          ${m.quantiteRequise ? `<div style="font-size:11px;color:var(--muted);margin-top:1px;">${esc(m.quantiteRequise)}</div>` : ''}
        </div>
      </div>
    </div>`).join('');

  const semStyle = statut => {
    if (statut === 'passee') return 'opacity:.45;text-decoration:line-through;';
    if (statut === 'encours') return 'background:#0d1a13;border:1px solid #1D9E7555;';
    return '';
  };

  const semainesHtml = (d.semaines || []).map(s => `
    <div class="card" style="margin-bottom:8px;${semStyle(s.statut)}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${s.doses.length ? '8px' : '0'};">
        <div style="font-size:13px;font-weight:700;color:${s.statut === 'encours' ? '#1D9E75' : '#e8eaf0'};">Semaine ${s.numero}${s.statut === 'encours' ? ' · en cours' : ''}</div>
        <div style="font-size:11px;color:var(--muted);">${esc(s.date)}</div>
      </div>
      ${s.doses.map(dose => `
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
          <span style="color:var(--muted);">${esc(dose.nom)}</span>
          <span style="color:${dose.texte === '—' ? 'var(--muted)' : '#e8eaf0'};font-weight:600;">${esc(dose.texte)}</span>
        </div>`).join('')}
    </div>`).join('');

  return `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);">
        <span>Début : <strong style="color:#e8eaf0;">${esc(d.dateDebut)}</strong></span>
        <span>${d.dureeSemaines} semaines</span>
      </div>
      ${d.objectif ? `<div style="font-size:12px;color:var(--muted);margin-top:8px;">${esc(d.objectif)}</div>` : ''}
    </div>

    ${sectionTitreProtocole('Molécules')}
    ${moleculesHtml || '<div class="empty"><div class="empty-text">Aucune molécule renseignée.</div></div>'}

    ${sectionTitreProtocole('Planning')}
    ${semainesHtml}`;
}

function renderProtocoleAnalyses(a) {
  if (!a.hasAnalyses) {
    return `<div class="empty"><div class="empty-icon">🩸</div><div class="empty-text">Aucune prise de sang enregistrée pour l'instant.</div></div>`;
  }

  const groupes = new Map();
  (a.marqueurs || []).forEach(m => {
    const cat = categoriserMarqueur(m.nom);
    if (!groupes.has(cat)) groupes.set(cat, []);
    groupes.get(cat).push(m);
  });
  const ordreCategories = [...CATEGORIES_ANALYSES.map(c => c.nom), 'Autres'].filter(c => groupes.has(c));

  return ordreCategories.map(cat => `
    ${sectionTitreProtocole(cat)}
    ${groupes.get(cat).map(m => renderCarteMarqueur(m)).join('')}
  `).join('');
}

function renderCarteMarqueur(m) {
  const st = statutAnalyse(m.derniereValeur, m.refMin, m.refMax);
  const ouvert = _analysesExpanded.has(m.nom);
  const variation = m.historique.length >= 2 ? (m.derniereValeur - m.historique[m.historique.length - 2].valeur) : null;

  const detailHtml = ouvert ? `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
      ${m.historique.length >= 2 ? miniGraphe(m.historique.map(h => h.valeur), st.couleur, ' ' + m.unite) : ''}
      <div style="margin-top:8px;">
        ${m.historique.slice().reverse().map(h => `
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border);">
            <span style="color:var(--muted);">${esc(h.date)}</span>
            <span style="color:#e8eaf0;font-weight:600;">${h.valeur} ${esc(m.unite)}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  return `
  <div class="card" onclick="toggleAnalyseMarqueur('${esc(m.nom).replace(/'/g, "\\'")}')" style="cursor:pointer;border-left:3px solid ${st.couleur};padding-left:14px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#e8eaf0;">${esc(m.nom)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${esc(m.derniereDate)}${(m.refMin !== null && m.refMax !== null) ? ` · réf. ${m.refMin}–${m.refMax} ${esc(m.unite)}` : ''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:16px;font-weight:700;color:${st.couleur};">${m.derniereValeur}&nbsp;<span style="font-size:11px;font-weight:600;color:var(--muted);">${esc(m.unite)}</span></div>
        <div style="font-size:11px;color:${st.couleur};margin-top:2px;">${st.label}${variation !== null ? ` · ${variation >= 0 ? '+' : ''}${Math.round(variation * 100) / 100}` : ''}</div>
      </div>
    </div>
    ${detailHtml}
  </div>`;
}

