// Работа без сети. Файлы выкладки — из её запаса, сразу и всегда (выкладка 216); свежесть — новым работником,
// который ставит запас новой выкладки целиком. Запросы к серверу Планера не кэшируются.
const RELEASE = 240;
const CACHE = `planner-v${RELEASE}`;
const SHELL = [
  /* manifest.webmanifest отсюда убран вместе с самим файлом: сайт больше
     не предлагает поставить себя ярлыком-приложением — установка одна, и
     это настоящее приложение (см. пояснение в index.html). Строку нельзя
     было просто оставить: addAll падает целиком, если хоть один файл в
     списке отдаёт 404, и тогда перестал бы работать весь офлайн. */
  './', 'index.html', 'css/game-tokens.css', 'css/app.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  /* Манифест для компьютера и его скрипт. Манифеста для телефона в
     странице по-прежнему нет — этот подключается только настольным
     браузерам (js/pc-install.js). Оба файла обязаны существовать:
     addAll падает целиком, если хоть один отдаёт 404. */
  'manifest-pc.webmanifest', 'js/pc-install.js', 'js/core/pc-install-rules.js',
  'js/app.js', 'js/ios-home.js', 'manifest.webmanifest', 'js/store.js', 'js/db.js', 'js/sync.js', 'js/auth.js', 'js/config.js', 'js/wheel.js', 'js/errors.js', 'js/update.js', 'js/password-eye.js',
  'js/reminder-plan.js', 'js/support.js', 'js/views/cabinet-editor.js', 'css/cabinet-editor.css',
  // Окно «Установить виджет» (раздел 9.21): модуль, его стили и чистые правила с значками
  'js/widgets-ui.js', 'css/widgets.css', 'js/core/widgets.js', 'js/core/widget-icons.js', 'js/core/widget-pictures.js', 'js/core/desktop-widget-store.js', 'js/widget-picker.js',
  'widget-sheet.html', 'js/widget-sheet.js', 'css/widget-sheet.css',
  // Окно виджета на компьютере и общая отрисовка виджета (выкладка 150)
  'widget.html', 'js/widget-desktop.js', 'css/widget-desktop.css', 'js/core/widget-html.js',
  'js/views/wheel.js', 'js/views/day.js', 'js/views/quantum.js', 'js/views/quantum-sound.js', 'js/views/quantum-slit.js', 'js/views/money.js', 'js/profile.js',
  'css/space.css',
  'js/views/space/index.js', 'js/views/space/app.js', 'js/views/space/config.js',
  'js/views/space/audio.js', 'js/views/space/photos.js', 'js/views/space/chronicle-stats.js',
  'js/views/space/notifications.js', 'js/views/space/door-kinds/index.js', 'js/views/space/stats-span/index.js', 'js/views/space/audio-seek/index.js', 'js/views/space/door-save/index.js', 'js/views/space/scene.js', 'js/views/space/template.js',
  'js/vendor/three.min.js',
  // Свиток «Мудрость дня»: модуль целиком, с базой посланий — чтобы открывался без сети
  'js/views/scroll/index.js', 'js/views/scroll/engine.js', 'js/views/scroll/texts.js', 'js/views/scroll/wisdom.js',
  'js/views/scroll/predictions.json', 'js/views/scroll/scroll.css',
  'js/views/scroll/fonts/marck-script-cyrillic.woff2', 'js/views/scroll/fonts/marck-script-latin.woff2',
  // GoldenFit: плитка на главной (сам спорт — отдельный сайт со своим кэшем)
  'js/views/sport/index.js', 'js/views/sport/texts.js', 'js/views/sport/sport.css', 'js/views/sport/goldenfit.png',
  'js/views/woman/index.js', 'js/views/woman/texts.js', 'js/views/woman/gslwoman.png',
  'js/views/apps/access.js',
  'admin.html', 'css/admin.css', 'js/admin.js',
  'js/core/net.js', 'js/core/media-box.js', 'js/core/access-controller.js', 'js/core/reminders.js', 'js/core/reminder-rules.js', 'js/core/observer-clock.js', 'js/core/live-update.js',
  'js/core/push.js', 'js/core/money.js', 'js/core/media.js', 'js/core/calendar.js', 'js/core/dates.js', 'js/core/calc.js', 'js/core/session.js', 'js/core/diary.js', 'js/core/i18n.js', 'js/core/quantum.js',
  // Без этих модулей страница без сети не запускалась: один не найденный модуль останавливает все (замок — test/oflayn-prilozheniya.test.js)
  'js/core/web-journal.js', 'js/core/alarm-journal.js', 'js/core/sectors.js', 'js/views/quantum-figures.js', 'js/prefs.js',
  // Копия фотографий на сервере (сервер 16)
  'js/photo-backup/index.js',
  // Золото кнопок и подложки: заданы в стилях, и без сети на их месте была бы пустота
  'img/gold/n01.jpg', 'img/gold/n02.jpg', 'img/gold/n03.jpg', 'img/gold/n04.jpg', 'img/gold/n05.jpg', 'img/gold/n06.jpg', 'img/gold/n07.jpg', 'img/gold/n08.jpg', 'img/gold/n09.jpg', 'img/gold/n10.jpg', 'img/gold/n11.jpg', 'img/gold/n12.jpg', 'img/gold/sv-big.jpg', 'img/gold/sv-c2.jpg', 'img/gold/sv-l.jpg', 'img/widget/gold-button.webp', 'img/widget/gold-tray.webp'
];

