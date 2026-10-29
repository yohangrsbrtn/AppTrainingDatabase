// ═══ Niveaux par muscle — module partagé (app client + console) ═══════════════════════════════════
// Principe (inspiré de Liftoff) : un niveau par groupe musculaire, affiché sur un avatar 3D dont les zones se colorent, plus un radar
// des 6 grandes régions du corps (maintenant vs il y a X jours).
//  • Exercices ÉTALONS (barre libre, comparables d'une salle à l'autre) : 1RM estimé (Epley, RIR pris en compte) ramené au poids de
//    corps → rang absolu (Bois…Olympien) via des barèmes en multiples du poids de corps (coefficient réduit pour les femmes).
//  • Tous les autres exercices (machines, isolations) : AUCUN barème absolu — deux machines « leg extension » ne se valent pas. On
//    mesure seulement la progression du client contre lui-même (meilleur 1RM estimé vs ses débuts), plafonnée au rang « Or ».
// Rien n'est stocké : tout est recalculé à partir des logs (client_programme_logs), du poids de corps (mensurations) et du sexe.
const NV_RANGS = ['Bois', 'Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Champion', 'Titan', 'Olympien'];
const NV_COULEURS = ['#8b6b4a', '#c27a3c', '#aab3c5', '#f0c443', '#3fd0c4', '#5aa7ff', '#a98bff', '#f0508a', '#ffb020'];
// seuils (× poids de corps) pour passer Bronze, Argent, Or, Platine, Diamant, Champion, Titan, Olympien — barème homme
const NV_ETALONS = {
  'Développé couché barre':  { zones: ['pecs'],                                             h: [0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25], bas: false },
  'Développé incliné barre': { zones: ['pecs'],                                             h: [0.40, 0.65, 0.85, 1.05, 1.30, 1.50, 1.75, 2.00], bas: false },
  'Squat':                   { zones: ['quadris', 'fessiers'],                              h: [0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.50, 2.75], bas: true },
  'Deadlift':                { zones: ['lats', 'traps', 'lombaires', 'ischios', 'fessiers'], h: [1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.75, 3.00], bas: true },
  'RDL':                     { zones: ['ischios', 'fessiers'],                              h: [0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.40, 2.75], bas: true },
  'Hiptrust':                { zones: ['fessiers'],                                         h: [0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 4.25], bas: true },
  'Rowing barre':            { zones: ['lats', 'traps'],                                    h: [0.40, 0.60, 0.80, 1.00, 1.20, 1.40, 1.65, 1.90], bas: false },
};
const NV_ZONES_GROUPE = {
  'Pectoraux': ['pecs'], 'Dos (dorsaux)': ['lats'], 'Dos (trapèzes)': ['traps'], 'Dos (global)': ['lats', 'traps', 'lombaires'],
  'Epaules (anterieur)': ['epaules'], 'Epaules (latéral)': ['epaules'], 'Epaules (posterieur)': ['delt_ar'],
  'Biceps': ['biceps'], 'Triceps': ['triceps'], 'Abdos': ['abdos'], 'Lombaires': ['lombaires'],
  'Quadriceps': ['quadris'], 'Ischios': ['ischios'], 'Fessiers': ['fessiers'], 'Mollets': ['mollets'],
};
const NV_ZONE_NOM = { pecs: 'Pectoraux', lats: 'Dorsaux', traps: 'Trapèzes', lombaires: 'Lombaires', epaules: 'Épaules', delt_ar: 'Deltoïdes postérieurs', biceps: 'Biceps', triceps: 'Triceps', abdos: 'Abdos', quadris: 'Quadriceps', ischios: 'Ischios', fessiers: 'Fessiers', mollets: 'Mollets' };
// Régions du radar : moyenne du niveau de leurs zones, une zone sans donnée comptant pour 0.
const NV_REGIONS = [
  { nom: 'Dos', zones: ['lats', 'traps', 'lombaires'] }, { nom: 'Pectoraux', zones: ['pecs'] }, { nom: 'Tronc', zones: ['abdos'] },
  { nom: 'Bras', zones: ['biceps', 'triceps'] }, { nom: 'Épaules', zones: ['epaules', 'delt_ar'] }, { nom: 'Jambes', zones: ['quadris', 'ischios', 'fessiers', 'mollets'] },
];
const _nvEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nvNiveauDepuisRatio(ratio, seuils) {
  if (ratio < seuils[0]) return 1 + Math.max(0, ratio) / seuils[0];
  for (let i = 0; i < seuils.length - 1; i++) if (ratio < seuils[i + 1]) return (i + 2) + (ratio - seuils[i]) / (seuils[i + 1] - seuils[i]);
  return 9;
}
const nvRang = niv => NV_RANGS[Math.max(0, Math.min(8, Math.floor(niv) - 1))];
const nvCouleur = niv => niv == null ? '#2a2f3f' : NV_COULEURS[Math.max(0, Math.min(8, Math.floor(niv) - 1))];

