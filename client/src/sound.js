// Lightweight sound effects synthesized with the Web Audio API - no
// external audio files to load or license. Every call is safe to make
// even if audio is unsupported or blocked (fails silently), and honors a
// localStorage-backed mute flag.

const MUTE_KEY = '200game:muted';

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // ignore
  }
}

function tone(ctx, t, { freq, freqEnd, duration, type = 'sine', gain = 0.12 }) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.linearRampToValueAtTime(gain, t + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gainNode).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.03);
}

function play(build) {
  if (isMuted()) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    build(ctx, ctx.currentTime);
  } catch {
    // Audio unavailable/blocked - not worth surfacing to the player.
  }
}

export function playDraw() {
  play((ctx, t) => tone(ctx, t, { freq: 640, freqEnd: 360, duration: 0.09, type: 'triangle', gain: 0.12 }));
}

export function playDiscard() {
  play((ctx, t) => tone(ctx, t, { freq: 260, freqEnd: 170, duration: 0.07, type: 'square', gain: 0.05 }));
}

export function playChoice() {
  play((ctx, t) => tone(ctx, t, { freq: 460, duration: 0.06, type: 'sine', gain: 0.08 }));
}

export function playRoundEnd() {
  play((ctx, t) => {
    [523.25, 659.25].forEach((freq, i) => tone(ctx, t + i * 0.09, { freq, duration: 0.18, gain: 0.13 }));
  });
}

export function playGameWin() {
  play((ctx, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      tone(ctx, t + i * 0.11, { freq, duration: 0.28, gain: 0.15 })
    );
  });
}
