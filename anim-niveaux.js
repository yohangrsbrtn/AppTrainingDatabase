// ═══ Animations de déblocage (rangs, paliers, records, récap) + retour haptique + labo de test ═══════
// Dépend de niveaux.js (NV_RANGS, nvCouleur, nvRangComplet, nvPalier, nvFracPalier, NV_ZONE_NOM). Tout est à l'écran à la demande :
// aucun état stocké. Le labo (nvLabOuvrir) permet de rejouer chaque animation depuis la page Progression (compte yohanp).
let _nvaCss = false;
function _nvaStyle() {
  if (_nvaCss) return; _nvaCss = true;
  const st = document.createElement('style');
  st.textContent = `
  .nva-ov{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%,rgba(20,26,48,.96),rgba(5,7,14,.98));animation:nvaFade .35s ease both;overflow:hidden;padding:24px;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  .nva-ov.out{animation:nvaFadeOut .3s ease both}
  .nva-rays{position:absolute;left:50%;top:42%;width:150vmax;height:150vmax;margin:-75vmax 0 0 -75vmax;background:repeating-conic-gradient(from 0deg,var(--c) 0 6deg,transparent 6deg 24deg);opacity:.16;animation:nvaSpin 14s linear infinite;-webkit-mask-image:radial-gradient(circle,#000 0,transparent 55%);mask-image:radial-gradient(circle,#000 0,transparent 55%)}
  .nva-shock{position:absolute;left:50%;top:42%;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:3px solid var(--c);animation:nvaShock .9s ease-out .15s both}
  .nva-shock.b{animation-delay:.35s}
  .nva-badge{position:relative;width:min(58vw,230px);filter:drop-shadow(0 0 28px var(--c));animation:nvaPop .85s cubic-bezier(.2,1.4,.4,1) .12s both}
  .nva-badge .shine{position:absolute;inset:0;overflow:hidden;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 140'><path d='M60 6 L108 24 V68 C108 100 86 124 60 134 C34 124 12 100 12 68 V24 Z'/></svg>");mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 140'><path d='M60 6 L108 24 V68 C108 100 86 124 60 134 C34 124 12 100 12 68 V24 Z'/></svg>");-webkit-mask-size:100% 100%;mask-size:100% 100%}
  .nva-badge .shine::after{content:'';position:absolute;top:-20%;bottom:-20%;width:35%;left:-50%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.7),transparent);transform:skewX(-18deg);animation:nvaShine 1.2s ease .9s both}
  .nva-titre{margin-top:18px;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#aeb6cc;animation:nvaUp .5s ease .7s both}
  .nva-rang{font-size:34px;font-weight:800;color:var(--c);margin-top:4px;text-shadow:0 0 22px var(--c);animation:nvaUp .5s ease .85s both}
  .nva-muscle{font-size:16px;color:#e6eaf5;margin-top:2px;animation:nvaUp .5s ease 1s both}
  .nva-barre{width:min(70vw,300px);height:9px;background:#1e2235;border-radius:5px;overflow:hidden;margin-top:18px;animation:nvaUp .5s ease 1.1s both}
  .nva-barre>i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--c),#fff8);border-radius:5px;transition:width 1.1s cubic-bezier(.2,.8,.2,1) 1.3s}
  .nva-btn{margin-top:26px;background:transparent;color:#cfd6ea;border:1px solid #3a4560;border-radius:24px;padding:10px 28px;font-size:14px;animation:nvaUp .5s ease 1.6s both}
  .nva-part{position:absolute;left:50%;top:42%;width:8px;height:8px;margin:-4px;border-radius:2px;background:var(--pc);animation:nvaPart var(--pt) cubic-bezier(.1,.7,.3,1) var(--pd) both}
  .nva-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 14px);transform:translateX(-50%);z-index:10001;min-width:220px;max-width:90vw;background:linear-gradient(135deg,#1b2340,#121830);border:1px solid var(--c);border-radius:14px;padding:11px 16px;color:#e6eaf5;font-size:13.5px;box-shadow:0 8px 30px rgba(0,0,0,.5),0 0 18px color-mix(in srgb,var(--c) 40%,transparent);animation:nvaToast 3.4s ease both}
  .nva-recap{width:min(92vw,380px);background:#121830;border:1px solid #232c4a;border-radius:16px;padding:16px;animation:nvaPop .6s cubic-bezier(.2,1.2,.4,1) both}
  .nva-recap .ligne{display:flex;align-items:center;gap:8px;margin-top:11px;font-size:13px;opacity:0;animation:nvaUp .45s ease both}
  .nva-flash{animation:nvaFlash .5s ease}
  @keyframes nvaFade{from{opacity:0}to{opacity:1}} @keyframes nvaFadeOut{to{opacity:0}}
  @keyframes nvaSpin{to{transform:rotate(360deg)}}
  @keyframes nvaPop{0%{transform:scale(.15) rotate(-14deg);opacity:0}60%{transform:scale(1.14) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0)}}
  @keyframes nvaShock{from{transform:scale(.3);opacity:.9}to{transform:scale(7);opacity:0}}
  @keyframes nvaShine{from{left:-50%}to{left:130%}}
  @keyframes nvaUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  @keyframes nvaPart{0%{transform:translate(0,0) rotate(0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--rot)) scale(.3);opacity:0}}
  @keyframes nvaToast{0%{opacity:0;transform:translate(-50%,-24px) scale(.92)}10%{opacity:1;transform:translate(-50%,0) scale(1)}85%{opacity:1}100%{opacity:0;transform:translate(-50%,-10px)}}
  @keyframes nvaFlash{0%{filter:brightness(1)}40%{filter:brightness(2.2) drop-shadow(0 0 10px var(--c))}100%{filter:brightness(1)}}`;
  document.head.appendChild(st);
}

