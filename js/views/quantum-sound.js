/* ЗВУК МОМЕНТА: КНОПКИ «ВОСПРОИЗВЕСТИ» И «СТОП» НА КАЖДОМ ЭКРАНЕ (выкладка 166).

   Владелец 20.10.2026: добавил аудио к фазе дня — а на экране мудры ни звука, ни кнопки воспроизведения;
   «везде должна быть кнопка play и stop — на любом из девяти окон». Прежде звук был либо встроенным
   элементом <audio controls>, который прятался, пока файл не нашёлся (и не показывался вовсе, если не
   нашёлся), либо играл сам после удержания днём — без возможности остановить.

   Теперь:
     • на экране практики (утро, вечер) и на поле дня стоят свои кнопки «Воспроизвести» и «Стоп»,
       ВСЕГДА, а не только когда звук нашёлся: нет записи — кнопки погашены и сказано почему;
     • пока что-то звучит, внизу экрана висит панель «Звучит запись — Стоп», на любом экране приложения:
       запись после удержания идёт дольше цветного экрана, и остановить её надо уметь отовсюду;
     • звучит одна запись на всё приложение: новая останавливает прежнюю.

   ЧТО ИГРАЕТ. Запись, добавленная администратором НА ЭТОМ УСТРОЙСТВЕ (раздел «Администратор», ключ
   «qs:<участник>:slot:<фаза>»), главнее ссылки; нет её — личный звук от специалиста, затем звук самой
   фразы. Адрес из ссылки скачивается и хранится на устройстве (core/media.js): политика страницы чужой
   адрес в src не пропускает, а в метро по ссылке звук не достать.

   ВЛАДЕНИЕ ФАЙЛАМИ. Адрес blob: создаётся ТОЛЬКО в момент воспроизведения и освобождается, когда запись
   остановлена или кончилась. Прежняя схема создавала их заранее для показа и освобождала «при следующей
   перерисовке» — а перерисовок при открытии экрана несколько, и поздно пришедший ответ одной стирал
   адреса другой (звука не было вовсе). Для снимков владелец адресов — сам экран (devicePhotos). */

import { state, t, h } from '../store.js';
import { localMedia } from '../core/media.js';
import { getDoorAudio } from './space/audio.js';
import { getDoorPhotos } from './space/photos.js';

/* Ключ файлов фазы дня на этом устройстве — тот же, под которым их кладёт раздел «Администратор». */
export const deviceKey = slot => (state.me?.id ? `qs:${state.me.id}:slot:${slot}` : '');

/* Звучащая сейчас запись: { audio, release } или null. Одна на всё приложение. */
let current = null;
let bar = null;

export const isPlaying = () => current !== null;

/** Остановить звук и убрать панель. Звать можно когда угодно: молчащему приложению это ничего не делает. */
export function stopSound() {
  if (!current) return;
  const { audio, release } = current;
  current = null;
  audio.pause();
  release();
  hideBar();
}

function showBar() {
  if (bar) return;
  bar = h('div', { class: 'q-sound-bar', role: 'status' },
    h('span', { text: `♪ ${t('quantum.soundOn')}` }),
    h('button', { type: 'button', class: 'btn', text: `■ ${t('quantum.stop')}`, onclick: stopSound }));
  document.body.append(bar);
}

function hideBar() {
  bar?.remove();
  bar = null;
}

/* Что играть для момента: файл с устройства, иначе ссылка (личная от специалиста главнее общей).
   Возвращает { blob } или { url } или null — адрес blob: ещё НЕ создаётся. */
export async function soundSourceFor(moment) {
  const key = deviceKey(moment.slot);
  const record = key ? await getDoorAudio(key).catch(() => null) : null;
  if (record?.blob) return { blob: record.blob };

  const url = state.quantum?.settings?.slots?.[moment.slot]?.audioUrl || moment.audioUrl;
  return url ? { url } : null;
}

/**
 * Включить запись момента. Возвращает true, если пошла.
 * Звать из нажатия (кнопка «Воспроизвести») или сразу после удержания: браузер глушит звук без жеста.
 */
export async function playMoment(moment) {
  const source = await soundSourceFor(moment);
  if (!source) return false;

  let src = '';
  let release = () => {};
  if (source.blob) {
    src = URL.createObjectURL(source.blob);
    release = () => URL.revokeObjectURL(src);
  } else {
    // Скачанная копия: в метро по ссылке звук не достать
    src = (await localMedia(source.url)) || '';
  }
  if (!src) { release(); return false; }

  stopSound();                                   // одна запись на всё приложение
  const audio = new Audio(src);
  current = { audio, release };
  audio.addEventListener('ended', stopSound);
  audio.addEventListener('error', stopSound);
  showBar();
  try {
    await audio.play();
  } catch {
    // Телефон в беззвучном режиме или жест не засчитан — это нормально, панель убирается сама
    stopSound();
    return false;
  }
  return true;
}

/**
 * Кнопки «Воспроизвести» и «Стоп» для экрана момента. Стоят всегда; нет записи — погашены, и подпись
 * говорит, что её не добавили (владелец 20.10.2026: «кнопки нет — непонятно, почему»).
 */
export function playerControls(moment) {
  const play = h('button', { type: 'button', class: 'btn primary', disabled: true, text: `▶ ${t('quantum.play')}` });
  const stop = h('button', { type: 'button', class: 'btn', disabled: true, text: `■ ${t('quantum.stop')}`, onclick: stopSound });
  const note = h('p', { class: 'muted q-player-note', text: t('quantum.soundChecking') });
  const box = h('div', { class: 'q-player' }, h('div', { class: 'q-player-row' }, play, stop), note);

  play.addEventListener('click', async () => {
    play.disabled = true;
    const started = await playMoment(moment);
    play.disabled = false;
    if (!started) note.textContent = t('quantum.soundFailed');
  });

  soundSourceFor(moment).then(source => {
    play.disabled = !source;
    stop.disabled = !source;
    note.textContent = source ? '' : t('quantum.noSound');
  });
  return box;
}

/**
 * Снимки этой фазы с устройства (раздел «Администратор»): адреса blob: возвращает по одному, а владеет
 * ими вызывающий — own = { urls: [], dead: false }. Экран, которого уже нет (dead), адреса не получает.
 */
export async function devicePhotos(slot, own) {
  const key = deviceKey(slot);
  if (!key) return [];
  const photos = await getDoorPhotos(key).catch(() => []);
  const urls = [];
  for (const photo of photos) {
    if (!photo?.blob) continue;
    const url = URL.createObjectURL(photo.blob);
    if (own.dead) { URL.revokeObjectURL(url); continue; }
    own.urls.push(url);
    urls.push(url);
  }
  return urls;
}

/** Освободить адреса снимков экрана, который убирают. */
export function releasePhotos(own) {
  own.dead = true;
  while (own.urls.length) URL.revokeObjectURL(own.urls.pop());
}
