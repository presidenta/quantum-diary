/* Блок «Записать / Файл / Фото» — тот самый, что в «Настройке Реальностей».

   Это не новый блок. Вёрстка, классы и поведение взяты из дверей раздела
   «Пространство вариантов» один в один: те же плашки, тот же таймер
   записи вместо подписи, та же лента снимков с крестиками. Хранение —
   тем же кодом, views/space/audio.js и views/space/photos.js. Отличие
   ровно одно: там блок жил внутри двери и знал её по doorId, здесь он
   принимает любую строку-ключ и поэтому встаёт в любой экран —
   в кабинет администратора, в фазы дня, в личные настройки.

   СТИЛИ. Те же классы и тот же вид, но правила лежат в css/app.css и
   написаны на общих токенах проекта — цвета, рамки и шрифты в нём
   одни на все экраны. Поэтому блок одинаково встаёт в любую карточку и
   не тащит за собой вёрстку чужого раздела.

   ЧТО ДОБАВЛЕНО СВЕРХ ПЕРЕНЕСЁННОГО.
   Снимок открывается во весь экран по нажатию: у дверей миниатюра
   ничего не открывала, а владелец просил смотреть фотографию целиком.
   Это единственная дописанная часть.

   ГДЕ ЛЕЖАТ ФАЙЛЫ. На самом устройстве, рядом с файлами дверей. На
   сервер не уходит ничего, и это не выбор: в базе под картинку и звук
   отведено поле на 500 символов, то есть только ссылка, а хранилища
   файлов на сервере нет вовсе. Значит добавленный здесь файл живёт на
   этом устройстве и другому человеку не достаётся. Когда у сервера
   появится место под файлы, менять придётся только обращения к
   хранилищу — наружу блок отдаёт один и тот же вид. */

import {
  canRecord, startRecording, saveDoorAudio, getDoorAudio,
  getDoorAudioMeta, deleteDoorAudio, formatDuration
} from '../views/space/audio.js';
import {
  PHOTO_LIMIT, getDoorPhotos, addDoorPhotos, deleteDoorPhoto
} from '../views/space/photos.js';

const SLOVA = {
  record: 'Записать',
  file: 'Файл',
  photo: 'Фото',
  play: 'Послушать',
  remove: 'Убрать',
  noRecorder: 'Запись недоступна на этом устройстве',
  limit: 'Больше трёх снимков не берём'
};

/* Плашка, за которой спрятан выбор файла: по нажатию открывается
   системный проводник, отдельной кнопки для этого не нужно.
   Перенесено из buildPickChip. */
function plashka(accept, multiple, iconClass, label, onFiles) {
  const chip = document.createElement('label');
  chip.className = 'qm-chip';

  const icon = document.createElement('span');
  icon.className = 'qm-ico ' + iconClass;
  icon.setAttribute('aria-hidden', 'true');
  chip.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'qm-chip-text';
  text.textContent = label;
  chip.appendChild(text);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.hidden = true;
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    input.value = '';                 // тот же файл можно выбрать снова
    if (files.length > 0) await onFiles(files);
  });
  chip.appendChild(input);

  return { chip, input };
}

function knopkaZnachka(extraClass, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qm-icon-btn ' + extraClass;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.hidden = true;
  return b;
}

/* Снимок во весь экран. Закрывается нажатием куда угодно: на телефоне
   это понятнее, чем искать крестик. */
function voVesEkran(blob) {
  const url = URL.createObjectURL(blob);

  const back = document.createElement('div');
  back.className = 'qm-photo-full';

  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  back.appendChild(img);

  const zakryt = () => {
    back.remove();
    URL.revokeObjectURL(url);
    document.removeEventListener('keydown', poKlavishe);
  };
  const poKlavishe = e => { if (e.key === 'Escape') zakryt(); };

  back.addEventListener('click', zakryt);
  document.addEventListener('keydown', poKlavishe);
  document.body.appendChild(back);
}

/**
 * Собрать блок.
 *
 * @param {string} key  чьи это файлы — любая постоянная строка, по ней
 *                      они потом и находятся. Например 'phrase:new'.
 * @param {object} [opts]
 * @param {string} [opts.note] строка пояснения под блоком.
 * @returns {HTMLElement} блок; у него есть refresh() — перечитать файлы,
 *                        и setKey(строка) — переключиться на другие.
 */
