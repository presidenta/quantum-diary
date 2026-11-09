/* ПОЛЗУНОК ЗАПИСИ: где сейчас звук, сколько всего, перемотка.

   Владелец 09.11.2026: «когда плеер включается, чтобы была строчка, как в плеере, с ползунком…
   чтобы можно было перемотать… непонятно, насколько длинная запись». Полоса видна, пока запись
   играет; под ней — «прошло / всего». Подробно — README рядом. */

import { formatDuration } from '../audio.js';

/** Полоса под записью двери: скрыта, пока запись не играет. */
export function buildSeekBar(label) {
    const bar = document.createElement('div');
    bar.className = 'qm-seek';
    bar.hidden = true;

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'qm-seek-range';
    range.min = '0';
    range.max = '0';
    range.step = '0.1';
    range.value = '0';
    range.setAttribute('aria-label', label);
    bar.appendChild(range);

    const time = document.createElement('span');
    time.className = 'qm-seek-time';
    bar.appendChild(time);

    return bar;
}

/**
 * Связать полосу с играющей записью. Длительность — от браузера, а пока он её
 * не знает (запись с микрофона), — из сохранённой при записи.
 * @param {HTMLElement} bar
 * @param {HTMLAudioElement} audio
 * @param {number} knownMs
 * @returns {() => void} отвязать и спрятать
 */
export function bindSeekBar(bar, audio, knownMs) {
    const range = bar.querySelector('.qm-seek-range');
    const time = bar.querySelector('.qm-seek-time');
    // Палец на ползунке — ход записи его не дёргает
    let dragging = false;

    const total = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (knownMs || 0) / 1000);
    const draw = () => {
        const всего = total();
        range.max = String(всего);
        if (!dragging) range.value = String(Math.min(audio.currentTime, всего || audio.currentTime));
        const сейчас = Number(range.value);
        time.textContent = (formatDuration(сейчас * 1000) || '0:00') + ' / ' + (formatDuration(всего * 1000) || '—');
        range.style.setProperty('--qm-seek-fill', всего ? ((сейчас / всего) * 100).toFixed(2) + '%' : '0%');
    };

    const onInput = () => {
        dragging = true;
        draw();
    };
    const onChange = () => {
        audio.currentTime = Number(range.value);
        dragging = false;
        draw();
    };

    audio.addEventListener('timeupdate', draw);
    audio.addEventListener('durationchange', draw);
    range.addEventListener('input', onInput);
    range.addEventListener('change', onChange);
    bar.hidden = false;
    draw();

    return () => {
        audio.removeEventListener('timeupdate', draw);
        audio.removeEventListener('durationchange', draw);
        range.removeEventListener('input', onInput);
        range.removeEventListener('change', onChange);
        bar.hidden = true;
    };
}