/* Картинки виджетов (2 МБ) нужны редко. В установку не берём: она либо скачивает всё, либо не состоится совсем, и на
   слабой связи приложение осталось бы без запаса из-за картинок. Догружаются по одной при запуске. */
const ПОТОМ = [
  'img/widget-mirror/bath-sunset.jpg', 'img/widget-mirror/blue-moon.jpg', 'img/widget-mirror/blue-sea.jpg', 'img/widget-mirror/couple-candles.jpg', 'img/widget-mirror/embrace.jpg', 'img/widget-mirror/golden-buddha.jpg', 'img/widget-mirror/golden-fort.jpg', 'img/widget-mirror/green-jungle.jpg', 'img/widget-mirror/krabi-bay.jpg', 'img/widget-mirror/lake-town.jpg', 'img/widget-mirror/lilac-lake.jpg', 'img/widget-mirror/lofoten.jpg', 'img/widget-mirror/lovers-waves.jpg', 'img/widget-mirror/night-mountains.jpg', 'img/widget-mirror/norway-valley.jpg', 'img/widget-mirror/orange-palms.jpg', 'img/widget-mirror/pool-party.jpg', 'img/widget-mirror/pyramid-city.jpg', 'img/widget-mirror/red-passion.jpg', 'img/widget-mirror/red-silhouettes.jpg', 'img/widget-mirror/red-sunset.jpg', 'img/widget-mirror/taj-fountain.jpg', 'img/widget-mirror/yellow-sky.jpg'
];
/* ЗАПАС ПЕРВЫМ (выкладка 216).

   До сих пор было наоборот: сначала сеть, запас — только когда сети нет совсем. Без сети это работало, а на
   слабой связи — нет, и именно это владелец видел как «бывает, экран просто чёрный» (06.11.2026). Страница ждала
   сеть не дольше 4 с, но если успевала прийти из сети, все её шестьдесят модулей и стилей (с three.min.js в
   600 КБ) шли тоже из сети — без всякого срока, по EDGE минутами. Пока они не пришли, на экране нет ни входа,
   ни приложения: оба скрыты до конца запуска.

   Теперь файлы выкладки — из запаса, всегда и сразу. Запас каждой выкладки — свой (planner-v<номер>) и
   собирается установкой этого работника целиком: либо весь, либо никакой, поэтому разметка и код в нём всегда
   одной выкладки. Свежесть даёт не сеть на каждом файле, а сам работник: браузер при каждом открытии сверяет
   sw.js с сайтом, номер выкладки в нём меняется с каждой выкладкой, новый работник ставит новый запас целиком,
   а страница переходит на него, когда человек уходит с экрана (app.js, «новая выкладка встала»). */

/* Файл из сети в запас не кладём: сайт мог уже уйти на следующую выкладку, и новый файл встретил бы в запасе
   старые. Запас пополняют только установка и дополнитьЗапас — обе сверяют номер выкладки сайта. */