export function mediaBox(key, opts = {}) {
  const box = document.createElement('div');
  box.className = 'qm-media';

  let kluch = key;
  let pishem = null;        // идущая запись
  let taimer = null;
  let zvuk = null;          // проигрываемый звук
  let zvukUrl = null;

  // ---- строка плашек
  const actions = document.createElement('div');
  actions.className = 'qm-media-actions';
  box.appendChild(actions);

  const record = document.createElement('button');
  record.type = 'button';
  record.className = 'qm-chip qm-chip-rec';

  const dot = document.createElement('span');
  dot.className = 'qm-ico qm-ico-mic';
  dot.setAttribute('aria-hidden', 'true');
  record.appendChild(dot);

  const recText = document.createElement('span');
  recText.className = 'qm-chip-text';
  recText.textContent = SLOVA.record;
  record.appendChild(recText);

  if (!canRecord()) {
    record.disabled = true;
    record.title = SLOVA.noRecorder;
  }
  actions.appendChild(record);

  const zvukovoy = plashka('audio/*', false, 'qm-ico-file', SLOVA.file, async files => {
    const f = files[0];
    await saveDoorAudio(kluch, f, f.name || 'audio');
    await perechitat();
  });
  actions.appendChild(zvukovoy.chip);

  const fotki = plashka('image/*', true, 'qm-ico-photo', SLOVA.photo, async files => {
    const { skipped } = await addDoorPhotos(kluch, files);
    await perechitat();
    if (skipped > 0) alert(SLOVA.limit);
  });
  const counter = document.createElement('span');
  counter.className = 'qm-photo-count';
  counter.textContent = '0/' + PHOTO_LIMIT;
  fotki.chip.appendChild(counter);
  actions.appendChild(fotki.chip);

  // ---- строка состояния звука
  const state = document.createElement('div');
  state.className = 'qm-media-state';

  const info = document.createElement('span');
  info.className = 'qm-audio-info';
  state.appendChild(info);

  const preview = knopkaZnachka('qm-audio-preview', SLOVA.play);
  const remove = knopkaZnachka('qm-audio-remove', SLOVA.remove);
  state.appendChild(preview);
  state.appendChild(remove);
  box.appendChild(state);

  // ---- лента снимков
  const strip = document.createElement('div');
  strip.className = 'qm-photo-strip';
  box.appendChild(strip);

  if (opts.note) {
    const note = document.createElement('p');
    note.className = 'qm-media-note';
    note.textContent = opts.note;
    box.appendChild(note);
  }

  /* Запись. Второе нажатие останавливает и сохраняет — как у дверей.
     Во время записи подпись плашки ведёт таймер, поэтому трогать её
     где-то ещё нельзя. */
  record.addEventListener('click', async () => {
    if (pishem) {
      const idet = pishem;
      pishem = null;
      clearInterval(taimer);
      taimer = null;
      record.classList.remove('qm-chip-rec-on');
      recText.textContent = SLOVA.record;

      const blob = await idet.stop();
      if (blob && blob.size > 0) {
        const chas = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        await saveDoorAudio(kluch, blob, SLOVA.record + ' ' + chas);
      }
      await perechitat();
      return;
    }

    try {
      pishem = await startRecording();
    } catch (err) {
      console.error('[медиа] микрофон недоступен:', err);
      record.disabled = true;
      record.title = SLOVA.noRecorder;
      return;
    }

    const nachalo = Date.now();
    record.classList.add('qm-chip-rec-on');
    recText.textContent = formatDuration(0);
    taimer = setInterval(() => {
      recText.textContent = formatDuration(Date.now() - nachalo);
    }, 500);
  });

  preview.addEventListener('click', async () => {
    if (zvuk && !zvuk.paused) { ostanovitZvuk(); return; }

    const zapisano = await getDoorAudio(kluch);
    if (!zapisano) return;

    ostanovitZvuk();
    zvukUrl = URL.createObjectURL(zapisano.blob);
    zvuk = new Audio(zvukUrl);
    zvuk.onended = ostanovitZvuk;
    zvuk.play().catch(ostanovitZvuk);
  });

  function ostanovitZvuk() {
    if (zvuk) { zvuk.pause(); zvuk = null; }
    if (zvukUrl) { URL.revokeObjectURL(zvukUrl); zvukUrl = null; }
  }

  remove.addEventListener('click', async () => {
    ostanovitZvuk();
    await deleteDoorAudio(kluch);
    await perechitat();
  });

  /* Перечитать хранилище и перерисовать. Отдельной подписки на
     изменения нет нарочно: блок меняется только отсюда. */
  async function perechitat() {
    const meta = await getDoorAudioMeta(kluch);
    const est = Boolean(meta);
    preview.hidden = !est;
    remove.hidden = !est;
    info.textContent = est
      ? meta.fileName + (meta.durationMs ? ' · ' + formatDuration(meta.durationMs) : '')
      : '';

    const photos = await getDoorPhotos(kluch);
    counter.textContent = photos.length + '/' + PHOTO_LIMIT;
    fotki.input.disabled = photos.length >= PHOTO_LIMIT;

    // Адреса прежних миниатюр отпускаем, иначе память течёт при каждой
    // перерисовке — та же причина, что и у дверей.
    for (const img of strip.querySelectorAll('img')) URL.revokeObjectURL(img.src);
    strip.textContent = '';

    for (const photo of photos) {
      const cell = document.createElement('div');
      cell.className = 'qm-photo-cell';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(photo.blob);
      img.alt = photo.fileName || '';
      img.addEventListener('click', () => voVesEkran(photo.blob));
      cell.appendChild(img);

      const drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'qm-photo-drop';
      drop.title = SLOVA.remove;
      drop.setAttribute('aria-label', SLOVA.remove);
      drop.addEventListener('click', async () => {
        await deleteDoorPhoto(kluch, photo.id);
        await perechitat();
      });
      cell.appendChild(drop);

      strip.appendChild(cell);
    }
  }

  box.refresh = perechitat;
  box.setKey = async novyi => { kluch = novyi; await perechitat(); };

  void perechitat();
  return box;
}