// Charge tout ce qu'il faut pour un client : bibliothèque d'exercices, programmes + logs (paginés), dernier poids, sexe.
async function nvChargerClient(clientId) {
  const get = async url => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${url}`, { headers: supaHeaders() }); return r.ok ? r.json() : []; };
  const [exercices, profil, mens, progs] = await Promise.all([
    get('exercices?select=id,nom,groupe_musculaire&limit=1000'),
    get(`client_profils?client_id=eq.${encodeURIComponent(clientId)}&select=sexe`),
    get(`mensurations?client_id=eq.${encodeURIComponent(clientId)}&poids=not.is.null&order=date.desc&limit=1&select=date,poids`),
    get(`client_programmes?client_id=eq.${encodeURIComponent(clientId)}&order=created_at.asc&select=id,created_at,client_programme_blocs!client_programme_blocs_client_programme_id_fkey(id,ordre,client_programme_seances(client_programme_exercices(id,exercice_id,nom)))`),
  ]);
  const idsParExo = [];
  progs.forEach(p => (p.client_programme_blocs || []).forEach(b => (b.client_programme_seances || []).forEach(s => (s.client_programme_exercices || []).forEach(e => idsParExo.push(e.id)))));
  const logsParExo = {};
  for (let i = 0; i < idsParExo.length; i += 150) {
    const ids = idsParExo.slice(i, i + 150).join(',');
    for (let off = 0; ; off += 1000) {
      const rows = await get(`client_programme_logs?client_programme_exercice_id=in.(${ids})&charge=not.is.null&select=client_programme_exercice_id,semaine,charge,reps,rir,updated_at&order=id.asc&limit=1000&offset=${off}`);
      rows.forEach(l => { (logsParExo[l.client_programme_exercice_id] = logsParExo[l.client_programme_exercice_id] || []).push(l); });
      if (rows.length < 1000) break;
    }
  }
  return { exercices, progs, logsParExo, poids: mens[0] ? mens[0].poids : null, sexe: (profil[0] && profil[0].sexe) || null };
}

// Calcule les niveaux. cutoff (ms) : ne garde que les séries loggées jusque-là → compare « maintenant » et « il y a X jours ».
function nvCalculer(donnees, cutoff, poids, sexe) {
  poids = parseFloat(poids) || 0;
  const parEx = {};
  (donnees.progs || []).forEach((prog, pi) => (prog.client_programme_blocs || []).forEach((b, bi) => (b.client_programme_seances || []).forEach(se => (se.client_programme_exercices || []).forEach(ex => {
    const lib = donnees.exercices.find(l => l.id === ex.exercice_id) || donnees.exercices.find(l => l.nom.toLowerCase() === (ex.nom || '').toLowerCase());
    if (!lib) return;
    (donnees.logsParExo[ex.id] || []).forEach(l => {
      if (cutoff && l.updated_at && new Date(l.updated_at).getTime() > cutoff) return;
      const charge = parseFloat(l.charge), reps = parseFloat(l.reps);
      if (!(charge > 0) || !(reps > 0)) return;
      const eff = Math.min(30, reps + (parseFloat(l.rir) || 0));
      (parEx[lib.nom] = parEx[lib.nom] || { nom: lib.nom, groupe: lib.groupe_musculaire, sets: [] }).sets.push({ ordre: pi * 1e6 + (b.ordre || bi) * 1e4 + (l.semaine || 0), e1rm: charge * (1 + eff / 30), charge, reps });
    });
  }))));
  const exos = Object.values(parEx).map(e => {
    e.sets.sort((a, b) => a.ordre - b.ordre);
    e.best = Math.max(...e.sets.map(s => s.e1rm));
    const debut = e.sets.slice(0, Math.max(3, Math.ceil(e.sets.length / 5)));
    e.base = Math.max(...debut.map(s => s.e1rm));
    e.prog = e.base > 0 ? (e.best / e.base - 1) * 100 : 0;
    e.nbSets = e.sets.length;
    const et = NV_ETALONS[e.nom];
    if (et && poids) {
      const coef = sexe === 'F' ? (et.bas ? 0.8 : 0.6) : 1;
      e.ratio = e.best / poids; e.niv = nvNiveauDepuisRatio(e.ratio, et.h.map(x => x * coef)); e.etalon = true;
    } else if (e.nbSets >= 3) { e.niv = Math.max(1, Math.min(4, 1 + Math.max(0, e.prog) / 15)); e.etalon = false; } // plafonné à « Or »
    return e;
  });
  const zones = {};
  exos.forEach(e => {
    if (e.niv == null) return;
    const zs = e.etalon ? NV_ETALONS[e.nom].zones : (NV_ZONES_GROUPE[e.groupe] || []);
    zs.forEach(z => { const cur = zones[z] || (zones[z] = { niv: 0, src: null, etalon: false });
      // un étalon (absolu) prime sur une progression relative ; à source égale on garde le plus haut
      if ((e.etalon && !cur.etalon) || (e.etalon === cur.etalon && e.niv > cur.niv)) { cur.niv = e.niv; cur.src = e; cur.etalon = e.etalon; } });
  });
  return { exos, zones, poids };
}
const nvZoneProgresse = (res, avant, id) => { const a = avant && avant.zones[id], n = res.zones[id]; return !!(n && (!a || n.niv > a.niv + 0.05)); };
function nvValeurRegion(res, reg) {
  const n = reg.zones.map(z => { const d = res.zones[z]; return d ? Math.max(0, Math.min(1, (d.niv - 1) / 5)) : 0; }); // 1 = niveau « Diamant »
  return n.reduce((a, b) => a + b, 0) / n.length;
}
function nvRadarSvg(res, avant, jours) {
  const cx = 150, cy = 140, R = 92;
  const pt = (i, v) => { const a = (-120 + i * 60) * Math.PI / 180; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  const poly = vals => vals.map((v, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
  const now = NV_REGIONS.map(r => nvValeurRegion(res, r)), prec = NV_REGIONS.map(r => nvValeurRegion(avant, r));
  let s = '';
  [0.2, 0.4, 0.6, 0.8, 1].forEach(r => { s += `<polygon points="${poly(Array(6).fill(r))}" fill="none" stroke="#2c3a58" stroke-width="1"/>`; });
  NV_REGIONS.forEach((r, i) => {
    const [x, y] = pt(i, 1); s += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#2c3a58"/>`;
    const [lx, ly] = pt(i, 1.2); const anc = lx < cx - 8 ? 'end' : lx > cx + 8 ? 'start' : 'middle';
    s += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anc}" font-size="12" fill="#c9d1e6">${r.nom}</text>`;
  });
  s += `<polygon points="${poly(prec)}" fill="#8892a433" stroke="#8892a4" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  s += `<polygon points="${poly(now)}" fill="#4fc3f733" stroke="#4fc3f7" stroke-width="2"/>`;
  now.forEach((v, i) => { const [x, y] = pt(i, v); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#4fc3f7"/>`; });
  return `<svg viewBox="-24 0 348 285" width="100%" role="img" aria-label="Radar des régions du corps">${s}</svg>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:11.5px;color:#8892a4;margin-top:-6px;">
      <span><span style="display:inline-block;width:10px;height:10px;background:#4fc3f7;border-radius:2px;margin-right:5px;"></span>Maintenant</span>
      <span><span style="display:inline-block;width:12px;border-top:2px dashed #8892a4;margin-right:5px;vertical-align:middle;"></span>Il y a ${jours} jours</span>
      <span>bord = niveau Diamant</span></div>`;
}
function nvLegendeHtml() {
  return NV_RANGS.map((r, i) => `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;margin:2px 8px 2px 0;"><span style="width:10px;height:10px;border-radius:3px;background:${NV_COULEURS[i]};"></span>${r}</span>`).join('')
    + `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;"><span style="width:10px;height:10px;border-radius:3px;background:#2a2f3f;"></span>pas de données</span>`;
}