const вАдрес = путь => new URL(путь, self.location).href;
const безПараметров = адрес => адрес.split(/[?#]/)[0];
const ГЛАВНАЯ = вАдрес('./');

/* Запрос пересобираем по адресу, а не копированием: у перехода по ссылке режим navigate, и копия с другими
   настройками кэша для него недопустима — браузер отверг бы её. По адресу же получается обычный запрос, ответ
   на который подходит и для перехода. */
const свежий = (адрес, заголовки) => new Request(адрес, {
  cache: 'no-cache', credentials: 'same-origin', headers: заголовки
});

/* Совпадает ли выкладка на сайте с выкладкой этого работника. Нет — файлы с сайта уже другой выкладки, и класть
   их в этот запас нельзя: следующий запуск открыл бы смесь двух выкладок. */
async function сайтНаЭтойВыкладке() {
  const ответ = await fetch(вАдрес(`version.json?sw=${Date.now()}`), { cache: 'no-store' });
  return ответ.ok && Number((await ответ.json()).release) === RELEASE;
}

self.addEventListener('install', event => {
  /* С проверкой у сервера, как и всё ниже: иначе в запас ляжет копия из браузерного кэша от прошлой выкладки.
     Сайт ещё не на этой выкладке (идёт выкладка) — установка не состоится и повторится при следующем открытии. */
  event.waitUntil(сайтНаЭтойВыкладке()
    .then(та => { if (!та) throw new Error(`сайт не на выкладке ${RELEASE}`); })
    .then(() => caches.open(CACHE))
    .then(c => c.addAll(SHELL.map(путь => свежий(вАдрес(путь)))))
    .then(() => self.skipWaiting()));
});

/* Дополнить запас тем, чего в нём нет (его стирает кнопка «Обновить»). Файл не скачался — возьмём при следующем
   запуске, поэтому по одному, а не addAll: на слабой связи тот падает целиком. */
async function дополнитьЗапас() {
  const кэш = await caches.open(CACHE);
  const пропали = [];
  for (const путь of [...SHELL, ...ПОТОМ]) {
    const адрес = вАдрес(путь);
    if (!(await кэш.match(адрес))) пропали.push(адрес);
  }
  if (пропали.length === 0) return;
  try {
    if (!(await сайтНаЭтойВыкладке())) return;      // встанет следующий работник со своим запасом
  } catch { return; }                                 // нет связи — в следующий раз
  for (const адрес of пропали) {
    try {
      const ответ = await fetch(свежий(адрес));
      if (ответ.status === 200) await кэш.put(адрес, ответ);
    } catch { /* нет связи — в следующий раз */ }
  }
}

self.addEventListener('message', event => {
  if (event.data?.type === 'kvant-fill-shell') event.waitUntil(дополнитьЗапас());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('planner-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Страница: из запаса этой выкладки. Нет её там (запас стёрт «Обновить» или ещё не собран) — с сайта; не
   ответил и сайт — главная из запаса, а не системная страница ошибки. */
async function открытьСтраницу(event) {
  const кэш = await caches.open(CACHE);
  const запас = await кэш.match(безПараметров(event.request.url));
  if (запас) return запас;
  try {
    return await fetch(свежий(event.request.url, event.request.headers));
  } catch {
    return (await кэш.match(ГЛАВНАЯ)) || Response.error();
  }
}

async function отдатьФайл(event) {
  const кэш = await caches.open(CACHE);
  const запас = await кэш.match(безПараметров(event.request.url));
  if (запас) return запас;
  return fetch(свежий(event.request.url, event.request.headers));
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  /* Страница прямо попросила не брать из запаса — значит, ей нужен честный ответ сети. Кнопка «Обновить» так
     узнаёт, что связи нет, и не стирает запас; проверка выкладки в live-update.js не получает старый номер и не
     запускает подмену пакета. */
  if (request.cache === 'no-store') return;
  /* Страница установки с файлом приложения и пакеты обновления — не часть экрана: в запасе им делать нечего. */
  const свойПуть = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (/^(app|native)\//.test(свойПуть)) return;
  event.respondWith(request.mode === 'navigate' ? открытьСтраницу(event) : отдатьФайл(event));
});

/* ПУШ С СЕРВЕРА (выкладка 205). В час момента и окна сервер присылает пуш (server/src/push.js), а показывает
   его этот скрипт — даже когда «Квант» закрыт. На iPhone так звонит сайт с экрана «Домой» (iOS 16.4+).
   Показывать обязательно каждый пуш: браузер, получивший пуш без уведомления, отзывает подписку. */
self.addEventListener('push', event => {
  let данные = {};
  try {
    данные = event.data ? event.data.json() : {};
  } catch {
    данные = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(данные.title || 'Квант', {
    body: данные.body || '',
    tag: данные.key || 'kvant',
    renotify: true,
    requireInteraction: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { target: данные.target || '' }
  }));
});

/* Нажатие — тот же экран, что «Прожить» на Android: момент, моменты или пространство. Открытое окно
   «Кванта» получает цель сообщением, закрытое открывается с #open=<цель>. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const цель = event.notification.data?.target || '';
  const адрес = new URL(цель ? `./#open=${encodeURIComponent(цель)}` : './', self.registration.scope).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(окна => {
    for (const окно of окна) {
      if (окно.url.startsWith(self.registration.scope) && 'focus' in окно) {
        окно.postMessage({ type: 'kvant-open', target: цель });
        return окно.focus();
      }
    }
    return clients.openWindow(адрес);
  }));
});
