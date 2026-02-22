// Music auto-play for focus timer.
// - Follows focusStatusStore isRunning flag.
// - Random (shuffle bag) playback from built-in track list.

import { subscribeFocusStatus } from './focusStatusStore.js';

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDefaultTracks() {
  // Note: use URL() so spaces are encoded correctly.
  // This list is intentionally fixed (no fs access in renderer).
  return [
    new URL('../music/music1.mp3', import.meta.url).toString(),
    new URL('../music/music2.mp3', import.meta.url).toString(),
    new URL('../music/music3.mp3', import.meta.url).toString(),
    new URL('../music/music4.mp3', import.meta.url).toString(),
  ];
}

export function mountMusic(opts = {}) {
  const tracks = Array.isArray(opts.tracks) && opts.tracks.length
    ? opts.tracks.slice()
    : buildDefaultTracks();

  const volume = typeof opts.volume === 'number' ? opts.volume : 0.35;

  const audio = new Audio();
  audio.preload = 'auto';
  audio.loop = false;
  audio.volume = Math.max(0, Math.min(1, volume));

  let disposed = false;
  let running = false;
  let bag = [];
  let last = null;
  let needsUserGesture = false;
  const badTracks = new Set();

  function refillBag() {
    const candidates = tracks.filter(t => !badTracks.has(t));
    bag = shuffleInPlace(candidates.slice());
    if (last && bag.length > 1 && bag[0] === last) {
      // Avoid immediate repeat across bag boundary.
      [bag[0], bag[1]] = [bag[1], bag[0]];
    }
  }

  function pickNext() {
    if (!bag.length) refillBag();
    const next = bag.shift();
    last = next;
    return next;
  }

  async function playNow() {
    if (disposed) return;
    if (!tracks.length) return;

    if (!audio.src) audio.src = pickNext();

    try {
      await audio.play();
      needsUserGesture = false;
    } catch (e) {
      // Autoplay can be blocked until a user gesture.
      // We'll retry on the next user interaction.
      needsUserGesture = true;
      console.warn('[Music] play blocked:', e);
    }
  }

  function stopNow() {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
    // Drop the resource to stop buffering in background.
    audio.src = '';
  }

  function handleTrackError() {
    if (disposed) return;
    if (!running) return;
    if (audio.src) badTracks.add(audio.src);
    audio.src = '';

    // If everything is broken/missing, stop trying.
    if (badTracks.size >= tracks.length) {
      console.warn('[Music] No playable tracks found in ui/music.');
      stopNow();
      return;
    }

    audio.src = pickNext();
    void playNow();
  }

  audio.addEventListener('ended', () => {
    if (disposed) return;
    if (!running) return;
    audio.src = pickNext();
    void playNow();
  });

  audio.addEventListener('error', handleTrackError);

  function onUserGesture() {
    if (disposed) return;
    if (!running) return;
    if (!needsUserGesture) return;
    void playNow();
  }

  document.addEventListener('pointerdown', onUserGesture, { passive: true });
  document.addEventListener('keydown', onUserGesture);

  const unsub = subscribeFocusStatus((st) => {
    if (disposed) return;
    const nextRunning = !!st?.isRunning;

    // Edge transitions only.
    if (nextRunning === running) return;
    running = nextRunning;

    if (running) {
      // Start or resume.
      void playNow();
    } else {
      // Stop immediately.
      stopNow();
    }
  });

  return {
    setVolume(v) {
      audio.volume = Math.max(0, Math.min(1, Number(v)));
    },
    dispose() {
      disposed = true;
      try { unsub?.(); } catch {}
      try { document.removeEventListener('pointerdown', onUserGesture); } catch {}
      try { document.removeEventListener('keydown', onUserGesture); } catch {}
      try { audio.removeEventListener('error', handleTrackError); } catch {}
      stopNow();
    },
  };
}
