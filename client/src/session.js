const SESSION_KEY = '200game:session';

export function saveSession(name, roomCode) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name, roomCode }));
  } catch {
    // localStorage unavailable (private mode, etc.) - auto-rejoin just won't work.
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.name || !parsed?.roomCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
