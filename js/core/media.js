/* Картинки и звуки практик — на устройстве, а не по ссылке.

   ЗАЧЕМ. Специалист задаёт ссылку, но показывать её напрямую нельзя по двум
   причинам сразу.

   Первая — безопасность. Политика страницы разрешает картинки только свои и
   data:, а звук только свой. Чужой адрес в src просто не отрисуется: сейчас
   заданные ссылки не работают вовсе, и это видно в консоли браузера.

   Вторая — жизнь. Момент наступает в зале с общим интернетом или в метро.
   Картинка, которую нужно скачать именно в эту секунду, не покажется.

   КАК. Файл скачивается один раз и кладётся в хранилище страницы (Cache API).
   Дальше он берётся оттуда и отдаётся как blob: — свои данные, уже на
   устройстве. Для них в политику добавлено ровно blob:, не больше.

   Хранилище у медиа своё, отдельное от запаса страниц: при обновлении
   приложения тот очищается целиком, и скачанные практики пропадали бы вместе
   с ним. */

const STORE = 'genesisystem-media-v1';

// Созданные blob-ссылки живут, пока жива страница. Их держим, чтобы не
// плодить по одной на каждую перерисовку экрана
const handed = new Map();

const canCache = () => typeof caches !== 'undefined';

/* Отдаёт местный адрес файла: из хранилища, если он там есть, иначе качает.
   Не получилось — возвращает null, и экран обходится без картинки: практика
   важнее её оформления. */
export async function localMedia(url) {
  if (!url) return null;
  if (handed.has(url)) return handed.get(url);
  if (!canCache()) return null;

  try {
    const store = await caches.open(STORE);
    let response = await store.match(url);

    if (!response) {
      // no-store: качаем сами и сами храним — браузерный кэш тут только
      // лишний слой, в котором файл может залежаться старой версией
      const fresh = await fetch(url, { cache: 'no-store', mode: 'cors' });
      if (!fresh.ok) return null;
      await store.put(url, fresh.clone());
      response = fresh;
    }

    const local = URL.createObjectURL(await response.blob());
    handed.set(url, local);
    return local;
  } catch {
    return null;              // нет сети и нет копии — обходимся без файла
  }
}

/* Заранее скачать всё, что понадобится сегодня. Зовётся при загрузке дня,
   когда сеть ещё есть, чтобы к наступлению момента файл уже лежал на месте.

   Ошибки глотаются намеренно: это подготовка впрок, и падать из-за
   недоступной картинки день не должен. */
export async function warmUp(urls) {
  const list = [...new Set(urls.filter(Boolean))];
  await Promise.all(list.map(url => localMedia(url).catch(() => null)));
  return list.length;
}

/* Убрать скачанное: по кнопке «Удалить приложение» и при смене человека на
   устройстве — чужие практики не должны оставаться. */
export async function forgetMedia() {
  for (const url of handed.values()) {
    try { URL.revokeObjectURL(url); } catch { /* уже отозвана */ }
  }
  handed.clear();
  if (canCache()) await caches.delete(STORE).catch(() => {});
}
