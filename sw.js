const CACHE = 'apptrainingdatabase-v4';
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
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/AppTrainingDatabase/icons/icon-192.png',
    badge: '/AppTrainingDatabase/icons/icon-192.png'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      const existant = clientsArr.find(c => c.url.includes('/AppTrainingDatabase/'));
      if (existant) return existant.focus();
      return self.clients.openWindow('/AppTrainingDatabase/');
    })
  );
});
