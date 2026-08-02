// ── Coach pages ────────────────────────────────────────────────────────

const COACH_PALETTE = ['#378ADD','#1D9E75','#E8A838','#C45BAA','#E05C3A','#7B61FF','#0ABFBC','#F0A500'];

function coachColor(clientId) {
  let h = 0;
  for (let i = 0; i < (clientId || '').length; i++) h = (h * 31 + clientId.charCodeAt(i)) & 0xff;
  return COACH_PALETTE[h % COACH_PALETTE.length];
}

function _retourAccueilCoach() { loadHomeSupabase(); }

function _fmtTsIso(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Rapports de bugs (coach) ──────────────────────────────────────────

let _rapportsBugsData = null;

async function loadRapportsBugs() {
  showLoadingOverlay('Chargement…');
  try {
    const [rapportsRes, profilsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/rapports_bugs?select=id,client_id,message,lu,created_at&order=created_at.desc`, { headers: supaHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/client_profils?select=client_id,prenom,nom`, { headers: supaHeaders() }),
    ]);
    const rows = rapportsRes.ok ? await rapportsRes.json() : [];
    const profils = profilsRes.ok ? await profilsRes.json() : [];
    const nomParClient = {};
    profils.forEach(p => { nomParClient[p.client_id] = [p.prenom, p.nom].filter(Boolean).join(' ') || p.client_id; });
    _rapportsBugsData = { bugs: rows.map(r => ({
      id: r.id, client: r.client_id, nom: nomParClient[r.client_id] || r.client_id,
      message: r.message, lu: r.lu, ts: r.created_at
    })) };
    hideLoadingOverlay();
    setPage('rapports-bugs');
    const nonLusIds = rows.filter(r => !r.lu).map(r => r.id);
    if (nonLusIds.length) {
      fetch(`${SUPABASE_URL}/rest/v1/rapports_bugs?id=in.(${nonLusIds.join(',')})`, {
        method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ lu: true })
      }).catch(() => {});
    }
    S.data.bugsNonLus = 0;
  } catch(e) { hideLoadingOverlay(); _retourAccueilCoach(); }
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
          <div style="font-size:11px;color:#8892a4;">${_fmtTsIso(b.ts)}</div>
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
      <button class="btn-secondary" onclick="_retourAccueilCoach()">← Retour</button>
    </div>
  </div>`;
}
