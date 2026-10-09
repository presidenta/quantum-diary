const PRODUCTION_API = 'https://game.coreviaflow.space/genesisystem';

/* ПОЧЕМУ СМОТРИМ НА ПРОТОКОЛ, А НЕ ТОЛЬКО НА ИМЯ УЗЛА.

   Собранное приложение открывает страницу по адресу https://localhost:
   файлы лежат внутри APK, но для браузера внутри приложения это localhost.
   Имя узла там ровно такое же, как у сервера разработки на компьютере.
   Если различать только по имени, приложение на телефоне пойдёт искать
   сервер разработки на самом телефоне, не найдёт — и останется без входа
   и без синхронизации.

   Различаем по протоколу: сервер разработки отдаёт http, Capacitor — https.
   И отдельно спрашиваем сам Capacitor, раз он есть: две независимые
   проверки надёжнее одной. */
const nativeApp = typeof window !== 'undefined'
  && window.Capacitor
  && typeof window.Capacitor.isNativePlatform === 'function'
  && window.Capacitor.isNativePlatform();

const localDev = !nativeApp
  && location.protocol === 'http:'
  && ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_BASE = localDev ? 'http://localhost:8580' : PRODUCTION_API;

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
