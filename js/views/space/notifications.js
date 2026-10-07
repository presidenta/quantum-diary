/* Звук-перезвон, вибрация, системное уведомление и откладывание.

   Часть раздела «Квант» — вторая вкладка «Пространство вариантов».
   Модуль изолирован: кроме этой папки и двух строк в app.js он ничего
   в Ежедневнике не трогает. */

import { CONFIG } from './config.js';

export class NotificationManager {
    constructor() {
        this.snoozeCount = parseInt(localStorage.getItem('quantum_snooze_count') || '0');
        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission().catch(() => {});
        }
    }

    playAlarmSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const now = ctx.currentTime;
            
            // Гармонический перезвон
            const createChime = (freq, time) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0.4, time);
                gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.2);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(time);
                osc.stop(time + 1.2);
            };

            createChime(528, now);
            createChime(660, now + 0.25);
            createChime(792, now + 0.5);
        } catch (e) {
            console.log("Audio Context Error:", e);
        }
    }

    triggerQuantumWindowNotification() {
        this.playAlarmSound();
        if ('vibrate' in navigator) {
            // Двойной пульсирующий вибросигнал
            navigator.vibrate([200, 100, 200]);
        }
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification("Окно возможностей открыто!", { 
                body: "Для того, чтобы воспользоваться окном возможностей. У вас есть 88 минут и 8 секунд.",
                icon: "/favicon.ico"
            });
        }
    }

    canSnooze() {
        return this.snoozeCount < CONFIG.timing.maxSnoozeCount;
    }

    snooze() {
        if (!this.canSnooze()) return false;
        this.snoozeCount++;
        localStorage.setItem('quantum_snooze_count', this.snoozeCount.toString());
        
        const currentLast = parseInt(localStorage.getItem('last_quantum_jump_time') || Date.now().toString());
        const newTime = currentLast + CONFIG.timing.snoozeDurationMs;
        localStorage.setItem('last_quantum_jump_time', newTime.toString());
        return true;
    }

    resetSnooze() {
        this.snoozeCount = 0;
        localStorage.setItem('quantum_snooze_count', '0');
    }
}
