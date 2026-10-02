/* Экран «День»: задачи, заметка дня, памятные даты. */

import {
  state, t, save, remove, uuid, $, h, activeSectors, sectorById, sectorName
} from '../store.js';
import {
  todayKey, addDays, fromKey, isDateKey
} from '../core/dates.js';
import {
  tasksOfDay, nextPosition, taskProgress, overdueTasks, noteOfDay, upcomingDates
} from '../core/diary.js';

const fmtDay = () => new Intl.DateTimeFormat(state.language, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtMonth = () => new Intl.DateTimeFormat(state.language, { month: 'short', timeZone: 'UTC' });

let noteTimer = null;

export function renderDay() {
  const date = state.day;
  const today = todayKey();

  const label = fmtDay().format(fromKey(date));
  $('dayLabel').textContent = label[0].toUpperCase() + label.slice(1);
  $('dayNext').disabled = date >= today;

  renderTasks(date);
  renderNote(date);
  renderDates(date);
}

/* ---------- Задачи ---------- */

function renderTasks(date) {
  const list = tasksOfDay(state.data.tasks, date);
  const { done, total } = taskProgress(list);
  $('taskProgress').textContent = total ? `${t('day.done')} ${done} / ${total}` : '';

  const rows = list.map(task => {
    const sector = task.sectorId ? sectorById(task.sectorId) : null;
    const box = h('input', {
      type: 'checkbox', checked: task.done, id: `task-${task.id}`,
      onchange: e => save('tasks', [{
        ...task, done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : null
      }])
    });
    return h('li', { class: `task${task.done ? ' done' : ''}` },
      box,
      h('label', { for: `task-${task.id}`, text: task.title }),
      sector ? h('span', { class: `dot s${sector.slot}`, title: sectorName(sector) }) : null,
      h('button', {
        type: 'button', class: 'remove', text: '×',
        'aria-label': t('goal.delete'),
        onclick: () => remove('tasks', task)
      }));
  });

  // Невыполненное с прошлых дней: показываем, а не переносим молча —
  // человек сам решает, что ещё актуально
  const overdue = state.day === todayKey() ? overdueTasks(state.data.tasks, state.day) : [];
  if (overdue.length) {
    rows.push(h('li', { class: 'muted overdue-head', text: t('day.overdue') }));
    for (const task of overdue) {
      rows.push(h('li', { class: 'task' },
        h('span', { class: 'muted task-when', text: fmtMonth().format(fromKey(task.date)) }),
        h('label', { text: task.title }),
        h('button', {
          type: 'button', class: 'remove move', text: t('day.moveToToday'),
          onclick: () => save('tasks', [{ ...task, date: state.day, position: nextPosition(state.data.tasks, state.day) }])
        })));
    }
  }

  if (!rows.length) rows.push(h('li', { class: 'muted muted-row', text: t('day.empty') }));
  $('taskList').replaceChildren(...rows);
}

function openTaskDialog() {
  const form = $('taskForm');
  form.reset();
  const select = form.elements.sectorId;
  select.replaceChildren(
    h('option', { value: '', text: '—' }),
    ...activeSectors().map(s => h('option', { value: s.id, text: sectorName(s) }))
  );
  $('taskDialog').returnValue = '';
  $('taskDialog').showModal();
}

$('taskDialog').addEventListener('close', async () => {
  if ($('taskDialog').returnValue !== 'save') return;
  const f = $('taskForm').elements;
  const title = f.title.value.trim().slice(0, 200);
  if (!title) return;
  await save('tasks', [{
    id: uuid(), date: state.day, title, done: false, doneAt: null,
    sectorId: f.sectorId.value || null, position: nextPosition(state.data.tasks, state.day)
  }]);
});

/* ---------- Заметка дня ---------- */

function renderNote(date) {
  const note = noteOfDay(state.data.notes, date);
  const field = $('noteBody');
  field.placeholder = t('day.notePlaceholder');
  // Не трогаем поле, пока человек в нём пишет: иначе курсор прыгает
  if (document.activeElement !== field) field.value = note?.body || '';
  field.dataset.noteId = note?.id || '';
}

$('noteBody').addEventListener('input', e => {
  // Пишем не на каждую букву: одна запись через полсекунды тишины
  clearTimeout(noteTimer);
  const body = e.target.value;
  const id = e.target.dataset.noteId;
  const date = state.day;
  noteTimer = setTimeout(async () => {
    const existing = id ? state.data.notes.find(n => n.id === id) : noteOfDay(state.data.notes, date);
    if (!existing && !body.trim()) return;          // пустую заметку не заводим
    const record = existing ? { ...existing, body } : { id: uuid(), date, body };
    await save('notes', [record]);
    e.target.dataset.noteId = record.id;
  }, 500);
});

/* ---------- Памятные даты ---------- */

function renderDates(date) {
  const upcoming = upcomingDates(state.data.memorableDates, date, 365).slice(0, 8);
  if (!upcoming.length) {
    $('dateList').replaceChildren(h('li', { class: 'muted muted-row', text: '—' }));
    return;
  }
  $('dateList').replaceChildren(...upcoming.map(item => {
    const when = fromKey(item.occurrence);
    const parts = [
      item.in === 0 ? t('day.today') : t('day.inDays', { n: item.in })
    ];
    if (item.age !== null) parts.push(t('day.turns', { n: item.age }));
    return h('li', { class: `date-row${item.in <= item.date.remindDaysBefore ? ' soon' : ''}` },
      h('span', { class: 'date-when' },
        h('b', { text: String(when.getUTCDate()) }),
        h('span', { text: fmtMonth().format(when) })),
      h('span', { class: 'what' },
        h('b', { text: item.date.title }),
        h('span', { text: parts.join(' · ') })),
      h('button', {
        type: 'button', class: 'remove', text: '×',
        'aria-label': t('goal.delete'),
        onclick: () => remove('memorableDates', item.date)
      }));
  }));
}

function openDateDialog() {
  $('dateForm').reset();
  $('dateDialog').returnValue = '';
  $('dateDialog').showModal();
}

$('dateDialog').addEventListener('close', async () => {
  if ($('dateDialog').returnValue !== 'save') return;
  const f = $('dateForm').elements;
  const title = f.title.value.trim().slice(0, 120);
  const when = f.when.value;
  if (!title || !isDateKey(when)) return;
  const year = Number(f.year.value) || null;
  await save('memorableDates', [{
    id: uuid(), title,
    kind: year ? 'birthday' : 'anniversary',
    month: Number(when.slice(5, 7)),
    day: Number(when.slice(8, 10)),
    year,
    remindDaysBefore: Number(f.remindDaysBefore.value) || 0,
    note: null
  }]);
});

/* ---------- Запуск ---------- */

export function initDay() {
  $('addTask').addEventListener('click', openTaskDialog);
  $('addDate').addEventListener('click', openDateDialog);
  $('dayPrev').addEventListener('click', () => { state.day = addDays(state.day, -1); renderDay(); });
  $('dayNext').addEventListener('click', () => {
    if (state.day < todayKey()) { state.day = addDays(state.day, 1); renderDay(); }
  });

  // Голосом — только там, где браузер это умеет; на телефоне проще диктовать
  // кнопкой микрофона на клавиатуре, поэтому своя кнопка здесь не обязательна
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Recognition) {
    const button = $('voiceNote');
    button.hidden = false;
    button.addEventListener('click', () => {
      const recognition = new Recognition();
      recognition.lang = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' }[state.language];
      recognition.interimResults = false;
      recognition.onresult = event => {
        const said = event.results[0][0].transcript;
        const field = $('noteBody');
        field.value = field.value ? `${field.value} ${said}` : said;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      };
      recognition.start();
    });
  }
}
