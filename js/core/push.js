/* ПУШИ С СЕРВЕРА — СТОРОНА ПРИЛОЖЕНИЯ (выкладка 205).

   Владелец 28.10.2026: «на Apple тоже должно срабатывать, пускай даже с сервера». Где своих будильников нет —
   iPhone (сайт на экране «Домой», iOS 16.4+) и браузер компьютера, — в час момента и окна звонит сервер:
   приложение отдаёт ему своё расписание (sendPushPlan), устройство подписывается на пуши (enablePush), пуш
   показывает фоновый скрипт сайта (sw.js), нажатие открывает тот же экран, что «Прожить» на Android.

   В приложении для Android подписки нет: там звонит свой будильник, и пуш был бы вторым голосом. Расписание
   оттуда всё равно уходит на сервер — по нему звонят остальные устройства того же человека. */

import { getMeta } from '../db.js';

/** Умеет ли этот браузер пуши вообще (на iPhone — только сайт, открытый с экрана «Домой»). */
export function pushSupported() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator
        && 'PushManager' in window && 'Notification' in window;
}

/** iPhone или iPad, где сайт открыт не с экрана «Домой»: пуши там появятся, только когда его туда добавят. */
export function needsHomeScreen() {
    const ua = navigator.userAgent || '';
    const apple = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!apple) return false;
    const сЭкрана = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    return !сЭкрана;
}

async function запрос(путь, тело) {
    /* Адрес сервера — при запросе, а не при загрузке модуля: config.js читает адрес страницы, а этот модуль
       ввозит и расписание звонков, которое проверяется тестами без браузера. */
    const { API_BASE } = await import('../config.js');
    const token = await getMeta('token');
    if (!API_BASE || !token) {
        const err = new Error('no_session');
        err.status = 401;
        throw err;
    }
    const res = await fetch(`${API_BASE}${путь}`, {
        method: тело === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: тело === undefined ? undefined : JSON.stringify(тело)
    });
    if (!res.ok) {
        const err = new Error(res.status === 503 ? 'push_off' : 'push_failed');
        err.status = res.status;
        throw err;
    }
    return res.status === 204 ? null : res.json();
}

async function подписка() {
    if (!pushSupported()) return null;
    const рег = await navigator.serviceWorker.getRegistration();
    return рег ? рег.pushManager.getSubscription() : null;
}

/**
 * Что сейчас с пушами на этом устройстве: 'unsupported' | 'homescreen' | 'denied' | 'on' | 'off'.
 * «on» — подписка есть и у браузера, и на сервере у этого человека.
 */
export async function pushStatus() {
    if (needsHomeScreen()) return 'homescreen';
    if (!pushSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const sub = await подписка().catch(() => null);
    if (!sub) return 'off';
    try {
        const { subscribed } = await запрос('/api/push/status', { endpoint: sub.endpoint });
        return subscribed ? 'on' : 'off';
    } catch {
        // Сервер не ответил — верим браузеру: подписка у него есть
        return 'on';
    }
}

/* Ключ сервера приходит строкой base64url, а браузер ждёт байты. */
function вБайты(строка) {
    const дополнено = (строка + '='.repeat((4 - строка.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const сырые = atob(дополнено);
    return Uint8Array.from(сырые, с => с.charCodeAt(0));
}

/**
 * Включить пуши на этом устройстве. Звать ПРЯМО из нажатия: iPhone спрашивает разрешение только в ответ
 * на действие человека, поэтому вопрос — первая строка, до любых ожиданий.
 */
export async function enablePush() {
    const ответ = await Notification.requestPermission();
    if (ответ !== 'granted') {
        const err = new Error('denied');
        err.status = 403;
        throw err;
    }
    const { publicKey } = await запрос('/api/push/key');
    const рег = await navigator.serviceWorker.ready;
    let sub = await рег.pushManager.getSubscription();
    if (!sub) {
        sub = await рег.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: вБайты(publicKey) });
    }
    await запрос('/api/push/subscribe', sub.toJSON());
    последнийПлан = '';   // расписание — заново, даже если не менялось: подписка новая
}

/** Выключить пуши на этом устройстве: и у сервера, и у браузера. */
export async function disablePush() {
    const sub = await подписка();
    if (!sub) return;
    await запрос('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
}

let последнийПлан = '';

/**
 * Отдать серверу расписание звонков: [{key, at (мс), title, body, target}]. Звонки, попавшие в тихий
 * час, сюда не попадают (их отбирает reminder-plan). То же расписание второй раз не шлётся. Нет входа
 * или сервер не рассылает пуши — молча ничего: звонки на этом устройстве от этого не зависят.
 */
export async function sendPushPlan(items) {
    const план = items
        .filter(i => i && i.key && Number(i.at) > Date.now())
        .slice(0, 200)
        .map(i => ({
            key: String(i.key).slice(0, 120),
            at: new Date(Number(i.at)).toISOString(),
            title: String(i.title || 'Квант').slice(0, 120),
            body: String(i.body || '').slice(0, 400),
            target: String(i.target || '').slice(0, 80)
        }));
    const снимок = JSON.stringify(план);
    if (снимок === последнийПлан) return false;
    try {
        await запрос('/api/push/plan', { items: план });
        последнийПлан = снимок;
        return true;
    } catch {
        return false;
    }
}
