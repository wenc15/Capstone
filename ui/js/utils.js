// 2026/02/21 edited by Zhecheng Xu
// Changes:
//  - Hardened showToast() against rapid consecutive calls.
//  - Added per-element timer tracking to prevent old timeouts from hiding new toasts.
// =============================================================
// Purpose:
//  - Avoid toast flicker/disappear race conditions during high-frequency UI actions.

// utils.js
export function clampMins(v){ 
    if (Number.isNaN(v)) return 25; 
    return Math.min(60, Math.max(1, Math.floor(v))); 
}

export function fmt(ms){
  const total = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const toastTimers = new WeakMap();

export function showToast(el, text){
  if (!el) return;

  const prevTimer = toastTimers.get(el);
  if (prevTimer) {
    clearTimeout(prevTimer);
  }

  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');

  const timer = setTimeout(() => {
    el.classList.remove('show');
    toastTimers.delete(el);
  }, 3000);

  toastTimers.set(el, timer);
}

export function notifySystem(title, body){
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') new Notification(title, { body });
  else if (Notification.permission !== 'denied'){
    Notification.requestPermission().then(p=>{ if (p==='granted') new Notification(title, { body }); });
  }
}