// Retour haptique : navigator.vibrate (Android) sinon l'interrupteur natif d'iOS 17.4+ (input switch) — très léger.
function nvHaptic(kind) {
  try { if (navigator.vibrate) { navigator.vibrate(kind === 'succes' ? [16, 50, 26] : kind === 'fort' ? [30, 40, 30, 40, 50] : 8); return; } } catch (e) {}
  try {
    let l = document.getElementById('nvaHap');
    if (!l) { l = document.createElement('label'); l.id = 'nvaHap'; l.setAttribute('aria-hidden', 'true'); l.style.cssText = 'position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none;'; l.innerHTML = '<input type="checkbox" switch>'; document.body.appendChild(l); }
    l.click();
    if (kind === 'succes' || kind === 'fort') setTimeout(() => l.click(), 85);
    if (kind === 'fort') setTimeout(() => l.click(), 190);
  } catch (e) {}
}

// Badge écusson : couleur selon le rang, chiffre romain = palier, étoiles = paliers acquis dans le rang
function nvBadgeSvg(niv, id) {
  const col = nvCouleur(niv), s = nvSous(niv), r = nvRang(niv), g = 'nvg' + (id || '') + Math.floor(niv * 3);
  const etoiles = [0, 1, 2].map(i => `<path d="M${40 + i * 20} 34 l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="${i < s ? '#fff' : 'rgba(255,255,255,.22)'}"/>`).join('');
  return `<svg viewBox="0 0 120 140" style="width:100%;display:block;"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity=".55"/></linearGradient><linearGradient id="${g}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="M60 6 L108 24 V68 C108 100 86 124 60 134 C34 124 12 100 12 68 V24 Z" fill="url(#${g})" stroke="#fff" stroke-opacity=".85" stroke-width="2.5"/>
    <path d="M60 14 L100 29 V68 C100 94 82 114 60 123 C38 114 20 94 20 68 V29 Z" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"/>
    <path d="M60 6 L108 24 V68 C108 100 86 124 60 134 C34 124 12 100 12 68 V24 Z" fill="url(#${g}h)"/>
    ${etoiles}
    <text x="60" y="88" text-anchor="middle" font-size="${s === 3 ? 34 : 40}" font-weight="800" fill="#fff" style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:3px;font-family:-apple-system,system-ui,sans-serif;">${NV_ROMAIN[s - 1]}</text>
    <text x="60" y="108" text-anchor="middle" font-size="10.5" font-weight="700" letter-spacing="1.2" fill="#fff" fill-opacity=".92" style="font-family:-apple-system,system-ui,sans-serif;">${r.toUpperCase()}</text></svg>`;
}

