const GAS_URL = 'https://script.google.com/macros/s/AKfycbxUJYMKEuiQBRJMoKjg0GFpjorP34ruph5pjb_5fYB-6Xab48R0nrRS7p0gTqeHukDQeQ/exec';

function getToken()  { return localStorage.getItem('at_token')  || ''; }
function getClient() { return localStorage.getItem('at_client') || ''; }

// Quand le coach navigue en "vue client", toutes les requêtes api() utilisent ce client
let _viewAsClientOverride = null;

async function api(action, params = {}) {
  const clientId = (_viewAsClientOverride != null) ? _viewAsClientOverride : getClient();
  const body = { action, token: getToken(), client: clientId, params };
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'erreur_api');
  return json.data;
}

// Pour le coach : même chose mais avec un client cible différent
async function apiAs(action, clientId, params = {}) {
  const body = { action, token: getToken(), client: clientId, params };
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'erreur_api');
  return json.data;
}

// chargerBilan et chargerJourneeEnCours appellent toutes les deux etendreBilan()
// côté serveur — ne JAMAIS les laisser tourner en parallèle (ça fait planter la
// feuille Bilan). Tout appel à l'une des deux passe par cette file d'attente
// commune, qui les sérialise quel que soit l'endroit d'où elles sont déclenchées
// (accueil, préchargement, page Bilan, validation de séance...).
let _etendreBilanQueue = Promise.resolve();
function apiEtendreBilan(action, params = {}) {
  const run = () => api(action, params);
  const result = _etendreBilanQueue.then(run, run);
  _etendreBilanQueue = result.then(() => {}, () => {});
  return result;
}

function isSupabase() { return localStorage.getItem('at_auth_mode') === 'supabase'; }

