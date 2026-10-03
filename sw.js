// Работа без сети. Сначала сеть, кэш — только запасной: так телефон не застревает
// на старой версии приложения. Запросы к серверу Планера не кэшируются.
const RELEASE = 26;
const CACHE = `planner-v${RELEASE}`;
const SHELL = [
  './', 'index.html', 'css/game-tokens.css', 'css/app.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/store.js', 'js/db.js', 'js/sync.js', 'js/auth.js', 'js/config.js', 'js/wheel.js', 'js/errors.js', 'js/update.js', 'js/password-eye.js',
  'js/views/wheel.js', 'js/views/day.js', 'js/views/quantum.js', 'js/profile.js',
  'admin.html', 'css/admin.css', 'js/admin.js',
  'js/core/dates.js', 'js/core/calc.js', 'js/core/session.js', 'js/core/diary.js', 'js/core/i18n.js', 'js/core/quantum.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('planner-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(fetch(event.request)
    .then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
      }
      return res;
    })
    .catch(() => caches.match(event.request, { ignoreSearch: true })));
});
