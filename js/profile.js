/* ПРОФИЛЬ: фотография, установка приложения, выход, удаление.

   Собрано в одном месте то, что было раскидано по настройкам и шапке. */

import { API_BASE } from './config.js';
import { state, t, $, h } from './store.js';

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

/* УСТАНОВКА НА ТЕЛЕФОН.

   Браузер сам решает, когда предложить установку, и событие приходит один
   раз. Его нужно поймать и придержать: иначе кнопка «Установить» будет либо
   всегда, либо никогда — а она должна появляться ровно тогда, когда установка
   возможна, и исчезать после неё. */
let installPrompt = null;

export function watchInstall(button) {
  if (!button) return;
  const show = () => { button.hidden = !installPrompt; };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();          // своё окно вместо браузерной полоски
    installPrompt = event;
    show();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; show(); });

  button.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;            // предложение одноразовое
    show();
  });
  show();
}

// Уже стоит как приложение — предлагать установку незачем
export const installed = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
