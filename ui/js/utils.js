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

export function showToast(el, text){
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 3000);
}

export function notifySystem(title, body){
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') new Notification(title, { body });
  else if (Notification.permission !== 'denied'){
    Notification.requestPermission().then(p=>{ if (p==='granted') new Notification(title, { body }); });
  }
}
