// Работа без сети. Сначала сеть, кэш — только запасной: так телефон не застревает
// на старой версии приложения. Запросы к серверу Планера не кэшируются.
const RELEASE = 48;
const CACHE = `planner-v${RELEASE}`;
const SHELL = [
  './', 'index.html', 'css/game-tokens.css', 'css/app.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/store.js', 'js/db.js', 'js/sync.js', 'js/auth.js', 'js/config.js', 'js/wheel.js', 'js/errors.js', 'js/update.js', 'js/password-eye.js',
  'js/views/wheel.js', 'js/views/day.js', 'js/views/quantum.js', 'js/views/money.js', 'js/profile.js',
  'css/space.css',
  'js/views/space/index.js', 'js/views/space/app.js', 'js/views/space/config.js',
  'js/views/space/audio.js', 'js/views/space/photos.js',
  'js/views/space/notifications.js', 'js/views/space/scene.js', 'js/views/space/template.js',
  'js/vendor/three.min.js',
  'admin.html', 'css/admin.css', 'js/admin.js',
  'js/core/access-controller.js', 'js/core/reminders.js', 'js/core/live-update.js',
  'js/core/money.js', 'js/core/media.js', 'js/core/calendar.js', 'js/core/dates.js', 'js/core/calc.js', 'js/core/session.js', 'js/core/diary.js', 'js/core/i18n.js', 'js/core/quantum.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('planner-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* СВОИ ФАЙЛЫ БЕРЁМ С ПРОВЕРКОЙ У СЕРВЕРА.

   Обычный fetch отдаёт файл из браузерного кэша, не спрашивая сервер. GitHub
   Pages держит статику десять минут — и всё это время браузер мог вернуть
   новый admin.html вместе со старым admin.js. Разметка от новой выкладки,
   код от старой: кнопка есть, обработчика нет, экран не открывается. Так и
   случилось после выкладки 27.

   cache: 'no-cache' не значит «не кэшировать»: файл по-прежнему хранится, но
   перед выдачей браузер спрашивает сервер отпечатком (ETag). Не изменился —
   приходит пустой ответ 304 и файл берётся с диска. Лишнего трафика это почти
   не добавляет, зато смеси версий больше не бывает.

   Нет сети — ответ придёт из запаса, как и раньше. */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  /* Запрос пересобираем по адресу, а не копированием: у перехода по ссылке
     режим navigate, и копия с другими настройками кэша для него недопустима —
     браузер отверг бы её. По адресу же получается обычный запрос, ответ на
     который подходит и для перехода. */
  const fresh = new Request(event.request.url, {
    cache: 'no-cache', credentials: 'same-origin', headers: event.request.headers
  });
  event.respondWith(fetch(fresh)
    .then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
      }
      return res;
    })
    .catch(() => caches.match(event.request, { ignoreSearch: true })));
});