function _nvaParticules(ov, col, n) {
  const cols = [col, '#ffffff', '#ffd76a', col];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * Math.min(window.innerWidth, 420) * 0.55, p = document.createElement('i');
    p.className = 'nva-part';
    p.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d + 40}px;--rot:${Math.random() * 540 - 270}deg;--pc:${cols[i % cols.length]};--pt:${1.1 + Math.random() * 0.9}s;--pd:${0.2 + Math.random() * 0.25}s;${Math.random() > .5 ? 'border-radius:50%;' : ''}`;
    ov.appendChild(p);
  }
}

// Déblocage plein écran. opts : { zone, niv, avant (niv précédent), titre }. Rang entier gagné = animation plus grosse.
function nvAnimDebloque(opts) {
  _nvaStyle();
  const niv = opts.niv, rang = opts.avant != null && Math.floor(niv) > Math.floor(opts.avant) || opts.gros, col = nvCouleur(niv);
  const ov = document.createElement('div'); ov.className = 'nva-ov'; ov.style.setProperty('--c', col);
  ov.innerHTML = `<div class="nva-rays"></div><div class="nva-shock"></div>${rang ? '<div class="nva-shock b"></div>' : ''}
    <div class="nva-badge">${nvBadgeSvg(niv, 'ov')}<div class="shine"></div></div>
    <div class="nva-titre">${opts.titre || (rang ? 'Nouveau rang' : 'Palier débloqué')}</div>
    <div class="nva-rang">${nvRangComplet(niv)}</div>
    <div class="nva-muscle">${NV_ZONE_NOM[opts.zone] || opts.zone || ''}</div>
    <div class="nva-barre"><i></i></div>
    <button class="nva-btn">Continuer</button>`;
  _nvaParticules(ov, col, rang ? 46 : 26);
  document.body.appendChild(ov);
  const fin = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 300); };
  ov.querySelector('.nva-btn').onclick = fin; ov.addEventListener('click', e => { if (e.target === ov) fin(); });
  setTimeout(() => nvHaptic(rang ? 'fort' : 'succes'), 180);
  setTimeout(() => { const b = ov.querySelector('.nva-barre>i'); if (b) b.style.width = Math.round(nvFracPalier(niv) * 100) + '%'; nvHaptic('tick'); }, 60);
  return ov;
}

// Barre de progression animée dans `host` : va de `de` à `vers` (niveaux décimaux), franchit les paliers (flash + haptique).
function nvAnimBarre(host, de, vers, opts) {
  _nvaStyle(); opts = opts || {};
  const col0 = nvCouleur(vers);
  host.innerHTML = `<div style="--c:${col0};"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><b class="nvb-l" style="color:${nvCouleur(de)};">${nvRangComplet(de)}</b><span class="nvb-p" style="color:#8892a4;">${Math.round(nvFracPalier(de) * 100)} %</span></div><div style="height:12px;background:#1e2235;border-radius:6px;overflow:hidden;"><div class="nvb-f" style="height:100%;width:${Math.round(nvFracPalier(de) * 100)}%;background:${nvCouleur(de)};border-radius:6px;"></div></div></div>`;
  const f = host.querySelector('.nvb-f'), l = host.querySelector('.nvb-l'), p = host.querySelector('.nvb-p'), wrap = host.firstElementChild;
  const p0 = de * 3, p1 = vers * 3, dur = 900 + Math.min(2, Math.abs(p1 - p0)) * 700, t0 = performance.now();
  let dernierP = Math.floor(p0), dernierTick = -1;
  const etape = t => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = (p0 + (p1 - p0) * e) / 3, pal = Math.floor(v * 3 + 1e-9);
    if (pal > dernierP) { dernierP = pal; nvHaptic(Math.floor(v) > Math.floor((pal - 1) / 3) ? 'fort' : 'succes'); wrap.style.setProperty('--c', nvCouleur(v)); wrap.classList.remove('nva-flash'); void wrap.offsetWidth; wrap.classList.add('nva-flash'); }
    const fr = Math.round(nvFracPalier(v) * 100); l.textContent = nvRangComplet(v); l.style.color = nvCouleur(v); p.textContent = fr + ' %'; f.style.width = fr + '%'; f.style.background = nvCouleur(v);
    if (fr % 12 === 0 && fr !== dernierTick && k < 1) { dernierTick = fr; nvHaptic('tick'); }
    if (k < 1) requestAnimationFrame(etape); else if (opts.fini) opts.fini();
  };
  requestAnimationFrame(etape);
}

// Petite bannière « nouveau record » (une seule à la fois)
function nvAnimRecord(opts) {
  _nvaStyle(); document.querySelectorAll('.nva-toast').forEach(x => x.remove());
  const t = document.createElement('div'); t.className = 'nva-toast'; t.style.setProperty('--c', opts.couleur || '#ffd76a');
  t.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:24px;">🏅</span><div><div style="font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:#ffd76a;">Nouveau record</div><div><b>${_nvEsc(opts.exo)}</b> · ${opts.charge} kg × ${opts.reps}</div>${opts.detail ? `<div style="font-size:11.5px;color:#8892a4;margin-top:1px;">${opts.detail}</div>` : ''}</div></div>`;
  document.body.appendChild(t); nvHaptic('succes'); setTimeout(() => t.remove(), 3500);
}