// Avatar 3D (three.js chargé à la demande depuis un CDN) : mannequin musclé fait de formes, une zone par groupe, colorée selon le
// niveau ; les zones qui ont PROGRESSÉ sur la période pulsent doucement. Rotation lente automatique, orientable au doigt/souris
// (reprise seule après 2 s), clic sur une zone = son nom et son niveau. opts : { jours, infoId }.
let _nv3d = null;
async function nv3dMonter(cont, res, avant, opts) {
  opts = opts || {};
  if (!cont) return;
  if (_nv3d) { _nv3d.stop = true; _nv3d = null; }
  let THREE;
  try { THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'); }
  catch (e) { cont.innerHTML = '<div style="padding:30px;text-align:center;color:#8892a4;font-size:12px;">Avatar 3D indisponible hors connexion.</div>'; return; }
  const l = cont.clientWidth || 340, h = Math.round(l * 1.12);
  cont.style.height = h + 'px';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(l, h);
  cont.innerHTML = ''; cont.appendChild(renderer.domElement); renderer.domElement.style.touchAction = 'pan-y'; renderer.domElement.style.cursor = 'grab';
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, l / h, 0.1, 50); cam.position.set(0, 0.92, 3.55); cam.lookAt(0, 0.9, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.15); d1.position.set(2, 3, 3); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x8899ff, 0.55); d2.position.set(-3, 1, -2); scene.add(d2);
  const corps = new THREE.Group(); scene.add(corps);
  const sol = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshBasicMaterial({ color: 0x1b2030 })); sol.rotation.x = -Math.PI / 2; sol.position.y = -0.005; scene.add(sol);
  const matNeutre = new THREE.MeshStandardMaterial({ color: 0x2a3042, roughness: 0.7 });
  const zonesMeshes = [], pulses = [], matCache = {};
  const matZone = id => {
    if (matCache[id]) return matCache[id];
    const d = res.zones[id], col = d ? new THREE.Color(nvCouleur(d.niv)) : new THREE.Color(0x303650);
    const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.42, metalness: 0.12, emissive: d ? col : new THREE.Color(0x000000), emissiveIntensity: d ? 0.16 : 0 });
    if (nvZoneProgresse(res, avant, id)) pulses.push(m);
    return (matCache[id] = m);
  };
  const ell = (zone, x, y, z, sx, sy, sz, rz = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), zone ? matZone(zone) : matNeutre);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.z = rz; m.rotation.x = rx; if (zone) { m.userData.zone = zone; zonesMeshes.push(m); } corps.add(m); return m; };
  const capsule = (x, y, z, r, len, rz = 0) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), matNeutre); m.position.set(x, y, z); m.rotation.z = rz; corps.add(m); return m; };
  ell(null, 0, 1.73, 0.005, 0.1, 0.12, 0.11); capsule(0, 1.58, 0, 0.048, 0.06);
  ell(null, 0, 1.34, 0, 0.21, 0.2, 0.108); ell(null, 0, 1.12, 0, 0.155, 0.14, 0.092); ell(null, 0, 0.97, 0, 0.17, 0.1, 0.1);
  [-1, 1].forEach(c => {
    ell('pecs', c * 0.1, 1.38, 0.085, 0.108, 0.08, 0.052, c * -0.12);
    ell('abdos', c * 0.125, 1.13, 0.045, 0.032, 0.095, 0.045);
    ell('epaules', c * 0.225, 1.45, 0.03, 0.058, 0.07, 0.058); ell('epaules', c * 0.245, 1.44, -0.005, 0.06, 0.07, 0.058);
    ell('delt_ar', c * 0.225, 1.445, -0.05, 0.056, 0.065, 0.05);
    ell('lats', c * 0.135, 1.26, -0.088, 0.085, 0.17, 0.05, c * 0.25);
    ell('lombaires', c * 0.042, 1.03, -0.09, 0.036, 0.1, 0.04);
    capsule(c * 0.28, 1.24, 0, 0.04, 0.2, c * 0.07);
    ell('biceps', c * 0.283, 1.26, 0.032, 0.045, 0.1, 0.042); ell('triceps', c * 0.283, 1.26, -0.042, 0.048, 0.11, 0.045);
    ell(null, c * 0.305, 1.0, 0.01, 0.04, 0.12, 0.04, c * 0.06); capsule(c * 0.325, 0.82, 0.015, 0.03, 0.06, c * 0.06); ell(null, c * 0.33, 0.76, 0.02, 0.04, 0.05, 0.03);
    ell('fessiers', c * 0.088, 0.93, -0.088, 0.095, 0.1, 0.095);
    capsule(c * 0.095, 0.71, 0, 0.058, 0.3); ell(null, c * 0.092, 0.43, 0.01, 0.05, 0.05, 0.05);
    ell('quadris', c * 0.092, 0.74, 0.066, 0.042, 0.2, 0.046); ell('quadris', c * 0.138, 0.71, 0.036, 0.046, 0.19, 0.052, c * -0.04); ell('quadris', c * 0.066, 0.58, 0.056, 0.04, 0.1, 0.042);
    ell('ischios', c * 0.118, 0.71, -0.058, 0.046, 0.19, 0.05); ell('ischios', c * 0.07, 0.71, -0.062, 0.04, 0.19, 0.046);
    capsule(c * 0.092, 0.24, 0, 0.04, 0.3);
    ell('mollets', c * 0.112, 0.3, -0.03, 0.036, 0.125, 0.046); ell('mollets', c * 0.072, 0.3, -0.03, 0.036, 0.125, 0.046);
    ell(null, c * 0.092, 0.03, 0.045, 0.05, 0.03, 0.095);
  });
  ell('traps', 0, 1.51, -0.058, 0.14, 0.07, 0.05); ell('traps', 0, 1.38, -0.098, 0.1, 0.1, 0.035);
  [0, 1, 2, 3].forEach(r => [-1, 1].forEach(c => ell('abdos', c * 0.034, 1.23 - r * 0.052, 0.098 - r * 0.004, 0.03, 0.022, 0.02)));
  corps.rotation.y = 0.5;
  const rc = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let drag = null, dernierGeste = 0, deplace = false;
  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', e => { drag = { x: e.clientX, ry: corps.rotation.y }; deplace = false; dom.setPointerCapture(e.pointerId); dom.style.cursor = 'grabbing'; });
  dom.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) deplace = true; corps.rotation.y = drag.ry + dx * 0.012; dernierGeste = performance.now(); });
  dom.addEventListener('pointerup', e => {
    dom.style.cursor = 'grab'; drag = null; dernierGeste = performance.now();
    if (deplace) return;
    const r = dom.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ptr, cam); const hit = rc.intersectObjects(zonesMeshes)[0];
    const info = document.getElementById(opts.infoId || 'nvZoneInfo'); if (!info) return;
    if (!hit) { info.textContent = 'Touche une zone du corps pour voir son niveau.'; return; }
    const z = hit.object.userData.zone, d = res.zones[z];
    const fleche = nvZoneProgresse(res, avant, z) ? ` <span style="color:#1D9E75;">▲ progression sur ${opts.jours || 30} jours</span>` : '';
    info.innerHTML = d ? `<b>${NV_ZONE_NOM[z] || z}</b> — ${d.etalon ? nvRang(d.niv) + ' · ' + _nvEsc(d.src.nom) : '+' + Math.round(d.src.prog) + ' % · ' + _nvEsc(d.src.nom)}${fleche}` : `<b>${NV_ZONE_NOM[z] || z}</b> — pas encore de données`;
  });
  const etat = { stop: false }; _nv3d = etat;
  (function boucle(t) {
    if (etat.stop || !cont.isConnected) { renderer.dispose(); return; }
    if (!drag && performance.now() - dernierGeste > 2000) corps.rotation.y += 0.006;
    const k = 0.42 + 0.3 * Math.sin((t || 0) / 380);
    pulses.forEach(m => { m.emissiveIntensity = k; });
    renderer.render(scene, cam); requestAnimationFrame(boucle);
  })();
}
