// ── Protocole (fonctionnalité activable individuellement par client) ────
// Lecture seule : le coach saisit le cycle/les molécules côté console, l'app
// se contente de relire ces données et de recalculer l'affichage à la volée
// (mêmes formules que "Générer le protocole" côté coach), sans rien écrire.

let _protocoleData = null;
let _protocoleTab = 'cycle';

async function loadProtocole() { await _supaLoadProtocole(); }

const _PROTOCOLE_MOIS = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
function _protocoleFmtDate(d) {
  const dt = new Date(d);
  return dt.getDate() + ' ' + _PROTOCOLE_MOIS[dt.getMonth()];
}

// Pas d'équivalent Supabase pour la feuille "Analyses" (prises de sang) —
// hors périmètre pour l'instant, seul le cycle chimie est porté.
async function _supaLoadProtocole() {
  showLoadingOverlay('Chargement…');
  try {
    const clientId = getClient();
    const profilRes = await fetch(`${SUPABASE_URL}/rest/v1/client_profils?client_id=eq.${encodeURIComponent(clientId)}&select=chimie_actif`, { headers: supaHeaders() });
    const profilArr = profilRes.ok ? await profilRes.json() : [];
    const actif = !!(profilArr[0] && profilArr[0].chimie_actif);
    if (!actif) { _protocoleData = { hasProtocole: false }; hideLoadingOverlay(); setPage('protocole'); return; }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/client_protocoles?client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=1&select=*,client_protocole_molecules(*)`,
      { headers: supaHeaders() }
    );
    const arr = res.ok ? await res.json() : [];
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

function renderProtocolePage() {
  const d = _protocoleData || {};
  const body = renderProtocoleCycle(d);

  return `<div id="app">
    ${renderHeader('Protocole', _protocoleTab === 'cycle' && d.dureeSemaines ? d.dureeSemaines + ' semaines' : '', false)}
    <div class="page">
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