// Récap de fin de séance : liste de { zone, de, vers } + records
function nvAnimRecap(opts) {
  _nvaStyle();
  const ov = document.createElement('div'); ov.className = 'nva-ov'; ov.style.setProperty('--c', '#ffd76a');
  const lignes = (opts.muscles || []).map((m, i) => `<div class="ligne" style="animation-delay:${0.5 + i * 0.35}s;"><span style="flex:1;">${NV_ZONE_NOM[m.zone] || m.zone}</span><div class="nvr-b" data-i="${i}" style="width:48%;"></div></div>`).join('');
  const recs = (opts.records || []).map((r, i) => `<div class="ligne" style="animation-delay:${0.5 + ((opts.muscles || []).length + i) * 0.35}s;"><span>🏅</span><span style="flex:1;">${_nvEsc(r.exo)}</span><b>${r.charge} kg × ${r.reps}</b></div>`).join('');
  ov.innerHTML = `<div class="nva-rays"></div><div class="nva-recap"><div style="text-align:center;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#ffd76a;">Séance terminée</div><div style="text-align:center;font-size:20px;font-weight:800;margin-top:4px;">${(opts.muscles || []).length} muscle${(opts.muscles || []).length > 1 ? 's' : ''} en progrès</div>${lignes}${recs ? '<div style="height:1px;background:#232c4a;margin-top:14px;"></div>' + recs : ''}<button class="nva-btn" style="display:block;margin:20px auto 0;animation-delay:${0.8 + ((opts.muscles || []).length + (opts.records || []).length) * 0.35}s;">Fermer</button></div>`;
  document.body.appendChild(ov);
  const fin = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 300); };
  ov.querySelector('.nva-btn').onclick = fin;
  (opts.muscles || []).forEach((m, i) => setTimeout(() => { const h = ov.querySelector(`.nvr-b[data-i="${i}"]`); if (h) nvAnimBarre(h, m.de, m.vers); }, 600 + i * 350));
  nvHaptic('succes');
}