const SUPABASE_URL      = 'https://sfacjbwiczwkcjpwneyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYWNqYndpY3p3a2NqcHduZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjgzNTAsImV4cCI6MjEwMDIwNDM1MH0.mrjPbOuQROMihzxZWrUNbncQIos0jK2VexpQDoRZXzY';
function supaHeaders(extra) {
  return Object.assign({ apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, extra || {});
}

// ── Semaine de bilan — source unique partagée client (bilan.js) + coach
// (console.html). Une semaine de bilan se termine le jour assigné au client
// (client_profils.jour_bilan) et non un calendaire lundi-dimanche : un
// jour_bilan='Mercredi' donne des semaines jeudi→mercredi. Sans jour_bilan
// renseigné, on retombe sur dimanche (comportement calendaire précédent).
const _JOURS_IDX_FR = { Lundi:0, Mardi:1, Mercredi:2, Jeudi:3, Vendredi:4, Samedi:5, Dimanche:6 };

function _bilanWeekBounds(jourBilanNom, refDate) {
  refDate = refDate || new Date();
  const cibleIdx = (jourBilanNom && jourBilanNom in _JOURS_IDX_FR) ? _JOURS_IDX_FR[jourBilanNom] : 6;
  const curIdx   = (refDate.getDay() + 6) % 7; // Lundi=0...Dimanche=6
  const delta    = (cibleIdx - curIdx + 7) % 7; // jours jusqu'à la prochaine occurrence (0 = aujourd'hui)
  const fin = new Date(refDate);
  fin.setDate(refDate.getDate() + delta);
  fin.setHours(23, 59, 59, 999);
  const debut = new Date(fin);
  debut.setDate(fin.getDate() - 6);
  debut.setHours(0, 0, 0, 0);
  return { debut, fin };
}

// Ponctuel = envoyé au plus tard le jour de bilan assigné (client_profils.jour_bilan),
// avant midi — envoyer plus tôt dans la semaine est toujours ponctuel, envoyer ce
// jour-là après midi ou un jour plus tard ne l'est pas. Sans jour assigné, toujours
// ponctuel (pas de pénalité pour un réglage non fait). Les bilans migrés depuis GAS
// n'ont pas d'heure exacte (envoye_at) — on retombe sur la date à midi pile, ni
// pénalisé ni avantagé.
function _bilanEstPonctuel(bilanCreatedAt, envoyeAtStr, jourBilanNom) {
  if (!jourBilanNom || !(jourBilanNom in _JOURS_IDX_FR) || !bilanCreatedAt || !envoyeAtStr) return true;
  const { fin } = _bilanWeekBounds(jourBilanNom, new Date(bilanCreatedAt));
  const limite = new Date(fin);
  limite.setHours(12, 0, 0, 0);
  return new Date(envoyeAtStr) <= limite;
}

// ── Protocole chimie — moteur de calcul partagé coach (console.html) +
// client (protocole.js), même logique que le générateur Google Sheets
// (genererProtocole/genererPlanning) : totaux du cycle par molécule +
// planning semaine par semaine avec le dosage par prise.
function _protocoleCalculerMolecule(m, dureeSemaines) {
  const categorie      = m.categorie;
  const parJourSemaine = m.par_jour_semaine;
  const dosageProduit   = Number(m.dosage_produit) || 0;
  const dosagePrise     = Number(m.dosage_prise) || 0;
  const intervalle      = Number(m.intervalle) || 1;

  let semDebut, semFin, nbSemaines;
  if (categorie === 'GH') {
    semDebut = 1; semFin = dureeSemaines; nbSemaines = dureeSemaines;
  } else {
    semDebut   = parseInt(m.semaine_debut) || 1;
    semFin     = parseInt(m.semaine_fin) || semDebut;
    nbSemaines = semFin - semDebut + 1;
  }

  let totalMg = 0, doseParPrise = 0, nbInjParSem = 0, dosageHebdoMg = 0;
  let totalConverti = '', quantiteRequise = '';

  if (categorie === 'Injectable') {
    nbInjParSem = Math.round((7 / intervalle) * 10) / 10;
    const dosageParSem = parJourSemaine === 'Jour' ? dosagePrise * 7 : dosagePrise;
    totalMg = dosageParSem * nbSemaines;
    doseParPrise = dosageParSem / nbInjParSem;
    dosageHebdoMg = dosageParSem;
    if (dosageProduit > 0) {
      const totalMl = totalMg / dosageProduit;
      totalConverti = (Math.round(totalMl * 10) / 10) + ' ml';
      quantiteRequise = Math.ceil(totalMl / 10) + ' viale(s) 10ml';
    }
  } else if (categorie === 'Oral') {
    const dosageParJour = parJourSemaine === 'Semaine' ? dosagePrise / 7 : dosagePrise;
    totalMg = dosageParJour * 7 * nbSemaines;
    doseParPrise = dosageParJour;
    dosageHebdoMg = dosageParJour * 7;
    if (dosageProduit > 0) {
      const nbCp = Math.ceil(totalMg / dosageProduit);
      totalConverti = nbCp + ' cp';
      quantiteRequise = nbCp + ' comprimés';
    }
  } else if (categorie === 'GH') {
    const dosageParJour = parJourSemaine === 'Semaine' ? dosagePrise / 7 : dosagePrise;
    totalMg = dosageParJour * 7 * nbSemaines;
    doseParPrise = dosageParJour;
    dosageHebdoMg = dosageParJour * 7;
    totalConverti = Math.round(totalMg) + ' UI';
    if (dosageProduit > 0) quantiteRequise = Math.ceil(totalMg / dosageProduit) + ' flacon(s) de ' + dosageProduit + ' UI';
  }

  return Object.assign({}, m, {
    categorie, dosageProduit, dosagePrise, intervalle,
    semDebut, semFin, nbSemaines, nbInjParSem, doseParPrise,
    totalMg, totalConverti, quantiteRequise, dosageHebdoMg,
  });
}

// Texte affiché pour une molécule à la semaine `s` (1-based) — '—' si la
// molécule n'est pas active cette semaine-là (jamais le cas pour GH).
function _protocoleCalculerSemaine(mol, s) {
  if (mol.categorie !== 'GH' && (s < mol.semDebut || s > mol.semFin)) return '—';

  if (mol.categorie === 'Injectable') {
    const mlParInj = mol.dosageProduit > 0 ? Math.round((mol.doseParPrise / mol.dosageProduit) * 100) / 100 : 0;
    const intervalle = mol.intervalle;
    if (intervalle === 1)   return `${mlParInj}ml · quotidien`;
    if (intervalle === 3.5) return `${mlParInj}ml × 2x/sem`;
    if (intervalle === 7)   return `${mlParInj}ml × 1x/sem`;
    return `${mlParInj}ml/inj · E${intervalle}D`;
  }
  if (mol.categorie === 'Oral') {
    const nbCp = mol.dosageProduit > 0 ? Math.round(mol.doseParPrise / mol.dosageProduit * 10) / 10 : '';
    return nbCp ? `${nbCp}cp/j` : `${mol.doseParPrise}mg/j`;
  }
  if (mol.categorie === 'GH') return `${mol.doseParPrise}UI/j`;
  return '';
}

// Calcule le cycle complet (totaux par molécule + planning semaine par
// semaine avec statut passée/en cours/à venir) à partir d'un protocole
// `{ date_debut, duree_semaines }` et de ses molécules brutes (lignes
// client_protocole_molecules). Utilisé tel quel par console.html (coach,
// création/édition + preview) et protocole.js (client, lecture seule).
function _protocoleCalculer(protocole, molecules) {
  const dureeSemaines = parseInt(protocole.duree_semaines) || 12;
  const molsCalc = (molecules || []).map(m => _protocoleCalculerMolecule(m, dureeSemaines));

  const dateDebut = new Date(protocole.date_debut);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const semaines = [];
  for (let s = 1; s <= dureeSemaines; s++) {
    const dateS = new Date(dateDebut); dateS.setDate(dateDebut.getDate() + (s - 1) * 7);
    const dateFin = new Date(dateS); dateFin.setDate(dateS.getDate() + 6);
    dateS.setHours(0, 0, 0, 0); dateFin.setHours(0, 0, 0, 0);

    let statut = 'future';
    if (today > dateFin) statut = 'passee';
    else if (today >= dateS && today <= dateFin) statut = 'encours';

    semaines.push({
      numero: s, date: dateS, statut,
      doses: molsCalc.map(m => ({ nom: m.nom, texte: _protocoleCalculerSemaine(m, s) })),
    });
  }

  return { molecules: molsCalc, semaines };
}
