/* Запрос к серверу из установленного приложения.

   ПОЧЕМУ НЕ ПРОСТО fetch, РАДИ ЧЕГО ЭТОТ ФАЙЛ ВООБЩЕ ПОЯВИЛСЯ.

   Приложение внутри телефона — такой же браузер, и страница в нём открыта
   не с адреса сайта, а со своего: https://localhost. Для сервера это
   посторонний адрес, и если он не назван в его настройках, сервер не
   ставит в ответ разрешающий заголовок. Ответ приходит, но браузер
   выбрасывает его, не показав. Снаружи это неотличимо от мёртвого
   сервера: «Сервер не отвечает», нет входа, нет регистрации, нет
   синхронизации — при живом сервере, отвечающем за 0,2 секунды.

   Настройку на сервере мы поправили, но до самого сервера она не доедет:
   у него нет автоматической выкладки, и перезапустить его некому.
   Поэтому приложение больше на неё не рассчитывает.

   Capacitor умеет ходить в сеть НЕ браузером, а средствами самого
   телефона. Такой запрос браузерных ограничений не знает вовсе: он не
   спрашивает разрешения и не выбрасывает ответы. Здесь он и
   используется — ровно для обращений к серверу.

   В браузере (сайт, разработка) всё остаётся как было: обычный fetch,
   обычные правила. Там они и уместны — сайт открыт с того адреса,
   который серверу известен.

   Ответ приводится к виду обычного fetch: вызывающему всё равно, чем
   сходили, он читает res.ok, res.status и res.json(). */

/** Родная сетевая часть Capacitor или null, если мы в браузере. */
function nativeHttp() {
  const cap = window.Capacitor;
  if (!cap || !cap.Plugins) return null;
  if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
  return cap.Plugins.CapacitorHttp || null;
}

/** Идём ли мы в обход браузера. Нужно только для понятных сообщений. */
export const nativeNet = () => Boolean(nativeHttp());

/* Тело запроса. Наш код везде кладёт в body готовую строку JSON, а родному
   запросу удобнее объект: он сам поставит заголовки и кодировку. Строку,
   которая не разбирается как JSON, отдаём как есть — вдруг это не JSON. */
function bodyFor(options) {
  const body = options.body;
  if (body == null) return undefined;
  if (typeof body !== 'string') return body;
  try { return JSON.parse(body); } catch { return body; }
}

/* Ответ той же формы, что у fetch. Заголовки родной запрос отдаёт
   простым объектом, и имена в нём бывают в разном регистре — ищем оба. */
function asResponse(res) {
  const status = Number(res.status);
  const body = res.data;
  const headers = res.headers || {};

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: name => headers[name] ?? headers[String(name).toLowerCase()] ?? null
    },
    json: async () => (typeof body === 'string' ? JSON.parse(body || 'null') : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? ''))
  };
}

/**
 * Запрос к серверу. В приложении — мимо браузерных ограничений,
 * в браузере — обычный fetch.
 *
 * @param {string} url полный адрес
 * @param {object} [options] как у fetch: method, headers, body.
 *        Плюс timeoutMs — сколько ждать; по умолчанию пятнадцать секунд.
 */
export async function request(url, options = {}) {
  const http = nativeHttp();
  if (!http) return fetch(url, options);

  const wait = options.timeoutMs || 15000;
  const res = await http.request({
    url,
    method: (options.method || 'GET').toUpperCase(),
    headers: options.headers || {},
    data: bodyFor(options),
    connectTimeout: wait,
    readTimeout: wait
  });
  return asResponse(res);
}
