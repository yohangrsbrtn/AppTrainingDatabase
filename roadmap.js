// ── Roadmap page (client) — phases datées cut/reverse/prise de masse/... ──

const RM_TYPES = {
  cut:           { label:'Cut',            color:'#e5484d' },
  reverse:       { label:'Reverse',        color:'#f5a623' },
  prise_masse:   { label:'Prise de masse', color:'#30a46c' },
  maintenance:   { label:'Maintenance',    color:'#3b82f6' },
  recomposition: { label:'Recomposition',  color:'#8b5cf6' },
  refeed:        { label:'Refeed',         color:'#06b6d4' },
  standby:       { label:'Stand-by',       color:'#8892a4' },
};
function _rmType(key) { return RM_TYPES[key] || { label: key || '—', color:'#8892a4' }; }

let _rmPhases = [];

async function loadRoadmap() {
  setPage('roadmap-loading');
  try {
    const clientId = (_viewAsClientOverride != null) ? _viewAsClientOverride : getClient();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_roadmap?client_id=eq.${encodeURIComponent(clientId)}&order=date_debut.asc`, { headers: supaHeaders() });
    _rmPhases = res.ok ? await res.json() : [];
    setPage('roadmap');
  } catch(e) { setPage('home'); }
}

function renderRoadmapPage() {
  if (S.page === 'roadmap-loading') {
    return `<div id="app">${renderHeader('Roadmap','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('roadmap')}</div>`;
  }

  const today = new Date().toISOString().slice(0,10);
  const phases = _rmPhases || [];
  const enCoursIdx = phases.findIndex(p => p.date_debut <= today && p.date_fin >= today);
  const enCours = enCoursIdx >= 0 ? phases[enCoursIdx] : null;

  if (!phases.length) {
    return `<div id="app">
      ${renderHeader('Roadmap', '', false)}
      <div class="page"><div class="empty"><div class="empty-icon">🗺️</div><div class="empty-text">Ton coach n'a pas encore défini de roadmap.</div></div></div>
      ${renderNavBar('roadmap')}
    </div>`;
  }

  // Timeline segmentée : largeur de chaque segment proportionnelle à sa durée (flex-grow = nb de jours).
  const timelineHtml = `
    <div style="display:flex;border-radius:8px;overflow:hidden;height:10px;margin-bottom:6px;">
      ${phases.map(p => {
        const t = _rmType(p.type);
        return `<div style="flex:${_rmJours(p)};background:${t.color};min-width:3px;"></div>`;
      }).join('')}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
      ${Object.keys(RM_TYPES).filter(k => phases.some(p=>p.type===k)).map(k => `
        <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:#8892a4;">
          <span style="width:8px;height:8px;border-radius:50%;background:${RM_TYPES[k].color};display:inline-block;"></span>${RM_TYPES[k].label}
        </div>`).join('')}
    </div>`;

  const enCoursHtml = enCours ? (() => {
    const t = _rmType(enCours.type);
    const jours = _rmJours(enCours);
    const ecoules = Math.min(jours, Math.max(0, _rmJoursEcoules(enCours.date_debut)));
    const pct = Math.round((ecoules/jours)*100);
    return `
    <div style="background:#1a1d29;border-radius:14px;padding:18px;margin-bottom:20px;border-left:4px solid ${t.color};">
      <div style="font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Phase actuelle</div>
      <div style="font-size:20px;font-weight:700;color:${t.color};margin-bottom:8px;">${esc(t.label)}</div>
      <div style="font-size:12px;color:#8892a4;margin-bottom:10px;">${_rmDateFr(enCours.date_debut)} → ${_rmDateFr(enCours.date_fin)} · ${_rmFmtDuree(enCours.date_debut, enCours.date_fin)}</div>
      <div style="background:#0f1117;border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px;">
        <div style="height:100%;width:${pct}%;background:${t.color};border-radius:6px;"></div>
      </div>
      <div style="font-size:11px;color:#8892a4;margin-bottom:${enCours.objectif?'10':'0'}px;">Jour ${ecoules} / ${jours} (${pct}%)</div>
      ${enCours.objectif ? `<div style="font-size:13px;color:#c8d0e0;line-height:1.6;">${esc(enCours.objectif)}</div>` : ''}
    </div>`;
  })() : '';

  const listItem = (p, statut) => {
    const t = _rmType(p.type);
    const opac = statut === 'passee' ? '0.5' : '1';
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #23262f;opacity:${opac};">
      <span style="width:10px;height:10px;border-radius:50%;background:${t.color};flex-shrink:0;"></span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#e8eaf0;">${esc(t.label)}</div>
        <div style="font-size:11px;color:#8892a4;">${_rmDateFr(p.date_debut)} → ${_rmDateFr(p.date_fin)} · ${_rmFmtDuree(p.date_debut, p.date_fin)}</div>
        ${p.objectif ? `<div style="font-size:11.5px;color:#8892a4;margin-top:2px;line-height:1.4;">${esc(p.objectif)}</div>` : ''}
      </div>
      ${statut === 'passee' ? '<span style="font-size:14px;color:#3ecf8e;">✓</span>' : ''}
    </div>`;
  };

  const passees = phases.filter(p => p.date_fin < today);
  const avenir  = phases.filter(p => p.date_debut > today);

  return `<div id="app">
    ${renderHeader('Roadmap', '', false)}
    <div class="page">
      ${timelineHtml}
      ${enCoursHtml}
      ${avenir.length ? `<div style="font-size:11px;font-weight:700;color:#8892a4;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">À venir</div>${avenir.map(p=>listItem(p,'avenir')).join('')}` : ''}
      ${passees.length ? `<div style="font-size:11px;font-weight:700;color:#8892a4;text-transform:uppercase;letter-spacing:1px;margin:${avenir.length?'20':'0'}px 0 4px;">Phases passées</div>${passees.slice().reverse().map(p=>listItem(p,'passee')).join('')}` : ''}
      ${_rmCalendrierHtml(phases)}
    </div>
    ${renderNavBar('roadmap')}
  </div>`;
}

// Calendrier mensuel : un bloc par mois couvert par les phases (déborde sur le mois
// suivant → bloc supplémentaire à côté), chaque jour coloré selon la phase qui le couvre.
const RM_JOURS_SEMAINE = ['L','M','M','J','V','S','D'];
function _rmCalendarMonths(phasesAvecDates){
  const min = phasesAvecDates.reduce((a,p)=> p.date_debut<a?p.date_debut:a, phasesAvecDates[0].date_debut);
  const max = phasesAvecDates.reduce((a,p)=> p.date_fin>a?p.date_fin:a, phasesAvecDates[0].date_fin);
  const [y0,m0] = min.split('-').map(Number);
  const [y1,m1] = max.split('-').map(Number);
  const months = [];
  let y=y0, m=m0;
  while (y<y1 || (y===y1 && m<=m1)) { months.push([y,m]); m++; if (m>12){ m=1; y++; } }
  return months;
}
function _rmCalendrierHtml(phases){
  const withDates = phases.filter(p => p.date_debut && p.date_fin);
  if (!withDates.length) return '';
  const months = _rmCalendarMonths(withDates);
  const todayStr = new Date().toISOString().slice(0,10);
  const moisNoms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const monthsHtml = months.map(([y,m]) => {
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstWeekday = (new Date(y, m-1, 1).getDay() + 6) % 7; // lundi=0
    const cells = [];
    for (let i=0;i<firstWeekday;i++) cells.push('<div></div>');
    for (let d=1; d<=daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const phase = withDates.find(p => p.date_debut<=dateStr && dateStr<=p.date_fin);
      const t = phase ? _rmType(phase.type) : null;
      const isToday = dateStr===todayStr;
      cells.push(`<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:11px;${t?`background:${t.color}26;color:${t.color};font-weight:700;`:'color:#8892a4;'}${isToday?`box-shadow:inset 0 0 0 2px ${t?t.color:'#3ecf8e'};`:''}">${d}</div>`);
    }
    return `<div style="flex:0 0 auto;width:150px;">
      <div style="font-size:12px;font-weight:700;color:#e8eaf0;margin-bottom:8px;text-align:center;">${moisNoms[m-1]} ${y}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:3px;">
        ${RM_JOURS_SEMAINE.map(j=>`<div style="text-align:center;font-size:9px;color:#8892a4;">${j}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">${cells.join('')}</div>
    </div>`;
  }).join('');
  return `<div style="margin-top:20px;">
    <div style="font-size:11px;font-weight:700;color:#8892a4;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Calendrier</div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;">${monthsHtml}</div>
  </div>`;
}

function _rmJours(p) {
  const d = new Date(p.date_debut), f = new Date(p.date_fin);
  return Math.max(1, Math.round((f-d)/86400000) + 1);
}
function _rmJoursEcoules(dateDebut) {
  const d = new Date(dateDebut), today = new Date();
  d.setHours(0,0,0,0); today.setHours(0,0,0,0);
  return Math.round((today-d)/86400000) + 1;
}
function _rmDateFr(iso) {
  if (!iso) return '—';
  return iso.split('-').reverse().join('/');
}
function _rmAddMonths(iso, n) {
  const d = new Date(iso+'T00:00:00');
  d.setMonth(d.getMonth()+n);
  const p = x => String(x).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function _rmAddDaysIso(iso, n) {
  const d = new Date(iso+'T00:00:00');
  d.setDate(d.getDate()+n);
  const p = x => String(x).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
// Même logique que console.html (_rmFmtDuree) — mois = mois calendaire réel,
// pas une approximation 30 jours, cohérent avec les durées posées côté coach.
function _rmFmtDuree(dateDebut, dateFin) {
  if (!dateDebut || !dateFin) return '';
  const jours = Math.round((new Date(dateFin) - new Date(dateDebut))/86400000) + 1;
  if (jours <= 0) return '';
  for (let n = 1; n <= 24; n++) {
    const fin = _rmAddDaysIso(_rmAddMonths(dateDebut, n), -1);
    if (fin === dateFin) return n === 1 ? '1 mois' : n + ' mois';
    if (fin > dateFin) break;
  }
  if (jours % 7 === 0) { const s = jours / 7; return s === 1 ? '1 semaine' : s + ' semaines'; }
  return jours + (jours === 1 ? ' jour' : ' jours');
}
