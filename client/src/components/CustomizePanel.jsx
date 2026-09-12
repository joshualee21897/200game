import { useState } from 'react';
import { CARD_BACKS, FELT_THEMES } from '../cosmetics';

// Controlled by Table (which owns the current values and persists changes
// to localStorage) - this component just renders the picker UI.
export default function CustomizePanel({ cardBack, feltTheme, onCardBackChange, onFeltChange }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="icon-button customize-fab" onClick={() => setOpen(true)} title="Customize">
        🎨
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="overlay-panel customize-panel" onClick={(e) => e.stopPropagation()}>
            <div className="instructions-header">
              <h2>Customize</h2>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close customize">
                &times;
              </button>
            </div>

            <h3>Table felt</h3>
            <div className="swatch-row">
              {FELT_THEMES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`felt-swatch felt-swatch-${f.id} ${feltTheme === f.id ? 'swatch-selected' : ''}`}
                  onClick={() => onFeltChange(f.id)}
                  title={f.label}
                  aria-label={f.label}
                />
              ))}
            </div>

            <h3>Card back</h3>
            <div className="swatch-row">
              {CARD_BACKS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cardback-swatch cardback-swatch-${c.id} ${cardBack === c.id ? 'swatch-selected' : ''}`}
                  onClick={() => onCardBackChange(c.id)}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
