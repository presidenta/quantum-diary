/* Глазик у полей с паролем.

   Пароль выдаёт администратор, его диктуют по телефону и переписывают с
   экрана — вслепую в этом легко ошибиться и потом гадать, что не так.
   Поэтому показать набранное должно быть можно везде, где есть пароль.

   Кнопка живёт внутри поля и не мешает автозаполнению: сам input не
   подменяется, меняется только его type. */

const EYE = 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z';
const PUPIL = 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z';
const SLASH = 'M4 4l16 16';

function icon(hidden) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of hidden ? [EYE, PUPIL] : [EYE, PUPIL, SLASH]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function attach(input) {
  if (input.dataset.eye) return;
  input.dataset.eye = '1';

  const wrap = document.createElement('div');
  wrap.className = 'eye-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'eye-btn';
  button.setAttribute('aria-label', 'Показать пароль');
  button.setAttribute('aria-pressed', 'false');
  button.appendChild(icon(true));

  button.addEventListener('click', () => {
    const shown = input.type === 'text';
    input.type = shown ? 'password' : 'text';
    button.setAttribute('aria-pressed', String(!shown));
    button.replaceChildren(icon(shown));
    input.focus({ preventScroll: true });
  });

  wrap.appendChild(button);
}

/* Поля появляются вместе с окнами, поэтому смотрим и за новыми.
   Наблюдатель дешёвый: он просыпается только когда разметка меняется. */
export function initPasswordEyes(root = document) {
  root.querySelectorAll('input[type="password"]').forEach(attach);

  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('input[type="password"]')) attach(node);
        node.querySelectorAll?.('input[type="password"]').forEach(attach);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
