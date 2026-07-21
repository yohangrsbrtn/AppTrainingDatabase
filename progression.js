// ── Progression page ──────────────────────────────────────────────────

function getTierColors(tier) {
  switch(tier) {
    case 'bronze':     return {c1:'#d08040', c2:'#6a3010', bar:'linear-gradient(90deg,#6a3010,#d08040,#e8b060)'};
    case 'argent':     return {c1:'#c0c0c0', c2:'#585858', bar:'linear-gradient(90deg,#606060,#d0d0d0,#b0b0b0)'};
    case 'or':         return {c1:'#d4a820', c2:'#7a5000', bar:'linear-gradient(90deg,#7a5000,#d4a820,#f0d040)'};
    case 'platine':    return {c1:'#9090e8', c2:'#282870', bar:'linear-gradient(90deg,#282870,#9090e8,#b0b0ff)'};
    case 'diamant':    return {c1:'#00c8e8', c2:'#004860', bar:'linear-gradient(90deg,#004860,#00c8e8,#60e0ff)'};
    case 'legendaire': return {c1:'#c040e0', c2:'#500080', bar:'linear-gradient(90deg,#500080,#c040e0,#e060ff)'};
    default:           return {c1:'#a8b0c8', c2:'#404858', bar:'linear-gradient(90deg,#808898,#c0c8d8,#a8b0c8)'};
  }
}

async function loadProgression() {
  showLoadingOverlay('Chargement…');
  try {
    S.data.prog = await api('chargerProgressionClient');
    hideLoadingOverlay();
    setPage('progression');
  } catch(e) { hideLoadingOverlay(); setPage('home'); }
}

// Jauge en demi-cercle (séances / bilans / assiduité) — identique au GAS
function renderGauge(pct, color, label, valide, total) {
  const r = 48, cx = 60, cy = 66;
  const totalLen = Math.PI * r;
  const dashOffset = totalLen * (1 - Math.min(pct,100)/100);
  const angle = (Math.min(pct,100)/100) * 180;
  const rad = (180 - angle) * Math.PI / 180;
  const nx = (cx + 42*Math.cos(rad)).toFixed(1);
  const ny = (cy - 42*Math.sin(rad)).toFixed(1);
  return `
  <div style="background:#161b2e;border-radius:12px;border:1px solid #1e2235;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:16px;">
    <svg viewBox="0 0 120 76" width="110" height="70" style="flex-shrink:0;">
      <path d="M 12 66 A ${r} ${r} 0 0 1 108 66" fill="none" stroke="#2a3550" stroke-width="3" stroke-linecap="round"/>
      <path d="M 12 66 A ${r} ${r} 0 0 1 108 66" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"
        stroke-dasharray="${totalLen}" stroke-dashoffset="${dashOffset.toFixed(1)}"/>
      <g stroke="#5a6a90" stroke-width="1" stroke-linecap="round">
        <line x1="12" y1="66" x2="17" y2="66"/><line x1="26" y1="30" x2="30" y2="34"/>
        <line x1="60" y1="14" x2="60" y2="20"/><line x1="94" y1="30" x2="90" y2="34"/>
        <line x1="108" y1="66" x2="103" y2="66"/>
      </g>
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${color}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
      <circle cx="${nx}" cy="${ny}" r="2.5" fill="${color}"/>
      <circle cx="${cx}" cy="${cy}" r="4" fill="#161b2e" stroke="${color}" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="1.5" fill="${color}"/>
      <text x="${cx}" y="${cy-12}" font-size="13" font-weight="bold" fill="#f0f2ff" text-anchor="middle">${pct}%</text>
    </svg>
    <div>
      <div style="font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${color};line-height:1;">${valide}${total !== '' ? ` <span style="font-size:14px;color:#8892a4;font-weight:400;">/ ${total}</span>` : ''}</div>
      <div style="font-size:11px;color:#8892a4;margin-top:4px;">depuis le début du coaching</div>
    </div>
  </div>`;
}

