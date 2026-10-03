/* Адрес сервера «Квантового ежедневника».

   На своём компьютере — localhost, в сети — genesisystem.coreviaflow.space
   (тот же сервер, где живёт игра; поддомен отдельный).

   Пока сервер не поднят, приложение не должно встречать человека экраном
   входа, который всё равно не работает: оно просто работает на устройстве.
   Как только сервер ответит — вход и синхронизация включатся сами, без
   новой выкладки. Решает это проверка в boot(), см. js/app.js. */

const const PRODUCTION_API = 'https://game.coreviaflow.space/genesisystem';

export const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8580'
  : PRODUCTION_API;

/* Сервер отвечает? Ждём недолго: человеку нужен работающий экран, а не
   ожидание. Не ответил — живём на устройстве и скажем об этом. */
export async function serverAlive(timeoutMs = 3500) {
  if (!API_BASE) return false;
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/version`, { cache: 'no-store', signal: control.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
