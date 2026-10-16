/* ПРОФИЛЬ: фотография, установка приложения, выход, удаление.

   Собрано в одном месте то, что было раскидано по настройкам и шапке. */

import { API_BASE } from './config.js';
import { state, t, $, h } from './store.js';
import { isDesktop } from './pc-install.js';

/* ФОТОГРАФИЯ СЖИМАЕТСЯ НА УСТРОЙСТВЕ, И ЭТО НЕ МЕЛОЧЬ.

   Снимок с камеры телефона весит три-пять мегабайт. Отправить его как есть
   значит занять канал в зале с общим интернетом и положить мегабайт в базу
   ради кружка размером в палец. Здесь он ужимается до 256 пикселей по длинной
   стороне — выходит 20–40 килобайт.

   Квадрат вырезается по центру: кружок всё равно покажет только середину, и
   лучше обрезать осознанно, чем позволить браузеру растянуть лицо. */
const PHOTO_SIZE = 256;

/* Файл читается в data:-строку, а не через URL.createObjectURL.

   Политика безопасности страницы разрешает картинки только свои и data: —
   blob:-ссылку она отвергает, и снимок просто не открывался бы. Ослаблять
   политику ради этого не нужно: FileReader даёт ту же картинку в разрешённом
   виде. */
export function shrinkPhoto(file, size = PHOTO_SIZE) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('not_readable'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('not_an_image'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Кружок с фотографией или первой буквой имени. Один вид и в меню, и в
   профиле — чтобы человек узнавал себя в обоих местах. */
export function paintAvatar(node, avatar, name) {
  if (!node) return;
  if (avatar) {
    node.replaceChildren(h('img', { src: avatar, alt: '' }));
    node.classList.add('has-photo');
  } else {
    node.classList.remove('has-photo');
    node.textContent = (name || '·').trim().charAt(0).toUpperCase() || '·';
  }
}

/* УСТАНОВКА НА ТЕЛЕФОН — ОДНА, И ВЕДЁТ В ОДНО МЕСТО.

   Здесь стояла установка ярлыка через beforeinstallprompt: браузер сам
   предлагал «установить», и сайт превращался в ярлык-приложение. Снаружи
   он неотличим от настоящего приложения — то же имя, тот же значок, своя
   строка в списке приложений, — но напоминаний он не умеет: ни звука, ни
   вибрации, ни срабатывания при закрытом приложении.

   Выходило два одинаковых с виду «Кванта», и только один звонит. Понять,
   какой перед тобой, нельзя ничем.

   Теперь кнопка ведёт на страницу настоящего приложения. Одна установка,
   один значок, одно место, откуда приходят обновления.

   Адрес прописан целиком, а не относительным путём: страница живёт на
   сайте, а кнопку видно в том числе когда приложение открыто с другого
   адреса — относительный путь упёрся бы в пустоту. */
export const APP_PAGE = 'https://presidenta.github.io/quantum-diary/app/';

export function watchInstall(button) {
  if (!button) return;

  /* В самом приложении кнопка не нужна: оно уже установлено. Спрашиваем
     Capacitor — он есть только внутри приложения, в браузере его нет. */
  const inApp = Boolean(window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform());

  /* На компьютере эта кнопка бесполезна: она ведёт на страницу
     Android-приложения, а apk на ПК не поставить. Её место занимает
     «Установить на ПК» (js/pc-install.js). */
  button.hidden = inApp || isDesktop();
  if (button.hidden) return;

  button.addEventListener('click', () => {
    window.open(APP_PAGE, '_blank', 'noopener');
  });
}

/* Открыт ли сайт отдельным окном, без адресной строки.

   Раньше по этому признаку прятали кнопку установки. Теперь он остаётся
   признаком ярлыка, оставшегося с прежних времён: на телефонах новых
   таких ярлыков не появится — манифеста у страницы нет. На компьютере
   окно без адресной строки — это уже установленный через «Установить на
   ПК» «Квант» (js/pc-install.js). */
export const installed = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
