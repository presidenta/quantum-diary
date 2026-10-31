/* Запрос мимо браузерных ограничений: в установленном приложении обычный
   fetch до сервера не доходит — см. core/net.js. */
import { request } from './core/net.js';

const PRODUCTION_API = 'https://game.coreviaflow.com/genesisystem';

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

export async function serverAlive(timeoutMs = 7000) {
  if (!API_BASE) return false;
  /* Спрашиваем тем же способом, каким потом будем работать. Иначе
     выходит нелепость: приложение решает, что сервер мёртв, браузерной
     проверкой — и прячет вход, хотя родным запросом сервер прекрасно
     отвечает. Именно так и было: вход не показывался при живом сервере.
     Срок увеличен до семи секунд: мобильная сеть бывает медленной, а
     ценой ошибки здесь становится спрятанный экран входа. */
  try {
    const res = await request(`${API_BASE}/api/version`, {
      cache: 'no-store', timeoutMs
    });
    return res.ok;
  } catch {
    return false;
  }
}
