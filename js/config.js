// Адрес сервера Планера. Пока он не задан, приложение работает только на телефоне
// и синхронизируется, как только адрес появится (ТЗ, раздел 4.3).
const PRODUCTION_API = null;   // например 'https://planner-api.<домен>'

export const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8580'
  : PRODUCTION_API;
