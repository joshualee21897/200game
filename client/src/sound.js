// Lightweight sound effects synthesized with the Web Audio API - no
// external audio files to load or license. Every call is safe to make
// even if audio is unsupported or blocked (fails silently), and honors a
// localStorage-backed mute flag.
//
// Card sounds (draw/discard/choice) are built from filtered noise bursts,
// not pure-tone sweeps - a percussive "snap"/"shff" reads as a physical
// card, where a sine/triangle pitch sweep reads as a UI blip ("bubble
// pop"). The round/game win cues keep a musical chime (that's the right
// register for "you won something"), just preceded by a quick card riffle
// so the whole thing still feels like cards rather than a generic jingle.

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

// A short burst of filtered noise - the basis of every "card" sound
// (paper/card contact is noisy and percussive, not tonal).
function noiseBurst(ctx, t, { duration, filterFreq, filterType = 'bandpass', Q = 1.2, gain = 0.16 }) {
  const sampleCount = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  filter.Q.value = Q;

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(gain, t);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

  source.connect(filter).connect(gainNode).connect(ctx.destination);
  source.start(t);
  source.stop(t + duration + 0.02);
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
  // A card sliding off the pile, then landing in hand.
  play((ctx, t) => {
    noiseBurst(ctx, t, { duration: 0.1, filterFreq: 2200, Q: 0.9, gain: 0.17 });
    noiseBurst(ctx, t + 0.07, { duration: 0.035, filterFreq: 3400, Q: 1.6, gain: 0.11 });
  });
}

export function playDiscard() {
  // A quick flick/snap down onto the pile.
  play((ctx, t) => noiseBurst(ctx, t, { duration: 0.045, filterFreq: 3800, Q: 2.4, gain: 0.15 }));
}

export function playChoice() {
  // A light tap, for locking in an RPS throw.
  play((ctx, t) => noiseBurst(ctx, t, { duration: 0.03, filterFreq: 3000, Q: 1.8, gain: 0.09 }));
}

export function playRoundEnd() {
  play((ctx, t) => {
    noiseBurst(ctx, t, { duration: 0.07, filterFreq: 2500, Q: 0.8, gain: 0.13 }); // hands flipping over
    [523.25, 659.25].forEach((freq, i) => tone(ctx, t + 0.06 + i * 0.09, { freq, duration: 0.18, gain: 0.13 }));
  });
}

export function playGameWin() {
  play((ctx, t) => {
    // A quick riffle/shuffle...
    [2000, 2600, 2200, 3000].forEach((filterFreq, i) =>
      noiseBurst(ctx, t + i * 0.035, { duration: 0.03, filterFreq, Q: 1.4, gain: 0.1 })
    );
    // ...then the fanfare.
    const fanfareStart = t + 0.18;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      tone(ctx, fanfareStart + i * 0.11, { freq, duration: 0.28, gain: 0.15 })
    );
  });
}

export function playWrongCall() {
  // A comedic "womp womp" - two low descending glides, trombone-style.
  play((ctx, t) => {
    [0, 0.34].forEach((offset) => {
      tone(ctx, t + offset, { freq: 300, freqEnd: 170, duration: 0.3, type: 'sawtooth', gain: 0.1 });
    });
  });
}

export function playMilestone() {
  // A bright ascending sparkle run - celebratory, but distinct from the
  // game-win fanfare so a mid-game milestone doesn't feel like the finale.
  play((ctx, t) => {
    [784, 988, 1175, 1568].forEach((freq, i) => tone(ctx, t + i * 0.07, { freq, duration: 0.16, gain: 0.12 }));
    noiseBurst(ctx, t + 0.3, { duration: 0.12, filterFreq: 4200, Q: 1, gain: 0.1 });
  });
}

export function playBust() {
  // A balloon pop followed by a low, deflating groan.
  play((ctx, t) => {
    noiseBurst(ctx, t, { duration: 0.05, filterFreq: 1200, Q: 0.7, gain: 0.2 });
    tone(ctx, t + 0.03, { freq: 260, freqEnd: 80, duration: 0.5, type: 'sawtooth', gain: 0.13 });
  });
}
