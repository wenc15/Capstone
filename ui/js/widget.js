import { FocusTimer } from './timer.js';
// ---- Mount widget UI ----
export function mountWidget(){
  const root = document.getElementById('widget');
  if (!root) return;

  root.innerHTML = `
    <div class="wg-time" id="wgTime">00:00</div>
    <button class="wg-btn" id="wgPlay" aria-label="Play/Pause">▶️</button>
  `;

  const elTime = root.querySelector('#wgTime');
  const btnPlay = root.querySelector('#wgPlay');

  const DEFAULT_MS = 25 * 60 * 1000;

  function format(ms){
    const total = Math.max(0, Math.floor(ms/1000));
    const m = Math.floor(total/60).toString().padStart(2,'0');
    const s = (total%60).toString().padStart(2,'0');
    return `${m}:${s}`;
  }

  function selectedDurationMs(){
    // Try to read minutes from an existing slider/input if present; fallback to 25
    const el = document.getElementById('timerSlider') || document.getElementById('timerMinutes');
    if (el && !isNaN(Number(el.value))) return Number(el.value) * 60 * 1000;
    return DEFAULT_MS;
  }

  btnPlay.addEventListener('click', () => {
    const st = FocusTimer.getState();
    if (!st.isRunning) {
      FocusTimer.start(selectedDurationMs());
    } else if (st.isPaused) {
      FocusTimer.resume();
    } else {
      FocusTimer.pause();
    }
  });

  FocusTimer.subscribe(st => {
    elTime.textContent = format(st.remainingMs);
    btnPlay.textContent = (!st.isRunning || st.isPaused) ? '▶️' : '⏸️';
  });
}