// storage.js
const KEY = 'focusSessions'; // { ts, minutes, note }

export function loadSessions(){
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

export function saveSession(minutes, note){
  const list = loadSessions();
  list.push({ ts: Date.now(), minutes, note: note?.trim() || '' });
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
