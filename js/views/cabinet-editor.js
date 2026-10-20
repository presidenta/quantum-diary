/* РЕДАКТОР КВАНТОВОГО КАБИНЕТА ОДНОГО ЧЕЛОВЕКА — ОБЩИЙ ДЛЯ СТРАНИЦЫ АДМИНА И РАЗДЕЛА В ПРИЛОЖЕНИИ.

   Раньше он жил внутри admin.js, привязанный к разметке admin.html. Когда в кабинете участника
   появился раздел администратора (выкладка 165, js/support.js), там понадобилось то же самое: фазы
   дня, дни недели, персональный набор фраз. Копировать полторы сотни строк значило бы получить два
   редактора, которые со временем разойдутся. Поэтому он вынесен сюда и не знает, откуда зовут:
   адреса запросов, перевод, список фраз и всё «лишнее» (блок записи файлов на странице админа) ему
   передают.

   Фазы дня и дни недели настраиваются раздельно, и в каждом блоке — текст, звук и картинка; у дня
   недели ещё и цвет. Блоки независимы: правка одного уходит на сервер сама по себе и не трогает
   остальные. Так специалист может настроить только утро и уйти, ничего не «сохраняя целиком».

   Человек со своего телефона сюда не попадает без администратора: сервер пускает только роль
   администратора — своей сессией (admin.html) или сессией поддержки (js/support.js). */

import { h } from '../store.js';

/* Подписи фраз в списках: фаза дня и язык. Те же, что на странице админа. */
export const SLOT_NAMES = { morning: 'Утро', day: 'День', evening: 'Вечер', frame: 'Кадр' };
export const LANG_CODES = { ru: 'RU', uk: 'UK', en: 'EN' };

const SLOT_KEYS = [
  ['morning', 'adm.slotMorning'],
  ['day', 'adm.slotDay'],
  ['evening', 'adm.slotEvening'],
  ['frame', 'adm.slotFrame']
];
// 1 — понедельник, как в ISO и в базе (to_char(date, 'ID'))
const WEEKDAY_KEYS = [
  ['1', 'adm.mon'], ['2', 'adm.tue'], ['3', 'adm.wed'], ['4', 'adm.thu'],
  ['5', 'adm.fri'], ['6', 'adm.sat'], ['7', 'adm.sun']
];

const TABS = [['slot', 'adm.phases'], ['weekday', 'adm.weekdays'], ['phrases', 'adm.phrases']];

/**
 * @param {object} p
 * @param {(key: string, values?: object) => string} p.t   перевод
 * @param {(path: string, options?: object) => Promise<any>} p.api  запрос к серверу (ответ 204 — null)
 * @param {{settings: string, phrases: string}} p.endpoints  адреса настроек и набора фраз ЭТОГО человека
 * @param {() => Promise<Array>} p.loadLibrary  библиотека фраз, из которой собирают персональный набор
 * @param {(kind: string, key: string) => (Node|null)} [p.extras]  дополнение к блоку (запись файлов)
 * @param {(message: string) => void} [p.onError]  сообщение об ошибке на странице
 * @returns {{element: HTMLElement, load: () => Promise<void>}}
 */