function renderProgressionPage() {
  const p = S.data.prog || {};
  const niveau = p.niveau || 1;
  const tier = niveauToTier(niveau);
  const tc = getTierColors(tier);
  const sz = tier === 'legendaire' ? 62 : tier === 'diamant' ? 56 : tier === 'platine' ? 50 : 44;
  const xpPct = p.pct || 0;
  const xpTotal = p.xpTotal || 0;
  const xpManquant = p.xpManquant != null ? p.xpManquant : 10;

  const titreId = p.titreActif || ((() => { try { return localStorage.getItem('titreActif_' + S.client) || null; } catch(e) { return null; } })());
  const titreDef = titreId && typeof TITRES_DEF !== 'undefined' ? TITRES_DEF.find(t => t.id === titreId) : null;
  const titreHtml = titreDef ? renderTitrePill(titreDef, false) : '';

  // ── Pas cumulés : progression vers le prochain palier (150k/300k/600k/1M)
  const ptRaw = Math.round(p.pasTotal || 0);
  const ptFmt = ptRaw.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const seuilsPas = [150000, 300000, 600000, 1000000];
  const nextSeuil = seuilsPas.find(s => s > ptRaw);
  const pctPas = nextSeuil ? Math.min(100, Math.round(ptRaw / nextSeuil * 100)) : 100;
  const nextSeuilFmt = nextSeuil ? nextSeuil.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : null;
  const pasHtml = `<div style="background:#161b2e;border-radius:12px;border:1px solid #1e2235;padding:10px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;">
    <div style="font-size:24px;flex-shrink:0;line-height:1;">🦶</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Pas cumulés</div>
      <div style="font-size:20px;font-weight:700;color:#40C8FF;line-height:1;">${ptFmt}</div>
      ${nextSeuil
        ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;"><div style="flex:1;height:3px;background:#1e2235;border-radius:2px;overflow:hidden;"><div style="height:3px;border-radius:2px;width:${pctPas}%;background:#40C8FF;transition:width 0.6s ease;"></div></div><span style="font-size:9px;color:#555e7a;white-space:nowrap;">/ ${nextSeuilFmt}</span></div>`
        : `<div style="font-size:9px;color:#3ecf8e;margin-top:4px;">✅ Pèlerin atteint</div>`}
    </div>
  </div>`;

  // ── Collection : aperçu des trophées de niveau + badge "nouveau" + prochain trophée
  const pasTotal = p.pasTotal || 0, nbBilans = p.bilansValidies || 0;
  const tropheesHtml = (typeof BADGES_NIVEAU !== 'undefined' ? BADGES_NIVEAU : []).map((t, i) => {
    const unlocked = niveau >= t.seuil;
    const geo = t.tier === 'platine' || t.tier === 'diamant' || t.tier === 'legendaire';
    const bsz = t.tier === 'legendaire' ? 64 : t.tier === 'diamant' ? 58 : geo ? 52 : 44;
    const tip = unlocked ? `✅ ${t.nom} débloqué · ${t.desc}` : `🔒 Débloquer au niveau ${t.seuil} · ${t.desc}`;
    return `<div title="${esc(tip)}" style="flex:0 0 auto;min-width:${geo?60:50}px;text-align:center;opacity:${unlocked?'1':'0.25'};filter:${unlocked?'none':'grayscale(1) brightness(0.5)'};">
      ${getBadgeSVG(t.tier, bsz, 'tr'+i)}
      <div style="font-size:${geo?'10':'9'}px;color:${unlocked?(t.tier==='legendaire'?'#E8A0FF':t.tier==='diamant'?'#80F8FF':t.tier==='platine'?'#C8D8FF':'#c8d0e0'):'#555e7a'};margin-top:2px;font-weight:${unlocked?'700':'400'};">${t.nom}</div>
      <div style="font-size:8px;color:#8892a4;">niv.${t.seuil}</div>
    </div>`;
  }).join('');
  const prochainTrophee = (typeof BADGES_NIVEAU !== 'undefined' ? BADGES_NIVEAU : []).find(t => niveau < t.seuil);
  const titresDebloques = typeof TITRES_DEF !== 'undefined'
    ? TITRES_DEF.filter(b => (b.cat==='pas'?pasTotal:b.cat==='bilan'?nbBilans:b.cat==='seance'?(p.seancesValidees||0):niveau) >= b.seuil).length
    : 0;
  let seenTitres = p.seenTitres != null ? p.seenTitres : 0;
  try { const ls = parseInt(localStorage.getItem('seenTitres_' + S.client)); if (!isNaN(ls) && ls > seenTitres) seenTitres = ls; } catch(e) {}
  const titresNouveaux = Math.max(0, titresDebloques - seenTitres);

  const collectionHtml = `<div onclick="loadCollection()" style="background:#161b2e;border-radius:12px;border:1.5px solid #3a5090;padding:14px 16px;margin-bottom:10px;cursor:pointer;-webkit-tap-highlight-color:transparent;position:relative;overflow:hidden;">
    <div style="position:absolute;top:0;left:0;bottom:0;width:3px;background:linear-gradient(180deg,#4f8ef7,#3570d4);"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-left:6px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;font-weight:700;color:#e8eaf0;">Collection</span>
        ${titresNouveaux > 0 ? `<span style="font-size:10px;font-weight:700;color:#f0a500;background:#f0a50020;border:1px solid #f0a50055;border-radius:10px;padding:2px 8px;">🆕 ${titresNouveaux} nouveau${titresNouveaux>1?'x':''}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${prochainTrophee ? `<span style="font-size:11px;color:#4f8ef7;">${prochainTrophee.nom} à niv. ${prochainTrophee.seuil}</span>` : '<span style="font-size:11px;color:#f59e0b;">👑 Légende atteinte !</span>'}
        <div style="width:26px;height:26px;background:#4f8ef722;border:1px solid #4f8ef766;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:16px;color:#4f8ef7;font-weight:600;line-height:1;">›</span></div>
      </div>
    </div>
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;padding-left:6px;">${tropheesHtml}</div>
  </div>`;

  // ── 5 dernières récompenses XP
  const historiqueHtml = (p.historiqueXP && p.historiqueXP.length > 0) ? (() => {
    const lignes = p.historiqueXP.map(h => {
      const isBilan = h.type === 'bilan';
      const icone = isBilan ? '📋' : '✅';
      const label = isBilan
        ? 'Bilan' + (h.semaine ? ' · Sem. ' + h.semaine : '')
        : (h.nomSeance || 'Séance') + (h.semaine ? ' · Sem. ' + h.semaine : '') + (h.programme ? ' · ' + h.programme : '');
      const dateStr = ((h.ts||'').match(/^(\d{2}\/\d{2}\/\d{4})/) || ['',''])[1];
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e2235;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          <span style="font-size:16px;">${icone}</span>
          <span style="font-size:12px;color:#c8d0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(label)}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;margin-left:8px;">
          <span style="font-size:13px;font-weight:700;color:#4f8ef7;">+${h.xp} XP</span>
          <span style="font-size:10px;color:#555e7a;">${dateStr}</span>
        </div>
      </div>`;
    }).join('');
    return `<div style="background:#161b2e;border-radius:12px;border:1px solid #1e2235;padding:14px 16px;margin-top:10px;">
      <div style="font-size:12px;color:#8892a4;margin-bottom:8px;">5 dernières récompenses XP</div>
      ${lignes}
    </div>`;
  })() : '';

  return `<div id="app" style="background:#0f1117;min-height:100dvh;padding:16px 16px calc(20px + env(safe-area-inset-bottom));max-width:500px;margin:0 auto;padding-top:calc(16px + env(safe-area-inset-top));">

    <!-- Hero niveau — identique à l'en-tête de l'accueil (même taille, même agencement) -->
    <div style="
      background:linear-gradient(145deg,#131825 0%,${tc.c2}99 30%,${tc.c2}ee 50%,${tc.c2}99 70%,#131825 100%);
      border-radius:12px;border-top:4px solid ${tc.c1};
      border-left:1px solid ${tc.c1}33;border-right:1px solid ${tc.c1}33;border-bottom:1px solid ${tc.c1}22;
      padding:14px 16px;margin-bottom:16px;
      box-shadow:inset 0 1px 0 ${tc.c1}88,0 0 28px ${tc.c1}44,0 2px 14px rgba(0,0,0,0.45);">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
          <div style="flex-shrink:0;">${getBadgeSVG(tier, sz, 'prog')}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:18px;font-weight:700;color:#f0f2ff;">${(p.nom || S.client).split(' ')[0]}</span>
              ${titreHtml}
            </div>
            <div style="font-size:12px;color:#8892a4;margin-top:2px;">${xpTotal ? xpTotal.toLocaleString('fr') + ' XP' : '—'}</div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;">
              <span style="font-size:10px;color:#8892a4;">Niv. ${niveau}</span>
              <span style="font-size:10px;color:${tc.c1};font-weight:600;">${xpManquant.toLocaleString('fr')} XP → Niv. ${niveau+1}</span>
            </div>
            <div style="height:4px;background:#1e2235;border-radius:2px;overflow:hidden;margin-top:6px;">
              <div style="height:4px;border-radius:2px;width:${xpPct}%;background:${tc.bar};transition:width .6s ease;"></div>
            </div>
          </div>
        </div>
        <button onclick="ouvrirSettings()" style="width:36px;height:36px;background:transparent;border:1px solid #2a2f45;border-radius:9px;padding:0;margin:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:flex-start;cursor:pointer;">${ICONE_PARAMETRES}</button>
      </div>
    </div>

    ${renderGauge(p.pctSeances || 0, '#3ecf8e', 'Séances', p.seancesValidees || 0, p.seancesAttendues || 0)}
    ${renderGauge(p.pctBilans || 0, '#a78bfa', 'Bilans', p.bilansValidies || 0, p.bilansAttendus || 0)}
    ${renderGauge(p.assiduiteGlobale || 0, '#f59e0b', 'Assiduité globale', (p.assiduiteGlobale || 0) + '%', '')}
    ${pasHtml}
    ${collectionHtml}
    ${historiqueHtml}

    <button class="btn-secondary" onclick="loadHome()" style="margin-top:10px;">← Accueil</button>
  </div>`;
}
