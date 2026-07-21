const GAS_URL = 'https://script.google.com/macros/s/AKfycbwQiM6ixf-CTIWwcuNHoosFbvrDzWmC056yRUGhTaWv0Nwxbm0dLeK3d5QVgqmS7P9G7A/exec';

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