export function createCabinetEditor({ t, api, endpoints, loadLibrary, extras = () => null, onError = () => {} }) {
  let kind = 'slot';
  let settings = [];

  const tabs = h('div', { class: 'segmented', role: 'group' });
  const blocks = h('div', { class: 'q-blocks' });
  const hint = h('p', { class: 'muted m0', text: t('adm.quantumHint') });
  const element = h('div', { class: 'cabinet-editor' }, tabs, blocks, hint);

  const settingOf = (k, key) => settings.find(x => x.kind === k && x.key === key) || {};

  function renderTabs() {
    tabs.replaceChildren(...TABS.map(([value, labelKey]) => h('button', {
      type: 'button', 'aria-pressed': String(value === kind), text: t(labelKey),
      onclick: () => { kind = value; renderTabs(); renderBlocks(); }
    })));
  }

  /* Третья вкладка — персональный набор фраз. Раньше он жил отдельной кнопкой в карточке и путал:
     снаружи было непонятно, чем «Фразы» отличаются от «Содержания». Это одно и то же про одного
     человека, поэтому и место одно. */
  async function renderBlocks() {
    if (kind === 'phrases') return renderAssign();
    const keys = kind === 'slot' ? SLOT_KEYS : WEEKDAY_KEYS;
    blocks.replaceChildren(...keys.map(([key, labelKey]) => block(kind, key, t(labelKey))));
  }

  async function renderAssign() {
    blocks.replaceChildren(h('p', { class: 'muted m0', text: t('adm.loading') }));
    let assigned;
    let library;
    try {
      assigned = new Set(await api(endpoints.phrases));
      library = await loadLibrary();
    } catch {
      blocks.replaceChildren(h('p', { class: 'muted m0', text: t('adm.saveFailed') }));
      return;
    }
    if (!library.length) {
      blocks.replaceChildren(h('p', { class: 'muted m0', text: t('adm.noPhrasesYet') }));
      return;
    }
    blocks.replaceChildren(
      h('p', { class: 'muted m0', text: t('adm.assignNote') }),
      h('ul', { class: 'phrases mt10' }, ...library.map(p => h('li', { class: 'phrase' },
        h('input', {
          type: 'checkbox', value: p.id, checked: assigned.has(p.id), 'aria-label': p.text,
          onchange: saveAssigned
        }),
        h('div', {},
          h('span', { class: 'text', text: p.text }),
          h('span', { class: 'meta', text: `${SLOT_NAMES[p.slot]} · ${LANG_CODES[p.language]}` })),
        h('span', {})))));
  }

  // Отметку сохраняем сразу: отдельная кнопка «Сохранить» на списке галочек — лишний шаг, о котором
  // забывают, и набор молча остаётся прежним
  async function saveAssigned() {
    const ids = [...blocks.querySelectorAll('input:checked')].map(i => i.value);
    try {
      await api(endpoints.phrases, { method: 'POST', body: JSON.stringify({ phraseIds: ids }) });
    } catch {
      onError(t('adm.saveFailed'));
    }
  }

  function block(k, key, label) {
    const value = settingOf(k, key);
    const filled = Boolean(value.text || value.color || value.imageUrl || value.audioUrl);

    const field = (name, labelKey, type = 'text') => h('label', {},
      h('span', { text: t(labelKey) }),
      h('input', { type, name, value: value[name] || '' }));

    const body = h('div', { class: 'q-block-body' },
      h('label', {},
        h('span', { text: t('adm.text') }),
        h('textarea', { name: 'text', maxlength: 600, value: value.text || '' })),
      /* Цвет — только у дня недели: у фазы он берётся из чакры дня.

         Галочка нужна потому, что поле выбора цвета НИКОГДА не бывает пустым: очистить его нельзя,
         браузер вернёт чёрный. Без галочки «вернуть общий цвет» было бы невозможно — настройка
         навсегда перекрывала бы чакру. */
      k === 'weekday'
        ? h('div', { class: 'q-color' },
            h('label', { class: 'q-color-use' },
              h('input', { type: 'checkbox', name: 'useColor', checked: Boolean(value.color) }),
              h('span', { text: t('adm.ownColor') })),
            h('input', { type: 'color', name: 'color', value: value.color || '#2b3a8c' }))
        : null,
      field('imageUrl', 'adm.imageUrl', 'url'),
      field('audioUrl', 'adm.audioUrl', 'url'),
      extras(k, key),
      h('div', { class: 'q-block-foot' },
        h('button', {
          type: 'button', class: 'btn primary',
          onclick: e => save(e.target.closest('.q-block'), k, key)
        }, h('span', { class: 'gold-cut', text: t('adm.save') })),
        h('span', { class: 'q-block-said', role: 'status' })));

    return h('details', { class: `q-block ${filled ? 'filled' : ''}`, 'data-key': key },
      h('summary', {},
        h('b', { text: label }),
        h('span', { class: 'q-block-mark', text: filled ? t('adm.configured') : t('adm.notSet') })),
      body);
  }

  async function save(node, k, key) {
    const said = node.querySelector('.q-block-said');
    const read = name => (node.querySelector(`[name=${name}]`) || {}).value || '';
    const useColor = node.querySelector('[name=useColor]')?.checked;
    const payload = {
      kind: k, key,
      text: read('text'),
      // Галочка снята — цвет не отправляем вовсе: вернётся общий цвет чакры
      color: k === 'weekday' && useColor ? read('color') : '',
      imageUrl: read('imageUrl'),
      audioUrl: read('audioUrl')
    };
    try {
      const saved = await api(endpoints.settings, { method: 'POST', body: JSON.stringify(payload) });
      // Сервер вернул 204 — настройка стёрта, потому что в ней ничего не осталось
      settings = settings.filter(x => !(x.kind === k && x.key === key));
      if (saved) settings.push(saved);
      said.textContent = saved ? t('adm.saved') : t('adm.cleared');
      node.classList.toggle('filled', Boolean(saved));
      node.querySelector('.q-block-mark').textContent = saved ? t('adm.configured') : t('adm.notSet');
    } catch (err) {
      said.textContent = err.status === 400 ? t('adm.checkFields') : t('adm.saveFailed');
    }
    setTimeout(() => { said.textContent = ''; }, 4000);
  }

  async function load() {
    settings = await api(endpoints.settings);
    kind = 'slot';
    renderTabs();
    await renderBlocks();
  }

  return { element, load };
}
