// Purely local, per-browser display preferences - like the mute toggle,
// these never touch the server or other players' screens, so there's
// nothing to sync or persist server-side.

const CARD_BACK_KEY = '200game:cardBack';
const FELT_KEY = '200game:felt';

export const CARD_BACKS = [
  { id: 'diamond', label: 'Diamond' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'dots', label: 'Dots' },
  { id: 'solid', label: 'Solid Gold' },
];

export const FELT_THEMES = [
  { id: 'classic', label: 'Classic Green' },
  { id: 'ocean', label: 'Ocean Blue' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'midnight', label: 'Midnight' },
];

export function getCardBack() {
  try {
    const v = localStorage.getItem(CARD_BACK_KEY);
    return CARD_BACKS.some((c) => c.id === v) ? v : 'diamond';
  } catch {
    return 'diamond';
  }
}

export function setCardBack(id) {
  try {
    localStorage.setItem(CARD_BACK_KEY, id);
  } catch {
    // ignore
  }
}

export function getFeltTheme() {
  try {
    const v = localStorage.getItem(FELT_KEY);
    return FELT_THEMES.some((f) => f.id === v) ? v : 'classic';
  } catch {
    return 'classic';
  }
}

export function setFeltTheme(id) {
  try {
    localStorage.setItem(FELT_KEY, id);
  } catch {
    // ignore
  }
}
