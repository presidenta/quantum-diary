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
import { reportFailure } from '../errors.js';
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

/* ТИП ЗАПИСИ ПО ПЕРВЫМ БАЙТАМ (выкладка 167). Файл, выбранный в проводнике телефона, приходит с пустым или
   общим типом («application/octet-stream»), и плеер оболочки может отказаться играть его по имени типа,
   хотя сам файл исправен. Тип определяется по содержимому; известный тип не трогаем. */
const ОБЩИЕ_ТИПЫ = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

export async function sniffType(blob) {
  if (!ОБЩИЕ_ТИПЫ.has(blob.type)) return blob.type;
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const text = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (text(0, 3) === 'ID3' || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)) return 'audio/mpeg';
  if (text(0, 4) === 'OggS') return 'audio/ogg';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return 'audio/wav';
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'audio/webm';
  if (text(4, 8) === 'ftyp') return 'audio/mp4';
  if (text(0, 4) === 'fLaC') return 'audio/flac';
  return blob.type;
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
 * Включить запись момента. Возвращает { ok: true } или { ok: false, reason } — причина нужна экрану и отчёту.
 * Звать из нажатия (кнопка «Воспроизвести») или сразу после удержания: браузер глушит звук без жеста.
 */
export async function playMoment(moment) {
  const source = await soundSourceFor(moment);
  if (!source) return { ok: false, reason: 'none' };

  let src = '';
  let release = () => {};
  try {
    if (source.blob) {
      const typed = new Blob([source.blob], { type: await sniffType(source.blob) });
      src = URL.createObjectURL(typed);
      release = () => URL.revokeObjectURL(src);
    } else {
      // Скачанная копия: в метро по ссылке звук не достать
      src = (await localMedia(source.url)) || '';
    }
  } catch (err) {
    return fail(`запись не открылась: ${err?.name || 'ошибка'}: ${err?.message || ''}`, release);
  }
  if (!src) return fail('адрес записи не получен', release);

  stopSound();                                   // одна запись на всё приложение
  const audio = new Audio(src);
  current = { audio, release };
  audio.addEventListener('ended', stopSound);
  audio.addEventListener('error', () => {
    reportFailure(`звук: плеер не принял запись (код ${audio.error?.code ?? '?'}: ${audio.error?.message || ''})`);
    stopSound();
  });
  showBar();
  try {
    await audio.play();
  } catch (err) {
    // Телефон в беззвучном режиме или жест не засчитан — панель убирается сама, причина идёт в сбои
    stopSound();
    return fail(`play() отклонён: ${err?.name || 'ошибка'}: ${err?.message || ''}`);
  }
  return { ok: true };
}

/* Сбой воспроизведения: в журнал сбоев (его видит администратор) и причиной — экрану. */
function fail(reason, release = () => {}) {
  release();
  reportFailure(`звук: ${reason}`);
  return { ok: false, reason };
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
    note.textContent = '';
    const result = await playMoment(moment);
    play.disabled = false;
    if (!result.ok) {
      note.textContent = result.reason === 'none'
        ? noSoundText(moment)
        : `${t('quantum.soundFailed')} (${result.reason})`;
    }
  });

  soundSourceFor(moment).then(source => {
    play.disabled = !source;
    stop.disabled = !source;
    note.textContent = source ? '' : noSoundText(moment);
  });
  return box;
}

/* Почему кнопка серая: запись привязана к ФАЗЕ дня, и у этой фазы своей нет. Говорим, какая это фаза и где
   её добавить — владелец 20.10.2026 добавил запись к одной фазе, а живой момент был другой, и «ничего не
   играло». */
function noSoundText(moment) {
  const phase = t(`quantum.${moment.slot}`) || moment.slot;
  return t('quantum.noSoundFor', { phase });
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
