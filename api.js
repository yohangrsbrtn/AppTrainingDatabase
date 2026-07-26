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
