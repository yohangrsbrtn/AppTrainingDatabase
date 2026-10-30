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
    const debut = e.sets.filter(x => x.ordre <= e.sets[0].ordre + 3).slice(0, 30); // départ = les 4 premières semaines
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

// Avatar anatomique 2D, de face et de dos : chaque muscle est coloré selon le niveau de sa zone ; les zones qui ont PROGRESSÉ sur la
// période pulsent. Toucher une zone = son nom et son niveau. opts : { jours, infoId }.
// Tracés des silhouettes : react-body-highlighter (MIT, © 2020 GV79) — https://github.com/giavinh79/react-body-highlighter
const NV_CORPS = {"f":[["pecs","chest",["51.8367347 41.6326531 51.0204082 55.1020408 57.9591837 57.9591837 67.755102 55.5102041 70.6122449 47.3469388 62.0408163 41.6326531","29.7959184 46.5306122 31.4285714 55.5102041 40.8163265 57.9591837 48.1632653 55.1020408 47.755102 42.0408163 37.5510204 42.0408163"]],["abdos","obliques",["68.5714286 63.2653061 67.3469388 57.1428571 58.7755102 59.5918367 60 64.0816327 60.4081633 83.2653061 65.7142857 78.7755102 66.5306122 69.7959184","33.877551 78.3673469 33.0612245 71.8367347 31.0204082 63.2653061 32.244898 57.1428571 40.8163265 59.1836735 39.1836735 63.2653061 39.1836735 83.6734694"]],["abdos","abs",["56.3265306 59.1836735 57.9591837 64.0816327 58.3673469 77.9591837 58.3673469 92.6530612 56.3265306 98.3673469 55.1020408 104.081633 51.4285714 107.755102 51.0204082 84.4897959 50.6122449 67.3469388 51.0204082 57.1428571","43.6734694 58.7755102 48.5714286 57.1428571 48.9795918 67.3469388 48.5714286 84.4897959 48.1632653 107.346939 44.4897959 103.673469 40.8163265 91.4285714 40.8163265 78.3673469 41.2244898 64.4897959"]],["biceps","biceps",["16.7346939 68.1632653 17.9591837 71.4285714 22.8571429 66.122449 28.9795918 53.877551 27.755102 49.3877551 20.4081633 55.9183673","71.4285714 49.3877551 70.2040816 54.6938776 76.3265306 66.122449 81.6326531 71.8367347 82.8571429 68.9795918 78.7755102 55.5102041"]],["triceps","triceps",["69.3877551 55.5102041 69.3877551 61.6326531 75.9183673 72.6530612 77.5510204 70.2040816 75.5102041 67.3469388","22.4489796 69.3877551 29.7959184 55.5102041 29.7959184 60.8163265 22.8571429 73.0612245"]],["","neck",["55.5102041 23.6734694 50.6122449 33.4693878 50.6122449 39.1836735 61.6326531 40 70.6122449 44.8979592 69.3877551 36.7346939 63.2653061 35.1020408 58.3673469 30.6122449","28.9795918 44.8979592 30.2040816 37.1428571 36.3265306 35.1020408 41.2244898 30.2040816 44.4897959 24.4897959 48.9795918 33.877551 48.5714286 39.1836735 37.9591837 39.5918367"]],["epaules","front-deltoids",["78.3673469 53.0612245 79.5918367 47.755102 79.1836735 41.2244898 75.9183673 37.9591837 71.0204082 36.3265306 72.244898 42.8571429 71.4285714 47.3469388","28.1632653 47.3469388 21.2244898 53.0612245 20 47.755102 20.4081633 40.8163265 24.4897959 37.1428571 28.5714286 37.1428571 26.9387755 43.2653061"]],["","head",["42.4489796 2.85714286 40 11.8367347 42.0408163 19.5918367 46.122449 23.2653061 49.7959184 25.3061224 54.6938776 22.4489796 57.5510204 19.1836735 59.1836735 10.2040816 57.1428571 2.44897959 49.7959184 0"]],["","abductors",["52.6530612 110.204082 54.2857143 124.897959 60 110.204082 62.0408163 100 64.8979592 94.2857143 60 92.6530612 56.7346939 104.489796","47.755102 110.612245 44.8979592 125.306122 42.0408163 115.918367 40.4081633 113.061224 39.5918367 107.346939 37.9591837 102.44898 34.6938776 93.877551 39.5918367 92.244898 41.6326531 99.1836735 43.6734694 105.306122"]],["quadris","quadriceps",["34.6938776 98.7755102 37.1428571 108.163265 37.1428571 127.755102 34.2857143 137.142857 31.0204082 132.653061 29.3877551 120 28.1632653 111.428571 29.3877551 100.816327 32.244898 94.6938776","63.2653061 105.714286 64.4897959 100 66.9387755 94.6938776 70.2040816 101.22449 71.0204082 111.836735 68.1632653 133.061224 65.3061224 137.55102 62.4489796 128.571429 62.0408163 111.428571","38.7755102 129.387755 38.3673469 112.244898 41.2244898 118.367347 44.4897959 129.387755 42.8571429 135.102041 40 146.122449 36.3265306 146.530612 35.5102041 140","59.5918367 145.714286 55.5102041 128.979592 60.8163265 113.877551 61.2244898 130.204082 64.0816327 139.591837 62.8571429 146.530612","32.6530612 138.367347 26.5306122 145.714286 25.7142857 136.734694 25.7142857 127.346939 26.9387755 114.285714 29.3877551 133.469388","71.8367347 113.061224 73.877551 124.081633 73.877551 140.408163 72.6530612 145.714286 66.5306122 138.367347 70.2040816 133.469388"]],["","knees",["33.877551 140 34.6938776 143.265306 35.5102041 147.346939 36.3265306 151.020408 35.1020408 156.734694 29.7959184 156.734694 27.3469388 152.653061 27.3469388 147.346939 30.2040816 144.081633","65.7142857 140 72.244898 147.755102 72.244898 152.244898 69.7959184 157.142857 64.8979592 156.734694 62.8571429 151.020408"]],["mollets","calves",["71.4285714 160.408163 73.4693878 153.469388 76.7346939 161.22449 79.5918367 167.755102 78.3673469 187.755102 79.5918367 195.510204 74.6938776 195.510204","24.8979592 194.693878 27.755102 164.897959 28.1632653 160.408163 26.122449 154.285714 24.8979592 157.55102 22.4489796 161.632653 20.8163265 167.755102 22.0408163 188.163265 20.8163265 195.510204","72.6530612 195.102041 69.7959184 159.183673 65.3061224 158.367347 64.0816327 162.44898 64.0816327 165.306122 65.7142857 177.142857","35.5102041 158.367347 35.9183673 162.44898 35.9183673 166.938776 35.1020408 172.244898 35.1020408 176.734694 32.244898 182.040816 30.6122449 187.346939 26.9387755 194.693878 27.3469388 187.755102 28.1632653 180.408163 28.5714286 175.510204 28.9795918 169.795918 29.7959184 164.081633 30.2040816 158.77551"]],["","forearm",["6.12244898 88.5714286 10.2040816 75.1020408 14.6938776 70.2040816 16.3265306 74.2857143 19.1836735 73.4693878 4.48979592 97.5510204 0 100","84.4897959 69.7959184 83.2653061 73.4693878 80 73.0612245 95.1020408 98.3673469 100 100.408163 93.4693878 89.3877551 89.7959184 76.3265306","77.5510204 72.244898 77.5510204 77.5510204 80.4081633 84.0816327 85.3061224 89.7959184 92.244898 101.22449 94.6938776 99.5918367","6.93877551 101.22449 13.4693878 90.6122449 18.7755102 84.0816327 21.6326531 77.1428571 21.2244898 71.8367347 4.89795918 98.7755102"]]],"d":[["","head",["50.6382979 0 45.9574468 0.85106383 40.8510638 5.53191489 40.4255319 12.7659574 45.106383 20 55.7446809 20 59.1489362 13.6170213 59.5744681 4.68085106 55.7446809 1.27659574"]],["traps","trapezius",["44.6808511 21.7021277 47.6595745 21.7021277 47.2340426 38.2978723 47.6595745 64.6808511 38.2978723 53.1914894 35.3191489 40.8510638 31.0638298 36.5957447 39.1489362 33.1914894 43.8297872 27.2340426","52.3404255 21.7021277 55.7446809 21.7021277 56.5957447 27.2340426 60.8510638 32.7659574 68.9361702 36.5957447 64.6808511 40.4255319 61.7021277 53.1914894 52.3404255 64.6808511 53.1914894 38.2978723"]],["delt_ar","back-deltoids",["29.3617021 37.0212766 22.9787234 39.1489362 17.4468085 44.2553191 18.2978723 53.6170213 24.2553191 49.3617021 27.2340426 46.3829787","71.0638298 37.0212766 78.2978723 39.5744681 82.5531915 44.6808511 81.7021277 53.6170213 74.893617 48.9361702 72.3404255 45.106383"]],["lats","upper-back",["31.0638298 38.7234043 28.0851064 48.9361702 28.5106383 55.3191489 34.0425532 75.3191489 47.2340426 71.0638298 47.2340426 66.3829787 36.5957447 54.0425532 33.6170213 41.2765957","68.9361702 38.7234043 71.9148936 49.3617021 71.4893617 56.1702128 65.9574468 75.3191489 52.7659574 71.0638298 52.7659574 66.3829787 63.4042553 54.4680851 66.3829787 41.7021277"]],["triceps","triceps",["26.8085106 49.787234 17.8723404 55.7446809 14.4680851 72.3404255 16.5957447 81.7021277 21.7021277 63.8297872 26.8085106 55.7446809","73.6170213 50.212766 82.1276596 55.7446809 85.9574468 73.1914894 83.4042553 82.1276596 77.8723404 62.9787234 73.1914894 55.7446809","26.8085106 58.2978723 26.8085106 68.5106383 22.9787234 75.3191489 19.1489362 77.4468085 22.5531915 65.5319149","72.7659574 58.2978723 77.0212766 64.6808511 80.4255319 77.4468085 76.5957447 75.3191489 72.7659574 68.9361702"]],["lombaires","lower-back",["47.6595745 72.7659574 34.4680851 77.0212766 35.3191489 83.4042553 49.3617021 102.12766 46.8085106 82.9787234","52.3404255 72.7659574 65.5319149 77.0212766 64.6808511 83.4042553 50.6382979 102.12766 53.1914894 83.8297872"]],["","forearm",["86.3829787 75.7446809 91.0638298 83.4042553 93.1914894 94.0425532 100 106.382979 96.1702128 104.255319 88.0851064 89.3617021 84.2553191 83.8297872","13.6170213 75.7446809 8.93617021 83.8297872 6.80851064 93.6170213 0 106.382979 3.82978723 104.255319 12.3404255 88.5106383 15.7446809 82.9787234","81.2765957 79.5744681 77.4468085 77.8723404 79.1489362 84.6808511 91.0638298 103.829787 93.1914894 108.93617 94.4680851 104.680851","18.7234043 79.5744681 22.1276596 77.8723404 20.8510638 84.2553191 9.36170213 102.978723 6.80851064 108.510638 5.10638298 104.680851"]],["fessiers","gluteal",["44.6808511 99.5744681 30.212766 108.510638 29.787234 118.723404 31.4893617 125.957447 47.2340426 121.276596 49.3617021 114.893617","55.3191489 99.1489362 51.0638298 114.468085 52.3404255 120.851064 68.0851064 125.957447 69.787234 119.148936 69.3617021 108.510638"]],["","adductor",["48.0851064 122.978723 44.6808511 122.978723 41.2765957 125.531915 45.106383 144.255319 48.5106383 135.744681 48.9361702 129.361702","51.9148936 122.553191 55.7446809 123.404255 59.1489362 125.957447 54.893617 144.255319 51.9148936 136.170213 51.0638298 129.361702"]],["ischios","hamstring",["28.9361702 122.12766 31.0638298 129.361702 36.5957447 125.957447 35.3191489 135.319149 34.4680851 150.212766 29.3617021 158.297872 28.9361702 146.808511 27.6595745 141.276596 27.2340426 131.489362","71.4893617 121.702128 69.3617021 128.93617 63.8297872 125.957447 65.5319149 136.595745 66.3829787 150.212766 71.0638298 158.297872 71.4893617 147.659574 72.7659574 142.12766 73.6170213 131.914894","38.7234043 125.531915 44.2553191 145.957447 40.4255319 166.808511 36.1702128 152.765957 37.0212766 135.319149","61.7021277 125.531915 63.4042553 136.170213 64.2553191 153.191489 60 166.808511 56.1702128 146.382979"]],["","knees",["34.4680851 153.191489 31.0638298 159.148936 33.6170213 166.382979 37.4468085 162.553191","66.3829787 153.617021 62.9787234 162.978723 66.8085106 166.382979 69.3617021 159.148936"]],["mollets","calves",["29.3617021 160.425532 28.5106383 167.234043 24.6808511 179.574468 23.8297872 192.765957 25.5319149 197.021277 28.5106383 193.191489 29.787234 180 31.9148936 171.06383 31.9148936 166.808511","37.4468085 165.106383 35.3191489 167.659574 33.1914894 171.914894 31.0638298 180.425532 30.212766 191.914894 34.0425532 200 38.7234043 190.638298 39.1489362 168.93617","62.9787234 165.106383 61.2765957 168.510638 61.7021277 190.638298 66.3829787 199.574468 70.6382979 191.914894 68.9361702 179.574468 66.8085106 170.212766","70.6382979 160.425532 72.3404255 168.510638 75.7446809 179.148936 76.5957447 192.765957 74.4680851 196.595745 72.3404255 193.617021 70.6382979 179.574468 68.0851064 168.085106"]],["mollets","left-soleus",["28.5106383 195.744681 30.212766 195.744681 33.6170213 201.702128 30.6382979 220 28.5106383 213.617021 26.8085106 198.297872"]],["mollets","right-soleus",["69.787234 195.744681 71.9148936 195.744681 73.6170213 198.297872 71.9148936 213.191489 70.212766 219.574468 67.2340426 202.12766"]]]};
function nvAvatarMonter(cont, res, avant, opts) {
  opts = opts || {};
  if (!cont) return;
  const peau = '#2a3042', contour = '#12151f';
  const fig = (cle, titre) => {
    const polys = NV_CORPS[cle].map(([z, nom, pts]) => {
      const d = z && res.zones[z], col = d ? nvCouleur(d.niv) : peau, prog = z && nvZoneProgresse(res, avant, z);
      return pts.map(p => `<polygon points="${p}" fill="${z ? col : peau}" stroke="${contour}" stroke-width=".35" ${z ? `data-z="${z}" style="cursor:pointer;"` : ''} ${prog ? 'class="nv-pulse"' : ''}/>`).join('');
    }).join('');
    return `<div style="flex:1;text-align:center;min-width:0;"><svg viewBox="0 0 100 200" style="width:100%;max-height:440px;display:block;">${polys}</svg><div style="font-size:11px;color:#8892a4;margin-top:4px;">${titre}</div></div>`;
  };
  cont.style.height = 'auto'; cont.style.minHeight = '0';
  cont.innerHTML = `<style>@keyframes nvp{0%,100%{opacity:1}50%{opacity:.55}}.nv-pulse{animation:nvp 1.6s ease-in-out infinite}</style><div style="display:flex;gap:6px;width:100%;">${fig('f', 'Face')}${fig('d', 'Dos')}</div>`;
  cont.addEventListener('click', e => {
    const info = document.getElementById(opts.infoId || 'nvZoneInfo'); if (!info) return;
    const z = e.target.getAttribute && e.target.getAttribute('data-z');
    if (!z) { info.textContent = 'Touche une zone du corps pour voir son niveau.'; return; }
    const dz = res.zones[z];
    const fleche = nvZoneProgresse(res, avant, z) ? ` <span style="color:#1D9E75;">▲ progression sur ${opts.jours || 30} jours</span>` : '';
    info.innerHTML = dz ? `<b>${NV_ZONE_NOM[z] || z}</b> — ${dz.etalon ? nvRang(dz.niv) + ' · ' + _nvEsc(dz.src.nom) : nvRang(dz.niv) + ' · ' + _nvEsc(dz.src.nom)}${fleche}` : `<b>${NV_ZONE_NOM[z] || z}</b> — pas encore de données`;
  });
}