// ── Labo : rejouer toutes les animations (page Progression, compte yohanp) ──
let _nvLab = { zone: 'quadris', rang: 3, sous: 2 };
function nvLabOuvrir() {
  _nvaStyle();
  let ov = document.getElementById('nvLab'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'nvLab'; ov.style.cssText = 'position:fixed;inset:0;z-index:9990;background:#0b1020;overflow-y:auto;padding:calc(env(safe-area-inset-top) + 14px) 16px 40px;box-sizing:border-box;color:#e6eaf5;';
  const nivSel = () => _nvLab.rang + (_nvLab.sous - 1) / 3 + 0.01; // dans le palier choisi
  const sel = (id, opts, cur) => `<select id="${id}" style="font-size:16px;padding:9px;background:#161b2e;color:#fff;border:1px solid #2c3a58;border-radius:8px;flex:1;min-width:0;">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const btn = (act, t, sub) => `<button data-a="${act}" style="text-align:left;background:#161b2e;color:#e6eaf5;border:1px solid #232c4a;border-radius:12px;padding:12px 14px;font-size:14px;"><b>${t}</b><div style="font-size:11.5px;color:#8892a4;margin-top:2px;">${sub}</div></button>`;
  ov.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;"><div style="font-size:18px;font-weight:800;">🧪 Labo des animations</div><button id="nvLabX" style="background:none;border:0;color:#8892a4;font-size:26px;">✕</button></div>
    <div style="font-size:12px;color:#8892a4;margin:4px 0 12px;">Rejoue chaque animation avec le muscle et le rang choisis. Rien n'est enregistré.</div>
    <div style="display:flex;gap:8px;margin-bottom:8px;">${sel('nvLabZ', Object.entries(NV_ZONE_NOM), _nvLab.zone)}</div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">${sel('nvLabR', NV_RANGS.map((r, i) => [i + 1, r]), _nvLab.rang)}${sel('nvLabS', [[1, 'I'], [2, 'II'], [3, 'III']], _nvLab.sous)}</div>
    <div id="nvLabBarre" style="background:#121830;border:1px solid #232c4a;border-radius:12px;padding:14px;margin-bottom:12px;min-height:46px;color:#8892a4;font-size:12px;">La barre de progression s'anime ici.</div>
    <div style="display:grid;gap:8px;">
      ${btn('palier', '⭐ Déblocage de palier', 'Ex. Argent I → Argent II : écusson, flash, haptique')}
      ${btn('rang', '🏆 Déblocage de rang', 'Changement de grand rang : plus de particules, ondes, haptique fort')}
      ${btn('calib', '🎯 Calibration', 'Révélation du rang après saisie d\'un exercice de base')}
      ${btn('barre', '📈 Barre : progression normale', 'Remplissage sans changer de palier')}
      ${btn('barre1', '⚡ Barre : franchit un palier', 'La barre se remplit, flashe, passe au palier suivant')}
      ${btn('barre2', '🚀 Barre : franchit un rang', 'Passage d\'un rang complet pendant le remplissage')}
      ${btn('record', '🏅 Nouveau record', 'Bannière de record sur un exercice')}
      ${btn('recap', '📋 Récap de fin de séance', 'Tous les déblocages de la séance, en cascade')}
      ${btn('h1', '📳 Haptique : tick léger', 'Le plus discret')}
      ${btn('h2', '📳 Haptique : succès', 'Double tap')}
      ${btn('h3', '📳 Haptique : fort', 'Triple tap pour un rang')}
    </div>
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8892a4;margin:20px 0 8px;">Tous les badges</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${NV_RANGS.map((r, i) => [1, 2, 3].map(s => `<div data-b="${i + 1},${s}" style="cursor:pointer;">${nvBadgeSvg(i + 1 + (s - 1) / 3 + 0.01, 'g' + i + s)}</div>`).join('')).join('')}</div>`;
  document.body.appendChild(ov);
  const lire = () => { _nvLab.zone = ov.querySelector('#nvLabZ').value; _nvLab.rang = +ov.querySelector('#nvLabR').value; _nvLab.sous = +ov.querySelector('#nvLabS').value; };
  ov.querySelector('#nvLabX').onclick = () => ov.remove();
  ov.addEventListener('click', e => {
    const b = e.target.closest('[data-b]'); if (b) { const [r, s] = b.dataset.b.split(',').map(Number); lire(); nvAnimDebloque({ zone: _nvLab.zone, niv: r + (s - 1) / 3 + 0.01, avant: s > 1 ? r : r - 1 }); return; }
    const a = e.target.closest('[data-a]'); if (!a) return; lire();
    const n = nivSel(), z = _nvLab.zone, host = ov.querySelector('#nvLabBarre');
    switch (a.dataset.a) {
      case 'palier': nvAnimDebloque({ zone: z, niv: n, avant: n - 0.34 }); break;
      case 'rang': nvAnimDebloque({ zone: z, niv: Math.floor(n), avant: Math.floor(n) - 0.2 }); break;
      case 'calib': nvAnimDebloque({ zone: z, niv: n, titre: 'Calibré', gros: true }); break;
      case 'barre': nvAnimBarre(host, n, n + 0.12); break;
      case 'barre1': nvAnimBarre(host, n, n + 0.34); break;
      case 'barre2': nvAnimBarre(host, Math.floor(n) + 0.75, Math.floor(n) + 1.25); break;
      case 'record': nvAnimRecord({ exo: 'Squat', charge: 140, reps: 5, detail: 'Ancien : 135 kg × 5' }); break;
      case 'recap': nvAnimRecap({ muscles: [{ zone: z, de: n, vers: n + 0.34 }, { zone: 'pecs', de: 3.6, vers: 3.72 }, { zone: 'lats', de: 2.9, vers: 3.12 }], records: [{ exo: 'Squat', charge: 140, reps: 5 }, { exo: 'Développé couché barre', charge: 100, reps: 6 }] }); break;
      case 'h1': nvHaptic('tick'); break; case 'h2': nvHaptic('succes'); break; case 'h3': nvHaptic('fort'); break;
    }
  });
}
