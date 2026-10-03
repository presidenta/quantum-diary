const PRODUCTION_API = 'https://game.coreviaflow.space/genesisystem';

export const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8580'
  : PRODUCTION_API;

export async function serverAlive(timeoutMs = 3500) {
  if (!API_BASE) return false;
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/version`, { cache: 'no-store', signal: control.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
