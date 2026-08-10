const CACHE = 'apptrainingdatabase-v5';
const ASSETS = ['/AppTrainingDatabase/', '/AppTrainingDatabase/index.html', '/AppTrainingDatabase/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Ne jamais intercepter les requêtes externes (Open Food Facts, Supabase...)
  // — le SW n'a rien à mettre en cache là-dessus, et l'interception peut
  // provoquer un "Failed to fetch" ponctuel au premier appel juste après
  // (ré)activation du SW (vécu : 1ère recherche OFF échoue, la 2e passe).
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // Les pages HTML (index.html, console.html) ne doivent JAMAIS être servies
  // depuis le cache HTTP local — une PWA installée sur écran d'accueil iOS
  // peut sinon rester bloquée sur une ancienne version pendant longtemps,
  // même après fermeture complète de l'app (vécu : mises à jour invisibles
  // malgré plusieurs relances, corrigé uniquement en supprimant/réajoutant
  // l'icône). "no-store" force une requête réseau fraîche à chaque ouverture.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'AppTraining', body: '' };
  const isChrono = data.tag === 'chrono';
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/AppTrainingDatabase/icons/icon-192.png',
    badge: '/AppTrainingDatabase/icons/icon-192.png',
    tag: data.tag || '',
    vibrate: isChrono ? [300, 100, 300, 100, 300, 100, 500] : [200, 100, 200],
    data: data.data || {}
  }));
});

// Au clic sur une notification poussée : ouvre/focus l'app ET affiche
// directement le panneau de notifications (au lieu de juste revenir à
// l'accueil).
//
// Si une fenêtre de l'app est déjà ouverte, on tente d'abord un postMessage
// (voir le listener 'message' dans index.html) pour ouvrir le panneau sans
// perdre son état en cours. Mais sur iOS, une PWA standalone mise en arrière-
// plan peut être suspendue par le système : focus() ramène alors l'app au
// premier plan tout en affichant l'image figée d'avant la mise en veille
// (écran blanc/figé constaté), car le postMessage n'est traité qu'une fois le
// JS réellement réveillé, ce qui n'arrive pas toujours. Pour garantir un
// écran qui répond, on force en plus une navigation fraîche de cette fenêtre
// (perd l'état en cours, mais jamais de gel) plutôt que de se fier uniquement
// au focus.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const ouvrirNotifs = !!(e.notification.data && e.notification.data.openNotifs);
  // Deep-link : si la notification cible une page précise (ex: "roadmap", posée
  // par le coach depuis la fiche client → Roadmap → 🔔 Notifier), on y amène le
  // client directement plutôt que juste ouvrir le panneau de notifications.
  const page = e.notification.data && e.notification.data.page;
  // semaine/seanceId (optionnels, chrono repos) : en plus de la page, ramène le client
  // exactement sur la séance/semaine d'où le chrono a été lancé (voir send-push/index.ts et
  // pcDemarrerChrono/programme-client.js) — jamais reconstitué depuis un statut
  // complet/incomplet, une séance déjà validée peut être re-remplie.
  const semaine = e.notification.data && e.notification.data.semaine;
  const seanceId = e.notification.data && e.notification.data.seanceId;
  let targetUrl = '/AppTrainingDatabase/';
  if (page) {
    const params = new URLSearchParams({ openPage: page });
    if (seanceId != null) { params.set('semaine', semaine || 1); params.set('seanceId', seanceId); }
    targetUrl += '?' + params.toString();
  } else if (ouvrirNotifs) {
    targetUrl += '?openNotif=1';
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      const existant = clientsArr.find(c => c.url.includes('/AppTrainingDatabase/'));
      if (existant) {
        if (page) existant.postMessage({ type: 'openPage', page, semaine, seanceId });
        else if (ouvrirNotifs) existant.postMessage({ type: 'openNotifs' });
        return existant.focus().then(c => c.navigate ? c.navigate(targetUrl) : c);
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
